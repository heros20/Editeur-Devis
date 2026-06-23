import { strToU8, zipSync } from "fflate";
import type { AccountingReport } from "./accounting";
import type { CompanySettings } from "./types";
import { currency, labels, paymentMethodLabels } from "./utils";

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function percent(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0) + " %";
}

function expenseSourceLabel(source: string) {
  return source === "purchaseInvoice" ? "Facture fournisseur" : "Dépense";
}

export function renderAccountingHtml(report: AccountingReport, company: CompanySettings) {
  const monthlyRows = report.months
    .map(
      (month) =>
        `<tr><td>${esc(month.label)}</td><td class="num">${currency(month.revenueHt)}</td><td class="num">${currency(month.purchasesHt)}</td><td class="num">${currency(month.operatingExpensesHt)}</td><td class="num">${currency(month.marginAmount)}</td><td class="num">${currency(month.netProfit)}</td><td class="num">${currency(month.estimatedCorporateTax)}</td><td class="num">${currency(month.netProfitAfterTax)}</td><td class="num">${percent(month.marginRate)}</td><td class="num">${currency(month.vatAmount)}</td><td class="num">${currency(month.totalTtc)}</td></tr>`
    )
    .join("");
  const detailRows = report.entries
    .map(
      (entry) =>
        `<tr><td>${esc(entry.date)}</td><td>${esc(entry.documentNumber)}</td><td>${esc(labels[entry.documentType])}</td><td>${esc(entry.client)}</td><td>${esc(entry.description)}</td><td class="num">${esc(entry.quantity)}</td><td>${esc(entry.unit)}</td><td class="num">${currency(entry.purchaseHt)}</td><td class="num">${currency(entry.saleHt)}</td><td class="num">${currency(entry.marginAmount)}</td><td class="num">${percent(entry.marginRate)}</td><td class="num">${currency(entry.vatAmount)}</td><td class="num">${currency(entry.totalTtc)}</td></tr>`
    )
    .join("");
  const expenseRows = report.expenseEntries
    .map(
      (expense) =>
        `<tr><td>${esc(expense.date)}</td><td>${esc(expenseSourceLabel(expense.source))}</td><td>${esc(expense.supplier)}</td><td>${esc(expense.reference)}</td><td>${esc(expense.category)}</td><td>${esc(expense.description)}</td><td class="num">${esc(expense.source === "purchaseInvoice" ? expense.quantity : "")}</td><td>${esc(expense.unit)}</td><td class="num">${currency(expense.amountHt)}</td><td class="num">${percent(expense.vatRate)}</td><td class="num">${currency(expense.vatAmount)}</td><td class="num">${currency(expense.totalTtc)}</td></tr>`
    )
    .join("");
  const profitBeforeVatAndTax = report.netProfit;
  const includeVatInNetEstimate = company.includeVatInNetEstimate !== false;
  const vatImpact = includeVatInNetEstimate ? report.vatBalance : 0;
  const profitBeforeTax = Math.round((profitBeforeVatAndTax - vatImpact + Number.EPSILON) * 100) / 100;
  const finalNetProfit = Math.round((profitBeforeTax - report.estimatedCorporateTax + Number.EPSILON) * 100) / 100;
  const vatBalanceLabel = report.vatBalance >= 0 ? "TVA à payer" : "Crédit TVA";
  const beforeTaxLabel = includeVatInNetEstimate ? "Résultat après TVA, avant impôts" : "Résultat avant impôts (TVA non déduite)";
  const finalNetLabel = includeVatInNetEstimate ? "Net final estimé après TVA et impôts" : "Net final estimé après impôts";
  const vatModeNote = includeVatInNetEstimate
    ? "Le net final estimé déduit le solde TVA pour donner une lecture de trésorerie."
    : "Le net final estimé ne déduit pas le solde TVA, qui reste suivi séparément.";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#26332f;margin:0;font-size:10px}header{display:flex;justify-content:space-between;border-bottom:3px solid #1f5f52;padding-bottom:10px;margin-bottom:14px}h1{font-size:22px;margin:0;color:#17483f}h2{font-size:14px;color:#17483f;margin:18px 0 7px}.meta{text-align:right;color:#65746f}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kpi{border:1px solid #d8dfdc;border-radius:5px;padding:9px;background:#f5f8f6}.kpi span{display:block;color:#65746f;text-transform:uppercase;font-size:8px;font-weight:700}.kpi strong{display:block;font-size:15px;margin-top:5px;color:#17483f}.resultTable{margin-top:8px}.resultTable th{background:#f5f8f6;color:#17483f;border:1px solid #d8dfdc}.resultTable td{border:1px solid #d8dfdc}.resultFinal{font-size:13px;font-weight:700;color:#17483f}table{width:100%;border-collapse:collapse}th{background:#17483f;color:#fff;text-align:left;padding:6px}td{padding:5px 6px;border-bottom:1px solid #e2e7e4}.num{text-align:right;white-space:nowrap}.detail{page-break-before:always}.note{margin-top:10px;color:#65746f;font-size:9px}</style></head><body>
  <header><div><h1>Livre de comptes</h1><strong>${esc(company.name || company.legalName)}</strong></div><div class="meta">Période du ${esc(report.period.startDate)} au ${esc(report.period.endDate)}<br>${report.documentCount} document(s)</div></header>
  <section class="kpis"><div class="kpi"><span>Chiffre d’affaires HT</span><strong>${currency(report.revenueHt)}</strong></div><div class="kpi"><span>Achats directs HT</span><strong>${currency(report.purchasesHt)}</strong></div><div class="kpi"><span>Charges HT</span><strong>${currency(report.operatingExpensesHt)}</strong></div><div class="kpi"><span>Résultat avant IS</span><strong>${currency(report.netProfit)}</strong></div><div class="kpi"><span>IS estimé</span><strong>${currency(report.estimatedCorporateTax)}</strong></div><div class="kpi"><span>Résultat après IS</span><strong>${currency(report.netProfitAfterTax)}</strong></div></section>
  <h2>Résultat final estimé</h2><table class="resultTable"><tbody><tr><th>Résultat avant TVA et impôts</th><td class="num">${currency(profitBeforeVatAndTax)}</td></tr><tr><th>${includeVatInNetEstimate ? vatBalanceLabel : `${vatBalanceLabel} (suivi séparé)`}</th><td class="num">${currency(report.vatBalance)}</td></tr><tr><th>${beforeTaxLabel}</th><td class="num">${currency(profitBeforeTax)}</td></tr><tr><th>Impôt société estimé</th><td class="num">${currency(report.estimatedCorporateTax)}</td></tr><tr><th>${finalNetLabel}</th><td class="num resultFinal">${currency(finalNetProfit)}</td></tr></tbody></table>
  <h2>Synthèse TVA</h2><section class="kpis"><div class="kpi"><span>TVA collectée</span><strong>${currency(report.vatAmount)}</strong></div><div class="kpi"><span>TVA déductible</span><strong>${currency(report.deductibleVat)}</strong></div><div class="kpi"><span>Solde TVA</span><strong>${currency(report.vatBalance)}</strong></div></section>
  <h2>Synthèse mensuelle</h2><table><thead><tr><th>Mois</th><th class="num">CA HT</th><th class="num">Achats directs</th><th class="num">Charges</th><th class="num">Marge</th><th class="num">Avant IS</th><th class="num">IS estimé</th><th class="num">Après IS</th><th class="num">Taux de marge</th><th class="num">TVA collectée</th><th class="num">TTC</th></tr></thead><tbody>${monthlyRows || '<tr><td colspan="11">Aucune écriture sur la période.</td></tr>'}</tbody></table>
  <section class="detail"><h2>Détail des ventes facturées</h2><table><thead><tr><th>Date</th><th>Document</th><th>Type</th><th>Client</th><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">Achat HT</th><th class="num">Vente HT</th><th class="num">Marge</th><th class="num">%</th><th class="num">TVA collectée</th><th class="num">TTC</th></tr></thead><tbody>${detailRows || '<tr><td colspan="13">Aucune écriture sur la période.</td></tr>'}</tbody></table></section>
  <section class="detail"><h2>Dépenses, charges et factures fournisseur</h2><table><thead><tr><th>Date</th><th>Source</th><th>Fournisseur</th><th>Référence</th><th>Catégorie</th><th>Description</th><th class="num">Qté</th><th>Unité</th><th class="num">HT</th><th class="num">Taux TVA</th><th class="num">TVA déductible</th><th class="num">TTC</th></tr></thead><tbody>${expenseRows || '<tr><td colspan="12">Aucune dépense sur la période.</td></tr>'}</tbody></table></section>
  <p class="note">Résultat estimatif à valider avec votre comptable. Les impôts, cotisations, amortissements et charges non saisies peuvent modifier le résultat réel. ${vatModeNote} Le solde TVA correspond à la TVA collectée sur les ventes moins la TVA déductible des dépenses et factures fournisseur enregistrées. Le résultat avant IS correspond à la marge sur ventes diminuée des dépenses enregistrées.</p></body></html>`;
}

type Cell = string | number;

function columnName(index: number) {
  let result = "";
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

function worksheetXml(rows: Cell[][], widths: number[]) {
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const body = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => {
            const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
            const style = rowIndex === 0 ? 1 : typeof value === "number" ? 2 : 0;
            return typeof value === "number"
              ? `<c r="${ref}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`
              : `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
          })
          .join("")}</row>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${columnName((rows[0]?.length || 1) - 1)}${Math.max(1, rows.length)}"/></worksheet>`;
}

export function buildAccountingXlsx(report: AccountingReport, company: CompanySettings) {
  const includeVatInNetEstimate = company.includeVatInNetEstimate !== false;
  const vatImpact = includeVatInNetEstimate ? report.vatBalance : 0;
  const profitBeforeTax = Math.round((report.netProfit - vatImpact + Number.EPSILON) * 100) / 100;
  const finalNetProfit = Math.round((profitBeforeTax - report.estimatedCorporateTax + Number.EPSILON) * 100) / 100;
  const summary: Cell[][] = [
    ["Indicateur", "Valeur"],
    ["Entreprise", company.name || company.legalName],
    ["Début de période", report.period.startDate],
    ["Fin de période", report.period.endDate],
    ["Documents", report.documentCount],
    ["Chiffre d’affaires HT", report.revenueHt],
    ["Achats directs HT", report.purchasesHt],
    ["Charges HT", report.operatingExpensesHt],
    ["Marge", report.marginAmount],
    ["Marge moyenne (%)", report.averageMarginRate],
    ["Résultat avant IS", report.netProfit],
    ["Bénéfice imposable", report.taxableProfit],
    ["IS estimé", report.estimatedCorporateTax],
    ["Résultat après IS", report.netProfitAfterTax],
    ["Part IS / CA HT (%)", report.taxShareOfRevenue],
    ["TVA collectée", report.vatAmount],
    ["TVA déductible", report.deductibleVat],
    ["Solde TVA", report.vatBalance],
    ["TVA déduite du net final", includeVatInNetEstimate ? "Oui" : "Non"],
    ["Résultat avant TVA et impôts", report.netProfit],
    [includeVatInNetEstimate ? "Résultat après TVA, avant impôts" : "Résultat avant impôts, TVA non déduite", profitBeforeTax],
    [includeVatInNetEstimate ? "Net final estimé après TVA et impôts" : "Net final estimé après impôts", finalNetProfit],
    ["Total TTC", report.totalTtc],
    [],
    ["Mois", "CA HT", "Achats directs HT", "Charges HT", "Marge", "Résultat avant IS", "IS estimé", "Résultat après IS", "Marge (%)", "TVA", "TTC"],
    ...report.months.map((month) => [
      month.label,
      month.revenueHt,
      month.purchasesHt,
      month.operatingExpensesHt,
      month.marginAmount,
      month.netProfit,
      month.estimatedCorporateTax,
      month.netProfitAfterTax,
      month.marginRate,
      month.vatAmount,
      month.totalTtc,
    ]),
  ];
  const details: Cell[][] = [
    [
      "Date",
      "Document",
      "Type",
      "Client",
      "Projet",
      "Désignation",
      "Quantité",
      "Unité",
      "Achat HT",
      "Vente HT",
      "Marge",
      "Marge (%)",
      "TVA",
      "TTC",
    ],
    ...report.entries.map((entry) => [
      entry.date,
      entry.documentNumber,
      labels[entry.documentType],
      entry.client,
      entry.project,
      entry.description,
      entry.quantity,
      entry.unit,
      entry.purchaseHt,
      entry.saleHt,
      entry.marginAmount,
      entry.marginRate,
      entry.vatAmount,
      entry.totalTtc,
    ]),
  ];
  const expenses: Cell[][] = [
    [
      "Date",
      "Source",
      "Fournisseur",
      "Référence",
      "Catégorie",
      "Description",
      "Quantité",
      "Unité",
      "Prix unitaire HT",
      "Montant HT",
      "TVA (%)",
      "TVA",
      "Montant TTC",
      "Paiement",
    ],
    ...report.expenseEntries.map((expense) => [
      expense.date,
      expenseSourceLabel(expense.source),
      expense.supplier,
      expense.reference,
      expense.category,
      expense.description,
      expense.source === "purchaseInvoice" ? expense.quantity : "",
      expense.unit,
      expense.source === "purchaseInvoice" ? expense.unitPrice : "",
      expense.amountHt,
      expense.vatRate,
      expense.vatAmount,
      expense.totalTtc,
      paymentMethodLabels[expense.paymentMethod],
    ]),
  ];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthèse" sheetId="1" r:id="rId1"/><sheet name="Détail ventes" sheetId="2" r:id="rId2"/><sheet name="Dépenses" sheetId="3" r:id="rId3"/></sheets></workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17483F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`
    ),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(summary, [30, 20, 18, 18, 18, 18, 16, 18, 15, 18, 18])),
    "xl/worksheets/sheet2.xml": strToU8(worksheetXml(details, [12, 18, 19, 24, 24, 34, 12, 10, 15, 15, 15, 14, 15, 15])),
    "xl/worksheets/sheet3.xml": strToU8(worksheetXml(expenses, [12, 20, 24, 18, 20, 34, 12, 10, 16, 15, 12, 15, 15, 16])),
  };
  return zipSync(files, { level: 6 });
}
