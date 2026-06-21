import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clipboard,
  CopyPlus,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  Home,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  Mail,
  PackageCheck,
  Paperclip,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { applyDocumentStockImpact, creditLines, makeDocumentSnapshot } from "./businessLogic";
import { createDefaultAppData, normalizeData } from "./defaultData";
import { renderCompanyHtml, renderDocumentHtml } from "./pdf";
import { buildPaymentReminderEmail } from "./reminderEmail";
import { getAtelierApi } from "./runtimeApi";
import {
  completeOAuthRedirect,
  createTeamInvitation,
  deleteCurrentAccount,
  deleteRemoteAttachment,
  deleteTeamInvitation,
  getCurrentSession,
  listTeamInvitations,
  listTeamMembers,
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
  type WorkspaceContext,
  type WorkspaceRole,
} from "./supabaseStore";
import type {
  AppData,
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
  StockMovement,
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

type View = "dashboard" | "documents" | "documentDetail" | "catalog" | "clients" | "settings";
type AuthMode = "signin" | "signup";
type ReminderDraft = Pick<PaymentReminder, "sentAt" | "channel" | "note">;
type ReminderSendResult = { success: boolean; message: string };

const roleLabels: Record<WorkspaceRole, string> = {
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
  location: "",
  stockMovements: [],
});

export function App() {
  const [api] = useState(() => getAtelierApi());
  const [data, setData] = useState<AppData>(() => createDefaultAppData());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "all">("all");
  const [notice, setNotice] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [teamBusy, setTeamBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("editor");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

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

  async function persist(next: AppData, message = "Enregistré") {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return;
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
      setNotice(message);
    } catch (error) {
      console.error("Impossible d'enregistrer les données", error);
      setData(previous);
      setNotice(userFacingError(error, "Sauvegarde indisponible"));
    }
    window.setTimeout(() => setNotice(""), 1800);
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

  const sortedClients = useMemo(() => [...data.clients].sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "fr")), [data.clients]);
  const sortedDocuments = useMemo(
    () =>
      [...data.documents].sort((a, b) => {
        const clientA = clientLabel(data.clients.find((client) => client.id === a.clientId));
        const clientB = clientLabel(data.clients.find((client) => client.id === b.clientId));
        return clientA.localeCompare(clientB, "fr") || b.updatedAt.localeCompare(a.updatedAt) || b.number.localeCompare(a.number);
      }),
    [data.clients, data.documents]
  );
  const recentDocuments = useMemo(
    () => [...data.documents].sort((a, b) => activityDate(b).localeCompare(activityDate(a)) || b.number.localeCompare(a.number)),
    [data.documents]
  );
  const filteredClients = useMemo(() => {
    const terms = normalizeSearch(clientQuery).split(/\s+/).filter(Boolean);
    if (!terms.length) return sortedClients;
    return sortedClients.filter((client) => terms.every((term) => clientSearchText(client).includes(term)));
  }, [clientQuery, sortedClients]);
  const sortedCatalog = useMemo(
    () => [...data.catalog].sort((a, b) => `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`, "fr")),
    [data.catalog]
  );
  const selectedDoc = useMemo(() => data.documents.find((doc) => doc.id === selectedId), [data.documents, selectedId]);
  const selectedClient = useMemo(() => data.clients.find((client) => client.id === selectedDoc?.clientId), [data.clients, selectedDoc]);
  const selectedClientForEdit = useMemo(
    () => data.clients.find((client) => client.id === selectedClientId),
    [data.clients, selectedClientId]
  );
  const canManageTeam = workspace?.role === "owner" || workspace?.role === "admin";
  const canManageCompany = !workspace || workspace.role === "owner" || workspace.role === "admin";
  const canManageCatalog = canManageCompany;
  const canEditOperations = !workspace || workspace.role === "owner" || workspace.role === "admin" || workspace.role === "editor";
  const canViewCompanySettings = canManageCompany || workspace?.role === "editor";
  const canDeleteClients = !workspace || workspace.role === "owner" || workspace.role === "admin";

  function isLockedBillingDocument(doc?: BusinessDocument | null) {
    return doc?.type === "invoice" || doc?.type === "creditNote" || doc?.type === "returnInvoice";
  }

  function canModifyDocument(doc?: BusinessDocument | null) {
    return Boolean(canEditOperations && doc && !isLockedBillingDocument(doc));
  }

  function canConvertDocument(doc: BusinessDocument, type: DocumentType) {
    if (!canEditOperations || doc.type === type) return false;
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
    if (!filteredClients.length) {
      if (selectedClientId) setSelectedClientId("");
      return;
    }
    if (!filteredClients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(filteredClients[0].id);
    }
  }, [filteredClients, selectedClientId, view]);

  useEffect(() => {
    if (view === "catalog" && !canManageCatalog) setView("documents");
  }, [canManageCatalog, view]);

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

  if (!loaded) {
    return <main className="loading">Chargement de Devix...</main>;
  }

  function openDocument(id: string) {
    setSelectedId(id);
    setView("documentDetail");
  }

  function pageTitle() {
    if (view === "dashboard") return "Pilotage commercial";
    if (view === "documents") return "Devis, BC et factures";
    if (view === "documentDetail" && selectedDoc) return `${labels[selectedDoc.type]} ${selectedDoc.number}`;
    if (view === "documentDetail") return "Document";
    if (view === "catalog") return "Articles et prestations";
    if (view === "clients") return "Fichier clients";
    return canViewCompanySettings ? "Paramètres société" : "Mon compte";
  }

  const filteredDocuments = sortedDocuments
    .filter((doc) => typeFilter === "all" || doc.type === typeFilter)
    .filter((doc) => {
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return true;
      const client = data.clients.find((item) => item.id === doc.clientId);
      return terms.every((term) => searchableText(doc, client).includes(term));
    });

  const dashboardTotals = data.documents.reduce(
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
  const statusCounts = data.documents.reduce<Record<DocumentStatus, number>>(
    (acc, doc) => ({ ...acc, [doc.status]: acc[doc.status] + 1 }),
    { draft: 0, partial: 0, paid: 0 }
  );
  const pendingValue = data.documents
    .filter((doc) => doc.status !== "paid")
    .reduce((sum, doc) => {
      const value = totals(doc.lines).totalTtc;
      return sum + (doc.type === "invoice" ? paymentSummary(doc, value).remainingAmount : value);
    }, 0);
  const dueDocuments = data.documents
    .filter((doc) => doc.dueDate && doc.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  async function createClient() {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return;
    }
    const reserved = await reserveNumber("client", data);
    const client = buildClient(reserved.number, "Nouveau client");
    await persist({ ...reserved.data, clients: [client, ...reserved.data.clients] }, "Client créé");
    setSelectedClientId(client.id);
    setView("clients");
  }

  async function createDocument(type: DocumentType = "quote") {
    if (!canEditOperations) {
      showPermissionNotice("Votre accès est en lecture seule.");
      return;
    }
    const withClient = await ensureClient(data);
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
    await persist({ ...data, documents: data.documents.map((item) => (item.id === doc.id ? updated : item)) });
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
    const lastHistory = doc.history[doc.history.length - 1];
    const shouldRestoreOrigin = Boolean(
      lastHistory &&
      window.confirm(`Voulez-vous régénérer le document d'origine : ${labels[lastHistory.fromType]} ${lastHistory.fromNumber} ?`)
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
      return;
    }
    await persist({ ...data, clients: data.clients.map((item) => (item.id === client.id ? client : item)) });
  }

  async function deleteClient(client: Client) {
    if (!canDeleteClients) {
      showPermissionNotice("Suppression des clients réservée aux administrateurs.");
      return;
    }
    const used = data.documents.some((doc) => doc.clientId === client.id);
    if (used) {
      setNotice("Client utilisé dans un document");
      return;
    }
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
    await persist({ ...data, catalog: [emptyCatalogItem(data.company.defaultVatRate), ...data.catalog] }, "Article ajouté");
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
    await persist({ ...data, catalog: data.catalog.filter((entry) => entry.id !== item.id) }, "Article supprimé");
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
    await persist({ ...data, company: { ...data.company, logoDataUrl: "" } }, "Logo supprimé");
  }

  return (
    <div className="shell">
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
            className={view === "documents" || view === "documentDetail" ? "active" : ""}
            onClick={() => {
              setSelectedId("");
              setView("documents");
            }}
          >
            <FileText size={18} /> Documents
          </button>
          {canManageCatalog && (
            <button className={view === "catalog" ? "active nested" : "nested"} onClick={() => setView("catalog")}>
              <PackageCheck size={18} /> Articles
            </button>
          )}
          <button className={view === "clients" ? "active" : ""} onClick={() => setView("clients")}>
            <Users size={18} /> Clients
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <Settings size={18} /> {canViewCompanySettings ? "Société" : "Compte"}
          </button>
        </nav>
        <div className="quickActions">
          {canEditOperations && (
            <button
              onClick={() => {
                setSelectedId("");
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
              <PackageCheck size={17} /> Articles
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
                <h2>Activité récente</h2>
                {canEditOperations && (
                  <button onClick={() => createDocument("quote")}>
                    <Plus size={17} /> Créer un devis
                  </button>
                )}
              </div>
              <DocumentRows docs={recentDocuments.slice(0, 8)} clients={data.clients} onOpen={openDocument} />
            </div>
          </section>
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
              <div className="listMeta">{filteredDocuments.length} document(s)</div>
              <div className="docList">
                {filteredDocuments.length ? (
                  filteredDocuments.map((doc) => {
                    const sum = totals(doc.lines).totalTtc;
                    const client = data.clients.find((item) => item.id === doc.clientId);
                    return (
                      <button
                        key={doc.id}
                        className={selectedId === doc.id ? "docCard selected" : "docCard"}
                        onClick={() => openDocument(doc.id)}
                      >
                        <span>
                          {labels[doc.type]} <strong>{doc.number}</strong>
                        </span>
                        <b>{doc.projectName || "Sans nom"}</b>
                        <small>{clientLabel(client)}</small>
                        <div className="docCardFooter">
                          <StatusBadge status={doc.status} />
                          <em>{currency(sum)}</em>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="emptyRows">Aucun document ne correspond.</div>
                )}
              </div>
            </aside>
            {!filteredDocuments.length && (
              <div className="emptyState">
                <FileText size={42} />
                <h2>{data.documents.length ? "Aucun résultat" : "Aucun document"}</h2>
                <p>
                  {data.documents.length
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
                  setView("documents");
                }}
              >
                <ArrowLeft size={17} /> Retour aux documents
              </button>
            </div>
            {selectedDoc ? (
              <DocumentEditor
                doc={selectedDoc}
                clients={sortedClients}
                catalog={sortedCatalog}
                readOnly={!canModifyDocument(selectedDoc)}
                canEditPayments={canEditOperations && selectedDoc.type === "invoice"}
                canRestorePrevious={canEditOperations}
                canCreateCreditNote={canConvertDocument(selectedDoc, "creditNote")}
                canCreateReturnInvoice={canConvertDocument(selectedDoc, "returnInvoice")}
                onChange={updateDocument}
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
          <CatalogManager items={sortedCatalog} onCreate={createCatalogItem} onChange={updateCatalogItem} onDelete={deleteCatalogItem} />
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
            <div className="listMeta">{filteredClients.length} client(s)</div>
            <div className="clientsLayout">
              <div className="clientList">
                {filteredClients.map((client) => (
                  <button
                    key={client.id}
                    className={selectedClientId === client.id ? "clientListRow selected" : "clientListRow"}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <span>{client.number}</span>
                    <strong>{client.name || "Client sans nom"}</strong>
                    <em>{client.email || client.phone || `${client.postalCode} ${client.city}`.trim() || "Coordonnées à renseigner"}</em>
                  </button>
                ))}
                {!filteredClients.length && <div className="emptyRows">Aucun client ne correspond.</div>}
              </div>
              {selectedClientForEdit ? (
                <ClientCard
                  client={selectedClientForEdit}
                  readOnly={!canEditOperations}
                  canDelete={canDeleteClients}
                  onChange={updateClient}
                  onDelete={deleteClient}
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

        {view === "settings" && (
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
                <FormGrid
                  value={data.company}
                  readOnly={!canManageCompany}
                  onChange={(company) => persist({ ...data, company })}
                  fields={[
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
                  ]}
                />
                <label className="fullLabel">
                  Conditions de paiement
                  <textarea
                    disabled={!canManageCompany}
                    placeholder="Ex. : 30 % d'acompte à la commande..."
                    value={data.company.paymentTerms}
                    onChange={(event) => persist({ ...data, company: { ...data.company, paymentTerms: event.target.value } })}
                  />
                </label>
                <label className="fullLabel">
                  Note par défaut
                  <textarea
                    disabled={!canManageCompany}
                    placeholder="Note affichée sur les nouveaux documents"
                    value={data.company.notes}
                    onChange={(event) => persist({ ...data, company: { ...data.company, notes: event.target.value } })}
                  />
                </label>
              </>
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
          </section>
        )}
      </main>
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
      <div className="editorHeader">
        <div>
          <span className="eyebrow">{labels[doc.type]}</span>
          <h2>{doc.number}</h2>
        </div>
        <div className="editorActions">
          {!readOnly && (
            <button className="ghost" onClick={() => onDuplicate(doc)}>
              <CopyPlus size={17} /> Dupliquer
            </button>
          )}
          {canEditPayments && doc.status !== "paid" && (
            <button onClick={() => onAdvanceStatus(doc)}>
              <Check size={17} /> {quickStatusLabel}
            </button>
          )}
          {doc.history.length > 0 && (
            <button className="ghost subtleButton" onClick={() => setHistoryOpen((value) => !value)}>
              <History size={16} /> Historique
            </button>
          )}
          {canRestorePrevious && previousHistory && (
            <button className="ghost" onClick={() => onRestorePrevious(doc)}>
              <ArrowLeft size={17} /> Revenir en {labels[previousHistory.fromType]}
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
          <button onClick={() => onExport(doc)}>
            <Download size={17} /> PDF
          </button>
          <button className="ghost" disabled={emailing} onClick={sendEmail}>
            {emailing ? <LoaderCircle className="spinIcon" size={17} /> : <Mail size={17} />}
            {emailing ? "Préparation..." : "Email"}
          </button>
          {!readOnly && (
            <button className="danger" onClick={() => onDelete(doc)}>
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </div>

      {historyOpen && <HistoryPanel doc={doc} />}

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
          Date
          <input disabled={readOnly} type="date" value={doc.issueDate} onChange={(event) => patch({ issueDate: event.target.value })} />
        </label>
        <label>
          Échéance
          <input disabled={readOnly} type="date" value={doc.dueDate} onChange={(event) => patch({ dueDate: event.target.value })} />
        </label>
        <label>
          Adresse chantier
          <input
            disabled={readOnly}
            placeholder="Adresse du chantier si différente du client"
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
          Acompte %
          <input
            disabled={readOnly}
            type="number"
            placeholder="30"
            value={doc.depositRate || ""}
            onChange={(event) => patch({ depositRate: Number(event.target.value) })}
          />
        </label>
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
              Ajouter depuis articles / prestations
            </option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.category || "Sans catégorie"} - {item.name || "Article sans nom"} ({currency(item.price)}/{item.unit || "u"})
              </option>
            ))}
          </select>
          <button onClick={() => patch({ lines: [...doc.lines, emptyLine(doc.lines[0]?.vatRate ?? 20)] })}>
            <CopyPlus size={17} /> Ligne libre
          </button>
        </div>
      )}

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
                <button className="iconButton" onClick={() => patch({ lines: doc.lines.filter((item) => item.id !== line.id) })}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
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
      <DocumentPreview doc={doc} client={client} sums={sums} />
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
  onCreate,
  onChange,
  onDelete,
}: {
  items: CatalogItem[];
  onCreate: () => void;
  onChange: (item: CatalogItem) => void;
  onDelete: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [movementDrafts, setMovementDrafts] = useState<Record<string, { quantity: string; reason: string }>>({});
  const [movementOpen, setMovementOpen] = useState<Record<string, boolean>>({});
  const filtered = items.filter((item) =>
    `${item.name} ${item.category} ${item.unit} ${item.supplier} ${item.location}`.toLowerCase().includes(query.toLowerCase())
  );
  const trackedItems = items.filter((item) => item.trackStock);
  const lowStockCount = trackedItems.filter((item) => item.stockQuantity > 0 && item.stockQuantity <= item.stockMinimum).length;
  const outOfStockCount = trackedItems.filter((item) => item.stockQuantity <= 0).length;
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
            placeholder="Rechercher article, prestation, catégorie, fournisseur..."
          />
        </div>
        <button onClick={onCreate}>
          <Plus size={17} /> Ajouter
        </button>
      </div>
      <div className="stockSummary">
        <div>
          <span>Articles suivis</span>
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
                  <strong>{item.name || "Article sans nom"}</strong>
                  <span>{item.category || "Sans catégorie"}</span>
                </div>
                <span className={`statusBadge ${stockTone(item)}`}>{stockLabel(item)}</span>
                <button className="iconButton" onClick={() => onDelete(item)}>
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
                      <input
                        placeholder="Nom fournisseur"
                        value={item.supplier}
                        onChange={(event) => patch(item, { supplier: event.target.value })}
                      />
                    </label>
                    <label>
                      Emplacement
                      <input
                        placeholder="Atelier, dépôt..."
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
        {!filtered.length && <div className="emptyRows">Aucun article ne correspond.</div>}
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
  onChange: (client: Client) => void;
  onDelete: (client: Client) => void;
}) {
  const patch = (partial: Partial<Client>) => onChange({ ...client, ...partial });
  return (
    <article className="clientCard">
      <div className="cardHeader">
        <strong>{client.number}</strong>
        {canDelete && (
          <button className="iconButton" onClick={() => onDelete(client)}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <label>
        Type
        <select disabled={readOnly} value={client.type} onChange={(event) => patch({ type: event.target.value as Client["type"] })}>
          <option value="particulier">Particulier</option>
          <option value="professionnel">Professionnel</option>
        </select>
      </label>
      <label>
        Nom
        <input
          disabled={readOnly}
          placeholder="Nom du client ou société"
          value={client.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </label>
      <label>
        Email
        <input
          disabled={readOnly}
          placeholder="client@email.fr"
          value={client.email}
          onChange={(event) => patch({ email: event.target.value })}
        />
      </label>
      <label>
        Téléphone
        <input
          disabled={readOnly}
          inputMode="tel"
          placeholder="06 00 00 00 00"
          value={client.phone}
          onChange={(event) => patch({ phone: formatPhoneNumber(event.target.value) })}
        />
      </label>
      <label>
        Adresse
        <input
          disabled={readOnly}
          placeholder="Adresse du client"
          value={client.address}
          onChange={(event) => patch({ address: event.target.value })}
        />
      </label>
      <div className="twoCols">
        <label>
          CP
          <input
            disabled={readOnly}
            placeholder="75000"
            value={client.postalCode}
            onChange={(event) => patch({ postalCode: event.target.value })}
          />
        </label>
        <label>
          Ville
          <input disabled={readOnly} placeholder="Paris" value={client.city} onChange={(event) => patch({ city: event.target.value })} />
        </label>
      </div>
      <label>
        Notes
        <textarea
          disabled={readOnly}
          placeholder="Informations internes"
          value={client.notes}
          onChange={(event) => patch({ notes: event.target.value })}
        />
      </label>
    </article>
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
