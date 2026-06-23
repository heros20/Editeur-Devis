import type { CatalogItem, CompanySettings, PurchaseOrder, StockMovement, Supplier } from "./types";
import { purchaseLinesTotals } from "./purchaseInvoices";
import { makeId } from "./utils";

export function nextPurchaseOrderNumber(orders: PurchaseOrder[], date = new Date()) {
  const year = date.getFullYear();
  const prefix = `BCF-${year}-`;
  const next =
    orders.reduce((highest, order) => {
      if (!order.number.startsWith(prefix)) return highest;
      const value = Number(order.number.slice(prefix.length));
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export function applyPurchaseOrderStockImpact(catalog: CatalogItem[], order: PurchaseOrder, mode: "receive" | "cancel") {
  const multiplier = mode === "receive" ? 1 : -1;
  const reason = `${mode === "receive" ? "Réception" : "Annulation réception"} ${order.number}`;
  return catalog.map((item) => {
    const quantity = order.lines
      .filter((line) => line.catalogItemId === item.id)
      .reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0);
    if (!item.trackStock || quantity <= 0) return item;
    const previousQuantity = Math.max(0, Number(item.stockQuantity) || 0);
    const nextQuantity = Math.max(0, previousQuantity + quantity * multiplier);
    const movement: StockMovement = {
      id: makeId("stock"),
      type: multiplier > 0 ? "entry" : "exit",
      quantity,
      previousQuantity,
      nextQuantity,
      reason,
      createdAt: new Date().toISOString(),
    };
    return { ...item, stockQuantity: nextQuantity, stockMovements: [movement, ...(item.stockMovements || [])].slice(0, 30) };
  });
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

export function renderPurchaseOrderHtml(order: PurchaseOrder, supplier: Supplier | undefined, company: CompanySettings) {
  const totals = purchaseLinesTotals(order.lines);
  const rows = order.lines
    .map((line) => {
      const amount = line.quantity * line.unitPrice;
      return `<tr><td>${esc(line.description)}</td><td>${esc(line.quantity)} ${esc(line.unit)}</td><td>${money(line.unitPrice)}</td><td>${esc(line.vatRate)} %</td><td>${money(amount)}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#1f2f2b;padding:34px;font-size:13px}header{display:flex;justify-content:space-between;border-bottom:3px solid #1f5f52;padding-bottom:20px;margin-bottom:26px}h1{margin:0 0 6px;font-size:26px}h2{font-size:15px;margin:0 0 8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}.box{border:1px solid #d9d2c8;border-radius:8px;padding:14px;line-height:1.55}table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#1f5f52;color:#fff;text-align:left;padding:10px}td{padding:10px;border-bottom:1px solid #ddd}.totals{margin:20px 0 0 auto;width:280px}.totals p{display:flex;justify-content:space-between;margin:7px 0}.total{font-size:17px;font-weight:bold;border-top:2px solid #1f5f52;padding-top:9px}.notes{margin-top:28px;white-space:pre-wrap}</style></head><body>
    <header><div><h1>Bon de commande fournisseur</h1><strong>${esc(order.number)}</strong></div><div><strong>${esc(company.name)}</strong><br>${esc(company.address)}<br>${esc(company.postalCode)} ${esc(company.city)}<br>${esc(company.email)}</div></header>
    <div class="meta"><div class="box"><h2>Fournisseur</h2><strong>${esc(supplier?.name || order.supplier)}</strong><br>${esc(supplier?.contact)}<br>${esc(supplier?.address)}<br>${esc(supplier?.postalCode)} ${esc(supplier?.city)}<br>${esc(supplier?.email)}</div><div class="box"><h2>Commande</h2>Date : ${esc(order.orderDate)}<br>Livraison souhaitée : ${esc(order.expectedDate)}<br>Statut : ${order.status === "received" ? "Réceptionnée" : order.status === "sent" ? "Envoyée" : "À préparer"}</div></div>
    <table><thead><tr><th>Désignation</th><th>Quantité</th><th>Prix HT</th><th>TVA</th><th>Total HT</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><p><span>Total HT</span><strong>${money(totals.totalHt)}</strong></p><p><span>TVA</span><strong>${money(totals.totalVat)}</strong></p><p class="total"><span>Total TTC</span><strong>${money(totals.totalTtc)}</strong></p></div>
    ${order.notes ? `<div class="notes"><h2>Notes</h2>${esc(order.notes)}</div>` : ""}</body></html>`;
}
