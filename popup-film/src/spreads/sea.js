// STUB (T0) — replaced by the batch-2 sea spread owner
/**
 * spreads/sea.js — "The Folded Sea" spread (minimal stub): flat coloured page art and one V-fold card.
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
  id: 'sea',
  title: 'The Folded Sea',
  build({ THREE, paper, popup, rng, BOOK }) {
    const group = new THREE.Group();
    const { canvas, ctx } = paper.makeCanvas(512, 256);
    ctx.fillStyle = '#1d4f7a';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = paper.PAPER.white;
    ctx.font = 'bold 48px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('sea', 256, 145);
    const fold = popup.vFold({ z0: -0.6, width: 2.4, height: 1.2 });
    const halves = paper.splitCard({ canvas, width: 2.4, height: 1.2 });
    fold.left.add(halves.left);
    fold.right.add(halves.right);
    group.add(fold.object);
    return {
      group,
      leftArt: pageArt(paper, '#a8cde0', 'sea · L'),
      rightArt: pageArt(paper, '#86b6d4', 'sea · R'),
      update(alpha, t, local) {
        fold.update(alpha);
      },
    };
  },
};
