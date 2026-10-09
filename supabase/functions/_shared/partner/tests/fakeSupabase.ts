// A supabase-js stand-in for tests. Table queries and RPCs run as real SQL
// against PGlite (with the partner migration applied), so constraints,
// triggers, and the SQL functions behave exactly as in Postgres. Auth admin
// and Storage are small in-memory fakes. Only the builder surface the partner
// code uses is implemented; anything else throws loudly.

import type { PGlite } from "npm:@electric-sql/pglite@0.5.8";

type Row = Record<string, unknown>;
type Filter = { sql: (param: (value: unknown, column: string) => string) => string };
interface Result { data: unknown; error: { message: string; code?: string } | null; count?: number | null }

const ident = (name: string) => `"${name.replace(/"/g, "")}"`;

const normalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
};

class ColumnTypes {
  private cache = new Map<string, Map<string, string>>();
  constructor(private pg: PGlite) {}
  async of(table: string): Promise<Map<string, string>> {
    if (!this.cache.has(table)) {
      const { rows } = await this.pg.query<{ column_name: string; data_type: string }>(
        `select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1`,
        [table],
      );
      this.cache.set(table, new Map(rows.map((r) => [r.column_name, r.data_type])));
    }
    return this.cache.get(table)!;
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private columns = "*";
  private returning = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private payload: Row | Row[] | null = null;
  private countMode = false;
  private head = false;
  private onConflict: string | null = null;
  private ignoreDuplicates = false;

  constructor(private pg: PGlite, private types: ColumnTypes, private table: string) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.columns = columns;
    else {
      this.returning = true;
      this.columns = columns;
    }
    if (options?.count) this.countMode = true;
    if (options?.head) this.head = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = payload;
    this.onConflict = options?.onConflict ?? null;
    this.ignoreDuplicates = Boolean(options?.ignoreDuplicates);
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ sql: (p) => `${ident(column)} = ${p(value, column)}` });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ sql: (p) => `${ident(column)} <> ${p(value, column)}` });
    return this;
  }
  is(column: string, value: null) {
    if (value !== null) throw new Error("fake .is() only supports null");
    this.filters.push({ sql: () => `${ident(column)} is null` });
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error("fake .not() only supports is null");
    this.filters.push({ sql: () => `${ident(column)} is not null` });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ sql: (p) => `${ident(column)} = any(${p(values, `${column}[]`)})` });
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push({ sql: (p) => `${ident(column)} >= ${p(value, column)}` });
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push({ sql: (p) => `${ident(column)} > ${p(value, column)}` });
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push({ sql: (p) => `${ident(column)} < ${p(value, column)}` });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push(`${ident(column)} ${options?.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  then<A = Result, B = never>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private columnList() {
    if (this.columns.trim() === "*") return "*";
    return this.columns.split(",").map((c) => ident(c.trim())).join(", ");
  }

  private async execute(): Promise<Result> {
    const types = await this.types.of(this.table);
    const params: unknown[] = [];
    const param = (value: unknown, column: string) => {
      const isArrayFilter = column.endsWith("[]");
      const name = isArrayFilter ? column.slice(0, -2) : column;
      const type = types.get(name);
      if (type === "jsonb" && !isArrayFilter) {
        params.push(JSON.stringify(value));
        return `$${params.length}::jsonb`;
      }
      params.push(value);
      if (type === "USER-DEFINED") return `$${params.length}::text::public.subscription_status`;
      if (type === "ARRAY") return `$${params.length}::text[]`;
      return `$${params.length}`;
    };
    const where = this.filters.length ? ` where ${this.filters.map((f) => f.sql(param)).join(" and ")}` : "";
    const table = `public.${ident(this.table)}`;
    let sql: string;

    if (this.op === "select") {
      sql = this.countMode && this.head
        ? `select count(*)::int as count from ${table}${where}`
        : `select ${this.columnList()} from ${table}${where}`;
      if (this.orders.length && !this.head) sql += ` order by ${this.orders.join(", ")}`;
      if (this.limitN !== null && !this.head) sql += ` limit ${this.limitN}`;
    } else if (this.op === "insert" || this.op === "upsert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const keys = Object.keys(rows[0]);
      const values = rows.map((row) => `(${keys.map((k) => param(row[k], k)).join(", ")})`).join(", ");
      sql = `insert into ${table} (${keys.map(ident).join(", ")}) values ${values}`;
      if (this.op === "upsert") {
        const conflict = (this.onConflict ?? "id").split(",").map((c) => ident(c.trim())).join(", ");
        const updates = keys.filter((k) => !(this.onConflict ?? "id").split(",").map((c) => c.trim()).includes(k));
        sql += this.ignoreDuplicates || updates.length === 0
          ? ` on conflict (${conflict}) do nothing`
          : ` on conflict (${conflict}) do update set ${updates.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`;
      }
      if (this.returning) sql += ` returning ${this.columnList()}`;
    } else if (this.op === "update") {
      const sets = Object.entries(this.payload as Row).map(([k, v]) => `${ident(k)} = ${param(v, k)}`);
      sql = `update ${table} set ${sets.join(", ")}${where}`;
      if (this.returning) sql += ` returning ${this.columnList()}`;
    } else {
      sql = `delete from ${table}${where}`;
      if (this.returning) sql += ` returning ${this.columnList()}`;
    }

    try {
      const { rows } = await this.pg.query<Row>(sql, params);
      const data = normalize(rows) as Row[];
      if (this.countMode && this.head) return { data: null, error: null, count: (data[0]?.count as number) ?? 0 };
      if (this.mode === "single") {
        if (data.length !== 1) return { data: null, error: { message: `expected 1 row, got ${data.length}`, code: "PGRST116" } };
        return { data: data[0], error: null };
      }
      if (this.mode === "maybeSingle") {
        if (data.length > 1) return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
        return { data: data[0] ?? null, error: null };
      }
      return { data: this.op === "select" || this.returning ? data : null, error: null };
    } catch (error) {
      const e = error as { message: string; code?: string };
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }
}

export interface SentEmail {
  kind: "recovery";
  email: string;
}

export const createFakeSupabase = (pg: PGlite) => {
  const types = new ColumnTypes(pg);
  const storageObjects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const generatedLinks: { email: string; hashed_token: string }[] = [];
  const sentEmails: SentEmail[] = [];

  const rpc = async (fn: string, args: Record<string, unknown> = {}): Promise<Result> => {
    const keys = Object.keys(args);
    const sql = `select * from public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ")})`;
    try {
      const { rows, fields } = await pg.query<Row>(sql, keys.map((k) => args[k]));
      const data = normalize(rows) as Row[];
      // Scalar functions come back as one column named after the function.
      if (fields.length === 1 && fields[0].name === fn) return { data: data[0]?.[fn] ?? null, error: null };
      return { data, error: null };
    } catch (error) {
      const e = error as { message: string; code?: string };
      return { data: null, error: { message: e.message, code: e.code } };
    }
  };

  const userById = async (id: string) => {
    const { rows } = await pg.query<Row>(`select id, email, email_confirmed_at, last_sign_in_at, raw_user_meta_data from auth.users where id = $1`, [id]);
    return rows[0] ? normalize(rows[0]) as Row : null;
  };

  const client = {
    from: (table: string) => new Query(pg, types, table),
    rpc,
    auth: {
      admin: {
        createUser: async (attrs: { email: string; email_confirm?: boolean; user_metadata?: Row }) => {
          try {
            const { rows } = await pg.query<Row>(
              `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2::jsonb, $3) returning id`,
              [attrs.email, JSON.stringify(attrs.user_metadata ?? {}), attrs.email_confirm ? new Date() : null],
            );
            return { data: { user: await userById(rows[0].id as string) }, error: null };
          } catch (error) {
            const message = (error as Error).message;
            const duplicate = /duplicate key|auth_users_email_key/.test(message);
            return {
              data: { user: null },
              error: { message: duplicate ? "A user with this email address has already been registered" : message, status: duplicate ? 422 : 500, code: duplicate ? "email_exists" : "unexpected_failure" },
            };
          }
        },
        getUserById: async (id: string) => {
          const user = await userById(id);
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "User not found", status: 404 } };
        },
        updateUserById: async (id: string, attrs: { user_metadata?: Row }) => {
          if (attrs.user_metadata) {
            await pg.query(`update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || $2::jsonb where id = $1`, [id, JSON.stringify(attrs.user_metadata)]);
          }
          return { data: { user: await userById(id) }, error: null };
        },
        generateLink: async (params: { type: string; email: string }) => {
          const hashed_token = `hashed-${crypto.randomUUID()}`;
          generatedLinks.push({ email: params.email, hashed_token });
          return { data: { properties: { hashed_token }, user: null }, error: null };
        },
      },
      /** Test JWTs look like "user-jwt:<uuid>". */
      getUser: async (token: string) => {
        const id = token.startsWith("user-jwt:") ? token.slice("user-jwt:".length) : null;
        const user = id ? await userById(id) : null;
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid JWT", status: 401 } };
      },
      resetPasswordForEmail: async (email: string, _options?: { redirectTo?: string }) => {
        sentEmails.push({ kind: "recovery", email });
        return { data: {}, error: null };
      },
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, options?: { contentType?: string }) => {
          storageObjects.set(`${bucket}/${path}`, { bytes, contentType: options?.contentType ?? "application/octet-stream" });
          return { data: { path }, error: null };
        },
        download: async (path: string) => {
          const object = storageObjects.get(`${bucket}/${path}`);
          return object
            ? { data: new Blob([object.bytes as BlobPart], { type: object.contentType }), error: null }
            : { data: null, error: { message: "Object not found" } };
        },
        createSignedUrl: async (path: string, expiresIn: number, options?: { download?: string }) => {
          if (!storageObjects.has(`${bucket}/${path}`)) return { data: null, error: { message: "Object not found" } };
          const download = options?.download ? `&download=${encodeURIComponent(options.download)}` : "";
          return { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=${crypto.randomUUID()}&expires_in=${expiresIn}${download}` }, error: null };
        },
      }),
    },
  };

  return { client, storageObjects, generatedLinks, sentEmails };
};
