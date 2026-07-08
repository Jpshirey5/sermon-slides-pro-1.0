// Shared AWS Bedrock helpers for edge functions: SigV4 request signing plus a
// forced-tool-call invoke wrapper. Used by parse-sermon-manuscript (Sonnet parse)
// and finalize-quick-build-parse (Haiku format-profile updates).

async function hmacSHA256(
  key: ArrayBuffer | string,
  data: string,
): Promise<ArrayBuffer> {
  const keyBuffer =
    typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bufToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildBedrockHeaders(
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  path: string,
  body: string,
): Promise<Record<string, string>> {
  const service = "bedrock";
  const now = new Date();
  const amzDate =
    now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const payloadHash = await sha256Hex(body);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";

  const canonicalRequest = [
    "POST",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const kDate = await hmacSHA256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  const kSigning = await hmacSHA256(kService, "aws4_request");
  const signature = bufToHex(await hmacSHA256(kSigning, stringToSign));

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    Authorization: authorizationHeader,
  };
}

export interface BedrockForcedToolParams {
  modelId: string;
  maxTokens: number;
  /** Anthropic tool definitions; the call is forced to `toolName`. */
  tools: unknown[];
  toolName: string;
  messages: unknown[];
  temperature?: number;
}

export interface BedrockForcedToolResult {
  /** The forced tool call's input object. */
  input: Record<string, unknown>;
  tokens_used: number;
}

/**
 * Invoke a Bedrock Anthropic model with a forced tool call and return the tool
 * input. Reads AWS credentials from edge function secrets. Throws on API errors,
 * truncation, or a missing tool_use block.
 */
export async function invokeBedrockForcedTool(
  params: BedrockForcedToolParams,
): Promise<BedrockForcedToolResult> {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
  const region = Deno.env.get("AWS_REGION") ?? "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is not configured");
  }

  const path = `/model/${encodeURIComponent(params.modelId)}/invoke`;
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com${path}`;

  const requestBody = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: params.maxTokens,
    temperature: params.temperature ?? 0,
    tools: params.tools,
    tool_choice: { type: "tool", name: params.toolName },
    messages: params.messages,
  });

  const headers = await buildBedrockHeaders(
    region,
    accessKeyId,
    secretAccessKey,
    path,
    requestBody,
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Bedrock API error ${response.status}: ${errBody.slice(0, 400)}`,
    );
  }

  const payload = await response.json();
  const inputTokens = payload?.usage?.input_tokens || 0;
  const outputTokens = payload?.usage?.output_tokens || 0;

  if (payload?.stop_reason === "max_tokens") {
    throw new Error(
      "Parser output truncated: the document produced more structured data than fits in one response",
    );
  }

  const toolBlock = Array.isArray(payload?.content)
    ? payload.content.find((block: { type?: string }) => block?.type === "tool_use")
    : null;
  if (!toolBlock || typeof toolBlock.input !== "object" || toolBlock.input === null) {
    throw new Error("Parser returned no tool call result");
  }

  return {
    input: toolBlock.input as Record<string, unknown>,
    tokens_used: inputTokens + outputTokens,
  };
}
