import { ExternalLink, Paperclip, Plus, Trash2 } from "lucide-react";
import type { DocumentAttachment } from "./types";

export function PurchaseAttachments({
  attachments,
  readOnly,
  onAdd,
  onOpen,
  onRemove,
}: {
  attachments: DocumentAttachment[];
  readOnly: boolean;
  onAdd: () => void;
  onOpen: (attachment: DocumentAttachment) => void;
  onRemove: (attachment: DocumentAttachment) => void;
}) {
  return (
    <section className="purchaseAttachments">
      <div className="purchaseAttachmentsHeader">
        <div>
          <Paperclip size={17} />
          <strong>Pièces jointes</strong>
          <span>{attachments.length}</span>
        </div>
        {!readOnly && (
          <button type="button" className="ghost" onClick={onAdd}>
            <Plus size={16} /> Ajouter un fichier
          </button>
        )}
      </div>
      {attachments.length ? (
        <div className="purchaseAttachmentList">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="purchaseAttachment">
              <button type="button" className="purchaseAttachmentOpen" onClick={() => onOpen(attachment)}>
                <ExternalLink size={15} />
                <span>
                  <strong>{attachment.name}</strong>
                  <small>{attachment.size ? `${Math.max(1, Math.round(attachment.size / 1024))} Ko` : "Fichier joint"}</small>
                </span>
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="iconButton dangerIcon"
                  aria-label={`Supprimer ${attachment.name}`}
                  onClick={() => onRemove(attachment)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="purchaseAttachmentEmpty">Ajoutez le devis fournisseur, une photo, un accusé de réception ou la facture reçue.</p>
      )}
    </section>
  );
}
