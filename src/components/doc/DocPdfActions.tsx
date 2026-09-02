"use client";

import * as React from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  generateDocPdf,
  generateFinancialPdf,
} from "@/lib/actions/pdf";
import type { FinancialPdfType, PdfDocType, PdfResult } from "@/types/functions";

type Props =
  | {
      docType: PdfDocType;
      docId: string;
      locale: string;
      previewOnly?: false;
    }
  | {
      docType: "financial";
      periodId: string;
      financialType: FinancialPdfType;
      locale: string;
      accountId?: string;
      from?: string;
      to?: string;
      previewOnly?: boolean;
    };

function decodePdf(base64: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

export function DocPdfActions(props: Props) {
  const t = useTranslations("documents.actions");
  const [pending, setPending] = React.useState<"preview" | "save" | null>(null);

  const run = async (mode: "preview" | "save") => {
    setPending(mode);
    try {
      const locale = props.locale === "ar" ? "ar" : "en";
      const result =
        props.docType === "financial"
          ? await generateFinancialPdf({
              type: props.financialType,
              periodId: props.periodId,
              accountId: props.accountId,
              from: props.from,
              to: props.to,
              locale,
              mode,
            })
          : await generateDocPdf({
              docType: props.docType,
              docId: props.docId,
              locale,
              mode,
            });
      if (!result.ok) {
        toast.error(t("failed"));
        return;
      }
      await openResult(result.data, mode);
    } catch {
      toast.error(t("failed"));
    } finally {
      setPending(null);
    }
  };

  const openResult = async (result: PdfResult, mode: "preview" | "save") => {
    if (result.mode === "save") {
      const res = await fetch(
        `/api/pdf?attachmentId=${encodeURIComponent(result.attachmentId)}`,
      );
      if (!res.ok) {
        toast.error(t("failed"));
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.rel = "noopener";
      anchor.download = result.key.split("/").pop() ?? "document.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(result.cached ? t("cached") : t("downloadReady"));
      return;
    }
    const url = URL.createObjectURL(decodePdf(result.base64));
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) toast.error(t("popupBlocked"));
    window.setTimeout(() => URL.revokeObjectURL(url), mode === "preview" ? 60_000 : 5_000);
  };

  const financial = props.docType === "financial";
  return (
    <ButtonGroup
      dir="auto"
      aria-label={t("groupLabel")}
      className="rtl:flex-row-reverse"
    >
      {!financial || props.previewOnly ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void run("preview")}
          disabled={pending !== null}
        >
          {pending === "preview" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Eye aria-hidden />
          )}
          {t("preview")}
        </Button>
      ) : null}
      {!props.previewOnly ? (
        <Button
          type="button"
          size="sm"
          onClick={() => void run("save")}
          disabled={pending !== null}
        >
          {pending === "save" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          {t("download")}
        </Button>
      ) : null}
    </ButtonGroup>
  );
}
