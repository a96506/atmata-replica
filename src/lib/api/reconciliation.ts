import {
  getReadClient,
  getTable,
  listPage,
  listTable,
  mapOne,
  mapRows,
  maybeOne,
  requireData,
  type ListPageResult,
  type ReadFilter,
} from "@/lib/db/read";
import { RECON_SELECTS } from "@/lib/db/selects";

const BANK_STATEMENT_ORDERS = [
  { column: "created_at", ascending: false },
  { column: "id" },
] as const;

const OPEN_BANK_STATEMENT_STATUSES = [
  "imported",
  "reconciling",
  "failed",
] as const;

export type BankStatement = {
  id: string;
  number: string;
  bankAccountId: string;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SuggestedMatch = {
  matchId: string;
  lineId: string;
  bankRef: string;
  bankAmount: number;
  matchedEntryId: string | null;
  matchedEntryRef: string;
  matchedAmount: number;
  confidence: number;
  matchType: string;
  lineStatus: string;
};

type MatchEmbedRow = {
  id: string;
  confidence: number | null;
  status: string;
  proposedBy: string;
  sourceDocType: string | null;
  sourceDocId: string | null;
  journalEntryId: string | null;
  bankStatementLineId: string;
  bankStatementLines:
    | {
        id: string;
        reference: string | null;
        amount: number;
        description: string;
        lineNumber: number;
        bankStatementId: string;
        status: string;
      }
    | {
        id: string;
        reference: string | null;
        amount: number;
        description: string;
        lineNumber: number;
        bankStatementId: string;
        status: string;
      }[]
    | null;
  journalEntries:
    | { id: string; number: string }
    | { id: string; number: string }[]
    | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Hard-capped via listTable — prefer listBankStatementsPage for UI lists. */
export async function listBankStatements(): Promise<BankStatement[]> {
  return listTable(
    "bank_statements",
    RECON_SELECTS.bankStatements,
    [...BANK_STATEMENT_ORDERS],
  );
}

/** One server page for the bank reconciliation statements list. */
export async function listBankStatementsPage(params?: {
  limit?: number;
  offset?: number;
  /** When true, only imported|reconciling|failed (excludes reconciled). */
  openOnly?: boolean;
}): Promise<ListPageResult<BankStatement>> {
  const filters: ReadFilter[] = [];
  if (params?.openOnly) {
    filters.push({
      column: "status",
      in: [...OPEN_BANK_STATEMENT_STATUSES],
    });
  }
  return listPage<BankStatement>(
    "bank_statements",
    RECON_SELECTS.bankStatements,
    [...BANK_STATEMENT_ORDERS],
    filters,
    { limit: params?.limit, offset: params?.offset },
  );
}

export async function getBankStatement(
  id: string,
): Promise<BankStatement | null> {
  return getTable("bank_statements", RECON_SELECTS.bankStatements, id);
}

/**
 * Suggested reconciliation matches for a bank statement.
 * Joins reconciliation_matches (status=suggested) → bank_statement_lines.
 */
export async function listSuggestedMatches(
  statementId: string,
): Promise<SuggestedMatch[]> {
  const client = await getReadClient();

  const sessionResult = await client.database
    .from("reconciliation_sessions")
    .select("id")
    .eq("bank_statement_id", statementId)
    .maybeSingle();

  const session = mapOne<{ id: string }>(
    maybeOne(sessionResult, "reconciliation session"),
  );

  // No session yet → no suggestions (import/start creates the session).
  if (!session) return [];

  const result = await client.database
    .from("reconciliation_matches")
    .select(RECON_SELECTS.suggestedMatches)
    .eq("reconciliation_session_id", session.id)
    .eq("status", "suggested")
    .order("created_at", { ascending: false });

  const rows = mapRows<MatchEmbedRow>(
    requireData(result, "reconciliation matches"),
  );

  return rows.flatMap((row) => {
    const line = one(row.bankStatementLines);
    if (!line) return [];
    const je = one(row.journalEntries);
    return [
      {
        matchId: row.id,
        lineId: line.id,
        bankRef: line.reference || line.description || `#${line.lineNumber}`,
        bankAmount: Number(line.amount),
        matchedEntryId: je?.id ?? row.journalEntryId,
        matchedEntryRef: je?.number ?? "",
        matchedAmount: 0,
        confidence: Number(row.confidence ?? 0),
        matchType: row.proposedBy || "rule",
        lineStatus: line.status,
      },
    ];
  });
}
