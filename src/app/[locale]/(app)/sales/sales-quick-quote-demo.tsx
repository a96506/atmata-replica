"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "@/components/toast";
import { formatKwd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Line = { sku: string; label: string; suggested_unit: number; qty: number };

export function SalesQuickQuoteDemo({
  products,
  localeKey,
}: {
  products: Line[];
  localeKey: "en" | "ar";
}) {
  const t = useTranslations("sales.quickQuote");
  const [customer, setCustomer] = useState("kuwait_retail");
  const [exceptional, setExceptional] = useState(false);
  const [lines, setLines] = useState(products);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.suggested_unit * l.qty, 0),
    [lines],
  );

  /** Maps the selected customer id back to its translated label for the toast. */
  const customerLabel = t(
    customer === "kuwait_retail"
      ? "custRetail"
      : customer === "gulf_foods"
        ? "custFoods"
        : "custPharma",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-quote-customer">{t("customer")}</Label>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger id="quick-quote-customer" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kuwait_retail">{t("custRetail")}</SelectItem>
                <SelectItem value="gulf_foods">{t("custFoods")}</SelectItem>
                <SelectItem value="city_pharma">{t("custPharma")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 pb-1">
            <Checkbox
              id="quick-quote-exceptional"
              checked={exceptional}
              onCheckedChange={(checked) => setExceptional(checked === true)}
            />
            <Label htmlFor="quick-quote-exceptional" className="font-normal">
              {t("exceptionalTag")}
            </Label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colSku")}</TableHead>
                <TableHead>{t("colProduct")}</TableHead>
                <TableHead className="text-right">{t("colSugPrice")}</TableHead>
                <TableHead className="text-right">{t("colQty")}</TableHead>
                <TableHead className="text-right">{t("colLine")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={line.sku}>
                  <TableCell className="font-mono text-xs">
                    {line.sku}
                  </TableCell>
                  <TableCell>{line.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKwd(line.suggested_unit, localeKey)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={1}
                      aria-label={`${t("colQty")} — ${line.label}`}
                      className="ms-auto w-16 text-right tabular-nums"
                      value={line.qty}
                      onChange={(e) => {
                        const q = Math.max(1, Number(e.target.value) || 1);
                        setLines((prev) =>
                          prev.map((l, j) => (j === i ? { ...l, qty: q } : l)),
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatKwd(line.suggested_unit * line.qty, localeKey)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium">{t("subtotal")}</span>{" "}
            <span className="tabular-nums">{formatKwd(subtotal, localeKey)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => toast.message(t("toastPdf"))}
            >
              {t("previewPdf")}
            </Button>
            <Button
              type="button"
              onClick={() =>
                toast.success(
                  t("toastSend", {
                    customer: customerLabel,
                    exceptional: exceptional ? t("yes") : t("no"),
                  }),
                )
              }
            >
              {t("sendQuote")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
