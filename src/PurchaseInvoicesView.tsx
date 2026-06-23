import { CheckCircle2, History, Plus, RotateCcw, Save, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { purchaseInvoiceTotals } from "./purchaseInvoices";
import { PurchaseAttachments } from "./PurchaseAttachments";
import type { CatalogItem, DocumentAttachment, PaymentMethod, PurchaseInvoice, PurchaseInvoiceLine, Supplier } from "./types";
import { addDaysIso, currency, makeId, paymentMethodLabels, todayIso } from "./utils";

function newLine(vatRate: number): PurchaseInvoiceLine {
  return { id: makeId("purchase-line"), description: "", unit: "u", quantity: 1, unitPrice: 0, vatRate };
}

function newInvoice(vatRate: number, supplier?: Supplier): PurchaseInvoice {
  const now = new Date().toISOString();
  const invoiceDate = todayIso();
  return {
    id: makeId("purchase"),
    supplierId: supplier?.id || "",
    supplier: supplier?.name || "",
    reference: "",
    invoiceDate,
    dueDate: addDaysIso(invoiceDate, 30),
    status: "draft",
    paymentMethod: "bank_transfer",
    notes: "",
    lines: [newLine(vatRate)],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function PurchaseInvoicesView({
  invoices,
  suppliers,
  catalog,
  defaultVatRate,
  selectedSupplier,
  readOnly,
  onSave,
  onPost,
  onCancel,
  onDelete,
  onRestoreOrder,
  onAddAttachment,
  onOpenAttachment,
  onRemoveAttachment,
}: {
  invoices: PurchaseInvoice[];
  suppliers: Supplier[];
  catalog: CatalogItem[];
  defaultVatRate: number;
  selectedSupplier?: Supplier;
  readOnly: boolean;
  onSave: (invoice: PurchaseInvoice) => Promise<boolean>;
  onPost: (invoice: PurchaseInvoice) => Promise<boolean>;
  onCancel: (invoice: PurchaseInvoice) => Promise<boolean>;
  onDelete: (invoice: PurchaseInvoice) => Promise<boolean>;
  onRestoreOrder: (invoice: PurchaseInvoice) => Promise<boolean>;
  onAddAttachment: (invoice: PurchaseInvoice) => Promise<void>;
  onOpenAttachment: (attachment: DocumentAttachment) => Promise<void>;
  onRemoveAttachment: (invoice: PurchaseInvoice, attachment: DocumentAttachment) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<PurchaseInvoice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    const updated = invoices.find((invoice) => invoice.id === selectedId);
    if (updated) setDraft({ ...updated, lines: [...updated.lines] });
    else {
      setSelectedId("");
      setDraft(null);
    }
  }, [invoices, selectedId]);

  const filteredInvoices = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("fr");
    return [...invoices]
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
      .filter((invoice) => !search || `${invoice.reference} ${invoice.supplier}`.toLocaleLowerCase("fr").includes(search));
  }, [invoices, query]);

  const supplierId = draft?.supplierId;
  const supplierCatalog = supplierId ? catalog.filter((item) => !item.supplierId || item.supplierId === supplierId) : catalog;
  const totals = draft ? purchaseInvoiceTotals(draft) : { totalHt: 0, totalVat: 0, totalTtc: 0 };
  const persisted = Boolean(draft && invoices.some((invoice) => invoice.id === draft.id));
  const locked = readOnly || draft?.status === "posted";

  function select(invoice: PurchaseInvoice) {
    setSelectedId(invoice.id);
    setDraft({ ...invoice, lines: invoice.lines.map((line) => ({ ...line })) });
  }

  function patchLine(lineId: string, partial: Partial<PurchaseInvoiceLine>) {
    if (!draft) return;
    setDraft({ ...draft, lines: draft.lines.map((line) => (line.id === lineId ? { ...line, ...partial } : line)) });
  }

  function selectCatalogItem(lineId: string, itemId: string) {
    const item = catalog.find((entry) => entry.id === itemId);
    patchLine(
      lineId,
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

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || locked || busy) return;
    setBusy(true);
    const saved = await onSave({ ...draft, updatedAt: new Date().toISOString() });
    setBusy(false);
    if (saved) setSelectedId(draft.id);
  }

  async function run(action: (invoice: PurchaseInvoice) => Promise<boolean>) {
    if (!draft || busy) return;
    setBusy(true);
    const succeeded = await action({ ...draft, updatedAt: new Date().toISOString() });
    setBusy(false);
    if (succeeded) setSelectedId(draft.id);
  }

  const validForPosting = Boolean(
    draft?.supplierId &&
    draft.reference.trim() &&
    draft.lines.length &&
    draft.lines.every((line) => line.description.trim() && line.quantity > 0 && line.unitPrice >= 0)
  );

  return (
    <section className={draft ? "purchaseLayout" : "purchaseLayout purchaseLayoutCardsOnly"}>
      <aside className="panel purchaseListPane">
        <div className="searchBox">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une facture d’achat…" />
        </div>
        {!readOnly && (
          <button
            className="purchaseAdd"
            onClick={() => {
              const invoice = newInvoice(defaultVatRate, selectedSupplier);
              setSelectedId(invoice.id);
              setDraft(invoice);
            }}
          >
            <Plus size={17} /> Nouvelle facture d’achat
          </button>
        )}
        <div className="listMeta">{filteredInvoices.length} facture(s)</div>
        <div className="purchaseList">
          {filteredInvoices.map((invoice) => {
            const invoiceTotals = purchaseInvoiceTotals(invoice);
            return (
              <button
                key={invoice.id}
                className={selectedId === invoice.id ? "purchaseCard selected" : "purchaseCard"}
                onClick={() => select(invoice)}
              >
                <span>
                  <strong>{invoice.reference || "Sans référence"}</strong>
                  <em className={invoice.status === "posted" ? "posted" : "draft"}>
                    {invoice.status === "posted" ? "Validée" : "À préparer"}
                  </em>
                </span>
                <b>{invoice.supplier || "Fournisseur à sélectionner"}</b>
                <small>
                  {invoice.invoiceDate} · {currency(invoiceTotals.totalTtc)} TTC
                </small>
              </button>
            );
          })}
          {!filteredInvoices.length && <div className="emptyRows">Aucune facture d’achat enregistrée.</div>}
        </div>
      </aside>

      {draft && (
        <section className="panel purchaseEditor">
          <form onSubmit={save}>
            <div className="panelTitle purchaseHeader">
              <div>
                <span className="eyebrow">Achats fournisseur</span>
                <h2>{draft.reference || "Nouvelle facture"}</h2>
                <small>
                  {draft.status === "posted"
                    ? draft.purchaseOrderId
                      ? "Comptabilisée · stock déjà réceptionné par la commande"
                      : "Comptabilisée et entrée en stock"
                    : draft.purchaseOrderId
                      ? "Issue d’une commande réceptionnée · validation comptable uniquement"
                      : "Sans impact avant validation"}
                </small>
              </div>
              <div className="panelActions">
                {!readOnly && persisted && draft.sourceOrder && (
                  <button type="button" className="ghost" disabled={busy} onClick={() => void run(onRestoreOrder)}>
                    <RotateCcw size={17} /> Revenir au bon de commande
                  </button>
                )}
                {!readOnly && persisted && !draft.sourceOrder && (
                  <button type="button" className="danger" disabled={busy} onClick={() => void run(onDelete)}>
                    <Trash2 size={17} /> Supprimer
                  </button>
                )}
                {!readOnly && draft.status === "posted" && (
                  <button type="button" className="ghost" disabled={busy} onClick={() => void run(onCancel)}>
                    <RotateCcw size={17} /> Annuler la validation
                  </button>
                )}
                {!readOnly && draft.status === "draft" && (
                  <>
                    <button type="submit" className="ghost" disabled={busy}>
                      <Save size={17} /> Enregistrer
                    </button>
                    <button type="button" disabled={busy || !validForPosting} onClick={() => void run(onPost)}>
                      <CheckCircle2 size={17} /> Valider la facture
                    </button>
                  </>
                )}
              </div>
            </div>

            {draft.sourceOrder && (
              <section className="purchaseHistory" aria-label="Historique du document">
                <div className="purchaseHistoryTitle">
                  <History size={18} />
                  <div>
                    <strong>Historique du document</strong>
                    <small>Cette facture remplace le bon de commande d’origine.</small>
                  </div>
                </div>
                <div className="purchaseHistoryFlow">
                  <div>
                    <small>Document d’origine</small>
                    <strong>{draft.sourceOrder.number}</strong>
                    <span>Commandé le {draft.sourceOrder.orderDate}</span>
                  </div>
                  <span className="purchaseHistoryArrow">→</span>
                  <div className="current">
                    <small>Document actuel</small>
                    <strong>{draft.reference || "Facture fournisseur"}</strong>
                    <span>Transformé en facture le {draft.invoiceDate}</span>
                  </div>
                </div>
              </section>
            )}

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
                N° de facture fournisseur
                <input
                  required
                  disabled={locked}
                  value={draft.reference}
                  onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
                  placeholder="N° de facture"
                />
              </label>
              <label>
                Date de facture
                <input
                  type="date"
                  required
                  disabled={locked}
                  value={draft.invoiceDate}
                  onChange={(event) => setDraft({ ...draft, invoiceDate: event.target.value })}
                />
              </label>
              <label>
                Échéance
                <input
                  type="date"
                  disabled={locked}
                  value={draft.dueDate}
                  onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                />
              </label>
              <label>
                Paiement
                <select
                  disabled={locked}
                  value={draft.paymentMethod}
                  onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value as PaymentMethod })}
                >
                  {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabels[method]}
                    </option>
                  ))}
                </select>
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
                const linkedItem = catalog.find((item) => item.id === line.catalogItemId);
                return (
                  <div className="purchaseLine" key={line.id}>
                    <select
                      disabled={locked}
                      value={line.catalogItemId || ""}
                      onChange={(event) => selectCatalogItem(line.id, event.target.value)}
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
                      {linkedItem?.trackStock && (
                        <small>{draft.purchaseOrderId ? "Stock déjà reçu via la commande" : "Entrée en stock à la validation"}</small>
                      )}
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
                        aria-label={`Supprimer ${line.description || "la ligne"}`}
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
                <ShoppingCart size={18} />{" "}
                {draft.status === "posted"
                  ? draft.purchaseOrderId
                    ? "La facture est comptabilisée sans doubler la réception de stock."
                    : "La dépense et le stock sont synchronisés."
                  : "Validez pour comptabiliser cette facture."}
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
