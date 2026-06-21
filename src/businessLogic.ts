import type { BusinessDocument, CatalogItem, DocumentSnapshot, LineItem, StockMovement } from "./types";
import { duplicateLines, makeId } from "./utils";

export function makeDocumentSnapshot(doc: BusinessDocument): DocumentSnapshot {
  return {
    type: doc.type,
    number: doc.number,
    status: doc.status,
    clientId: doc.clientId,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    projectName: doc.projectName,
    siteAddress: doc.siteAddress,
    workStart: doc.workStart,
    workDuration: doc.workDuration,
    depositRate: doc.depositRate,
    notes: doc.notes,
    terms: doc.terms,
    lines: duplicateLines(doc.lines),
    attachments: [...(doc.attachments || [])],
    depositPaidAmount: doc.depositPaidAmount || 0,
    depositPaidAt: doc.depositPaidAt || "",
    payments: [...(doc.payments || [])],
    paymentNotes: doc.paymentNotes || "",
    reminders: [...(doc.reminders || [])],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function creditLines(lines: LineItem[]) {
  return duplicateLines(lines).map((line) => ({
    ...line,
    unitPrice: -Math.abs(Number(line.unitPrice) || 0),
  }));
}

export function applyDocumentStockImpact(
  catalog: CatalogItem[],
  doc: BusinessDocument,
  mode: "invoice" | "cancelInvoice" | "return" | "cancelReturn"
) {
  const multiplier = mode === "invoice" || mode === "cancelReturn" ? -1 : 1;
  const reasonLabels: Record<typeof mode, string> = {
    invoice: `Facturation ${doc.number}`,
    cancelInvoice: `Annulation facturation ${doc.number}`,
    return: `Retour ${doc.number}`,
    cancelReturn: `Annulation retour ${doc.number}`,
  };
  const movementType: StockMovement["type"] = multiplier < 0 ? "exit" : "entry";

  return catalog.map((item) => {
    const quantity = doc.lines
      .filter((line) => line.catalogItemId === item.id)
      .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    if (!item.trackStock || quantity <= 0) return item;

    const previousQuantity = Number(item.stockQuantity) || 0;
    const nextQuantity = Math.max(0, previousQuantity + quantity * multiplier);
    const movement: StockMovement = {
      id: makeId("stock"),
      type: movementType,
      quantity,
      previousQuantity,
      nextQuantity,
      reason: reasonLabels[mode],
      createdAt: new Date().toISOString(),
    };

    return {
      ...item,
      stockQuantity: nextQuantity,
      stockMovements: [movement, ...(item.stockMovements || [])].slice(0, 30),
    };
  });
}
