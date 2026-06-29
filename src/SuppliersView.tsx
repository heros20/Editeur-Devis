import { Building2, Mail, MapPin, Package, Phone, Plus, Save, Search, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { BusinessExpense, CatalogItem, CompanySettings, Supplier } from "./types";
import { currency, makeId, suggestedSalePriceHt } from "./utils";

function newSupplier(): Supplier {
  const now = new Date().toISOString();
  return {
    id: makeId("supplier"),
    name: "",
    contact: "",
    email: "",
    phone: "",
    siret: "",
    vatNumber: "",
    address: "",
    postalCode: "",
    city: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function SuppliersView({
  suppliers,
  catalog,
  company,
  expenses,
  readOnly,
  onSave,
  onDelete,
  onCreateItem,
  onSaveItem,
  onDeleteItem,
}: {
  suppliers: Supplier[];
  catalog: CatalogItem[];
  company: CompanySettings;
  expenses: BusinessExpense[];
  readOnly: boolean;
  onSave: (supplier: Supplier) => Promise<boolean>;
  onDelete: (supplier: Supplier) => Promise<boolean>;
  onCreateItem: (supplier: Supplier) => Promise<void>;
  onSaveItem: (item: CatalogItem) => Promise<void>;
  onDeleteItem: (item: CatalogItem) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(suppliers[0]?.id || "");
  const [draft, setDraft] = useState<Supplier | null>(suppliers[0] || null);
  const [saving, setSaving] = useState(false);
  const linkedItems = draft ? catalog.filter((item) => item.supplierId === draft.id) : [];
  const linkedExpenses = draft ? expenses.filter((expense) => expense.supplierId === draft.id) : [];
  const expenseTotal = linkedExpenses.reduce((sum, expense) => sum + expense.amountHt, 0);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("fr");
    return [...suppliers]
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .filter(
        (supplier) =>
          !search ||
          [supplier.name, supplier.contact, supplier.email, supplier.phone, supplier.siret, supplier.city]
            .join(" ")
            .toLocaleLowerCase("fr")
            .includes(search)
      );
  }, [query, suppliers]);

  function select(supplier: Supplier) {
    setSelectedId(supplier.id);
    setDraft({ ...supplier });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || readOnly || saving || !draft.name.trim()) return;
    setSaving(true);
    const next = { ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() };
    const saved = await onSave(next);
    setSaving(false);
    if (saved) {
      setSelectedId(next.id);
      setDraft(next);
    }
  }

  return (
    <section className="supplierLayout">
      <aside className="panel supplierListPane">
        <div className="searchBox">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un fournisseur…" />
        </div>
        {!readOnly && (
          <button
            className="supplierAdd"
            onClick={() => {
              const supplier = newSupplier();
              setSelectedId(supplier.id);
              setDraft(supplier);
            }}
          >
            <Plus size={17} /> Nouveau fournisseur
          </button>
        )}
        <div className="listMeta">{filtered.length} fournisseur(s)</div>
        <div className="supplierList">
          {filtered.map((supplier) => (
            <button
              key={supplier.id}
              className={selectedId === supplier.id ? "supplierCard selected" : "supplierCard"}
              onClick={() => select(supplier)}
            >
              <strong>{supplier.name}</strong>
              <span>{supplier.contact || supplier.city || "Coordonnées à compléter"}</span>
              <small>{supplier.email || supplier.phone}</small>
            </button>
          ))}
          {!filtered.length && <div className="emptyRows">Aucun fournisseur enregistré.</div>}
        </div>
      </aside>

      <section className="panel supplierEditor">
        {draft ? (
          <form onSubmit={submit}>
            <div className="panelTitle">
              <div>
                <span className="eyebrow">Fournisseur</span>
                <h2>{draft.name || "Nouveau fournisseur"}</h2>
              </div>
              <div className="panelActions">
                {!readOnly && suppliers.some((supplier) => supplier.id === draft.id) && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      void onDelete(draft).then((deleted) => {
                        if (deleted) {
                          setDraft(null);
                          setSelectedId("");
                        }
                      })
                    }
                  >
                    <Trash2 size={17} /> Supprimer
                  </button>
                )}
                {!readOnly && (
                  <button type="submit" disabled={saving || !draft.name.trim()}>
                    <Save size={17} /> {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                )}
              </div>
            </div>
            {suppliers.some((supplier) => supplier.id === draft.id) && (
              <div className="supplierRelations">
                <div>
                  <span>Articles liés</span>
                  <strong>{linkedItems.length}</strong>
                </div>
                <div>
                  <span>Dépenses HT</span>
                  <strong>{currency(expenseTotal)}</strong>
                </div>
                <div>
                  <span>Factures / dépenses</span>
                  <strong>{linkedExpenses.length}</strong>
                </div>
              </div>
            )}
            <div className="supplierFormGrid">
              <label className="wide">
                <Building2 size={16} /> Nom du fournisseur
                <input
                  required
                  disabled={readOnly}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label>
                Contact
                <input
                  disabled={readOnly}
                  value={draft.contact}
                  onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
                />
              </label>
              <label>
                <Mail size={16} /> Email
                <input
                  type="email"
                  disabled={readOnly}
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                />
              </label>
              <label>
                <Phone size={16} /> Téléphone
                <input disabled={readOnly} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
              </label>
              <label>
                SIRET
                <input disabled={readOnly} value={draft.siret} onChange={(event) => setDraft({ ...draft, siret: event.target.value })} />
              </label>
              <label>
                N° TVA
                <input
                  disabled={readOnly}
                  value={draft.vatNumber}
                  onChange={(event) => setDraft({ ...draft, vatNumber: event.target.value })}
                />
              </label>
              <label className="wide">
                <MapPin size={16} /> Adresse
                <input
                  disabled={readOnly}
                  value={draft.address}
                  onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                />
              </label>
              <label>
                Code postal
                <input
                  disabled={readOnly}
                  value={draft.postalCode}
                  onChange={(event) => setDraft({ ...draft, postalCode: event.target.value })}
                />
              </label>
              <label>
                Ville
                <input disabled={readOnly} value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} />
              </label>
              <label className="full">
                Notes
                <textarea
                  rows={5}
                  disabled={readOnly}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </label>
            </div>
            {suppliers.some((supplier) => supplier.id === draft.id) && (
              <div className="supplierLinkedData">
                <section>
                  <div className="supplierSectionTitle">
                    <h3>Articles fournisseur</h3>
                    {!readOnly && (
                      <button type="button" className="ghost subtleButton" onClick={() => void onCreateItem(draft)}>
                        <Plus size={16} /> Ajouter
                      </button>
                    )}
                  </div>
                  {linkedItems.length > 0 ? (
                    <div className="supplierItemList">
                      {linkedItems.map((item) => (
                        <SupplierItemEditor
                          key={item.id}
                          item={item}
                          readOnly={readOnly}
                          company={company}
                          onSave={onSaveItem}
                          onDelete={onDeleteItem}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="supplierEmptyItems">
                      <Package size={28} />
                      <div>
                        <strong>Aucun article pour ce fournisseur</strong>
                        <small>Ajoutez les articles achetés ici pour les retrouver dans les commandes fournisseur.</small>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}
            {linkedExpenses.length > 0 && (
              <div className="supplierLinkedData">
                {linkedExpenses.length > 0 && (
                  <section>
                    <h3>Dépenses récentes</h3>
                    <div>
                      {linkedExpenses.slice(0, 6).map((expense) => (
                        <span key={expense.id}>
                          <strong>{expense.reference || expense.description}</strong>
                          <small>
                            {expense.date} · {currency(expense.amountHt)} HT
                          </small>
                        </span>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </form>
        ) : (
          <div className="emptyState">
            <Building2 size={42} />
            <h2>Sélectionnez ou créez un fournisseur</h2>
          </div>
        )}
      </section>
    </section>
  );
}

function SupplierItemEditor({
  item,
  readOnly,
  company,
  onSave,
  onDelete,
}: {
  item: CatalogItem;
  readOnly: boolean;
  company: CompanySettings;
  onSave: (item: CatalogItem) => Promise<void>;
  onDelete: (item: CatalogItem) => Promise<void>;
}) {
  const [draft, setDraft] = useState(item);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(item), [item.id]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(item);
  const patch = (partial: Partial<CatalogItem>) => setDraft((current) => ({ ...current, ...partial }));
  const stockUnit = draft.stockUnit || draft.unit || "u";
  const suggestedPrice = suggestedSalePriceHt(draft.purchasePrice, company.corporateTaxRate);

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  }

  return (
    <article className="supplierItemEditor">
      <label className="wide">
        Article
        <input disabled={readOnly} value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
      </label>
      <label>
        Unité
        <input
          disabled={readOnly}
          value={draft.unit}
          onChange={(event) => patch({ unit: event.target.value, stockUnit: event.target.value || stockUnit })}
        />
      </label>
      <label>
        Prix achat HT
        <input
          type="number"
          min="0"
          step="0.01"
          disabled={readOnly}
          value={draft.purchasePrice || ""}
          onChange={(event) => patch({ purchasePrice: Number(event.target.value) })}
        />
      </label>
      <label>
        TVA
        <input
          type="number"
          min="0"
          step="0.1"
          disabled={readOnly}
          value={draft.vatRate || ""}
          onChange={(event) => patch({ vatRate: Number(event.target.value) })}
        />
      </label>
      <label className="supplierStockToggle">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={draft.trackStock}
          onChange={(event) => patch({ trackStock: event.target.checked, stockUnit })}
        />
        Stock
      </label>
      <label>
        Stock mini
        <input
          type="number"
          min="0"
          step="0.01"
          disabled={readOnly || !draft.trackStock}
          value={draft.stockMinimum || ""}
          onChange={(event) => patch({ stockMinimum: Number(event.target.value) })}
        />
      </label>
      <strong>{currency(draft.purchasePrice)} HT</strong>
      <span className="supplierSuggestedPrice">
        <small>Conseillé</small>
        <strong>{suggestedPrice > 0 ? currency(suggestedPrice) : "-"}</strong>
      </span>
      {!readOnly && (
        <>
          <button type="button" className="iconButton" aria-label="Enregistrer cet article" disabled={!dirty || saving} onClick={() => void save()}>
            <Save size={16} />
          </button>
          <button
            type="button"
            className="iconButton dangerIcon"
            aria-label={`Supprimer ${item.name || "cet article"}`}
            onClick={() => void onDelete(item)}
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </article>
  );
}
