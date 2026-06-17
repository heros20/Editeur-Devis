const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atelierApi", {
  loadStore: () => ipcRenderer.invoke("store:load"),
  saveStore: (data) => ipcRenderer.invoke("store:save", data),
  nextNumber: (type) => ipcRenderer.invoke("store:next-number", type),
  uuid: () => ipcRenderer.invoke("app:uuid"),
  savePdf: (payload) => ipcRenderer.invoke("dialog:save-pdf", payload),
  exportJson: (data) => ipcRenderer.invoke("dialog:export-json", data),
  openEmail: (payload) => ipcRenderer.invoke("app:open-email", payload),
});
