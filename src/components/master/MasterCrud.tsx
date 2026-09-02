"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useActionToast } from "@/hooks/use-action-toast";
import { useConfirm } from "@/components/confirm-dialog";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable, type Column, type ServerPagination } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SearchSelect, type SearchSelectOption } from "@/components/form/SearchSelect";
import { MoneyInput } from "@/components/form/MoneyInput";
import type { ActionResult } from "@/lib/actions/result";
import type { OperationKey } from "@/lib/roles/capabilities";
import { useCanOperation } from "@/lib/roles/use-can-operation";

type Currency = "KWD" | "SAR" | "AED" | "USD";

export type MasterField =
  | {
      name: string;
      label: string;
      type: "text" | "textarea" | "number" | "date";
      required?: boolean;
      placeholder?: string;
      help?: string;
      min?: number;
    }
  | {
      name: string;
      label: string;
      type: "boolean";
      help?: string;
    }
  | {
      name: string;
      label: string;
      type: "select";
      required?: boolean;
      options: { value: string; label: string }[];
      help?: string;
    }
  | {
      name: string;
      label: string;
      type: "searchSelect";
      required?: boolean;
      options: SearchSelectOption[];
      help?: string;
    }
  | {
      name: string;
      label: string;
      type: "money";
      currency: Currency;
      min?: number;
      help?: string;
    }
  | {
      name: string;
      label: string;
      type: "tags";
      required?: boolean;
      help?: string;
      placeholder?: string;
    };

type FieldValue = string | number | boolean | string[] | null;

type Entity = { id: string } & Record<string, FieldValue>;

export type MasterCrudProps = {
  locale: string;
  /** Singular label, e.g. "Product". */
  entityLabel: string;
  title: string;
  subtitle?: string;
  /** DataTable columns for display (without an actions column — appended here). */
  columns: Column[];
  /** Display cells per row, positionally matched to `columns`. */
  tableRows: React.ReactNode[][];
  /** Underlying rows (must be same length/order as tableRows); carries `id` + form seed values. */
  entities: Entity[];
  /** Form field definitions; `name` is the camelCase key on `entities`. */
  fields: MasterField[];
  /** Server action for create. Receives `{ locale, ...values }`. */
  onCreate: (input: unknown) => Promise<ActionResult<unknown>>;
  /** Server action for update. Receives `{ locale, id, ...values }`. */
  onUpdate: (input: unknown) => Promise<ActionResult<unknown>>;
  /** Server action for delete. Receives `{ locale, id }`. */
  onDelete: (input: unknown) => Promise<ActionResult<unknown>>;
  /** Hide the create button (e.g. company profile is update-only). */
  hideCreate?: boolean;
  /** Hide the delete button per row. */
  hideDelete?: boolean;
  /** Hide the edit button per row. */
  hideEdit?: boolean;
  /** Optional banner shown above the form (e.g. data-issue note). */
  formBanner?: React.ReactNode;
  /** Extra actions rendered next to the New button (e.g. CSV export). */
  extraActions?: React.ReactNode;
  /** OPERATIONS key; when denied, hide create/edit/delete (read-only list). */
  writeOperation?: OperationKey;
  /** Server-driven paging; forwarded to DataTable when list pages pass URL page/limit/total. */
  serverPagination?: ServerPagination;
};

type FormState = Record<string, FieldValue>;

function emptyForm(fields: MasterField[]): FormState {
  const out: FormState = {};
  for (const f of fields) {
    out[f.name] = f.type === "boolean" ? false : f.type === "money" ? 0 : f.type === "tags" ? [] : "";
  }
  return out;
}

function seedForm(fields: MasterField[], entity: Entity): FormState {
  const out: FormState = {};
  for (const f of fields) {
    const v = entity[f.name];
    const empty: FieldValue =
      f.type === "boolean" ? false : f.type === "money" ? 0 : f.type === "tags" ? [] : "";
    out[f.name] = v === undefined ? empty : v;
  }
  return out;
}

export function MasterCrud({
  locale,
  entityLabel,
  title,
  subtitle,
  columns,
  tableRows,
  entities,
  fields,
  onCreate,
  onUpdate,
  onDelete,
  hideCreate,
  hideDelete,
  hideEdit,
  formBanner,
  extraActions,
  writeOperation,
  serverPagination,
}: MasterCrudProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const actionToast = useActionToast();
  const canWrite = useCanOperation(writeOperation);
  const showCreate = !hideCreate && canWrite;
  const showEdit = !hideEdit && canWrite;
  const showDelete = !hideDelete && canWrite;
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Entity | null>(null);
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(() => emptyForm(fields));
  // Controlled Dialog has no <DialogTrigger>, so Radix cannot restore focus.
  // Capture the opener and return focus on close (same pattern as confirm-dialog).
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const writeLocale = locale === "ar" ? "ar" : "en";

  const captureTrigger = () => {
    triggerRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
  };

  const openCreate = () => {
    captureTrigger();
    setEditing(null);
    setForm(emptyForm(fields));
    setOpen(true);
  };

  const openEdit = (entity: Entity) => {
    captureTrigger();
    setEditing(entity);
    setForm(seedForm(fields, entity));
    setOpen(true);
  };

  const setField = (name: string, value: FieldValue) =>
    setForm((prev) => ({ ...prev, [name]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const values: Record<string, unknown> = { locale: writeLocale };
      for (const f of fields) {
        const raw = form[f.name];
        if (f.type === "number") {
          values[f.name] = raw === "" || raw === null ? null : Number(raw);
        } else if (f.type === "money") {
          values[f.name] = typeof raw === "number" ? raw : Number(raw ?? 0);
        } else if (f.type === "boolean") {
          values[f.name] = Boolean(raw);
        } else if (f.type === "tags") {
          values[f.name] = Array.isArray(raw) ? raw : [];
        } else {
          values[f.name] = raw === "" ? null : raw;
        }
        if (editing && values[f.name] === null) {
          // omit unchanged-null on update so partial updates don't null out
          delete values[f.name];
        }
      }
      const result = editing
        ? await onUpdate({ id: editing.id, ...values })
        : await onCreate(values);
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      actionToast.success(editing ? `${entityLabel} updated` : `${entityLabel} created`);
      setOpen(false);
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const remove = async (entity: Entity) => {
    const ok = await confirm({
      title: `Delete ${entityLabel.toLowerCase()}?`,
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    setPending(true);
    try {
      const result = await onDelete({ locale: writeLocale, id: entity.id });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      actionToast.success(`${entityLabel} deleted`);
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const actionCol: Column = { key: "actions", label: "", sortable: false };
  const rowsWithActions = tableRows.map((cells, i) => {
    const entity = entities[i];
    const actions = (
      <div key="actions" className="flex items-center justify-end gap-1">
        {showEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${entityLabel}`}
            onClick={() => openEdit(entity)}
          >
            <Pencil />
          </Button>
        ) : null}
        {showDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${entityLabel}`}
            onClick={() => remove(entity)}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
    );
    return [...cells, actions];
  });

  return (
    <>
      <DocumentList
        title={title}
        subtitle={subtitle}
        primaryAction={
          <div className="flex flex-wrap items-center gap-2">
            {extraActions}
            {showCreate ? (
              <Button type="button" onClick={openCreate}>
                <Plus /> New {entityLabel}
              </Button>
            ) : null}
          </div>
        }
      >
        <DataTable
          columns={[...columns, actionCol]}
          rows={rowsWithActions}
          emptyMessage={`No ${entityLabel.toLowerCase()}s yet.`}
          serverPagination={serverPagination}
        />
      </DocumentList>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent
          className="sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = triggerRef.current;
            triggerRef.current = null;
            if (trigger && typeof trigger.focus === "function") {
              trigger.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${entityLabel}` : `New ${entityLabel}`}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the fields below." : "Fill in the fields below."}
            </DialogDescription>
          </DialogHeader>

          {formBanner}

          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <FieldRenderer
                  key={f.name}
                  field={f}
                  value={form[f.name]}
                  onChange={(v) => setField(f.name, v)}
                />
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : editing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: MasterField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  switch (field.type) {
    case "text":
    case "date":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <input
            type={field.type === "date" ? "date" : "text"}
            value={(value as string) ?? ""}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {field.help ? (
            <FieldDescription>{field.help}</FieldDescription>
          ) : null}
        </Field>
      );
    case "textarea":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <textarea
            value={(value as string) ?? ""}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
        </Field>
      );
    case "number":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={field.min}
            value={value === null || value === "" ? "" : String(value)}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
        </Field>
      );
    case "boolean":
      return (
        <Field orientation="horizontal">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              className="size-4"
            />
            {field.label}
          </label>
          {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
        </Field>
      );
    case "select":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">—</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
        </Field>
      );
    case "searchSelect":
      return (
        <SearchSelect
          label={field.label}
          required={field.required}
          value={(value as string) || null}
          onChange={onChange as (v: string) => void}
          options={field.options}
          hint={field.help}
        />
      );
    case "money":
      return (
        <MoneyInput
          label={field.label}
          currency={field.currency}
          min={field.min ?? 0}
          value={typeof value === "number" ? value : Number(value ?? 0)}
          onChange={onChange as (v: number) => void}
        />
      );
    case "tags": {
      const list = Array.isArray(value) ? value : [];
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required ? <span className="text-destructive"> *</span> : null}
          </FieldLabel>
          <input
            type="text"
            value={list.join(", ")}
            placeholder={field.placeholder ?? "comma,separated"}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            className="rounded-md border border-input bg-card px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
        </Field>
      );
    }
  }
}
