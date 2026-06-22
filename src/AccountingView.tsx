import { CalendarDays, Download, FileSpreadsheet, FileText, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { annualPeriod, buildAccountingReport, currentMonthPeriod, type AccountingPeriod } from "./accounting";
import type { AppData, BusinessExpense, PaymentMethod } from "./types";
import { currency, labels, makeId, paymentMethodLabels, todayIso } from "./utils";

const expenseCategories = [
  "Matériaux",
  "Sous-traitance",
  "Transport",
  "Carburant",
  "Outillage",
  "Loyer",
  "Assurance",
  "Télécom",
  "Honoraires",
  "Impôts et taxes",
  "Autre",
];

function emptyExpense(): BusinessExpense {
  const now = new Date().toISOString();
  return {
    id: makeId("expense"),
    date: todayIso(),
    supplier: "",
    reference: "",
    category: "Matériaux",
    description: "",
    amountHt: 0,
    vatRate: 20,
    paymentMethod: "bank_transfer",
    createdAt: now,
    updatedAt: now,
  };
}

function percent(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0) + " %";
}

function currentYear() {
  return new Date().getFullYear();
}

export function AccountingView({
  data,
  onExportPdf,
  onExportExcel,
  readOnly,
  onCreateExpense,
  onDeleteExpense,
}: {
  data: AppData;
  onExportPdf: (period: AccountingPeriod) => Promise<void>;
  onExportExcel: (period: AccountingPeriod) => Promise<void>;
  readOnly: boolean;
  onCreateExpense: (expense: BusinessExpense) => Promise<boolean>;
  onDeleteExpense: (expense: BusinessExpense) => Promise<void>;
}) {
  const [period, setPeriod] = useState<AccountingPeriod>(() => annualPeriod(currentYear()));
  const [year, setYear] = useState(currentYear());
  const [exporting, setExporting] = useState<"pdf" | "excel" | "">("");
  const [annualExportOpen, setAnnualExportOpen] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState<BusinessExpense>(() => emptyExpense());
  const [savingExpense, setSavingExpense] = useState(false);
  const report = useMemo(() => buildAccountingReport(data, period), [data, period]);
  const years = useMemo(() => {
    const available = data.documents.map((doc) => Number(doc.issueDate.slice(0, 4))).filter((value) => Number.isFinite(value));
    return [...new Set([currentYear(), year, ...available])].sort((a, b) => b - a);
  }, [data.documents, year]);

  function selectYear(nextYear: number) {
    setYear(nextYear);
    setPeriod(annualPeriod(nextYear));
  }

  function openAnnualExport() {
    selectYear(year);
    setAnnualExportOpen(true);
  }

  async function exportReport(type: "pdf" | "excel", exportPeriod = period) {
    setExporting(type);
    try {
      await (type === "pdf" ? onExportPdf(exportPeriod) : onExportExcel(exportPeriod));
      setAnnualExportOpen(false);
    } finally {
      setExporting("");
    }
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || savingExpense || !expenseDraft.date || !expenseDraft.description.trim() || expenseDraft.amountHt <= 0) return;
    setSavingExpense(true);
    const saved = await onCreateExpense({
      ...expenseDraft,
      supplier: data.suppliers.find((supplier) => supplier.id === expenseDraft.supplierId)?.name || expenseDraft.supplier.trim(),
      reference: expenseDraft.reference.trim(),
      description: expenseDraft.description.trim(),
      updatedAt: new Date().toISOString(),
    });
    setSavingExpense(false);
    if (saved) setExpenseDraft(emptyExpense());
  }

  return (
    <section className="accountingPage">
      <div className="accountingToolbar panel">
        <div className="periodFields">
          <label>
            Du
            <input type="date" value={period.startDate} onChange={(event) => setPeriod({ ...period, startDate: event.target.value })} />
          </label>
          <label>
            Au
            <input type="date" value={period.endDate} onChange={(event) => setPeriod({ ...period, endDate: event.target.value })} />
          </label>
          <button className="ghost" onClick={() => setPeriod(currentMonthPeriod())}>
            <CalendarDays size={17} /> Ce mois
          </button>
          <select value={year} onChange={(event) => selectYear(Number(event.target.value))} aria-label="Année comptable">
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button onClick={openAnnualExport}>
            <CalendarDays size={17} /> Compte annuel en 1 clic
          </button>
        </div>
        <div className="accountingExports">
          <button className="ghost" disabled={Boolean(exporting)} onClick={() => void exportReport("pdf")}>
            <FileText size={17} /> {exporting === "pdf" ? "Export…" : "PDF"}
          </button>
          <button disabled={Boolean(exporting)} onClick={() => void exportReport("excel")}>
            <FileSpreadsheet size={17} /> {exporting === "excel" ? "Export…" : "Excel"}
          </button>
        </div>
      </div>

      <div className="accountingKpis">
        <article>
          <span>Chiffre d’affaires HT</span>
          <strong>{currency(report.revenueHt)}</strong>
          <small>{report.documentCount} document(s)</small>
        </article>
        <article>
          <span>Achats directs HT</span>
          <strong>{currency(report.purchasesHt)}</strong>
          <small>Prix d’achat renseignés</small>
        </article>
        <article>
          <span>Charges HT</span>
          <strong>{currency(report.operatingExpensesHt)}</strong>
          <small>{report.expenses.length} dépense(s)</small>
        </article>
        <article>
          <span>Marge moyenne</span>
          <strong>{percent(report.averageMarginRate)}</strong>
          <small>Marge pondérée par le CA</small>
        </article>
        <article>
          <span>Résultat net</span>
          <strong>{currency(report.netProfit)}</strong>
          <small>Marge − charges saisies</small>
        </article>
        <article>
          <span>TVA facturée</span>
          <strong>{currency(report.vatAmount)}</strong>
          <small>Solde TVA {currency(report.vatBalance)}</small>
        </article>
      </div>

      <div className="accountingGrid">
        <section className="panel accountingMonthly">
          <div className="panelTitle">
            <div>
              <span className="eyebrow">Synthèse</span>
              <h2>Évolution mensuelle</h2>
            </div>
          </div>
          <div className="accountingTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Mois</th>
                  <th>CA HT</th>
                  <th>Achats directs</th>
                  <th>Charges</th>
                  <th>Marge</th>
                  <th>Résultat</th>
                  <th>% marge</th>
                </tr>
              </thead>
              <tbody>
                {report.months.length ? (
                  report.months.map((month) => (
                    <tr key={month.key}>
                      <td className="accountingPrimary">{month.label}</td>
                      <td>{currency(month.revenueHt)}</td>
                      <td>{currency(month.purchasesHt)}</td>
                      <td>{currency(month.operatingExpensesHt)}</td>
                      <td className={month.marginAmount < 0 ? "negative" : "positive"}>{currency(month.marginAmount)}</td>
                      <td className={month.netProfit < 0 ? "negative" : "positive"}>{currency(month.netProfit)}</td>
                      <td>{percent(month.marginRate)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="accountingEmpty">
                      Aucune écriture sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel accountingDetails">
          <div className="panelTitle">
            <div>
              <span className="eyebrow">Journal</span>
              <h2>Détail des achats et ventes</h2>
            </div>
            <span className="accountingCount">{report.entries.length} ligne(s)</span>
          </div>
          <div className="accountingTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Document</th>
                  <th>Client / désignation</th>
                  <th>Achat HT</th>
                  <th>Vente HT</th>
                  <th>Marge</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {report.entries.length ? (
                  report.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.date}</td>
                      <td>
                        <strong>{entry.documentNumber}</strong>
                        <small>{labels[entry.documentType]}</small>
                      </td>
                      <td className="accountingPrimary">
                        <strong>{entry.client}</strong>
                        <small>{entry.description}</small>
                      </td>
                      <td>{currency(entry.purchaseHt)}</td>
                      <td>{currency(entry.saleHt)}</td>
                      <td className={entry.marginAmount < 0 ? "negative" : "positive"}>{currency(entry.marginAmount)}</td>
                      <td>{percent(entry.marginRate)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="accountingEmpty">
                      Aucune facture ou avoir sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel expensePanel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">Charges</span>
            <h2>Dépenses enregistrées</h2>
          </div>
          <span className="accountingCount">{report.expenses.length} dépense(s) sur la période</span>
        </div>
        {!readOnly && (
          <form className="expenseForm" onSubmit={submitExpense}>
            <label>
              Date
              <input
                required
                type="date"
                value={expenseDraft.date}
                onChange={(event) => setExpenseDraft({ ...expenseDraft, date: event.target.value })}
              />
            </label>
            <label>
              Fournisseur
              <select
                value={expenseDraft.supplierId || ""}
                onChange={(event) => {
                  const supplier = data.suppliers.find((item) => item.id === event.target.value);
                  setExpenseDraft({ ...expenseDraft, supplierId: supplier?.id, supplier: supplier?.name || "" });
                }}
              >
                <option value="">Non rattaché</option>
                {[...data.suppliers]
                  .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Référence
              <input
                value={expenseDraft.reference}
                onChange={(event) => setExpenseDraft({ ...expenseDraft, reference: event.target.value })}
                placeholder="N° facture"
              />
            </label>
            <label>
              Catégorie
              <select
                value={expenseDraft.category}
                onChange={(event) => setExpenseDraft({ ...expenseDraft, category: event.target.value })}
              >
                {expenseCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="expenseDescription">
              Description
              <input
                required
                value={expenseDraft.description}
                onChange={(event) => setExpenseDraft({ ...expenseDraft, description: event.target.value })}
                placeholder="Objet de la dépense"
              />
            </label>
            <label>
              Montant HT
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={expenseDraft.amountHt || ""}
                onChange={(event) => setExpenseDraft({ ...expenseDraft, amountHt: Number(event.target.value) })}
              />
            </label>
            <label>
              TVA
              <select
                value={expenseDraft.vatRate}
                onChange={(event) => setExpenseDraft({ ...expenseDraft, vatRate: Number(event.target.value) })}
              >
                {[0, 5.5, 10, 20].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate} %
                  </option>
                ))}
              </select>
            </label>
            <label>
              Paiement
              <select
                value={expenseDraft.paymentMethod}
                onChange={(event) => setExpenseDraft({ ...expenseDraft, paymentMethod: event.target.value as PaymentMethod })}
              >
                {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabels[method]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={savingExpense}>
              <Plus size={17} /> {savingExpense ? "Enregistrement…" : "Ajouter la dépense"}
            </button>
          </form>
        )}
        <div className="accountingTableWrap expenseTableWrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fournisseur</th>
                <th>Catégorie / description</th>
                <th>Référence</th>
                <th>HT</th>
                <th>TVA</th>
                <th>TTC</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody>
              {report.expenses.length ? (
                report.expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{expense.date}</td>
                    <td className="accountingPrimary">{expense.supplier || "—"}</td>
                    <td className="accountingPrimary">
                      <strong>{expense.category}</strong>
                      <small>{expense.description}</small>
                    </td>
                    <td>{expense.reference || "—"}</td>
                    <td>{currency(expense.amountHt)}</td>
                    <td>{currency((expense.amountHt * expense.vatRate) / 100)}</td>
                    <td>{currency(expense.amountHt * (1 + expense.vatRate / 100))}</td>
                    {!readOnly && (
                      <td>
                        <button
                          type="button"
                          className="expenseDelete"
                          aria-label={`Supprimer ${expense.description}`}
                          onClick={() => void onDeleteExpense(expense)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={readOnly ? 7 : 8} className="accountingEmpty">
                    Aucune dépense sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="accountingDisclaimer">
        <Download size={15} /> Le résultat net tient compte des achats directs et des dépenses saisies. Toute charge absente de Devix reste
        exclue.
      </p>

      {annualExportOpen && (
        <div className="accountingModalBackdrop" role="presentation" onMouseDown={() => !exporting && setAnnualExportOpen(false)}>
          <section
            className="accountingExportModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="annual-export-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="accountingModalClose"
              aria-label="Fermer"
              disabled={Boolean(exporting)}
              onClick={() => setAnnualExportOpen(false)}
            >
              <X size={18} />
            </button>
            <span className="eyebrow">Compte annuel {year}</span>
            <h2 id="annual-export-title">Choisir le format d’export</h2>
            <p>Le compte complet du 1er janvier au 31 décembre {year} sera généré avec la synthèse et le détail des écritures.</p>
            <div className="accountingModalActions">
              <button className="ghost" disabled={Boolean(exporting)} onClick={() => void exportReport("pdf", annualPeriod(year))}>
                <FileText size={19} /> {exporting === "pdf" ? "Génération…" : "Exporter en PDF"}
              </button>
              <button disabled={Boolean(exporting)} onClick={() => void exportReport("excel", annualPeriod(year))}>
                <FileSpreadsheet size={19} /> {exporting === "excel" ? "Génération…" : "Exporter en Excel"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
