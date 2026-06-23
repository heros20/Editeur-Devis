import type { AppData, BusinessDocument, BusinessExpense, Client, DocumentType, LineItem, PaymentMethod, PurchaseInvoice } from "./types";
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

export type AccountingExpenseSource = "manual" | "purchaseInvoice";

export interface AccountingExpenseEntry {
  id: string;
  expenseId?: string;
  purchaseInvoiceId?: string;
  purchaseOrderId?: string;
  source: AccountingExpenseSource;
  date: string;
  dueDate: string;
  supplier: string;
  supplierId?: string;
  reference: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amountHt: number;
  vatRate: number;
  vatAmount: number;
  totalTtc: number;
  paymentMethod: PaymentMethod;
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
  taxableProfit: number;
  estimatedCorporateTax: number;
  netProfitAfterTax: number;
  taxShareOfRevenue: number;
}

export interface AccountingReport {
  period: AccountingPeriod;
  entries: AccountingEntry[];
  expenses: BusinessExpense[];
  expenseEntries: AccountingExpenseEntry[];
  months: AccountingMonth[];
  documentCount: number;
  expenseDocumentCount: number;
  revenueHt: number;
  purchasesHt: number;
  operatingExpensesHt: number;
  marginAmount: number;
  averageMarginRate: number;
  netProfit: number;
  taxableProfit: number;
  estimatedCorporateTax: number;
  netProfitAfterTax: number;
  taxShareOfRevenue: number;
  vatAmount: number;
  deductibleVat: number;
  vatBalance: number;
  totalTtc: number;
}

const accountingTypes = new Set<AccountingDocumentType>(["invoice", "creditNote", "returnInvoice"]);

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function estimateCorporateTax(taxableProfit: number) {
  const profit = Math.max(0, taxableProfit);
  const reducedBase = Math.min(profit, 42500);
  const normalBase = Math.max(0, profit - 42500);
  return round(reducedBase * 0.15 + normalBase * 0.25);
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

function purchaseLineAmount(line: PurchaseInvoice["lines"][number]) {
  return Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0);
}

function purchaseInvoiceExpenseEntries(invoice: PurchaseInvoice, expense?: BusinessExpense): AccountingExpenseEntry[] {
  return invoice.lines.map((line) => {
    const amountHt = purchaseLineAmount(line);
    const vatRate = Math.max(0, Number(line.vatRate) || 0);
    const vatAmount = amountHt * (vatRate / 100);
    return {
      id: `${invoice.id}:${line.id}`,
      expenseId: expense?.id || invoice.expenseId,
      purchaseInvoiceId: invoice.id,
      purchaseOrderId: invoice.purchaseOrderId,
      source: "purchaseInvoice",
      date: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      supplier: invoice.supplier,
      supplierId: invoice.supplierId,
      reference: invoice.reference,
      category: expense?.category || "Achats fournisseurs",
      description: line.description || `Facture ${invoice.reference}`,
      quantity: Number(line.quantity) || 0,
      unit: line.unit || "",
      unitPrice: Number(line.unitPrice) || 0,
      amountHt: round(amountHt),
      vatRate: round(vatRate),
      vatAmount: round(vatAmount),
      totalTtc: round(amountHt + vatAmount),
      paymentMethod: invoice.paymentMethod,
    };
  });
}

function manualExpenseEntry(expense: BusinessExpense): AccountingExpenseEntry {
  const vatAmount = expense.amountHt * ((Number(expense.vatRate) || 0) / 100);
  return {
    id: expense.id,
    expenseId: expense.id,
    purchaseInvoiceId: expense.purchaseInvoiceId,
    source: "manual",
    date: expense.date,
    dueDate: "",
    supplier: expense.supplier,
    supplierId: expense.supplierId,
    reference: expense.reference,
    category: expense.category,
    description: expense.description,
    quantity: 1,
    unit: "",
    unitPrice: expense.amountHt,
    amountHt: round(expense.amountHt),
    vatRate: round(Number(expense.vatRate) || 0),
    vatAmount: round(vatAmount),
    totalTtc: round(expense.amountHt + vatAmount),
    paymentMethod: expense.paymentMethod,
  };
}

function inPeriod(date: string, period: AccountingPeriod) {
  return date >= period.startDate && date <= period.endDate;
}

export function buildAccountingExpenseEntries(data: AppData, period: AccountingPeriod): AccountingExpenseEntry[] {
  const handledInvoices = new Set<string>();
  const entries: AccountingExpenseEntry[] = [];

  data.expenses.forEach((expense) => {
    if (expense.purchaseInvoiceId) {
      const invoice = data.purchaseInvoices.find((item) => item.id === expense.purchaseInvoiceId);
      if (invoice) {
        handledInvoices.add(invoice.id);
        entries.push(...purchaseInvoiceExpenseEntries(invoice, expense));
        return;
      }
    }
    entries.push(manualExpenseEntry(expense));
  });

  data.purchaseInvoices
    .filter((invoice) => !handledInvoices.has(invoice.id) && invoice.supplierId && invoice.reference.trim())
    .filter((invoice) => invoice.lines.some((line) => purchaseLineAmount(line) > 0))
    .forEach((invoice) => entries.push(...purchaseInvoiceExpenseEntries(invoice)));

  return entries
    .filter((entry) => inPeriod(entry.date, period))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.supplier.localeCompare(b.supplier, "fr") ||
        a.reference.localeCompare(b.reference, "fr") ||
        a.description.localeCompare(b.description, "fr")
    );
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

// Rappel d'architecture: toute nouvelle zone qui cree une vente ou une depense doit alimenter
// data.documents, data.expenses ou data.purchaseInvoices pour rester visible dans le livre de comptes.
export function buildAccountingReport(data: AppData, period: AccountingPeriod): AccountingReport {
  const documents = data.documents.filter(
    (doc) => accountingTypes.has(doc.type as AccountingDocumentType) && inPeriod(doc.issueDate, period)
  );
  const entries = documents
    .flatMap((doc) => {
      const client = data.clients.find((item) => item.id === doc.clientId);
      return doc.lines.map((line) => entryFromLine(doc, client, line));
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.documentNumber.localeCompare(b.documentNumber));
  const expenses = [...data.expenses]
    .filter((expense) => inPeriod(expense.date, period))
    .sort((a, b) => a.date.localeCompare(b.date) || a.supplier.localeCompare(b.supplier, "fr"));
  const expenseEntries = buildAccountingExpenseEntries(data, period);

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
  expenseEntries.forEach((expense) => {
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
      const taxableProfit = round(Math.max(0, values.marginAmount - operatingExpensesHt));
      const estimatedCorporateTax = estimateCorporateTax(taxableProfit);
      const netProfit = round(values.marginAmount - operatingExpensesHt);
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
        netProfit,
        taxableProfit,
        estimatedCorporateTax,
        netProfitAfterTax: round(netProfit - estimatedCorporateTax),
        taxShareOfRevenue: round(values.revenueHt ? (estimatedCorporateTax / Math.abs(values.revenueHt)) * 100 : 0),
      };
    });
  const operatingExpensesHt = expenseEntries.reduce((sum, expense) => sum + expense.amountHt, 0);
  const deductibleVat = expenseEntries.reduce((sum, expense) => sum + expense.vatAmount, 0);
  const expenseDocumentCount = new Set(expenseEntries.map((expense) => expense.purchaseInvoiceId || expense.expenseId || expense.id)).size;
  const netProfit = round(sums.marginAmount - operatingExpensesHt);
  const taxableProfit = round(Math.max(0, netProfit));
  const estimatedCorporateTax = estimateCorporateTax(taxableProfit);

  return {
    period,
    entries,
    expenses,
    expenseEntries,
    months,
    documentCount: new Set(entries.map((entry) => entry.documentId)).size,
    expenseDocumentCount,
    revenueHt: round(sums.revenueHt),
    purchasesHt: round(sums.purchasesHt),
    operatingExpensesHt: round(operatingExpensesHt),
    marginAmount: round(sums.marginAmount),
    averageMarginRate: sums.revenueHt ? (sums.marginAmount / Math.abs(sums.revenueHt)) * 100 : 0,
    netProfit,
    taxableProfit,
    estimatedCorporateTax,
    netProfitAfterTax: round(netProfit - estimatedCorporateTax),
    taxShareOfRevenue: round(sums.revenueHt ? (estimatedCorporateTax / Math.abs(sums.revenueHt)) * 100 : 0),
    vatAmount: round(sums.vatAmount),
    deductibleVat: round(deductibleVat),
    vatBalance: round(sums.vatAmount - deductibleVat),
    totalTtc: round(sums.totalTtc),
  };
}

export function accountingDocumentTotal(doc: BusinessDocument) {
  return totals(doc.lines).totalHt;
}
