// STUB (T0) — replaced by the batch-2 city spread owner
/**
 * spreads/city.js — "The Lantern City" spread (minimal stub): flat coloured page art and one V-fold card.
 */

function pageArt(paper, color, label) {
  const { canvas, ctx } = paper.makeCanvas(768, 1024);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 768, 1024);
  ctx.fillStyle = paper.PAPER.ink;
  ctx.font = 'bold 72px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 384, 140);
  return canvas;
}

export default {
  id: 'city',
  title: 'The Lantern City',
  build({ THREE, paper, popup, rng, BOOK }) {
    const group = new THREE.Group();
    const { canvas, ctx } = paper.makeCanvas(512, 256);
    ctx.fillStyle = '#2a2550';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = paper.PAPER.white;
    ctx.font = 'bold 48px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('city', 256, 145);
    const fold = popup.vFold({ z0: -0.6, width: 2.4, height: 1.2 });
    const halves = paper.splitCard({ canvas, width: 2.4, height: 1.2 });
    fold.left.add(halves.left);
    fold.right.add(halves.right);
    group.add(fold.object);
    return {
      group,
      leftArt: pageArt(paper, '#8a86b8', 'city · L'),
      rightArt: pageArt(paper, '#6f6aa3', 'city · R'),
      update(alpha, t, local) {
        fold.update(alpha);
      },
    };
  },
};
