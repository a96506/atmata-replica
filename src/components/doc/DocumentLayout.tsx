"use client";

import { useState, type ReactNode } from "react";
import { StatusTimeline, type StatusTimelineStep } from "./StatusTimeline";
import { StaleDataPill } from "../state/StaleDataPill";

export type DocumentTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export type DocumentLayoutProps = {
  number: string;
  title?: string;
  subtitle?: string;
  states: StatusTimelineStep[];
  currentState: string;
  totals?: ReactNode;
  actionBar?: ReactNode;
  tabs: DocumentTab[];
  rightRail?: ReactNode;
  /** ISO timestamp shown in the StaleDataPill — usually `new Date().toISOString()` from server render. */
  loadedAt?: string;
};

export function DocumentLayout({
  number,
  title,
  subtitle,
  states,
  currentState,
  totals,
  actionBar,
  tabs,
  rightRail,
  loadedAt,
}: DocumentLayoutProps) {
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id);
  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
                <span>{number}</span>
                {loadedAt ? <StaleDataPill updatedAt={loadedAt} /> : null}
              </div>
              {title ? (
                <h1 className="mt-0.5 text-xl font-semibold text-slate-900">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
              ) : null}
            </div>
            {totals ? (
              <div className="text-right text-sm text-slate-700">{totals}</div>
            ) : null}
          </div>
          <div className="mt-4">
            <StatusTimeline states={states} current={currentState} />
          </div>
          {actionBar ? <div className="mt-4">{actionBar}</div> : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div
            className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2"
            role="tablist"
          >
            {tabs.map((t) => {
              const isActive = active?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTabId(t.id)}
                  className={
                    "cursor-pointer px-3 py-2 text-sm whitespace-nowrap " +
                    (isActive
                      ? "border-b-2 border-orange-500 font-medium text-orange-700"
                      : "text-slate-600 hover:text-slate-900")
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="p-4 md:p-6">{active?.content}</div>
        </div>
      </div>

      {rightRail ? <div className="space-y-4">{rightRail}</div> : null}
    </div>
  );
}
