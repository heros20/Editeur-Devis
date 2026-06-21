import type { BusinessDocument, Client, CompanySettings } from "./types";
import { currency, labels, lineTotalHt, paymentSummary, statusLabels, totals } from "./utils";
import { getTheme } from "./themes";

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logoMarkup(company: CompanySettings) {
  if (!company.logoDataUrl) return "";
  return `<span class="companyLogoSlot" style="width:34mm;height:22mm;max-width:34mm;max-height:22mm;display:flex;align-items:flex-start;justify-content:flex-start;overflow:hidden;flex:0 0 auto;"><img class="companyLogo" src="${esc(company.logoDataUrl)}" alt="" style="max-width:34mm;max-height:22mm;width:auto;height:auto;object-fit:contain;display:block;" /></span>`;
}

export function renderDocumentHtml(doc: BusinessDocument, client: Client | undefined, company: CompanySettings) {
  const theme = getTheme(company.themeId);
  const sums = totals(doc.lines);
  const paySummary = paymentSummary(doc, sums.totalTtc);
  const statusMarkup = doc.status === "draft" ? "" : `<span class="badge">${esc(statusLabels[doc.status])}</span>`;
  const termsBlocks = [
    doc.terms || company.paymentTerms ? `<div><h3>Conditions</h3><p>${esc(doc.terms || company.paymentTerms)}</p></div>` : "",
    company.iban || company.bic
      ? `<div><h3>Coordonnées bancaires</h3><p>${company.iban ? `IBAN: ${esc(company.iban)}` : ""}${company.iban && company.bic ? "\n" : ""}${company.bic ? `BIC: ${esc(company.bic)}` : ""}</p></div>`
      : "",
  ].filter(Boolean);
  const termsMarkup = termsBlocks.length
    ? `<section class="terms${termsBlocks.length === 1 ? " single" : ""}">${termsBlocks.join("")}</section>`
    : "";
  const paymentRows =
    doc.type === "invoice"
      ? `
        <div><span>Acompte encaissé</span><strong>${currency(paySummary.depositPaidAmount)}</strong></div>
        <div><span>Total réglé</span><strong>${currency(paySummary.paidAmount)}</strong></div>
        <div><span>Reste dû</span><strong>${currency(paySummary.remainingAmount)}</strong></div>
      `
      : "";
  const vatRows = Object.entries(sums.vatGroups)
    .map(([rate, amount]) => `<div><span>TVA ${esc(rate)}%</span><strong>${currency(amount)}</strong></div>`)
    .join("");
  const lines = doc.lines
    .map(
      (line) => `
      <tr>
        <td><strong>${esc(line.description)}</strong><small>${esc(line.details)}</small></td>
        <td>${esc(line.unit)}</td>
        <td class="num">${esc(line.quantity)}</td>
        <td class="num">${currency(line.unitPrice)}</td>
        <td class="num">${esc(line.discount)}%</td>
        <td class="num">${esc(line.vatRate)}%</td>
        <td class="num">${currency(lineTotalHt(line))}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
  <html lang="fr">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: ${theme.colors.text}; background: #fff; }
      .page { width: 210mm; min-height: 297mm; padding: 18mm; }
      header { display: flex; justify-content: space-between; gap: 28px; border-bottom: 3px solid ${theme.colors.accent}; padding-bottom: 16px; }
      .brand { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: start; }
      .brandText { min-width: 0; }
      .companyLogoSlot { width: 34mm; height: 22mm; max-width: 34mm; max-height: 22mm; overflow: hidden; }
      .companyLogo { max-width: 34mm !important; max-height: 22mm !important; width: auto !important; height: auto !important; object-fit: contain; display: block; }
      .brand h1 { margin: 0; font-size: 30px; letter-spacing: 0; color: ${theme.colors.primaryDark}; }
      .brand p, .meta p, .box p { margin: 3px 0; color: ${theme.colors.muted}; font-size: 12px; }
      .meta { text-align: right; }
      .meta h2 { margin: 0 0 8px; font-size: 28px; color: ${theme.colors.primaryDark}; }
      .badge { display: inline-block; padding: 5px 9px; border: 1px solid ${theme.colors.accent}; border-radius: 4px; font-size: 11px; text-transform: uppercase; color: ${theme.colors.accent}; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 22px 0; }
      .box { border: 1px solid ${theme.colors.border}; padding: 12px; border-radius: 4px; min-height: 104px; }
      .box h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: ${theme.colors.accent}; }
      .project { margin: 18px 0; padding: 12px; background: ${theme.colors.soft}; border-left: 4px solid ${theme.colors.accent}; }
      .project h3 { margin: 0 0 5px; font-size: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; }
      th { background: ${theme.colors.primaryDark}; color: white; text-align: left; padding: 9px 7px; font-size: 11px; }
      td { border-bottom: 1px solid ${theme.colors.border}; padding: 9px 7px; vertical-align: top; font-size: 12px; }
      td small { display: block; color: ${theme.colors.muted}; margin-top: 4px; line-height: 1.35; }
      .num { text-align: right; white-space: nowrap; }
      .totals { margin-left: auto; margin-top: 18px; width: 82mm; border: 1px solid ${theme.colors.border}; border-radius: 4px; overflow: hidden; }
      .totals div { display: flex; justify-content: space-between; padding: 8px 11px; border-bottom: 1px solid ${theme.colors.border}; font-size: 12px; }
      .totals .grand { background: ${theme.colors.accent}; color: white; font-size: 17px; border-bottom: 0; }
      .terms { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .terms.single { grid-template-columns: 1fr; }
      .terms h3 { margin: 0 0 7px; font-size: 12px; text-transform: uppercase; color: ${theme.colors.accent}; }
      .terms p { margin: 0; white-space: pre-wrap; font-size: 11px; line-height: 1.45; color: ${theme.colors.muted}; }
      footer { margin-top: 20px; border-top: 1px solid ${theme.colors.border}; padding-top: 10px; color: ${theme.colors.muted}; font-size: 10px; }
    </style>
  </head>
  <body>
    <main class="page">
      <header>
        <div class="brand">
          ${logoMarkup(company)}
          <div class="brandText">
            <h1>${esc(company.name)}</h1>
            <p>${esc(company.address)} - ${esc(company.postalCode)} ${esc(company.city)}</p>
            <p>${esc(company.phone)} - ${esc(company.email)}</p>
            ${company.siret ? `<p>SIRET ${esc(company.siret)}</p>` : ""}
            ${company.vatNumber ? `<p>TVA ${esc(company.vatNumber)}</p>` : ""}
          </div>
        </div>
        <div class="meta">
          <h2>${esc(labels[doc.type])}</h2>
          <p><strong>${esc(doc.number)}</strong></p>
          <p>Date: ${esc(doc.issueDate)}</p>
          <p>Échéance: ${esc(doc.dueDate)}</p>
          ${statusMarkup}
        </div>
      </header>
      <section class="grid">
        <div class="box">
          <h3>Client</h3>
          <p><strong>${esc(client?.name)}</strong></p>
          <p>${esc(client?.address)}</p>
          <p>${esc(client?.postalCode)} ${esc(client?.city)}</p>
          <p>${esc(client?.email)} ${client?.phone ? `- ${esc(client.phone)}` : ""}</p>
        </div>
        <div class="box">
          <h3>Chantier</h3>
          <p>${esc(doc.siteAddress || client?.address)}</p>
          <p>Démarrage: ${esc(doc.workStart || "à définir")}</p>
          <p>Durée estimée: ${esc(doc.workDuration || "à définir")}</p>
          <p>Acompte: ${esc(doc.depositRate)}%</p>
        </div>
      </section>
      <section class="project">
        <h3>${esc(doc.projectName || "Projet")}</h3>
        <p>${esc(doc.notes)}</p>
      </section>
      <table>
        <thead><tr><th>Désignation</th><th>Unité</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">Remise</th><th class="num">TVA</th><th class="num">Total HT</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <section class="totals">
        <div><span>Total HT</span><strong>${currency(sums.totalHt)}</strong></div>
        ${vatRows}
        <div class="grand"><span>Total TTC</span><strong>${currency(sums.totalTtc)}</strong></div>
        ${paymentRows}
      </section>
      ${termsMarkup}
      <footer>${esc(company.legalName)} - Document généré par Devix</footer>
    </main>
  </body>
  </html>`;
}

export function renderCompanyHtml(company: CompanySettings) {
  const theme = getTheme(company.themeId);
  const companyName = company.name || company.legalName || "Informations société";
  const address = [company.address, `${company.postalCode} ${company.city}`.trim()].filter(Boolean).join("\n");
  const hasValue = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";
  const detail = (label: string, value: unknown) =>
    hasValue(value)
      ? `<div class="detail">
          <span>${esc(label)}</span>
          <strong>${esc(value)}</strong>
        </div>`
      : "";
  const informationSections = [
    {
      title: "Identité légale",
      fields: [
        ["Nom commercial", company.name],
        ["Raison sociale", company.legalName],
        ["SIRET", company.siret],
        ["N° TVA", company.vatNumber],
      ],
    },
    {
      title: "Coordonnées",
      fields: [
        ["Adresse", address],
        ["Téléphone", company.phone],
        ["Email", company.email],
        ["Site web", company.website],
      ],
    },
    {
      title: "Coordonnées bancaires",
      fields: [
        ["IBAN", company.iban],
        ["BIC", company.bic],
      ],
    },
  ].filter((section) => section.fields.some(([, value]) => hasValue(value)));
  const informationMarkup = informationSections.length
    ? `<div class="sections${informationSections.length === 1 ? " single" : ""}">
        ${informationSections
          .map(
            (section) => `<section class="card">
              <h3>${esc(section.title)}</h3>
              ${section.fields.map(([label, value]) => detail(label, value)).join("")}
            </section>`
          )
          .join("")}
      </div>`
    : "";
  const optionalTextBlocks = [
    ["Conditions de paiement", company.paymentTerms],
    ["Note par défaut", company.notes],
  ].filter(([, value]) => value.trim());
  const optionalTextMarkup = optionalTextBlocks.length
    ? `<div class="textBlocks${optionalTextBlocks.length === 1 ? " single" : ""}">
        ${optionalTextBlocks
          .map(
            ([title, value]) => `<section class="textBlock">
              <h3>${esc(title)}</h3>
              <p>${esc(value)}</p>
            </section>`
          )
          .join("")}
      </div>`
    : "";
  return `<!doctype html>
  <html lang="fr">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: ${theme.colors.text}; background: #fff; }
      .page { width: 210mm; min-height: 297mm; padding: 16mm 18mm; display: flex; flex-direction: column; }
      header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 15px; border-bottom: 3px solid ${theme.colors.accent}; }
      .brand { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
      .brandText { min-width: 0; }
      .companyLogoSlot { width: 34mm; height: 22mm; max-width: 34mm; max-height: 22mm; overflow: hidden; }
      .companyLogo { max-width: 34mm !important; max-height: 22mm !important; width: auto !important; height: auto !important; object-fit: contain; display: block; }
      h1 { margin: 0; color: ${theme.colors.primaryDark}; font-size: 28px; line-height: 1.08; overflow-wrap: anywhere; }
      .legalName { margin: 5px 0 0; color: ${theme.colors.muted}; font-size: 12px; }
      .documentTitle { flex: 0 0 auto; text-align: right; }
      .documentTitle strong { display: block; color: ${theme.colors.primaryDark}; font-size: 24px; line-height: 1.1; }
      .documentTitle span { display: inline-block; margin-top: 8px; padding: 5px 9px; border: 1px solid ${theme.colors.accent}; border-radius: 4px; color: ${theme.colors.accent}; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .hero { display: grid; grid-template-columns: 1.35fr .65fr; gap: 14px; margin: 18px 0; }
      .heroCard { padding: 14px; border-radius: 6px; background: ${theme.colors.soft}; border-left: 4px solid ${theme.colors.accent}; }
      .heroCard h2 { margin: 0 0 7px; color: ${theme.colors.text}; font-size: 18px; }
      .heroCard p { margin: 3px 0; color: ${theme.colors.muted}; font-size: 12px; line-height: 1.45; white-space: pre-wrap; }
      .heroStats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .stat { padding: 10px; border: 1px solid ${theme.colors.border}; border-radius: 6px; background: #fff; }
      .stat span { display: block; color: ${theme.colors.muted}; font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
      .stat strong { display: block; margin-top: 5px; color: ${theme.colors.primaryDark}; font-size: 17px; }
      .sections { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .sections.single { grid-template-columns: 1fr; }
      .card { break-inside: avoid; padding: 13px; border: 1px solid ${theme.colors.border}; border-radius: 6px; }
      .card h3 { margin: 0 0 9px; padding-bottom: 7px; border-bottom: 1px solid ${theme.colors.border}; color: ${theme.colors.accent}; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
      .detail { display: grid; grid-template-columns: 35mm minmax(0, 1fr); gap: 8px; padding: 6px 0; border-bottom: 1px solid ${theme.colors.border}; font-size: 11px; }
      .detail:last-child { border-bottom: 0; }
      .detail span { color: ${theme.colors.muted}; }
      .detail strong { color: ${theme.colors.text}; overflow-wrap: anywhere; white-space: pre-wrap; }
      .wide { grid-column: 1 / -1; }
      .textBlocks { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
      .textBlocks.single { grid-template-columns: 1fr; }
      .textBlock { break-inside: avoid; min-height: 30mm; padding: 13px; border-radius: 6px; background: ${theme.colors.soft}; border: 1px solid ${theme.colors.border}; }
      .textBlock h3 { margin: 0 0 8px; color: ${theme.colors.primary}; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
      .textBlock p { margin: 0; color: ${theme.colors.muted}; font-size: 11px; line-height: 1.5; white-space: pre-wrap; }
      footer { margin-top: auto; padding-top: 12px; border-top: 1px solid ${theme.colors.border}; display: flex; justify-content: space-between; color: ${theme.colors.muted}; font-size: 9px; }
    </style>
  </head>
  <body>
    <main class="page">
      <header>
        <div class="brand">
          ${logoMarkup(company)}
          <div class="brandText">
            <h1>${esc(companyName)}</h1>
            ${company.legalName ? `<p class="legalName">${esc(company.legalName)}</p>` : ""}
          </div>
        </div>
        <div class="documentTitle">
          <strong>Fiche société</strong>
          <span>Informations entreprise</span>
        </div>
      </header>
      <section class="hero">
        <div class="heroCard">
          <h2>${esc(companyName)}</h2>
          ${address ? `<p>${esc(address)}</p>` : ""}
          ${company.phone || company.email ? `<p>${esc([company.phone, company.email].filter(Boolean).join(" · "))}</p>` : ""}
        </div>
        <div class="heroStats">
          <div class="stat"><span>TVA par défaut</span><strong>${esc(company.defaultVatRate)} %</strong></div>
          <div class="stat"><span>Acompte</span><strong>${esc(company.defaultDepositRate)} %</strong></div>
          <div class="stat wide"><span>Validité des devis</span><strong>${esc(company.quoteValidityDays)} jours</strong></div>
        </div>
      </section>
      ${informationMarkup}
      ${optionalTextMarkup}
      <footer><span>${esc(company.legalName || companyName)}</span><span>Fiche société générée par Devix</span></footer>
    </main>
  </body>
  </html>`;
}
