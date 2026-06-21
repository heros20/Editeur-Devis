import { describe, expect, it } from "vitest";
import { applyDocumentStockImpact, creditLines } from "./businessLogic";
import type { BusinessDocument, CatalogItem, LineItem } from "./types";

const line = (partial: Partial<LineItem>): LineItem => ({
  id: "line-1",
  description: "Article",
  details: "",
  unit: "u",
  quantity: 1,
  unitPrice: 100,
  purchasePrice: 30,
  vatRate: 20,
  discount: 0,
  ...partial,
});

const document = (partial: Partial<BusinessDocument>): BusinessDocument => ({
  id: "doc-1",
  type: "invoice",
  number: "FAC-2026-0001",
  status: "draft",
  clientId: "client-1",
  issueDate: "2026-06-21",
  dueDate: "2026-07-21",
  projectName: "",
  siteAddress: "",
  workStart: "",
  workDuration: "",
  depositRate: 30,
  notes: "",
  terms: "",
  lines: [],
  attachments: [],
  depositPaidAmount: 0,
  depositPaidAt: "",
  payments: [],
  paymentNotes: "",
  reminders: [],
  history: [],
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
  ...partial,
});

const catalogItem = (partial: Partial<CatalogItem>): CatalogItem => ({
  id: "cat-1",
  name: "Panneau",
  unit: "u",
  price: 100,
  purchasePrice: 40,
  vatRate: 20,
  category: "Matière",
  trackStock: true,
  stockQuantity: 10,
  stockMinimum: 2,
  stockUnit: "u",
  supplier: "",
  location: "",
  stockMovements: [],
  ...partial,
});

describe("document conversion helpers", () => {
  it("turns source lines into negative credit lines", () => {
    const result = creditLines([line({ id: "line-1", unitPrice: 125 })]);

    expect(result).toHaveLength(1);
    expect(result[0].id).not.toBe("line-1");
    expect(result[0].unitPrice).toBe(-125);
  });

  it("decrements tracked stock when an invoice is created", () => {
    const result = applyDocumentStockImpact(
      [catalogItem({ id: "cat-1", stockQuantity: 10 })],
      document({ lines: [line({ catalogItemId: "cat-1", quantity: 3 })] }),
      "invoice"
    );

    expect(result[0].stockQuantity).toBe(7);
    expect(result[0].stockMovements[0]).toMatchObject({
      type: "exit",
      quantity: 3,
      previousQuantity: 10,
      nextQuantity: 7,
      reason: "Facturation FAC-2026-0001",
    });
  });

  it("restores stock when an invoice is cancelled", () => {
    const result = applyDocumentStockImpact(
      [catalogItem({ id: "cat-1", stockQuantity: 7 })],
      document({ lines: [line({ catalogItemId: "cat-1", quantity: 3 })] }),
      "cancelInvoice"
    );

    expect(result[0].stockQuantity).toBe(10);
    expect(result[0].stockMovements[0].type).toBe("entry");
  });
});
