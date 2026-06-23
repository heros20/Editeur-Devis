import type { AppData, BusinessExpense, CatalogItem, PurchaseInvoice, StockMovement } from "./types";
import { makeId } from "./utils";

export function purchaseLinesTotals(lines: PurchaseInvoice["lines"]) {
  const totalHt = lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0), 0);
  const totalVat = lines.reduce((sum, line) => {
    const amount = Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0);
    return sum + amount * (Math.max(0, Number(line.vatRate) || 0) / 100);
  }, 0);
  return { totalHt, totalVat, totalTtc: totalHt + totalVat };
}

export function purchaseInvoiceTotals(invoice: PurchaseInvoice) {
  return purchaseLinesTotals(invoice.lines);
}

export function purchaseInvoiceExpense(invoice: PurchaseInvoice, expenseId = invoice.expenseId || makeId("expense")): BusinessExpense {
  const totals = purchaseInvoiceTotals(invoice);
  const effectiveVatRate = totals.totalHt > 0 ? (totals.totalVat / totals.totalHt) * 100 : 0;
  const now = invoice.postedAt || invoice.updatedAt || new Date().toISOString();
  return {
    id: expenseId,
    archivedAt: invoice.archivedAt,
    archivedYear: invoice.archivedYear,
    date: invoice.invoiceDate,
    supplier: invoice.supplier,
    supplierId: invoice.supplierId,
    reference: invoice.reference,
    category: "Achats fournisseurs",
    description:
      invoice.lines
        .map((line) => line.description)
        .filter(Boolean)
        .join(", ") || `Facture ${invoice.reference}`,
    amountHt: totals.totalHt,
    vatRate: effectiveVatRate,
    paymentMethod: invoice.paymentMethod,
    purchaseInvoiceId: invoice.id,
    createdAt: now,
    updatedAt: now,
  };
}

export function syncPurchaseInvoiceExpenses(data: AppData): AppData {
  const linkedExpenses = new Map<string, BusinessExpense>();
  data.expenses.forEach((expense) => {
    if (expense.purchaseInvoiceId) linkedExpenses.set(expense.purchaseInvoiceId, expense);
  });

  const syncedExpenses: BusinessExpense[] = [];
  const purchaseInvoices = data.purchaseInvoices.map((invoice) => {
    if (!invoice.supplierId || !invoice.reference.trim() || purchaseInvoiceTotals(invoice).totalHt <= 0) return invoice;
    const existing = linkedExpenses.get(invoice.id) || data.expenses.find((expense) => expense.id === invoice.expenseId);
    const expense = purchaseInvoiceExpense(invoice, existing?.id || invoice.expenseId);
    syncedExpenses.push({
      ...expense,
      createdAt: existing?.createdAt || expense.createdAt,
      updatedAt: invoice.updatedAt || existing?.updatedAt || expense.updatedAt,
    });
    return invoice.expenseId === expense.id ? invoice : { ...invoice, expenseId: expense.id };
  });

  const invoiceIds = new Set(purchaseInvoices.map((invoice) => invoice.id));
  const manualExpenses = data.expenses.filter((expense) => !expense.purchaseInvoiceId || !invoiceIds.has(expense.purchaseInvoiceId));

  return {
    ...data,
    purchaseInvoices,
    expenses: [...syncedExpenses, ...manualExpenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  };
}

export function applyPurchaseInvoiceStockImpact(catalog: CatalogItem[], invoice: PurchaseInvoice, mode: "post" | "cancel") {
  const multiplier = mode === "post" ? 1 : -1;
  const reason = `${mode === "post" ? "Achat" : "Annulation achat"} ${invoice.reference}`;

  return catalog.map((item) => {
    const quantity = invoice.lines
      .filter((line) => line.catalogItemId === item.id)
      .reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0);
    if (!item.trackStock || quantity <= 0) return item;

    const previousQuantity = Math.max(0, Number(item.stockQuantity) || 0);
    const nextQuantity = Math.max(0, previousQuantity + quantity * multiplier);
    const movement: StockMovement = {
      id: makeId("stock"),
      type: multiplier > 0 ? "entry" : "exit",
      quantity,
      previousQuantity,
      nextQuantity,
      reason,
      createdAt: new Date().toISOString(),
    };

    return {
      ...item,
      stockQuantity: nextQuantity,
      stockMovements: [movement, ...(item.stockMovements || [])].slice(0, 30),
    };
  });
}
