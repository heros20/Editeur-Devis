import type {
  AppData,
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
} from "./types";
import { addDaysIso, makeId, todayIso } from "./utils";

export const defaultCompany: CompanySettings = {
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
  iban: "",
  bic: "",
  paymentTerms: "",
  quoteValidityDays: 30,
  defaultVatRate: 20,
  defaultDepositRate: 30,
  notes: "",
};

export const defaultCatalog: CatalogItem[] = [
  { id: "cat-1", name: "Meuble sur mesure", unit: "u", price: 1450, vatRate: 20, category: "Fabrication" },
  { id: "cat-2", name: "Placard / dressing mélaminé", unit: "ml", price: 680, vatRate: 20, category: "Agencement" },
  { id: "cat-3", name: "Bibliothèque chêne plaqué", unit: "ml", price: 920, vatRate: 20, category: "Agencement" },
  { id: "cat-4", name: "Plan de travail bois massif", unit: "ml", price: 260, vatRate: 20, category: "Bois massif" },
  { id: "cat-5", name: "Pose et ajustements sur site", unit: "h", price: 58, vatRate: 10, category: "Pose" },
  { id: "cat-6", name: "Finition vernis mat / huile dure", unit: "m2", price: 42, vatRate: 20, category: "Finition" },
];

const documentTypes: DocumentType[] = ["quote", "order", "invoice"];

export function createDefaultAppData(): AppData {
  return {
    company: { ...defaultCompany },
    counters: {
      quote: 1,
      order: 1,
      invoice: 1,
      client: 1,
    },
    clients: [],
    documents: [],
    catalog: defaultCatalog.map((item) => ({ ...item })),
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
  return value === "paid" ? "paid" : "draft";
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
    vatRate: normalizeNumber(line.vatRate, defaultVatRate),
    discount: normalizeNumber(line.discount, 0),
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
    vatRate: normalizeNumber(item.vatRate, defaultCompany.defaultVatRate),
    category: item.category || "",
  };
}

export function normalizeData(input?: Partial<AppData> | null): AppData {
  const fallback = createDefaultAppData();
  const company = { ...fallback.company, ...(input?.company ?? {}) };

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
    catalog: Array.isArray(input?.catalog) && input.catalog.length
      ? input.catalog.map(normalizeCatalogItem)
      : fallback.catalog,
  };
}
