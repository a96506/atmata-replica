import "server-only";

import { KnownActionError } from "@/lib/actions/errors";
import {
  canTransitionCompanyStatus,
  normalizeEmail,
  normalizePersonName,
  type CompanyStatus,
  type ProvisioningResult,
} from "../domain/company";
import * as repo from "../infrastructure/insforge-repository";

export async function provisionCompany(input: {
  operationId: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
}): Promise<ProvisioningResult> {
  return repo.provisionCompany({
    operationId: input.operationId,
    name: normalizePersonName(input.name),
    ownerEmail: normalizeEmail(input.ownerEmail),
    ownerName: normalizePersonName(input.ownerName),
  });
}

export function resendOwnerInvitation(companyId: string) {
  return repo.resendOwnerInvitation(companyId);
}

export async function suspendCompany(input: {
  companyId: string;
  expectedRowVersion: number;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new KnownActionError("VALIDATION", {
      fieldErrors: { reason: ["required"] },
    });
  }
  return repo.setCompanyStatus({
    companyId: input.companyId,
    status: "suspended",
    expectedRowVersion: input.expectedRowVersion,
    reason,
  });
}

export async function reactivateCompany(input: {
  companyId: string;
  expectedRowVersion: number;
}) {
  return repo.setCompanyStatus({
    companyId: input.companyId,
    status: "active",
    expectedRowVersion: input.expectedRowVersion,
    reason: "",
  });
}

export function assertStatusTransition(from: CompanyStatus, to: CompanyStatus) {
  if (!canTransitionCompanyStatus(from, to)) {
    throw new KnownActionError("ILLEGAL_TRANSITION");
  }
}
