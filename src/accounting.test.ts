import { describe, expect, it } from "vitest";
import { annualPeriod, buildAccountingReport } from "./accounting";
import { buildAccountingXlsx, renderAccountingHtml } from "./accountingExport";
import { createDefaultAppData, normalizeData } from "./defaultData";
import type { BusinessDocument, BusinessExpense, CatalogItem, LineItem, Supplier } from "./types";
import { unzipSync } from "fflate";

function line(partial: Partial<LineItem> = {}): LineItem {
  return {
    id: "line-1",
    description: "Meuble",
    details: "",
    unit: "u",
    quantity: 2,
    unitPrice: 100,
    purchasePrice: 40,
    vatRate: 20,
    discount: 0,
    ...partial,
  };
}

function document(partial: Partial<BusinessDocument> = {}): BusinessDocument {
  return {
    id: "doc-1",
    type: "invoice",
    number: "FAC-2026-0001",
    status: "paid",
    clientId: "client-1",
    issueDate: "2026-06-10",
    dueDate: "2026-07-10",
    projectName: "Cuisine",
    siteAddress: "",
    workStart: "",
    workDuration: "",
    depositRate: 0,
    notes: "",
    terms: "",
    lines: [line()],
    attachments: [],
    depositPaidAmount: 0,
    depositPaidAt: "",
    payments: [],
    paymentNotes: "",
    reminders: [],
    history: [],
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    ...partial,
  };
}

describe("accounting report", () => {
  it("normalizes suppliers and keeps the expense relationship", () => {
    const data = normalizeData({
      suppliers: [{ id: "supplier-1", name: "Bois Pro" }] as Supplier[],
      expenses: [
        { id: "expense-1", supplierId: "supplier-1", supplier: "Bois Pro", description: "Panneaux", amountHt: 100 },
      ] as BusinessExpense[],
      catalog: [{ id: "catalog-1", name: "Panneau", supplier: "bois pro" }] as CatalogItem[],
    });

    expect(data.suppliers[0]).toMatchObject({ id: "supplier-1", name: "Bois Pro" });
    expect(data.expenses[0]).toMatchObject({ supplierId: "supplier-1", supplier: "Bois Pro", amountHt: 100 });
    expect(data.catalog[0]).toMatchObject({ supplierId: "supplier-1", supplier: "Bois Pro" });
  });

  it("counts invoices and reverses sales and purchases for credit notes", () => {
    const data = createDefaultAppData();
    data.clients = [
      {
        id: "client-1",
        number: "CLI-1",
        type: "professionnel",
        name: "Client test",
        contact: "",
        email: "",
        phone: "",
        address: "",
        postalCode: "",
        city: "",
        notes: "",
        createdAt: "2026-01-01",
      },
    ];
    data.documents = [
      document(),
      document({
        id: "doc-2",
        type: "creditNote",
        number: "AVO-2026-0001",
        issueDate: "2026-07-01",
        lines: [line({ id: "line-2", unitPrice: -50, quantity: 1 })],
      }),
      document({ id: "quote", type: "quote", number: "DEV-2026-0001", lines: [line({ unitPrice: 999 })] }),
    ];

    const report = buildAccountingReport(data, annualPeriod(2026));

    expect(report.documentCount).toBe(2);
    expect(report.revenueHt).toBe(150);
    expect(report.purchasesHt).toBe(40);
    expect(report.marginAmount).toBe(110);
    expect(report.averageMarginRate).toBeCloseTo(73.333, 2);
    expect(report.months).toHaveLength(2);
  });

  it("filters inclusively by date", () => {
    const data = createDefaultAppData();
    data.documents = [document({ issueDate: "2026-06-10" }), document({ id: "outside", issueDate: "2026-06-11" })];
    const report = buildAccountingReport(data, { startDate: "2026-06-10", endDate: "2026-06-10" });
    expect(report.documentCount).toBe(1);
  });

  it("deducts recorded expenses and deductible VAT from the period", () => {
    const data = createDefaultAppData();
    data.documents = [document()];
    data.expenses = [
      {
        id: "expense-1",
        date: "2026-06-15",
        supplier: "Fournisseur",
        reference: "F-42",
        category: "Outillage",
        description: "Lame",
        amountHt: 50,
        vatRate: 20,
        paymentMethod: "card",
        createdAt: "2026-06-15",
        updatedAt: "2026-06-15",
      },
    ];

    const report = buildAccountingReport(data, annualPeriod(2026));

    expect(report.operatingExpensesHt).toBe(50);
    expect(report.netProfit).toBe(70);
    expect(report.deductibleVat).toBe(10);
    expect(report.vatBalance).toBe(30);
    expect(report.months[0].netProfit).toBe(70);
  });

  it("generates a valid xlsx package and a printable report", () => {
    const data = createDefaultAppData();
    data.documents = [document()];
    const report = buildAccountingReport(data, annualPeriod(2026));
    const workbook = unzipSync(buildAccountingXlsx(report, data.company));

    expect(Object.keys(workbook)).toContain("xl/workbook.xml");
    expect(Object.keys(workbook)).toContain("xl/worksheets/sheet2.xml");
    expect(Object.keys(workbook)).toContain("xl/worksheets/sheet3.xml");
    expect(renderAccountingHtml(report, data.company)).toContain("Livre de comptes");
    expect(renderAccountingHtml(report, data.company)).toContain("FAC-2026-0001");
  });
});
