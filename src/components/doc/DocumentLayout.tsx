"use client";

import { useState, type ReactNode } from "react";
import { StatusTimeline, type StatusTimelineStep } from "./StatusTimeline";
import { StaleDataPill } from "../state/StaleDataPill";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

/**
 * Shell for every document detail screen.
 *
 * Consolidates what used to be several stacked surfaces (header panel, state
 * banner, timeline, action bar) into one summary card followed by a tabbed
 * content card, so the eye reaches the actual document sooner.
 */
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

  return (
    <div className="grid min-w-0 gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span>{number}</span>
                  {loadedAt ? <StaleDataPill updatedAt={loadedAt} /> : null}
                </div>
                {title ? (
                  <h1 className="text-xl font-semibold tracking-tight text-balance">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <p className="text-muted-foreground text-sm text-pretty">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              {totals ? (
                <div className="text-end text-sm tabular-nums">{totals}</div>
              ) : null}
            </div>

            <Separator />

            <StatusTimeline states={states} current={currentState} />

            {actionBar ? (
              <>
                <Separator />
                {actionBar}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden py-0">
          <Tabs value={activeTabId} onValueChange={setActiveTabId}>
            <div className="bg-muted/30 overflow-x-auto border-b px-3 py-2">
              <TabsList>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {tabs.map((tab) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="min-w-0 p-4 md:p-6"
              >
                {tab.content}
              </TabsContent>
            ))}
          </Tabs>
        </Card>
      </div>

      {rightRail ? (
        <div className="flex min-w-0 flex-col gap-4">{rightRail}</div>
      ) : null}
    </div>
  );
}
