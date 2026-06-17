import {
  Archive,
  Building2,
  Check,
  ChevronRight,
  CopyPlus,
  Download,
  FileCheck2,
  FileText,
  Home,
  PackageCheck,
  Plus,
  ReceiptText,
  Save,
  Search,
  Settings,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { renderDocumentHtml } from "./pdf";
import type { AppData, BusinessDocument, Client, CompanySettings, DocumentStatus, DocumentType, LineItem } from "./types";
import { addDaysIso, clientLabel, currency, duplicateLines, labels, sanitizeFileName, statusLabels, todayIso, totals } from "./utils";

type View = "dashboard" | "documents" | "clients" | "settings";

const emptyLine = (vatRate = 20): LineItem => ({
  id: crypto.randomUUID(),
  description: "Nouvel ouvrage",
  details: "",
  unit: "u",
  quantity: 1,
  unitPrice: 0,
  vatRate,
  discount: 0,
});

export function App() {
  const [data, setData] = useState<AppData>({} as AppData);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "all">("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    window.atelierApi.loadStore().then((loaded) => {
      setData(loaded);
      setLoaded(true);
      setSelectedId(loaded.documents[0]?.id ?? "");
    });
  }, []);

  async function persist(next: AppData, message = "Enregistre") {
    setData(next);
    await window.atelierApi.saveStore(next);
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  }

  const selectedDoc = useMemo(() => data?.documents.find((doc) => doc.id === selectedId), [data, selectedId]);
  const selectedClient = useMemo(() => data?.clients.find((client) => client.id === selectedDoc?.clientId), [data, selectedDoc]);

  if (!loaded) {
    return <main className="loading">Chargement de L'Atelier du Bois...</main>;
  }

  const filteredDocuments = data.documents
    .filter((doc) => typeFilter === "all" || doc.type === typeFilter)
    .filter((doc) => {
      const client = data.clients.find((item) => item.id === doc.clientId);
      const text = `${doc.number} ${doc.projectName} ${clientLabel(client)} ${doc.status}`.toLowerCase();
      return text.includes(query.toLowerCase());
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

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

  async function createClient() {
    const number = await window.atelierApi.nextNumber("client");
    const client: Client = {
      id: crypto.randomUUID(),
      number,
      type: "particulier",
      name: "Nouveau client",
      contact: "",
      email: "",
      phone: "",
      address: "",
      postalCode: "",
      city: "",
      notes: "",
      createdAt: new Date().toISOString(),
    };
    await persist({ ...data, clients: [client, ...data.clients] }, "Client cree");
    setView("clients");
  }

  async function createDocument(type: DocumentType = "quote") {
    const number = await window.atelierApi.nextNumber(type);
    const issueDate = todayIso();
    const doc: BusinessDocument = {
      id: crypto.randomUUID(),
      type,
      number,
      status: "draft",
      clientId: data.clients[0]?.id ?? "",
      issueDate,
      dueDate: addDaysIso(issueDate, type === "quote" ? data.company.quoteValidityDays : 30),
      projectName: "Agencement menuiserie sur mesure",
      siteAddress: "",
      workStart: "",
      workDuration: "",
      depositRate: data.company.defaultDepositRate,
      notes: data.company.notes,
      terms: data.company.paymentTerms,
      lines: [emptyLine(data.company.defaultVatRate)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await persist({ ...data, documents: [doc, ...data.documents] }, `${labels[type]} cree`);
    setSelectedId(doc.id);
    setView("documents");
  }

  async function convertDocument(source: BusinessDocument, type: DocumentType) {
    const number = await window.atelierApi.nextNumber(type);
    const issueDate = todayIso();
    const converted: BusinessDocument = {
      ...source,
      id: crypto.randomUUID(),
      type,
      number,
      status: type === "order" ? "ordered" : "draft",
      issueDate,
      dueDate: addDaysIso(issueDate, 30),
      originId: source.id,
      lines: duplicateLines(source.lines),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updatedSource = {
      ...source,
      status: type === "order" ? "ordered" : "invoiced",
      updatedAt: new Date().toISOString(),
    } satisfies BusinessDocument;
    await persist(
      { ...data, documents: [converted, ...data.documents.map((doc) => (doc.id === source.id ? updatedSource : doc))] },
      `${labels[type]} genere`
    );
    setSelectedId(converted.id);
  }

  async function updateDocument(doc: BusinessDocument) {
    const updated = { ...doc, updatedAt: new Date().toISOString() };
    await persist({ ...data, documents: data.documents.map((item) => (item.id === doc.id ? updated : item)) });
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
    await window.atelierApi.savePdf({ html, defaultPath: name });
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
          id: crypto.randomUUID(),
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
          <button className={view === "clients" ? "active" : ""} onClick={() => setView("clients")}><Users size={18} /> Clients</button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings size={18} /> Societe</button>
        </nav>
        <div className="quickActions">
          <button onClick={() => createDocument("quote")}><Plus size={17} /> Nouveau devis</button>
          <button onClick={createClient}><UserPlus size={17} /> Nouveau client</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Menuiserie et agencement</span>
            <h1>{view === "dashboard" ? "Pilotage commercial" : view === "documents" ? "Devis, BC et factures" : view === "clients" ? "Fichier clients" : "Parametres societe"}</h1>
          </div>
          <div className="topActions">
            {notice && <span className="notice"><Check size={16} /> {notice}</span>}
            <button className="ghost" onClick={() => window.atelierApi.exportJson(data)}><Archive size={17} /> Sauvegarde</button>
          </div>
        </header>

        {view === "dashboard" && (
          <section className="dashboard">
            <div className="kpi"><FileText /><span>Devis en portefeuille</span><strong>{currency(dashboardTotals.quotes)}</strong></div>
            <div className="kpi"><PackageCheck /><span>Commandes</span><strong>{currency(dashboardTotals.orders)}</strong></div>
            <div className="kpi"><ReceiptText /><span>Facture</span><strong>{currency(dashboardTotals.invoices)}</strong></div>
            <div className="kpi"><FileCheck2 /><span>Encaisse</span><strong>{currency(dashboardTotals.paid)}</strong></div>
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
              <div className="searchBox"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher document, client, chantier" /></div>
              <div className="segmented">
                {(["all", "quote", "order", "invoice"] as const).map((type) => (
                  <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>{type === "all" ? "Tous" : labels[type]}</button>
                ))}
              </div>
              <div className="docList">
                {filteredDocuments.map((doc) => {
                  const sum = totals(doc.lines).totalTtc;
                  const client = data.clients.find((item) => item.id === doc.clientId);
                  return (
                    <button key={doc.id} className={selectedId === doc.id ? "docCard selected" : "docCard"} onClick={() => setSelectedId(doc.id)}>
                      <span>{labels[doc.type]} <strong>{doc.number}</strong></span>
                      <b>{doc.projectName}</b>
                      <small>{clientLabel(client)}</small>
                      <em>{currency(sum)}</em>
                    </button>
                  );
                })}
              </div>
            </aside>
            {selectedDoc ? (
              <DocumentEditor
                doc={selectedDoc}
                clients={data.clients}
                catalog={data.catalog}
                onChange={updateDocument}
                onDelete={deleteDocument}
                onExport={exportPdf}
                onConvert={convertDocument}
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

        {view === "clients" && (
          <section className="clientsGrid">
            {data.clients.map((client) => (
              <ClientCard key={client.id} client={client} onChange={updateClient} onDelete={deleteClient} />
            ))}
            <button className="addTile" onClick={createClient}><UserPlus /> Ajouter un client</button>
          </section>
        )}

        {view === "settings" && (
          <section className="settingsPanel">
            <div className="panelTitle"><h2>Identite et conditions</h2><Building2 /></div>
            <FormGrid
              value={data.company}
              onChange={(company) => persist({ ...data, company })}
              fields={[
                ["name", "Nom commercial"],
                ["legalName", "Raison sociale"],
                ["siret", "SIRET"],
                ["vatNumber", "N TVA"],
                ["address", "Adresse"],
                ["postalCode", "Code postal"],
                ["city", "Ville"],
                ["phone", "Telephone"],
                ["email", "Email"],
                ["website", "Site web"],
                ["iban", "IBAN"],
                ["bic", "BIC"],
                ["quoteValidityDays", "Validite devis (jours)", "number"],
                ["defaultVatRate", "TVA par defaut", "number"],
                ["defaultDepositRate", "Acompte par defaut", "number"],
              ]}
            />
            <label className="fullLabel">Conditions de paiement<textarea value={data.company.paymentTerms} onChange={(event) => persist({ ...data, company: { ...data.company, paymentTerms: event.target.value } })} /></label>
            <label className="fullLabel">Note par defaut<textarea value={data.company.notes} onChange={(event) => persist({ ...data, company: { ...data.company, notes: event.target.value } })} /></label>
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
          <ChevronRight size={16} />
        </button>
      ))}
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
  onConvert,
  onAddCatalogLine,
}: {
  doc: BusinessDocument;
  clients: Client[];
  catalog: AppData["catalog"];
  onChange: (doc: BusinessDocument) => void;
  onDelete: (doc: BusinessDocument) => void;
  onExport: (doc: BusinessDocument) => void;
  onConvert: (doc: BusinessDocument, type: DocumentType) => void;
  onAddCatalogLine: (doc: BusinessDocument, catalogId: string) => void;
}) {
  const sums = totals(doc.lines);
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
          <select value={doc.status} onChange={(event) => patch({ status: event.target.value as DocumentStatus })}>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {doc.type === "quote" && <button onClick={() => onConvert(doc, "order")}><PackageCheck size={17} /> Transformer en BC</button>}
          {doc.type !== "invoice" && <button onClick={() => onConvert(doc, "invoice")}><ReceiptText size={17} /> Facturer</button>}
          <button onClick={() => onExport(doc)}><Download size={17} /> PDF</button>
          <button className="danger" onClick={() => onDelete(doc)}><Trash2 size={17} /></button>
        </div>
      </div>

      <div className="editorGrid">
        <label>Client<select value={doc.clientId} onChange={(event) => patch({ clientId: event.target.value })}>{clients.map((client) => <option key={client.id} value={client.id}>{clientLabel(client)}</option>)}</select></label>
        <label>Nom du chantier<input value={doc.projectName} onChange={(event) => patch({ projectName: event.target.value })} /></label>
        <label>Date<input type="date" value={doc.issueDate} onChange={(event) => patch({ issueDate: event.target.value })} /></label>
        <label>Echeance<input type="date" value={doc.dueDate} onChange={(event) => patch({ dueDate: event.target.value })} /></label>
        <label>Adresse chantier<input value={doc.siteAddress} onChange={(event) => patch({ siteAddress: event.target.value })} /></label>
        <label>Demarrage prevu<input value={doc.workStart} onChange={(event) => patch({ workStart: event.target.value })} /></label>
        <label>Duree estimee<input value={doc.workDuration} onChange={(event) => patch({ workDuration: event.target.value })} /></label>
        <label>Acompte %<input type="number" value={doc.depositRate} onChange={(event) => patch({ depositRate: Number(event.target.value) })} /></label>
      </div>

      <div className="lineToolbar">
        <select onChange={(event) => { onAddCatalogLine(doc, event.target.value); event.currentTarget.value = ""; }} defaultValue="">
          <option value="" disabled>Ajouter depuis le catalogue menuiserie</option>
          {catalog.map((item) => <option key={item.id} value={item.id}>{item.category} - {item.name} ({currency(item.price)}/{item.unit})</option>)}
        </select>
        <button onClick={() => patch({ lines: [...doc.lines, emptyLine()] })}><CopyPlus size={17} /> Ligne libre</button>
      </div>

      <div className="lineTable">
        <div className="lineHead"><span>Designation</span><span>Unite</span><span>Qte</span><span>PU HT</span><span>Rem.</span><span>TVA</span><span>Total</span><span></span></div>
        {doc.lines.map((line) => (
          <div className="lineRow" key={line.id}>
            <div><input value={line.description} onChange={(event) => patchLine(line.id, { description: event.target.value })} /><textarea value={line.details} onChange={(event) => patchLine(line.id, { details: event.target.value })} placeholder="Details: essence, finition, quincaillerie, pose..." /></div>
            <input value={line.unit} onChange={(event) => patchLine(line.id, { unit: event.target.value })} />
            <input type="number" value={line.quantity} onChange={(event) => patchLine(line.id, { quantity: Number(event.target.value) })} />
            <input type="number" value={line.unitPrice} onChange={(event) => patchLine(line.id, { unitPrice: Number(event.target.value) })} />
            <input type="number" value={line.discount} onChange={(event) => patchLine(line.id, { discount: Number(event.target.value) })} />
            <input type="number" value={line.vatRate} onChange={(event) => patchLine(line.id, { vatRate: Number(event.target.value) })} />
            <strong>{currency((line.quantity * line.unitPrice) * (1 - line.discount / 100))}</strong>
            <button className="iconButton" onClick={() => patch({ lines: doc.lines.filter((item) => item.id !== line.id) })}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>

      <div className="bottomEditor">
        <label>Note document<textarea value={doc.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
        <label>Conditions<textarea value={doc.terms} onChange={(event) => patch({ terms: event.target.value })} /></label>
        <div className="totalsBox">
          <div><span>Total HT</span><strong>{currency(sums.totalHt)}</strong></div>
          {Object.entries(sums.vatGroups).map(([rate, amount]) => <div key={rate}><span>TVA {rate}%</span><strong>{currency(amount)}</strong></div>)}
          <div className="grand"><span>Total TTC</span><strong>{currency(sums.totalTtc)}</strong></div>
          <div><span>Acompte</span><strong>{currency(sums.totalTtc * (doc.depositRate / 100))}</strong></div>
        </div>
      </div>
    </article>
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
      <label>Nom<input value={client.name} onChange={(event) => patch({ name: event.target.value })} /></label>
      <label>Contact<input value={client.contact} onChange={(event) => patch({ contact: event.target.value })} /></label>
      <label>Email<input value={client.email} onChange={(event) => patch({ email: event.target.value })} /></label>
      <label>Telephone<input value={client.phone} onChange={(event) => patch({ phone: event.target.value })} /></label>
      <label>Adresse<input value={client.address} onChange={(event) => patch({ address: event.target.value })} /></label>
      <div className="twoCols">
        <label>CP<input value={client.postalCode} onChange={(event) => patch({ postalCode: event.target.value })} /></label>
        <label>Ville<input value={client.city} onChange={(event) => patch({ city: event.target.value })} /></label>
      </div>
      <label>Notes<textarea value={client.notes} onChange={(event) => patch({ notes: event.target.value })} /></label>
    </article>
  );
}

function FormGrid<T extends CompanySettings>({
  value,
  fields,
  onChange,
}: {
  value: T;
  fields: Array<[keyof T, string, "number"?]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="formGrid">
      {fields.map(([key, label, type]) => (
        <label key={String(key)}>
          {label}
          <input
            type={type ?? "text"}
            value={String(value[key] ?? "")}
            onChange={(event) => onChange({ ...value, [key]: type === "number" ? Number(event.target.value) : event.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
