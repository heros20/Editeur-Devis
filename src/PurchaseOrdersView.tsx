import { CheckCircle2, FileText, Mail, Plus, ReceiptText, Save, Search, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { purchaseLinesTotals } from "./purchaseInvoices";
import { nextPurchaseOrderNumber } from "./purchaseOrders";
import { PurchaseAttachments } from "./PurchaseAttachments";
import type { CatalogItem, DocumentAttachment, PurchaseInvoiceLine, PurchaseOrder, Supplier } from "./types";
import { addDaysIso, currency, makeId, todayIso } from "./utils";

function newLine(vatRate: number): PurchaseInvoiceLine {
  return { id: makeId("purchase-line"), description: "", unit: "u", quantity: 1, unitPrice: 0, vatRate };
}

function newOrder(orders: PurchaseOrder[], vatRate: number, supplier?: Supplier): PurchaseOrder {
  const now = new Date().toISOString();
  const orderDate = todayIso();
  return {
    id: makeId("purchase-order"),
    number: nextPurchaseOrderNumber(orders),
    supplierId: supplier?.id || "",
    supplier: supplier?.name || "",
    orderDate,
    expectedDate: addDaysIso(orderDate, 14),
    status: "draft",
    notes: "",
    lines: [newLine(vatRate)],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function PurchaseOrdersView({
  orders,
  suppliers,
  catalog,
  defaultVatRate,
  selectedSupplier,
  readOnly,
  onSave,
  onEmail,
  onCreateInvoice,
  onDelete,
  onExportPdf,
  onAddAttachment,
  onOpenAttachment,
  onRemoveAttachment,
}: {
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  catalog: CatalogItem[];
  defaultVatRate: number;
  selectedSupplier?: Supplier;
  readOnly: boolean;
  onSave: (order: PurchaseOrder) => Promise<boolean>;
  onEmail: (order: PurchaseOrder) => Promise<boolean>;
  onCreateInvoice: (order: PurchaseOrder) => Promise<boolean>;
  onDelete: (order: PurchaseOrder) => Promise<boolean>;
  onExportPdf: (order: PurchaseOrder) => Promise<void>;
  onAddAttachment: (order: PurchaseOrder) => Promise<void>;
  onOpenAttachment: (attachment: DocumentAttachment) => Promise<void>;
  onRemoveAttachment: (order: PurchaseOrder, attachment: DocumentAttachment) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<PurchaseOrder | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    const updated = orders.find((order) => order.id === selectedId);
    if (updated) setDraft({ ...updated, lines: updated.lines.map((line) => ({ ...line })) });
    else {
      setSelectedId("");
      setDraft(null);
    }
  }, [orders, selectedId]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("fr");
    return [...orders]
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
      .filter((order) => !search || `${order.number} ${order.supplier}`.toLocaleLowerCase("fr").includes(search));
  }, [orders, query]);
  const supplierId = draft?.supplierId;
  const supplierCatalog = supplierId ? catalog.filter((item) => !item.supplierId || item.supplierId === supplierId) : catalog;
  const totals = draft ? purchaseLinesTotals(draft.lines) : { totalHt: 0, totalVat: 0, totalTtc: 0 };
  const persisted = Boolean(draft && orders.some((order) => order.id === draft.id));
  const locked = readOnly || draft?.status !== "draft";
  const valid = Boolean(
    draft?.supplierId &&
    draft.lines.length &&
    draft.lines.every((line) => line.description.trim() && line.quantity > 0 && line.unitPrice >= 0)
  );
  const statusLabel = draft?.status === "received" ? "Réceptionnée" : draft?.status === "sent" ? "Commandée" : "À préparer";

  function patchLine(id: string, partial: Partial<PurchaseInvoiceLine>) {
    if (draft) setDraft({ ...draft, lines: draft.lines.map((line) => (line.id === id ? { ...line, ...partial } : line)) });
  }
  function selectItem(id: string, itemId: string) {
    const item = catalog.find((entry) => entry.id === itemId);
    patchLine(
      id,
      item
        ? {
            catalogItemId: item.id,
            description: item.name,
            unit: item.stockUnit || item.unit || "u",
            unitPrice: item.purchasePrice,
            vatRate: item.vatRate,
          }
        : { catalogItemId: undefined }
    );
  }
  async function run(action: (order: PurchaseOrder) => Promise<boolean>) {
    if (!draft || busy) return;
    setBusy(true);
    await action({ ...draft, updatedAt: new Date().toISOString() });
    setBusy(false);
    setSelectedId(draft.id);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || locked) return;
    await run(onSave);
  }

  return (
    <section className={draft ? "purchaseLayout" : "purchaseLayout purchaseLayoutCardsOnly"}>
      <aside className="panel purchaseListPane">
        <div className="searchBox">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une commande…" />
        </div>
        {!readOnly && (
          <button
            className="purchaseAdd"
            onClick={() => {
              const order = newOrder(orders, defaultVatRate, selectedSupplier);
              setSelectedId(order.id);
              setDraft(order);
            }}
          >
            <Plus size={17} /> Nouvelle commande fournisseur
          </button>
        )}
        <div className="listMeta">{filtered.length} commande(s)</div>
        <div className="purchaseList">
          {filtered.map((order) => {
            const value = purchaseLinesTotals(order.lines);
            return (
              <button
                key={order.id}
                className={selectedId === order.id ? "purchaseCard selected" : "purchaseCard"}
                onClick={() => {
                  setSelectedId(order.id);
                  setDraft({ ...order, lines: order.lines.map((line) => ({ ...line })) });
                }}
              >
                <span>
                  <strong>{order.number}</strong>
                  <em className={order.status === "received" ? "posted" : "draft"}>
                    {order.status === "received" ? "Reçue" : order.status === "sent" ? "Commandée" : "À préparer"}
                  </em>
                </span>
                <b>{order.supplier || "Fournisseur à sélectionner"}</b>
                <small>
                  {order.orderDate} · {currency(value.totalTtc)} TTC
                </small>
              </button>
            );
          })}
          {!filtered.length && <div className="emptyRows">Aucune commande fournisseur.</div>}
        </div>
      </aside>
      {draft && (
        <section className="panel purchaseEditor">
          <form onSubmit={save}>
            <div className="panelTitle purchaseHeader">
              <div>
                <span className="eyebrow">Commande fournisseur</span>
                <h2>{draft.number}</h2>
                <small>
                  {statusLabel}
                  {draft.receivedAt ? ` · reçue le ${draft.receivedAt.slice(0, 10)}` : ""}
                </small>
              </div>
              <div className="panelActions">
                {persisted && (
                  <button type="button" className="ghost" onClick={() => void onExportPdf(draft)}>
                    <FileText size={17} /> PDF
                  </button>
                )}
                {!readOnly && persisted && (
                  <button type="button" className="danger" disabled={busy} onClick={() => void run(onDelete)}>
                    <Trash2 size={17} /> Supprimer
                  </button>
                )}
                {!readOnly && draft.status === "draft" && (
                  <>
                    <button type="submit" className="ghost" disabled={busy}>
                      <Save size={17} /> Enregistrer
                    </button>
                    <button type="button" disabled={busy || !valid} onClick={() => void run(onEmail)}>
                      <Mail size={17} /> Envoyer par email
                    </button>
                  </>
                )}
                {!readOnly && draft.status === "sent" && (
                  <button type="button" disabled={busy} onClick={() => void run(onCreateInvoice)}>
                    <ReceiptText size={17} /> Transformer en facture
                  </button>
                )}
              </div>
            </div>
            <div className="purchaseMetaGrid">
              <label>
                Fournisseur
                <select
                  required
                  disabled={locked || Boolean(selectedSupplier)}
                  value={draft.supplierId}
                  onChange={(event) => {
                    const supplier = suppliers.find((entry) => entry.id === event.target.value);
                    setDraft({ ...draft, supplierId: supplier?.id || "", supplier: supplier?.name || "" });
                  }}
                >
                  <option value="">Sélectionner…</option>
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
                Date de commande
                <input
                  type="date"
                  disabled={locked}
                  value={draft.orderDate}
                  onChange={(event) => setDraft({ ...draft, orderDate: event.target.value })}
                />
              </label>
              <label>
                Livraison souhaitée
                <input
                  type="date"
                  disabled={locked}
                  value={draft.expectedDate}
                  onChange={(event) => setDraft({ ...draft, expectedDate: event.target.value })}
                />
              </label>
              <label className="purchaseNotes">
                Notes
                <input disabled={locked} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
              </label>
            </div>
            <div className="purchaseLines">
              <div className="purchaseLineHead">
                <span>Article</span>
                <span>Description</span>
                <span>Qté</span>
                <span>Unité</span>
                <span>Prix HT</span>
                <span>TVA</span>
                <span>Total HT</span>
                <span />
              </div>
              {draft.lines.map((line) => {
                const linked = catalog.find((item) => item.id === line.catalogItemId);
                return (
                  <div className="purchaseLine" key={line.id}>
                    <select
                      disabled={locked}
                      value={line.catalogItemId || ""}
                      onChange={(event) => selectItem(line.id, event.target.value)}
                    >
                      <option value="">Ligne libre</option>
                      {supplierCatalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <label>
                      <input
                        disabled={locked}
                        value={line.description}
                        onChange={(event) => patchLine(line.id, { description: event.target.value })}
                        placeholder="Désignation"
                      />
                      {linked?.trackStock && <small>Ajouté au stock à la réception</small>}
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      disabled={locked}
                      value={line.quantity || ""}
                      onChange={(event) => patchLine(line.id, { quantity: Number(event.target.value) })}
                    />
                    <input disabled={locked} value={line.unit} onChange={(event) => patchLine(line.id, { unit: event.target.value })} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={locked}
                      value={line.unitPrice || ""}
                      onChange={(event) => patchLine(line.id, { unitPrice: Number(event.target.value) })}
                    />
                    <select
                      disabled={locked}
                      value={line.vatRate}
                      onChange={(event) => patchLine(line.id, { vatRate: Number(event.target.value) })}
                    >
                      {[0, 5.5, 10, 20].map((rate) => (
                        <option key={rate} value={rate}>
                          {rate} %
                        </option>
                      ))}
                    </select>
                    <strong>{currency(line.quantity * line.unitPrice)}</strong>
                    {!locked ? (
                      <button
                        type="button"
                        className="iconButton"
                        onClick={() => setDraft({ ...draft, lines: draft.lines.filter((entry) => entry.id !== line.id) })}
                      >
                        <X size={16} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
              {!locked && (
                <button
                  type="button"
                  className="ghost purchaseLineAdd"
                  onClick={() => setDraft({ ...draft, lines: [...draft.lines, newLine(defaultVatRate)] })}
                >
                  <Plus size={16} /> Ajouter une ligne
                </button>
              )}
            </div>
            <PurchaseAttachments
              attachments={draft.attachments}
              readOnly={readOnly || !persisted}
              onAdd={() => void onAddAttachment(draft)}
              onOpen={(attachment) => void onOpenAttachment(attachment)}
              onRemove={(attachment) => void onRemoveAttachment(draft, attachment)}
            />
            <div className="purchaseFooter">
              <div className="purchaseStatusHint">
                <CheckCircle2 size={18} />
                {draft.status === "received"
                  ? "Commande transformée : facture associée et stock mis à jour."
                  : draft.status === "sent"
                    ? "À réception, transformez la commande en facture et renseignez son numéro."
                    : "Enregistrez puis envoyez le bon de commande au fournisseur par email."}
              </div>
              <div className="purchaseTotals">
                <span>
                  HT <strong>{currency(totals.totalHt)}</strong>
                </span>
                <span>
                  TVA <strong>{currency(totals.totalVat)}</strong>
                </span>
                <span>
                  TTC <strong>{currency(totals.totalTtc)}</strong>
                </span>
              </div>
            </div>
          </form>
        </section>
      )}
    </section>
  );
}
