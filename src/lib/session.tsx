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
  companyId: string;
  companies: SessionCompany[];
};

const DEFAULT_SESSION: Session = {
  user: { id: "u_demo", name: "Demo User", email: "demo@atmata.local" },
  role: "admin",
  companyId: "co_1",
  companies: [
    { id: "co_1", name: "Atmata Trading Co." },
    { id: "co_2", name: "Gulf Foods" },
    { id: "co_3", name: "City Pharma" },
  ],
};

const STORAGE_KEY = "atmata.session";

type SessionContextValue = Session & {
  setRole: (role: Role) => void;
  setCompanyId: (id: string) => void;
  signOut: () => void;
};

const SessionContext = React.createContext<SessionContextValue | null>(null);

function readPersisted(): Session {
  if (typeof window === "undefined") return DEFAULT_SESSION;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SESSION;
    return { ...DEFAULT_SESSION, ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    return DEFAULT_SESSION;
  }
}

function writePersisted(s: Session) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage disabled — ignore
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session>(DEFAULT_SESSION);

  React.useEffect(() => {
    setSession(readPersisted());
  }, []);

  const update = React.useCallback((patch: Partial<Session>) => {
    setSession((prev) => {
      const next = { ...prev, ...patch };
      writePersisted(next);
      return next;
    });
  }, []);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      ...session,
      setRole: (role) => update({ role }),
      setCompanyId: (companyId) => update({ companyId }),
      signOut: () => {
        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
        }
        setSession(DEFAULT_SESSION);
      },
    }),
    [session, update],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within <SessionProvider>");
  }
  return ctx;
}

export const ROLE_OPTIONS: Role[] = [
  "admin",
  "approver",
  "ap_clerk",
  "ar_clerk",
  "warehouse",
  "buyer",
  "sales_rep",
  "accountant",
  "period_adjust",
  "audit_unlock",
  "viewer",
  "ai_agent",
];
