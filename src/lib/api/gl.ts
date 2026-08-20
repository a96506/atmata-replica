import type { Account, DocType, JournalEntry } from "@/types";
import { getReadClient, getTable, listTable, mapOne, maybeOne, normalizeEmbeds } from "@/lib/db/read";
import { GL_SELECTS } from "@/lib/db/selects";

export async function listAccounts(): Promise<Account[]> {
  return listTable("accounts", GL_SELECTS.accounts, [
    { column: "code" },
    { column: "id" },
  ]);
}
export async function getAccount(id: string): Promise<Account | null> {
  return getTable("accounts", GL_SELECTS.accounts, id);
}

export async function listJournalEntries(): Promise<JournalEntry[]> {
  return listTable("journal_entries", GL_SELECTS.journalEntries, [
    { column: "date", ascending: false },
    { column: "number", ascending: false },
    { column: "id" },
  ]);
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
