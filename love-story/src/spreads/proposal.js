// STUB (T-scaffold) — replaced by the spread owner.
// Spread 5 — her birthday party: he kneels, the question, the photo, yes.
// Placeholder built by ./_stub.js so the film runs end to end: titled page art (FONT.display),
// the narrator's lines as a hand-written note, one V-fold sign, the two figures, camera cues.
import { buildStubSpread } from './_stub.js';

export default {
  id: 'proposal',
  title: 'The question',
  /**
   * @param ctx { THREE, paper, popup, rng, BOOK, photos, figures, FONT, timeline }
   * @returns { group, leftArt, rightArt, update(alpha, t, local), cues }
   */
  build(ctx) {
    const C = ctx.paper.PALETTES.scrapbook;
    return buildStubSpread(ctx, {
      k: 5,
      tints: ['#f3d9d3', C.cream],
      outfit: 'party',
      poses: ['kneel', 'surprised'],
      photo: 'proposal',
      photoCaption: 'she said yes!',
    });
  },
};
