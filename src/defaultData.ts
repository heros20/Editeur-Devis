import type {
  AppData,
  BusinessExpense,
  BusinessDocument,
  CatalogItem,
  Client,
  CompanySettings,
  DocumentHistoryEntry,
  DocumentSnapshot,
  DocumentStatus,
  DocumentType,
  DocumentAttachment,
  LineItem,
  PaymentEntry,
  PaymentMethod,
  PurchaseInvoice,
  PurchaseInvoiceLine,
  PurchaseOrder,
  PaymentReminder,
  Supplier,
} from "./types";
import { addDaysIso, makeId, todayIso } from "./utils";
import { defaultThemeId, isThemeId } from "./themes";

export const defaultCompany: CompanySettings = {
  themeId: defaultThemeId,
  name: "",
  legalName: "",
  siret: "",
  vatNumber: "",
  address: "",
  postalCode: "",
  city: "",
  phone: "",
  email: "",
  website: "",
  logoDataUrl: "",
  iban: "",
  bic: "",
  paymentTerms: "",
  quoteValidityDays: 30,
  defaultVatRate: 20,
  defaultDepositRate: 30,
  notes: "",
};

export const defaultCatalog: CatalogItem[] = [
  {
    id: "cat-1",
    name: "Meuble sur mesure",
    unit: "u",
    price: 1450,
    purchasePrice: 0,
    vatRate: 20,
    category: "Fabrication",
    trackStock: false,
    stockQuantity: 0,
    stockMinimum: 0,
    stockUnit: "u",
    supplier: "",
    location: "",
    stockMovements: [],
  },
  {
    id: "cat-2",
    name: "Placard / dressing mélaminé",
    unit: "ml",
    price: 680,
    purchasePrice: 0,
    vatRate: 20,
    category: "Agencement",
    trackStock: false,
    stockQuantity: 0,
    stockMinimum: 0,
    stockUnit: "ml",
    supplier: "",
    location: "",
    stockMovements: [],
  },
  {
    id: "cat-3",
    name: "Bibliothèque chêne plaqué",
    unit: "ml",
    price: 920,
    purchasePrice: 0,
    vatRate: 20,
    category: "Agencement",
    trackStock: false,
    stockQuantity: 0,
    stockMinimum: 0,
    stockUnit: "ml",
    supplier: "",
    location: "",
    stockMovements: [],
  },
  {
    id: "cat-4",
    name: "Plan de travail bois massif",
    unit: "ml",
    price: 260,
    purchasePrice: 0,
    vatRate: 20,
    category: "Bois massif",
    trackStock: false,
    stockQuantity: 0,
    stockMinimum: 0,
    stockUnit: "ml",
    supplier: "",
    location: "",
    stockMovements: [],
  },
  {
    id: "cat-5",
    name: "Pose et ajustements sur site",
    unit: "h",
    price: 58,
    purchasePrice: 0,
    vatRate: 10,
    category: "Pose",
    trackStock: false,
    stockQuantity: 0,
    stockMinimum: 0,
    stockUnit: "h",
    supplier: "",
    location: "",
    stockMovements: [],
  },
  {
    id: "cat-6",
    name: "Finition vernis mat / huile dure",
    unit: "m2",
    price: 42,
    purchasePrice: 0,
    vatRate: 20,
    category: "Finition",
    trackStock: false,
    stockQuantity: 0,
    stockMinimum: 0,
    stockUnit: "m2",
    supplier: "",
    location: "",
    stockMovements: [],
  },
];

const documentTypes: DocumentType[] = ["quote", "order", "invoice", "creditNote", "returnInvoice"];

export function createDefaultAppData(): AppData {
  return {
    company: { ...defaultCompany },
    counters: {
      quote: 1,
      order: 1,
      invoice: 1,
      creditNote: 1,
      returnInvoice: 1,
      client: 1,
    },
    clients: [],
    documents: [],
    catalog: defaultCatalog.map((item) => ({ ...item })),
    expenses: [],
    suppliers: [],
    purchaseInvoices: [],
    purchaseOrders: [],
  };
}

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeDocumentType(value: unknown, fallback: DocumentType): DocumentType {
  return documentTypes.includes(value as DocumentType) ? (value as DocumentType) : fallback;
}

function normalizeDocumentStatus(value: unknown): DocumentStatus {
  if (value === "partial") return "partial";
  return value === "paid" ? "paid" : "draft";
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  return value === "check" || value === "cash" || value === "card" || value === "other" ? value : "bank_transfer";
}

function normalizeExpense(expense: Partial<BusinessExpense>): BusinessExpense {
  const now = new Date().toISOString();
  return {
    id: expense.id || makeId("expense"),
    date: expense.date || todayIso(),
    supplier: expense.supplier || "",
    supplierId: expense.supplierId,
    reference: expense.reference || "",
    category: expense.category || "Autre",
    description: expense.description || "",
    amountHt: normalizeNumber(expense.amountHt, 0),
    vatRate: normalizeNumber(expense.vatRate, defaultCompany.defaultVatRate),
    paymentMethod: normalizePaymentMethod(expense.paymentMethod),
    purchaseInvoiceId: expense.purchaseInvoiceId,
    createdAt: expense.createdAt || now,
    updatedAt: expense.updatedAt || now,
  };
}

function normalizePurchaseInvoiceLine(line: Partial<PurchaseInvoiceLine>, defaultVatRate: number): PurchaseInvoiceLine {
  return {
    id: line.id || makeId("purchase-line"),
    catalogItemId: line.catalogItemId,
    description: line.description || "",
    unit: line.unit || "u",
    quantity: normalizeNumber(line.quantity, 1),
    unitPrice: normalizeNumber(line.unitPrice, 0),
    vatRate: normalizeNumber(line.vatRate, defaultVatRate),
  };
}

function normalizePurchaseInvoice(invoice: Partial<PurchaseInvoice>, defaultVatRate: number): PurchaseInvoice {
  const now = new Date().toISOString();
  const invoiceDate = invoice.invoiceDate || todayIso();
  return {
    id: invoice.id || makeId("purchase"),
    supplierId: invoice.supplierId || "",
    supplier: invoice.supplier || "",
    reference: invoice.reference || "",
    invoiceDate,
    dueDate: invoice.dueDate || addDaysIso(invoiceDate, 30),
    status: invoice.status === "posted" ? "posted" : "draft",
    paymentMethod: normalizePaymentMethod(invoice.paymentMethod),
    notes: invoice.notes || "",
    lines: Array.isArray(invoice.lines) ? invoice.lines.map((line) => normalizePurchaseInvoiceLine(line, defaultVatRate)) : [],
    attachments: normalizeAttachments(invoice.attachments),
    expenseId: invoice.expenseId,
    purchaseOrderId: invoice.purchaseOrderId,
    sourceOrder: invoice.sourceOrder ? normalizePurchaseOrder(invoice.sourceOrder, defaultVatRate) : undefined,
    postedAt: invoice.postedAt,
    createdAt: invoice.createdAt || now,
    updatedAt: invoice.updatedAt || now,
  };
}

function normalizePurchaseOrder(order: Partial<PurchaseOrder>, defaultVatRate: number): PurchaseOrder {
  const now = new Date().toISOString();
  const orderDate = order.orderDate || todayIso();
  return {
    id: order.id || makeId("purchase-order"),
    number: order.number || "BCF-0000",
    supplierId: order.supplierId || "",
    supplier: order.supplier || "",
    orderDate,
    expectedDate: order.expectedDate || addDaysIso(orderDate, 14),
    status: order.status === "received" ? "received" : order.status === "sent" ? "sent" : "draft",
    notes: order.notes || "",
    lines: Array.isArray(order.lines) ? order.lines.map((line) => normalizePurchaseInvoiceLine(line, defaultVatRate)) : [],
    attachments: normalizeAttachments(order.attachments),
    receivedAt: order.receivedAt,
    invoiceId: order.invoiceId,
    createdAt: order.createdAt || now,
    updatedAt: order.updatedAt || now,
  };
}

function normalizeSupplier(supplier: Partial<Supplier>): Supplier {
  const now = new Date().toISOString();
  return {
    id: supplier.id || makeId("supplier"),
    name: supplier.name || "Fournisseur à renseigner",
    contact: supplier.contact || "",
    email: supplier.email || "",
    phone: supplier.phone || "",
    siret: supplier.siret || "",
    vatNumber: supplier.vatNumber || "",
    address: supplier.address || "",
    postalCode: supplier.postalCode || "",
    city: supplier.city || "",
    notes: supplier.notes || "",
    createdAt: supplier.createdAt || now,
    updatedAt: supplier.updatedAt || now,
  };
}

function normalizeClient(client: Partial<Client>): Client {
  return {
    id: client.id || makeId("client"),
    number: client.number || "CLI-0000",
    type: client.type === "professionnel" ? "professionnel" : "particulier",
    name: client.name || "Client à renseigner",
    contact: client.contact || "",
    email: client.email || "",
    phone: client.phone || "",
    address: client.address || "",
    postalCode: client.postalCode || "",
    city: client.city || "",
    notes: client.notes || "",
    createdAt: client.createdAt || new Date().toISOString(),
  };
}

function normalizeLine(line: Partial<LineItem>, defaultVatRate: number): LineItem {
  return {
    id: line.id || makeId("line"),
    description: line.description === "Nouvel ouvrage" ? "" : line.description || "",
    details: line.details || "",
    unit: line.unit || "",
    quantity: normalizeNumber(line.quantity, 1),
    unitPrice: normalizeNumber(line.unitPrice, 0),
    purchasePrice: normalizeNumber(line.purchasePrice, 0),
    vatRate: normalizeNumber(line.vatRate, defaultVatRate),
    discount: normalizeNumber(line.discount, 0),
    catalogItemId: line.catalogItemId,
  };
}

function normalizeLines(lines: unknown, defaultVatRate: number): LineItem[] {
  if (Array.isArray(lines)) {
    return lines.map((line) => normalizeLine(line, defaultVatRate));
  }
  return [];
}

function normalizeAttachment(attachment: Partial<DocumentAttachment>): DocumentAttachment {
  return {
    id: attachment.id || makeId("attachment"),
    name: attachment.name || "Pièce jointe",
    filePath: attachment.filePath || "",
    storagePath: attachment.storagePath,
    mimeType: attachment.mimeType,
    dataUrl: attachment.dataUrl,
    size: normalizeNumber(attachment.size, 0),
    addedAt: attachment.addedAt || new Date().toISOString(),
  };
}

function normalizeAttachments(attachments: unknown): DocumentAttachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.map(normalizeAttachment).filter((attachment) => attachment.filePath);
}

function normalizePayment(payment: Partial<PaymentEntry>): PaymentEntry {
  return {
    id: payment.id || makeId("payment"),
    amount: normalizeNumber(payment.amount, 0),
    method: normalizePaymentMethod(payment.method),
    paidAt: payment.paidAt || todayIso(),
    note: payment.note || "",
    createdAt: payment.createdAt || new Date().toISOString(),
  };
}

function normalizePayments(payments: unknown): PaymentEntry[] {
  if (!Array.isArray(payments)) return [];
  return payments.map(normalizePayment).filter((payment) => payment.amount > 0);
}

function normalizeReminder(reminder: Partial<PaymentReminder>): PaymentReminder {
  return {
    id: reminder.id || makeId("reminder"),
    sentAt: reminder.sentAt || todayIso(),
    channel: reminder.channel === "phone" || reminder.channel === "letter" || reminder.channel === "other" ? reminder.channel : "email",
    note: reminder.note || "",
  };
}

function normalizeReminders(reminders: unknown): PaymentReminder[] {
  if (!Array.isArray(reminders)) return [];
  return reminders.map(normalizeReminder);
}

function normalizeSnapshot(snapshot: Partial<DocumentSnapshot>, defaultVatRate: number): DocumentSnapshot {
  const issueDate = snapshot.issueDate || todayIso();
  return {
    type: normalizeDocumentType(snapshot.type, "quote"),
    number: snapshot.number || "DEV-0000",
    status: normalizeDocumentStatus(snapshot.status),
    clientId: snapshot.clientId || "",
    issueDate,
    dueDate: snapshot.dueDate || addDaysIso(issueDate, 30),
    projectName: snapshot.projectName || "",
    siteAddress: snapshot.siteAddress || "",
    workStart: snapshot.workStart || "",
    workDuration: snapshot.workDuration || "",
    depositRate: normalizeNumber(snapshot.depositRate, defaultCompany.defaultDepositRate),
    notes: snapshot.notes || "",
    terms: snapshot.terms || defaultCompany.paymentTerms,
    lines: normalizeLines(snapshot.lines, defaultVatRate),
    attachments: normalizeAttachments(snapshot.attachments),
    depositPaidAmount: normalizeNumber(snapshot.depositPaidAmount, 0),
    depositPaidAt: snapshot.depositPaidAt || "",
    payments: normalizePayments(snapshot.payments),
    paymentNotes: snapshot.paymentNotes || "",
    reminders: normalizeReminders(snapshot.reminders),
    createdAt: snapshot.createdAt || new Date().toISOString(),
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
  };
}

function normalizeHistory(history: unknown, defaultVatRate: number): DocumentHistoryEntry[] {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => ({
    id: entry.id || makeId("history"),
    transformedAt: entry.transformedAt || new Date().toISOString(),
    fromType: normalizeDocumentType(entry.fromType, "quote"),
    fromNumber: entry.fromNumber || "",
    toType: normalizeDocumentType(entry.toType, "order"),
    toNumber: entry.toNumber || "",
    snapshot: normalizeSnapshot(entry.snapshot || {}, defaultVatRate),
  }));
}

function normalizeDocument(doc: Partial<BusinessDocument>, defaultVatRate: number): BusinessDocument {
  const issueDate = doc.issueDate || todayIso();
  return {
    id: doc.id || makeId("doc"),
    type: normalizeDocumentType(doc.type, "quote"),
    number: doc.number || "DEV-0000",
    status: normalizeDocumentStatus(doc.status),
    clientId: doc.clientId || "",
    issueDate,
    dueDate: doc.dueDate || addDaysIso(issueDate, 30),
    projectName: doc.projectName || "",
    siteAddress: doc.siteAddress || "",
    workStart: doc.workStart || "",
    workDuration: doc.workDuration || "",
    originId: doc.originId,
    depositRate: normalizeNumber(doc.depositRate, defaultCompany.defaultDepositRate),
    notes: doc.notes || "",
    terms: doc.terms || defaultCompany.paymentTerms,
    lines: normalizeLines(doc.lines, defaultVatRate),
    attachments: normalizeAttachments(doc.attachments),
    depositPaidAmount: normalizeNumber(doc.depositPaidAmount, 0),
    depositPaidAt: doc.depositPaidAt || "",
    payments: normalizePayments(doc.payments),
    paymentNotes: doc.paymentNotes || "",
    reminders: normalizeReminders(doc.reminders),
    history: normalizeHistory(doc.history, defaultVatRate),
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || new Date().toISOString(),
  };
}

function normalizeCatalogItem(item: Partial<CatalogItem>): CatalogItem {
  return {
    id: item.id || makeId("catalog"),
    name: item.name || "",
    unit: item.unit || "",
    price: normalizeNumber(item.price, 0),
    purchasePrice: normalizeNumber(item.purchasePrice, 0),
    vatRate: normalizeNumber(item.vatRate, defaultCompany.defaultVatRate),
    category: item.category || "",
    trackStock: Boolean(item.trackStock),
    stockQuantity: normalizeNumber(item.stockQuantity, 0),
    stockMinimum: normalizeNumber(item.stockMinimum, 0),
    stockUnit: item.stockUnit || item.unit || "",
    supplier: item.supplier || "",
    supplierId: item.supplierId,
    location: item.location || "",
    stockMovements: Array.isArray(item.stockMovements)
      ? item.stockMovements.map((movement) => ({
          id: movement.id || makeId("stock"),
          type: movement.type === "entry" || movement.type === "exit" ? movement.type : "adjustment",
          quantity: normalizeNumber(movement.quantity, 0),
          previousQuantity: normalizeNumber(movement.previousQuantity, 0),
          nextQuantity: normalizeNumber(movement.nextQuantity, 0),
          reason: movement.reason || "",
          createdAt: movement.createdAt || new Date().toISOString(),
        }))
      : [],
  };
}

export function normalizeData(input?: Partial<AppData> | null): AppData {
  const fallback = createDefaultAppData();
  const company = {
    ...fallback.company,
    ...(input?.company ?? {}),
    themeId: isThemeId(input?.company?.themeId) ? input.company.themeId : fallback.company.themeId,
  };
  const suppliers = Array.isArray(input?.suppliers) ? input.suppliers.map(normalizeSupplier) : fallback.suppliers;
  const catalog = (Array.isArray(input?.catalog) ? input.catalog.map(normalizeCatalogItem) : fallback.catalog).map((item) => {
    const linkedSupplier = item.supplierId
      ? suppliers.find((supplier) => supplier.id === item.supplierId)
      : suppliers.find((supplier) => supplier.name.trim().localeCompare(item.supplier.trim(), "fr", { sensitivity: "base" }) === 0);
    return linkedSupplier ? { ...item, supplierId: linkedSupplier.id, supplier: linkedSupplier.name } : item;
  });

  return {
    company,
    counters: {
      ...fallback.counters,
      ...(input?.counters ?? {}),
    },
    clients: Array.isArray(input?.clients) ? input.clients.map(normalizeClient) : fallback.clients,
    documents: Array.isArray(input?.documents)
      ? input.documents.map((doc) => normalizeDocument(doc, company.defaultVatRate))
      : fallback.documents,
    catalog,
    expenses: Array.isArray(input?.expenses) ? input.expenses.map(normalizeExpense) : fallback.expenses,
    suppliers,
    purchaseInvoices: Array.isArray(input?.purchaseInvoices)
      ? input.purchaseInvoices.map((invoice) => {
          const normalized = normalizePurchaseInvoice(invoice, company.defaultVatRate);
          const supplier = suppliers.find((entry) => entry.id === normalized.supplierId);
          return supplier ? { ...normalized, supplier: supplier.name } : normalized;
        })
      : fallback.purchaseInvoices,
    purchaseOrders: Array.isArray(input?.purchaseOrders)
      ? input.purchaseOrders.map((order) => {
          const normalized = normalizePurchaseOrder(order, company.defaultVatRate);
          const supplier = suppliers.find((entry) => entry.id === normalized.supplierId);
          return supplier ? { ...normalized, supplier: supplier.name } : normalized;
        })
      : fallback.purchaseOrders,
  };
}
