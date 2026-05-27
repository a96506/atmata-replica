"use client";

import Link from "next/link";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { useSession } from "@/lib/session";

const APPROVE_ROLES = ["approver", "admin", "accountant"];

export function ApprovalActions({
  docNumber,
  detailHref,
}: {
  docNumber: string;
  detailHref: string;
}) {
  const { role } = useSession();
  const confirm = useConfirm();
  const canAct = APPROVE_ROLES.includes(role);

  const onApprove = async () => {
    const ok = await confirm({
      title: `Approve ${docNumber}?`,
      description:
        "State moves to confirmed. The audit log will record your user + timestamp. Demo · this action will not persist.",
      confirmLabel: "Approve",
    });
    if (ok) toast.success(`Approved (demo) · ${docNumber}`);
  };

  const onReject = async () => {
    const ok = await confirm({
      title: `Reject ${docNumber}?`,
      description: "Returns the document to draft so the originator can rework.",
      confirmLabel: "Reject",
      tone: "destructive",
    });
    if (ok) toast.message(`Rejected (demo) · ${docNumber}`);
  };

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link
        href={detailHref}
        className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-900 hover:bg-slate-200"
      >
        Open
      </Link>
      {canAct ? (
        <>
          <button
            type="button"
            onClick={onApprove}
            className="cursor-pointer rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            className="cursor-pointer rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Reject
          </button>
        </>
      ) : (
        <span
          className="rounded bg-slate-200 px-2.5 py-1 text-xs text-slate-500"
          title="Switch to an approver role (admin / approver / accountant) to act."
        >
          view only
        </span>
      )}
    </div>
  );
}
