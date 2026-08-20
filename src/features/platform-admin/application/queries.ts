import "server-only";

import * as repo from "../infrastructure/insforge-repository";
import type {
  PlatformCompanyDetail,
  PlatformCompanyList,
  PlatformRowCounts,
  PlatformCompanyAudit,
} from "../domain/company";

export function listCompanies(input: {
  search: string;
  status: string;
  offset: number;
  limit: number;
}): Promise<PlatformCompanyList> {
  return repo.listCompanies(input);
}

export function getCompany(companyId: string): Promise<PlatformCompanyDetail> {
  return repo.getCompany(companyId);
}

export function getCompanyRowCounts(companyId: string): Promise<PlatformRowCounts> {
  return repo.getCompanyRowCounts(companyId);
}

export function getCompanyAudit(companyId: string): Promise<PlatformCompanyAudit[]> {
  return repo.getCompanyAudit(companyId);
}
