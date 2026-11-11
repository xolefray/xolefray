// Spread — "A little bit of fate". A titled page and one pop-up card until the real scene lands.
import { buildStubSpread } from './_stub.js';

export default {
  id: 'fate',
  title: 'A little bit of fate',
  build(ctx) {
    const spread = ctx.timeline.SPREADS.find((s) => s.id === 'fate');
    return buildStubSpread(ctx, {
      id: 'fate',
      k: spread.k,
      tints: ['#e7eef6', '#f6e4ea'],
      outfit: 'casual',
      poses: ['stand', 'stand'],
      photo: null,
      photoCaption: '',
    });
  },
};
