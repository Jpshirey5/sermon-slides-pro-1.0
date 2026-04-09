import { supabase } from "@/integrations/supabase/client";

export interface Campus {
  id: string;
  accountId: string;
  name: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CampusFilterOption {
  value: string;
  label: string;
  type: "all" | "active" | "former";
  campusId?: string;
  formerCampusName?: string;
}

function mapCampusRow(row: {
  id: string;
  account_id: string;
  name: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}): Campus {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAccountCampuses(accountId: string): Promise<Campus[]> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id, account_id, name, is_primary, created_at, updated_at")
    .eq("account_id", accountId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  if (error || !data) {
    throw error || new Error("Failed to load campuses");
  }

  return data.map(mapCampusRow);
}

export async function getPrimaryCampus(accountId: string): Promise<Campus | null> {
  const campuses = await listAccountCampuses(accountId);
  return campuses.find((campus) => campus.isPrimary) || campuses[0] || null;
}

export async function createCampus(accountId: string, name: string): Promise<Campus> {
  const { data, error } = await supabase.rpc("create_campus", {
    _account_id: accountId,
    _name: name,
  });

  if (error || !data) {
    throw error || new Error("Failed to create campus");
  }

  return mapCampusRow(data);
}

export async function renameCampus(campusId: string, name: string): Promise<Campus> {
  const { data, error } = await supabase.rpc("rename_campus", {
    _campus_id: campusId,
    _name: name,
  });

  if (error || !data) {
    throw error || new Error("Failed to rename campus");
  }

  return mapCampusRow(data);
}

export async function setPrimaryCampus(campusId: string): Promise<Campus> {
  const { data, error } = await supabase.rpc("set_primary_campus", {
    _campus_id: campusId,
  });

  if (error || !data) {
    throw error || new Error("Failed to set primary campus");
  }

  return mapCampusRow(data);
}

export async function deleteCampus(campusId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_campus", {
    _campus_id: campusId,
  });

  if (error) {
    throw error;
  }
}

export async function getEnterpriseCampusFilterOptions(accountId: string): Promise<CampusFilterOption[]> {
  const [campuses, formerCampusResponse] = await Promise.all([
    listAccountCampuses(accountId),
    supabase
      .from("sermons")
      .select("former_campus_name")
      .eq("account_id", accountId)
      .not("former_campus_name", "is", null),
  ]);

  if (formerCampusResponse.error) {
    throw formerCampusResponse.error;
  }

  const formerCampusNames = Array.from(
    new Set(
      (formerCampusResponse.data || [])
        .map((row) => row.former_campus_name?.trim())
        .filter((name): name is string => Boolean(name))
    )
  ).sort((a, b) => a.localeCompare(b));

  return [
    { value: "all", label: "All Campuses", type: "all" },
    ...campuses.map((campus) => ({
      value: `active:${campus.id}`,
      label: campus.isPrimary ? `${campus.name} (Primary)` : campus.name,
      type: "active" as const,
      campusId: campus.id,
    })),
    ...formerCampusNames.map((name) => ({
      value: `former:${name}`,
      label: `Former: ${name}`,
      type: "former" as const,
      formerCampusName: name,
    })),
  ];
}
