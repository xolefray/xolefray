// Spread — "Lunch breaks". A titled page and one pop-up card until the real scene lands.
import { L } from '../i18n.js';
import { buildStubSpread } from './_stub.js';

export default {
  id: 'lunch',
  title: 'Lunch breaks',
  build(ctx) {
    const spread = ctx.timeline.SPREADS.find((s) => s.id === 'lunch');
    return buildStubSpread(ctx, {
      id: 'lunch',
      k: spread.k,
      tints: ['#f4e2c4', '#f7d7c3'],
      outfit: 'vest',
      poses: ['sit', 'sit'],
      photo: 'lunch',
      photoCaption: L('our first lunch', 'nuestro primer almuerzo'),
    });
  },
};
