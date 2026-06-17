import type { BusinessDocument, Client, DocumentType, LineItem } from "./types";

export const labels: Record<DocumentType, string> = {
  quote: "Devis",
  order: "Bon de commande",
  invoice: "Facture",
};

export const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoye",
  accepted: "Accepte",
  ordered: "Commande",
  invoiced: "Facture",
  paid: "Paye",
  canceled: "Annule",
};

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

export function lineTotalHt(line: LineItem) {
  const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
  return gross - gross * ((Number(line.discount) || 0) / 100);
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

export function clientLabel(client?: Client) {
  if (!client) return "Client non renseigne";
  return client.contact ? `${client.name} - ${client.contact}` : client.name;
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
  return lines.map((line) => ({ ...line, id: crypto.randomUUID() }));
}

export function nextStatus(doc: BusinessDocument) {
  if (doc.type === "quote") return doc.status === "draft" ? "sent" : "accepted";
  if (doc.type === "order") return "ordered";
  return doc.status === "paid" ? "paid" : "paid";
}
