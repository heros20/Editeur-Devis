export type DocumentType = "quote" | "order" | "invoice";
export type DocumentStatus = "draft" | "sent" | "accepted" | "ordered" | "invoiced" | "paid" | "canceled";

export interface CompanySettings {
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

export interface LineItem {
  id: string;
  description: string;
  details: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discount: number;
}

export interface BusinessDocument {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  price: number;
  vatRate: number;
  category: string;
}

export interface AppData {
  company: CompanySettings;
  counters: Record<DocumentType | "client", number>;
  clients: Client[];
  documents: BusinessDocument[];
  catalog: CatalogItem[];
}
