"use client";

import * as React from "react";
import type { Role } from "@/types";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export type SessionCompany = {
  id: string;
  name: string;
};

export type Session = {
  user: SessionUser;
  role: Role;
  roles: Role[];
  companyId: string;
  company: SessionCompany;
};

type SessionContextValue = Session;

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session;
}) {
  return (
    <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within <SessionProvider>");
  }
  return ctx;
}
