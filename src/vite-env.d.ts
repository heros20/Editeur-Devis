/// <reference types="vite/client" />

import type { AppData, DocumentType } from "./types";

declare global {
  interface Window {
    atelierApi: {
      loadStore: () => Promise<AppData>;
      saveStore: (data: AppData) => Promise<AppData>;
      nextNumber: (type: DocumentType | "client") => Promise<string>;
      uuid: () => Promise<string>;
      savePdf: (payload: { html: string; defaultPath: string }) => Promise<{ canceled: boolean; filePath?: string }>;
      exportJson: (data: AppData) => Promise<{ canceled: boolean; filePath?: string }>;
    };
  }
}
