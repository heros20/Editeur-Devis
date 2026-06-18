import {
  ArrowLeft,
  Building2,
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
import { createDefaultAppData, normalizeData } from "./defaultData";
import { renderCompanyHtml, renderDocumentHtml } from "./pdf";
import { getAtelierApi } from "./runtimeApi";
import {
  createTeamInvitation,
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
  DocumentSnapshot,
  DocumentStatus,
  DocumentType,
  LineItem,
} from "./types";
import {
  addDaysIso,
  clientLabel,
  currency,
  duplicateLines,
  formatBusinessNumber,
  labels,
  makeId,
  sanitizeFileName,
  statusLabels,
  statusTone,
  todayIso,
  totals,
} from "./utils";

type View = "dashboard" | "documents" | "documentDetail" | "catalog" | "clients" | "settings";
type AuthMode = "signin" | "signup";

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Proprietaire",
  admin: "Admin",
  editor: "Edition",
  viewer: "Lecture",
};

const inviteRoleOptions: InviteRole[] = ["admin", "editor", "viewer"];

function normalizeSearch(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clientSearchText(client: Client) {
  return normalizeSearch(
    [
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
    ].filter(Boolean).join(" ")
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

const emptyLine = (vatRate = 20): LineItem => ({
  id: makeId("line"),
  description: "",
  details: "",
  unit: "",
  quantity: 1,
  unitPrice: 0,
  vatRate,
  discount: 0,
});

const emptyCatalogItem = (vatRate = 20): CatalogItem => ({
  id: makeId("catalog"),
  name: "",
  unit: "",
  price: 0,
  vatRate,
  category: "",
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
  const [session, setSession] = useState<Session | null>(null);
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
    if (message.includes("provider") || message.includes("oauth")) return "Connexion Google pas encore active.";
    if (message.includes("failed to fetch") || message.includes("network")) return "Connexion internet indisponible.";
    if (raw && !message.includes("supabase")) return raw;
    return fallback;
  }

  useEffect(() => {
    let active = true;

    async function loadWorkspace(nextSession: Session | null) {
      setSession(nextSession);
      if (!nextSession) {
        setWorkspace(null);
        setData(createDefaultAppData());
        setLoaded(true);
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
        console.error("Impossible de charger les donnees", error);
        if (!active) return;
        setWorkspace(null);
        setData(createDefaultAppData());
        setLoadError("Impossible de charger vos donnees. Reessayez dans quelques instants.");
      } finally {
        if (active) setLoaded(true);
      }
    }

    getCurrentSession()
      .then((currentSession) => loadWorkspace(currentSession))
      .catch((error) => {
        console.error("Session indisponible", error);
        if (!active) return;
        setSession(null);
        setLoaded(true);
        setLoadError("Connexion impossible. Verifiez votre acces internet.");
      });

    const unsubscribe = onRemoteAuthStateChange((nextSession) => {
      if (!active) return;
      void loadWorkspace(nextSession);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function persist(next: AppData, message = "Enregistre") {
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
      console.error("Impossible d'enregistrer les donnees", error);
      setNotice("Sauvegarde indisponible");
    }
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function reserveNumber(type: DocumentType | "client", source: AppData) {
    let count = source.counters[type] || 1;
    if (workspace) {
      try {
        count = await reserveRemoteCounter(workspace, type);
      } catch (error) {
        console.warn("Numerotation distante indisponible, compteur local utilise", error);
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

  function buildClient(number: string, name = "Client a renseigner"): Client {
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

  function makeSnapshot(doc: BusinessDocument): DocumentSnapshot {
    return {
      type: doc.type,
      number: doc.number,
      status: doc.status,
      clientId: doc.clientId,
      issueDate: doc.issueDate,
      dueDate: doc.dueDate,
      projectName: doc.projectName,
      siteAddress: doc.siteAddress,
      workStart: doc.workStart,
      workDuration: doc.workDuration,
      depositRate: doc.depositRate,
      notes: doc.notes,
      terms: doc.terms,
      lines: duplicateLines(doc.lines),
      attachments: [...(doc.attachments || [])],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  function companyText(company: CompanySettings) {
    return [
      company.name,
      company.legalName,
      `SIRET: ${company.siret || "a renseigner"}`,
      `TVA: ${company.vatNumber || "a renseigner"}`,
      `${company.address}\n${company.postalCode} ${company.city}`.trim(),
      `Telephone: ${company.phone}`,
      `Email: ${company.email}`,
      company.website ? `Site: ${company.website}` : "",
      `IBAN: ${company.iban || "a renseigner"}`,
      `BIC: ${company.bic || "a renseigner"}`,
      `Conditions: ${company.paymentTerms}`,
    ].filter(Boolean).join("\n");
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
      ...doc.history.flatMap((entry) => [entry.fromNumber, entry.toNumber, labels[entry.fromType], labels[entry.toType], entry.snapshot.projectName]),
    ].filter(Boolean).join(" ").toLowerCase();
  }

  const sortedClients = useMemo(
    () => [...data.clients].sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "fr")),
    [data.clients]
  );
  const sortedDocuments = useMemo(
    () => [...data.documents].sort((a, b) => {
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
  const selectedClientForEdit = useMemo(() => data.clients.find((client) => client.id === selectedClientId), [data.clients, selectedClientId]);
  const canManageTeam = workspace?.role === "owner" || workspace?.role === "admin";

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

  async function reloadWorkspace(organizationId?: string) {
    const remote = await loadRemoteWorkspace(organizationId);
    setWorkspace(remote.context);
    setData(normalizeData(remote.data));
    setLoadError("");
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
        setAuthMessage("Compte cree. Verifiez votre boite mail pour confirmer l'inscription.");
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
      setAuthMessage("Email envoye. Ouvrez le lien recu pour definir votre mot de passe.");
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
      setNotice("Mot de passe mis a jour");
    } catch (error) {
      console.error("Mise a jour mot de passe impossible", error);
      setNotice(userFacingError(error, "Mot de passe impossible a modifier"));
    } finally {
      setAccountBusy(false);
      window.setTimeout(() => setNotice(""), 2200);
    }
  }

  async function signOut() {
    try {
      await signOutRemote();
      setWorkspace(null);
      setSession(null);
      setData(createDefaultAppData());
      setSelectedId("");
      setTeamMembers([]);
      setTeamInvitations([]);
      setInviteEmail("");
      setView("dashboard");
    } catch (error) {
      console.error("Deconnexion impossible", error);
      setNotice("Deconnexion indisponible");
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
      setNotice(`Invitation envoyee a ${invitation.email}`);
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
      setNotice("Invitation supprimee");
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
      setNotice("Droits mis a jour");
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
      setNotice("Employe retire");
    } catch (error) {
      console.error("Retrait employe impossible", error);
      setNotice(userFacingError(error, "Retrait impossible"));
    } finally {
      setTeamBusy(false);
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  if (!loaded) {
    return <main className="loading">Chargement de Devix...</main>;
  }

  if (!session) {
    return (
      <AuthScreen
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
    );
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
    return "Parametres societe";
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
      if (doc.type === "quote") acc.quotes += value;
      if (doc.type === "order") acc.orders += value;
      if (doc.type === "invoice") acc.invoices += value;
      if (doc.status === "paid") acc.paid += value;
      return acc;
    },
    { quotes: 0, orders: 0, invoices: 0, paid: 0 }
  );
  const statusCounts = data.documents.reduce<Record<DocumentStatus, number>>(
    (acc, doc) => ({ ...acc, [doc.status]: acc[doc.status] + 1 }),
    { draft: 0, paid: 0 }
  );
  const pendingValue = data.documents
    .filter((doc) => doc.status !== "paid")
    .reduce((sum, doc) => sum + totals(doc.lines).totalTtc, 0);
  const dueDocuments = data.documents
    .filter((doc) => doc.dueDate && doc.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  async function createClient() {
    const reserved = await reserveNumber("client", data);
    const client = buildClient(reserved.number, "Nouveau client");
    await persist({ ...reserved.data, clients: [client, ...reserved.data.clients] }, "Client cree");
    setSelectedClientId(client.id);
    setView("clients");
  }

  async function createDocument(type: DocumentType = "quote") {
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
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await persist({ ...reserved.data, documents: [doc, ...reserved.data.documents] }, `${labels[type]} cree`);
    setSelectedId(doc.id);
    setView("documentDetail");
  }

  async function convertDocument(source: BusinessDocument, type: DocumentType) {
    if (source.type === type) return;
    const reserved = await reserveNumber(type, data);
    const issueDate = todayIso();
    const transformed: BusinessDocument = {
      ...source,
      type,
      number: reserved.number,
      status: "draft",
      issueDate,
      dueDate: addDaysIso(issueDate, 30),
      history: [
        ...(source.history || []),
        {
          id: makeId("history"),
          transformedAt: new Date().toISOString(),
          fromType: source.type,
          fromNumber: source.number,
          toType: type,
          toNumber: reserved.number,
          snapshot: makeSnapshot(source),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await persist(
      { ...reserved.data, documents: reserved.data.documents.map((doc) => (doc.id === source.id ? transformed : doc)) },
      `${labels[source.type]} transforme en ${labels[type]}`
    );
    setSelectedId(transformed.id);
  }

  async function updateDocument(doc: BusinessDocument) {
    const updated = { ...doc, updatedAt: new Date().toISOString() };
    await persist({ ...data, documents: data.documents.map((item) => (item.id === doc.id ? updated : item)) });
  }

  async function advanceStatus(doc: BusinessDocument) {
    await updateDocument({ ...doc, status: "paid" });
  }

  async function duplicateDocument(source: BusinessDocument) {
    const reserved = await reserveNumber(source.type, data);
    const duplicate: BusinessDocument = {
      ...source,
      id: makeId("doc"),
      number: reserved.number,
      status: "draft",
      originId: source.id,
      lines: duplicateLines(source.lines),
      attachments: [],
      history: [...source.history],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await persist({ ...reserved.data, documents: [duplicate, ...reserved.data.documents] }, `${labels[source.type]} duplique`);
    setSelectedId(duplicate.id);
    setView("documentDetail");
  }

  async function deleteDocument(doc: BusinessDocument) {
    await Promise.all(
      (doc.attachments || []).map((attachment) =>
        workspace
          ? deleteRemoteAttachment(attachment).catch(() => undefined)
          : api.deleteAttachment(attachment).catch(() => ({ deleted: false }))
      )
    );
    const nextDocs = data.documents.filter((item) => item.id !== doc.id);
    await persist({ ...data, documents: nextDocs }, "Document supprime");
    setSelectedId("");
    setView("documents");
  }

  async function addDocumentAttachments(doc: BusinessDocument) {
    const result = await api.selectAttachments(doc.id);
    if (result.canceled || !result.attachments.length) return;
    const attachments = workspace
      ? await Promise.all(result.attachments.map((attachment) => uploadRemoteAttachment(workspace, doc.id, attachment)))
      : result.attachments;
    await updateDocument({ ...doc, attachments: [...doc.attachments, ...attachments] });
    setNotice(`${attachments.length} piece(s) jointe(s) ajoutee(s)`);
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
      console.warn("Ouverture piece jointe impossible", error);
    }
    setNotice("Piece jointe introuvable");
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function removeDocumentAttachment(doc: BusinessDocument, attachment: DocumentAttachment) {
    try {
      if (workspace) {
        await deleteRemoteAttachment(attachment);
      } else {
        await api.deleteAttachment(attachment);
      }
    } catch (error) {
      console.warn("Suppression piece jointe impossible", error);
    } finally {
      await updateDocument({ ...doc, attachments: doc.attachments.filter((item) => item.id !== attachment.id) });
      setNotice("Piece jointe supprimee");
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
      const entered = window.prompt("Email du client a ajouter pour cet envoi", email);
      if (!entered) return;
      email = entered.trim();
      if (client) {
        await persist({ ...data, clients: data.clients.map((item) => (item.id === client.id ? { ...item, email } : item)) }, "Email client ajoute");
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

  async function updateClient(client: Client) {
    await persist({ ...data, clients: data.clients.map((item) => (item.id === client.id ? client : item)) });
  }

  async function deleteClient(client: Client) {
    const used = data.documents.some((doc) => doc.clientId === client.id);
    if (used) {
      setNotice("Client utilise dans un document");
      return;
    }
    await persist({ ...data, clients: data.clients.filter((item) => item.id !== client.id) }, "Client supprime");
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
          vatRate: item.vatRate,
          discount: 0,
        },
      ],
    });
  }

  async function createCatalogItem() {
    await persist({ ...data, catalog: [emptyCatalogItem(data.company.defaultVatRate), ...data.catalog] }, "Article ajoute");
    setView("catalog");
  }

  async function updateCatalogItem(item: CatalogItem) {
    await persist({ ...data, catalog: data.catalog.map((entry) => (entry.id === item.id ? item : entry)) });
  }

  async function deleteCatalogItem(item: CatalogItem) {
    await persist({ ...data, catalog: data.catalog.filter((entry) => entry.id !== item.id) }, "Article supprime");
  }

  async function copyCompany() {
    const text = companyText(data.company);
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Informations societe copiees");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setNotice("Informations societe copiees");
    }
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function emailCompany() {
    await api.openEmail({
      subject: `Informations societe - ${data.company.name}`,
      body: companyText(data.company),
    });
  }

  async function exportCompanyPdf() {
    await api.savePdf({
      html: renderCompanyHtml(data.company),
      defaultPath: `${sanitizeFileName(data.company.name || "fiche-societe")}.pdf`,
    });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brandMark">
          <div className="logo">DV</div>
          <div>
            <strong>Devix</strong>
            <span>{data.company.name.trim() || "Gestion commerciale"}</span>
          </div>
        </div>
        <nav>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><Home size={18} /> Tableau</button>
          <button className={view === "documents" || view === "documentDetail" ? "active" : ""} onClick={() => { setSelectedId(""); setView("documents"); }}><FileText size={18} /> Documents</button>
          <button className={view === "catalog" ? "active nested" : "nested"} onClick={() => setView("catalog")}><PackageCheck size={18} /> Articles</button>
          <button className={view === "clients" ? "active" : ""} onClick={() => setView("clients")}><Users size={18} /> Clients</button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings size={18} /> Societe</button>
        </nav>
        <div className="quickActions">
          <button onClick={() => createDocument("quote")}><Plus size={17} /> Nouveau devis</button>
          <button onClick={createClient}><UserPlus size={17} /> Nouveau client</button>
          <button onClick={createCatalogItem}><PackageCheck size={17} /> Article</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Gestion commerciale</span>
            <h1>{pageTitle()}</h1>
            {view === "documentDetail" && selectedDoc && <span className="contextLine">{clientLabel(selectedClient)}</span>}
            {view === "documents" && selectedDoc && <span className="contextLine">{selectedDoc.number} · {clientLabel(selectedClient)}</span>}
          </div>
          <div className="topActions">
            {loadError && <span className="notice warning"><Check size={16} /> {loadError}</span>}
            {notice && <span className="notice"><Check size={16} /> {notice}</span>}
            {workspace && <span className="workspaceBadge">{workspace.organizationName} · {roleLabels[workspace.role]}</span>}
            <button className="ghost" onClick={signOut}><LogOut size={17} /> Deconnexion</button>
          </div>
        </header>

        {view === "dashboard" && (
          <section className="dashboard">
            <div className="kpi"><FileText /><span>Devis en portefeuille</span><strong>{currency(dashboardTotals.quotes)}</strong></div>
            <div className="kpi"><PackageCheck /><span>Commandes</span><strong>{currency(dashboardTotals.orders)}</strong></div>
            <div className="kpi"><ReceiptText /><span>Factures</span><strong>{currency(dashboardTotals.invoices)}</strong></div>
            <div className="kpi"><FileCheck2 /><span>A encaisser</span><strong>{currency(pendingValue)}</strong></div>
            <div className="panel compact">
              <div className="panelTitle"><h2>Suivi des affaires</h2></div>
              <div className="statusGrid">
                <StatusPill status="draft" count={statusCounts.draft} />
                <StatusPill status="paid" count={statusCounts.paid} />
              </div>
            </div>
            <div className="panel compact">
              <div className="panelTitle"><h2>Echeances</h2></div>
              <DueRows docs={dueDocuments} clients={data.clients} onOpen={openDocument} />
            </div>
            <div className="panel wide">
              <div className="panelTitle">
                <h2>Activite recente</h2>
                <button onClick={() => createDocument("quote")}><Plus size={17} /> Creer un devis</button>
              </div>
              <DocumentRows docs={recentDocuments.slice(0, 8)} clients={data.clients} onOpen={openDocument} />
            </div>
          </section>
        )}

        {view === "documents" && (
          <section className="documentLayout">
            <aside className="listPane">
              <div className="searchBox"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher document, client, societe, ligne..." /></div>
              <div className="segmented">
                {(["all", "quote", "order", "invoice"] as const).map((type) => (
                  <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>{type === "all" ? "Tous" : labels[type]}</button>
                ))}
              </div>
              <div className="listMeta">{filteredDocuments.length} document(s)</div>
              <div className="docList">
                {filteredDocuments.length ? filteredDocuments.map((doc) => {
                  const sum = totals(doc.lines).totalTtc;
                  const client = data.clients.find((item) => item.id === doc.clientId);
                  return (
                    <button key={doc.id} className={selectedId === doc.id ? "docCard selected" : "docCard"} onClick={() => openDocument(doc.id)}>
                      <span>{labels[doc.type]} <strong>{doc.number}</strong></span>
                      <b>{doc.projectName || "Sans nom"}</b>
                      <small>{clientLabel(client)}</small>
                      <div className="docCardFooter">
                        <StatusBadge status={doc.status} />
                        <em>{currency(sum)}</em>
                      </div>
                    </button>
                  );
                }) : <div className="emptyRows">Aucun document ne correspond.</div>}
              </div>
            </aside>
            {!filteredDocuments.length && (
              <div className="emptyState">
                <FileText size={42} />
                <h2>{data.documents.length ? "Aucun resultat" : "Aucun document"}</h2>
                <p>{data.documents.length ? "Aucun devis, bon de commande ou facture ne correspond a cette recherche." : "Creez un premier devis pour demarrer le flux devis, bon de commande, facture."}</p>
                <button onClick={() => createDocument("quote")}><Plus size={17} /> Nouveau devis</button>
              </div>
            )}
          </section>
        )}

        {view === "documentDetail" && (
          <section className="documentPage">
            <div className="documentPageBar">
              <button className="ghost" onClick={() => { setSelectedId(""); setView("documents"); }}><ArrowLeft size={17} /> Retour aux documents</button>
            </div>
            {selectedDoc ? (
              <DocumentEditor
                doc={selectedDoc}
                clients={sortedClients}
                catalog={sortedCatalog}
                onChange={updateDocument}
                onDelete={deleteDocument}
                onExport={exportPdf}
                onEmail={emailDocument}
                onConvert={convertDocument}
                onDuplicate={duplicateDocument}
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
                <p>Le document selectionne n'existe plus ou n'a pas encore ete charge.</p>
                <button onClick={() => { setSelectedId(""); setView("documents"); }}><ArrowLeft size={17} /> Retour aux documents</button>
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
                  placeholder="Rechercher par numero client, nom, contact, email, telephone, ville..."
                />
              </div>
              <button onClick={createClient}><UserPlus size={17} /> Ajouter un client</button>
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
                    <em>{client.contact || client.email || client.phone || `${client.postalCode} ${client.city}`.trim() || "Coordonnées à renseigner"}</em>
                  </button>
                ))}
                {!filteredClients.length && <div className="emptyRows">Aucun client ne correspond.</div>}
              </div>
              {selectedClientForEdit ? (
                <ClientCard client={selectedClientForEdit} onChange={updateClient} onDelete={deleteClient} />
              ) : (
                <div className="emptyState clientEmpty">
                  <Users size={42} />
                  <h2>{data.clients.length ? "Aucun client sélectionné" : "Aucun client"}</h2>
                  <p>{data.clients.length ? "Sélectionnez un client dans la liste pour modifier sa fiche." : "Ajoutez votre premier client pour le retrouver ici."}</p>
                  <button onClick={createClient}><UserPlus size={17} /> Ajouter un client</button>
                </div>
              )}
            </div>
          </section>
        )}

        {view === "settings" && (
          <section className="settingsPanel">
            <div className="panelTitle">
              <h2>Identite et conditions</h2>
              <div className="panelActions">
                <button className="ghost" onClick={copyCompany}><Clipboard size={17} /> Copier</button>
                <button className="ghost" onClick={emailCompany}><Mail size={17} /> Email</button>
                <button onClick={exportCompanyPdf}><Download size={17} /> PDF</button>
              </div>
            </div>
            <FormGrid
              value={data.company}
              onChange={(company) => persist({ ...data, company })}
              fields={[
                ["name", "Nom commercial", "text", "Votre societe"],
                ["legalName", "Raison sociale", "text", "SARL / SAS / EI"],
                ["siret", "SIRET", "text", "123 456 789 00010"],
                ["vatNumber", "N TVA", "text", "FR..."],
                ["address", "Adresse", "text", "12 rue des Copeaux"],
                ["postalCode", "Code postal", "text", "75000"],
                ["city", "Ville", "text", "Paris"],
                ["phone", "Telephone", "text", "01 23 45 67 89"],
                ["email", "Email", "text", "contact@societe.fr"],
                ["website", "Site web", "text", "https://..."],
                ["iban", "IBAN", "text", "FR76..."],
                ["bic", "BIC", "text", "ABCDEFGH"],
                ["quoteValidityDays", "Validite devis (jours)", "number", "30"],
                ["defaultVatRate", "TVA par defaut", "number", "20"],
                ["defaultDepositRate", "Acompte par defaut", "number", "30"],
              ]}
            />
            <label className="fullLabel">Conditions de paiement<textarea placeholder="Ex: 30% d'acompte a la commande..." value={data.company.paymentTerms} onChange={(event) => persist({ ...data, company: { ...data.company, paymentTerms: event.target.value } })} /></label>
            <label className="fullLabel">Note par defaut<textarea placeholder="Note affichee sur les nouveaux documents" value={data.company.notes} onChange={(event) => persist({ ...data, company: { ...data.company, notes: event.target.value } })} /></label>
            {workspace && (
              <AccountPasswordSettings
                email={workspace.userEmail}
                password={accountPassword}
                confirmPassword={accountPasswordConfirm}
                busy={accountBusy}
                onPasswordChange={setAccountPassword}
                onConfirmPasswordChange={setAccountPasswordConfirm}
                onSubmit={submitAccountPassword}
              />
            )}
            {workspace && (
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

function AuthScreen({
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
    <main className="authPage">
      <form className="authPanel" onSubmit={onSubmit}>
        <div className="brandMark authBrand">
          <div className="logo">DV</div>
          <div>
            <strong>Devix</strong>
            <span>Acces securise</span>
          </div>
        </div>
        <div className="segmented authMode">
          <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => onModeChange("signin")}>Connexion</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => onModeChange("signup")}>Compte</button>
        </div>
        <button className="googleAuthButton" type="button" disabled={busy} onClick={onGoogleAuth}>
          <span>G</span>
          Continuer avec Google
        </button>
        <div className="authDivider"><span>ou</span></div>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => onEmailChange(event.target.value)} /></label>
        <label>Mot de passe<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label>
        {message && <span className="authMessage">{message}</span>}
        <button type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spinIcon" size={17} /> : <Check size={17} />}
          {mode === "signin" ? "Se connecter" : "Creer le compte"}
        </button>
        <button className="ghost passwordLinkButton" type="button" disabled={busy} onClick={onPasswordSetup}>
          Definir / reinitialiser le mot de passe
        </button>
      </form>
    </main>
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
}: {
  email: string;
  password: string;
  confirmPassword: string;
  busy: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="accountSection">
      <div className="panelTitle accountTitle">
        <div>
          <span className="eyebrow">Compte</span>
          <h3>Mot de passe</h3>
        </div>
        <span className="accountEmail">{email}</span>
      </div>
      <form className="accountPasswordForm" onSubmit={onSubmit}>
        <label>Nouveau mot de passe<input type="password" autoComplete="new-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="8 caracteres minimum" /></label>
        <label>Confirmation<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => onConfirmPasswordChange(event.target.value)} placeholder="Repeter le mot de passe" /></label>
        <button type="submit" disabled={busy || !password || !confirmPassword}>
          {busy ? <LoaderCircle className="spinIcon" size={17} /> : <Check size={17} />}
          Enregistrer
        </button>
      </form>
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
          <span className="eyebrow">Equipe</span>
          <h3>Employes et acces</h3>
        </div>
        <button className="ghost subtleButton" disabled={busy} onClick={onRefresh} type="button">
          {busy ? <LoaderCircle className="spinIcon" size={15} /> : <Users size={15} />}
          Actualiser
        </button>
      </div>

      {canManage && (
        <form className="inviteForm" onSubmit={onSubmitInvitation}>
          <label>Email employe<input type="email" value={inviteEmail} onChange={(event) => onInviteEmailChange(event.target.value)} placeholder="prenom@societe.fr" /></label>
          <label>Droits<select value={inviteRole} onChange={(event) => onInviteRoleChange(event.target.value as InviteRole)}>
            {inviteRoleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select></label>
          <button type="submit" disabled={busy || !inviteEmail.trim()}><UserPlus size={17} /> Inviter</button>
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
                    <select disabled={locked || busy} value={member.role} onChange={(event) => onChangeMemberRole(member, event.target.value as InviteRole)}>
                      {inviteRoleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </select>
                  )}
                  {canManage && (
                    <button className="iconButton dangerIcon" disabled={locked || busy} onClick={() => onDeleteMember(member)} title="Retirer l'employe" type="button">
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              );
            })}
            {!members.length && <div className="emptyRows compactEmpty">Aucun membre charge.</div>}
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
                    <span>{roleLabels[invitation.role]} · expire le {formatShortDate(invitation.expiresAt)}</span>
                  </div>
                  <span className="statusBadge info">Email envoye</span>
                  <button className="iconButton dangerIcon" disabled={busy} onClick={() => onRevokeInvitation(invitation)} title="Supprimer l'invitation" type="button">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              {!invitations.length && <div className="emptyRows compactEmpty">Aucune invitation en attente.</div>}
            </div>
          </div>
        )}
      </div>

      <span className="teamFootnote">{workspace.organizationName} · {roleLabels[workspace.role]}</span>
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
          <strong>{labels[doc.type]} {doc.number}</strong>
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
  if (!docs.length) return <div className="emptyRows compactEmpty">Aucune echeance ouverte.</div>;
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
  onChange,
  onDelete,
  onExport,
  onEmail,
  onConvert,
  onDuplicate,
  onAdvanceStatus,
  onAddCatalogLine,
  onAddAttachment,
  onOpenAttachment,
  onRemoveAttachment,
}: {
  doc: BusinessDocument;
  clients: Client[];
  catalog: AppData["catalog"];
  onChange: (doc: BusinessDocument) => void;
  onDelete: (doc: BusinessDocument) => void;
  onExport: (doc: BusinessDocument) => void;
  onEmail: (doc: BusinessDocument) => Promise<void>;
  onConvert: (doc: BusinessDocument, type: DocumentType) => void;
  onDuplicate: (doc: BusinessDocument) => void;
  onAdvanceStatus: (doc: BusinessDocument) => void;
  onAddCatalogLine: (doc: BusinessDocument, catalogId: string) => void;
  onAddAttachment: (doc: BusinessDocument) => void;
  onOpenAttachment: (attachment: DocumentAttachment) => void;
  onRemoveAttachment: (doc: BusinessDocument, attachment: DocumentAttachment) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const sums = totals(doc.lines);
  const client = clients.find((item) => item.id === doc.clientId);
  const quickStatusLabel = "Marquer payé";
  const patch = (partial: Partial<BusinessDocument>) => onChange({ ...doc, ...partial });
  const patchLine = (id: string, partial: Partial<LineItem>) =>
    patch({ lines: doc.lines.map((line) => (line.id === id ? { ...line, ...partial } : line)) });
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
          <StatusBadge status={doc.status} />
          <select value={doc.status} onChange={(event) => patch({ status: event.target.value as DocumentStatus })}>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button onClick={() => onAdvanceStatus(doc)}><Check size={17} /> {quickStatusLabel}</button>
          {doc.history.length > 0 && <button className="ghost subtleButton" onClick={() => setHistoryOpen((value) => !value)}><History size={16} /> Historique</button>}
          <button className="ghost" onClick={() => onDuplicate(doc)}><CopyPlus size={17} /> Dupliquer</button>
          {doc.type === "quote" && <button onClick={() => onConvert(doc, "order")}><PackageCheck size={17} /> Transformer en BC</button>}
          {doc.type === "order" && <button onClick={() => onConvert(doc, "invoice")}><ReceiptText size={17} /> Facturer</button>}
          <button onClick={() => onExport(doc)}><Download size={17} /> PDF</button>
          <button className="ghost" disabled={emailing} onClick={sendEmail}>
            {emailing ? <LoaderCircle className="spinIcon" size={17} /> : <Mail size={17} />}
            {emailing ? "Préparation..." : "Email"}
          </button>
          <button className="danger" onClick={() => onDelete(doc)}><Trash2 size={17} /></button>
        </div>
      </div>

      {historyOpen && <HistoryPanel doc={doc} />}

      <div className="editorGrid">
        <label>Client<select value={doc.clientId} onChange={(event) => patch({ clientId: event.target.value })}>{clients.map((client) => <option key={client.id} value={client.id}>{clientLabel(client)}</option>)}</select></label>
        <label>Nom du document / chantier<input placeholder="Ex: Dressing chambre parentale" value={doc.projectName} onChange={(event) => patch({ projectName: event.target.value })} /></label>
        <label>Date<input type="date" value={doc.issueDate} onChange={(event) => patch({ issueDate: event.target.value })} /></label>
        <label>Echeance<input type="date" value={doc.dueDate} onChange={(event) => patch({ dueDate: event.target.value })} /></label>
        <label>Adresse chantier<input placeholder="Adresse du chantier si differente du client" value={doc.siteAddress} onChange={(event) => patch({ siteAddress: event.target.value })} /></label>
        <label>Demarrage prevu<input placeholder="Ex: Semaine 42" value={doc.workStart} onChange={(event) => patch({ workStart: event.target.value })} /></label>
        <label>Duree estimee<input placeholder="Ex: 3 jours" value={doc.workDuration} onChange={(event) => patch({ workDuration: event.target.value })} /></label>
        <label>Acompte %<input type="number" placeholder="30" value={doc.depositRate || ""} onChange={(event) => patch({ depositRate: Number(event.target.value) })} /></label>
      </div>

      <div className="lineToolbar">
        <select onChange={(event) => { onAddCatalogLine(doc, event.target.value); event.currentTarget.value = ""; }} defaultValue="">
          <option value="" disabled>Ajouter depuis articles / prestations</option>
          {catalog.map((item) => <option key={item.id} value={item.id}>{item.category || "Sans categorie"} - {item.name || "Article sans nom"} ({currency(item.price)}/{item.unit || "u"})</option>)}
        </select>
        <button onClick={() => patch({ lines: [...doc.lines, emptyLine(doc.lines[0]?.vatRate ?? 20)] })}><CopyPlus size={17} /> Ligne libre</button>
      </div>

      <div className="lineTable">
        <div className="lineHead"><span>Designation</span><span>Unite</span><span>Qte</span><span>PU HT</span><span>Rem.</span><span>TVA</span><span>Total</span><span></span></div>
        {doc.lines.map((line) => (
          <div className="lineRow" key={line.id}>
            <div>
              <input placeholder="Nom de l'article ou prestation" value={line.description} onChange={(event) => patchLine(line.id, { description: event.target.value })} />
              <textarea value={line.details} onChange={(event) => patchLine(line.id, { details: event.target.value })} placeholder="Details: essence, finition, quincaillerie, pose..." />
            </div>
            <input placeholder="u, ml, m2, h" value={line.unit} onChange={(event) => patchLine(line.id, { unit: event.target.value })} />
            <input type="number" placeholder="1" value={line.quantity || ""} onChange={(event) => patchLine(line.id, { quantity: Number(event.target.value) })} />
            <input type="number" placeholder="0.00" value={line.unitPrice || ""} onChange={(event) => patchLine(line.id, { unitPrice: Number(event.target.value) })} />
            <input type="number" placeholder="0" value={line.discount || ""} onChange={(event) => patchLine(line.id, { discount: Number(event.target.value) })} />
            <input type="number" placeholder="20" value={line.vatRate || ""} onChange={(event) => patchLine(line.id, { vatRate: Number(event.target.value) })} />
            <strong>{currency((line.quantity * line.unitPrice) * (1 - line.discount / 100))}</strong>
            <button className="iconButton" onClick={() => patch({ lines: doc.lines.filter((item) => item.id !== line.id) })}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>

      <div className="bottomEditor">
        <label>Note document<textarea placeholder="Informations affichees sur ce document" value={doc.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
        <label>Conditions<textarea placeholder="Conditions propres a ce document" value={doc.terms} onChange={(event) => patch({ terms: event.target.value })} /></label>
        <div className="totalsBox">
          <div><span>Total HT</span><strong>{currency(sums.totalHt)}</strong></div>
          {Object.entries(sums.vatGroups).map(([rate, amount]) => <div key={rate}><span>TVA {rate}%</span><strong>{currency(amount)}</strong></div>)}
          <div className="grand"><span>Total TTC</span><strong>{currency(sums.totalTtc)}</strong></div>
          <div><span>Acompte</span><strong>{currency(sums.totalTtc * (doc.depositRate / 100))}</strong></div>
        </div>
      </div>

      <section className="attachmentsPanel" aria-label="Pieces jointes">
        <div className="attachmentsSummary">
          <div className="attachmentsTitle">
            <Paperclip size={15} />
            <div>
              <h3>Documents associes</h3>
              <span>{doc.attachments.length ? `${doc.attachments.length} piece(s) jointe(s)` : "Aucune piece jointe"}</span>
            </div>
          </div>
          <button className="ghost attachmentAddButton" onClick={() => onAddAttachment(doc)} title="Ajouter une piece jointe">
            <Paperclip size={16} /> Ajouter
          </button>
        </div>
        {doc.attachments.length > 0 && (
          <div className="attachmentList">
            {doc.attachments.map((attachment) => (
              <div className="attachmentRow" key={attachment.id}>
                <div>
                  <strong>{attachment.name}</strong>
                  <span>{fileSizeLabel(attachment.size)} - ajoute le {formatShortDate(attachment.addedAt)}</span>
                </div>
                <button className="iconButton" onClick={() => onOpenAttachment(attachment)} title="Ouvrir la piece jointe"><ExternalLink size={16} /></button>
                <button className="iconButton dangerIcon" onClick={() => onRemoveAttachment(doc, attachment)} title="Supprimer la piece jointe"><Trash2 size={16} /></button>
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
          <strong>{labels[entry.fromType]} {entry.fromNumber} {"->"} {labels[entry.toType]} {entry.toNumber}</strong>
          <em>{entry.snapshot.projectName || "Sans nom"} · {currency(totals(entry.snapshot.lines).totalTtc)}</em>
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
        <span>{doc.issueDate} · {doc.dueDate}</span>
      </div>
      <div className="previewLines">
        {doc.lines.slice(0, 4).map((line) => (
          <div key={line.id}>
            <span>{line.description || "Ligne sans designation"}</span>
            <strong>{currency((line.quantity * line.unitPrice) * (1 - line.discount / 100))}</strong>
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
  const filtered = items.filter((item) => `${item.name} ${item.category} ${item.unit}`.toLowerCase().includes(query.toLowerCase()));
  const patch = (item: CatalogItem, partial: Partial<CatalogItem>) => onChange({ ...item, ...partial });

  return (
    <section className="catalogPanel">
      <div className="catalogToolbar">
        <div className="searchBox"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher article, prestation, categorie" /></div>
        <button onClick={onCreate}><Plus size={17} /> Ajouter</button>
      </div>
      <div className="catalogList">
        {filtered.map((item) => (
          <article key={item.id} className="catalogRow">
            <label>Nom<input placeholder="Ex: Pose et ajustements" value={item.name} onChange={(event) => patch(item, { name: event.target.value })} /></label>
            <label>Categorie<input placeholder="Ex: Pose, fabrication" value={item.category} onChange={(event) => patch(item, { category: event.target.value })} /></label>
            <label>Unite<input placeholder="u, h, ml, m2" value={item.unit} onChange={(event) => patch(item, { unit: event.target.value })} /></label>
            <label>Prix HT<input type="number" placeholder="0.00" value={item.price || ""} onChange={(event) => patch(item, { price: Number(event.target.value) })} /></label>
            <label>TVA %<input type="number" placeholder="20" value={item.vatRate || ""} onChange={(event) => patch(item, { vatRate: Number(event.target.value) })} /></label>
            <button className="iconButton" onClick={() => onDelete(item)}><Trash2 size={16} /></button>
          </article>
        ))}
        {!filtered.length && <div className="emptyRows">Aucun article ne correspond.</div>}
      </div>
    </section>
  );
}

function ClientCard({ client, onChange, onDelete }: { client: Client; onChange: (client: Client) => void; onDelete: (client: Client) => void }) {
  const patch = (partial: Partial<Client>) => onChange({ ...client, ...partial });
  return (
    <article className="clientCard">
      <div className="cardHeader">
        <strong>{client.number}</strong>
        <button className="iconButton" onClick={() => onDelete(client)}><Trash2 size={16} /></button>
      </div>
      <label>Type<select value={client.type} onChange={(event) => patch({ type: event.target.value as Client["type"] })}><option value="particulier">Particulier</option><option value="professionnel">Professionnel</option></select></label>
      <label>Nom<input placeholder="Nom du client ou societe" value={client.name} onChange={(event) => patch({ name: event.target.value })} /></label>
      <label>Contact<input placeholder="Personne a contacter" value={client.contact} onChange={(event) => patch({ contact: event.target.value })} /></label>
      <label>Email<input placeholder="client@email.fr" value={client.email} onChange={(event) => patch({ email: event.target.value })} /></label>
      <label>Telephone<input placeholder="06 00 00 00 00" value={client.phone} onChange={(event) => patch({ phone: event.target.value })} /></label>
      <label>Adresse<input placeholder="Adresse du client" value={client.address} onChange={(event) => patch({ address: event.target.value })} /></label>
      <div className="twoCols">
        <label>CP<input placeholder="75000" value={client.postalCode} onChange={(event) => patch({ postalCode: event.target.value })} /></label>
        <label>Ville<input placeholder="Paris" value={client.city} onChange={(event) => patch({ city: event.target.value })} /></label>
      </div>
      <label>Notes<textarea placeholder="Informations internes" value={client.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
    </article>
  );
}

function FormGrid<T extends CompanySettings>({
  value,
  fields,
  onChange,
}: {
  value: T;
  fields: Array<[keyof T, string, "text" | "number", string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="formGrid">
      {fields.map(([key, label, type, placeholder]) => (
        <label key={String(key)}>
          {label}
          <input
            type={type}
            placeholder={placeholder}
            value={String(value[key] ?? "")}
            onChange={(event) => onChange({ ...value, [key]: type === "number" ? Number(event.target.value) : event.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
