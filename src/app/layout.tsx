import type { ReactNode } from "react";
import "./globals.css";

/** Root pass-through: `<html>` lives in `[locale]/layout.tsx` for correct `lang` / `dir`. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
