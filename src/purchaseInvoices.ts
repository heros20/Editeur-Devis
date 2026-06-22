import type { BusinessExpense, CatalogItem, PurchaseInvoice, StockMovement } from "./types";
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
  const now = new Date().toISOString();
  return {
    id: expenseId,
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
