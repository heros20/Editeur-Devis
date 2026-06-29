import type { BusinessDocument, Client, DocumentType, LineItem } from "./types";

export const numberPrefixes: Record<DocumentType | "client", string> = {
  quote: "DEV",
  order: "BC",
  invoice: "FAC",
  creditNote: "AVO",
  returnInvoice: "RET",
  client: "CLI",
};

export const labels: Record<DocumentType, string> = {
  quote: "Devis",
  order: "Bon de commande",
  invoice: "Facture",
  creditNote: "Facture d'avoir",
  returnInvoice: "Facture de retour",
};

export const statusLabels: Record<string, string> = {
  draft: "En cours",
  partial: "Partiel",
  paid: "Payé",
};

export const statusTone: Record<string, string> = {
  draft: "neutral",
  partial: "warning",
  paid: "success",
};

export const paymentMethodLabels = {
  bank_transfer: "Virement",
  check: "Chèque",
  cash: "Espèces",
  card: "Carte",
  other: "Autre",
} as const;

export function makeId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function currency(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value || 0);
}

export function formatBusinessNumber(type: DocumentType | "client", count: number, year = new Date().getFullYear()) {
  return `${numberPrefixes[type]}-${year}-${String(count || 1).padStart(4, "0")}`;
}

export function lineTotalHt(line: LineItem) {
  const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
  return gross - gross * ((Number(line.discount) || 0) / 100);
}

export function lineMargin(line: LineItem) {
  const total = lineTotalHt(line);
  const purchasePrice = Number(line.purchasePrice) || 0;
  const purchaseTotal = purchasePrice > 0 ? (Number(line.quantity) || 0) * purchasePrice : 0;
  const amount = total - purchaseTotal;
  const rate = total > 0 ? (amount / total) * 100 : 0;
  return {
    amount,
    rate: purchasePrice > 0 ? rate : total > 0 ? 100 : 0,
  };
}

export function suggestedSalePriceHt(purchasePrice: number, corporateTaxRate = 0, targetNetMarginRate = 30) {
  const cost = Math.max(0, Number(purchasePrice) || 0);
  if (cost <= 0) return 0;
  const taxRate = Math.min(95, Math.max(0, Number(corporateTaxRate) || 0)) / 100;
  const targetRate = Math.min(95, Math.max(0, Number(targetNetMarginRate) || 0)) / 100;
  const preTaxMarginRate = taxRate >= 1 ? targetRate : targetRate / Math.max(0.01, 1 - taxRate);
  const denominator = Math.max(0.01, 1 - preTaxMarginRate);
  return cost / denominator;
}

export function totals(lines: LineItem[]) {
  const totalHt = lines.reduce((sum, line) => sum + lineTotalHt(line), 0);
  const vatGroups = lines.reduce<Record<string, number>>((groups, line) => {
    const vat = Number(line.vatRate) || 0;
    groups[vat] = (groups[vat] || 0) + lineTotalHt(line) * (vat / 100);
    return groups;
  }, {});
  const totalVat = Object.values(vatGroups).reduce((sum, value) => sum + value, 0);
  return {
    totalHt,
    vatGroups,
    totalVat,
    totalTtc: totalHt + totalVat,
  };
}

export function paymentSummary(doc: BusinessDocument, totalTtc = totals(doc.lines).totalTtc) {
  const depositPaidAmount = Math.max(0, Number(doc.depositPaidAmount) || 0);
  const payments = Array.isArray(doc.payments) ? doc.payments : [];
  const paymentAmount = payments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const paidAmount = depositPaidAmount + paymentAmount;
  const remainingAmount = Math.max(0, totalTtc - paidAmount);
  const status: "draft" | "partial" | "paid" = paidAmount <= 0.005 ? "draft" : remainingAmount <= 0.005 ? "paid" : "partial";

  return {
    depositPaidAmount,
    paymentAmount,
    paidAmount,
    remainingAmount,
    status,
  };
}

export function withPaymentStatus(doc: BusinessDocument): BusinessDocument {
  return { ...doc, status: paymentSummary(doc).status };
}

export function clientLabel(client?: Client) {
  if (!client) return "Client non renseigné";
  return client.name;
}

export function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function duplicateLines(lines: LineItem[]): LineItem[] {
  return lines.map((line) => ({ ...line, id: makeId("line") }));
}

export function nextStatus(doc: BusinessDocument) {
  return doc.status === "paid" ? "paid" : "paid";
}
