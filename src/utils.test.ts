import { describe, expect, it } from "vitest";
import type { BusinessDocument, LineItem } from "./types";
import { formatBusinessNumber, paymentSummary, totals, withPaymentStatus } from "./utils";

const line = (partial: Partial<LineItem>): LineItem => ({
  id: "line-1",
  description: "Pose",
  details: "",
  unit: "h",
  quantity: 1,
  unitPrice: 0,
  purchasePrice: 0,
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
  lines: [line({ quantity: 2, unitPrice: 100, vatRate: 20 })],
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

describe("business totals", () => {
  it("calculates HT, TVA and TTC with discounts", () => {
    const result = totals([
      line({ quantity: 2, unitPrice: 100, vatRate: 20, discount: 10 }),
      line({ quantity: 1, unitPrice: 50, vatRate: 10 }),
    ]);

    expect(result.totalHt).toBe(230);
    expect(result.vatGroups["20"]).toBe(36);
    expect(result.vatGroups["10"]).toBe(5);
    expect(result.totalTtc).toBe(271);
  });

  it("formats business numbers with type prefix and padded counter", () => {
    expect(formatBusinessNumber("invoice", 7, 2026)).toBe("FAC-2026-0007");
    expect(formatBusinessNumber("creditNote", 12, 2026)).toBe("AVO-2026-0012");
  });
});

describe("payments", () => {
  it("keeps invoices partial when only a deposit is paid", () => {
    const doc = document({
      lines: [line({ quantity: 1, unitPrice: 100, vatRate: 20 })],
      depositPaidAmount: 36,
    });

    const result = paymentSummary(doc);

    expect(result.depositPaidAmount).toBe(36);
    expect(result.paymentAmount).toBe(0);
    expect(result.paidAmount).toBe(36);
    expect(result.remainingAmount).toBe(84);
    expect(result.status).toBe("partial");
  });

  it("tracks partial payments and remaining amount", () => {
    const doc = document({
      depositPaidAmount: 60,
      payments: [
        { id: "payment-1", amount: 100, method: "bank_transfer", paidAt: "2026-06-22", note: "", createdAt: "2026-06-22T00:00:00.000Z" },
      ],
    });

    const result = paymentSummary(doc);

    expect(result.paidAmount).toBe(160);
    expect(result.remainingAmount).toBe(80);
    expect(result.status).toBe("partial");
  });

  it("marks invoices paid when all TTC is covered", () => {
    const doc = document({
      payments: [{ id: "payment-1", amount: 240, method: "check", paidAt: "2026-06-22", note: "", createdAt: "2026-06-22T00:00:00.000Z" }],
    });

    expect(withPaymentStatus(doc).status).toBe("paid");
  });
});
