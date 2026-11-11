// dims.js — the one place the album's page size lives, so book.js (BOOK) and popup.js (PAGE)
// can never disagree. No imports: safe for anything to import (no cycles).
//
//   PAGE_W  gutter -> outer edge, world X (per page)
//   PAGE_D  page depth, world Z (page z in [-PAGE_D/2, +PAGE_D/2])
//   LEAVES  0 = front cover, 1..LEAVES-2 inner boards, LEAVES-1 = back cover
//           -> LEAVES-1 spreads k = 1..LEAVES-1 (version 2: 9 leaves, eight spreads)
//   ART_W/ART_H  page-art canvas size in px (aspect PAGE_W : PAGE_D)

export const PAGE_W = 3.6;
export const PAGE_D = 3.0;
export const LEAVES = 9;
export const ART_W = 1024;
export const ART_H = 853;
