import type { AppData, BusinessDocument, BusinessExpense, Client, DocumentType, LineItem } from "./types";
import { lineTotalHt, totals } from "./utils";

export type AccountingDocumentType = Extract<DocumentType, "invoice" | "creditNote" | "returnInvoice">;

export interface AccountingPeriod {
  startDate: string;
  endDate: string;
}

export interface AccountingEntry {
  id: string;
  documentId: string;
  date: string;
  documentNumber: string;
  documentType: AccountingDocumentType;
  client: string;
  project: string;
  description: string;
  quantity: number;
  unit: string;
  saleHt: number;
  purchaseHt: number;
  marginAmount: number;
  marginRate: number;
  vatAmount: number;
  totalTtc: number;
}

export interface AccountingMonth {
  key: string;
  label: string;
  revenueHt: number;
  purchasesHt: number;
  operatingExpensesHt: number;
  marginAmount: number;
  marginRate: number;
  vatAmount: number;
  totalTtc: number;
  netProfit: number;
}

export interface AccountingReport {
  period: AccountingPeriod;
  entries: AccountingEntry[];
  expenses: BusinessExpense[];
  months: AccountingMonth[];
  documentCount: number;
  revenueHt: number;
  purchasesHt: number;
  operatingExpensesHt: number;
  marginAmount: number;
  averageMarginRate: number;
  netProfit: number;
  vatAmount: number;
  deductibleVat: number;
  vatBalance: number;
  totalTtc: number;
}

const accountingTypes = new Set<AccountingDocumentType>(["invoice", "creditNote", "returnInvoice"]);

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clientName(client: Client | undefined) {
  return client?.name?.trim() || "Client non renseigné";
}

function purchaseCost(line: LineItem, saleHt: number) {
  const absoluteCost = Math.abs((Number(line.quantity) || 0) * (Number(line.purchasePrice) || 0));
  return saleHt < 0 ? -absoluteCost : absoluteCost;
}

function entryFromLine(doc: BusinessDocument, client: Client | undefined, line: LineItem): AccountingEntry {
  const saleHt = lineTotalHt(line);
  const purchaseHt = purchaseCost(line, saleHt);
  const marginAmount = saleHt - purchaseHt;
  const vatAmount = saleHt * ((Number(line.vatRate) || 0) / 100);
  return {
    id: `${doc.id}:${line.id}`,
    documentId: doc.id,
    date: doc.issueDate,
    documentNumber: doc.number,
    documentType: doc.type as AccountingDocumentType,
    client: clientName(client),
    project: doc.projectName || "",
    description: line.description || "Ligne sans désignation",
    quantity: Number(line.quantity) || 0,
    unit: line.unit || "",
    saleHt: round(saleHt),
    purchaseHt: round(purchaseHt),
    marginAmount: round(marginAmount),
    marginRate: saleHt ? (marginAmount / Math.abs(saleHt)) * 100 : 0,
    vatAmount: round(vatAmount),
    totalTtc: round(saleHt + vatAmount),
  };
}

export function annualPeriod(year: number): AccountingPeriod {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

export function currentMonthPeriod(now = new Date()): AccountingPeriod {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return { startDate: `${year}-${month}-01`, endDate: `${year}-${month}-${String(lastDay).padStart(2, "0")}` };
}

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
}

export function buildAccountingReport(data: AppData, period: AccountingPeriod): AccountingReport {
  const documents = data.documents.filter(
    (doc) => accountingTypes.has(doc.type as AccountingDocumentType) && doc.issueDate >= period.startDate && doc.issueDate <= period.endDate
  );
  const entries = documents
    .flatMap((doc) => {
      const client = data.clients.find((item) => item.id === doc.clientId);
      return doc.lines.map((line) => entryFromLine(doc, client, line));
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.documentNumber.localeCompare(b.documentNumber));
  const expenses = [...data.expenses]
    .filter((expense) => expense.date >= period.startDate && expense.date <= period.endDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.supplier.localeCompare(b.supplier, "fr"));

  const sums = entries.reduce(
    (acc, entry) => ({
      revenueHt: acc.revenueHt + entry.saleHt,
      purchasesHt: acc.purchasesHt + entry.purchaseHt,
      marginAmount: acc.marginAmount + entry.marginAmount,
      vatAmount: acc.vatAmount + entry.vatAmount,
      totalTtc: acc.totalTtc + entry.totalTtc,
    }),
    { revenueHt: 0, purchasesHt: 0, marginAmount: 0, vatAmount: 0, totalTtc: 0 }
  );

  const byMonth = new Map<string, typeof sums>();
  entries.forEach((entry) => {
    const key = entry.date.slice(0, 7);
    const current = byMonth.get(key) || { revenueHt: 0, purchasesHt: 0, marginAmount: 0, vatAmount: 0, totalTtc: 0 };
    current.revenueHt += entry.saleHt;
    current.purchasesHt += entry.purchaseHt;
    current.marginAmount += entry.marginAmount;
    current.vatAmount += entry.vatAmount;
    current.totalTtc += entry.totalTtc;
    byMonth.set(key, current);
  });
  const expensesByMonth = new Map<string, number>();
  expenses.forEach((expense) => {
    const key = expense.date.slice(0, 7);
    expensesByMonth.set(key, (expensesByMonth.get(key) || 0) + expense.amountHt);
    if (!byMonth.has(key)) {
      byMonth.set(key, { revenueHt: 0, purchasesHt: 0, marginAmount: 0, vatAmount: 0, totalTtc: 0 });
    }
  });

  const months = [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => {
      const operatingExpensesHt = expensesByMonth.get(key) || 0;
      return {
        key,
        label: monthLabel(key),
        revenueHt: round(values.revenueHt),
        purchasesHt: round(values.purchasesHt),
        operatingExpensesHt: round(operatingExpensesHt),
        marginAmount: round(values.marginAmount),
        marginRate: values.revenueHt ? (values.marginAmount / Math.abs(values.revenueHt)) * 100 : 0,
        vatAmount: round(values.vatAmount),
        totalTtc: round(values.totalTtc),
        netProfit: round(values.marginAmount - operatingExpensesHt),
      };
    });
  const operatingExpensesHt = expenses.reduce((sum, expense) => sum + expense.amountHt, 0);
  const deductibleVat = expenses.reduce((sum, expense) => sum + expense.amountHt * ((Number(expense.vatRate) || 0) / 100), 0);

  return {
    period,
    entries,
    expenses,
    months,
    documentCount: new Set(entries.map((entry) => entry.documentId)).size,
    revenueHt: round(sums.revenueHt),
    purchasesHt: round(sums.purchasesHt),
    operatingExpensesHt: round(operatingExpensesHt),
    marginAmount: round(sums.marginAmount),
    averageMarginRate: sums.revenueHt ? (sums.marginAmount / Math.abs(sums.revenueHt)) * 100 : 0,
    netProfit: round(sums.marginAmount - operatingExpensesHt),
    vatAmount: round(sums.vatAmount),
    deductibleVat: round(deductibleVat),
    vatBalance: round(sums.vatAmount - deductibleVat),
    totalTtc: round(sums.totalTtc),
  };
}

export function accountingDocumentTotal(doc: BusinessDocument) {
  return totals(doc.lines).totalHt;
}
