/// <reference types="vite/client" />

import type { DevixApi } from "./runtimeApi";

declare global {
  interface Window {
    devixApi?: DevixApi;
  }
}
