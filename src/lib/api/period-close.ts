import {
  getReadClient,
  mapOne,
  mapRows,
  maybeOne,
  requireData,
} from "@/lib/db/read";
import { PERIOD_CLOSE_SELECTS } from "@/lib/db/selects";

export type PeriodCloseRun = {
  id: string;
  fiscalPeriodId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PeriodCloseTask = {
  id: string;
  periodCloseRunId: string;
  code: string;
  name: string;
  sequence: number;
  status: string;
  detail: Record<string, unknown>;
  completedAt: string | null;
  createdAt: string;
};

export type PeriodCloseWorkspace = {
  run: PeriodCloseRun;
  tasks: PeriodCloseTask[];
  overallProgressPct: number;
};

function progressPct(tasks: PeriodCloseTask[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter(
    (t) => t.status === "completed" || t.status === "skipped",
  ).length;
  return Math.round((done / tasks.length) * 1000) / 10;
}

export async function getPeriodCloseForFiscalPeriod(
  fiscalPeriodId: string,
): Promise<PeriodCloseWorkspace | null> {
  const client = await getReadClient();

  const runResult = await client.database
    .from("period_close_runs")
    .select(PERIOD_CLOSE_SELECTS.runs)
    .eq("fiscal_period_id", fiscalPeriodId)
    .maybeSingle();

  const run = mapOne<PeriodCloseRun>(
    maybeOne(runResult, "period close run"),
  );
  if (!run) return null;

  const tasksResult = await client.database
    .from("period_close_tasks")
    .select(PERIOD_CLOSE_SELECTS.tasks)
    .eq("period_close_run_id", run.id)
    .order("sequence", { ascending: true });

  const tasks = mapRows<PeriodCloseTask>(
    requireData(tasksResult, "period close tasks"),
  );

  return {
    run,
    tasks,
    overallProgressPct: progressPct(tasks),
  };
}
