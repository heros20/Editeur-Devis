import { createDefaultAppData, normalizeData } from "./defaultData";
import type { AppData, DocumentAttachment, DocumentType } from "./types";
import { formatBusinessNumber, sanitizeFileName } from "./utils";

export interface DevixApi {
  loadStore: () => Promise<AppData>;
  saveStore: (data: AppData) => Promise<AppData>;
  nextNumber: (type: DocumentType | "client") => Promise<string>;
  uuid: () => Promise<string>;
  getDiagnostics: () => Promise<DevixDiagnostics>;
  openPath: (targetPath: string) => Promise<{ opened: boolean; error?: string }>;
  savePdf: (payload: { html: string; defaultPath: string }) => Promise<{ canceled: boolean; filePath?: string }>;
  saveExcel: (payload: { bytes: Uint8Array; defaultPath: string }) => Promise<{ canceled: boolean; filePath?: string }>;
  exportJson: (data: AppData) => Promise<{ canceled: boolean; filePath?: string }>;
  openEmail: (payload: { to?: string; subject: string; body: string }) => Promise<{ opened: boolean }>;
  openExternal: (url: string) => Promise<{ opened: boolean }>;
  openAuth: (url: string) => Promise<{ opened: boolean; callbackUrl?: string }>;
  authStorageGet: (key: string) => Promise<string | null>;
  authStorageSet: (key: string, value: string) => Promise<{ saved: boolean }>;
  authStorageRemove: (key: string) => Promise<{ removed: boolean }>;
  emailPdf: (payload: {
    html: string;
    defaultPath: string;
    to?: string;
    subject: string;
    body: string;
  }) => Promise<{ opened: boolean; filePath?: string; fallback?: boolean }>;
  selectAttachments: (documentId: string) => Promise<{ canceled: boolean; attachments: DocumentAttachment[] }>;
  openAttachment: (attachment: DocumentAttachment) => Promise<{ opened: boolean }>;
  deleteAttachment: (attachment: DocumentAttachment) => Promise<{ deleted: boolean }>;
}

export interface DevixDiagnostics {
  version: string;
  mode: "browser" | "development" | "installed" | "portable";
  isPackaged: boolean;
  platform: string;
  userDataPath: string;
  dataPath: string;
  backupRoot: string;
  attachmentsRoot: string;
  oneDriveBackupRoot: string;
  lastLocalBackupAt: string;
  lastOneDriveBackupAt: string;
}

const storageKey = "devix:data:v1";

function readBrowserStore() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? normalizeData(JSON.parse(raw)) : createDefaultAppData();
  } catch {
    return createDefaultAppData();
  }
}

function downloadBlob(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : "";
  link.href = url;
  link.download = sanitizeFileName(base) + extension;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadBinary(content: Uint8Array, fileName: string, type: string) {
  const bytes = new Uint8Array(content.byteLength);
  bytes.set(content);
  const blob = new Blob([bytes.buffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function chooseFiles() {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt";
    input.style.display = "none";
    document.body.append(input);

    const cleanup = () => input.remove();
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      cleanup();
      resolve(files);
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve([]);
    });
    input.click();
  });
}

function mailtoUrl({ to, subject, body }: { to?: string; subject: string; body: string }) {
  const params = [
    ["subject", subject || ""],
    ["body", body || ""],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%20/g, "%20")}`)
    .join("&");
  return `mailto:${encodeURIComponent(to || "")}?${params}`;
}

const browserApi: DevixApi = {
  async loadStore() {
    return readBrowserStore();
  },
  async saveStore(data) {
    const normalized = normalizeData(data);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  },
  async nextNumber(type) {
    const data = readBrowserStore();
    return formatBusinessNumber(type, data.counters[type] || 1);
  },
  async uuid() {
    return crypto.randomUUID();
  },
  async getDiagnostics() {
    return {
      version: "navigateur",
      mode: "browser",
      isPackaged: false,
      platform: navigator.platform || "browser",
      userDataPath: "localStorage",
      dataPath: storageKey,
      backupRoot: "Non disponible en navigateur",
      attachmentsRoot: "Données intégrées au navigateur",
      oneDriveBackupRoot: "",
      lastLocalBackupAt: "",
      lastOneDriveBackupAt: "",
    };
  },
  async openPath() {
    return { opened: false, error: "Ouverture de dossier disponible uniquement dans l'application de bureau." };
  },
  async savePdf({ html, defaultPath }) {
    const printWindow = window.open("", "_blank", "width=920,height=1100");
    if (!printWindow) {
      downloadBlob(html, defaultPath.replace(/\.pdf$/i, ".html"), "text/html;charset=utf-8");
      return { canceled: false, filePath: defaultPath.replace(/\.pdf$/i, ".html") };
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
    return { canceled: false, filePath: defaultPath };
  },
  async saveExcel({ bytes, defaultPath }) {
    downloadBinary(bytes, defaultPath, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return { canceled: false, filePath: defaultPath };
  },
  async exportJson(data) {
    downloadBlob(JSON.stringify(normalizeData(data), null, 2), "devix-sauvegarde.json", "application/json;charset=utf-8");
    return { canceled: false, filePath: "devix-sauvegarde.json" };
  },
  async openEmail(payload) {
    window.location.href = mailtoUrl(payload);
    return { opened: true };
  },
  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return { opened: true };
  },
  async openAuth(url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return { opened: true };
  },
  async authStorageGet(key) {
    return localStorage.getItem(key);
  },
  async authStorageSet(key, value) {
    localStorage.setItem(key, value);
    return { saved: true };
  },
  async authStorageRemove(key) {
    localStorage.removeItem(key);
    return { removed: true };
  },
  async emailPdf(payload) {
    console.warn("Les pieces jointes PDF necessitent l'application de bureau.");
    const printWindow = window.open("", "_blank", "width=920,height=1100");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(payload.html);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 250);
    }
    window.location.href = mailtoUrl(payload);
    return { opened: true, filePath: payload.defaultPath, fallback: true };
  },
  async selectAttachments() {
    const files = await chooseFiles();
    if (!files.length) return { canceled: true, attachments: [] };
    const attachments = await Promise.all(
      files.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        return {
          id: crypto.randomUUID(),
          name: file.name,
          filePath: dataUrl,
          dataUrl,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          addedAt: new Date().toISOString(),
        };
      })
    );
    return { canceled: false, attachments };
  },
  async openAttachment(attachment) {
    if (!attachment.filePath) return { opened: false };
    const link = document.createElement("a");
    link.href = attachment.filePath;
    link.target = "_blank";
    link.rel = "noopener";
    link.download = attachment.name;
    document.body.append(link);
    link.click();
    link.remove();
    return { opened: true };
  },
  async deleteAttachment() {
    return { deleted: true };
  },
};

export function getDevixApi(): DevixApi {
  return window.devixApi ?? browserApi;
}
