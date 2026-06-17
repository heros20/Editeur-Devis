import { createDefaultAppData, normalizeData } from "./defaultData";
import type { AppData, DocumentType } from "./types";
import { formatBusinessNumber, sanitizeFileName } from "./utils";

export interface AtelierApi {
  loadStore: () => Promise<AppData>;
  saveStore: (data: AppData) => Promise<AppData>;
  nextNumber: (type: DocumentType | "client") => Promise<string>;
  uuid: () => Promise<string>;
  savePdf: (payload: { html: string; defaultPath: string }) => Promise<{ canceled: boolean; filePath?: string }>;
  exportJson: (data: AppData) => Promise<{ canceled: boolean; filePath?: string }>;
  openEmail: (payload: { to?: string; subject: string; body: string }) => Promise<{ opened: boolean }>;
}

const storageKey = "atelier-du-bois:data:v1";

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

function mailtoUrl({ to, subject, body }: { to?: string; subject: string; body: string }) {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${encodeURIComponent(to || "")}?${params.toString()}`;
}

const browserApi: AtelierApi = {
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
  async exportJson(data) {
    downloadBlob(JSON.stringify(normalizeData(data), null, 2), "atelier-du-bois-sauvegarde.json", "application/json;charset=utf-8");
    return { canceled: false, filePath: "atelier-du-bois-sauvegarde.json" };
  },
  async openEmail(payload) {
    window.location.href = mailtoUrl(payload);
    return { opened: true };
  },
};

export function getAtelierApi(): AtelierApi {
  return window.atelierApi ?? browserApi;
}
