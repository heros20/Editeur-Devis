import { ArrowLeft, Building2, Mail, PackageCheck, ReceiptText } from "lucide-react";
import { useState } from "react";
import { PurchaseInvoicesView } from "./PurchaseInvoicesView";
import { PurchaseOrdersView } from "./PurchaseOrdersView";
import type { CatalogItem, DocumentAttachment, PurchaseInvoice, PurchaseOrder, Supplier } from "./types";

export function PurchasesView(props: {
  orders: PurchaseOrder[];
  invoices: PurchaseInvoice[];
  suppliers: Supplier[];
  catalog: CatalogItem[];
  defaultVatRate: number;
  readOnly: boolean;
  onSaveOrder: (order: PurchaseOrder) => Promise<boolean>;
  onReceiveOrder: (order: PurchaseOrder) => Promise<boolean>;
  onEmailOrder: (order: PurchaseOrder) => Promise<boolean>;
  onCreateInvoice: (order: PurchaseOrder) => Promise<boolean>;
  onDeleteOrder: (order: PurchaseOrder) => Promise<boolean>;
  onExportOrderPdf: (order: PurchaseOrder) => Promise<void>;
  onSaveInvoice: (invoice: PurchaseInvoice) => Promise<boolean>;
  onPostInvoice: (invoice: PurchaseInvoice) => Promise<boolean>;
  onCancelInvoice: (invoice: PurchaseInvoice) => Promise<boolean>;
  onDeleteInvoice: (invoice: PurchaseInvoice) => Promise<boolean>;
  onRestoreOrder: (invoice: PurchaseInvoice) => Promise<boolean>;
  onAddOrderAttachment: (order: PurchaseOrder) => Promise<void>;
  onRemoveOrderAttachment: (order: PurchaseOrder, attachment: DocumentAttachment) => Promise<void>;
  onAddInvoiceAttachment: (invoice: PurchaseInvoice) => Promise<void>;
  onRemoveInvoiceAttachment: (invoice: PurchaseInvoice, attachment: DocumentAttachment) => Promise<void>;
  onOpenAttachment: (attachment: DocumentAttachment) => Promise<void>;
}) {
  const [section, setSection] = useState<"orders" | "invoices">("orders");
  const [supplierId, setSupplierId] = useState("");
  const selectedSupplier = props.suppliers.find((supplier) => supplier.id === supplierId);
  const orders = selectedSupplier ? props.orders.filter((order) => order.supplierId === selectedSupplier.id) : [];
  const invoices = selectedSupplier ? props.invoices.filter((invoice) => invoice.supplierId === selectedSupplier.id) : [];
  const catalog = selectedSupplier
    ? props.catalog.filter((item) => item.supplierId === selectedSupplier.id || !item.trackStock)
    : [];

  if (!selectedSupplier) {
    return (
      <section className="purchasesView">
        <div className="purchaseIntro">
          <strong>Choisissez d’abord un fournisseur</strong>
          <p>Ses commandes, factures et pièces jointes seront regroupées dans le même dossier.</p>
        </div>
        <div className="purchaseSupplierGrid">
          {props.suppliers.map((supplier) => {
            const orderCount = props.orders.filter((order) => order.supplierId === supplier.id).length;
            const invoiceCount = props.invoices.filter((invoice) => invoice.supplierId === supplier.id).length;
            return (
              <button
                key={supplier.id}
                className="purchaseSupplierCard"
                onClick={() => {
                  setSupplierId(supplier.id);
                  setSection("orders");
                }}
              >
                <Building2 size={22} />
                <span>
                  <strong>{supplier.name}</strong>
                  <small>{supplier.email || "Email à renseigner dans la fiche fournisseur"}</small>
                </span>
                <b>
                  {orderCount} commande(s)
                  <br />
                  {invoiceCount} facture(s)
                </b>
              </button>
            );
          })}
          {!props.suppliers.length && (
            <div className="panel purchaseNoSupplier">
              <Building2 size={38} />
              <h2>Aucun fournisseur enregistré</h2>
              <p>Créez d’abord un fournisseur depuis le menu « Fournisseurs ».</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="purchasesView">
      <div className="purchaseSupplierHeader">
        <button className="ghost" onClick={() => setSupplierId("")}>
          <ArrowLeft size={17} /> Changer de fournisseur
        </button>
        <div>
          <Building2 size={20} />
          <span>
            <strong>{selectedSupplier.name}</strong>
            <small>
              <Mail size={13} /> {selectedSupplier.email || "Email non renseigné"}
            </small>
          </span>
        </div>
      </div>
      <div className="purchaseIntro">
        <strong>Parcours pour {selectedSupplier.name}</strong>
        <p>1. Saisissez la commande · 2. Envoyez le PDF par email · 3. À réception, transformez-la en facture et renseignez son numéro</p>
      </div>
      <nav className="purchaseTabs" aria-label="Étapes des achats fournisseurs">
        <button className={section === "orders" ? "active" : ""} onClick={() => setSection("orders")}>
          <PackageCheck size={20} />
          <span className="purchaseTabText">
            <strong>1. Commandes</strong>
            <small>Préparer et envoyer</small>
          </span>
          <b>{orders.length}</b>
        </button>
        <button className={section === "invoices" ? "active" : ""} onClick={() => setSection("invoices")}>
          <ReceiptText size={20} />
          <span className="purchaseTabText">
            <strong>2. Factures reçues</strong>
            <small>Renseigner et comptabiliser</small>
          </span>
          <b>{invoices.length}</b>
        </button>
      </nav>
      {section === "orders" ? (
        <PurchaseOrdersView
          orders={orders}
          suppliers={[selectedSupplier]}
          selectedSupplier={selectedSupplier}
          catalog={catalog}
          defaultVatRate={props.defaultVatRate}
          readOnly={props.readOnly}
          onSave={props.onSaveOrder}
          onReceive={props.onReceiveOrder}
          onEmail={props.onEmailOrder}
          onCreateInvoice={async (order) => {
            const created = await props.onCreateInvoice(order);
            if (created) setSection("invoices");
            return created;
          }}
          onDelete={props.onDeleteOrder}
          onExportPdf={props.onExportOrderPdf}
          onAddAttachment={props.onAddOrderAttachment}
          onOpenAttachment={props.onOpenAttachment}
          onRemoveAttachment={props.onRemoveOrderAttachment}
        />
      ) : (
        <PurchaseInvoicesView
          invoices={invoices}
          suppliers={[selectedSupplier]}
          selectedSupplier={selectedSupplier}
          catalog={catalog}
          defaultVatRate={props.defaultVatRate}
          readOnly={props.readOnly}
          onSave={props.onSaveInvoice}
          onPost={props.onPostInvoice}
          onCancel={props.onCancelInvoice}
          onDelete={props.onDeleteInvoice}
          onRestoreOrder={async (invoice) => {
            const restored = await props.onRestoreOrder(invoice);
            if (restored) setSection("orders");
            return restored;
          }}
          onAddAttachment={props.onAddInvoiceAttachment}
          onOpenAttachment={props.onOpenAttachment}
          onRemoveAttachment={props.onRemoveInvoiceAttachment}
        />
      )}
    </section>
  );
}
