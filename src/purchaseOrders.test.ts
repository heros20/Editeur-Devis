import { describe, expect, it } from "vitest";
import { applyPurchaseOrderStockImpact, nextPurchaseOrderNumber } from "./purchaseOrders";
import type { CatalogItem, PurchaseOrder } from "./types";

const order = (partial: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: "order-1",
  number: "BCF-2026-0001",
  supplierId: "supplier-1",
  supplier: "Bois Pro",
  orderDate: "2026-06-22",
  expectedDate: "2026-07-01",
  status: "sent",
  notes: "",
  lines: [{ id: "line-1", catalogItemId: "item-1", description: "Panneau", unit: "u", quantity: 4, unitPrice: 20, vatRate: 20 }],
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
  ...partial,
  attachments: partial.attachments ?? [],
});
const item = (): CatalogItem => ({
  id: "item-1",
  name: "Panneau",
  unit: "u",
  price: 40,
  purchasePrice: 20,
  vatRate: 20,
  category: "Bois",
  trackStock: true,
  stockQuantity: 2,
  stockMinimum: 1,
  stockUnit: "u",
  supplier: "Bois Pro",
  supplierId: "supplier-1",
  location: "",
  stockMovements: [],
});

describe("purchase orders", () => {
  it("generates the next yearly internal number", () => {
    expect(nextPurchaseOrderNumber([order(), order({ id: "order-2", number: "BCF-2026-0004" })], new Date("2026-06-22"))).toBe(
      "BCF-2026-0005"
    );
  });
  it("receives and cancels tracked stock", () => {
    const received = applyPurchaseOrderStockImpact([item()], order(), "receive");
    expect(received[0].stockQuantity).toBe(6);
    expect(received[0].stockMovements[0].reason).toBe("Réception BCF-2026-0001");
    const canceled = applyPurchaseOrderStockImpact(received, order(), "cancel");
    expect(canceled[0].stockQuantity).toBe(2);
  });
});
