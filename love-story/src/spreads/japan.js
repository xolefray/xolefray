// Spread 7 — "Our Japan adventure". STUB: a titled page and one pop-up card.
// The real scene replaces this file. Title and captions follow the language via timeline + i18n.
import { buildStubSpread } from './_stub.js';

export default {
  id: 'japan',
  title: 'Our Japan adventure',
  build(ctx) {
    const info = ctx.timeline.SPREADS.find((s) => s.id === 'japan');
    return buildStubSpread(ctx, {
      id: 'japan',
      k: info.k,
      tints: ['#e7eef2', '#f6edd9'],
      outfit: 'casual',
      poses: ['stand', 'wave'],
      photo: null,
    });
  },
};
