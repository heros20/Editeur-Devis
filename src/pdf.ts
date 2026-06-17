import type { BusinessDocument, Client, CompanySettings } from "./types";
import { currency, labels, lineTotalHt, statusLabels, totals } from "./utils";

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderDocumentHtml(doc: BusinessDocument, client: Client | undefined, company: CompanySettings) {
  const sums = totals(doc.lines);
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
      body { margin: 0; font-family: Arial, sans-serif; color: #241b16; background: #fff; }
      .page { width: 210mm; min-height: 297mm; padding: 18mm; }
      header { display: flex; justify-content: space-between; gap: 28px; border-bottom: 3px solid #7b4b28; padding-bottom: 16px; }
      .brand h1 { margin: 0; font-size: 30px; letter-spacing: 0; color: #4f2f1c; }
      .brand p, .meta p, .box p { margin: 3px 0; color: #5d5149; font-size: 12px; }
      .meta { text-align: right; }
      .meta h2 { margin: 0 0 8px; font-size: 28px; color: #1f2d2b; }
      .badge { display: inline-block; padding: 5px 9px; border: 1px solid #b9946c; border-radius: 4px; font-size: 11px; text-transform: uppercase; color: #6b4328; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 22px 0; }
      .box { border: 1px solid #ded5cb; padding: 12px; border-radius: 4px; min-height: 104px; }
      .box h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #7b4b28; }
      .project { margin: 18px 0; padding: 12px; background: #f7f1ea; border-left: 4px solid #7b4b28; }
      .project h3 { margin: 0 0 5px; font-size: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; }
      th { background: #1f2d2b; color: white; text-align: left; padding: 9px 7px; font-size: 11px; }
      td { border-bottom: 1px solid #e7dfd5; padding: 9px 7px; vertical-align: top; font-size: 12px; }
      td small { display: block; color: #6f6259; margin-top: 4px; line-height: 1.35; }
      .num { text-align: right; white-space: nowrap; }
      .totals { margin-left: auto; margin-top: 18px; width: 82mm; border: 1px solid #ded5cb; border-radius: 4px; overflow: hidden; }
      .totals div { display: flex; justify-content: space-between; padding: 8px 11px; border-bottom: 1px solid #eee6dc; font-size: 12px; }
      .totals .grand { background: #7b4b28; color: white; font-size: 17px; border-bottom: 0; }
      .terms { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .terms h3 { margin: 0 0 7px; font-size: 12px; text-transform: uppercase; color: #7b4b28; }
      .terms p { margin: 0; white-space: pre-wrap; font-size: 11px; line-height: 1.45; color: #4e453e; }
      footer { margin-top: 20px; border-top: 1px solid #ded5cb; padding-top: 10px; color: #766b63; font-size: 10px; }
    </style>
  </head>
  <body>
    <main class="page">
      <header>
        <div class="brand">
          <h1>${esc(company.name)}</h1>
          <p>${esc(company.address)} - ${esc(company.postalCode)} ${esc(company.city)}</p>
          <p>${esc(company.phone)} - ${esc(company.email)}</p>
          <p>SIRET ${esc(company.siret || "à renseigner")} ${company.vatNumber ? `- TVA ${esc(company.vatNumber)}` : ""}</p>
        </div>
        <div class="meta">
          <h2>${esc(labels[doc.type])}</h2>
          <p><strong>${esc(doc.number)}</strong></p>
          <p>Date: ${esc(doc.issueDate)}</p>
          <p>Échéance: ${esc(doc.dueDate)}</p>
          <span class="badge">${esc(statusLabels[doc.status])}</span>
        </div>
      </header>
      <section class="grid">
        <div class="box">
          <h3>Client</h3>
          <p><strong>${esc(client?.name)}</strong></p>
          <p>${esc(client?.contact)}</p>
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
        <h3>${esc(doc.projectName || "Projet de menuiserie")}</h3>
        <p>${esc(doc.notes)}</p>
      </section>
      <table>
        <thead><tr><th>Désignation</th><th>Unité</th><th class="num">Qté</th><th class="num">PU HT</th><th class="num">Rem.</th><th class="num">TVA</th><th class="num">Total HT</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <section class="totals">
        <div><span>Total HT</span><strong>${currency(sums.totalHt)}</strong></div>
        ${vatRows}
        <div class="grand"><span>Total TTC</span><strong>${currency(sums.totalTtc)}</strong></div>
      </section>
      <section class="terms">
        <div><h3>Conditions</h3><p>${esc(doc.terms || company.paymentTerms)}</p></div>
        <div><h3>Coordonnées bancaires</h3><p>IBAN: ${esc(company.iban || "à renseigner")}\nBIC: ${esc(company.bic || "à renseigner")}</p></div>
      </section>
      <footer>${esc(company.legalName)} - Document généré par L'Atelier du Bois</footer>
    </main>
  </body>
  </html>`;
}

export function renderCompanyHtml(company: CompanySettings) {
  const rows = [
    ["Nom commercial", company.name],
    ["Raison sociale", company.legalName],
    ["SIRET", company.siret],
    ["N TVA", company.vatNumber],
    ["Adresse", `${company.address}\n${company.postalCode} ${company.city}`.trim()],
    ["Téléphone", company.phone],
    ["Email", company.email],
    ["Site web", company.website],
    ["IBAN", company.iban],
    ["BIC", company.bic],
    ["Validité devis", `${company.quoteValidityDays} jours`],
    ["TVA par défaut", `${company.defaultVatRate}%`],
    ["Acompte par défaut", `${company.defaultDepositRate}%`],
    ["Conditions de paiement", company.paymentTerms],
    ["Note par défaut", company.notes],
  ];

  return `<!doctype html>
  <html lang="fr">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: #241b16; background: #fff; }
      .page { width: 210mm; min-height: 297mm; padding: 18mm; }
      header { border-bottom: 3px solid #1f5f52; padding-bottom: 14px; margin-bottom: 18px; }
      h1 { margin: 0; font-size: 30px; color: #1f5f52; }
      p { margin: 5px 0 0; color: #5d5149; }
      table { width: 100%; border-collapse: collapse; }
      th { width: 42mm; text-align: left; color: #7b4b28; font-size: 12px; text-transform: uppercase; }
      td, th { border-bottom: 1px solid #e5ddd4; padding: 10px 8px; vertical-align: top; white-space: pre-wrap; }
      footer { margin-top: 22px; color: #766b63; font-size: 10px; }
    </style>
  </head>
  <body>
    <main class="page">
      <header>
        <h1>${esc(company.name || company.legalName || "Informations société")}</h1>
        <p>${esc(company.legalName)}</p>
      </header>
      <table>
        <tbody>
          ${rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value || "à renseigner")}</td></tr>`).join("")}
        </tbody>
      </table>
      <footer>Fiche société générée par L'Atelier du Bois</footer>
    </main>
  </body>
  </html>`;
}
