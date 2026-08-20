import "server-only";

import { KnownActionError } from "@/lib/actions/errors";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { parsePlatformRpcError } from "../domain/errors";
import type {
  PlatformCompanyDetail,
  PlatformCompanyList,
  PlatformRowCounts,
  ProvisioningInput,
  ProvisioningResult,
  CompanyStatus,
} from "../domain/company";

type RpcError = { message?: string; code?: string } | null;

function throwRpc(error: RpcError): never {
  const parsed = parsePlatformRpcError(error?.message);
  throw new KnownActionError(parsed.code, {
    currentRowVersion: parsed.currentRowVersion,
    retryable: parsed.code === "STALE_VERSION" || parsed.code === "UNAVAILABLE",
  });
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database.rpc(name, args);
  if (error) throwRpc(error);
  if (data == null) {
    throw new KnownActionError("INTERNAL");
  }
  return data as T;
}

export async function listCompanies(input: {
  search: string;
  status: string;
  offset: number;
  limit: number;
}): Promise<PlatformCompanyList> {
  return rpc<PlatformCompanyList>("platform_list_companies", {
    p_search: input.search || null,
    p_status: input.status || null,
    p_offset: input.offset,
    p_limit: input.limit,
  });
}

export async function getCompany(companyId: string): Promise<PlatformCompanyDetail> {
  return rpc<PlatformCompanyDetail>("platform_get_company", {
    p_company_id: companyId,
  });
}

export async function getCompanyRowCounts(companyId: string): Promise<PlatformRowCounts> {
  return rpc<PlatformRowCounts>("platform_company_row_counts", {
    p_company_id: companyId,
  });
}

export async function getCompanyAudit(companyId: string) {
  const company = await getCompany(companyId);
  return company.audit;
}

export async function provisionCompany(input: ProvisioningInput): Promise<ProvisioningResult> {
  return rpc<ProvisioningResult>("platform_provision_company", {
    p_operation_id: input.operationId,
    p_name: input.name,
    p_owner_email: input.ownerEmail,
    p_owner_name: input.ownerName,
  });
}

export async function resendOwnerInvitation(companyId: string): Promise<ProvisioningResult & { email?: string }> {
  return rpc<ProvisioningResult & { email?: string }>("platform_resend_owner_invitation", {
    p_company_id: companyId,
  });
}

export async function setCompanyStatus(input: {
  companyId: string;
  status: CompanyStatus;
  expectedRowVersion: number;
  reason: string;
}): Promise<{ id: string; status: CompanyStatus; rowVersion: number }> {
  return rpc("platform_set_company_status", {
    p_company_id: input.companyId,
    p_status: input.status,
    p_expected_row_version: input.expectedRowVersion,
    p_reason: input.reason || null,
  });
}

export async function isPlatformAdmin(): Promise<boolean> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
}

export async function allowlistViolations(): Promise<Array<{ tableName: string; issue: string }>> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database.rpc("company_table_allowlist_violations");
  if (error) throwRpc(error);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row: { table_name: string; issue: string }) => ({
    tableName: row.table_name,
    issue: row.issue,
  }));
}
