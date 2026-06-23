import { describe, expect, it } from "vitest";
import { annualPeriod, buildAccountingReport } from "./accounting";
import { buildAccountingXlsx, renderAccountingHtml } from "./accountingExport";
import { createDefaultAppData, normalizeData } from "./defaultData";
import type { BusinessDocument, BusinessExpense, CatalogItem, LineItem, PurchaseInvoice, Supplier } from "./types";
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

function purchaseInvoice(partial: Partial<PurchaseInvoice> = {}): PurchaseInvoice {
  return {
    id: "purchase-1",
    supplierId: "supplier-1",
    supplier: "Bois Pro",
    reference: "FA-100",
    invoiceDate: "2026-06-12",
    dueDate: "2026-07-12",
    status: "posted",
    paymentMethod: "bank_transfer",
    notes: "",
    lines: [
      { id: "purchase-line-1", description: "Panneaux", unit: "u", quantity: 3, unitPrice: 40, vatRate: 20 },
      { id: "purchase-line-2", description: "Transport", unit: "forfait", quantity: 1, unitPrice: 10, vatRate: 10 },
    ],
    attachments: [],
    expenseId: "expense-purchase-1",
    postedAt: "2026-06-12T00:00:00.000Z",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
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

  it("estimates corporate tax from taxable profit", () => {
    const data = createDefaultAppData();
    data.documents = [document({ lines: [line({ quantity: 1, unitPrice: 60000, purchasePrice: 0, vatRate: 20 })] })];
    data.expenses = [
      {
        id: "expense-1",
        date: "2026-06-15",
        supplier: "Fournisseur",
        reference: "F-42",
        category: "Honoraires",
        description: "Charge",
        amountHt: 10000,
        vatRate: 20,
        paymentMethod: "bank_transfer",
        createdAt: "2026-06-15",
        updatedAt: "2026-06-15",
      },
    ];

    const report = buildAccountingReport(data, annualPeriod(2026));

    expect(report.taxableProfit).toBe(50000);
    expect(report.estimatedCorporateTax).toBe(8250);
    expect(report.netProfitAfterTax).toBe(41750);
    expect(report.taxShareOfRevenue).toBe(13.75);
    expect(report.months[0].estimatedCorporateTax).toBe(8250);
  });

  it("does not estimate corporate tax on a loss", () => {
    const data = createDefaultAppData();
    data.expenses = [
      {
        id: "expense-1",
        date: "2026-06-15",
        supplier: "Fournisseur",
        reference: "F-42",
        category: "Loyer",
        description: "Charge",
        amountHt: 1000,
        vatRate: 20,
        paymentMethod: "bank_transfer",
        createdAt: "2026-06-15",
        updatedAt: "2026-06-15",
      },
    ];

    const report = buildAccountingReport(data, annualPeriod(2026));

    expect(report.netProfit).toBe(-1000);
    expect(report.taxableProfit).toBe(0);
    expect(report.estimatedCorporateTax).toBe(0);
    expect(report.netProfitAfterTax).toBe(-1000);
  });

  it("details posted supplier invoices line by line without double-counting the linked expense", () => {
    const data = createDefaultAppData();
    data.documents = [document()];
    data.purchaseInvoices = [purchaseInvoice()];
    data.expenses = [
      {
        id: "expense-purchase-1",
        date: "2026-06-12",
        supplier: "Bois Pro",
        supplierId: "supplier-1",
        reference: "FA-100",
        category: "Achats fournisseurs",
        description: "Panneaux, Transport",
        amountHt: 130,
        vatRate: 25 / 1.3,
        paymentMethod: "bank_transfer",
        purchaseInvoiceId: "purchase-1",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
    ];

    const report = buildAccountingReport(data, annualPeriod(2026));

    expect(report.expenseEntries).toHaveLength(2);
    expect(report.expenseDocumentCount).toBe(1);
    expect(report.operatingExpensesHt).toBe(130);
    expect(report.deductibleVat).toBe(25);
    expect(report.expenseEntries[0]).toMatchObject({
      source: "purchaseInvoice",
      purchaseInvoiceId: "purchase-1",
      description: "Panneaux",
      quantity: 3,
      amountHt: 120,
      vatAmount: 24,
    });
  });

  it("includes posted supplier invoices even when their accounting expense is missing", () => {
    const data = createDefaultAppData();
    data.purchaseInvoices = [purchaseInvoice({ expenseId: undefined })];

    const report = buildAccountingReport(data, annualPeriod(2026));

    expect(report.expenseEntries).toHaveLength(2);
    expect(report.operatingExpensesHt).toBe(130);
    expect(report.expenseDocumentCount).toBe(1);
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
