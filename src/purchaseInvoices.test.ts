import { describe, expect, it } from "vitest";
import { applyPurchaseInvoiceStockImpact, purchaseInvoiceExpense, purchaseInvoiceTotals } from "./purchaseInvoices";
import type { CatalogItem, PurchaseInvoice } from "./types";

const invoice = (): PurchaseInvoice => ({
  id: "purchase-1",
  supplierId: "supplier-1",
  supplier: "Bois Pro",
  reference: "FA-100",
  invoiceDate: "2026-06-22",
  dueDate: "2026-07-22",
  status: "draft",
  paymentMethod: "bank_transfer",
  notes: "",
  lines: [
    { id: "line-1", catalogItemId: "catalog-1", description: "Panneau", unit: "u", quantity: 3, unitPrice: 40, vatRate: 20 },
    { id: "line-2", description: "Transport", unit: "forfait", quantity: 1, unitPrice: 10, vatRate: 10 },
  ],
  attachments: [],
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
});

const item = (): CatalogItem => ({
  id: "catalog-1",
  name: "Panneau",
  unit: "u",
  price: 80,
  purchasePrice: 40,
  vatRate: 20,
  category: "Matériaux",
  trackStock: true,
  stockQuantity: 2,
  stockMinimum: 1,
  stockUnit: "u",
  supplier: "Bois Pro",
  supplierId: "supplier-1",
  location: "",
  stockMovements: [],
});

describe("purchase invoices", () => {
  it("computes HT, VAT and TTC across multiple VAT rates", () => {
    expect(purchaseInvoiceTotals(invoice())).toEqual({ totalHt: 130, totalVat: 25, totalTtc: 155 });
  });

  it("creates the linked accounting expense with an effective VAT rate", () => {
    const expense = purchaseInvoiceExpense(invoice(), "expense-1");
    expect(expense).toMatchObject({
      id: "expense-1",
      purchaseInvoiceId: "purchase-1",
      supplierId: "supplier-1",
      amountHt: 130,
    });
    expect(expense.vatRate).toBeCloseTo(25 / 1.3, 10);
  });

  it("adds stock on posting and removes it on cancellation", () => {
    const posted = applyPurchaseInvoiceStockImpact([item()], invoice(), "post");
    expect(posted[0].stockQuantity).toBe(5);
    expect(posted[0].stockMovements[0]).toMatchObject({ type: "entry", quantity: 3, reason: "Achat FA-100" });

    const canceled = applyPurchaseInvoiceStockImpact(posted, invoice(), "cancel");
    expect(canceled[0].stockQuantity).toBe(2);
    expect(canceled[0].stockMovements[0]).toMatchObject({ type: "exit", reason: "Annulation achat FA-100" });
  });
});
