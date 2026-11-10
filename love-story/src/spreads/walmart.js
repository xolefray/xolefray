// STUB (T-scaffold) — replaced by the spread owner.
// Spread 1 — the store where they met as coworkers: the sign, the vests, the lunch-break table.
// Placeholder built by ./_stub.js so the film runs end to end: titled page art (FONT.display),
// the narrator's lines as a hand-written note, one V-fold sign, the two figures, camera cues.
import { buildStubSpread } from './_stub.js';

export default {
  id: 'walmart',
  title: 'How we met',
  /**
   * @param ctx { THREE, paper, popup, rng, BOOK, photos, figures, FONT, timeline }
   * @returns { group, leftArt, rightArt, update(alpha, t, local), cues }
   */
  build(ctx) {
    const C = ctx.paper.PALETTES.scrapbook;
    return buildStubSpread(ctx, {
      k: 1,
      tints: [C.kraft, C.cream],
      outfit: 'vest',
      poses: ['stand', 'wave'],
      photo: 'cover',
      photoCaption: 'the two of us',
    });
  },
};
