import {
  Archive,
  Building2,
  Check,
  ChevronRight,
  Clipboard,
  CopyPlus,
  Download,
  FileCheck2,
  FileText,
  History,
  Home,
  Mail,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createDefaultAppData, normalizeData } from "./defaultData";
import { renderCompanyHtml, renderDocumentHtml } from "./pdf";
import { getAtelierApi } from "./runtimeApi";
import type {
  AppData,
  BusinessDocument,
  CatalogItem,
  Client,
  CompanySettings,
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

type View = "dashboard" | "documents" | "catalog" | "clients" | "settings";

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
  const [typeFilter, setTypeFilter] = useState<DocumentType | "all">("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api
      .loadStore()
      .then((loadedData) => {
        if (!active) return;
        const normalized = normalizeData(loadedData);
        setData(normalized);
        setSelectedId(normalized.documents[0]?.id ?? "");
      })
      .catch((error) => {
        console.error("Impossible de charger les donnees", error);
        if (!active) return;
        setLoadError("Chargement impossible, demarrage avec un dossier local vide.");
      })
      .finally(() => {
        if (!active) return;
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    if (!selectedId && data.documents.length) {
      setSelectedId(data.documents[0].id);
    }
  }, [data.documents, selectedId]);

  async function persist(next: AppData, message = "Enregistre") {
    const normalized = normalizeData(next);
    setData(normalized);
    try {
      await api.saveStore(normalized);
      setNotice(message);
    } catch (error) {
      console.error("Impossible d'enregistrer les donnees", error);
      setNotice("Sauvegarde indisponible");
    }
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function reserveNumber(type: DocumentType | "client", source: AppData) {
    const count = source.counters[type] || 1;
    let number = formatBusinessNumber(type, count);
    try {
      number = await api.nextNumber(type);
    } catch (error) {
      console.warn("Numerotation locale utilisee", error);
    }
    return {
      number,
      data: {
        ...source,
        counters: {
          ...source.counters,
          [type]: count + 1,
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
      ...doc.history.flatMap((entry) => [entry.fromNumber, entry.toNumber, labels[entry.fromType], labels[entry.toType], entry.snapshot.projectName]),
    ].filter(Boolean).join(" ").toLowerCase();
  }

  const sortedClients = useMemo(
    () => [...data.clients].sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "fr")),
    [data.clients]
  );
  const sortedDocuments = useMemo(
    () => [...data.documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.number.localeCompare(a.number)),
    [data.documents]
  );
  const sortedCatalog = useMemo(
    () => [...data.catalog].sort((a, b) => `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`, "fr")),
    [data.catalog]
  );
  const selectedDoc = useMemo(() => data.documents.find((doc) => doc.id === selectedId), [data.documents, selectedId]);
  const selectedClient = useMemo(() => data.clients.find((client) => client.id === selectedDoc?.clientId), [data.clients, selectedDoc]);

  if (!loaded) {
    return <main className="loading">Chargement de L'Atelier du Bois...</main>;
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
    { draft: 0, sent: 0, accepted: 0, ordered: 0, invoiced: 0, paid: 0, canceled: 0 }
  );
  const pendingValue = data.documents
    .filter((doc) => doc.status === "sent" || doc.status === "accepted" || doc.status === "ordered" || doc.status === "invoiced")
    .reduce((sum, doc) => sum + totals(doc.lines).totalTtc, 0);
  const dueDocuments = data.documents
    .filter((doc) => doc.dueDate && doc.status !== "paid" && doc.status !== "canceled")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  async function createClient() {
    const reserved = await reserveNumber("client", data);
    const client = buildClient(reserved.number, "Nouveau client");
    await persist({ ...reserved.data, clients: [client, ...reserved.data.clients] }, "Client cree");
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
      lines: [emptyLine(reserved.data.company.defaultVatRate)],
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await persist({ ...reserved.data, documents: [doc, ...reserved.data.documents] }, `${labels[type]} cree`);
    setSelectedId(doc.id);
    setView("documents");
  }

  async function convertDocument(source: BusinessDocument, type: DocumentType) {
    if (source.type === type) return;
    const reserved = await reserveNumber(type, data);
    const issueDate = todayIso();
    const transformed: BusinessDocument = {
      ...source,
      type,
      number: reserved.number,
      status: type === "order" ? "ordered" : "invoiced",
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
    const nextStatus: DocumentStatus =
      doc.type === "quote"
        ? doc.status === "draft"
          ? "sent"
          : "accepted"
        : doc.type === "invoice"
          ? "paid"
          : "ordered";
    await updateDocument({ ...doc, status: nextStatus });
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
      history: [...source.history],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await persist({ ...reserved.data, documents: [duplicate, ...reserved.data.documents] }, `${labels[source.type]} duplique`);
    setSelectedId(duplicate.id);
    setView("documents");
  }

  async function deleteDocument(doc: BusinessDocument) {
    const nextDocs = data.documents.filter((item) => item.id !== doc.id);
    await persist({ ...data, documents: nextDocs }, "Document supprime");
    setSelectedId(nextDocs[0]?.id ?? "");
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
    await api.openEmail({
      to: email,
      subject: `${labels[doc.type]} ${doc.number}${doc.projectName ? ` - ${doc.projectName}` : ""}`,
      body: [
        `Bonjour,`,
        "",
        `Veuillez trouver ci-joint ${labels[doc.type].toLowerCase()} ${doc.number}.`,
        doc.projectName ? `Projet: ${doc.projectName}` : "",
        `Montant TTC: ${currency(totals(doc.lines).totalTtc)}`,
        "",
        data.company.name,
      ].filter(Boolean).join("\n"),
    });
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
          <div className="logo">AB</div>
          <div>
            <strong>L'Atelier du Bois</strong>
            <span>Gestion menuiserie</span>
          </div>
        </div>
        <nav>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><Home size={18} /> Tableau</button>
          <button className={view === "documents" ? "active" : ""} onClick={() => setView("documents")}><FileText size={18} /> Documents</button>
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
            <span className="eyebrow">Menuiserie et agencement</span>
            <h1>{view === "dashboard" ? "Pilotage commercial" : view === "documents" ? "Devis, BC et factures" : view === "catalog" ? "Articles et prestations" : view === "clients" ? "Fichier clients" : "Parametres societe"}</h1>
            {view === "documents" && selectedDoc && <span className="contextLine">{selectedDoc.number} · {clientLabel(selectedClient)}</span>}
          </div>
          <div className="topActions">
            {loadError && <span className="notice warning"><Check size={16} /> {loadError}</span>}
            {notice && <span className="notice"><Check size={16} /> {notice}</span>}
            <button className="ghost" onClick={() => api.exportJson(data)}><Archive size={17} /> Sauvegarde</button>
          </div>
        </header>

        {view === "dashboard" && (
          <section className="dashboard">
            <div className="kpi"><FileText /><span>Devis en portefeuille</span><strong>{currency(dashboardTotals.quotes)}</strong></div>
            <div className="kpi"><PackageCheck /><span>Commandes</span><strong>{currency(dashboardTotals.orders)}</strong></div>
            <div className="kpi"><ReceiptText /><span>Factures</span><strong>{currency(dashboardTotals.invoices)}</strong></div>
            <div className="kpi"><FileCheck2 /><span>A encaisser</span><strong>{currency(pendingValue)}</strong></div>
            <div className="panel compact">
              <div className="panelTitle"><h2>Pipeline</h2></div>
              <div className="statusGrid">
                <StatusPill status="draft" count={statusCounts.draft} />
                <StatusPill status="sent" count={statusCounts.sent} />
                <StatusPill status="accepted" count={statusCounts.accepted} />
                <StatusPill status="invoiced" count={statusCounts.invoiced} />
              </div>
            </div>
            <div className="panel compact">
              <div className="panelTitle"><h2>Echeances</h2></div>
              <DueRows docs={dueDocuments} clients={data.clients} onOpen={(id) => { setSelectedId(id); setView("documents"); }} />
            </div>
            <div className="panel wide">
              <div className="panelTitle">
                <h2>Activite recente</h2>
                <button onClick={() => createDocument("quote")}><Plus size={17} /> Creer un devis</button>
              </div>
              <DocumentRows docs={filteredDocuments.slice(0, 8)} clients={data.clients} onOpen={(id) => { setSelectedId(id); setView("documents"); }} />
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
                    <button key={doc.id} className={selectedId === doc.id ? "docCard selected" : "docCard"} onClick={() => setSelectedId(doc.id)}>
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
              />
            ) : (
              <div className="emptyState">
                <FileText size={42} />
                <h2>Aucun document</h2>
                <p>Creez un premier devis pour demarrer le flux devis, bon de commande, facture.</p>
                <button onClick={() => createDocument("quote")}><Plus size={17} /> Nouveau devis</button>
              </div>
            )}
          </section>
        )}

        {view === "catalog" && (
          <CatalogManager items={sortedCatalog} onCreate={createCatalogItem} onChange={updateCatalogItem} onDelete={deleteCatalogItem} />
        )}

        {view === "clients" && (
          <section className="clientsGrid">
            {sortedClients.map((client) => (
              <ClientCard key={client.id} client={client} onChange={updateClient} onDelete={deleteClient} />
            ))}
            <button className="addTile" onClick={createClient}><UserPlus /> Ajouter un client</button>
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
                ["name", "Nom commercial", "text", "L'Atelier du Bois"],
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
          </section>
        )}
      </main>
    </div>
  );
}

function DocumentRows({ docs, clients, onOpen }: { docs: BusinessDocument[]; clients: Client[]; onOpen: (id: string) => void }) {
  if (!docs.length) return <div className="emptyRows">Aucune activite pour le moment.</div>;
  return (
    <div className="rows">
      {docs.map((doc) => (
        <button key={doc.id} onClick={() => onOpen(doc.id)}>
          <span>{labels[doc.type]}</span>
          <strong>{doc.number}</strong>
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
}: {
  doc: BusinessDocument;
  clients: Client[];
  catalog: AppData["catalog"];
  onChange: (doc: BusinessDocument) => void;
  onDelete: (doc: BusinessDocument) => void;
  onExport: (doc: BusinessDocument) => void;
  onEmail: (doc: BusinessDocument) => void;
  onConvert: (doc: BusinessDocument, type: DocumentType) => void;
  onDuplicate: (doc: BusinessDocument) => void;
  onAdvanceStatus: (doc: BusinessDocument) => void;
  onAddCatalogLine: (doc: BusinessDocument, catalogId: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const sums = totals(doc.lines);
  const client = clients.find((item) => item.id === doc.clientId);
  const quickStatusLabel = doc.type === "invoice" ? "Marquer paye" : doc.type === "quote" && doc.status === "draft" ? "Envoyer" : "Valider";
  const patch = (partial: Partial<BusinessDocument>) => onChange({ ...doc, ...partial });
  const patchLine = (id: string, partial: Partial<LineItem>) =>
    patch({ lines: doc.lines.map((line) => (line.id === id ? { ...line, ...partial } : line)) });

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
          <button className="ghost" onClick={() => onEmail(doc)}><Mail size={17} /> Email</button>
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
