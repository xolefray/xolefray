// STUB (T-scaffold) — replaced by the spread owner.
// Spread 6 — the wedding date, not on a Sunday, from coworkers to forever, see you there.
// Placeholder built by ./_stub.js so the film runs end to end: titled page art (FONT.display),
// the narrator's lines as a hand-written note, one V-fold sign, the two figures, camera cues.
import { buildStubSpread } from './_stub.js';

export default {
  id: 'wedding',
  title: 'February 6, 2027',
  /**
   * @param ctx { THREE, paper, popup, rng, BOOK, photos, figures, FONT, timeline }
   * @returns { group, leftArt, rightArt, update(alpha, t, local), cues }
   */
  build(ctx) {
    const C = ctx.paper.PALETTES.scrapbook;
    return buildStubSpread(ctx, {
      k: 6,
      tints: [C.cream, '#f8ecc4'],
      outfit: 'wedding',
      poses: ['holdHandsL', 'holdHandsR'],
      photo: null,
      photoCaption: '',
    });
  },
};
