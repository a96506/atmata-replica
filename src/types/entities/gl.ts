import type { Currency, DocState, DocType, ISO8601 } from "../common";

export type Account = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  parent?: string;
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
  number: string;
  companyId: string;
  date: ISO8601;
  currency: Currency;
  state: DocState;
  /** The business document that produced this JE. */
  sourceType: DocType;
  sourceId: string;
  description: string;
  lines: JournalLine[];
};
