// Spread 3 — "February 7, 2024". The day they made it official; he swears they already were.
// Pop-up picture book. Times come from timeline.BEATS / SPREADS (never written as literals).
// Drawings: characters official-hands / official-banter and love-story/art/official/.
// update() allocates nothing. Free pieces (bubbles, confetti, dust, garland sway) stay
// collapsed unless the book is fully open, so a half-turned page never carries them out.
import { PAGE_W } from '../dims.js';

const CAL_H = 2.3;
const CAL_WIDE = 1.16; // wider than the drawing, so the date reads across the spread
const CAL_GAMMA = 1.66; // mountain, close to flat so the page faces the reader
const CAL_Z0 = -0.84;
const COUPLE_H = 1.7;
const GAR_H = 0.86;
const OPEN = 0.985; // α/π above which free pieces may leave their card plane
const SEAT = 0.012; // plane bottoms sit this far above the hinge so y stays ≥ −0.03

const POSES = ['official-hands', 'official-banter'];

function bump(t, at) {
  const u = (t - at) / 0.34;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

function cloneCanvas(paper, src) {
  const { canvas, ctx } = paper.makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return { canvas, ctx };
}

function fitSize(ctx, text, font, px, maxW) {
  let size = px;
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  if (w > maxW) size *= maxW / w;
  return size;
}

/** Feet-origin extents of a character card (the plane, not the opaque silhouette). */
function extents(meta, height) {
  const s = height / meta.h;
  return {
    s,
    minX: -meta.feet[0] * s,
    maxX: (meta.w - meta.feet[0]) * s,
    dip: (meta.h - meta.feet[1]) * s,
    width: meta.w * s,
    top: height - SEAT,
  };
}

function seat(card, ext) {
  card.position.y = ext.dip - SEAT;
}

export default {
  id: 'official',
  title: 'February 7, 2024',
  build(ctx) {
    const { THREE, paper, popup, rng, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'official');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'official';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);

    const calendarAt = BEATS.calendar;
    const officialAt = BEATS.official;
    const alreadyAt = BEATS.alreadyDating;
    const herAt = alreadyAt + 1.2;

    // ---------------------------------------------------------------- pages
    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const L = cloneCanvas(paper, art.canvas('page-left'));
      leftArt = L.canvas;
      const R = cloneCanvas(paper, art.canvas('page-right'));
      letterRight(R.ctx, R.canvas.width, R.canvas.height, FONT, C);
      rightArt = R.canvas;
    } else {
      leftArt = paper.page((c, w, h) => {
        doodleFloor(c, w, h, rng, C, false);
      }, { seed: 3, tint: '#f7dcd6' });
      rightArt = paper.page((c, w, h) => {
        doodleFloor(c, w, h, rng, C, true);
        letterRight(c, w, h, FONT, C);
      }, { seed: 4, tint: C.cream });
    }

    // ---------------------------------------------------------------- mechanisms
    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };

    // Giant tear-off calendar. Mountain V so it faces the reader. Month word lives on the
    // left half of the header, the 7 and the year on the right, so the crease never cuts a glyph.
    const calInfo = info('calendar');
    const calW = CAL_H * ((calInfo ? calInfo.w : 789) / (calInfo ? calInfo.h : 817)) * CAL_WIDE;
    const calendar = track(popup.vFold({ z0: CAL_Z0, gamma: CAL_GAMMA, width: calW, height: CAL_H }));

    let calCanvas;
    if (calInfo) {
      const painted = cloneCanvas(paper, art.canvas('calendar'));
      letterCalendar(painted.ctx, painted.canvas.width, painted.canvas.height, FONT, C);
      calCanvas = paper.dieCut(painted.canvas, { margin: 6 });
    } else {
      calCanvas = paper.paint(789, 817, (c, w, h) => {
        c.fillStyle = C.cream;
        c.fillRect(8, 8, w - 16, h - 16);
        c.fillStyle = C.tomato;
        c.fillRect(8, 8, w - 16, h * 0.16);
        letterCalendar(c, w, h, FONT, C);
      }, { dieCut: 6, seed: 3, grain: 0.04 });
    }
    const halves = paper.splitCard({ canvas: calCanvas, width: calW, height: CAL_H });
    halves.left.name = 'calendar-left';
    halves.right.name = 'calendar-right';
    calendar.left.add(halves.left);
    calendar.right.add(halves.right);

    // Hand-drawn heart that draws itself around the 7 (right half). Every vertex stays
    // inside that half — setDrawRange hides the stroke, it does not delete it.
    const dayX = (0.74 - 0.5) * calW;
    const dayY = (1 - 0.43) * CAL_H;
    const heart = heartRibbon(THREE, dayX, dayY, 0.38, 0.50, 0.028, '#b4232c');
    heart.mesh.position.z = 0.012;
    heart.mesh.name = 'heart-circle';
    calendar.right.add(heart.mesh);

    // Wax "OFFICIAL" stamp on the left half, clear of the crease. Thumps on the beat.
    const stampX = (0.28 - 0.5) * calW;
    const stampY = (1 - 0.56) * CAL_H;
    const STAMP = 0.52;
    const stamp = stampMesh(THREE, paper, FONT, STAMP);
    stamp.position.set(stampX, stampY, 0.01);
    stamp.name = 'stamp';
    calendar.left.add(stamp);

    const dust = dustPuffs(THREE, paper, stampX, stampY);
    for (let i = 0; i < dust.length; i++) calendar.left.add(dust[i].mesh);

    // ---------------------------------------------------------------- garland (one strict standUp per page, far back, z-clear of the calendar)
    const garMeta = info('garland');
    const garSrcW = garMeta ? garMeta.w : 1024;
    const garSrcH = garMeta ? garMeta.h : 195;
    const garW = GAR_H * ((garSrcW / 2) / garSrcH);
    // Loose stand-up: a short banner may sit nearer the gutter than the strict rule.
    const garX = garW / 2 + GAR_H * 0.5 + 0.12;
    const garZ = -0.42;
    const garlandL = track(popup.standUp({
      side: 'left', x: garX, z: garZ, fold: 'back', width: garW, height: GAR_H,
    }));
    const garlandR = track(popup.standUp({
      side: 'right', x: garX, z: garZ, fold: 'back', width: garW, height: GAR_H,
    }));
    const garRigL = new THREE.Group();
    garRigL.name = 'garland-left';
    const garRigR = new THREE.Group();
    garRigR.name = 'garland-right';
    garlandL.mount.add(garRigL);
    garlandR.mount.add(garRigR);

    if (garMeta) {
      const src = art.canvas('garland');
      const leftHalf = cropHalf(paper, src, -1);
      const rightHalf = cropHalf(paper, src, 1);
      const cardL = paper.card({
        canvas: paper.dieCut(leftHalf, { margin: 4 }),
        width: garW, height: GAR_H, anchor: 'bottom-center',
      });
      const cardR = paper.card({
        canvas: paper.dieCut(rightHalf, { margin: 4 }),
        width: garW, height: GAR_H, anchor: 'bottom-center',
      });
      cardL.name = 'garland-card-left';
      cardR.name = 'garland-card-right';
      garRigL.add(cardL);
      garRigR.add(cardR);
    } else {
      garRigL.add(fallbackGarland(paper, THREE, garW, GAR_H, C, -1));
      garRigR.add(fallbackGarland(paper, THREE, garW, GAR_H, C, 1));
    }
    const postH = GAR_H - 0.07;
    mountPost(characterArt, paper, art, figures, garRigL, postH, garW, -1);
    mountPost(characterArt, paper, art, figures, garRigR, postH, garW, 1);

    // ---------------------------------------------------------------- couple, left page, as close to the calendar as a strict standUp allows
    const refMeta = characters && characters.has && characters.has(POSES[0]) ? characters.info(POSES[0]) : null;
    const banterMeta = characters && characters.has && characters.has(POSES[1]) ? characters.info(POSES[1]) : null;
    let gutterReach = 0.23;
    let outerReach = 0.76;
    if (refMeta) {
      const a = extents(refMeta, COUPLE_H);
      const b = banterMeta ? extents(banterMeta, COUPLE_H) : a;
      gutterReach = Math.max(a.maxX, b.maxX);
      outerReach = Math.max(-a.minX, -b.minX);
    }
    // Loose stand-up (height ≤ 2·edge). The pop can stretch them ~10%, so the hinge
    // sits just far enough out that the gutter-side corner still clears the facing page.
    const popScale = 1.1;
    const coupleX = gutterReach * popScale + (COUPLE_H * popScale) * 0.5 + 0.08;
    const coupleZ = 0.72;
    // Check width is the gutter-side reach. The drawing sits outward of the hinge.
    const coupleW = gutterReach * 2;
    const couple = track(popup.standUp({
      side: 'left', x: coupleX, z: coupleZ, fold: 'back', width: coupleW, height: COUPLE_H,
    }));
    const coupleMount = couple.mount;
    coupleMount.name = 'couple';

    const flip = refMeta
      ? characterArt.characterFlip(paper, characters, POSES, { height: COUPLE_H })
      : null;
    const frameCards = [];
    if (flip) {
      coupleMount.add(flip.group);
      const ref = characters.info(POSES[0]);
      for (let i = 0; i < flip.group.children.length && i < POSES.length; i++) {
        const card = flip.group.children[i];
        const meta = characters.info(POSES[i]);
        // Shared pixel scale (frame 0). Re-seat on this frame's own feet.
        const s = COUPLE_H / ref.h;
        card.position.y = (meta.h - meta.feet[1]) * s - SEAT;
        card.name = POSES[i];
        frameCards.push(card);
      }
    } else {
      const rig = new THREE.Group();
      rig.name = 'couple-fallback';
      coupleMount.add(rig);
      const add = (who, pose, x, facing) => {
        let card = null;
        try {
          card = figures.figureCard(paper, who, { outfit: 'casual', pose, facing, scale: 1.15 });
        } catch {
          card = null;
        }
        if (!card) return null;
        card.position.x = x;
        if (card.userData && card.userData.baseline) card.position.y = -card.userData.baseline;
        card.name = `${who}-${pose}`;
        rig.add(card);
        return card;
      };
      frameCards.push(add('her', 'holdHandsL', -0.34, 'right'), add('him', 'holdHandsR', 0.16, 'left'));
    }

    const himBubble = speechBubble(THREE, paper, FONT, C, {
      w: 520, h: 250,
      lines: [
        { text: 'we were', font: 'hand', px: 0.22, color: C.ink, dy: -0.16 },
        { text: 'ALREADY dating.', font: 'display', px: 0.20, color: C.tomato, dy: 0.16 },
      ],
      tail: 'left',
    });
    himBubble.name = 'bubble-him';
    // Centre of the plane. Above his head and his raised finger, clear of her bubble.
    himBubble.position.set(0.16, 2.02, 0.02);
    coupleMount.add(himBubble);
    const HIM_W = 0.92;
    const HIM_H = 0.44;

    const herBubble = speechBubble(THREE, paper, FONT, C, {
      w: 300, h: 180,
      lines: [
        { text: '...sure.', font: 'hand', px: 0.34, color: C.ink, dy: 0.02 },
      ],
      tail: 'right',
    });
    herBubble.name = 'bubble-her';
    herBubble.position.set(-0.70, 1.86, 0.02);
    coupleMount.add(herBubble);
    const HER_W = 0.52;
    const HER_H = 0.32;

    const glow = new THREE.PointLight('#ffd0c0', 0, 6.5, 2);
    glow.name = 'official-glow';
    glow.castShadow = false;
    glow.position.set(-0.05, 1.15, 0.2);
    coupleMount.add(glow);

    // Mid-ground and foreground on both pages. x is clamped to the loose stand-up
    // rule using the drawing's real gutter reach, not a centred width.
    const stageProp = (id, side, height, z, xWant, fallback) => {
      const ext = propExtents(info(id), fallback[0], fallback[1], fallback[2], height);
      const minX = ext.gutter + height * 0.5 + 0.07;
      const maxX = PAGE_W - ext.outer - 0.05;
      let x = xWant < minX ? minX : xWant;
      if (x > maxX) x = maxX;
      const zMin = height - 1.45;
      let zz = z < zMin ? zMin : z;
      if (zz > 1.42) zz = 1.42;
      const stand = track(popup.standUp({
        side, x, z: zz, fold: 'back', width: ext.width, height,
      }));
      addProp(characterArt, paper, art, figures, stand.mount, id, height, ext);
    };
    stageProp('heart-stick', 'left', 1.5, 0.2, 2.48, [561, 959, 284]);
    stageProp('candle-table', 'left', 1.12, 0.98, 2.88, [765, 586, 388.5]);
    stageProp('envelope-pile', 'right', 1.15, 0.4, 1.88, [835, 597, 441.5]);
    stageProp('heart-balloons', 'right', 1.65, 0.22, 2.52, [672, 1024, 337.5]);
    stageProp('photo-booth-strip', 'right', 1.58, 0.52, 3.22, [367, 1024, 183.5]);
    stageProp('bouquet', 'right', 1.02, 1.05, 1.72, [687, 933, 341]);
    stageProp('confetti-cluster', 'right', 0.9, 1.12, 2.58, [769, 678, 399.5]);

    // ---------------------------------------------------------------- drifting hearts + the official-beat tumble (scaled away unless fully open)
    const bits = new THREE.Group();
    bits.name = 'bits';
    group.add(bits);
    const hearts = [];
    const confetti = [];
    buildBits(THREE, paper, rng, bits, hearts, confetti, C, officialAt);

    const pose = {
      hands: frameCards[0] || null,
      banter: frameCards[1] || null,
    };

    // Spread-frame aim for the couple cue: image centre of the hands drawing, not the feet pixel.
    const visualX = refMeta ? ((refMeta.w / 2) - refMeta.feet[0]) * (COUPLE_H / refMeta.h) : -0.2;
    const coupleAimX = -coupleX + visualX;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 1.4, at: [0, 0.8, 0], size: 7.5, from: 'front' },
        { t: calendarAt + 0.5, hold: 5, at: [0.08, 1.25, CAL_Z0], size: 4.4, from: 'front' },
        {
          t: alreadyAt + 0.2,
          hold: (spread.close - 1) - (alreadyAt + 0.2),
          at: [coupleAimX, 1.4, coupleZ],
          size: 3.1,
          from: 'front',
        },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const open = alpha > OPEN * Math.PI ? 1 : 0;
        const risen = popup.rise(alpha);

        const banter = t >= alreadyAt;
        if (pose.hands) pose.hands.visible = !banter;
        if (pose.banter) pose.banter.visible = banter;
        const pop = bump(t, alreadyAt);
        const breathe = 1 + Math.sin(t * 1.45) * 0.01;
        const sx = breathe * (1 - 0.06 * pop);
        const sy = breathe * (1 + 0.09 * pop);
        if (pose.hands) pose.hands.scale.set(sx, sy, 1);
        if (pose.banter) pose.banter.scale.set(sx, sy, 1);

        const sway = open ? Math.sin(t * 1.25) * 0.01 : 0;
        garRigL.rotation.z = sway;
        garRigR.rotation.z = -sway;

        const draw = smoothstep(officialAt, officialAt + 0.7, t);
        heart.mesh.geometry.setDrawRange(0, Math.floor(draw * heart.tris) * 3);

        let su = smoothstep(officialAt, officialAt + 0.32, t);
        let ss = ease.outBack(su);
        if (ss < 0) ss = 0;
        else if (ss > 1.06) ss = 1.06;
        stamp.scale.set(ss, ss, 1);

        poseDust(dust, t, officialAt, open);

        let hu = smoothstep(alreadyAt, alreadyAt + 0.3, t);
        let hs = ease.outBack(hu);
        if (hs < 0) hs = 0;
        else if (hs > 1.05) hs = 1.05;
        himBubble.scale.set(HIM_W * hs * open, HIM_H * hs * open, 1);

        let eu = smoothstep(herAt, herAt + 0.28, t);
        let es = ease.outBack(eu);
        if (es < 0) es = 0;
        else if (es > 1.05) es = 1.05;
        herBubble.scale.set(HER_W * es * open, HER_H * es * open, 1);

        bits.scale.setScalar(open);
        poseBits(hearts, confetti, t);

        glow.intensity = risen * (0.55 + 0.35 * smoothstep(officialAt, officialAt + 0.4, t));
      },
    };
  },
};

function letterCalendar(ctx, w, h, FONT, C) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const headerY = 83.5 / 817 * h;
  const monthFont = (size) => `${size}px ${FONT.display}`;
  const monthPx = fitSize(ctx, 'FEBRUARY', monthFont, Math.round(h * 0.09), w * 0.34);
  ctx.font = monthFont(monthPx);
  ctx.fillStyle = '#fff8ee';
  ctx.fillText('FEBRUARY', w * 0.27, headerY);

  const dayFont = (size) => `${size}px ${FONT.display}`;
  const dayPx = fitSize(ctx, '7', dayFont, Math.round(h * 0.42), w * 0.20);
  ctx.lineJoin = 'round';
  ctx.lineWidth = dayPx * 0.07;
  ctx.strokeStyle = C.cream;
  ctx.font = dayFont(dayPx);
  ctx.strokeText('7', w * 0.74, h * 0.43);
  ctx.fillStyle = '#c4373a';
  ctx.fillText('7', w * 0.74, h * 0.43);

  const yearFont = (size) => `700 ${size}px ${FONT.hand}`;
  const yearPx = fitSize(ctx, '2024', yearFont, Math.round(h * 0.09), w * 0.22);
  ctx.font = yearFont(yearPx);
  ctx.fillStyle = C.ink;
  ctx.fillText('2024', w * 0.74, h * 0.60);
  ctx.restore();
}

function pill(ctx, x, y, w, h, fill) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h * 0.45);
  ctx.fill();
  ctx.restore();
}

function letterRight(ctx, w, h, FONT, C) {
  ctx.save();
  // Above the caption band and clear of the stand-ups on the left page.
  const fx = w * 0.22;
  const fy = h * 0.64;
  const hand = (size) => `700 ${size}px ${FONT.hand}`;
  const fpx = fitSize(ctx, 'finally official!', hand, Math.round(h * 0.05), w * 0.42);
  ctx.font = hand(fpx);
  const fw = ctx.measureText('finally official!').width;
  pill(ctx, fx, fy, fw + fpx * 1.3, fpx * 1.65, 'rgba(246, 237, 217, 0.94)');
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = hand(fpx);
  ctx.fillText('finally official!', fx, fy + fpx * 0.06);

  // Lower, gutter side of the confetti cluster so the line stays in the open cream.
  const x = w * 0.34;
  const y = h * 0.90;
  const font = (size) => `700 ${size}px ${FONT.hand}`;
  const px = fitSize(ctx, 'relationship status', font, Math.round(h * 0.048), w * 0.30);
  ctx.font = font(px);
  const tw = ctx.measureText('relationship status').width;
  const box = px * 1.15;
  const total = tw + box * 1.5;
  pill(ctx, x, y, total + px, px * 2.1, 'rgba(246, 237, 217, 0.94)');
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(px);
  const textX = x - total / 2;
  ctx.fillText('relationship status', textX, y + px * 0.06);
  const bx = textX + tw + box * 0.85;
  const by = y;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(2.5, px * 0.08);
  ctx.strokeRect(bx - box / 2, by - box / 2, box, box);
  ctx.strokeStyle = C.tomato;
  ctx.lineWidth = Math.max(3, px * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(bx - box * 0.28, by + box * 0.02);
  ctx.lineTo(bx - box * 0.05, by + box * 0.28);
  ctx.lineTo(bx + box * 0.32, by - box * 0.26);
  ctx.stroke();
  ctx.restore();
}

function doodleFloor(ctx, w, h, rng, C, gutterRight) {
  const colors = [C.tomato, C.blush, C.mustard, C.sky, C.leaf];
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const x = gutterRight ? w * (0.12 + rng.next() * 0.82) : w * rng.next() * 0.86;
    const y = h * (0.06 + rng.next() * 0.88);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng.next() * 6);
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-12, -2, -6, -12, 0, -4);
    ctx.bezierCurveTo(6, -12, 12, -2, 0, 8);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Classic heart, t from the bottom point, a hand-drawn ribbon of triangles. Non-indexed. */
function heartRibbon(THREE, cx, cy, rx, ry, halfW, color) {
  const N = 52;
  const raw = [];
  let minX = 1e9;
  let maxX = -1e9;
  let minY = 1e9;
  let maxY = -1e9;
  for (let i = 0; i <= N; i++) {
    const t = Math.PI + (i / N) * Math.PI * 2;
    const s = Math.sin(t);
    const wob = 1 + 0.02 * Math.sin(i * 1.7);
    const x = 16 * s * s * s * wob;
    const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * wob;
    raw.push(x, y);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const sx = (rx * 2) / (maxX - minX);
  const sy = (ry * 2) / (maxY - minY);
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    pts.push(cx + (raw[i * 2] - mx) * sx, cy + (raw[i * 2 + 1] - my) * sy);
  }
  const pos = new Float32Array(N * 6 * 3);
  let p = 0;
  for (let i = 0; i < N; i++) {
    const x0 = pts[i * 2];
    const y0 = pts[i * 2 + 1];
    const x1 = pts[(i + 1) * 2];
    const y1 = pts[(i + 1) * 2 + 1];
    let tx = x1 - x0;
    let ty = y1 - y0;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty * halfW;
    const ny = tx * halfW;
    const quad = [
      x0 + nx, y0 + ny, 0,
      x0 - nx, y0 - ny, 0,
      x1 + nx, y1 + ny, 0,
      x0 - nx, y0 - ny, 0,
      x1 - nx, y1 - ny, 0,
      x1 + nx, y1 + ny, 0,
    ];
    for (let k = 0; k < quad.length; k++) pos[p++] = quad[k];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setDrawRange(0, 0);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    color, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, tris: N * 2 };
}

function stampMesh(THREE, paper, FONT, size) {
  const { canvas, ctx } = paper.makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#b4332c';
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f3d2a4';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 90, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff6e8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (px) => `${px}px ${FONT.display}`;
  const px = fitSize(ctx, 'OFFICIAL', font, 52, 150);
  ctx.font = font(px);
  ctx.fillText('OFFICIAL', 128, 134);
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(0);
  return mesh;
}

function dustPuffs(THREE, paper, cx, cy) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(246, 237, 217, 0.9)');
  g.addColorStop(1, 'rgba(246, 237, 217, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const geo = new THREE.PlaneGeometry(0.16, 0.16);
  const specs = [
    { ox: 0.16, oy: 0.08, dx: 0.22, dy: 0.1 },
    { ox: -0.14, oy: 0.1, dx: -0.2, dy: 0.12 },
    { ox: 0.05, oy: 0.16, dx: 0.06, dy: 0.22 },
    { ox: -0.02, oy: -0.12, dx: -0.04, dy: -0.16 },
  ];
  const out = [];
  for (let i = 0; i < specs.length; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'dust';
    mesh.castShadow = false;
    mesh.position.set(cx + specs[i].ox, cy + specs[i].oy, 0.008);
    mesh.scale.setScalar(0);
    out.push({ mesh, cx, cy, ...specs[i] });
  }
  return out;
}

function poseDust(dust, t, at, open) {
  const age = (t - at) / 0.48;
  const show = open && age > 0 && age < 1;
  for (let i = 0; i < dust.length; i++) {
    const d = dust[i];
    if (!show) {
      d.mesh.scale.setScalar(0);
      continue;
    }
    const k = 1 - age;
    d.mesh.position.set(d.cx + d.ox + d.dx * age, d.cy + d.oy + d.dy * age, 0.008);
    d.mesh.scale.setScalar(k * 0.9);
    d.mesh.material.opacity = k;
  }
}

function cropHalf(paper, src, side) {
  const hw = Math.floor(src.width / 2);
  const { canvas, ctx } = paper.makeCanvas(hw, src.height);
  const sx = side < 0 ? 0 : src.width - hw;
  ctx.drawImage(src, sx, 0, hw, src.height, 0, 0, hw, src.height);
  return canvas;
}

function fallbackGarland(paper, THREE, width, height, C, side) {
  const canvas = paper.paint(640, 180, (ctx, w, h) => {
    ctx.strokeStyle = '#c9a273';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(8, h * 0.35);
    ctx.lineTo(w - 8, h * 0.35);
    ctx.stroke();
    const colors = [C.tomato, C.blush, C.mustard, C.sky];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = w * ((i + 0.5) / n);
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.moveTo(x, h * 0.78);
      ctx.bezierCurveTo(x - 22, h * 0.4, x - 10, h * 0.22, x, h * 0.38);
      ctx.bezierCurveTo(x + 10, h * 0.22, x + 22, h * 0.4, x, h * 0.78);
      ctx.fill();
    }
  }, { dieCut: 4, seed: side < 0 ? 7 : 8, grain: 0.03 });
  const card = paper.card({ canvas, width, height, anchor: 'bottom-center' });
  card.name = side < 0 ? 'garland-fallback-left' : 'garland-fallback-right';
  return card;
}

function mountPost(characterArt, paper, art, figures, rig, height, garW, side) {
  let card = null;
  let ext = null;
  if (art && art.has && art.has('posts')) {
    card = characterArt.characterCard(paper, art, 'posts', { height });
    ext = extents(art.info('posts'), height);
    seat(card, ext);
  } else if (figures && figures.figureCard) {
    try {
      card = paper.card({
        canvas: paper.paint(80, 360, (ctx, w, h) => {
          ctx.fillStyle = '#c9a273';
          ctx.fillRect(w * 0.28, 8, w * 0.44, h - 16);
          ctx.fillStyle = '#a9814f';
          ctx.beginPath();
          ctx.arc(w * 0.5, h * 0.16, w * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }, { dieCut: 4, seed: 9, grain: 0.04 }),
        width: height * (80 / 360),
        height,
        anchor: 'bottom-center',
      });
    } catch {
      card = null;
    }
  }
  if (!card) return;
  card.name = side < 0 ? 'post-left' : 'post-right';
  const reach = ext ? Math.max(-ext.minX, ext.maxX) : height * 0.12;
  const edge = garW / 2 - reach - 0.03;
  card.position.x = side < 0 ? -edge : edge;
  if (!ext) card.position.y = 0.02;
  card.position.z = 0.01;
  rig.add(card);
}

/** Right-page gutter reach is −minX (local −X points at the gutter). Left page is the opposite. */
function propExtents(meta, w, h, feetX, height) {
  if (meta) {
    const e = extents(meta, height);
    return { gutter: -e.minX, outer: e.maxX, width: e.width, top: e.top, dip: e.dip, known: true };
  }
  const width = height * (w / h);
  const gutter = (feetX / w) * width;
  return { gutter, outer: width - gutter, width, top: height - SEAT, dip: 0.02, known: false };
}

function addProp(characterArt, paper, art, figures, mount, id, height, ext) {
  if (art && art.has && art.has(id)) {
    const card = characterArt.characterCard(paper, art, id, { height });
    if (!card) return;
    const meta = art.info(id);
    card.position.y = (meta.h - meta.feet[1]) * (height / meta.h) - SEAT;
    card.name = id;
    mount.add(card);
    return;
  }
  // Quiet stand-in so a missing drawing still occupies the mechanism.
  const canvas = paper.paint(Math.round(180 * (ext.width / height)), 180, (ctx, w, h) => {
    ctx.fillStyle = '#f6edd9';
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = '#e2574c';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, w - 28, h - 28);
  }, { dieCut: 4, seed: 11, grain: 0.04 });
  const card = paper.card({ canvas, width: ext.width, height, anchor: 'bottom-center' });
  card.position.y = 0;
  card.name = id;
  mount.add(card);
}

function speechBubble(THREE, paper, FONT, C, spec) {
  const { canvas, ctx } = paper.makeCanvas(spec.w, spec.h);
  ctx.clearRect(0, 0, spec.w, spec.h);
  const m = 18;
  const bodyH = spec.h - 54;
  ctx.fillStyle = '#fffaf3';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(m, m, spec.w - m * 2, bodyH, 36);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  if (spec.tail === 'left') {
    ctx.moveTo(spec.w * 0.28, m + bodyH - 2);
    ctx.lineTo(spec.w * 0.18, spec.h - 10);
    ctx.lineTo(spec.w * 0.46, m + bodyH - 2);
  } else {
    ctx.moveTo(spec.w * 0.54, m + bodyH - 2);
    ctx.lineTo(spec.w * 0.78, spec.h - 10);
    ctx.lineTo(spec.w * 0.70, m + bodyH - 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = spec.w / 2;
  const cy = m + bodyH / 2;
  for (let i = 0; i < spec.lines.length; i++) {
    const line = spec.lines[i];
    const family = line.font === 'display' ? FONT.display : FONT.hand;
    const weight = line.font === 'hand' ? '700 ' : '';
    const font = (px) => `${weight}${px}px ${family}`;
    const px = fitSize(ctx, line.text, font, Math.round(bodyH * line.px * 2.1), spec.w - m * 4);
    ctx.font = font(px);
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, cx, cy + line.dy * bodyH);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(0);
  return mesh;
}

function buildBits(THREE, paper, rng, parent, hearts, confetti, C, at) {
  const heart = heartTex(paper);
  const hGeo = new THREE.PlaneGeometry(0.11, 0.11);
  const spots = [
    { x: -2.55, z: -0.35 },
    { x: -1.35, z: 0.45 },
    { x: -0.25, z: -0.55 },
    { x: 0.85, z: 0.35 },
    { x: 1.85, z: -0.25 },
    { x: 2.7, z: 0.5 },
  ];
  for (let i = 0; i < spots.length; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: heart, transparent: true, depthWrite: false, toneMapped: false,
      color: i % 2 ? C.blush : C.tomato,
    });
    const mesh = new THREE.Mesh(hGeo, mat);
    mesh.name = 'drift-heart';
    mesh.castShadow = false;
    parent.add(mesh);
    hearts.push({
      mesh,
      x: spots[i].x,
      z: spots[i].z,
      phase: i * 1.37,
      y0: 0.55 + (i % 3) * 0.12,
    });
  }

  const geo = new THREE.PlaneGeometry(0.05, 0.075);
  const colors = [C.tomato, C.mustard, C.sky, C.blush, C.cream, C.leaf];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length], side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'confetti';
    mesh.castShadow = false;
    const y0 = 0.95 + rng.next() * 0.25;
    const vy = 1.15 + rng.next() * 0.45;
    const g = 2.6;
    const T = (vy + Math.sqrt(vy * vy + 2 * g * (y0 - 0.08))) / g;
    const x0 = -0.5 + rng.next() * 1.6;
    const z0 = -0.15 + rng.next() * 0.7;
    let vx = (rng.next() - 0.5) * 0.85;
    let vz = (rng.next() - 0.5) * 0.4;
    let x1 = x0 + vx * T;
    let z1 = z0 + vz * T;
    if (x1 < -3.15 || x1 > 3.15) vx = (clamp(x1, -3.15, 3.15) - x0) / T;
    if (z1 < -1.3 || z1 > 1.3) vz = (clamp(z1, -1.3, 1.3) - z0) / T;
    x1 = x0 + vx * T;
    z1 = z0 + vz * T;
    parent.add(mesh);
    confetti.push({
      mesh, x0, z0, y0, vx, vz, vy, g, T,
      x1, z1,
      delay: rng.next() * 0.28,
      spin: (rng.next() - 0.5) * 5,
      rot: rng.next() * Math.PI,
      at,
    });
  }
}

function heartTex(paper) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(32, 54);
  ctx.bezierCurveTo(4, 36, 6, 14, 22, 14);
  ctx.bezierCurveTo(30, 14, 32, 22, 32, 22);
  ctx.bezierCurveTo(32, 22, 34, 14, 42, 14);
  ctx.bezierCurveTo(58, 14, 60, 36, 32, 54);
  ctx.fill();
  return paper.texture(canvas);
}

function poseBits(hearts, confetti, t) {
  for (let i = 0; i < hearts.length; i++) {
    const p = hearts[i];
    const y = p.y0 + (0.5 + 0.5 * Math.sin(t * 0.32 + p.phase)) * 0.5;
    p.mesh.position.set(
      p.x + Math.sin(t * 0.55 + p.phase) * 0.16,
      y,
      p.z + Math.cos(t * 0.4 + p.phase) * 0.08,
    );
    p.mesh.rotation.z = Math.sin(t * 0.7 + p.phase) * 0.35;
  }
  for (let i = 0; i < confetti.length; i++) {
    const p = confetti[i];
    const age = t - p.at - p.delay;
    const mesh = p.mesh;
    if (age <= 0) {
      mesh.position.set(p.x0, 0.08, p.z0);
      mesh.rotation.z = p.rot;
      mesh.scale.setScalar(0);
      continue;
    }
    mesh.scale.setScalar(1);
    if (age < p.T) {
      const y = p.y0 + p.vy * age - 0.5 * p.g * age * age;
      mesh.position.set(p.x0 + p.vx * age, y > 0.08 ? y : 0.08, p.z0 + p.vz * age);
      mesh.rotation.z = p.rot + p.spin * age;
    } else {
      mesh.position.set(p.x1, 0.08, p.z1);
      mesh.rotation.z = p.rot + p.spin * p.T;
    }
  }
}
