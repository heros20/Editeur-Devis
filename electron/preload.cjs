const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("devixApi", {
  loadStore: () => ipcRenderer.invoke("store:load"),
  saveStore: (data) => ipcRenderer.invoke("store:save", data),
  nextNumber: (type) => ipcRenderer.invoke("store:next-number", type),
  uuid: () => ipcRenderer.invoke("app:uuid"),
  getDiagnostics: () => ipcRenderer.invoke("app:diagnostics"),
  openPath: (targetPath) => ipcRenderer.invoke("app:open-path", targetPath),
  savePdf: (payload) => ipcRenderer.invoke("dialog:save-pdf", payload),
  saveExcel: (payload) => ipcRenderer.invoke("dialog:save-excel", payload),
  exportJson: (data) => ipcRenderer.invoke("dialog:export-json", data),
  openEmail: (payload) => ipcRenderer.invoke("app:open-email", payload),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  authStorageGet: (key) => ipcRenderer.invoke("auth-storage:get", key),
  authStorageSet: (key, value) => ipcRenderer.invoke("auth-storage:set", key, value),
  authStorageRemove: (key) => ipcRenderer.invoke("auth-storage:remove", key),
  emailPdf: (payload) => ipcRenderer.invoke("app:email-pdf", payload),
  selectAttachments: (documentId) => ipcRenderer.invoke("dialog:select-attachments", documentId),
  openAttachment: (attachment) => ipcRenderer.invoke("app:open-attachment", attachment),
  deleteAttachment: (attachment) => ipcRenderer.invoke("app:delete-attachment", attachment),
});
