/// <reference types="vite/client" />

import type { AtelierApi } from "./runtimeApi";

declare global {
  interface Window {
    atelierApi?: AtelierApi;
  }
}
