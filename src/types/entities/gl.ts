import type { Currency, DocState, DocType, ISO8601 } from "../common";

export type Account = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  parent?: string | null;
  active?: boolean;
};

export type JournalLine = {
  id: string;
  accountId: string;
  description: string;
  debit: number;
  credit: number;
};

export type JournalEntry = {
  id: string;
  rowVersion: number;
  number: string;
  companyId: string;
  date: ISO8601;
  currency: Currency;
  state: DocState;
  /** The business document that produced this JE. */
  sourceType: DocType | null;
  sourceId: string | null;
  description: string;
  lines: JournalLine[];
};
