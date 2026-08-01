"use client";

import { create } from "zustand";
import type { SliceHighlight } from "./facingSliceAxis";

type SliceHighlightState = {
  slice: SliceHighlight | null;
  setSlice: (slice: SliceHighlight) => void;
  clearSlice: () => void;
};

/** Aim-depth slice highlight — refreshed while aiming to follow cursor depth. */
export const useSliceHighlightStore = create<SliceHighlightState>((set) => ({
  slice: null,
  setSlice: (slice) => set({ slice }),
  clearSlice: () => set({ slice: null }),
}));
