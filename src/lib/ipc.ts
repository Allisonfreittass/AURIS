import type { AurisApi } from '../../shared/ipc';

declare global {
  interface Window {
    auris: AurisApi;
  }
}

export const auris: AurisApi = window.auris;
