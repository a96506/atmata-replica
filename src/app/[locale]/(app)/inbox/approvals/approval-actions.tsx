"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      <Button asChild size="sm" variant="ghost">
        <Link href={detailHref}>Open</Link>
      </Button>
      {canAct ? (
        <>
          <Button type="button" size="sm" onClick={onApprove}>
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onReject}
          >
            Reject
          </Button>
        </>
      ) : (
        <Badge
          variant="secondary"
          title="Switch to an approver role (admin / approver / accountant) to act."
        >
          view only
        </Badge>
      )}
    </div>
  );
}
