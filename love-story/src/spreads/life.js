// STUB (T-scaffold) — replaced by the spread owner.
// Spread 4 — first place, a dog of their own, a home with both names, the trip to Japan.
// Placeholder built by ./_stub.js so the film runs end to end: titled page art (FONT.display),
// the narrator's lines as a hand-written note, one V-fold sign, the two figures, camera cues.
import { buildStubSpread } from './_stub.js';

export default {
  id: 'life',
  title: 'A life together',
  /**
   * @param ctx { THREE, paper, popup, rng, BOOK, photos, figures, FONT, timeline }
   * @returns { group, leftArt, rightArt, update(alpha, t, local), cues }
   */
  build(ctx) {
    const C = ctx.paper.PALETTES.scrapbook;
    return buildStubSpread(ctx, {
      k: 4,
      tints: [C.kraft, '#e3efd9'],
      outfit: 'casual',
      poses: ['stand', 'stand'],
      photo: 'dog',
      photoCaption: 'our girl',
    });
  },
};
