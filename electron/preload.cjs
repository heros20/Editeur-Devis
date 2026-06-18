const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atelierApi", {
  loadStore: () => ipcRenderer.invoke("store:load"),
  saveStore: (data) => ipcRenderer.invoke("store:save", data),
  nextNumber: (type) => ipcRenderer.invoke("store:next-number", type),
  uuid: () => ipcRenderer.invoke("app:uuid"),
  savePdf: (payload) => ipcRenderer.invoke("dialog:save-pdf", payload),
  exportJson: (data) => ipcRenderer.invoke("dialog:export-json", data),
  openEmail: (payload) => ipcRenderer.invoke("app:open-email", payload),
  emailPdf: (payload) => ipcRenderer.invoke("app:email-pdf", payload),
  selectAttachments: (documentId) => ipcRenderer.invoke("dialog:select-attachments", documentId),
  openAttachment: (attachment) => ipcRenderer.invoke("app:open-attachment", attachment),
  deleteAttachment: (attachment) => ipcRenderer.invoke("app:delete-attachment", attachment),
});
