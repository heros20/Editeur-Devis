import {
  ArrowLeft,
  Archive,
  Building2,
  BookOpenCheck,
  Check,
  ChevronRight,
  Clipboard,
  CopyPlus,
  Download,
  Eye,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  History,
  Home,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  Mail,
  PackageCheck,
  Palette,
  Paperclip,
  Plus,
  ReceiptText,
  ShoppingCart,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { applyDocumentStockImpact, creditLines, makeDocumentSnapshot } from "./businessLogic";
import { AccountingView } from "./AccountingView";
import { SuppliersView } from "./SuppliersView";
import { PurchasesView } from "./PurchasesView";
import { applyPurchaseInvoiceStockImpact, purchaseInvoiceExpense, purchaseInvoiceTotals } from "./purchaseInvoices";
import { applyPurchaseOrderStockImpact, renderPurchaseOrderHtml } from "./purchaseOrders";
import { buildAccountingReport, type AccountingPeriod } from "./accounting";
import { buildAccountingXlsx, renderAccountingHtml } from "./accountingExport";
import { createDefaultAppData, normalizeData } from "./defaultData";
import { renderCompanyHtml, renderDocumentHtml } from "./pdf";
import { buildPaymentReminderEmail } from "./reminderEmail";
import { getDevixApi, type DevixDiagnostics } from "./runtimeApi";
import { devixThemes, getTheme, themeCssVariables, type ThemeId } from "./themes";
import {
  completeOAuthRedirect,
  createTeamInvitation,
  deleteCurrentAccount,
  deleteRemoteAttachment,
  deleteSuperadminOrganization,
  deleteTeamInvitation,
  getCurrentSession,
  listTeamInvitations,
  listTeamMembers,
  listSuperadminWorkspaces,
  loadRemoteWorkspace,
  onRemoteAuthStateChange,
  openRemoteAttachment,
  removeTeamMember,
  reserveRemoteCounter,
  saveRemoteWorkspace,
  sendPasswordSetupEmail,
  signInWithGoogle,
  signInWithPassword,
  signOutRemote,
  signUpWithPassword,
  updateTeamMemberRole,
  updateCurrentUserPassword,
  uploadRemoteAttachment,
  type InviteRole,
  type TeamInvitation,
  type TeamMember,
  type SuperadminWorkspace,
  type WorkspaceContext,
  type WorkspaceRole,
} from "./supabaseStore";
import type {
  AppData,
  BusinessExpense,
  BusinessDocument,
  CatalogItem,
  Client,
  CompanySettings,
  DocumentAttachment,
  DocumentHistoryEntry,
  DocumentStatus,
  DocumentType,
  LineItem,
  PaymentEntry,
  PaymentMethod,
  PaymentReminder,
  PurchaseInvoice,
  PurchaseOrder,
  StockMovement,
  Supplier,
} from "./types";
import {
  addDaysIso,
  clientLabel,
  currency,
  duplicateLines,
  formatBusinessNumber,
  labels,
  lineMargin,
  makeId,
  paymentMethodLabels,
  paymentSummary,
  sanitizeFileName,
  statusLabels,
  statusTone,
  todayIso,
  totals,
  withPaymentStatus,
} from "./utils";

type View =
  | "dashboard"
  | "documents"
  | "documentDetail"
  | "accounting"
  | "purchases"
  | "suppliers"
  | "catalog"
  | "clients"
  | "company"
  | "archives"
  | "superadmin"
  | "settings";
type AuthMode = "signin" | "signup";
type ReminderDraft = Pick<PaymentReminder, "sentAt" | "channel" | "note">;
type ReminderSendResult = { success: boolean; message: string };
type DocumentSaveState = "saved" | "dirty" | "saving" | "error";
type DocumentStatusFilter = "all" | DocumentStatus;
type ClientListFilter = "all" | Client["type"] | "due" | "withDocuments";
type TypedConfirmationState = {
  title: string;
  message: string;
  expected: string;
  value: string;
};
type ChoiceConfirmationState = {
  title: string;
  message: string;
};

const roleLabels: Record<WorkspaceRole, string> = {
  superadmin: "Superadmin",
  owner: "Propriétaire",
  admin: "Admin",
  editor: "Édition",
  viewer: "Lecture",
};

const inviteRoleOptions: InviteRole[] = ["admin", "editor", "viewer"];

function normalizeSearch(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function confirmDestructiveAction(message: string) {
  return window.confirm(`${message}\n\nConfirmez-vous cette action ?`);
}

function formatPhoneNumber(value = "") {
  return value
    .replace(/\D/g, "")
    .slice(0, 10)
    .replace(/(\d{2})(?=\d)/g, "$1 ");
}

function clientSearchText(client: Client) {
  return normalizeSearch(
    [client.number, client.type, client.name, client.email, client.phone, client.address, client.postalCode, client.city, client.notes]
      .filter(Boolean)
      .join(" ")
  );
}

function activityDate(doc: BusinessDocument) {
  return doc.updatedAt || doc.issueDate || doc.createdAt || "";
}

function documentDisplayDate(doc: BusinessDocument) {
  return doc.issueDate || activityDate(doc);
}

function dateMonthKey(date: string) {
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "unknown";
}

function dateMonthLabel(key: string) {
  if (key === "unknown") return "Date inconnue";
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function formatShortDate(date: string) {
  if (!date) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));
}

function fileSizeLabel(size: number) {
  if (!size) return "Taille inconnue";
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function isArchived(item: { archivedYear?: number; archivedAt?: string }) {
  return Boolean(item.archivedYear || item.archivedAt);
}

function documentYear(doc: BusinessDocument) {
  return Number((doc.issueDate || doc.createdAt || "").slice(0, 4));
}

function expenseYear(expense: BusinessExpense) {
  return Number((expense.date || expense.createdAt || "").slice(0, 4));
}

function purchaseInvoiceYear(invoice: PurchaseInvoice) {
  return Number((invoice.invoiceDate || invoice.createdAt || "").slice(0, 4));
}

function purchaseOrderYear(order: PurchaseOrder) {
  return Number((order.orderDate || order.createdAt || "").slice(0, 4));
}

function archiveYears(data: AppData) {
  return [
    ...data.documents.map((doc) => doc.archivedYear),
    ...data.expenses.map((expense) => expense.archivedYear),
    ...data.purchaseInvoices.map((invoice) => invoice.archivedYear),
    ...data.purchaseOrders.map((order) => order.archivedYear),
  ]
    .filter((year): year is number => Number.isFinite(year))
    .sort((a, b) => b - a);
}

function dataForArchiveYear(data: AppData, year: number): AppData {
  return normalizeData({
    ...data,
    documents: data.documents.filter((doc) => doc.archivedYear === year),
    expenses: data.expenses.filter((expense) => expense.archivedYear === year),
    purchaseInvoices: data.purchaseInvoices.filter((invoice) => invoice.archivedYear === year),
    purchaseOrders: data.purchaseOrders.filter((order) => order.archivedYear === year),
  });
}

function requiredDiscountForMargin(line: LineItem, targetMargin: number) {
  const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
  const purchaseTotal = (Number(line.quantity) || 0) * (Number(line.purchasePrice) || 0);
  const targetRate = targetMargin / 100;
  if (!gross || !purchaseTotal || targetRate >= 1) return null;
  const requiredTotal = purchaseTotal / (1 - targetRate);
  return (1 - requiredTotal / gross) * 100;
}

const emptyLine = (vatRate = 20): LineItem => ({
  id: makeId("line"),
  description: "",
  details: "",
  unit: "",
  quantity: 1,
  unitPrice: 0,
  purchasePrice: 0,
  vatRate,
  discount: 0,
});

const emptyCatalogItem = (vatRate = 20): CatalogItem => ({
  id: makeId("catalog"),
  name: "",
  unit: "",
  price: 0,
  purchasePrice: 0,
  vatRate,
  category: "",
  trackStock: false,
  stockQuantity: 0,
  stockMinimum: 0,
  stockUnit: "",
  supplier: "",
  supplierId: undefined,
  location: "",
  stockMovements: [],
});

export function App() {
  const [api] = useState(() => getDevixApi());
  const [data, setData] = useState<AppData>(() => createDefaultAppData());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState("");
  const [documentBackView, setDocumentBackView] = useState<"documents" | "clients" | "archives">("documents");
  const [query, setQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientListFilter, setClientListFilter] = useState<ClientListFilter>("all");
  const [draftClient, setDraftClient] = useState<Client | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "all">("all");
  const [documentStatusFilter, setDocumentStatusFilter] = useState<DocumentStatusFilter>("all");
  const [documentMonthFilter, setDocumentMonthFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [superadminWorkspaces, setSuperadminWorkspaces] = useState<SuperadminWorkspace[]>([]);
  const [selectedSuperadminOrganizationId, setSelectedSuperadminOrganizationId] = useState("");
  const [superadminBusy, setSuperadminBusy] = useState(false);
  const [superadminError, setSuperadminError] = useState("");
  const [archiveYearSelection, setArchiveYearSelection] = useState(new Date().getFullYear() - 1);
  const [selectedArchiveYear, setSelectedArchiveYear] = useState<number | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("editor");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [documentSaveState, setDocumentSaveState] = useState<DocumentSaveState>("saved");
  const [typedConfirmation, setTypedConfirmation] = useState<TypedConfirmationState | null>(null);
  const typedConfirmationResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const [choiceConfirmation, setChoiceConfirmation] = useState<ChoiceConfirmationState | null>(null);
  const choiceConfirmationResolver = useRef<((confirmed: boolean) => void) | null>(null);

  useEffect(() => {
    if (documentSaveState !== "dirty" && documentSaveState !== "error") return;
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [documentSaveState]);

  function userFacingError(error: unknown, fallback: string) {
    const raw = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
    const message = raw.toLowerCase();
    if (message.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
    if (message.includes("email not confirmed")) return "Confirmez votre email avant de vous connecter.";
    if (message.includes("configuration supabase absente")) return raw;
    if (message.includes("existe deja") || message.includes("already registered") || message.includes("already exists")) {
      return "Un compte existe deja avec cette adresse email. Connectez-vous ou utilisez mot de passe oublie.";
    }
    if (message.includes("provider") || message.includes("oauth")) return "Connexion Google pas encore active.";
    if (message.includes("failed to fetch") || message.includes("network")) return "Connexion internet indisponible.";
    if (raw && !message.includes("supabase")) return raw;
    return fallback;
  }

  function requestTypedConfirmation(title: string, message: string, expected: string) {
    typedConfirmationResolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      typedConfirmationResolver.current = resolve;
      setTypedConfirmation({ title, message, expected, value: "" });
    });
  }

  function closeTypedConfirmation(confirmed: boolean) {
    const accepted = Boolean(confirmed && typedConfirmation?.value === typedConfirmation?.expected);
    typedConfirmationResolver.current?.(accepted);
    typedConfirmationResolver.current = null;
    setTypedConfirmation(null);
  }

  function requestChoiceConfirmation(title: string, message: string) {
    choiceConfirmationResolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      choiceConfirmationResolver.current = resolve;
      setChoiceConfirmation({ title, message });
    });
  }

  function closeChoiceConfirmation(confirmed: boolean) {
    choiceConfirmationResolver.current?.(confirmed);
    choiceConfirmationResolver.current = null;
    setChoiceConfirmation(null);
  }

  useEffect(() => {
    let active = true;

    async function loadLocalStore(message = "") {
      try {
        const local = await api.loadStore();
        if (!active) return;
        setWorkspace(null);
        setData(normalizeData(local));
        setLoadError(message);
      } catch (error) {
        console.error("Impossible de charger les données locales", error);
        if (!active) return;
        setWorkspace(null);
        setData(createDefaultAppData());
        setLoadError("Données locales indisponibles.");
      } finally {
        if (active) setLoaded(true);
      }
    }

    async function loadWorkspace(nextSession: Session | null) {
      if (!nextSession) {
        await loadLocalStore("");
        return;
      }

      setLoaded(false);
      try {
        const remote = await loadRemoteWorkspace();
        if (!active) return;
        setWorkspace(remote.context);
        setData(normalizeData(remote.data));
        setLoadError("");
      } catch (error) {
        console.error("Impossible de charger les données", error);
        if (!active) return;
        await loadLocalStore("Données distantes indisponibles. Mode local actif.");
        return;
      }
      if (active) setLoaded(true);
    }

    completeOAuthRedirect()
      .then((redirectSession) => redirectSession || getCurrentSession())
      .then((currentSession) => loadWorkspace(currentSession))
      .catch((error) => {
        console.error("Session indisponible", error);
        if (!active) return;
        void loadLocalStore("Connexion distante indisponible. Mode local actif.");
      });

    const unsubscribe = onRemoteAuthStateChange((nextSession) => {
      if (!active) return;
      void loadWorkspace(nextSession);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  async function persist(next: AppData, message = "Enregistré", showSuccessNotice = true) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return false;
    }
    const previous = data;
    const normalized = normalizeData(next);
    setData(normalized);
    try {
      if (workspace) {
        const nextWorkspace = await saveRemoteWorkspace(workspace, normalized);
        setWorkspace(nextWorkspace);
      } else {
        await api.saveStore(normalized);
      }
      setDocumentSaveState("saved");
      if (showSuccessNotice) setNotice(message);
      return true;
    } catch (error) {
      console.error("Impossible d'enregistrer les données", error);
      setData(previous);
      setNotice(userFacingError(error, "Sauvegarde indisponible"));
      return false;
    } finally {
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  async function reserveNumber(type: DocumentType | "client", source: AppData) {
    let count = source.counters[type] || 1;
    if (workspace) {
      try {
        count = await reserveRemoteCounter(workspace, type);
      } catch (error) {
        console.warn("Numérotation distante indisponible, compteur local utilisé", error);
      }
    }
    const number = formatBusinessNumber(type, count);
    return {
      number,
      data: {
        ...source,
        counters: {
          ...source.counters,
          [type]: Math.max(source.counters[type] || 1, count + 1),
        },
      },
    };
  }

  function buildClient(number: string, name = "Client à renseigner"): Client {
    return {
      id: makeId("client"),
      number,
      type: "particulier",
      name,
      contact: "",
      email: "",
      phone: "",
      address: "",
      postalCode: "",
      city: "",
      notes: "",
      createdAt: new Date().toISOString(),
    };
  }

  async function ensureClient(source: AppData) {
    const existing = source.clients[0];
    if (existing) return { data: source, clientId: existing.id };
    const reserved = await reserveNumber("client", source);
    const client = buildClient(reserved.number);
    return {
      data: { ...reserved.data, clients: [client, ...reserved.data.clients] },
      clientId: client.id,
    };
  }

  function attachmentKey(attachment: DocumentAttachment) {
    return attachment.storagePath || attachment.filePath || attachment.id;
  }

  function restoreDocumentFromHistory(doc: BusinessDocument, entry: DocumentHistoryEntry): BusinessDocument {
    return {
      id: doc.id,
      originId: doc.originId,
      ...entry.snapshot,
      lines: duplicateLines(entry.snapshot.lines),
      attachments: [...(entry.snapshot.attachments || [])],
      history: doc.history.slice(0, -1),
      updatedAt: new Date().toISOString(),
    };
  }

  async function deleteAttachmentsExcept(doc: BusinessDocument, preservedAttachments: DocumentAttachment[]) {
    const preserved = new Set(preservedAttachments.map(attachmentKey));
    await Promise.all(
      (doc.attachments || [])
        .filter((attachment) => !preserved.has(attachmentKey(attachment)))
        .map((attachment) =>
          workspace
            ? deleteRemoteAttachment(attachment).catch(() => undefined)
            : api.deleteAttachment(attachment).catch(() => ({ deleted: false }))
        )
    );
  }

  function companyText(company: CompanySettings) {
    return [
      company.name,
      company.legalName,
      `SIRET : ${company.siret || "à renseigner"}`,
      `TVA : ${company.vatNumber || "à renseigner"}`,
      `${company.address}\n${company.postalCode} ${company.city}`.trim(),
      `Téléphone : ${company.phone}`,
      `Email: ${company.email}`,
      company.website ? `Site: ${company.website}` : "",
      `IBAN : ${company.iban || "à renseigner"}`,
      `BIC : ${company.bic || "à renseigner"}`,
      `Conditions : ${company.paymentTerms}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function searchableText(doc: BusinessDocument, client?: Client) {
    return [
      labels[doc.type],
      doc.number,
      doc.status,
      statusLabels[doc.status],
      doc.projectName,
      doc.siteAddress,
      clientLabel(client),
      client?.email,
      client?.phone,
      data.company.name,
      data.company.legalName,
      data.company.siret,
      data.company.email,
      ...doc.lines.flatMap((line) => [line.description, line.details, line.unit, String(line.unitPrice)]),
      ...doc.attachments.map((attachment) => attachment.name),
      ...doc.history.flatMap((entry) => [
        entry.fromNumber,
        entry.toNumber,
        labels[entry.fromType],
        labels[entry.toType],
        entry.snapshot.projectName,
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  const activeDocuments = useMemo(() => data.documents.filter((doc) => !isArchived(doc)), [data.documents]);
  const activeExpenses = useMemo(() => data.expenses.filter((expense) => !isArchived(expense)), [data.expenses]);
  const activePurchaseInvoices = useMemo(() => data.purchaseInvoices.filter((invoice) => !isArchived(invoice)), [data.purchaseInvoices]);
  const activePurchaseOrders = useMemo(() => data.purchaseOrders.filter((order) => !isArchived(order)), [data.purchaseOrders]);
  const archivedYears = useMemo(() => [...new Set(archiveYears(data))], [data]);
  const archivePreviewData = useMemo(
    () => (selectedArchiveYear ? dataForArchiveYear(data, selectedArchiveYear) : null),
    [data, selectedArchiveYear]
  );
  const selectedSuperadminWorkspace = useMemo(
    () => superadminWorkspaces.find((entry) => entry.organizationId === selectedSuperadminOrganizationId) || null,
    [selectedSuperadminOrganizationId, superadminWorkspaces]
  );
  const sortedClients = useMemo(() => [...data.clients].sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "fr")), [data.clients]);
  const sortedDocuments = useMemo(
    () =>
      [...activeDocuments].sort((a, b) => {
        const clientA = clientLabel(data.clients.find((client) => client.id === a.clientId));
        const clientB = clientLabel(data.clients.find((client) => client.id === b.clientId));
        return clientA.localeCompare(clientB, "fr") || b.updatedAt.localeCompare(a.updatedAt) || b.number.localeCompare(a.number);
      }),
    [activeDocuments, data.clients]
  );
  const recentDocuments = useMemo(
    () => [...activeDocuments].sort((a, b) => activityDate(b).localeCompare(activityDate(a)) || b.number.localeCompare(a.number)),
    [activeDocuments]
  );
  const clientStatsById = useMemo(() => {
    const stats = new Map<string, { documents: number; totalTtc: number; due: number; lastActivity: string }>();
    for (const client of data.clients) {
      stats.set(client.id, { documents: 0, totalTtc: 0, due: 0, lastActivity: "" });
    }
    for (const doc of activeDocuments) {
      const current = stats.get(doc.clientId) || { documents: 0, totalTtc: 0, due: 0, lastActivity: "" };
      const value = totals(doc.lines).totalTtc;
      stats.set(doc.clientId, {
        documents: current.documents + 1,
        totalTtc: current.totalTtc + value,
        due: current.due + (doc.type === "invoice" ? paymentSummary(doc, value).remainingAmount : 0),
        lastActivity: activityDate(doc) > current.lastActivity ? activityDate(doc) : current.lastActivity,
      });
    }
    return stats;
  }, [activeDocuments, data.clients]);
  const filteredClients = useMemo(() => {
    const terms = normalizeSearch(clientQuery).split(/\s+/).filter(Boolean);
    return sortedClients
      .filter((client) => {
        const stats = clientStatsById.get(client.id);
        if (clientListFilter === "professionnel" || clientListFilter === "particulier") return client.type === clientListFilter;
        if (clientListFilter === "due") return Boolean(stats && stats.due > 0);
        if (clientListFilter === "withDocuments") return Boolean(stats && stats.documents > 0);
        return true;
      })
      .filter((client) => !terms.length || terms.every((term) => clientSearchText(client).includes(term)));
  }, [clientListFilter, clientQuery, clientStatsById, sortedClients]);
  const clientFilterCounts = useMemo(
    () => ({
      all: sortedClients.length,
      professionnel: sortedClients.filter((client) => client.type === "professionnel").length,
      particulier: sortedClients.filter((client) => client.type === "particulier").length,
      due: sortedClients.filter((client) => (clientStatsById.get(client.id)?.due || 0) > 0).length,
      withDocuments: sortedClients.filter((client) => (clientStatsById.get(client.id)?.documents || 0) > 0).length,
    }),
    [clientStatsById, sortedClients]
  );
  const sortedCatalog = useMemo(
    () => [...data.catalog].sort((a, b) => `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`, "fr")),
    [data.catalog]
  );
  const selectedDoc = useMemo(() => data.documents.find((doc) => doc.id === selectedId), [data.documents, selectedId]);
  const selectedClient = useMemo(() => data.clients.find((client) => client.id === selectedDoc?.clientId), [data.clients, selectedDoc]);
  const selectedClientForEdit = useMemo(
    () => (draftClient?.id === selectedClientId ? draftClient : data.clients.find((client) => client.id === selectedClientId)),
    [data.clients, draftClient, selectedClientId]
  );
  const selectedClientDocuments = useMemo(
    () => (draftClient?.id === selectedClientId ? [] : sortedDocuments.filter((doc) => doc.clientId === selectedClientId)),
    [draftClient, selectedClientId, sortedDocuments]
  );
  const canSuperadmin = workspace?.role === "superadmin";
  const canManageTeam = workspace?.role === "owner" || workspace?.role === "admin" || canSuperadmin;
  const canManageCompany = !workspace || workspace.role === "owner" || workspace.role === "admin" || canSuperadmin;
  const canManageCatalog = canManageCompany;
  const canEditOperations = !workspace || workspace.role === "owner" || workspace.role === "admin" || workspace.role === "editor" || canSuperadmin;
  const canViewCompanySettings = canManageCompany || workspace?.role === "editor";
  const canDeleteClients = !workspace || workspace.role === "owner" || workspace.role === "admin" || canSuperadmin;

  function isLockedBillingDocument(doc?: BusinessDocument | null) {
    return doc?.type === "invoice" || doc?.type === "creditNote" || doc?.type === "returnInvoice";
  }

  function canModifyDocument(doc?: BusinessDocument | null) {
    return Boolean(canEditOperations && doc && !isArchived(doc) && !isLockedBillingDocument(doc));
  }

  function canConvertDocument(doc: BusinessDocument, type: DocumentType) {
    if (!canEditOperations || isArchived(doc) || doc.type === type) return false;
    if (doc.type === "quote") return type === "order";
    if (doc.type === "order") return type === "invoice";
    if (doc.type === "invoice") {
      if (type === "creditNote") return true;
      if (type === "returnInvoice") return canManageCatalog;
    }
    return false;
  }

  function stockBlockingMessage(doc: BusinessDocument, targetType: DocumentType) {
    if (targetType !== "order" && targetType !== "invoice") return "";

    const requiredByItem = doc.lines.reduce<Record<string, number>>((acc, line) => {
      if (!line.catalogItemId) return acc;
      const quantity = Number(line.quantity) || 0;
      if (quantity <= 0) return acc;
      acc[line.catalogItemId] = (acc[line.catalogItemId] || 0) + quantity;
      return acc;
    }, {});

    const blocked = Object.entries(requiredByItem)
      .map(([itemId, required]) => {
        const item = data.catalog.find((catalogItem) => catalogItem.id === itemId);
        if (!item?.trackStock) return null;
        const available = Number(item.stockQuantity) || 0;
        return available < required ? { name: item.name || "Article", available, required, unit: item.stockUnit || item.unit } : null;
      })
      .filter(Boolean);

    if (!blocked.length) return "";
    const details = blocked
      .slice(0, 3)
      .map((item) => `${item!.name} (${item!.available} disponible${item!.unit ? ` ${item!.unit}` : ""}, ${item!.required} requis)`)
      .join(", ");
    const suffix = blocked.length > 3 ? `, +${blocked.length - 3} autre(s)` : "";
    return `Stock insuffisant pour transformer ce document : ${details}${suffix}.`;
  }

  function showPermissionNotice(message = "Action réservée aux administrateurs.") {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  useEffect(() => {
    if (view !== "clients") return;
    if (draftClient?.id === selectedClientId) return;
    if (!filteredClients.length) {
      if (selectedClientId) setSelectedClientId("");
      return;
    }
    if (!filteredClients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(filteredClients[0].id);
    }
  }, [draftClient, filteredClients, selectedClientId, view]);

  useEffect(() => {
    if (view === "catalog" && !canManageCatalog) setView("documents");
    if (view === "company" && !canViewCompanySettings) setView("settings");
    if (view === "superadmin" && !canSuperadmin) setView("dashboard");
  }, [canManageCatalog, canSuperadmin, canViewCompanySettings, view]);

  async function refreshTeam() {
    if (!workspace) {
      setTeamMembers([]);
      setTeamInvitations([]);
      return;
    }
    setTeamBusy(true);
    try {
      const [members, invitations] = await Promise.all([
        listTeamMembers(workspace),
        canManageTeam ? listTeamInvitations(workspace) : Promise.resolve([]),
      ]);
      setTeamMembers(members);
      setTeamInvitations(invitations);
    } catch (error) {
      console.error("Gestion equipe indisponible", error);
      setNotice(error instanceof Error ? error.message : "Gestion equipe indisponible");
      window.setTimeout(() => setNotice(""), 2200);
    } finally {
      setTeamBusy(false);
    }
  }

  useEffect(() => {
    if (view !== "settings" || !workspace) return;
    void refreshTeam();
  }, [view, workspace?.organizationId, workspace?.role]);

  async function refreshSuperadminWorkspaces() {
    if (!canSuperadmin) {
      setSuperadminWorkspaces([]);
      setSelectedSuperadminOrganizationId("");
      return;
    }
    setSuperadminBusy(true);
    setSuperadminError("");
    try {
      const workspaces = await listSuperadminWorkspaces();
      setSuperadminWorkspaces(workspaces);
      setSelectedSuperadminOrganizationId((current) =>
        current && workspaces.some((entry) => entry.organizationId === current) ? current : workspaces[0]?.organizationId || ""
      );
    } catch (error) {
      console.error("Superadmin indisponible", error);
      setSuperadminError(error instanceof Error ? error.message : "Accès superadmin indisponible");
    } finally {
      setSuperadminBusy(false);
    }
  }

  useEffect(() => {
    if (view !== "superadmin" || !canSuperadmin) return;
    void refreshSuperadminWorkspaces();
  }, [canSuperadmin, view]);

  async function deleteSuperadminWorkspace(target: SuperadminWorkspace) {
    if (!canSuperadmin || superadminBusy) {
      showPermissionNotice("Accès superadmin requis.");
      return;
    }
    const expected = `SUPPRIMER ${target.organizationName}`;
    const currentWorkspaceDeleted = workspace?.organizationId === target.organizationId;
    if (
      !confirmDestructiveAction(
        `Supprimer définitivement l'entreprise « ${target.organizationName} » ? Tous ses documents, comptes, achats et accès seront supprimés.`
      )
    ) {
      return;
    }
    const confirmed = await requestTypedConfirmation(
      "Confirmer la suppression",
      `Dernière vérification : tapez exactement « ${expected} » pour confirmer.`,
      expected
    );
    if (!confirmed) {
      const message = "Suppression annulée : confirmation incorrecte.";
      setSuperadminError(message);
      showPermissionNotice(message);
      return;
    }

    setSuperadminBusy(true);
    setSuperadminError("");
    try {
      await deleteSuperadminOrganization(target.organizationId);
      setNotice(`Entreprise « ${target.organizationName} » supprimée`);
      if (currentWorkspaceDeleted) {
        const remote = await loadRemoteWorkspace();
        setWorkspace(remote.context);
        setData(normalizeData(remote.data));
        setSelectedSuperadminOrganizationId("");
        setDraftClient(null);
        setView("dashboard");
      } else {
        await refreshSuperadminWorkspaces();
      }
    } catch (error) {
      console.error("Suppression superadmin impossible", error);
      setSuperadminError(error instanceof Error ? error.message : "Suppression impossible");
      setNotice(userFacingError(error, "Suppression impossible"));
    } finally {
      setSuperadminBusy(false);
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = authEmail.trim();
    const password = authPassword.trim();
    if (!email || !password) {
      setAuthMessage("Email et mot de passe requis.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const nextSession = authMode === "signin" ? await signInWithPassword(email, password) : await signUpWithPassword(email, password);
      if (!nextSession) {
        setAuthMessage("Compte créé. Vérifiez votre boîte mail pour confirmer l'inscription.");
      } else {
        const remote = await loadRemoteWorkspace();
        setWorkspace(remote.context);
        setData(normalizeData(remote.data));
        setLoadError("");
        setAuthPassword("");
        setDraftClient(null);
        setView("dashboard");
      }
    } catch (error) {
      console.error("Connexion impossible", error);
      setAuthMessage(userFacingError(error, "Connexion impossible."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitGoogleAuth() {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInWithGoogle();
      setAuthMessage("Terminez la connexion dans le navigateur puis revenez dans Devix.");
      setAuthBusy(false);
    } catch (error) {
      console.error("Connexion Google impossible", error);
      setAuthMessage(userFacingError(error, "Connexion Google impossible."));
      setAuthBusy(false);
    }
  }

  async function requestPasswordSetup() {
    const email = authEmail.trim();
    if (!email) {
      setAuthMessage("Indiquez votre email pour recevoir le lien.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await sendPasswordSetupEmail(email);
      setAuthMessage("Email envoyé. Ouvrez le lien reçu pour définir votre mot de passe.");
    } catch (error) {
      console.error("Envoi du lien mot de passe impossible", error);
      setAuthMessage(userFacingError(error, "Envoi du lien impossible."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitAccountPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountPassword !== accountPasswordConfirm) {
      setNotice("Les mots de passe ne correspondent pas");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
    setAccountBusy(true);
    try {
      await updateCurrentUserPassword(accountPassword);
      setAccountPassword("");
      setAccountPasswordConfirm("");
      setNotice("Mot de passe mis à jour");
    } catch (error) {
      console.error("Mise à jour mot de passe impossible", error);
      setNotice(userFacingError(error, "Mot de passe impossible à modifier"));
    } finally {
      setAccountBusy(false);
      window.setTimeout(() => setNotice(""), 2200);
    }
  }

  async function deleteAccount() {
    setAccountBusy(true);
    try {
      await deleteCurrentAccount();
      const local = await api.loadStore().catch(() => createDefaultAppData());
      setWorkspace(null);
      setData(normalizeData(local));
      setSelectedId("");
      setTeamMembers([]);
      setTeamInvitations([]);
      setInviteEmail("");
      setDraftClient(null);
      setView("dashboard");
      setNotice("Compte supprimé");
    } catch (error) {
      console.error("Suppression du compte impossible", error);
      setNotice(userFacingError(error, "Compte impossible à supprimer"));
    } finally {
      setAccountBusy(false);
      window.setTimeout(() => setNotice(""), 2200);
    }
  }

  async function signOut() {
    try {
      await signOutRemote();
      const local = await api.loadStore().catch(() => createDefaultAppData());
      setWorkspace(null);
      setData(normalizeData(local));
      setSelectedId("");
      setTeamMembers([]);
      setTeamInvitations([]);
      setInviteEmail("");
      setDraftClient(null);
      setView("dashboard");
    } catch (error) {
      console.error("Déconnexion impossible", error);
      setNotice("Déconnexion indisponible");
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !canManageTeam || teamBusy) return;
    setTeamBusy(true);
    try {
      const invitation = await createTeamInvitation(workspace, inviteEmail, inviteRole);
      setInviteEmail("");
      setNotice(`Invitation envoyée à ${invitation.email}`);
      await refreshTeam();
    } catch (error) {
      console.error("Invitation impossible", error);
      setNotice(userFacingError(error, "Invitation impossible"));
    } finally {
      setTeamBusy(false);
      window.setTimeout(() => setNotice(""), 2400);
    }
  }

  async function revokeInvitation(invitation: TeamInvitation) {
    if (!workspace || !canManageTeam || teamBusy) return;
    if (!confirmDestructiveAction(`Supprimer l'invitation envoyée à ${invitation.email} ?`)) return;
    setTeamBusy(true);
    try {
      await deleteTeamInvitation(workspace, invitation.id);
      await refreshTeam();
      setNotice("Invitation supprimée");
    } catch (error) {
      console.error("Suppression invitation impossible", error);
      setNotice(userFacingError(error, "Suppression impossible"));
    } finally {
      setTeamBusy(false);
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  async function changeMemberRole(member: TeamMember, role: InviteRole) {
    if (!workspace || !canManageTeam || teamBusy || member.role === "owner" || member.isCurrentUser) return;
    setTeamBusy(true);
    try {
      await updateTeamMemberRole(workspace, member.id, role);
      await refreshTeam();
      setNotice("Droits mis à jour");
    } catch (error) {
      console.error("Modification droits impossible", error);
      setNotice(userFacingError(error, "Modification impossible"));
    } finally {
      setTeamBusy(false);
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  async function deleteMember(member: TeamMember) {
    if (!workspace || !canManageTeam || teamBusy || member.role === "owner" || member.isCurrentUser) return;
    if (!confirmDestructiveAction(`Retirer ${member.email || "ce membre"} de l'entreprise ?`)) return;
    setTeamBusy(true);
    try {
      await removeTeamMember(workspace, member.id);
      await refreshTeam();
      setNotice("Employé retiré");
    } catch (error) {
      console.error("Retrait employé impossible", error);
      setNotice(userFacingError(error, "Retrait impossible"));
    } finally {
      setTeamBusy(false);
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  function openDocument(id: string, from: "documents" | "clients" | "archives" = "documents") {
    setSelectedId(id);
    setDocumentBackView(from);
    setView("documentDetail");
  }

  function pageTitle() {
    if (view === "dashboard") return "Pilotage commercial";
    if (view === "documents") return "Devis, BC et factures";
    if (view === "documentDetail" && selectedDoc) return `${labels[selectedDoc.type]} ${selectedDoc.number}`;
    if (view === "documentDetail") return "Document";
    if (view === "catalog") return "Catalogue";
    if (view === "accounting") return "Livre de comptes";
    if (view === "purchases") return "Achats fournisseurs";
    if (view === "suppliers") return "Fournisseurs";
    if (view === "clients") return "Dossiers clients";
    if (view === "company") return "Informations société";
    if (view === "archives") return "Archives annuelles";
    if (view === "superadmin") return "Superadmin";
    return "Paramètres";
  }

  const documentMonthOptions = useMemo(() => {
    const keys = Array.from(new Set(activeDocuments.map((doc) => dateMonthKey(documentDisplayDate(doc))))).sort((a, b) =>
      b.localeCompare(a)
    );
    return keys.map((key) => ({ key, label: dateMonthLabel(key) }));
  }, [activeDocuments]);
  const filteredDocuments = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return [...activeDocuments]
      .sort((a, b) => documentDisplayDate(b).localeCompare(documentDisplayDate(a)) || b.number.localeCompare(a.number))
      .filter((doc) => typeFilter === "all" || doc.type === typeFilter)
      .filter((doc) => documentStatusFilter === "all" || doc.status === documentStatusFilter)
      .filter((doc) => documentMonthFilter === "all" || dateMonthKey(documentDisplayDate(doc)) === documentMonthFilter)
      .filter((doc) => {
        if (!terms.length) return true;
        const client = data.clients.find((item) => item.id === doc.clientId);
        return terms.every((term) => searchableText(doc, client).includes(term));
      });
  }, [activeDocuments, data.clients, documentMonthFilter, documentStatusFilter, query, typeFilter]);
  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, BusinessDocument[]>();
    for (const doc of filteredDocuments) {
      const key = dateMonthKey(documentDisplayDate(doc));
      groups.set(key, [...(groups.get(key) || []), doc]);
    }
    return Array.from(groups.entries()).map(([key, docs]) => {
      const total = docs.reduce((sum, doc) => sum + totals(doc.lines).totalTtc, 0);
      return { key, label: dateMonthLabel(key), docs, total };
    });
  }, [filteredDocuments]);
  const documentStatusCounts = useMemo(
    () => ({
      all: activeDocuments.length,
      draft: activeDocuments.filter((doc) => doc.status === "draft").length,
      partial: activeDocuments.filter((doc) => doc.status === "partial").length,
      paid: activeDocuments.filter((doc) => doc.status === "paid").length,
    }),
    [activeDocuments]
  );

  if (!loaded) {
    return <main className="loading">Chargement de Devix...</main>;
  }

  const dashboardTotals = activeDocuments.reduce(
    (acc, doc) => {
      const value = totals(doc.lines).totalTtc;
      const paidAmount = doc.type === "invoice" ? paymentSummary(doc, value).paidAmount : 0;
      if (doc.type === "quote") acc.quotes += value;
      if (doc.type === "order") acc.orders += value;
      if (doc.type === "invoice") acc.invoices += value;
      acc.paid += paidAmount;
      return acc;
    },
    { quotes: 0, orders: 0, invoices: 0, paid: 0 }
  );
  const statusCounts = activeDocuments.reduce<Record<DocumentStatus, number>>(
    (acc, doc) => ({ ...acc, [doc.status]: acc[doc.status] + 1 }),
    { draft: 0, partial: 0, paid: 0 }
  );
  const pendingValue = activeDocuments
    .filter((doc) => doc.type === "invoice" && doc.status !== "paid")
    .reduce((sum, doc) => {
      const value = totals(doc.lines).totalTtc;
      return sum + paymentSummary(doc, value).remainingAmount;
    }, 0);
  const dueDocuments = activeDocuments
    .filter((doc) => doc.type === "invoice" && doc.dueDate && doc.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  async function createClient() {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return;
    }
    const client = buildClient(formatBusinessNumber("client", data.counters.client || 1), "Nouveau client");
    setDraftClient(client);
    setSelectedClientId(client.id);
    setView("clients");
  }

  async function createDocument(type: DocumentType = "quote", clientId?: string) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return;
    }
    const withClient = clientId && data.clients.some((client) => client.id === clientId) ? { data, clientId } : await ensureClient(data);
    const reserved = await reserveNumber(type, withClient.data);
    const issueDate = todayIso();
    const doc: BusinessDocument = {
      id: makeId("doc"),
      type,
      number: reserved.number,
      status: "draft",
      clientId: withClient.clientId,
      issueDate,
      dueDate: addDaysIso(issueDate, type === "quote" ? reserved.data.company.quoteValidityDays : 30),
      projectName: "",
      siteAddress: "",
      workStart: "",
      workDuration: "",
      depositRate: reserved.data.company.defaultDepositRate,
      notes: reserved.data.company.notes,
      terms: reserved.data.company.paymentTerms,
      lines: [],
      attachments: [],
      depositPaidAmount: 0,
      depositPaidAt: "",
      payments: [],
      paymentNotes: "",
      reminders: [],
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await persist({ ...reserved.data, documents: [doc, ...reserved.data.documents] }, `${labels[type]} créé`);
    setSelectedId(doc.id);
    setSelectedClientId(withClient.clientId);
    setDocumentBackView(clientId ? "clients" : "documents");
    setView("documentDetail");
  }

  async function convertDocument(source: BusinessDocument, type: DocumentType) {
    if (!canConvertDocument(source, type)) {
      showPermissionNotice(
        isLockedBillingDocument(source) ? "Ce document de facturation est verrouillé." : "Votre accès est en lecture seule."
      );
      return;
    }
    const stockMessage = stockBlockingMessage(source, type);
    if (stockMessage) {
      showPermissionNotice(stockMessage);
      return;
    }
    const reserved = await reserveNumber(type, data);
    const issueDate = todayIso();
    const transformed: BusinessDocument = {
      ...source,
      type,
      number: reserved.number,
      status: "draft",
      issueDate,
      dueDate: addDaysIso(issueDate, 30),
      lines: type === "creditNote" || type === "returnInvoice" ? creditLines(source.lines) : source.lines,
      depositPaidAmount: 0,
      depositPaidAt: "",
      payments: [],
      paymentNotes: "",
      reminders: [],
      history: [
        ...(source.history || []),
        {
          id: makeId("history"),
          transformedAt: new Date().toISOString(),
          fromType: source.type,
          fromNumber: source.number,
          toType: type,
          toNumber: reserved.number,
          snapshot: makeDocumentSnapshot(source),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    const nextCatalog =
      type === "invoice"
        ? applyDocumentStockImpact(reserved.data.catalog, transformed, "invoice")
        : type === "returnInvoice"
          ? applyDocumentStockImpact(reserved.data.catalog, transformed, "return")
          : reserved.data.catalog;
    await persist(
      {
        ...reserved.data,
        catalog: nextCatalog,
        documents: reserved.data.documents.map((doc) => (doc.id === source.id ? transformed : doc)),
      },
      `${labels[source.type]} transforme en ${labels[type]}`
    );
    setSelectedId(transformed.id);
  }

  async function updateDocument(doc: BusinessDocument) {
    if (!canModifyDocument(doc)) {
      showPermissionNotice(
        isLockedBillingDocument(doc)
          ? "Ce document de facturation est verrouillé. Revenez au document précédent pour le modifier."
          : "Votre accès est en lecture seule."
      );
      return;
    }
    const updated = withPaymentStatus({ ...doc, updatedAt: new Date().toISOString() });
    setData(normalizeData({ ...data, documents: data.documents.map((item) => (item.id === doc.id ? updated : item)) }));
    setDocumentSaveState("dirty");
  }

  async function saveDocument(doc: BusinessDocument) {
    if (!canModifyDocument(doc) || documentSaveState === "saving") return;
    setDocumentSaveState("saving");
    const updated = withPaymentStatus({ ...doc, updatedAt: new Date().toISOString() });
    const saved = await persist({ ...data, documents: data.documents.map((item) => (item.id === doc.id ? updated : item)) }, "", false);
    setDocumentSaveState(saved ? "saved" : "error");
  }

  async function updateDocumentPayment(doc: BusinessDocument) {
    if (!canEditOperations || doc.type !== "invoice") {
      showPermissionNotice("Encaissement réservé aux factures.");
      return;
    }
    const updated = withPaymentStatus({ ...doc, updatedAt: new Date().toISOString() });
    await persist({ ...data, documents: data.documents.map((item) => (item.id === doc.id ? updated : item)) }, "Paiement enregistré");
  }

  async function advanceStatus(doc: BusinessDocument) {
    if (doc.type !== "invoice") return;
    const summary = paymentSummary(doc);
    if (summary.remainingAmount <= 0.005) {
      await updateDocumentPayment(withPaymentStatus(doc));
      return;
    }
    const payment: PaymentEntry = {
      id: makeId("payment"),
      amount: summary.remainingAmount,
      method: "bank_transfer",
      paidAt: todayIso(),
      note: "Solde facture",
      createdAt: new Date().toISOString(),
    };
    await updateDocumentPayment({ ...doc, payments: [payment, ...(doc.payments || [])] });
  }

  async function duplicateDocument(source: BusinessDocument) {
    if (!canModifyDocument(source)) {
      showPermissionNotice(
        isLockedBillingDocument(source)
          ? "Ce document de facturation est verrouillé. Revenez au document précédent pour le dupliquer."
          : "Votre accès est en lecture seule."
      );
      return;
    }
    const reserved = await reserveNumber(source.type, data);
    const duplicate: BusinessDocument = {
      ...source,
      id: makeId("doc"),
      number: reserved.number,
      status: "draft",
      originId: source.id,
      lines: duplicateLines(source.lines),
      attachments: [],
      depositPaidAmount: 0,
      depositPaidAt: "",
      payments: [],
      paymentNotes: "",
      reminders: [],
      history: [...source.history],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await persist({ ...reserved.data, documents: [duplicate, ...reserved.data.documents] }, `${labels[source.type]} duplique`);
    setSelectedId(duplicate.id);
    setView("documentDetail");
  }

  async function restorePreviousDocument(doc: BusinessDocument) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return;
    }
    const lastHistory = doc.history[doc.history.length - 1];
    if (!lastHistory) return;
    const restored = restoreDocumentFromHistory(doc, lastHistory);
    const nextCatalog =
      doc.type === "invoice"
        ? applyDocumentStockImpact(data.catalog, doc, "cancelInvoice")
        : doc.type === "returnInvoice"
          ? applyDocumentStockImpact(data.catalog, doc, "cancelReturn")
          : data.catalog;
    await deleteAttachmentsExcept(doc, restored.attachments);
    await persist(
      { ...data, catalog: nextCatalog, documents: data.documents.map((item) => (item.id === doc.id ? restored : item)) },
      `${labels[lastHistory.fromType]} ${lastHistory.fromNumber} restauré`
    );
    setSelectedId(restored.id);
    setView("documentDetail");
  }

  async function deleteDocument(doc: BusinessDocument) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return;
    }
    if (isLockedBillingDocument(doc)) {
      showPermissionNotice("Ce document de facturation est verrouillé. Revenez au document précédent avant de le supprimer.");
      return;
    }
    if (!confirmDestructiveAction(`Supprimer ${labels[doc.type].toLowerCase()} ${doc.number} ?`)) return;
    const lastHistory = doc.history[doc.history.length - 1];
    const shouldRestoreOrigin = Boolean(
      lastHistory &&
        (await requestChoiceConfirmation(
          "Régénérer l'origine",
          `Voulez-vous régénérer le document d'origine : ${labels[lastHistory.fromType]} ${lastHistory.fromNumber} ?`
        ))
    );
    const restored = shouldRestoreOrigin && lastHistory ? restoreDocumentFromHistory(doc, lastHistory) : null;

    await deleteAttachmentsExcept(doc, restored?.attachments || []);
    const nextDocs = data.documents.filter((item) => item.id !== doc.id);
    await persist(
      { ...data, documents: restored ? [restored, ...nextDocs] : nextDocs },
      restored ? `${labels[restored.type]} ${restored.number} régénéré` : "Document supprimé"
    );
    setSelectedId(restored?.id || "");
    setView(restored ? "documentDetail" : "documents");
  }

  async function addDocumentAttachments(doc: BusinessDocument) {
    if (!canModifyDocument(doc)) {
      showPermissionNotice(
        isLockedBillingDocument(doc)
          ? "Ce document de facturation est verrouillé. Revenez au document précédent pour modifier les pièces jointes."
          : "Votre accès est en lecture seule."
      );
      return;
    }
    const result = await api.selectAttachments(doc.id);
    if (result.canceled || !result.attachments.length) return;
    const attachments = workspace
      ? await Promise.all(result.attachments.map((attachment) => uploadRemoteAttachment(workspace, doc.id, attachment)))
      : result.attachments;
    await updateDocument({ ...doc, attachments: [...doc.attachments, ...attachments] });
    setNotice(`${attachments.length} pièce(s) jointe(s) ajoutée(s)`);
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function openDocumentAttachment(attachment: DocumentAttachment) {
    try {
      if (workspace) {
        await openRemoteAttachment(attachment);
        return;
      }
      const result = await api.openAttachment(attachment);
      if (result.opened) return;
    } catch (error) {
      console.warn("Ouverture pièce jointe impossible", error);
    }
    setNotice("Pièce jointe introuvable");
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function removeDocumentAttachment(doc: BusinessDocument, attachment: DocumentAttachment) {
    if (!canModifyDocument(doc)) {
      showPermissionNotice(
        isLockedBillingDocument(doc)
          ? "Ce document de facturation est verrouillé. Revenez au document précédent pour modifier les pièces jointes."
          : "Votre accès est en lecture seule."
      );
      return;
    }
    if (!confirmDestructiveAction(`Supprimer la pièce jointe « ${attachment.name} » ?`)) return;
    try {
      if (workspace) {
        await deleteRemoteAttachment(attachment);
      } else {
        await api.deleteAttachment(attachment);
      }
    } catch (error) {
      console.warn("Suppression pièce jointe impossible", error);
    } finally {
      await updateDocument({ ...doc, attachments: doc.attachments.filter((item) => item.id !== attachment.id) });
      setNotice("Pièce jointe supprimée");
      window.setTimeout(() => setNotice(""), 2200);
    }
  }

  async function exportPdf(doc: BusinessDocument) {
    const client = data.clients.find((item) => item.id === doc.clientId);
    const html = renderDocumentHtml(doc, client, data.company);
    const name = `${doc.number}-${sanitizeFileName(doc.projectName || labels[doc.type])}.pdf`;
    await api.savePdf({ html, defaultPath: name });
  }

  async function emailDocument(doc: BusinessDocument) {
    const client = data.clients.find((item) => item.id === doc.clientId);
    let email = client?.email?.trim() || "";
    if (!email) {
      const entered = window.prompt("Email du client à ajouter pour cet envoi", email);
      if (!entered) return;
      email = entered.trim();
      if (client) {
        if (!canEditOperations) {
          showPermissionNotice("Email client absent.");
          return;
        }
        await persist(
          { ...data, clients: data.clients.map((item) => (item.id === client.id ? { ...item, email } : item)) },
          "Email client ajouté"
        );
      }
    }
    const html = renderDocumentHtml(doc, client, data.company);
    const name = `${doc.number}-${sanitizeFileName(doc.projectName || labels[doc.type])}.pdf`;
    const result = await api.emailPdf({
      html,
      defaultPath: name,
      to: email,
      subject: `${labels[doc.type]} ${doc.number}${doc.projectName ? ` - ${doc.projectName}` : ""}`,
      body: "",
    });
    setNotice(result.opened && !result.fallback ? "Email prêt avec PDF joint" : "Impossible de joindre le PDF au mail");
    window.setTimeout(() => setNotice(""), result.fallback ? 4200 : 1800);
  }

  async function sendPaymentReminder(doc: BusinessDocument, draft: ReminderDraft) {
    if (!canEditOperations || doc.type !== "invoice") {
      showPermissionNotice("Relance réservée aux factures.");
      return { success: false, message: "Relance réservée aux factures." };
    }

    const invoice = withPaymentStatus(doc);
    const summary = paymentSummary(invoice);
    if (summary.remainingAmount <= 0.005) {
      setNotice("Aucun reste dû à relancer");
      window.setTimeout(() => setNotice(""), 2200);
      return { success: false, message: "Aucun reste dû à relancer." };
    }

    const client = data.clients.find((item) => item.id === invoice.clientId);
    let email = client?.email?.trim() || "";
    if (!email) {
      const entered = window.prompt("Email du client à utiliser pour cette relance", email);
      if (!entered) return { success: false, message: "Relance annulée : email client absent." };
      email = entered.trim();
      if (!email) return { success: false, message: "Relance annulée : email client absent." };
    }

    const clientForEmail = client ? { ...client, email } : undefined;
    const nextClients =
      client && client.email !== email ? data.clients.map((item) => (item.id === client.id ? { ...item, email } : item)) : data.clients;
    const { subject, body } = buildPaymentReminderEmail(invoice, clientForEmail, data.company, draft.note);
    const html = renderDocumentHtml(invoice, clientForEmail, data.company);
    const name = `${invoice.number}-relance-${sanitizeFileName(invoice.projectName || "facture")}.pdf`;
    let result: Awaited<ReturnType<typeof api.emailPdf>>;
    try {
      result = await api.emailPdf({ html, defaultPath: name, to: email, subject, body });
    } catch (error) {
      console.error("Relance email impossible", error);
      setNotice("Relance impossible : génération PDF échouée");
      window.setTimeout(() => setNotice(""), 4200);
      return { success: false, message: "Relance impossible : génération PDF échouée." };
    }

    if (!result.opened || result.fallback) {
      setNotice("Relance non envoyée : PDF joint indisponible");
      window.setTimeout(() => setNotice(""), 4200);
      return { success: false, message: "Relance non enregistrée : PDF joint indisponible." };
    }

    const reminder: PaymentReminder = {
      id: makeId("reminder"),
      sentAt: draft.sentAt || todayIso(),
      channel: "email",
      note: draft.note.trim() || `Relance email - reste dû ${currency(summary.remainingAmount)}`,
    };
    const updated = withPaymentStatus({
      ...invoice,
      reminders: [reminder, ...(invoice.reminders || [])],
      updatedAt: new Date().toISOString(),
    });
    await persist(
      { ...data, clients: nextClients, documents: data.documents.map((item) => (item.id === invoice.id ? updated : item)) },
      "Relance email enregistrée"
    );
    setNotice("Relance prête avec PDF joint");
    window.setTimeout(() => setNotice(""), 2200);
    return { success: true, message: "Relance prête avec PDF joint." };
  }

  async function updateClient(client: Client) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return false;
    }
    const exists = data.clients.some((item) => item.id === client.id);
    const nextData = exists
      ? { ...data, clients: data.clients.map((item) => (item.id === client.id ? client : item)) }
      : {
          ...data,
          counters: { ...data.counters, client: Math.max(data.counters.client || 1, (data.counters.client || 1) + 1) },
          clients: [client, ...data.clients],
        };
    const saved = await persist(nextData, exists ? "Client enregistré" : "Client créé");
    if (saved && draftClient?.id === client.id) setDraftClient(null);
    return saved;
  }

  async function deleteClient(client: Client) {
    if (draftClient?.id === client.id) {
      if (!confirmDestructiveAction("Abandonner ce nouveau client non enregistré ?")) return;
      setDraftClient(null);
      setSelectedClientId(data.clients[0]?.id || "");
      return;
    }
    if (!canDeleteClients) {
      showPermissionNotice("Suppression des clients réservée aux administrateurs.");
      return;
    }
    const used = data.documents.some((doc) => doc.clientId === client.id);
    if (used) {
      setNotice("Client utilisé dans un document");
      return;
    }
    if (!confirmDestructiveAction(`Supprimer le client « ${client.name || client.number} » ?`)) return;
    await persist({ ...data, clients: data.clients.filter((item) => item.id !== client.id) }, "Client supprimé");
    if (selectedClientId === client.id) setSelectedClientId("");
  }

  async function addCatalogLine(doc: BusinessDocument, catalogId: string) {
    const item = data.catalog.find((entry) => entry.id === catalogId);
    if (!item) return;
    await updateDocument({
      ...doc,
      lines: [
        ...doc.lines,
        {
          id: makeId("line"),
          description: item.name,
          details: item.category,
          unit: item.unit,
          quantity: 1,
          unitPrice: item.price,
          purchasePrice: item.purchasePrice,
          vatRate: item.vatRate,
          discount: 0,
          catalogItemId: item.id,
        },
      ],
    });
  }

  async function createCatalogItem() {
    if (!canManageCatalog) {
      showPermissionNotice();
      return;
    }
    await persist({ ...data, catalog: [emptyCatalogItem(data.company.defaultVatRate), ...data.catalog] }, "Élément ajouté au catalogue");
    setView("catalog");
  }

  async function updateCatalogItem(item: CatalogItem) {
    if (!canManageCatalog) {
      showPermissionNotice();
      return;
    }
    await persist({ ...data, catalog: data.catalog.map((entry) => (entry.id === item.id ? item : entry)) });
  }

  async function deleteCatalogItem(item: CatalogItem) {
    if (!canManageCatalog) {
      showPermissionNotice();
      return;
    }
    if (data.purchaseInvoices.some((invoice) => invoice.lines.some((line) => line.catalogItemId === item.id))) {
      showPermissionNotice("Cet article est utilisé par une facture d’achat et ne peut pas être supprimé.");
      return;
    }
    if (data.purchaseOrders.some((order) => order.lines.some((line) => line.catalogItemId === item.id))) {
      showPermissionNotice("Cet article est utilisé par une commande fournisseur et ne peut pas être supprimé.");
      return;
    }
    if (!confirmDestructiveAction(`Supprimer « ${item.name || "cet élément"} » du catalogue ?`)) return;
    await persist({ ...data, catalog: data.catalog.filter((entry) => entry.id !== item.id) }, "Élément supprimé du catalogue");
  }

  async function copyCompany() {
    const text = companyText(data.company);
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Informations société copiées");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setNotice("Informations société copiées");
    }
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function emailCompany() {
    await api.openEmail({
      subject: `Informations société - ${data.company.name}`,
      body: companyText(data.company),
    });
  }

  async function exportCompanyPdf() {
    await api.savePdf({
      html: renderCompanyHtml(data.company),
      defaultPath: `${sanitizeFileName(data.company.name || "fiche-societe")}.pdf`,
    });
  }

  async function exportAccountingPdf(period: AccountingPeriod) {
    const report = buildAccountingReport(data, period);
    const result = await api.savePdf({
      html: renderAccountingHtml(report, data.company),
      defaultPath: `livre-comptes-${period.startDate}-${period.endDate}.pdf`,
    });
    if (!result.canceled) {
      setNotice("Livre de comptes PDF exporté");
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  async function exportAccountingExcel(period: AccountingPeriod) {
    const report = buildAccountingReport(data, period);
    const result = await api.saveExcel({
      bytes: buildAccountingXlsx(report, data.company),
      defaultPath: `livre-comptes-${period.startDate}-${period.endDate}.xlsx`,
    });
    if (!result.canceled) {
      setNotice("Livre de comptes Excel exporté");
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  async function archiveYear(year: number) {
    if (!canManageCompany) {
      showPermissionNotice("L’archivage annuel est réservé aux administrateurs.");
      return false;
    }
    const currentYearValue = new Date().getFullYear();
    if (!Number.isFinite(year) || year >= currentYearValue) {
      showPermissionNotice("Seule une année terminée peut être archivée.");
      return false;
    }

    const documents = data.documents.filter((doc) => !isArchived(doc) && documentYear(doc) === year);
    const expenses = data.expenses.filter((expense) => !isArchived(expense) && expenseYear(expense) === year);
    const invoices = data.purchaseInvoices.filter((invoice) => !isArchived(invoice) && purchaseInvoiceYear(invoice) === year);
    const orders = data.purchaseOrders.filter((order) => !isArchived(order) && purchaseOrderYear(order) === year);
    const totalItems = documents.length + expenses.length + invoices.length + orders.length;
    if (!totalItems) {
      showPermissionNotice(`Aucun élément actif trouvé pour ${year}.`);
      return false;
    }

    if (
      !confirmDestructiveAction(
        `Archiver ${totalItems} élément(s) de ${year} ? Ils disparaîtront des vues actives, mais resteront consultables dans Archives et dans les comptes.`
      )
    ) {
      return false;
    }

    const expected = `ARCHIVER ${year}`;
    const confirmed = await requestTypedConfirmation(
      "Confirmer l'archivage",
      `Dernière vérification : tapez exactement « ${expected} » pour confirmer.`,
      expected
    );
    if (!confirmed) {
      showPermissionNotice("Archivage annulé : confirmation incorrecte.");
      return false;
    }

    const archivedAt = new Date().toISOString();
    const next = normalizeData({
      ...data,
      documents: data.documents.map((doc) =>
        !isArchived(doc) && documentYear(doc) === year ? { ...doc, archivedYear: year, archivedAt, updatedAt: archivedAt } : doc
      ),
      expenses: data.expenses.map((expense) =>
        !isArchived(expense) && expenseYear(expense) === year ? { ...expense, archivedYear: year, archivedAt, updatedAt: archivedAt } : expense
      ),
      purchaseInvoices: data.purchaseInvoices.map((invoice) =>
        !isArchived(invoice) && purchaseInvoiceYear(invoice) === year
          ? { ...invoice, archivedYear: year, archivedAt, updatedAt: archivedAt }
          : invoice
      ),
      purchaseOrders: data.purchaseOrders.map((order) =>
        !isArchived(order) && purchaseOrderYear(order) === year ? { ...order, archivedYear: year, archivedAt, updatedAt: archivedAt } : order
      ),
    });
    const saved = await persist(next, `Année ${year} archivée`);
    if (saved) setSelectedArchiveYear(year);
    return saved;
  }

  async function createExpense(expense: BusinessExpense) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return false;
    }
    return persist({ ...data, expenses: [expense, ...data.expenses] }, "Dépense enregistrée");
  }

  async function deleteExpense(expense: BusinessExpense) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return;
    }
    if (expense.purchaseInvoiceId) {
      showPermissionNotice("Cette dépense provient d’une facture d’achat. Annulez la validation depuis l’écran Achats.");
      return;
    }
    if (!confirmDestructiveAction(`Supprimer la dépense « ${expense.description} » ?`)) return;
    await persist({ ...data, expenses: data.expenses.filter((item) => item.id !== expense.id) }, "Dépense supprimée");
  }

  async function saveSupplier(supplier: Supplier) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return false;
    }
    const exists = data.suppliers.some((item) => item.id === supplier.id);
    const suppliers = exists ? data.suppliers.map((item) => (item.id === supplier.id ? supplier : item)) : [supplier, ...data.suppliers];
    const expenses = data.expenses.map((expense) =>
      expense.supplierId === supplier.id ? { ...expense, supplier: supplier.name, updatedAt: new Date().toISOString() } : expense
    );
    const catalog = data.catalog.map((item) => (item.supplierId === supplier.id ? { ...item, supplier: supplier.name } : item));
    const purchaseInvoices = data.purchaseInvoices.map((invoice) =>
      invoice.supplierId === supplier.id ? { ...invoice, supplier: supplier.name, updatedAt: new Date().toISOString() } : invoice
    );
    const purchaseOrders = data.purchaseOrders.map((order) =>
      order.supplierId === supplier.id ? { ...order, supplier: supplier.name, updatedAt: new Date().toISOString() } : order
    );
    return persist(
      { ...data, suppliers, expenses, catalog, purchaseInvoices, purchaseOrders },
      exists ? "Fournisseur mis à jour" : "Fournisseur créé"
    );
  }

  async function deleteSupplier(supplier: Supplier) {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return false;
    }
    if (data.expenses.some((expense) => expense.supplierId === supplier.id)) {
      showPermissionNotice("Ce fournisseur est utilisé par une dépense et ne peut pas être supprimé.");
      return false;
    }
    if (data.catalog.some((item) => item.supplierId === supplier.id)) {
      showPermissionNotice("Ce fournisseur est lié à un article du catalogue et ne peut pas être supprimé.");
      return false;
    }
    if (data.purchaseInvoices.some((invoice) => invoice.supplierId === supplier.id)) {
      showPermissionNotice("Ce fournisseur est utilisé par une facture d’achat et ne peut pas être supprimé.");
      return false;
    }
    if (data.purchaseOrders.some((order) => order.supplierId === supplier.id)) {
      showPermissionNotice("Ce fournisseur est utilisé par une commande fournisseur et ne peut pas être supprimé.");
      return false;
    }
    if (!confirmDestructiveAction(`Supprimer le fournisseur « ${supplier.name} » ?`)) return false;
    return persist({ ...data, suppliers: data.suppliers.filter((item) => item.id !== supplier.id) }, "Fournisseur supprimé");
  }

  async function savePurchaseOrder(order: PurchaseOrder) {
    if (!canManageCatalog || order.status !== "draft") {
      showPermissionNotice("La gestion des commandes fournisseur est réservée aux administrateurs.");
      return false;
    }
    const supplier = data.suppliers.find((entry) => entry.id === order.supplierId);
    const normalized = { ...order, supplier: supplier?.name || order.supplier.trim(), status: "draft" as const };
    const exists = data.purchaseOrders.some((entry) => entry.id === order.id);
    const purchaseOrders = exists
      ? data.purchaseOrders.map((entry) => (entry.id === order.id ? normalized : entry))
      : [normalized, ...data.purchaseOrders];
    return persist({ ...data, purchaseOrders }, exists ? "Commande mise à jour" : "Commande fournisseur créée");
  }

  async function emailPurchaseOrder(order: PurchaseOrder) {
    if (!canManageCatalog) return false;
    let supplier = data.suppliers.find((entry) => entry.id === order.supplierId);
    if (!supplier || !order.lines.length || order.lines.some((line) => !line.description.trim() || line.quantity <= 0)) {
      showPermissionNotice("Renseignez le fournisseur et au moins une ligne valide.");
      return false;
    }
    let email = supplier.email.trim();
    if (!email) {
      const entered = window.prompt(`Adresse email de ${supplier.name}`, "");
      if (!entered?.trim()) {
        showPermissionNotice("L’adresse email du fournisseur est nécessaire pour envoyer la commande.");
        return false;
      }
      email = entered.trim();
      supplier = { ...supplier, email, updatedAt: new Date().toISOString() };
    }
    const sent: PurchaseOrder = { ...order, supplier: supplier.name, status: "sent", updatedAt: new Date().toISOString() };
    const exists = data.purchaseOrders.some((entry) => entry.id === sent.id);
    const purchaseOrders = exists
      ? data.purchaseOrders.map((entry) => (entry.id === sent.id ? sent : entry))
      : [sent, ...data.purchaseOrders];
    const suppliers = data.suppliers.map((entry) => (entry.id === supplier.id ? supplier : entry));
    const saved = await persist({ ...data, suppliers, purchaseOrders }, "Commande prête à être envoyée");
    if (!saved) return false;
    try {
      const result = await api.emailPdf({
        html: renderPurchaseOrderHtml(sent, supplier, data.company),
        defaultPath: `${sanitizeFileName(sent.number)}.pdf`,
        to: email,
        subject: `Bon de commande ${sent.number} - ${data.company.name || "Devix"}`,
        body: `Bonjour,\n\nVeuillez trouver ci-joint notre bon de commande ${sent.number}.\n\nCordialement,\n${data.company.name || ""}`,
      });
      setNotice(result.opened && !result.fallback ? "Email prêt avec le bon de commande joint" : "Email préparé");
      window.setTimeout(() => setNotice(""), 2200);
      return result.opened;
    } catch (error) {
      console.error("Envoi du bon de commande impossible", error);
      setNotice("Impossible d’ouvrir l’email préparé");
      window.setTimeout(() => setNotice(""), 2200);
      return false;
    }
  }

  async function createInvoiceFromPurchaseOrder(order: PurchaseOrder) {
    if (!canManageCatalog || order.status !== "sent" || order.invoiceId) return false;
    const now = new Date().toISOString();
    const invoice: PurchaseInvoice = {
      id: makeId("purchase"),
      supplierId: order.supplierId,
      supplier: order.supplier,
      reference: "",
      invoiceDate: todayIso(),
      dueDate: addDaysIso(todayIso(), 30),
      status: "draft",
      paymentMethod: "bank_transfer",
      notes: `Commande ${order.number}`,
      lines: order.lines.map((line) => ({ ...line, id: makeId("purchase-line") })),
      attachments: [...order.attachments],
      purchaseOrderId: order.id,
      sourceOrder: { ...order, status: "sent", receivedAt: undefined, invoiceId: undefined },
      createdAt: now,
      updatedAt: now,
    };
    const receivedOrder: PurchaseOrder = { ...order, status: "received", receivedAt: now, invoiceId: invoice.id, updatedAt: now };
    const supplierCatalog = data.catalog.map((item) => {
      const line = order.lines.find((entry) => entry.catalogItemId === item.id);
      return line ? { ...item, supplierId: order.supplierId, supplier: order.supplier, purchasePrice: line.unitPrice } : item;
    });
    return persist(
      {
        ...data,
        purchaseInvoices: [invoice, ...data.purchaseInvoices],
        purchaseOrders: data.purchaseOrders.filter((entry) => entry.id !== order.id),
        catalog: applyPurchaseOrderStockImpact(supplierCatalog, receivedOrder, "receive"),
      },
      "Commande transformée en facture : stock mis à jour"
    );
  }

  async function selectPurchaseAttachments(ownerId: string) {
    const result = await api.selectAttachments(ownerId);
    if (result.canceled || !result.attachments.length) return [];
    return workspace
      ? Promise.all(result.attachments.map((attachment) => uploadRemoteAttachment(workspace, ownerId, attachment)))
      : result.attachments;
  }

  async function addPurchaseOrderAttachments(order: PurchaseOrder) {
    if (!canManageCatalog) return;
    const attachments = await selectPurchaseAttachments(order.id);
    if (!attachments.length) return;
    await persist(
      {
        ...data,
        purchaseOrders: data.purchaseOrders.map((entry) =>
          entry.id === order.id
            ? { ...order, attachments: [...order.attachments, ...attachments], updatedAt: new Date().toISOString() }
            : entry
        ),
      },
      `${attachments.length} pièce(s) jointe(s) ajoutée(s)`
    );
  }

  async function addPurchaseInvoiceAttachments(invoice: PurchaseInvoice) {
    if (!canManageCatalog) return;
    const attachments = await selectPurchaseAttachments(invoice.id);
    if (!attachments.length) return;
    await persist(
      {
        ...data,
        purchaseInvoices: data.purchaseInvoices.map((entry) =>
          entry.id === invoice.id
            ? { ...invoice, attachments: [...invoice.attachments, ...attachments], updatedAt: new Date().toISOString() }
            : entry
        ),
      },
      `${attachments.length} pièce(s) jointe(s) ajoutée(s)`
    );
  }

  async function deletePurchaseAttachmentFile(attachment: DocumentAttachment) {
    try {
      if (workspace) await deleteRemoteAttachment(attachment);
      else await api.deleteAttachment(attachment);
    } catch (error) {
      console.warn("Suppression pièce jointe impossible", error);
    }
  }

  async function removePurchaseOrderAttachment(order: PurchaseOrder, attachment: DocumentAttachment) {
    if (!canManageCatalog || !confirmDestructiveAction(`Supprimer la pièce jointe « ${attachment.name} » ?`)) return;
    await deletePurchaseAttachmentFile(attachment);
    await persist(
      {
        ...data,
        purchaseOrders: data.purchaseOrders.map((entry) =>
          entry.id === order.id
            ? { ...order, attachments: order.attachments.filter((item) => item.id !== attachment.id), updatedAt: new Date().toISOString() }
            : entry
        ),
      },
      "Pièce jointe supprimée"
    );
  }

  async function removePurchaseInvoiceAttachment(invoice: PurchaseInvoice, attachment: DocumentAttachment) {
    if (!canManageCatalog || !confirmDestructiveAction(`Supprimer la pièce jointe « ${attachment.name} » ?`)) return;
    await deletePurchaseAttachmentFile(attachment);
    await persist(
      {
        ...data,
        purchaseInvoices: data.purchaseInvoices.map((entry) =>
          entry.id === invoice.id
            ? {
                ...invoice,
                attachments: invoice.attachments.filter((item) => item.id !== attachment.id),
                updatedAt: new Date().toISOString(),
              }
            : entry
        ),
      },
      "Pièce jointe supprimée"
    );
  }

  async function deletePurchaseOrder(order: PurchaseOrder) {
    if (!canManageCatalog) return false;
    if (order.invoiceId) {
      showPermissionNotice("Supprimez d’abord la facture associée à cette commande.");
      return false;
    }
    const impact = order.status === "received" ? " Le stock sera corrigé." : "";
    if (!confirmDestructiveAction(`Supprimer la commande « ${order.number} » ?${impact}`)) return false;
    await Promise.all(order.attachments.map(deletePurchaseAttachmentFile));
    return persist(
      {
        ...data,
        purchaseOrders: data.purchaseOrders.filter((entry) => entry.id !== order.id),
        catalog: order.status === "received" ? applyPurchaseOrderStockImpact(data.catalog, order, "cancel") : data.catalog,
      },
      "Commande fournisseur supprimée"
    );
  }

  async function exportPurchaseOrderPdf(order: PurchaseOrder) {
    const supplier = data.suppliers.find((entry) => entry.id === order.supplierId);
    const result = await api.savePdf({
      html: renderPurchaseOrderHtml(order, supplier, data.company),
      defaultPath: `${sanitizeFileName(order.number)}.pdf`,
    });
    if (!result.canceled) setNotice("Bon de commande fournisseur exporté");
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function savePurchaseInvoice(invoice: PurchaseInvoice) {
    if (!canManageCatalog || invoice.status === "posted") {
      showPermissionNotice("La gestion des achats et du stock est réservée aux administrateurs.");
      return false;
    }
    const supplier = data.suppliers.find((entry) => entry.id === invoice.supplierId);
    const normalized = { ...invoice, supplier: supplier?.name || invoice.supplier.trim(), status: "draft" as const };
    const exists = data.purchaseInvoices.some((entry) => entry.id === invoice.id);
    const purchaseInvoices = exists
      ? data.purchaseInvoices.map((entry) => (entry.id === invoice.id ? normalized : entry))
      : [normalized, ...data.purchaseInvoices];
    return persist({ ...data, purchaseInvoices }, exists ? "Facture d’achat mise à jour" : "Facture d’achat créée");
  }

  async function postPurchaseInvoice(invoice: PurchaseInvoice) {
    if (!canManageCatalog) {
      showPermissionNotice("La validation des achats et du stock est réservée aux administrateurs.");
      return false;
    }
    const stored = data.purchaseInvoices.find((entry) => entry.id === invoice.id);
    if (stored?.status === "posted") return false;
    const supplier = data.suppliers.find((entry) => entry.id === invoice.supplierId);
    const normalized = { ...invoice, supplier: supplier?.name || invoice.supplier.trim() };
    const totals = purchaseInvoiceTotals(normalized);
    if (!normalized.supplierId || !normalized.reference.trim() || totals.totalHt <= 0 || !normalized.lines.length) {
      showPermissionNotice("Renseignez le fournisseur, la référence et au moins une ligne avec un montant positif.");
      return false;
    }
    const duplicate = data.purchaseInvoices.some(
      (entry) =>
        entry.id !== invoice.id &&
        entry.supplierId === invoice.supplierId &&
        entry.reference.trim().toLocaleLowerCase("fr") === invoice.reference.trim().toLocaleLowerCase("fr")
    );
    if (duplicate) {
      showPermissionNotice("Une facture de ce fournisseur porte déjà cette référence.");
      return false;
    }
    const expense = purchaseInvoiceExpense(normalized);
    const posted: PurchaseInvoice = {
      ...normalized,
      status: "posted",
      expenseId: expense.id,
      postedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const purchaseInvoices = stored
      ? data.purchaseInvoices.map((entry) => (entry.id === posted.id ? posted : entry))
      : [posted, ...data.purchaseInvoices];
    return persist(
      {
        ...data,
        purchaseInvoices,
        expenses: [expense, ...data.expenses.filter((entry) => entry.purchaseInvoiceId !== posted.id)],
        catalog: posted.purchaseOrderId ? data.catalog : applyPurchaseInvoiceStockImpact(data.catalog, posted, "post"),
      },
      "Facture validée : comptes et stock mis à jour"
    );
  }

  async function cancelPurchaseInvoice(invoice: PurchaseInvoice) {
    if (!canManageCatalog) {
      showPermissionNotice("L’annulation d’un achat est réservée aux administrateurs.");
      return false;
    }
    const stored = data.purchaseInvoices.find((entry) => entry.id === invoice.id);
    if (!stored || stored.status !== "posted") return false;
    if (!confirmDestructiveAction(`Annuler la validation de la facture « ${stored.reference} » ? Le stock et les comptes seront corrigés.`))
      return false;
    const draft: PurchaseInvoice = {
      ...stored,
      status: "draft",
      expenseId: undefined,
      postedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    return persist(
      {
        ...data,
        purchaseInvoices: data.purchaseInvoices.map((entry) => (entry.id === stored.id ? draft : entry)),
        expenses: data.expenses.filter((entry) => entry.purchaseInvoiceId !== stored.id && entry.id !== stored.expenseId),
        catalog: stored.purchaseOrderId ? data.catalog : applyPurchaseInvoiceStockImpact(data.catalog, stored, "cancel"),
      },
      "Validation annulée : comptes et stock corrigés"
    );
  }

  async function deletePurchaseInvoice(invoice: PurchaseInvoice) {
    if (!canManageCatalog) {
      showPermissionNotice("La suppression des achats est réservée aux administrateurs.");
      return false;
    }
    const stored = data.purchaseInvoices.find((entry) => entry.id === invoice.id);
    if (!stored) return false;
    if (stored.sourceOrder) {
      showPermissionNotice(
        "Cette facture provient d’un bon de commande. Utilisez « Revenir au bon de commande » pour conserver l’historique."
      );
      return false;
    }
    const impact = stored.status === "posted" ? " Le stock et les comptes seront corrigés." : "";
    if (!confirmDestructiveAction(`Supprimer la facture d’achat « ${stored.reference || "sans référence"} » ?${impact}`)) return false;
    await Promise.all(stored.attachments.map(deletePurchaseAttachmentFile));
    return persist(
      {
        ...data,
        purchaseInvoices: data.purchaseInvoices.filter((entry) => entry.id !== stored.id),
        purchaseOrders: data.purchaseOrders.map((order) =>
          order.invoiceId === stored.id ? { ...order, invoiceId: undefined, updatedAt: new Date().toISOString() } : order
        ),
        expenses: data.expenses.filter((entry) => entry.purchaseInvoiceId !== stored.id && entry.id !== stored.expenseId),
        catalog:
          stored.status === "posted" && !stored.purchaseOrderId
            ? applyPurchaseInvoiceStockImpact(data.catalog, stored, "cancel")
            : data.catalog,
      },
      "Facture d’achat supprimée"
    );
  }

  async function restorePurchaseOrderFromInvoice(invoice: PurchaseInvoice) {
    if (!canManageCatalog || !invoice.sourceOrder) return false;
    const stored = data.purchaseInvoices.find((entry) => entry.id === invoice.id);
    if (!stored?.sourceOrder) return false;
    if (
      !confirmDestructiveAction(
        `Revenir au bon de commande ${stored.sourceOrder.number} ? La facture sera retirée et le stock sera corrigé.`
      )
    )
      return false;
    const restored: PurchaseOrder = {
      ...stored.sourceOrder,
      status: "sent",
      receivedAt: undefined,
      invoiceId: undefined,
      attachments: [...stored.attachments],
      updatedAt: new Date().toISOString(),
    };
    return persist(
      {
        ...data,
        purchaseInvoices: data.purchaseInvoices.filter((entry) => entry.id !== stored.id),
        purchaseOrders: [restored, ...data.purchaseOrders.filter((entry) => entry.id !== restored.id)],
        expenses: data.expenses.filter((entry) => entry.purchaseInvoiceId !== stored.id && entry.id !== stored.expenseId),
        catalog: applyPurchaseOrderStockImpact(data.catalog, restored, "cancel"),
      },
      `Bon de commande ${restored.number} restauré`
    );
  }

  function chooseLogoFile() {
    return new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp";
      input.style.display = "none";
      document.body.append(input);

      const cleanup = () => input.remove();
      input.addEventListener("change", () => {
        const file = input.files?.[0] || null;
        cleanup();
        resolve(file);
      });
      input.addEventListener("cancel", () => {
        cleanup();
        resolve(null);
      });
      input.click();
    });
  }

  function readImageAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function updateCompanyLogo() {
    if (!canManageCompany) {
      showPermissionNotice();
      return;
    }
    const file = await chooseLogoFile();
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Format de logo invalide");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Logo trop lourd. Utilisez une image de moins de 2 Mo.");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
    const logoDataUrl = await readImageAsDataUrl(file);
    await persist({ ...data, company: { ...data.company, logoDataUrl } }, "Logo mis à jour");
  }

  async function removeCompanyLogo() {
    if (!canManageCompany) {
      showPermissionNotice();
      return;
    }
    if (!confirmDestructiveAction("Retirer le logo de l'entreprise ?")) return;
    await persist({ ...data, company: { ...data.company, logoDataUrl: "" } }, "Logo supprimé");
  }

  const activeTheme = getTheme(data.company.themeId);

  return (
    <div className="shell" style={themeCssVariables(activeTheme) as CSSProperties}>
      <aside className="sidebar">
        <div className="brandMark">
          <div className="logo">{data.company.logoDataUrl ? <img src={data.company.logoDataUrl} alt="" /> : "DV"}</div>
          <div>
            <strong>Devix</strong>
            <span>{data.company.name.trim() || "Gestion commerciale"}</span>
          </div>
        </div>
        <nav>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <Home size={18} /> Tableau
          </button>
          <button
            className={view === "documents" || (view === "documentDetail" && documentBackView === "documents") ? "active" : ""}
            onClick={() => {
              setSelectedId("");
              setDocumentBackView("documents");
              setView("documents");
            }}
          >
            <FileText size={18} /> Documents
          </button>
          <button
            className={view === "clients" || (view === "documentDetail" && documentBackView === "clients") ? "active" : ""}
            onClick={() => setView("clients")}
          >
            <Users size={18} /> Clients
          </button>
          <button className={view === "purchases" ? "active" : ""} onClick={() => setView("purchases")}>
            <ShoppingCart size={18} /> Achats
          </button>
          <button className={view === "suppliers" ? "active" : ""} onClick={() => setView("suppliers")}>
            <Truck size={18} /> Fournisseurs
          </button>
          {canManageCatalog && (
            <button className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>
              <PackageCheck size={18} /> Catalogue
            </button>
          )}
          <button className={view === "accounting" ? "active" : ""} onClick={() => setView("accounting")}>
            <BookOpenCheck size={18} /> Comptes
          </button>
          {canManageCompany && (
            <button
              className={view === "archives" || (view === "documentDetail" && documentBackView === "archives") ? "active" : ""}
              onClick={() => setView("archives")}
            >
              <Archive size={18} /> Archives
            </button>
          )}
          {canSuperadmin && (
            <button className={view === "superadmin" ? "active" : ""} onClick={() => setView("superadmin")}>
              <ShieldCheck size={18} /> Superadmin
            </button>
          )}
          {canViewCompanySettings && (
            <button className={view === "company" ? "active" : ""} onClick={() => setView("company")}>
              <Building2 size={18} /> Société
            </button>
          )}
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <Settings size={18} /> Paramètres
          </button>
        </nav>
        <div className="quickActions">
          {canEditOperations && (
            <button
              onClick={() => {
                setSelectedId("");
                setDocumentBackView("documents");
                setTypeFilter("quote");
                setView("documents");
              }}
            >
              <FileText size={17} /> Devis
            </button>
          )}
          {canEditOperations && (
            <button
              onClick={() => {
                setSelectedClientId("");
                setView("clients");
              }}
            >
              <UserPlus size={17} /> Nouveau client
            </button>
          )}
          {canManageCatalog && (
            <button onClick={() => setView("catalog")}>
              <PackageCheck size={17} /> Catalogue
            </button>
          )}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Gestion commerciale</span>
            <h1>{pageTitle()}</h1>
            {view === "documentDetail" && selectedDoc && <span className="contextLine">{clientLabel(selectedClient)}</span>}
            {view === "documents" && selectedDoc && (
              <span className="contextLine">
                {selectedDoc.number} · {clientLabel(selectedClient)}
              </span>
            )}
          </div>
          <div className="topActions">
            {loadError && (
              <span className="notice warning">
                <Check size={16} /> {loadError}
              </span>
            )}
            {notice && (
              <span className="notice">
                <Check size={16} /> {notice}
              </span>
            )}
            {workspace && (
              <span className="workspaceBadge">
                {workspace.organizationName} · {roleLabels[workspace.role]}
              </span>
            )}
            {workspace && (
              <button className="ghost" onClick={signOut}>
                <LogOut size={17} /> Déconnexion
              </button>
            )}
          </div>
        </header>

        {view === "dashboard" && (
          <section className="dashboard">
            <div className="kpi">
              <FileText />
              <span>Devis en portefeuille</span>
              <strong>{currency(dashboardTotals.quotes)}</strong>
            </div>
            <div className="kpi">
              <PackageCheck />
              <span>Commandes</span>
              <strong>{currency(dashboardTotals.orders)}</strong>
            </div>
            <div className="kpi">
              <ReceiptText />
              <span>Factures</span>
              <strong>{currency(dashboardTotals.invoices)}</strong>
            </div>
            <div className="kpi">
              <FileCheck2 />
              <span>À encaisser</span>
              <strong>{currency(pendingValue)}</strong>
            </div>
            <div className="panel compact">
              <div className="panelTitle">
                <h2>Suivi des affaires</h2>
              </div>
              <div className="statusGrid">
                <StatusPill status="draft" count={statusCounts.draft} />
                <StatusPill status="partial" count={statusCounts.partial} />
                <StatusPill status="paid" count={statusCounts.paid} />
              </div>
            </div>
            <div className="panel compact">
              <div className="panelTitle">
                <h2>Échéances</h2>
              </div>
              <DueRows docs={dueDocuments} clients={data.clients} onOpen={openDocument} />
            </div>
            <div className="panel wide">
              <div className="panelTitle">
                <div>
                  <h2>Activité récente</h2>
                  {recentDocuments.length > 5 && <span className="panelSubtitle">5 derniers documents affichés</span>}
                </div>
                <div className="panelActions">
                  {recentDocuments.length > 5 && (
                    <button className="ghost" onClick={() => setView("documents")}>
                      Voir tous
                    </button>
                  )}
                  {canEditOperations && (
                    <button onClick={() => createDocument("quote")}>
                      <Plus size={17} /> Créer un devis
                    </button>
                  )}
                </div>
              </div>
              <DocumentRows docs={recentDocuments.slice(0, 5)} clients={data.clients} onOpen={openDocument} />
            </div>
          </section>
        )}

        {view === "accounting" && (
          <AccountingView
            data={data}
            readOnly={!canEditOperations}
            onCreateExpense={createExpense}
            onDeleteExpense={deleteExpense}
            onExportPdf={exportAccountingPdf}
            onExportExcel={exportAccountingExcel}
          />
        )}

        {view === "archives" && (
          <ArchivesView
            data={data}
            clients={data.clients}
            years={archivedYears}
            selectedYear={selectedArchiveYear}
            archiveYearSelection={archiveYearSelection}
            previewData={archivePreviewData}
            canArchive={canManageCompany}
            onYearSelectionChange={setArchiveYearSelection}
            onSelectYear={setSelectedArchiveYear}
            onArchiveYear={archiveYear}
            onOpenDocument={(id) => openDocument(id, "archives")}
          />
        )}

        {view === "superadmin" && (
          <SuperadminView
            workspaces={superadminWorkspaces}
            selectedWorkspace={selectedSuperadminWorkspace}
            busy={superadminBusy}
            error={superadminError}
            onSelect={setSelectedSuperadminOrganizationId}
            onRefresh={refreshSuperadminWorkspaces}
            onDelete={deleteSuperadminWorkspace}
          />
        )}

        {view === "purchases" && (
          <PurchasesView
            orders={activePurchaseOrders}
            invoices={activePurchaseInvoices}
            suppliers={data.suppliers}
            catalog={data.catalog}
            defaultVatRate={data.company.defaultVatRate}
            readOnly={!canManageCatalog}
            onSaveOrder={savePurchaseOrder}
            onEmailOrder={emailPurchaseOrder}
            onCreateInvoice={createInvoiceFromPurchaseOrder}
            onDeleteOrder={deletePurchaseOrder}
            onExportOrderPdf={exportPurchaseOrderPdf}
            onSaveInvoice={savePurchaseInvoice}
            onPostInvoice={postPurchaseInvoice}
            onCancelInvoice={cancelPurchaseInvoice}
            onDeleteInvoice={deletePurchaseInvoice}
            onRestoreOrder={restorePurchaseOrderFromInvoice}
            onAddOrderAttachment={addPurchaseOrderAttachments}
            onRemoveOrderAttachment={removePurchaseOrderAttachment}
            onAddInvoiceAttachment={addPurchaseInvoiceAttachments}
            onRemoveInvoiceAttachment={removePurchaseInvoiceAttachment}
            onOpenAttachment={openDocumentAttachment}
          />
        )}

        {view === "suppliers" && (
          <SuppliersView
            suppliers={data.suppliers}
            catalog={data.catalog}
            expenses={activeExpenses}
            readOnly={!canEditOperations}
            onSave={saveSupplier}
            onDelete={deleteSupplier}
          />
        )}

        {view === "documents" && (
          <section className="documentLayout">
            <aside className="listPane">
              <div className="searchBox">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher document, client, société, ligne..."
                />
              </div>
              <div className="segmented">
                {(["all", "quote", "order", "invoice", "creditNote", "returnInvoice"] as const).map((type) => (
                  <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>
                    {type === "all" ? "Tous" : labels[type]}
                  </button>
                ))}
              </div>
              <div className="documentListFilters">
                <div className="documentStatusFilters" aria-label="Filtrer les documents par statut">
                  {[
                    ["all", "Tous", documentStatusCounts.all],
                    ["draft", statusLabels.draft, documentStatusCounts.draft],
                    ["partial", statusLabels.partial, documentStatusCounts.partial],
                    ["paid", statusLabels.paid, documentStatusCounts.paid],
                  ].map(([value, label, count]) => (
                    <button
                      key={value}
                      type="button"
                      className={documentStatusFilter === value ? "active" : ""}
                      onClick={() => setDocumentStatusFilter(value as DocumentStatusFilter)}
                    >
                      <span>{label}</span>
                      <b>{count}</b>
                    </button>
                  ))}
                </div>
                <label className="documentMonthFilter">
                  Mois
                  <select value={documentMonthFilter} onChange={(event) => setDocumentMonthFilter(event.target.value)}>
                    <option value="all">Tous les mois</option>
                    {documentMonthOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="listMeta">
                {filteredDocuments.length} document(s)
                {filteredDocuments.length !== activeDocuments.length ? ` sur ${activeDocuments.length}` : ""}
              </div>
              <div className="docList documentTable">
                {groupedDocuments.length ? (
                  groupedDocuments.map((group) => (
                    <section className="documentMonthGroup" key={group.key}>
                      <div className="documentMonthHeader">
                        <strong>{group.label}</strong>
                        <span>
                          {group.docs.length} document(s) · {currency(group.total)} TTC
                        </span>
                      </div>
                      <div className="documentRows">
                        {group.docs.map((doc) => {
                          const sum = totals(doc.lines).totalTtc;
                          const client = data.clients.find((item) => item.id === doc.clientId);
                          return (
                            <button
                              key={doc.id}
                              className={selectedId === doc.id ? "documentRow selected" : "documentRow"}
                              onClick={() => openDocument(doc.id)}
                            >
                              <span>{labels[doc.type]}</span>
                              <strong>{doc.number}</strong>
                              <span>{formatShortDate(documentDisplayDate(doc))}</span>
                              <b>{doc.projectName || "Sans nom"}</b>
                              <span className="documentRowClient">{clientLabel(client)}</span>
                              <StatusBadge status={doc.status} />
                              <em>{currency(sum)}</em>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))
                ) : (
                  <div className="emptyRows">Aucun document ne correspond.</div>
                )}
              </div>
            </aside>
            {!filteredDocuments.length && (
              <div className="emptyState">
                <FileText size={42} />
                <h2>{activeDocuments.length ? "Aucun résultat" : "Aucun document"}</h2>
                <p>
                  {activeDocuments.length
                    ? "Aucun devis, bon de commande ou facture ne correspond à cette recherche."
                    : "Créez un premier devis pour démarrer le flux devis, bon de commande, facture."}
                </p>
                {canEditOperations && (
                  <button onClick={() => createDocument("quote")}>
                    <Plus size={17} /> Nouveau devis
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {view === "documentDetail" && (
          <section className="documentPage">
            <div className="documentPageBar">
              <button
                className="ghost"
                onClick={() => {
                  setSelectedId("");
                  setView(documentBackView);
                }}
              >
                <ArrowLeft size={17} />{" "}
                {documentBackView === "clients" ? "Retour au client" : documentBackView === "archives" ? "Retour aux archives" : "Retour aux documents"}
              </button>
            </div>
            {selectedDoc ? (
              <DocumentEditor
                doc={selectedDoc}
                clients={sortedClients}
                catalog={sortedCatalog}
                readOnly={!canModifyDocument(selectedDoc)}
                canEditPayments={canEditOperations && selectedDoc.type === "invoice" && !isArchived(selectedDoc)}
                canRestorePrevious={canEditOperations && !isArchived(selectedDoc)}
                canCreateCreditNote={canConvertDocument(selectedDoc, "creditNote")}
                canCreateReturnInvoice={canConvertDocument(selectedDoc, "returnInvoice")}
                onChange={updateDocument}
                onSave={saveDocument}
                saveState={documentSaveState}
                onPaymentChange={updateDocumentPayment}
                onDelete={deleteDocument}
                onExport={exportPdf}
                onEmail={emailDocument}
                onSendReminder={sendPaymentReminder}
                onConvert={convertDocument}
                onDuplicate={duplicateDocument}
                onRestorePrevious={restorePreviousDocument}
                onAdvanceStatus={advanceStatus}
                onAddCatalogLine={addCatalogLine}
                onAddAttachment={addDocumentAttachments}
                onOpenAttachment={openDocumentAttachment}
                onRemoveAttachment={removeDocumentAttachment}
              />
            ) : (
              <div className="emptyState">
                <FileText size={42} />
                <h2>Document introuvable</h2>
                <p>Le document sélectionné n'existe plus ou n'a pas encore été chargé.</p>
                <button
                  onClick={() => {
                    setSelectedId("");
                    setView("documents");
                  }}
                >
                  <ArrowLeft size={17} /> Retour aux documents
                </button>
              </div>
            )}
          </section>
        )}

        {view === "catalog" && (
          <CatalogManager
            items={sortedCatalog}
            suppliers={data.suppliers}
            onCreate={createCatalogItem}
            onChange={updateCatalogItem}
            onDelete={deleteCatalogItem}
          />
        )}

        {view === "clients" && (
          <section className="clientsPanel">
            <div className="clientsToolbar">
              <div className="searchBox">
                <Search size={17} />
                <input
                  value={clientQuery}
                  onChange={(event) => setClientQuery(event.target.value)}
                  placeholder="Rechercher par numéro client, nom, email, téléphone, ville..."
                />
              </div>
              {canEditOperations && (
                <button onClick={createClient}>
                  <UserPlus size={17} /> Ajouter un client
                </button>
              )}
            </div>
            <div className="clientListFilters" aria-label="Filtrer les clients">
              {[
                ["all", "Tous", clientFilterCounts.all],
                ["professionnel", "Pros", clientFilterCounts.professionnel],
                ["particulier", "Particuliers", clientFilterCounts.particulier],
                ["due", "À encaisser", clientFilterCounts.due],
                ["withDocuments", "Avec documents", clientFilterCounts.withDocuments],
              ].map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={clientListFilter === value ? "active" : ""}
                  onClick={() => setClientListFilter(value as ClientListFilter)}
                >
                  <span>{label}</span>
                  <b>{count}</b>
                </button>
              ))}
            </div>
            <div className="listMeta">
              {filteredClients.length} client(s)
              {filteredClients.length !== data.clients.length ? ` sur ${data.clients.length}` : ""}
            </div>
            <div className="clientsLayout">
              <div className="clientList">
                {draftClient && (
                  <button
                    key={draftClient.id}
                    className={selectedClientId === draftClient.id ? "clientListRow selected draftClientRow" : "clientListRow draftClientRow"}
                    onClick={() => setSelectedClientId(draftClient.id)}
                  >
                    <span>{draftClient.number}</span>
                    <strong>{draftClient.name || "Nouveau client"}</strong>
                    <em>{draftClient.email || draftClient.phone || "Fiche en cours de saisie"}</em>
                    <small>Non enregistré</small>
                  </button>
                )}
                {filteredClients.map((client) => {
                  const stats = clientStatsById.get(client.id) || { documents: 0, totalTtc: 0, due: 0, lastActivity: "" };
                  return (
                    <button
                      key={client.id}
                      className={selectedClientId === client.id ? "clientListRow selected" : "clientListRow"}
                      onClick={() => setSelectedClientId(client.id)}
                    >
                      <span>{client.number}</span>
                      <strong>{client.name || "Client sans nom"}</strong>
                      <em>{client.email || client.phone || `${client.postalCode} ${client.city}`.trim() || "Coordonnées à renseigner"}</em>
                      <small>
                        {stats.documents} doc.
                        {stats.due > 0 ? ` · ${currency(stats.due)} dû` : ""}
                      </small>
                    </button>
                  );
                })}
                {!filteredClients.length && <div className="emptyRows">Aucun client ne correspond.</div>}
              </div>
              {selectedClientForEdit ? (
                <ClientFolder
                  client={selectedClientForEdit}
                  documents={selectedClientDocuments}
                  readOnly={!canEditOperations}
                  canDelete={canDeleteClients || draftClient?.id === selectedClientForEdit.id}
                  canCreateDocument={canEditOperations && draftClient?.id !== selectedClientForEdit.id}
                  onChange={updateClient}
                  onDelete={deleteClient}
                  onOpenDocument={(id) => openDocument(id, "clients")}
                  onCreateDocument={(type) => createDocument(type, selectedClientForEdit.id)}
                />
              ) : (
                <div className="emptyState clientEmpty">
                  <Users size={42} />
                  <h2>{data.clients.length ? "Aucun client sélectionné" : "Aucun client"}</h2>
                  <p>
                    {data.clients.length
                      ? "Sélectionnez un client dans la liste pour modifier sa fiche."
                      : "Ajoutez votre premier client pour le retrouver ici."}
                  </p>
                  {canEditOperations && (
                    <button onClick={createClient}>
                      <UserPlus size={17} /> Ajouter un client
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {view === "company" && (
          <section className="settingsPanel">
            {canViewCompanySettings && (
              <>
                <div className="panelTitle">
                  <h2>Identité et conditions</h2>
                  <div className="panelActions">
                    <button className="ghost" onClick={copyCompany}>
                      <Clipboard size={17} /> Copier
                    </button>
                    <button className="ghost" onClick={emailCompany}>
                      <Mail size={17} /> Email
                    </button>
                    <button onClick={exportCompanyPdf}>
                      <Download size={17} /> PDF
                    </button>
                  </div>
                </div>
                <div className="logoSettings">
                  <div className="logoPreview">
                    {data.company.logoDataUrl ? <img src={data.company.logoDataUrl} alt="" /> : <ImageIcon size={28} />}
                  </div>
                  <div>
                    <strong>Logo de l'entreprise</strong>
                    <span>Affiché dans l'app et sur les PDF générés.</span>
                  </div>
                  <div className="logoActions">
                    <button type="button" disabled={!canManageCompany} onClick={updateCompanyLogo}>
                      <ImageIcon size={17} /> Choisir un logo
                    </button>
                    {data.company.logoDataUrl && (
                      <button type="button" className="ghost" disabled={!canManageCompany} onClick={removeCompanyLogo}>
                        <Trash2 size={17} /> Retirer
                      </button>
                    )}
                  </div>
                </div>
                <CompanySettingsEditor
                  company={data.company}
                  readOnly={!canManageCompany}
                  onSave={(company) => persist({ ...data, company }, "", false)}
                />
              </>
            )}
          </section>
        )}

        {view === "settings" && (
          <section className="settingsPanel preferencesPanel">
            <DiagnosticsSettings data={data} workspace={workspace} />
            <ThemeSettings
              currentThemeId={data.company.themeId}
              readOnly={!canManageCompany}
              onSave={(themeId) => persist({ ...data, company: { ...data.company, themeId } }, "Thème enregistré")}
            />
            {workspace && canManageTeam && (
              <TeamSettings
                workspace={workspace}
                members={teamMembers}
                invitations={teamInvitations}
                canManage={canManageTeam}
                busy={teamBusy}
                inviteEmail={inviteEmail}
                inviteRole={inviteRole}
                onInviteEmailChange={setInviteEmail}
                onInviteRoleChange={setInviteRole}
                onSubmitInvitation={submitInvitation}
                onRevokeInvitation={revokeInvitation}
                onChangeMemberRole={changeMemberRole}
                onDeleteMember={deleteMember}
                onRefresh={refreshTeam}
              />
            )}
            {workspace && (
              <AccountPasswordSettings
                email={workspace.userEmail}
                password={accountPassword}
                confirmPassword={accountPasswordConfirm}
                busy={accountBusy}
                onPasswordChange={setAccountPassword}
                onConfirmPasswordChange={setAccountPasswordConfirm}
                onSubmit={submitAccountPassword}
                onDeleteAccount={deleteAccount}
              />
            )}
            {!workspace && (
              <LocalAccountSettings
                mode={authMode}
                email={authEmail}
                password={authPassword}
                busy={authBusy}
                message={authMessage || loadError}
                onModeChange={setAuthMode}
                onEmailChange={setAuthEmail}
                onPasswordChange={setAuthPassword}
                onSubmit={submitAuth}
                onGoogleAuth={submitGoogleAuth}
                onPasswordSetup={requestPasswordSetup}
              />
            )}
          </section>
        )}
      </main>
      {typedConfirmation && (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => closeTypedConfirmation(false)}>
          <form
            className="typedConfirmDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="typedConfirmTitle"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              closeTypedConfirmation(true);
            }}
          >
            <div>
              <span className="eyebrow">Action définitive</span>
              <h2 id="typedConfirmTitle">{typedConfirmation.title}</h2>
              <p>{typedConfirmation.message}</p>
            </div>
            <input
              autoFocus
              value={typedConfirmation.value}
              onChange={(event) => setTypedConfirmation((current) => (current ? { ...current, value: event.target.value } : current))}
              aria-label="Texte de confirmation"
            />
            <div className="typedConfirmActions">
              <button className="ghost" type="button" onClick={() => closeTypedConfirmation(false)}>
                Annuler
              </button>
              <button className="danger" type="submit" disabled={typedConfirmation.value !== typedConfirmation.expected}>
                <Trash2 size={17} /> Confirmer
              </button>
            </div>
          </form>
        </div>
      )}
      {choiceConfirmation && (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => closeChoiceConfirmation(false)}>
          <div
            className="choiceConfirmDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="choiceConfirmTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <span className="eyebrow">Confirmation</span>
              <h2 id="choiceConfirmTitle">{choiceConfirmation.title}</h2>
              <p>{choiceConfirmation.message}</p>
            </div>
            <div className="typedConfirmActions">
              <button className="ghost" type="button" onClick={() => closeChoiceConfirmation(false)}>
                Non
              </button>
              <button type="button" onClick={() => closeChoiceConfirmation(true)}>
                Oui
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthForm({
  mode,
  email,
  password,
  busy,
  message,
  className = "",
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleAuth,
  onPasswordSetup,
}: {
  mode: AuthMode;
  email: string;
  password: string;
  busy: boolean;
  message: string;
  className?: string;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleAuth: () => void;
  onPasswordSetup: () => void;
}) {
  return (
    <form className={`authPanel ${className}`.trim()} onSubmit={onSubmit}>
      <div className="brandMark authBrand">
        <div className="logo">DV</div>
        <div>
          <strong>Devix</strong>
          <span>Accès sécurisé</span>
        </div>
      </div>
      <div className="segmented authMode">
        <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => onModeChange("signin")}>
          Connexion
        </button>
        <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => onModeChange("signup")}>
          Compte
        </button>
      </div>
      <button className="googleAuthButton" type="button" disabled={busy} onClick={onGoogleAuth}>
        <span>G</span>
        Continuer avec Google
      </button>
      <div className="authDivider">
        <span>ou</span>
      </div>
      <label>
        Email
        <input type="email" autoComplete="email" value={email} onChange={(event) => onEmailChange(event.target.value)} />
      </label>
      <label>
        Mot de passe
        <input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
      </label>
      {message && <span className="authMessage">{message}</span>}
      <button type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="spinIcon" size={17} /> : <Check size={17} />}
        {mode === "signin" ? "Se connecter" : "Créer le compte"}
      </button>
      <button className="ghost passwordLinkButton" type="button" disabled={busy} onClick={onPasswordSetup}>
        Définir / réinitialiser le mot de passe
      </button>
    </form>
  );
}

function LocalAccountSettings({
  mode,
  email,
  password,
  busy,
  message,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleAuth,
  onPasswordSetup,
}: {
  mode: AuthMode;
  email: string;
  password: string;
  busy: boolean;
  message: string;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleAuth: () => void;
  onPasswordSetup: () => void;
}) {
  return (
    <section className="accountSection localAccountSection">
      <div className="panelTitle accountTitle">
        <div>
          <span className="eyebrow">Compte</span>
          <h3>Mode local</h3>
        </div>
      </div>
      <AuthForm
        className="inlineAuthPanel"
        mode={mode}
        email={email}
        password={password}
        busy={busy}
        message={message}
        onModeChange={onModeChange}
        onEmailChange={onEmailChange}
        onPasswordChange={onPasswordChange}
        onSubmit={onSubmit}
        onGoogleAuth={onGoogleAuth}
        onPasswordSetup={onPasswordSetup}
      />
    </section>
  );
}

function DiagnosticsSettings({ data, workspace }: { data: AppData; workspace: WorkspaceContext | null }) {
  const [diagnostics, setDiagnostics] = useState<DevixDiagnostics | null>(null);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [busyPath, setBusyPath] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDevixApi()
      .getDiagnostics()
      .then((value) => {
        if (!cancelled) setDiagnostics(value);
      })
      .catch((loadError) => {
        console.error("Diagnostic indisponible", loadError);
        if (!cancelled) setError("Diagnostic indisponible");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyValue(key: string, value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1500);
    } catch {
      setError("Copie impossible");
    }
  }

  async function openPath(targetPath: string) {
    if (!targetPath) return;
    setBusyPath(targetPath);
    setError("");
    try {
      const result = await getDevixApi().openPath(targetPath);
      if (!result.opened) setError(result.error || "Ouverture impossible");
    } catch (openError) {
      console.error("Ouverture dossier impossible", openError);
      setError("Ouverture impossible");
    } finally {
      setBusyPath("");
    }
  }

  const modeLabel = diagnostics
    ? {
        browser: "Navigateur",
        development: "Electron dev",
        installed: "Installé",
        portable: "Portable",
      }[diagnostics.mode]
    : "Chargement";
  const sessionLabel = workspace ? `${workspace.organizationName} · ${roleLabels[workspace.role]}` : "Mode local";
  const lastLocalBackup = diagnostics?.lastLocalBackupAt ? formatShortDate(diagnostics.lastLocalBackupAt) : "Jamais";
  const oneDriveBackupLabel = diagnostics?.oneDriveBackupRoot
    ? diagnostics.lastOneDriveBackupAt
      ? formatShortDate(diagnostics.lastOneDriveBackupAt)
      : "Jamais"
    : "Non configuré";
  const pathRows = diagnostics
    ? [
        { key: "userData", label: "Dossier données", value: diagnostics.userDataPath, canOpen: diagnostics.mode !== "browser" },
        { key: "dataPath", label: "Fichier local", value: diagnostics.dataPath, canOpen: false },
        { key: "backupRoot", label: "Sauvegardes locales", value: diagnostics.backupRoot, canOpen: diagnostics.mode !== "browser" },
        { key: "attachmentsRoot", label: "Pièces jointes", value: diagnostics.attachmentsRoot, canOpen: diagnostics.mode !== "browser" },
        { key: "oneDriveBackupRoot", label: "Sauvegardes OneDrive", value: diagnostics.oneDriveBackupRoot || "Non configuré", canOpen: Boolean(diagnostics.oneDriveBackupRoot) },
      ]
    : [];

  return (
    <section className="preferenceSection diagnosticsSection">
      <div className="preferenceTitle">
        <div className="preferenceIcon">
          <Settings size={20} />
        </div>
        <div>
          <span className="eyebrow">À propos</span>
          <h2>Version et diagnostic</h2>
        </div>
      </div>

      <div className="diagnosticGrid">
        <div>
          <span>Version</span>
          <strong>{diagnostics?.version || "Chargement"}</strong>
        </div>
        <div>
          <span>Mode</span>
          <strong>{modeLabel}</strong>
        </div>
        <div>
          <span>Connexion</span>
          <strong>{sessionLabel}</strong>
        </div>
        <div>
          <span>Données</span>
          <strong>
            {data.clients.length} clients · {data.documents.length} docs
          </strong>
        </div>
        <div>
          <span>Achats</span>
          <strong>
            {data.suppliers.length} fournisseurs · {data.purchaseOrders.length + data.purchaseInvoices.length} pièces
          </strong>
        </div>
        <div>
          <span>Dernière sauvegarde locale</span>
          <strong>{lastLocalBackup}</strong>
        </div>
        <div>
          <span>Sauvegarde OneDrive</span>
          <strong>{oneDriveBackupLabel}</strong>
        </div>
        <div>
          <span>Plateforme</span>
          <strong>{diagnostics?.platform || "-"}</strong>
        </div>
      </div>

      <div className="diagnosticPaths">
        {pathRows.map((row) => (
          <div className="diagnosticPathRow" key={row.key}>
            <div>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            <button className="ghost subtleButton" type="button" disabled={!row.value} onClick={() => void copyValue(row.key, row.value)}>
              <Clipboard size={15} /> {copiedKey === row.key ? "Copié" : "Copier"}
            </button>
            {row.canOpen && (
              <button className="ghost subtleButton" type="button" disabled={busyPath === row.value} onClick={() => void openPath(row.value)}>
                {busyPath === row.value ? <LoaderCircle className="spinIcon" size={15} /> : <FolderOpen size={15} />}
                Ouvrir
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <span className="preferenceHint diagnosticsError">{error}</span>}
    </section>
  );
}

function ThemeSettings({
  currentThemeId,
  readOnly,
  onSave,
}: {
  currentThemeId: ThemeId;
  readOnly: boolean;
  onSave: (themeId: ThemeId) => Promise<boolean>;
}) {
  const [selectedThemeId, setSelectedThemeId] = useState(currentThemeId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveLock = useRef(false);

  useEffect(() => setSelectedThemeId(currentThemeId), [currentThemeId]);

  async function applyTheme() {
    if (readOnly || saveLock.current || selectedThemeId === currentThemeId) return;
    saveLock.current = true;
    setSaving(true);
    setSaved(false);
    const success = await onSave(selectedThemeId);
    setSaving(false);
    saveLock.current = false;
    if (!success) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <section className="preferenceSection themeSection">
      <div className="preferenceTitle">
        <div className="preferenceIcon">
          <Palette size={20} />
        </div>
        <div>
          <span className="eyebrow">Apparence</span>
          <h2>Thème</h2>
          <p>La palette choisie s’applique à Devix et à tous les PDF générés.</p>
        </div>
      </div>
      <div className="themeGrid" role="radiogroup" aria-label="Thème de couleur">
        {devixThemes.map((theme) => {
          const selected = selectedThemeId === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              className={`themeOption${selected ? " selected" : ""}`}
              disabled={readOnly || saving}
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setSelectedThemeId(theme.id);
                setSaved(false);
              }}
            >
              <span className="themePreview" style={{ background: theme.colors.background }}>
                <i style={{ background: theme.colors.sidebar }} />
                <b style={{ background: theme.colors.primary }} />
                <em style={{ background: theme.colors.accent }} />
              </span>
              <span className="themeOptionText">
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </span>
              {selected && <Check size={18} className="themeCheck" />}
            </button>
          );
        })}
      </div>
      <div className="themeActions">
        {readOnly && <span className="preferenceHint">Seuls les administrateurs peuvent modifier le thème de l’entreprise.</span>}
        {saved && (
          <span className="inlineSaveConfirmation">
            <Check size={16} /> Thème enregistré
          </span>
        )}
        {!readOnly && (
          <button type="button" disabled={saving || selectedThemeId === currentThemeId} onClick={() => void applyTheme()}>
            {saving ? <LoaderCircle className="spinIcon" size={17} /> : <Palette size={17} />}
            {saving ? "Application…" : "Appliquer le thème"}
          </button>
        )}
      </div>
    </section>
  );
}

function AccountPasswordSettings({
  email,
  password,
  confirmPassword,
  busy,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onDeleteAccount,
}: {
  email: string;
  password: string;
  confirmPassword: string;
  busy: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteAccount: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <section className="accountSection">
      <div className="panelTitle accountTitle">
        <div>
          <span className="eyebrow">Compte</span>
          <h3>Accès personnel</h3>
        </div>
        <div className="accountActions">
          <span className="accountEmail">{email}</span>
          <button className="ghost subtleButton" type="button" onClick={() => setIsOpen((value) => !value)}>
            {isOpen ? "Masquer" : "Mot de passe"}
          </button>
        </div>
      </div>
      {isOpen && (
        <form className="accountPasswordForm" onSubmit={onSubmit}>
          <label>
            Nouveau mot de passe
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="8 caractères minimum"
            />
          </label>
          <label>
            Confirmation
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              placeholder="Répéter le mot de passe"
            />
          </label>
          <button type="submit" disabled={busy || !password || !confirmPassword}>
            {busy ? <LoaderCircle className="spinIcon" size={17} /> : <Check size={17} />}
            Enregistrer
          </button>
        </form>
      )}
      <div className="accountDangerZone">
        <div>
          <strong>Supprimer le compte</strong>
          <span>Suppression définitive de votre accès et de vos entreprises propriétaires.</span>
        </div>
        {deleteConfirmOpen ? (
          <div className="accountDeleteConfirm">
            <button className="ghost subtleButton" type="button" disabled={busy} onClick={() => setDeleteConfirmOpen(false)}>
              Annuler
            </button>
            <button className="danger subtleButton" type="button" disabled={busy} onClick={onDeleteAccount}>
              Confirmer la suppression
            </button>
          </div>
        ) : (
          <button className="ghost subtleButton dangerTextButton" type="button" disabled={busy} onClick={() => setDeleteConfirmOpen(true)}>
            Supprimer le compte
          </button>
        )}
      </div>
    </section>
  );
}

function TeamSettings({
  workspace,
  members,
  invitations,
  canManage,
  busy,
  inviteEmail,
  inviteRole,
  onInviteEmailChange,
  onInviteRoleChange,
  onSubmitInvitation,
  onRevokeInvitation,
  onChangeMemberRole,
  onDeleteMember,
  onRefresh,
}: {
  workspace: WorkspaceContext;
  members: TeamMember[];
  invitations: TeamInvitation[];
  canManage: boolean;
  busy: boolean;
  inviteEmail: string;
  inviteRole: InviteRole;
  onInviteEmailChange: (value: string) => void;
  onInviteRoleChange: (value: InviteRole) => void;
  onSubmitInvitation: (event: FormEvent<HTMLFormElement>) => void;
  onRevokeInvitation: (invitation: TeamInvitation) => void;
  onChangeMemberRole: (member: TeamMember, role: InviteRole) => void;
  onDeleteMember: (member: TeamMember) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="teamSection">
      <div className="panelTitle teamTitle">
        <div>
          <span className="eyebrow">Équipe</span>
          <h3>Employés et accès</h3>
        </div>
        <button className="ghost subtleButton" disabled={busy} onClick={onRefresh} type="button">
          {busy ? <LoaderCircle className="spinIcon" size={15} /> : <Users size={15} />}
          Actualiser
        </button>
      </div>

      {canManage && (
        <form className="inviteForm" onSubmit={onSubmitInvitation}>
          <label>
            Email employé
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => onInviteEmailChange(event.target.value)}
              placeholder="prenom@societe.fr"
            />
          </label>
          <label>
            Droits
            <select value={inviteRole} onChange={(event) => onInviteRoleChange(event.target.value as InviteRole)}>
              {inviteRoleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || !inviteEmail.trim()}>
            <UserPlus size={17} /> Inviter
          </button>
        </form>
      )}

      <div className="teamLayout">
        <div className="teamColumn">
          <div className="teamColumnHeader">
            <strong>Membres</strong>
            <span>{members.length}</span>
          </div>
          <div className="teamRows">
            {members.map((member) => {
              const locked = !canManage || member.role === "owner" || member.isCurrentUser;
              return (
                <div className="teamRow" key={member.id}>
                  <div>
                    <strong>{member.email || "Email indisponible"}</strong>
                    <span>{member.isCurrentUser ? "Vous" : `Ajoute le ${formatShortDate(member.createdAt)}`}</span>
                  </div>
                  {member.role === "owner" ? (
                    <span className="statusBadge success">{roleLabels.owner}</span>
                  ) : (
                    <select
                      disabled={locked || busy}
                      value={member.role}
                      onChange={(event) => onChangeMemberRole(member, event.target.value as InviteRole)}
                    >
                      {inviteRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                    </select>
                  )}
                  {canManage && (
                    <button
                      className="iconButton dangerIcon"
                      disabled={locked || busy}
                      onClick={() => onDeleteMember(member)}
                      title="Retirer l'employé"
                      type="button"
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              );
            })}
            {!members.length && <div className="emptyRows compactEmpty">Aucun membre chargé.</div>}
          </div>
        </div>

        {canManage && (
          <div className="teamColumn">
            <div className="teamColumnHeader">
              <strong>Invitations</strong>
              <span>{invitations.length}</span>
            </div>
            <div className="teamRows">
              {invitations.map((invitation) => (
                <div className="teamRow invitationRow" key={invitation.id}>
                  <div>
                    <strong>{invitation.email}</strong>
                    <span>
                      {roleLabels[invitation.role]} · expire le {formatShortDate(invitation.expiresAt)}
                    </span>
                  </div>
                  <span className="statusBadge info">Email envoyé</span>
                  <button
                    className="iconButton dangerIcon"
                    disabled={busy}
                    onClick={() => onRevokeInvitation(invitation)}
                    title="Supprimer l'invitation"
                    type="button"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              {!invitations.length && <div className="emptyRows compactEmpty">Aucune invitation en attente.</div>}
            </div>
          </div>
        )}
      </div>

      <span className="teamFootnote">
        {workspace.organizationName} · {roleLabels[workspace.role]}
      </span>
    </section>
  );
}

function DocumentRows({ docs, clients, onOpen }: { docs: BusinessDocument[]; clients: Client[]; onOpen: (id: string) => void }) {
  if (!docs.length) return <div className="emptyRows">Aucune activite pour le moment.</div>;
  return (
    <div className="rows">
      {docs.map((doc) => (
        <button key={doc.id} onClick={() => onOpen(doc.id)}>
          <span>{formatShortDate(activityDate(doc))}</span>
          <strong>
            {labels[doc.type]} {doc.number}
          </strong>
          <em>{clientLabel(clients.find((client) => client.id === doc.clientId))}</em>
          <b>{currency(totals(doc.lines).totalTtc)}</b>
          <StatusBadge status={doc.status} />
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

function DueRows({ docs, clients, onOpen }: { docs: BusinessDocument[]; clients: Client[]; onOpen: (id: string) => void }) {
  if (!docs.length) return <div className="emptyRows compactEmpty">Aucune échéance ouverte.</div>;
  return (
    <div className="dueRows">
      {docs.map((doc) => (
        <button key={doc.id} onClick={() => onOpen(doc.id)}>
          <span>{doc.dueDate}</span>
          <strong>{doc.number}</strong>
          <em>{clientLabel(clients.find((client) => client.id === doc.clientId))}</em>
        </button>
      ))}
    </div>
  );
}

function periodForYear(year: number): AccountingPeriod {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function ArchivesView({
  data,
  clients,
  years,
  selectedYear,
  archiveYearSelection,
  previewData,
  canArchive,
  onYearSelectionChange,
  onSelectYear,
  onArchiveYear,
  onOpenDocument,
}: {
  data: AppData;
  clients: Client[];
  years: number[];
  selectedYear: number | null;
  archiveYearSelection: number;
  previewData: AppData | null;
  canArchive: boolean;
  onYearSelectionChange: (year: number) => void;
  onSelectYear: (year: number | null) => void;
  onArchiveYear: (year: number) => Promise<boolean>;
  onOpenDocument: (id: string) => void;
}) {
  const currentYearValue = new Date().getFullYear();
  const selectableYears = [
    ...data.documents.filter((doc) => !isArchived(doc)).map(documentYear),
    ...data.expenses.filter((expense) => !isArchived(expense)).map(expenseYear),
    ...data.purchaseInvoices.filter((invoice) => !isArchived(invoice)).map(purchaseInvoiceYear),
    ...data.purchaseOrders.filter((order) => !isArchived(order)).map(purchaseOrderYear),
  ]
    .filter((year): year is number => Number.isFinite(year) && year < currentYearValue)
    .filter((year, index, allYears) => allYears.indexOf(year) === index)
    .sort((a, b) => b - a);
  const selectedArchiveCandidate = selectableYears.includes(archiveYearSelection) ? archiveYearSelection : selectableYears[0];
  const activeForSelection =
    selectedArchiveCandidate === undefined
      ? 0
      : data.documents.filter((doc) => !isArchived(doc) && documentYear(doc) === selectedArchiveCandidate).length +
        data.expenses.filter((expense) => !isArchived(expense) && expenseYear(expense) === selectedArchiveCandidate).length +
        data.purchaseInvoices.filter((invoice) => !isArchived(invoice) && purchaseInvoiceYear(invoice) === selectedArchiveCandidate).length +
        data.purchaseOrders.filter((order) => !isArchived(order) && purchaseOrderYear(order) === selectedArchiveCandidate).length;
  const archiveReport = previewData && selectedYear ? buildAccountingReport(previewData, periodForYear(selectedYear)) : null;

  return (
    <section className="archivePage">
      <section className="panel archiveActionPanel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">Clôture annuelle</span>
            <h2>Archiver une année terminée</h2>
          </div>
          <div className="panelActions">
            <select
              value={selectedArchiveCandidate ?? ""}
              disabled={!selectableYears.length}
              onChange={(event) => onYearSelectionChange(Number(event.target.value))}
            >
              {selectableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              disabled={!canArchive || selectedArchiveCandidate === undefined || activeForSelection === 0}
              onClick={() => selectedArchiveCandidate !== undefined && void onArchiveYear(selectedArchiveCandidate)}
            >
              <Archive size={17} /> {selectedArchiveCandidate === undefined ? "Aucune année à archiver" : `Archiver ${selectedArchiveCandidate}`}
            </button>
          </div>
        </div>
        <p>
          {activeForSelection} élément(s) actif(s) seront retirés des vues courantes. Ils resteront consultables ici, documents et livre de
          comptes compris.
        </p>
      </section>

      <section className="archiveLayout">
        <aside className="panel archiveYearList">
          <div className="panelTitle">
            <h2>Années archivées</h2>
          </div>
          {years.length ? (
            years.map((year) => (
              <button key={year} className={selectedYear === year ? "archiveYearCard selected" : "archiveYearCard"} onClick={() => onSelectYear(year)}>
                <strong>{year}</strong>
                <span>{data.documents.filter((doc) => doc.archivedYear === year).length} document(s)</span>
              </button>
            ))
          ) : (
            <div className="emptyRows compactEmpty">Aucune année archivée.</div>
          )}
        </aside>

        <section className="panel archiveDetail">
          {previewData && selectedYear && archiveReport ? (
            <>
              <div className="panelTitle">
                <div>
                  <span className="eyebrow">Archive {selectedYear}</span>
                  <h2>Documents et comptes</h2>
                </div>
              </div>
              <div className="archiveKpis">
                <div>
                  <span>Documents</span>
                  <strong>{previewData.documents.length}</strong>
                </div>
                <div>
                  <span>CA HT</span>
                  <strong>{currency(archiveReport.revenueHt)}</strong>
                </div>
                <div>
                  <span>Charges HT</span>
                  <strong>{currency(archiveReport.operatingExpensesHt)}</strong>
                </div>
                <div>
                  <span>Résultat</span>
                  <strong>{currency(archiveReport.netProfit)}</strong>
                </div>
              </div>
              <div className="archiveDocumentGrid">
                {previewData.documents.map((doc) => {
                  const client = clients.find((entry) => entry.id === doc.clientId);
                  return (
                    <button key={doc.id} className="docCard archiveDocCard" onClick={() => onOpenDocument(doc.id)}>
                      <span>
                        {labels[doc.type]} <strong>{doc.number}</strong>
                      </span>
                      <b>{doc.projectName || "Sans nom"}</b>
                      <small>{clientLabel(client)}</small>
                      <div className="docCardFooter">
                        <StatusBadge status={doc.status} />
                        <em>{currency(totals(doc.lines).totalTtc)}</em>
                      </div>
                    </button>
                  );
                })}
                {!previewData.documents.length && <div className="emptyRows">Aucun document commercial archivé pour cette année.</div>}
              </div>
            </>
          ) : (
            <div className="emptyState">
              <Archive size={42} />
              <h2>Sélectionnez une année</h2>
              <p>Les documents archivés et la synthèse comptable de l’année apparaîtront ici.</p>
            </div>
          )}
        </section>
      </section>
    </section>
  );
}

function SuperadminView({
  workspaces,
  selectedWorkspace,
  busy,
  error,
  onSelect,
  onRefresh,
  onDelete,
}: {
  workspaces: SuperadminWorkspace[];
  selectedWorkspace: SuperadminWorkspace | null;
  busy: boolean;
  error: string;
  onSelect: (organizationId: string) => void;
  onRefresh: () => Promise<void>;
  onDelete: (workspace: SuperadminWorkspace) => Promise<void>;
}) {
  const selectedData = selectedWorkspace?.data;
  const year = new Date().getFullYear();
  const report = selectedData ? buildAccountingReport(selectedData, periodForYear(year)) : null;

  return (
    <section className="superadminPage">
      <aside className="panel superadminList">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">Superadmin</span>
            <h2>Comptes</h2>
          </div>
          <button className="ghost" disabled={busy} onClick={() => void onRefresh()}>
            {busy ? <LoaderCircle className="spinIcon" size={17} /> : <Search size={17} />} Actualiser
          </button>
        </div>
        {error && <span className="authMessage">{error}</span>}
        <div className="superadminCards">
          {workspaces.map((workspace) => (
            <button
              key={workspace.organizationId}
              className={selectedWorkspace?.organizationId === workspace.organizationId ? "superadminCard selected" : "superadminCard"}
              onClick={() => onSelect(workspace.organizationId)}
            >
              <Building2 size={20} />
              <span>
                <strong>{workspace.organizationName}</strong>
                <small>{workspace.data.company.email || workspace.organizationId}</small>
              </span>
              <b>{workspace.data.documents.length} doc.</b>
            </button>
          ))}
          {!workspaces.length && !busy && <div className="emptyRows">Aucun compte disponible.</div>}
        </div>
      </aside>

      <section className="panel superadminDetail">
        {selectedWorkspace && selectedData && report ? (
          <>
            <div className="panelTitle">
              <div>
                <span className="eyebrow">Lecture seule</span>
                <h2>{selectedWorkspace.organizationName}</h2>
              </div>
              <div className="panelActions">
                <span className="workspaceBadge">
                  Mis à jour {selectedWorkspace.updatedAt ? formatShortDate(selectedWorkspace.updatedAt) : "inconnu"}
                </span>
                <button className="danger" disabled={busy} onClick={() => void onDelete(selectedWorkspace)}>
                  <Trash2 size={17} /> Supprimer
                </button>
              </div>
            </div>
            <div className="archiveKpis">
              <div>
                <span>Documents</span>
                <strong>{selectedData.documents.length}</strong>
              </div>
              <div>
                <span>Clients</span>
                <strong>{selectedData.clients.length}</strong>
              </div>
              <div>
                <span>CA HT {year}</span>
                <strong>{currency(report.revenueHt)}</strong>
              </div>
              <div>
                <span>Solde TVA {year}</span>
                <strong>{currency(report.vatBalance)}</strong>
              </div>
            </div>
            <div className="superadminSections">
              <section>
                <h3>Devis, BC, factures</h3>
                <div className="archiveDocumentGrid">
                  {selectedData.documents.slice(0, 24).map((doc) => (
                    <article key={doc.id} className="docCard archiveDocCard">
                      <span>
                        {labels[doc.type]} <strong>{doc.number}</strong>
                      </span>
                      <b>{doc.projectName || "Sans nom"}</b>
                      <small>{clientLabel(selectedData.clients.find((client) => client.id === doc.clientId))}</small>
                      <div className="docCardFooter">
                        <StatusBadge status={doc.status} />
                        <em>{currency(totals(doc.lines).totalTtc)}</em>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3>Livre des comptes {year}</h3>
                <div className="accountingTableWrap superadminAccountingTable">
                  <table>
                    <thead>
                      <tr>
                        <th>Mois</th>
                        <th>CA HT</th>
                        <th>Charges</th>
                        <th>Résultat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.months.map((month) => (
                        <tr key={month.key}>
                          <td>{month.label}</td>
                          <td>{currency(month.revenueHt)}</td>
                          <td>{currency(month.operatingExpensesHt)}</td>
                          <td>{currency(month.netProfit)}</td>
                        </tr>
                      ))}
                      {!report.months.length && (
                        <tr>
                          <td colSpan={4} className="accountingEmpty">
                            Aucune écriture sur l’année.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="emptyState">
            <ShieldCheck size={42} />
            <h2>Sélectionnez un compte</h2>
            <p>Les documents, bons de commande, factures et comptes s’afficheront ici.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`statusBadge ${statusTone[status] ?? "neutral"}`}>{statusLabels[status]}</span>;
}

function StatusPill({ status, count }: { status: DocumentStatus; count: number }) {
  return (
    <div className={`statusPill ${statusTone[status] ?? "neutral"}`}>
      <span>{statusLabels[status]}</span>
      <strong>{count}</strong>
    </div>
  );
}

function DocumentEditor({
  doc,
  clients,
  catalog,
  readOnly,
  canEditPayments,
  canRestorePrevious,
  canCreateCreditNote,
  canCreateReturnInvoice,
  onChange,
  onSave,
  saveState,
  onPaymentChange,
  onDelete,
  onExport,
  onEmail,
  onSendReminder,
  onConvert,
  onDuplicate,
  onRestorePrevious,
  onAdvanceStatus,
  onAddCatalogLine,
  onAddAttachment,
  onOpenAttachment,
  onRemoveAttachment,
}: {
  doc: BusinessDocument;
  clients: Client[];
  catalog: AppData["catalog"];
  readOnly: boolean;
  canEditPayments: boolean;
  canRestorePrevious: boolean;
  canCreateCreditNote: boolean;
  canCreateReturnInvoice: boolean;
  onChange: (doc: BusinessDocument) => void;
  onSave: (doc: BusinessDocument) => void;
  saveState: DocumentSaveState;
  onPaymentChange: (doc: BusinessDocument) => void;
  onDelete: (doc: BusinessDocument) => void;
  onExport: (doc: BusinessDocument) => void;
  onEmail: (doc: BusinessDocument) => Promise<void>;
  onSendReminder: (doc: BusinessDocument, draft: ReminderDraft) => Promise<ReminderSendResult>;
  onConvert: (doc: BusinessDocument, type: DocumentType) => void;
  onDuplicate: (doc: BusinessDocument) => void;
  onRestorePrevious: (doc: BusinessDocument) => void;
  onAdvanceStatus: (doc: BusinessDocument) => void;
  onAddCatalogLine: (doc: BusinessDocument, catalogId: string) => void;
  onAddAttachment: (doc: BusinessDocument) => void;
  onOpenAttachment: (attachment: DocumentAttachment) => void;
  onRemoveAttachment: (doc: BusinessDocument, attachment: DocumentAttachment) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [marginTargets, setMarginTargets] = useState<Record<string, string>>({});
  const [marginHelperOpen, setMarginHelperOpen] = useState<Record<string, boolean>>({});
  const [paymentDraft, setPaymentDraft] = useState<{ amount: string; method: PaymentMethod; paidAt: string; note: string }>({
    amount: "",
    method: "bank_transfer",
    paidAt: todayIso(),
    note: "",
  });
  const [depositDraft, setDepositDraft] = useState<{ amount: string; paidAt: string }>({
    amount: "",
    paidAt: "",
  });
  const [reminderDraft, setReminderDraft] = useState<{ sentAt: string; channel: PaymentReminder["channel"]; note: string }>({
    sentAt: todayIso(),
    channel: "email",
    note: "",
  });
  const sums = totals(doc.lines);
  const paySummary = paymentSummary(doc, sums.totalTtc);
  const client = clients.find((item) => item.id === doc.clientId);
  const quickStatusLabel = "Encaisser solde";
  const previousHistory = doc.history[doc.history.length - 1];
  const patch = (partial: Partial<BusinessDocument>) => onChange({ ...doc, ...partial });
  const patchPayment = (partial: Partial<BusinessDocument>) => onPaymentChange({ ...doc, ...partial });
  const patchLine = (id: string, partial: Partial<LineItem>) =>
    patch({ lines: doc.lines.map((line) => (line.id === id ? { ...line, ...partial } : line)) });
  const removeLine = (line: LineItem) => {
    if (!confirmDestructiveAction(`Supprimer la ligne « ${line.description || "sans désignation"} » ?`)) return;
    patch({ lines: doc.lines.filter((item) => item.id !== line.id) });
  };
  const savedDepositAmount = Number(doc.depositPaidAmount) || 0;
  const savedDepositDate = savedDepositAmount > 0 ? doc.depositPaidAt || "" : "";
  const depositDraftAmount = depositDraft.amount.trim() ? Number(depositDraft.amount) : 0;
  const isDepositDraftValid = Number.isFinite(depositDraftAmount) && depositDraftAmount >= 0;
  const nextDepositDate = depositDraftAmount > 0 ? depositDraft.paidAt || todayIso() : "";
  const depositChanged =
    isDepositDraftValid &&
    (Math.round(depositDraftAmount * 100) !== Math.round(savedDepositAmount * 100) || nextDepositDate !== savedDepositDate);
  const paymentDraftAmount = Number(paymentDraft.amount);
  const hasPaymentDraft = paymentDraft.amount.trim() !== "";
  const isPaymentDraftValid = !hasPaymentDraft || (Number.isFinite(paymentDraftAmount) && paymentDraftAmount > 0);
  const canAddPayment = canEditPayments && isPaymentDraftValid && (depositChanged || hasPaymentDraft);
  const addPayment = () => {
    if (!canAddPayment) return;
    const partial: Partial<BusinessDocument> = {};
    if (depositChanged) {
      partial.depositPaidAmount = depositDraftAmount;
      partial.depositPaidAt = nextDepositDate;
    }
    if (hasPaymentDraft) {
      const payment: PaymentEntry = {
        id: makeId("payment"),
        amount: paymentDraftAmount,
        method: paymentDraft.method,
        paidAt: paymentDraft.paidAt || todayIso(),
        note: paymentDraft.note.trim(),
        createdAt: new Date().toISOString(),
      };
      partial.payments = [payment, ...(doc.payments || [])];
      setPaymentDraft({ amount: "", method: paymentDraft.method, paidAt: todayIso(), note: "" });
    }
    patchPayment(partial);
  };
  const removePayment = (paymentId: string) => {
    if (!canEditPayments) return;
    const payment = (doc.payments || []).find((entry) => entry.id === paymentId);
    if (!confirmDestructiveAction(`Supprimer le règlement${payment ? ` de ${currency(payment.amount)}` : ""} ?`)) return;
    patchPayment({ payments: (doc.payments || []).filter((payment) => payment.id !== paymentId) });
  };
  const addReminder = async () => {
    if (!canEditPayments || reminderSending) return;
    setReminderMessage(reminderDraft.channel === "email" ? "Préparation du PDF de relance..." : "Enregistrement de la relance...");
    setReminderSending(true);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const reminder: PaymentReminder = {
      id: makeId("reminder"),
      sentAt: reminderDraft.sentAt || todayIso(),
      channel: reminderDraft.channel,
      note: reminderDraft.note.trim(),
    };
    if (reminderDraft.channel === "email") {
      try {
        const result = await onSendReminder(doc, reminder);
        setReminderMessage(result.message);
        if (result.success) setReminderDraft({ sentAt: todayIso(), channel: reminderDraft.channel, note: "" });
      } catch (error) {
        console.error("Relance impossible", error);
        setReminderMessage("Relance impossible. Vérifiez le client mail ou l'adresse du client.");
      } finally {
        setReminderSending(false);
        window.setTimeout(() => setReminderMessage(""), 5200);
      }
      return;
    }
    patchPayment({ reminders: [reminder, ...(doc.reminders || [])] });
    setReminderDraft({ sentAt: todayIso(), channel: reminderDraft.channel, note: "" });
    setReminderSending(false);
    setReminderMessage("Relance enregistrée.");
    window.setTimeout(() => setReminderMessage(""), 2600);
  };
  const removeReminder = (reminderId: string) => {
    if (!canEditPayments) return;
    const reminder = (doc.reminders || []).find((entry) => entry.id === reminderId);
    if (!confirmDestructiveAction(`Supprimer la relance${reminder ? ` du ${formatShortDate(reminder.sentAt)}` : ""} ?`)) return;
    patchPayment({ reminders: (doc.reminders || []).filter((reminder) => reminder.id !== reminderId) });
  };

  useEffect(() => {
    setDepositDraft({
      amount: doc.depositPaidAmount ? String(doc.depositPaidAmount) : "",
      paidAt: doc.depositPaidAt || "",
    });
  }, [doc.id, doc.depositPaidAmount, doc.depositPaidAt]);

  const sendEmail = async () => {
    if (emailing) return;
    setEmailing(true);
    try {
      await onEmail(doc);
    } finally {
      setEmailing(false);
    }
  };

  return (
    <article className="editor">
      <div className="editorHeader editorActionBar">
        <div className="documentState">
          <span className="eyebrow">État du document</span>
          <StatusBadge status={doc.status} />
          <span className={`documentSaveStatus ${saveState}`}>
            {saveState === "dirty"
              ? "Modifications non enregistrées"
              : saveState === "saving"
                ? "Enregistrement…"
                : saveState === "error"
                  ? "Sauvegarde impossible"
                  : "Enregistré"}
          </span>
        </div>
        <div className="editorActions">
          <div className="editorActionGroup primaryActions">
            {!readOnly && (
              <button
                className={saveState === "dirty" || saveState === "error" ? "saveDocumentButton pending" : "saveDocumentButton"}
                disabled={saveState === "saved" || saveState === "saving"}
                onClick={() => onSave(doc)}
              >
                {saveState === "saving" ? <LoaderCircle className="spinIcon" size={17} /> : <Save size={17} />}
                {saveState === "saving" ? "Enregistrement…" : "Enregistrer"}
              </button>
            )}
            {!readOnly && doc.type === "quote" && (
              <button onClick={() => onConvert(doc, "order")}>
                <PackageCheck size={17} /> Transformer en BC
              </button>
            )}
            {!readOnly && doc.type === "order" && (
              <button onClick={() => onConvert(doc, "invoice")}>
                <ReceiptText size={17} /> Facturer
              </button>
            )}
            {canCreateCreditNote && (
              <button onClick={() => onConvert(doc, "creditNote")}>
                <ReceiptText size={17} /> Avoir
              </button>
            )}
            {canCreateReturnInvoice && (
              <button onClick={() => onConvert(doc, "returnInvoice")}>
                <PackageCheck size={17} /> Retour
              </button>
            )}
            {canEditPayments && doc.status !== "paid" && (
              <button onClick={() => onAdvanceStatus(doc)}>
                <Check size={17} /> {quickStatusLabel}
              </button>
            )}
          </div>
          <div className="editorActionGroup outputActions">
            <button onClick={() => onExport(doc)}>
              <Download size={17} /> PDF
            </button>
            <button className="ghost" disabled={emailing} onClick={sendEmail}>
              {emailing ? <LoaderCircle className="spinIcon" size={17} /> : <Mail size={17} />}
              {emailing ? "Préparation..." : "Email"}
            </button>
          </div>
          <div className="editorActionGroup secondaryActions">
            {!readOnly && (
              <button className="ghost" onClick={() => onDuplicate(doc)}>
                <CopyPlus size={17} /> Dupliquer
              </button>
            )}
            {doc.history.length > 0 && (
              <button className="ghost" onClick={() => setHistoryOpen((value) => !value)}>
                <History size={16} /> Historique
              </button>
            )}
            {canRestorePrevious && previousHistory && (
              <button className="ghost" onClick={() => onRestorePrevious(doc)}>
                <ArrowLeft size={17} /> Revenir en {labels[previousHistory.fromType]}
              </button>
            )}
            {!readOnly && (
              <button
                className="danger iconButton"
                title="Supprimer le document"
                aria-label="Supprimer le document"
                onClick={() => onDelete(doc)}
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        </div>
      </div>

      {historyOpen && <HistoryPanel doc={doc} />}

      <div className="documentInfoLayout">
        <section className="documentInfoCard">
          <div className="documentSectionTitle">
            <div>
              <span className="sectionStep">1</span>
              <div>
                <h3>Informations générales</h3>
                <p>Client, objet et calendrier du document</p>
              </div>
            </div>
          </div>
          <div className="editorGrid">
            <label>
              Client
              <select disabled={readOnly} value={doc.clientId} onChange={(event) => patch({ clientId: event.target.value })}>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {clientLabel(client)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nom du document / chantier
              <input
                disabled={readOnly}
                placeholder="Ex. : dressing chambre parentale"
                value={doc.projectName}
                onChange={(event) => patch({ projectName: event.target.value })}
              />
            </label>
            <label>
              Date d’émission
              <input disabled={readOnly} type="date" value={doc.issueDate} onChange={(event) => patch({ issueDate: event.target.value })} />
            </label>
            <label>
              Échéance
              <input disabled={readOnly} type="date" value={doc.dueDate} onChange={(event) => patch({ dueDate: event.target.value })} />
            </label>
          </div>
        </section>

        <section className="documentInfoCard">
          <div className="documentSectionTitle">
            <div>
              <span className="sectionStep">2</span>
              <div>
                <h3>Chantier et conditions</h3>
                <p>Lieu, planning et acompte demandé</p>
              </div>
            </div>
          </div>
          <div className="editorGrid">
            <label>
              Adresse du chantier
              <input
                disabled={readOnly}
                placeholder="Si différente de l’adresse client"
                value={doc.siteAddress}
                onChange={(event) => patch({ siteAddress: event.target.value })}
              />
            </label>
            <label>
              Démarrage prévu
              <input
                disabled={readOnly}
                placeholder="Ex. : semaine 42"
                value={doc.workStart}
                onChange={(event) => patch({ workStart: event.target.value })}
              />
            </label>
            <label>
              Durée estimée
              <input
                disabled={readOnly}
                placeholder="Ex. : 3 jours"
                value={doc.workDuration}
                onChange={(event) => patch({ workDuration: event.target.value })}
              />
            </label>
            <label>
              Acompte demandé
              <span className="suffixInput formSuffix">
                <input
                  disabled={readOnly}
                  type="number"
                  placeholder="30"
                  value={doc.depositRate || ""}
                  onChange={(event) => patch({ depositRate: Number(event.target.value) })}
                />
                <span>%</span>
              </span>
            </label>
          </div>
        </section>
      </div>

      <section className="documentSection lineEditorSection">
        <div className="documentSectionTitle">
          <div>
            <span className="sectionStep">3</span>
            <div>
              <h3>Articles et prestations</h3>
              <p>{doc.lines.length ? `${doc.lines.length} ligne(s) dans le document` : "Ajoutez les éléments à facturer"}</p>
            </div>
          </div>
        </div>
        {!readOnly && (
          <div className="lineToolbar">
            <select
              onChange={(event) => {
                onAddCatalogLine(doc, event.target.value);
                event.currentTarget.value = "";
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Ajouter depuis le catalogue
              </option>
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.category || "Sans catégorie"} - {item.name || "Élément sans nom"} ({currency(item.price)}/{item.unit || "u"})
                </option>
              ))}
            </select>
            <button onClick={() => patch({ lines: [...doc.lines, emptyLine(doc.lines[0]?.vatRate ?? 20)] })}>
              <CopyPlus size={17} /> Ligne libre
            </button>
          </div>
        )}

        {doc.lines.length ? (
          <div className="lineTable">
            <div className="lineHead">
              <span>Désignation</span>
              <span>Unité</span>
              <span>Qté</span>
              <span>PU HT</span>
              <span>Remise</span>
              <span>TVA</span>
              <span>Total</span>
              <span>Marge</span>
              <span></span>
            </div>
            {doc.lines.map((line) => {
              const margin = lineMargin(line);
              const targetMargin = Number(marginTargets[line.id]);
              const targetDiscount = Number.isFinite(targetMargin) ? requiredDiscountForMargin(line, targetMargin) : null;
              const canApplyTargetDiscount = targetDiscount !== null && targetDiscount >= 0 && targetDiscount <= 100;
              return (
                <div className="lineRow" key={line.id}>
                  <div>
                    <input
                      disabled={readOnly}
                      placeholder="Nom de l'article ou prestation"
                      value={line.description}
                      onChange={(event) => patchLine(line.id, { description: event.target.value })}
                    />
                    <textarea
                      disabled={readOnly}
                      value={line.details}
                      onChange={(event) => patchLine(line.id, { details: event.target.value })}
                      placeholder="Détails : essence, finition, quincaillerie, pose..."
                    />
                    {!readOnly && (
                      <div className="marginHelperShell">
                        <button
                          className="ghost subtleButton marginHelpButton"
                          type="button"
                          onClick={() => setMarginHelperOpen((open) => ({ ...open, [line.id]: !open[line.id] }))}
                        >
                          {marginHelperOpen[line.id] ? "Masquer aide marge" : "Aide marge"}
                        </button>
                        {marginHelperOpen[line.id] && (
                          <div className="marginHelper">
                            <label>
                              Marge cible
                              <span className="suffixInput compactSuffix">
                                <input
                                  type="number"
                                  placeholder="30"
                                  value={marginTargets[line.id] || ""}
                                  onChange={(event) => setMarginTargets((targets) => ({ ...targets, [line.id]: event.target.value }))}
                                />
                                <span>%</span>
                              </span>
                            </label>
                            <div>
                              {!line.purchasePrice ? (
                                <span>Main d'oeuvre : marge 100%</span>
                              ) : targetDiscount === null || !marginTargets[line.id] ? (
                                <span>Renseignez une marge cible</span>
                              ) : canApplyTargetDiscount ? (
                                <span>Remise conseillée : {targetDiscount.toFixed(1)}%</span>
                              ) : (
                                <span>Objectif impossible avec ce prix d'achat</span>
                              )}
                              <button
                                className="ghost subtleButton"
                                type="button"
                                disabled={!canApplyTargetDiscount}
                                onClick={() => patchLine(line.id, { discount: Number(targetDiscount?.toFixed(2)) })}
                              >
                                Appliquer
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <input
                    disabled={readOnly}
                    placeholder="u, ml, m2, h"
                    value={line.unit}
                    onChange={(event) => patchLine(line.id, { unit: event.target.value })}
                  />
                  <input
                    disabled={readOnly}
                    type="number"
                    placeholder="1"
                    value={line.quantity || ""}
                    onChange={(event) => patchLine(line.id, { quantity: Number(event.target.value) })}
                  />
                  <input
                    disabled={readOnly}
                    type="number"
                    placeholder="0.00"
                    value={line.unitPrice || ""}
                    onChange={(event) => patchLine(line.id, { unitPrice: Number(event.target.value) })}
                  />
                  <span className="suffixInput">
                    <input
                      disabled={readOnly}
                      type="number"
                      placeholder="0"
                      value={line.discount || ""}
                      onChange={(event) => patchLine(line.id, { discount: Number(event.target.value) })}
                    />
                    <span>%</span>
                  </span>
                  <span className="suffixInput">
                    <input
                      disabled={readOnly}
                      type="number"
                      placeholder="20"
                      value={line.vatRate || ""}
                      onChange={(event) => patchLine(line.id, { vatRate: Number(event.target.value) })}
                    />
                    <span>%</span>
                  </span>
                  <strong>{currency(line.quantity * line.unitPrice * (1 - line.discount / 100))}</strong>
                  <strong className={margin.amount < 0 ? "marginValue negative" : "marginValue"}>
                    <span>{currency(margin.amount)}</span>
                    <em>{margin.rate.toFixed(0)}%</em>
                  </strong>
                  {!readOnly && (
                    <button className="iconButton dangerIcon" title="Supprimer cette ligne" onClick={() => removeLine(line)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="documentLinesEmpty">
            <PackageCheck size={28} />
            <div>
              <strong>Aucune ligne pour le moment</strong>
              <span>Utilisez le catalogue ou ajoutez une ligne libre pour commencer.</span>
            </div>
          </div>
        )}
      </section>

      <section className="documentSection summarySection">
        <div className="documentSectionTitle">
          <div>
            <span className="sectionStep">4</span>
            <div>
              <h3>Conditions et totaux</h3>
              <p>Informations finales qui apparaîtront sur le document</p>
            </div>
          </div>
        </div>
        <div className="bottomEditor">
          <label>
            Note document
            <textarea
              disabled={readOnly}
              placeholder="Informations affichées sur ce document"
              value={doc.notes}
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </label>
          <label>
            Conditions
            <textarea
              disabled={readOnly}
              placeholder="Conditions propres à ce document"
              value={doc.terms}
              onChange={(event) => patch({ terms: event.target.value })}
            />
          </label>
          <div className="totalsBox">
            <div>
              <span>Total HT</span>
              <strong>{currency(sums.totalHt)}</strong>
            </div>
            {Object.entries(sums.vatGroups).map(([rate, amount]) => (
              <div key={rate}>
                <span>TVA {rate}%</span>
                <strong>{currency(amount)}</strong>
              </div>
            ))}
            <div className="grand">
              <span>Total TTC</span>
              <strong>{currency(sums.totalTtc)}</strong>
            </div>
            <div>
              <span>Acompte</span>
              <strong>{currency(sums.totalTtc * (doc.depositRate / 100))}</strong>
            </div>
          </div>
        </div>
      </section>

      {doc.type === "invoice" && (
        <section className="paymentPanel" aria-label="Paiements">
          <div className="paymentSummary">
            <div>
              <span>Acompte encaissé</span>
              <strong>{currency(paySummary.depositPaidAmount)}</strong>
            </div>
            <div>
              <span>Règlements</span>
              <strong>{currency(paySummary.paymentAmount)}</strong>
            </div>
            <div>
              <span>Reste dû</span>
              <strong>{currency(paySummary.remainingAmount)}</strong>
            </div>
          </div>
          <div className="paymentGrid">
            <label>
              Acompte encaissé
              <input
                disabled={!canEditPayments}
                type="number"
                min="0"
                step="0.01"
                value={depositDraft.amount}
                onChange={(event) => {
                  const amount = event.target.value;
                  setDepositDraft((draft) => ({
                    amount,
                    paidAt: Number(amount) > 0 ? draft.paidAt || todayIso() : "",
                  }));
                }}
              />
            </label>
            <label>
              Date acompte
              <input
                disabled={!canEditPayments}
                type="date"
                value={depositDraft.paidAt}
                onChange={(event) => setDepositDraft((draft) => ({ ...draft, paidAt: event.target.value }))}
              />
            </label>
            <label>
              Reste dû
              <input disabled type="number" min="0" step="0.01" value={paySummary.remainingAmount.toFixed(2)} readOnly />
            </label>
            <label>
              Règlement à ajouter
              <input
                disabled={!canEditPayments}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={paymentDraft.amount}
                onChange={(event) => setPaymentDraft((draft) => ({ ...draft, amount: event.target.value }))}
              />
            </label>
            <label>
              Date règlement
              <input
                disabled={!canEditPayments}
                type="date"
                value={paymentDraft.paidAt}
                onChange={(event) => setPaymentDraft((draft) => ({ ...draft, paidAt: event.target.value }))}
              />
            </label>
            <label>
              Mode
              <select
                disabled={!canEditPayments}
                value={paymentDraft.method}
                onChange={(event) => setPaymentDraft((draft) => ({ ...draft, method: event.target.value as PaymentMethod }))}
              >
                {Object.entries(paymentMethodLabels).map(([method, label]) => (
                  <option key={method} value={method}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note règlement
              <input
                disabled={!canEditPayments}
                value={paymentDraft.note}
                onChange={(event) => setPaymentDraft((draft) => ({ ...draft, note: event.target.value }))}
                placeholder="Référence, banque..."
              />
            </label>
            <button type="button" disabled={!canAddPayment} onClick={addPayment}>
              <Check size={17} /> Ajouter règlement
            </button>
          </div>
          <label className="fullLabel">
            Notes paiement
            <textarea
              disabled={!canEditPayments}
              value={doc.paymentNotes || ""}
              onChange={(event) => patchPayment({ paymentNotes: event.target.value })}
              placeholder="Informations internes de règlement"
            />
          </label>
          {!!doc.payments?.length && (
            <div className="paymentRows">
              {doc.payments.map((payment) => (
                <div className="paymentRow" key={payment.id}>
                  <span>{formatShortDate(payment.paidAt)}</span>
                  <strong>{currency(payment.amount)}</strong>
                  <em>{paymentMethodLabels[payment.method]}</em>
                  <small>{payment.note}</small>
                  <button
                    className="iconButton dangerIcon"
                    type="button"
                    disabled={!canEditPayments}
                    onClick={() => removePayment(payment.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="reminderBlock">
            <div className="paymentGrid reminderGrid">
              <label>
                Date relance
                <input
                  disabled={!canEditPayments || reminderSending}
                  type="date"
                  value={reminderDraft.sentAt}
                  onChange={(event) => setReminderDraft((draft) => ({ ...draft, sentAt: event.target.value }))}
                />
              </label>
              <label>
                Canal
                <select
                  disabled={!canEditPayments || reminderSending}
                  value={reminderDraft.channel}
                  onChange={(event) =>
                    setReminderDraft((draft) => ({ ...draft, channel: event.target.value as PaymentReminder["channel"] }))
                  }
                >
                  <option value="email">Email</option>
                  <option value="phone">Téléphone</option>
                  <option value="letter">Courrier</option>
                  <option value="other">Autre</option>
                </select>
              </label>
              <label>
                Note relance
                <input
                  disabled={!canEditPayments || reminderSending}
                  value={reminderDraft.note}
                  onChange={(event) => setReminderDraft((draft) => ({ ...draft, note: event.target.value }))}
                  placeholder="Relance envoyée, réponse client..."
                />
              </label>
              <button type="button" disabled={!canEditPayments || reminderSending} onClick={addReminder}>
                {reminderSending ? <LoaderCircle className="spinIcon" size={17} /> : <Mail size={17} />}
                {reminderSending ? "Préparation PDF..." : "Ajouter relance"}
              </button>
            </div>
            {reminderMessage && <div className={reminderSending ? "reminderFeedback pending" : "reminderFeedback"}>{reminderMessage}</div>}
            {!!doc.reminders?.length && (
              <div className="paymentRows">
                {doc.reminders.map((reminder) => (
                  <div className="paymentRow reminderRow" key={reminder.id}>
                    <span>{formatShortDate(reminder.sentAt)}</span>
                    <strong>{reminder.channel}</strong>
                    <small>{reminder.note}</small>
                    <button
                      className="iconButton dangerIcon"
                      type="button"
                      disabled={!canEditPayments}
                      onClick={() => removeReminder(reminder.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="attachmentsPanel" aria-label="Pièces jointes">
        <div className="attachmentsSummary">
          <div className="attachmentsTitle">
            <Paperclip size={15} />
            <div>
              <h3>Documents associés</h3>
              <span>{doc.attachments.length ? `${doc.attachments.length} pièce(s) jointe(s)` : "Aucune pièce jointe"}</span>
            </div>
          </div>
          {!readOnly && (
            <button className="ghost attachmentAddButton" onClick={() => onAddAttachment(doc)} title="Ajouter une pièce jointe">
              <Paperclip size={16} /> Ajouter
            </button>
          )}
        </div>
        {doc.attachments.length > 0 && (
          <div className="attachmentList">
            {doc.attachments.map((attachment) => (
              <div className="attachmentRow" key={attachment.id}>
                <div>
                  <strong>{attachment.name}</strong>
                  <span>
                    {fileSizeLabel(attachment.size)} - ajouté le {formatShortDate(attachment.addedAt)}
                  </span>
                </div>
                <button className="iconButton" onClick={() => onOpenAttachment(attachment)} title="Ouvrir la pièce jointe">
                  <ExternalLink size={16} />
                </button>
                {!readOnly && (
                  <button
                    className="iconButton dangerIcon"
                    onClick={() => onRemoveAttachment(doc, attachment)}
                    title="Supprimer la pièce jointe"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="previewDisclosure">
        <button className="ghost previewToggle" type="button" onClick={() => setPreviewOpen((open) => !open)}>
          <Eye size={17} /> {previewOpen ? "Masquer l’aperçu" : "Afficher l’aperçu"}
        </button>
        {previewOpen && <DocumentPreview doc={doc} client={client} sums={sums} />}
      </section>
    </article>
  );
}

function HistoryPanel({ doc }: { doc: BusinessDocument }) {
  return (
    <section className="historyPanel">
      {doc.history.map((entry) => (
        <article key={entry.id}>
          <span>{new Date(entry.transformedAt).toLocaleString("fr-FR")}</span>
          <strong>
            {labels[entry.fromType]} {entry.fromNumber} {"->"} {labels[entry.toType]} {entry.toNumber}
          </strong>
          <em>
            {entry.snapshot.projectName || "Sans nom"} · {currency(totals(entry.snapshot.lines).totalTtc)}
          </em>
        </article>
      ))}
    </section>
  );
}

function DocumentPreview({ doc, client, sums }: { doc: BusinessDocument; client?: Client; sums: ReturnType<typeof totals> }) {
  return (
    <section className="documentPreview">
      <div className="previewHeader">
        <div>
          <span className="eyebrow">{labels[doc.type]}</span>
          <h3>{doc.number}</h3>
        </div>
        <StatusBadge status={doc.status} />
      </div>
      <div className="previewMeta">
        <strong>{clientLabel(client)}</strong>
        <span>{doc.projectName || "Document sans nom"}</span>
        <span>
          {doc.issueDate} · {doc.dueDate}
        </span>
      </div>
      <div className="previewLines">
        {doc.lines.slice(0, 4).map((line) => (
          <div key={line.id}>
            <span>{line.description || "Ligne sans designation"}</span>
            <strong>{currency(line.quantity * line.unitPrice * (1 - line.discount / 100))}</strong>
          </div>
        ))}
        {doc.lines.length > 4 && <em>+ {doc.lines.length - 4} ligne(s)</em>}
      </div>
      <div className="previewTotal">
        <span>Total TTC</span>
        <strong>{currency(sums.totalTtc)}</strong>
      </div>
    </section>
  );
}

function CatalogManager({
  items,
  suppliers,
  onCreate,
  onChange,
  onDelete,
}: {
  items: CatalogItem[];
  suppliers: Supplier[];
  onCreate: () => void;
  onChange: (item: CatalogItem) => void;
  onDelete: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "tracked" | "low" | "out" | "untracked">("all");
  const [movementDrafts, setMovementDrafts] = useState<Record<string, { quantity: string; reason: string }>>({});
  const [movementOpen, setMovementOpen] = useState<Record<string, boolean>>({});
  const trackedItems = items.filter((item) => item.trackStock);
  const lowStockCount = trackedItems.filter((item) => item.stockQuantity > 0 && item.stockQuantity <= item.stockMinimum).length;
  const outOfStockCount = trackedItems.filter((item) => item.stockQuantity <= 0).length;
  const filtered = items
    .filter((item) =>
      normalizeSearch(`${item.name} ${item.category} ${item.unit} ${item.supplier} ${item.location}`).includes(
        normalizeSearch(query.trim())
      )
    )
    .filter((item) => {
      if (stockFilter === "tracked") return item.trackStock;
      if (stockFilter === "untracked") return !item.trackStock;
      if (stockFilter === "low") return item.trackStock && item.stockQuantity > 0 && item.stockQuantity <= item.stockMinimum;
      if (stockFilter === "out") return item.trackStock && item.stockQuantity <= 0;
      return true;
    });
  const patch = (item: CatalogItem, partial: Partial<CatalogItem>) => onChange({ ...item, ...partial });
  const movementDraft = (itemId: string) => movementDrafts[itemId] || { quantity: "", reason: "" };
  const patchMovementDraft = (itemId: string, partial: Partial<{ quantity: string; reason: string }>) =>
    setMovementDrafts((drafts) => ({ ...drafts, [itemId]: { ...movementDraft(itemId), ...partial } }));
  const stockTone = (item: CatalogItem) => {
    if (!item.trackStock) return "neutral";
    if (item.stockQuantity <= 0) return "danger";
    if (item.stockQuantity <= item.stockMinimum) return "warning";
    return "success";
  };
  const stockLabel = (item: CatalogItem) => {
    if (!item.trackStock) return "Non suivi";
    if (item.stockQuantity <= 0) return "Rupture";
    if (item.stockQuantity <= item.stockMinimum) return "Stock bas";
    return "Stock OK";
  };
  const applyStockMovement = (item: CatalogItem, type: StockMovement["type"]) => {
    const draft = movementDraft(item.id);
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) return;
    const previousQuantity = Number(item.stockQuantity) || 0;
    const nextQuantity =
      type === "entry" ? previousQuantity + quantity : type === "exit" ? Math.max(0, previousQuantity - quantity) : quantity;
    const movement: StockMovement = {
      id: makeId("stock"),
      type,
      quantity: type === "adjustment" ? Math.abs(nextQuantity - previousQuantity) : quantity,
      previousQuantity,
      nextQuantity,
      reason: draft.reason.trim() || (type === "entry" ? "Entrée de stock" : type === "exit" ? "Sortie de stock" : "Correction inventaire"),
      createdAt: new Date().toISOString(),
    };
    onChange({
      ...item,
      trackStock: true,
      stockQuantity: nextQuantity,
      stockMovements: [movement, ...(item.stockMovements || [])].slice(0, 30),
    });
    setMovementDrafts((drafts) => ({ ...drafts, [item.id]: { quantity: "", reason: "" } }));
  };

  return (
    <section className="catalogPanel">
      <div className="catalogToolbar">
        <div className="searchBox">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un article, une prestation, une catégorie..."
          />
        </div>
        <select
          aria-label="Filtrer le catalogue"
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}
        >
          <option value="all">Tout le catalogue</option>
          <option value="tracked">Stock suivi</option>
          <option value="low">Stock bas</option>
          <option value="out">En rupture</option>
          <option value="untracked">Sans suivi de stock</option>
        </select>
        <button onClick={onCreate}>
          <Plus size={17} /> Nouvel élément
        </button>
      </div>
      <div className="stockSummary">
        <div>
          <span>Éléments</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <span>Stock suivi</span>
          <strong>{trackedItems.length}</strong>
        </div>
        <div>
          <span>Stock bas</span>
          <strong>{lowStockCount}</strong>
        </div>
        <div>
          <span>Rupture</span>
          <strong>{outOfStockCount}</strong>
        </div>
      </div>
      <div className="catalogList">
        {filtered.map((item) => (
          <article key={item.id} className="catalogRow">
            <div className="catalogMain">
              <div className="catalogRowHeader">
                <div>
                  <strong>{item.name || "Élément sans nom"}</strong>
                  <span>{item.category || "Sans catégorie"}</span>
                </div>
                <span className={`statusBadge ${stockTone(item)}`}>{stockLabel(item)}</span>
                <button
                  className="iconButton dangerIcon"
                  title="Supprimer cet élément"
                  aria-label="Supprimer cet élément"
                  onClick={() => onDelete(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="catalogFields">
                <label>
                  Nom
                  <input
                    placeholder="Ex: Pose et ajustements"
                    value={item.name}
                    onChange={(event) => patch(item, { name: event.target.value })}
                  />
                </label>
                <label>
                  Catégorie
                  <input
                    placeholder="Ex. : pose, fabrication"
                    value={item.category}
                    onChange={(event) => patch(item, { category: event.target.value })}
                  />
                </label>
                <label>
                  Unité
                  <input
                    placeholder="u, h, ml, m2"
                    value={item.unit}
                    onChange={(event) => patch(item, { unit: event.target.value, stockUnit: event.target.value })}
                  />
                </label>
                <label>
                  Prix HT
                  <input
                    type="number"
                    placeholder="0.00"
                    value={item.price || ""}
                    onChange={(event) => patch(item, { price: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Prix d'achat
                  <input
                    type="number"
                    placeholder="0 = main d'oeuvre"
                    value={item.purchasePrice || ""}
                    onChange={(event) => patch(item, { purchasePrice: Number(event.target.value) })}
                  />
                </label>
                <label>
                  TVA
                  <span className="suffixInput formSuffix">
                    <input
                      type="number"
                      placeholder="20"
                      value={item.vatRate || ""}
                      onChange={(event) => patch(item, { vatRate: Number(event.target.value) })}
                    />
                    <span>%</span>
                  </span>
                </label>
              </div>
            </div>
            <div className="stockBlock">
              <label className="stockToggle">
                <input
                  type="checkbox"
                  checked={item.trackStock}
                  onChange={(event) => patch(item, { trackStock: event.target.checked, stockUnit: item.unit })}
                />
                Suivi du stock
              </label>
              {item.trackStock && (
                <>
                  <div className="stockFields">
                    <label>
                      Stock actuel
                      <input
                        type="number"
                        value={item.stockQuantity || ""}
                        onChange={(event) => patch(item, { stockQuantity: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Stock minimum
                      <input
                        type="number"
                        value={item.stockMinimum || ""}
                        onChange={(event) => patch(item, { stockMinimum: Number(event.target.value) })}
                      />
                    </label>
                    <div className="stockUnitReadout">
                      <span>Unité stock</span>
                      <strong>{item.unit || "u"}</strong>
                    </div>
                    <label>
                      Fournisseur
                      <select
                        value={item.supplierId || ""}
                        onChange={(event) => {
                          const supplier = suppliers.find((entry) => entry.id === event.target.value);
                          patch(item, { supplierId: supplier?.id, supplier: supplier?.name || "" });
                        }}
                      >
                        <option value="">Non rattaché</option>
                        {[...suppliers]
                          .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                          .map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Emplacement
                      <input
                        placeholder="Stock, dépôt..."
                        value={item.location}
                        onChange={(event) => patch(item, { location: event.target.value })}
                      />
                    </label>
                  </div>
                  <button
                    className="ghost subtleButton stockMovementToggle"
                    type="button"
                    onClick={() => setMovementOpen((open) => ({ ...open, [item.id]: !open[item.id] }))}
                  >
                    {movementOpen[item.id] ? "Masquer entrées / sorties" : "Entrées / sorties"}
                  </button>
                  {movementOpen[item.id] && (
                    <div className="stockMovementPanel">
                      <div className="stockMovement">
                        <input
                          type="number"
                          min="0"
                          placeholder="Qté"
                          value={movementDraft(item.id).quantity}
                          onChange={(event) => patchMovementDraft(item.id, { quantity: event.target.value })}
                        />
                        <input
                          placeholder="Motif"
                          value={movementDraft(item.id).reason}
                          onChange={(event) => patchMovementDraft(item.id, { reason: event.target.value })}
                        />
                        <button className="ghost subtleButton" type="button" onClick={() => applyStockMovement(item, "entry")}>
                          Entrée
                        </button>
                        <button className="ghost subtleButton" type="button" onClick={() => applyStockMovement(item, "exit")}>
                          Sortie
                        </button>
                        <button className="ghost subtleButton" type="button" onClick={() => applyStockMovement(item, "adjustment")}>
                          Corriger
                        </button>
                      </div>
                      {!!item.stockMovements?.length && (
                        <div className="stockHistory">
                          {item.stockMovements.slice(0, 3).map((movement) => (
                            <span key={movement.id}>
                              {formatShortDate(movement.createdAt)} : {movement.previousQuantity}
                              {" -> "}
                              {movement.nextQuantity} {item.unit || "u"} ({movement.reason})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        {!filtered.length && (
          <div className="emptyRows">
            {items.length
              ? "Aucun élément ne correspond à cette recherche ou à ce filtre."
              : "Le catalogue est vide. Ajoutez un premier article ou une prestation."}
          </div>
        )}
      </div>
    </section>
  );
}

const clientDocumentTypes: DocumentType[] = ["quote", "order", "invoice", "creditNote", "returnInvoice"];
const clientCreateDocumentTypes: DocumentType[] = ["quote", "order", "invoice"];

function ClientFolder({
  client,
  documents,
  readOnly,
  canDelete,
  canCreateDocument,
  onChange,
  onDelete,
  onOpenDocument,
  onCreateDocument,
}: {
  client: Client;
  documents: BusinessDocument[];
  readOnly: boolean;
  canDelete: boolean;
  canCreateDocument: boolean;
  onChange: (client: Client) => Promise<boolean>;
  onDelete: (client: Client) => void;
  onOpenDocument: (id: string) => void;
  onCreateDocument: (type: DocumentType) => void;
}) {
  const [section, setSection] = useState<"profile" | "documents">("profile");
  const invoiceDue = documents.reduce((sum, doc) => {
    if (doc.type !== "invoice") return sum;
    return sum + paymentSummary(doc).remainingAmount;
  }, 0);
  const totalBusiness = documents.reduce((sum, doc) => sum + totals(doc.lines).totalTtc, 0);
  const lastActivity = documents[0] ? formatShortDate(activityDate(documents[0])) : "Aucune activité";

  return (
    <section className="clientFolder">
      <div className="clientFolderHeader">
        <div>
          <span className="eyebrow">Dossier client</span>
          <h2>{client.name || "Client sans nom"}</h2>
          <p>
            {client.number} · {client.email || client.phone || `${client.postalCode} ${client.city}`.trim() || "Coordonnées à renseigner"}
          </p>
        </div>
        {canCreateDocument && (
          <div className="clientFolderActions">
            {clientCreateDocumentTypes.map((type) => (
              <button key={type} className={type === "quote" ? "" : "ghost"} onClick={() => onCreateDocument(type)}>
                <Plus size={16} /> {type === "quote" ? "Nouveau devis" : labels[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="clientFolderSummary">
        <span>{documents.length} document(s)</span>
        <span>{currency(totalBusiness)} TTC</span>
        <span>{invoiceDue > 0 ? `${currency(invoiceDue)} à encaisser` : "Rien à encaisser"}</span>
        <span>Dernière activité : {lastActivity}</span>
      </div>

      <div className="clientFolderTabs" role="tablist" aria-label="Sections du dossier client">
        <button type="button" className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}>
          Fiche
        </button>
        <button type="button" className={section === "documents" ? "active" : ""} onClick={() => setSection("documents")}>
          Documents
        </button>
      </div>

      <div className="clientFolderBody">
        {section === "profile" ? (
          <ClientCard client={client} readOnly={readOnly} canDelete={canDelete} onChange={onChange} onDelete={onDelete} />
        ) : (
          <section className="clientDocumentsPanel">
            {documents.length ? (
              <div className="clientDocumentGroups">
                {clientDocumentTypes.map((type) => {
                  const group = documents.filter((doc) => doc.type === type);
                  if (!group.length) return null;
                  return (
                    <div className="clientDocumentGroup" key={type}>
                      <div className="clientDocumentGroupTitle">
                        <strong>{labels[type]}</strong>
                        <span>{group.length}</span>
                      </div>
                      <div className="clientDocumentRows">
                        {group.map((doc) => {
                          const sum = totals(doc.lines).totalTtc;
                          const due = doc.type === "invoice" ? paymentSummary(doc, sum).remainingAmount : null;
                          return (
                            <button className="clientDocumentRow" key={doc.id} onClick={() => onOpenDocument(doc.id)}>
                              <span>{formatShortDate(activityDate(doc))}</span>
                              <strong>
                                {doc.number}
                                <small>{doc.projectName || "Sans nom"}</small>
                              </strong>
                              <em>{currency(sum)}</em>
                              {due !== null && due > 0.005 ? <b>{currency(due)} dû</b> : <StatusBadge status={doc.status} />}
                              <ChevronRight size={16} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="emptyState clientDocumentsEmpty">
                <FileText size={38} />
                <h2>Aucun document client</h2>
                <p>Créez un devis, un bon de commande ou une facture depuis ce dossier.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}

function ClientCard({
  client,
  readOnly,
  canDelete,
  onChange,
  onDelete,
}: {
  client: Client;
  readOnly: boolean;
  canDelete: boolean;
  onChange: (client: Client) => Promise<boolean>;
  onDelete: (client: Client) => void;
}) {
  const [draft, setDraft] = useState(client);
  const [saving, setSaving] = useState(false);
  const draftSignature = [
    client.id,
    client.number,
    client.type,
    client.name,
    client.contact,
    client.email,
    client.phone,
    client.address,
    client.postalCode,
    client.city,
    client.notes,
  ].join("\u0000");
  useEffect(() => setDraft(client), [draftSignature]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(client);
  const patch = (partial: Partial<Client>) => setDraft((current) => ({ ...current, ...partial }));
  async function saveClient() {
    if (readOnly || saving) return;
    setSaving(true);
    const saved = await onChange({ ...draft, name: draft.name.trim() || "Client à renseigner" });
    setSaving(false);
    if (saved) setDraft({ ...draft, name: draft.name.trim() || "Client à renseigner" });
  }
  return (
    <article className="clientCard">
      <div className="cardHeader">
        <strong>{draft.number}</strong>
        <div className="clientCardActions">
          {!readOnly && (
            <button className="ghost subtleButton" type="button" disabled={saving || !dirty} onClick={() => void saveClient()}>
              <Save size={16} /> {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          )}
          {canDelete && (
            <button className="iconButton" type="button" onClick={() => onDelete(draft)}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      <label>
        Type
        <select disabled={readOnly} value={draft.type} onChange={(event) => patch({ type: event.target.value as Client["type"] })}>
          <option value="particulier">Particulier</option>
          <option value="professionnel">Professionnel</option>
        </select>
      </label>
      <label>
        Nom
        <input
          disabled={readOnly}
          placeholder="Nom du client ou société"
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </label>
      <label>
        Email
        <input
          disabled={readOnly}
          placeholder="client@email.fr"
          value={draft.email}
          onChange={(event) => patch({ email: event.target.value })}
        />
      </label>
      <label>
        Téléphone
        <input
          disabled={readOnly}
          inputMode="tel"
          placeholder="06 00 00 00 00"
          value={draft.phone}
          onChange={(event) => patch({ phone: formatPhoneNumber(event.target.value) })}
        />
      </label>
      <label>
        Adresse
        <input
          disabled={readOnly}
          placeholder="Adresse du client"
          value={draft.address}
          onChange={(event) => patch({ address: event.target.value })}
        />
      </label>
      <div className="twoCols">
        <label>
          CP
          <input
            disabled={readOnly}
            placeholder="75000"
            value={draft.postalCode}
            onChange={(event) => patch({ postalCode: event.target.value })}
          />
        </label>
        <label>
          Ville
          <input disabled={readOnly} placeholder="Paris" value={draft.city} onChange={(event) => patch({ city: event.target.value })} />
        </label>
      </div>
      <label>
        Notes
        <textarea
          disabled={readOnly}
          placeholder="Informations internes"
          value={draft.notes}
          onChange={(event) => patch({ notes: event.target.value })}
        />
      </label>
    </article>
  );
}

const companyIdentityFields: Array<[keyof CompanySettings, string, "text" | "number", string]> = [
  ["name", "Nom commercial", "text", "Votre société"],
  ["legalName", "Raison sociale", "text", "SARL / SAS / EI"],
  ["siret", "SIRET", "text", "123 456 789 00010"],
  ["vatNumber", "N° TVA", "text", "FR..."],
  ["address", "Adresse", "text", "12 rue des Copeaux"],
  ["postalCode", "Code postal", "text", "75000"],
  ["city", "Ville", "text", "Paris"],
  ["phone", "Téléphone", "text", "01 23 45 67 89"],
  ["email", "Email", "text", "contact@societe.fr"],
  ["website", "Site web", "text", "https://..."],
  ["iban", "IBAN", "text", "FR76..."],
  ["bic", "BIC", "text", "ABCDEFGH"],
  ["quoteValidityDays", "Validité devis (jours)", "number", "30"],
  ["defaultVatRate", "TVA par défaut", "number", "20"],
  ["defaultDepositRate", "Acompte par défaut", "number", "30"],
];

function CompanySettingsEditor({
  company,
  readOnly,
  onSave,
}: {
  company: CompanySettings;
  readOnly: boolean;
  onSave: (company: CompanySettings) => Promise<boolean>;
}) {
  const [identityDraft, setIdentityDraft] = useState(company);
  const [paymentTermsDraft, setPaymentTermsDraft] = useState(company.paymentTerms);
  const [notesDraft, setNotesDraft] = useState(company.notes);
  const [savingBlock, setSavingBlock] = useState<string | null>(null);
  const [savedBlock, setSavedBlock] = useState<string | null>(null);
  const saveLock = useRef(false);

  const identitySignature = companyIdentityFields.map(([key]) => String(company[key] ?? "")).join("\u0000");

  useEffect(() => setIdentityDraft(company), [identitySignature]);
  useEffect(() => setPaymentTermsDraft(company.paymentTerms), [company.paymentTerms]);
  useEffect(() => setNotesDraft(company.notes), [company.notes]);

  async function saveBlock(block: string, next: CompanySettings) {
    if (saveLock.current) return;
    saveLock.current = true;
    setSavedBlock(null);
    setSavingBlock(block);
    const saved = await onSave(next);
    setSavingBlock(null);
    if (!saved) {
      saveLock.current = false;
      return;
    }
    setSavedBlock(block);
    window.setTimeout(() => {
      setSavedBlock((current) => (current === block ? null : current));
      saveLock.current = false;
    }, 1800);
  }

  function saveIdentity() {
    const next = { ...company };
    for (const [key] of companyIdentityFields) {
      (next as unknown as Record<keyof CompanySettings, CompanySettings[keyof CompanySettings]>)[key] = identityDraft[key];
    }
    void saveBlock("identity", next);
  }

  return (
    <div className="companySettingsBlocks">
      <section className="companySettingsBlock">
        <FormGrid value={identityDraft} readOnly={readOnly} onChange={setIdentityDraft} fields={companyIdentityFields} />
        {!readOnly && (
          <div className="settingsSaveAction">
            {savedBlock === "identity" && (
              <span className="inlineSaveConfirmation">
                <Check size={16} /> Enregistré
              </span>
            )}
            <button
              type="button"
              className={savedBlock === "identity" ? "saveButton saved" : "saveButton"}
              disabled={savingBlock !== null || savedBlock !== null}
              onClick={saveIdentity}
            >
              {savedBlock === "identity" ? <Check size={17} /> : <Save size={17} />}
              {savingBlock === "identity" ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </section>

      <section className="companySettingsBlock">
        <label className="fullLabel">
          Conditions de paiement
          <textarea
            disabled={readOnly}
            placeholder="Ex. : 30 % d'acompte à la commande..."
            value={paymentTermsDraft}
            onChange={(event) => setPaymentTermsDraft(event.target.value)}
          />
        </label>
        {!readOnly && (
          <div className="settingsSaveAction">
            {savedBlock === "payment" && (
              <span className="inlineSaveConfirmation">
                <Check size={16} /> Enregistré
              </span>
            )}
            <button
              type="button"
              className={savedBlock === "payment" ? "saveButton saved" : "saveButton"}
              disabled={savingBlock !== null || savedBlock !== null}
              onClick={() => void saveBlock("payment", { ...company, paymentTerms: paymentTermsDraft })}
            >
              {savedBlock === "payment" ? <Check size={17} /> : <Save size={17} />}
              {savingBlock === "payment" ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </section>

      <section className="companySettingsBlock">
        <label className="fullLabel">
          Note par défaut
          <textarea
            disabled={readOnly}
            placeholder="Note affichée sur les nouveaux documents"
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
          />
        </label>
        {!readOnly && (
          <div className="settingsSaveAction">
            {savedBlock === "notes" && (
              <span className="inlineSaveConfirmation">
                <Check size={16} /> Enregistré
              </span>
            )}
            <button
              type="button"
              className={savedBlock === "notes" ? "saveButton saved" : "saveButton"}
              disabled={savingBlock !== null || savedBlock !== null}
              onClick={() => void saveBlock("notes", { ...company, notes: notesDraft })}
            >
              {savedBlock === "notes" ? <Check size={17} /> : <Save size={17} />}
              {savingBlock === "notes" ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function FormGrid<T extends CompanySettings>({
  value,
  fields,
  readOnly = false,
  onChange,
}: {
  value: T;
  fields: Array<[keyof T, string, "text" | "number", string]>;
  readOnly?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="formGrid">
      {fields.map(([key, label, type, placeholder]) => (
        <label key={String(key)}>
          {label}
          <input
            disabled={readOnly}
            type={type}
            placeholder={placeholder}
            value={String(value[key] ?? "")}
            onChange={(event) => {
              const textValue = String(key) === "phone" ? formatPhoneNumber(event.target.value) : event.target.value;
              onChange({ ...value, [key]: type === "number" ? Number(event.target.value) : textValue });
            }}
          />
        </label>
      ))}
    </div>
  );
}
