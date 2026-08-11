"use client";

import { create } from "zustand";
import type { SliceHighlight } from "./facingSliceAxis";

type SliceHighlightState = {
  /** Sticky aim-depth plane — survives orbit until cleared (outside click / reset). */
  slice: SliceHighlight | null;
  setSlice: (slice: SliceHighlight) => void;
  clearSlice: () => void;
};

export const useSliceHighlightStore = create<SliceHighlightState>((set) => ({
  slice: null,
  setSlice: (slice) => set({ slice }),
  clearSlice: () => set({ slice: null }),
}));
