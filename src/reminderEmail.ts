import type { BusinessDocument, Client, CompanySettings } from "./types";
import { currency, labels, paymentSummary, totals } from "./utils";

function displayDate(value: string) {
  if (!value) return "non renseignée";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function valueOrMissing(value: string) {
  return value.trim() || "à renseigner";
}

export function buildPaymentReminderEmail(doc: BusinessDocument, client: Client | undefined, company: CompanySettings, note = "") {
  const sums = totals(doc.lines);
  const summary = paymentSummary(doc, sums.totalTtc);
  const clientName = client?.name?.trim() || "Madame, Monsieur";
  const projectLine = doc.projectName ? `- Projet / chantier : ${doc.projectName}` : "";
  const depositDateLine = doc.depositPaidAt ? `- Date acompte : ${displayDate(doc.depositPaidAt)}` : "";
  const noteLine = note.trim() ? `\nMessage complémentaire :\n${note.trim()}\n` : "";

  const subject = `Relance facture ${doc.number} - reste dû ${currency(summary.remainingAmount)}`;
  const body = [
    `Bonjour ${clientName},`,
    "",
    `Sauf erreur de notre part, le règlement de la facture ${doc.number} reste partiellement en attente.`,
    "Vous trouverez en pièce jointe le PDF actualisé de la facture, avec les acomptes et règlements déjà pris en compte.",
    "",
    "Récapitulatif :",
    `- Document : ${labels[doc.type]} ${doc.number}`,
    projectLine,
    `- Date de facture : ${displayDate(doc.issueDate)}`,
    `- Échéance : ${displayDate(doc.dueDate)}`,
    `- Total TTC : ${currency(sums.totalTtc)}`,
    `- Acompte encaissé : ${currency(summary.depositPaidAmount)}`,
    depositDateLine,
    `- Règlements hors acompte : ${currency(summary.paymentAmount)}`,
    `- Total déjà réglé : ${currency(summary.paidAmount)}`,
    `- Reste dû : ${currency(summary.remainingAmount)}`,
    noteLine,
    "Coordonnées de règlement :",
    `- IBAN : ${valueOrMissing(company.iban)}`,
    `- BIC : ${valueOrMissing(company.bic)}`,
    `- Conditions : ${valueOrMissing(company.paymentTerms)}`,
    "",
    "Merci de nous indiquer si le paiement a déjà été effectué afin que nous puissions mettre votre dossier à jour.",
    "",
    "Cordialement,",
    valueOrMissing(company.name || company.legalName),
    company.phone ? `Téléphone : ${company.phone}` : "",
    company.email ? `Email : ${company.email}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, body, summary, totalTtc: sums.totalTtc };
}
