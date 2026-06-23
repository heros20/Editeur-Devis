import { describe, expect, it } from "vitest";
import { buildPaymentReminderEmail } from "./reminderEmail";
import type { BusinessDocument, Client, CompanySettings, LineItem } from "./types";

const line = (partial: Partial<LineItem>): LineItem => ({
  id: "line-1",
  description: "Projet",
  details: "",
  unit: "u",
  quantity: 1,
  unitPrice: 100,
  purchasePrice: 0,
  vatRate: 20,
  discount: 0,
  ...partial,
});

const document = (partial: Partial<BusinessDocument>): BusinessDocument => ({
  id: "doc-1",
  type: "invoice",
  number: "FAC-2026-0001",
  status: "partial",
  clientId: "client-1",
  issueDate: "2026-06-21",
  dueDate: "2026-07-21",
  projectName: "Bibliothèque",
  siteAddress: "",
  workStart: "",
  workDuration: "",
  depositRate: 30,
  notes: "",
  terms: "",
  lines: [line({})],
  attachments: [],
  depositPaidAmount: 36,
  depositPaidAt: "2026-06-21",
  payments: [],
  paymentNotes: "",
  reminders: [],
  history: [],
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
  ...partial,
});

const client = (partial: Partial<Client>): Client => ({
  id: "client-1",
  number: "CLI-2026-0001",
  type: "particulier",
  name: "Client Test",
  contact: "",
  email: "client@test.fr",
  phone: "",
  address: "",
  postalCode: "",
  city: "",
  notes: "",
  createdAt: "2026-06-21T00:00:00.000Z",
  ...partial,
});

const company = (partial: Partial<CompanySettings>): CompanySettings => ({
  themeId: "devix",
  name: "Devix",
  legalName: "Devix",
  siret: "",
  vatNumber: "",
  address: "",
  postalCode: "",
  city: "",
  phone: "01 02 03 04 05",
  email: "contact@devix.fr",
  website: "",
  logoDataUrl: "",
  iban: "FR76 0000 0000 0000",
  bic: "BANKFRPP",
  paymentTerms: "Paiement à réception",
  quoteValidityDays: 30,
  defaultVatRate: 20,
  defaultDepositRate: 30,
  notes: "",
  ...partial,
});

describe("payment reminder email", () => {
  it("includes paid deposit and remaining amount", () => {
    const result = buildPaymentReminderEmail(document({}), client({}), company({}), "Merci de régulariser.");

    expect(result.subject).toContain("FAC-2026-0001");
    expect(result.body).toContain("Acompte encaissé : 36,00");
    expect(result.body).toContain("Total déjà réglé : 36,00");
    expect(result.body).toContain("Reste dû : 84,00");
    expect(result.body).toContain("IBAN : FR76 0000 0000 0000");
    expect(result.body).toContain("Merci de régulariser.");
  });
});
