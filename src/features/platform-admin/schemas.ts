import { z } from "zod";

import { actionSchema } from "@/lib/actions/validation";

export const provisionCompanySchema = actionSchema({
  name: z.string().trim().min(1).max(160),
  ownerName: z.string().trim().min(1).max(160),
  ownerEmail: z.string().trim().email().max(320),
  locale: z.enum(["en", "ar"]).default("en"),
});

export const companyIdSchema = actionSchema({
  companyId: z.string().trim().min(1).max(160),
});

export const listCompaniesSchema = actionSchema({
  search: z.string().trim().max(160).optional().default(""),
  status: z.enum(["active", "suspended", ""]).optional().default(""),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export const setCompanyStatusSchema = actionSchema({
  companyId: z.string().trim().min(1).max(160),
  status: z.enum(["active", "suspended"]),
  expectedRowVersion: z.number().int().min(1),
  reason: z.string().trim().max(500).optional().default(""),
});

export const resendOwnerInvitationSchema = actionSchema({
  companyId: z.string().trim().min(1).max(160),
  locale: z.enum(["en", "ar"]).default("en"),
});
