import type { Account, DocType, JournalEntry } from "@/types";
import {
  getReadClient,
  getTable,
  listPage,
  listTable,
  mapOne,
  maybeOne,
  normalizeEmbeds,
  type ListPageResult,
  type ReadFilter,
} from "@/lib/db/read";
import { GL_SELECTS } from "@/lib/db/selects";

const JOURNAL_ENTRY_ORDERS = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
] as const;

/** CoA list: hard-capped via listTable — move to server-side pagination when a tenant table exceeds 1000 rows. */
export async function listAccounts(): Promise<Account[]> {
  return listTable("accounts", GL_SELECTS.accounts, [
    { column: "code" },
    { column: "id" },
  ]);
}
export async function getAccount(id: string): Promise<Account | null> {
  return getTable("accounts", GL_SELECTS.accounts, id);
}

/** Full list for exports/links — capped at ALL_PAGES_HARD_CAP (1000). */
export async function listJournalEntries(): Promise<JournalEntry[]> {
  return listTable(
    "journal_entries",
    GL_SELECTS.journalEntries,
    [...JOURNAL_ENTRY_ORDERS],
  );
}

/** One server page for the journal entries list UI. */
export async function listJournalEntriesPage(params?: {
  limit?: number;
  offset?: number;
  /** Doc state filter (`draft` | `pending` | `posted`); omit for all. */
  state?: string | null;
}): Promise<ListPageResult<JournalEntry>> {
  const filters: ReadFilter[] = [];
  if (params?.state) {
    filters.push({ column: "state", value: params.state });
  }
  return listPage<JournalEntry>(
    "journal_entries",
    GL_SELECTS.journalEntries,
    [...JOURNAL_ENTRY_ORDERS],
    filters,
    { limit: params?.limit, offset: params?.offset },
  );
}

export async function getJournalEntry(id: string): Promise<JournalEntry | null> {
  return getTable("journal_entries", GL_SELECTS.journalEntries, id);
}

/** Find the journal entry produced by a given business document, if any. */
export async function findJournalEntryForSource(
  sourceType: DocType,
  sourceId: string,
): Promise<JournalEntry | null> {
  const client = await getReadClient();
  const result = await client.database
    .from("journal_entries")
    .select(GL_SELECTS.journalEntries)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return normalizeEmbeds(mapOne<JournalEntry>(maybeOne(result, "journal entry source")));
}
