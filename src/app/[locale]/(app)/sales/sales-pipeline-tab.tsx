"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { DataTable, type Column, type ServerPagination } from "@/components/data-table";
import { useConfirm } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/form/PermissionGate";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  createOpportunityAction,
  deleteOpportunityAction,
  updateOpportunityAction,
} from "@/lib/actions/q2c";
import { useCanOperation } from "@/lib/roles/use-can-operation";
import { formatKwd } from "@/lib/utils";
import type { Opportunity } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CustomerOption = { id: string; name: string };

const CREATE_STAGES = ["qualified", "proposal", "negotiation"] as const;
const EDIT_STAGES = [
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

type SalesPipelineTabProps = {
  locale: string;
  items: Opportunity[];
  emptyMessage: string;
  serverPagination?: ServerPagination;
  createRationale: string;
  customers: CustomerOption[];
  columnLabels: {
    deal: string;
    stage: string;
    value: string;
    probability: string;
    daysIdle: string;
    nextAction: string;
    actions: string;
  };
  labels: {
    formTitle: string;
    formHint: string;
    name: string;
    customer: string;
    stage: string;
    amount: string;
    submit: string;
    success: string;
    updateSuccess: string;
    deleteSuccess: string;
    deleteConfirmTitle: string;
    deleteConfirmDescription: string;
    deleteConfirmLabel: string;
    selectCustomer: string;
    stages: Record<string, string>;
  };
};

export function SalesPipelineTab({
  locale,
  items,
  emptyMessage,
  serverPagination,
  createRationale,
  customers,
  columnLabels,
  labels,
}: SalesPipelineTabProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const canUpdate = useCanOperation("update_opportunity");
  const canDelete = useCanOperation("delete_opportunity");
  const writeLocale = locale === "ar" ? "ar" : "en";
  const lk = writeLocale;

  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [stage, setStage] =
    useState<(typeof CREATE_STAGES)[number]>("qualified");
  const [value, setValue] = useState("");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [rowPending, setRowPending] = useState<string | null>(null);

  const columns: Column[] = useMemo(() => {
    const base: Column[] = [
      { key: "deal", label: columnLabels.deal },
      { key: "stage", label: columnLabels.stage },
      {
        key: "value",
        label: columnLabels.value,
        className: "text-right tabular-nums",
      },
      {
        key: "prob",
        label: columnLabels.probability,
        className: "text-right",
        sortable: false,
      },
      {
        key: "idle",
        label: columnLabels.daysIdle,
        className: "text-right tabular-nums",
        sortable: false,
      },
      { key: "next", label: columnLabels.nextAction, sortable: false },
    ];
    if (canUpdate || canDelete) {
      base.push({
        key: "actions",
        label: columnLabels.actions,
        sortable: false,
      });
    }
    return base;
  }, [canDelete, canUpdate, columnLabels]);

  const saveField = useCallback(
    async (
      opp: Opportunity,
      patch: { stage?: Opportunity["stage"]; value?: number },
    ) => {
      setRowPending(opp.id);
      try {
        const result = await updateOpportunityAction({
          locale: writeLocale,
          id: opp.id,
          ...patch,
        });
        if (!result.ok) {
          actionToast.error(result.error);
          return;
        }
        actionToast.success(labels.updateSuccess);
        router.refresh();
      } catch {
        actionToast.network();
      } finally {
        setRowPending(null);
      }
    },
    [actionToast, labels.updateSuccess, router, writeLocale],
  );

  const onDelete = useCallback(
    async (opp: Opportunity) => {
      const ok = await confirm({
        title: labels.deleteConfirmTitle,
        description: labels.deleteConfirmDescription,
        confirmLabel: labels.deleteConfirmLabel,
        tone: "destructive",
      });
      if (!ok) return;

      setRowPending(opp.id);
      try {
        const result = await deleteOpportunityAction({
          locale: writeLocale,
          id: opp.id,
        });
        if (!result.ok) {
          actionToast.error(result.error);
          return;
        }
        actionToast.success(labels.deleteSuccess);
        router.refresh();
      } catch {
        actionToast.network();
      } finally {
        setRowPending(null);
      }
    },
    [
      actionToast,
      confirm,
      labels.deleteConfirmDescription,
      labels.deleteConfirmLabel,
      labels.deleteConfirmTitle,
      labels.deleteSuccess,
      router,
      writeLocale,
    ],
  );

  const rows = useMemo(
    () =>
      items.map((p) => {
        const busy = rowPending === p.id;
        const draftValue = draftValues[p.id] ?? String(p.value);

        const stageCell = canUpdate ? (
          <Select
            value={p.stage}
            disabled={busy}
            onValueChange={(v) =>
              void saveField(p, { stage: v as Opportunity["stage"] })
            }
          >
            <SelectTrigger className="h-8 w-full min-w-[8rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EDIT_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {labels.stages[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          labels.stages[p.stage] ??
            p.stage.charAt(0).toUpperCase() + p.stage.slice(1)
        );

        const valueCell = canUpdate ? (
          <Input
            type="number"
            min={0}
            step="0.001"
            className="h-8 text-right tabular-nums"
            disabled={busy}
            value={draftValue}
            onChange={(e) =>
              setDraftValues((prev) => ({ ...prev, [p.id]: e.target.value }))
            }
            onBlur={() => {
              const next = Number(draftValue);
              if (Number.isNaN(next) || next < 0 || next === p.value) return;
              void saveField(p, { value: next });
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          formatKwd(p.value, lk)
        );

        const row: React.ReactNode[] = [
          p.title,
          stageCell,
          valueCell,
          `${Math.round(p.probability * 100)}%`,
          p.daysIdle,
          p.nextAction ?? "—",
        ];

        if (canUpdate || canDelete) {
          row.push(
            canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                aria-label={labels.deleteConfirmLabel}
                onClick={() => void onDelete(p)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            ) : null,
          );
        }

        return row;
      }),
    [
      canDelete,
      canUpdate,
      draftValues,
      items,
      labels,
      lk,
      onDelete,
      rowPending,
      saveField,
    ],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !customerId) return;
    setPending(true);
    try {
      const result = await createOpportunityAction({
        locale: writeLocale,
        title: title.trim(),
        customerId,
        stage,
        value: Number(value) || 0,
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      actionToast.success(labels.success);
      setTitle("");
      setCustomerId("");
      setStage("qualified");
      setValue("");
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PermissionGate operation="create_opportunity" rationale={createRationale}>
        <Card>
          <CardHeader>
            <CardTitle>{labels.formTitle}</CardTitle>
            <CardDescription>{labels.formHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onSubmit}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
            >
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="opp-title">{labels.name}</Label>
                <Input
                  id="opp-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="opp-customer">{labels.customer}</Label>
                <Select value={customerId} onValueChange={setCustomerId} required>
                  <SelectTrigger id="opp-customer" className="w-full">
                    <SelectValue placeholder={labels.selectCustomer} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="opp-stage">{labels.stage}</Label>
                <Select
                  value={stage}
                  onValueChange={(v) =>
                    setStage(v as (typeof CREATE_STAGES)[number])
                  }
                >
                  <SelectTrigger id="opp-stage" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATE_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {labels.stages[s] ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="opp-value">{labels.amount}</Label>
                <Input
                  id="opp-value"
                  type="number"
                  min={0}
                  step="0.001"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={pending || !title.trim() || !customerId}
                className="lg:col-span-5 lg:w-fit"
              >
                {labels.submit}
              </Button>
            </form>
          </CardContent>
        </Card>
      </PermissionGate>
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage={emptyMessage}
        serverPagination={serverPagination}
      />
    </div>
  );
}
