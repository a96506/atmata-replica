import { ACCOUNTS, JOURNAL_ENTRIES } from "@/mocks/seed/gl";
import type { Account, DocType, JournalEntry } from "@/types";

export async function listAccounts(): Promise<Account[]> {
  return ACCOUNTS;
}
export async function getAccount(id: string): Promise<Account | null> {
  return ACCOUNTS.find((a) => a.id === id) ?? null;
}

export async function listJournalEntries(): Promise<JournalEntry[]> {
  return JOURNAL_ENTRIES;
}
export async function getJournalEntry(id: string): Promise<JournalEntry | null> {
  return JOURNAL_ENTRIES.find((j) => j.id === id) ?? null;
}

/** Find the journal entry produced by a given business document, if any. */
export async function findJournalEntryForSource(
  sourceType: DocType,
  sourceId: string,
): Promise<JournalEntry | null> {
  return (
    JOURNAL_ENTRIES.find(
      (j) => j.sourceType === sourceType && j.sourceId === sourceId,
    ) ?? null
  );
}
