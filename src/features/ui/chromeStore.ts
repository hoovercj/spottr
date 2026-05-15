/**
 * Cross-cutting UI chrome state. Pages can opt out of the bottom navbar
 * (e.g., the completed-session detail view that pretends to be a modal
 * over the History tab).
 */

import { create } from 'zustand';

interface ChromeState {
  /** When true, the AppLayout suppresses the bottom navbar. */
  hideNavbar: boolean;
  setHideNavbar: (next: boolean) => void;
}

export const useChromeStore = create<ChromeState>((set) => ({
  hideNavbar: false,
  setHideNavbar: (next) => set({ hideNavbar: next }),
}));
