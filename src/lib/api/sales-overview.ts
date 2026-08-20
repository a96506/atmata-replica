import {
  listCustomers,
  listProducts,
} from "@/lib/api/master";
import {
  listOpportunities,
  listQuotes,
  listSalesOrders,
} from "@/lib/api/q2c";

export type SalesOverview = {
  summary: {
    pending_quotes: number;
    overdue_customers: number;
    credit_holds: number;
  };
  quotations: Array<{
    id: string;
    customer: string;
    total: number;
    status: string;
    valid_until: string;
  }>;
  orders: Array<{
    id: string;
    customer: string;
    total: number;
    state: string;
    delivery_eta: string | null;
    exceptional: boolean;
  }>;
  customers: Array<{
    name: string;
    credit_limit: number;
    exposure: number;
    score: string;
    payment_status: "current" | "overdue_14" | "on_hold";
  }>;
  pipeline: Array<{
    deal: string;
    stage: string;
    value: number;
    probability: number;
    days_idle: number;
    next_action: string;
  }>;
  quick_quote_products: Array<{
    sku: string;
    label: string;
    suggested_unit: number;
    qty: number;
  }>;
};

function mapQuoteStatus(state: string): string {
  if (state === "sent" || state === "draft") return state;
  if (state === "pending" || state === "confirmed") return "sent";
  return state;
}

function mapOrderState(state: string): string {
  if (state === "confirmed" || state === "draft") return state;
  if (state === "posted" || state === "locked") return "confirmed";
  if (state === "pending") return "draft";
  return state;
}

export async function getSalesOverview(): Promise<SalesOverview> {
  const [quotes, orders, customers, opportunities, products] =
    await Promise.all([
      listQuotes().catch(() => []),
      listSalesOrders().catch(() => []),
      listCustomers().catch(() => []),
      listOpportunities().catch(() => []),
      listProducts().catch(() => []),
    ]);

  const customerName = new Map(customers.map((c) => [c.id, c.name]));

  const quotations = quotes.map((q) => ({
    id: q.number,
    customer: customerName.get(q.customerId) ?? "—",
    total: q.total,
    status: mapQuoteStatus(q.state),
    valid_until: q.validUntil,
  }));

  const orderRows = orders.map((o) => ({
    id: o.number,
    customer: customerName.get(o.customerId) ?? "—",
    total: o.total,
    state: mapOrderState(o.state),
    delivery_eta: o.expectedDeliveryDate ?? null,
    exceptional: Boolean(o.exceptional),
  }));

  const customerRows = customers.map((c) => ({
    name: c.name,
    credit_limit: c.creditLimit,
    exposure: c.exposure,
    score: c.creditScore,
    payment_status: c.paymentStatus,
  }));

  const pipeline = opportunities
    .filter((o) => o.stage !== "won" && o.stage !== "lost")
    .map((o) => ({
      deal: o.title,
      stage: o.stage.charAt(0).toUpperCase() + o.stage.slice(1),
      value: o.value,
      probability: o.probability,
      days_idle: o.daysIdle,
      next_action: o.nextAction ?? "—",
    }));

  const quick_quote_products = products
    .filter((p) => p.sellable)
    .slice(0, 8)
    .map((p) => ({
      sku: p.sku,
      label: p.name,
      suggested_unit: p.defaultSalePrice,
      qty: 1,
    }));

  return {
    summary: {
      pending_quotes: quotes.filter(
        (q) => q.state === "draft" || q.state === "sent" || q.state === "pending",
      ).length,
      overdue_customers: customers.filter(
        (c) => c.paymentStatus === "overdue_14",
      ).length,
      credit_holds: customers.filter((c) => c.paymentStatus === "on_hold")
        .length,
    },
    quotations,
    orders: orderRows,
    customers: customerRows,
    pipeline,
    quick_quote_products,
  };
}
