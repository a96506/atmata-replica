export const COMPANY_STATUSES = ["active", "suspended"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export type PlatformCompanySummary = {
  id: string;
  name: string;
  status: CompanyStatus;
  plan: string;
  taxProfile: string;
  baseCurrency: string;
  vatNumber: string;
  rowVersion: number;
  createdAt: string;
};

export type PlatformCompanyMember = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  isOwner: boolean;
  active: boolean;
  createdAt: string;
};

export type PlatformCompanyInvitation = {
  id: string;
  email: string;
  roles: string[];
  status: string;
  isOwner: boolean;
  expiresAt: string;
  createdAt: string;
};

export type PlatformCompanyAudit = {
  id: string;
  fromState: string | null;
  toState: string;
  by: string | null;
  reason: string | null;
  at: string;
};

export type PlatformCompanyDetail = PlatformCompanySummary & {
  members: PlatformCompanyMember[];
  invitations: PlatformCompanyInvitation[];
  audit: PlatformCompanyAudit[];
};

export type PlatformCompanyList = {
  items: PlatformCompanySummary[];
  total: number;
  offset: number;
  limit: number;
};

export type PlatformRowCounts = {
  companyId: string;
  totalRows: number;
  counts: Record<string, number>;
  generatedAt: string;
};

export type ProvisioningInput = {
  operationId: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
};

export type ProvisioningResult = {
  companyId: string;
  invitationId: string;
  invitationToken?: string;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function canTransitionCompanyStatus(
  from: CompanyStatus,
  to: CompanyStatus,
): boolean {
  return from === to || (from === "active" && to === "suspended") || (from === "suspended" && to === "active");
}

export function isLegalCompanyStatus(value: string): value is CompanyStatus {
  return value === "active" || value === "suspended";
}
