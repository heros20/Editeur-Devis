import type { ThemeId } from "./themes";

export type DocumentType = "quote" | "order" | "invoice" | "creditNote" | "returnInvoice";
export type DocumentStatus = "draft" | "partial" | "paid";
export type PaymentMethod = "bank_transfer" | "check" | "cash" | "card" | "other";

export interface CompanySettings {
  themeId: ThemeId;
  name: string;
  legalName: string;
  siret: string;
  vatNumber: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  logoDataUrl: string;
  iban: string;
  bic: string;
  paymentTerms: string;
  quoteValidityDays: number;
  defaultVatRate: number;
  defaultDepositRate: number;
  notes: string;
}

export interface Client {
  id: string;
  number: string;
  type: "particulier" | "professionnel";
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  siret: string;
  vatNumber: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  catalogItemId?: string;
  description: string;
  details: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  purchasePrice: number;
  vatRate: number;
  discount: number;
}

export interface DocumentAttachment {
  id: string;
  name: string;
  filePath: string;
  storagePath?: string;
  mimeType?: string;
  dataUrl?: string;
  size: number;
  addedAt: string;
}

export interface PaymentEntry {
  id: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note: string;
  createdAt: string;
}

export interface BusinessExpense {
  id: string;
  archivedAt?: string;
  archivedYear?: number;
  date: string;
  supplier: string;
  supplierId?: string;
  reference: string;
  category: string;
  description: string;
  amountHt: number;
  vatRate: number;
  paymentMethod: PaymentMethod;
  purchaseInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseInvoiceStatus = "draft" | "posted";

export interface PurchaseInvoiceLine {
  id: string;
  catalogItemId?: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export interface PurchaseInvoice {
  id: string;
  archivedAt?: string;
  archivedYear?: number;
  supplierId: string;
  supplier: string;
  reference: string;
  invoiceDate: string;
  dueDate: string;
  status: PurchaseInvoiceStatus;
  paymentMethod: PaymentMethod;
  notes: string;
  lines: PurchaseInvoiceLine[];
  attachments: DocumentAttachment[];
  expenseId?: string;
  purchaseOrderId?: string;
  sourceOrder?: PurchaseOrder;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseOrderStatus = "draft" | "sent" | "received";

export interface PurchaseOrder {
  id: string;
  archivedAt?: string;
  archivedYear?: number;
  number: string;
  supplierId: string;
  supplier: string;
  orderDate: string;
  expectedDate: string;
  status: PurchaseOrderStatus;
  notes: string;
  lines: PurchaseInvoiceLine[];
  attachments: DocumentAttachment[];
  receivedAt?: string;
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReminder {
  id: string;
  sentAt: string;
  channel: "email" | "phone" | "letter" | "other";
  note: string;
}

export interface BusinessDocument {
  id: string;
  archivedAt?: string;
  archivedYear?: number;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  clientId: string;
  issueDate: string;
  dueDate: string;
  projectName: string;
  siteAddress: string;
  workStart: string;
  workDuration: string;
  originId?: string;
  depositRate: number;
  notes: string;
  terms: string;
  lines: LineItem[];
  attachments: DocumentAttachment[];
  depositPaidAmount: number;
  depositPaidAt: string;
  payments: PaymentEntry[];
  paymentNotes: string;
  reminders: PaymentReminder[];
  history: DocumentHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSnapshot {
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  clientId: string;
  issueDate: string;
  dueDate: string;
  projectName: string;
  siteAddress: string;
  workStart: string;
  workDuration: string;
  depositRate: number;
  notes: string;
  terms: string;
  lines: LineItem[];
  attachments: DocumentAttachment[];
  depositPaidAmount: number;
  depositPaidAt: string;
  payments: PaymentEntry[];
  paymentNotes: string;
  reminders: PaymentReminder[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentHistoryEntry {
  id: string;
  transformedAt: string;
  fromType: DocumentType;
  fromNumber: string;
  toType: DocumentType;
  toNumber: string;
  snapshot: DocumentSnapshot;
}

export interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  price: number;
  purchasePrice: number;
  vatRate: number;
  category: string;
  trackStock: boolean;
  stockQuantity: number;
  stockMinimum: number;
  stockUnit: string;
  supplier: string;
  supplierId?: string;
  location: string;
  stockMovements: StockMovement[];
}

export interface StockMovement {
  id: string;
  type: "entry" | "exit" | "adjustment";
  quantity: number;
  previousQuantity: number;
  nextQuantity: number;
  reason: string;
  createdAt: string;
}

export interface AppData {
  company: CompanySettings;
  counters: Record<DocumentType | "client", number>;
  clients: Client[];
  documents: BusinessDocument[];
  catalog: CatalogItem[];
  expenses: BusinessExpense[];
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  purchaseOrders: PurchaseOrder[];
}
