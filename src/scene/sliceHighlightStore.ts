"use client";

import { create } from "zustand";
import type { SliceHighlight } from "./facingSliceAxis";

type SliceHighlightState = {
  slice: SliceHighlight | null;
  setSlice: (slice: SliceHighlight) => void;
  clearSlice: () => void;
};

/** Locked front-face highlight — refreshed when aiming starts / while aiming. */
export const useSliceHighlightStore = create<SliceHighlightState>((set) => ({
  slice: null,
  setSlice: (slice) => set({ slice }),
  clearSlice: () => set({ slice: null }),
}));
