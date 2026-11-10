// STUB (T-scaffold) — replaced by the spread owner.
// Spread 3 — the calendar page: they make it official (he says they already were).
// Placeholder built by ./_stub.js so the film runs end to end: titled page art (FONT.display),
// the narrator's lines as a hand-written note, one V-fold sign, the two figures, camera cues.
import { buildStubSpread } from './_stub.js';

export default {
  id: 'official',
  title: 'February 7, 2024',
  /**
   * @param ctx { THREE, paper, popup, rng, BOOK, photos, figures, FONT, timeline }
   * @returns { group, leftArt, rightArt, update(alpha, t, local), cues }
   */
  build(ctx) {
    const C = ctx.paper.PALETTES.scrapbook;
    return buildStubSpread(ctx, {
      k: 3,
      tints: ['#f7dcd6', C.cream],
      outfit: 'casual',
      poses: ['holdHandsL', 'holdHandsR'],
      photo: null,
      photoCaption: '',
    });
  },
};
