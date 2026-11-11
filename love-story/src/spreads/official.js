// Spread 5 — "February 7, 2024". Official, the banter, school and work, the first kiss.
// Times come from timeline.BEATS / SPREADS / NARRATION. Every on-screen word goes through L().
// Drawings: official-hands, official-banter, school-couple, vest-chat, first-kiss,
// and love-story/art/official/ (calendar, heart-arch, valentine-cards, garland, props).
// update() allocates nothing. Anything that is not a folding stand-up or the calendar
// stays collapsed unless the spread is fully open, so a turning page never carries it out.
import { L } from '../i18n.js';
import { PAGE_W } from '../dims.js';

const CAL_H = 2.26;
const CAL_WIDE = 1.12;
const CAL_GAMMA = 1.66;
const CAL_Z0 = -0.86;
const COUPLE_H = 1.64;
const KISS_H = 1.66;
const ARCH_H = 1.74;
const VIGNETTE_H = 1.22;
const OPEN = 0.985;
const SEAT = 0.012;
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
  if (w > maxW && w > 0) size *= maxW / w;
  return size;
}

function extents(meta, height) {
  const s = height / meta.h;
  return {
    s,
    minX: -meta.feet[0] * s,
    maxX: (meta.w - meta.feet[0]) * s,
    dip: (meta.h - meta.feet[1]) * s,
    width: meta.w * s,
  };
}

/** Plane bottom near the hinge. Feet sit up by the transparent padding under them. */
function seatStand(card, meta, height) {
  card.position.y = (meta.h - meta.feet[1]) * (height / meta.h) - SEAT;
}

export default {
  id: 'official',
  title: L('February 7, 2024', '7 de febrero de 2024'),
  build(ctx) {
    const { THREE, paper, popup, rng, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, NARRATION, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'official');
    const kissLine = NARRATION.find((n) => n.id === 'o4');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'official';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const hasPose = (id) => !!(characters && characters.has && characters.has(id));

    const calendarAt = BEATS.calendar;
    const officialAt = BEATS.official;
    const alreadyAt = BEATS.alreadyDating;
    const schoolAt = BEATS.schoolTogether;
    const workAt = BEATS.workTogether;
    const kissAt = BEATS.firstKiss;
    const herAt = alreadyAt + 1.15;
    const kissHoldEnd = Math.min(kissLine ? kissLine.end : spread.close - 1.2, spread.close - 0.55);

    // ---------------------------------------------------------------- pages
    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const left = cloneCanvas(paper, art.canvas('page-left'));
      letterLeft(left.ctx, left.canvas.width, left.canvas.height, FONT, C);
      leftArt = left.canvas;
      const right = cloneCanvas(paper, art.canvas('page-right'));
      letterRight(right.ctx, right.canvas.width, right.canvas.height, FONT, C);
      rightArt = right.canvas;
    } else {
      leftArt = paper.page((c, w, h) => {
        doodleFloor(c, w, h, rng, C, false);
        letterLeft(c, w, h, FONT, C);
      }, { seed: 3, tint: '#f7dcd6' });
      rightArt = paper.page((c, w, h) => {
        doodleFloor(c, w, h, rng, C, true);
        letterRight(c, w, h, FONT, C);
      }, { seed: 4, tint: C.cream });
    }

    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };

    // ---------------------------------------------------------------- calendar (mountain V, faces the reader)
    const calInfo = info('calendar');
    const calW = CAL_H * ((calInfo ? calInfo.w : 789) / (calInfo ? calInfo.h : 817)) * CAL_WIDE;
    const calendar = track(popup.vFold({ z0: CAL_Z0, gamma: CAL_GAMMA, width: calW, height: CAL_H }));

    const paintSheet = (mode) => {
      let canvas;
      if (calInfo) {
        const painted = cloneCanvas(paper, art.canvas('calendar'));
        letterCalendar(painted.ctx, painted.canvas.width, painted.canvas.height, FONT, C, mode);
        canvas = paper.dieCut(painted.canvas, { margin: 6 });
      } else {
        canvas = paper.paint(789, 817, (c, w, h) => {
          c.fillStyle = C.cream;
          c.fillRect(8, 8, w - 16, h - 16);
          c.fillStyle = C.tomato;
          c.fillRect(8, 8, w - 16, h * 0.15);
          letterCalendar(c, w, h, FONT, C, mode);
        }, { dieCut: 6, seed: mode === 'seven' ? 3 : 4, grain: 0.04 });
      }
      return paper.splitCard({ canvas, width: calW, height: CAL_H });
    };

    const under = paintSheet('fourteen');
    under.left.name = 'sheet14-left';
    under.right.name = 'sheet14-right';
    calendar.left.add(under.left);
    calendar.right.add(under.right);

    const top = paintSheet('seven');
    const sheetL = new THREE.Group();
    const sheetR = new THREE.Group();
    sheetL.name = 'sheet7-left';
    sheetR.name = 'sheet7-right';
    sheetL.position.z = 0.012;
    sheetR.position.z = 0.012;
    sheetL.add(top.left);
    sheetR.add(top.right);
    calendar.left.add(sheetL);
    calendar.right.add(sheetR);

    const dayX = (0.74 - 0.5) * calW;
    const dayY = (1 - 0.46) * CAL_H;
    const heart = heartRibbon(THREE, dayX, dayY, 0.36, 0.48, 0.026, '#b4232c');
    heart.mesh.position.z = 0.008;
    heart.mesh.name = 'heart-circle';
    sheetR.add(heart.mesh);

    const stampX = (0.30 - 0.5) * calW;
    const stampY = (1 - 0.58) * CAL_H;
    const STAMP = 0.5;
    const stamp = stampMesh(THREE, paper, FONT, STAMP);
    stamp.position.set(stampX, stampY, 0.008);
    stamp.name = 'stamp';
    sheetL.add(stamp);
    // Dust is parented to the stamp so a closed page collapses it to the stamp centre.
    const dust = dustPuffs(THREE, paper);
    for (let i = 0; i < dust.length; i++) stamp.add(dust[i].mesh);

    // Garland hangs above the calendar. It is a free card: scale 0 keeps it on the
    // right page until the book is open, then it swings up over the kiss.

    // ---------------------------------------------------------------- the couple, left page, in front of the calendar
    const refMeta = hasPose(POSES[0]) ? characters.info(POSES[0]) : null;
    const banterMeta = hasPose(POSES[1]) ? characters.info(POSES[1]) : null;
    let gutterReach = 0.24;
    if (refMeta) {
      const a = extents(refMeta, COUPLE_H);
      const b = banterMeta ? extents(banterMeta, COUPLE_H) : a;
      gutterReach = Math.max(a.maxX, b.maxX);
    }
    const popScale = 1.08;
    const coupleX = gutterReach * popScale + COUPLE_H * popScale * 0.5 + 0.1;
    const coupleZ = 0.76;
    const couple = track(popup.standUp({
      side: 'left', x: coupleX, z: coupleZ, fold: 'back',
      width: gutterReach * 2, height: COUPLE_H,
    }));
    const coupleWrap = new THREE.Group();
    coupleWrap.name = 'couple';
    couple.mount.add(coupleWrap);

    const frameCards = [];
    if (refMeta) {
      const flip = characterArt.characterFlip(paper, characters, POSES, { height: COUPLE_H });
      coupleWrap.add(flip.group);
      const ref = characters.info(POSES[0]);
      for (let i = 0; i < flip.group.children.length && i < POSES.length; i++) {
        const card = flip.group.children[i];
        const meta = characters.info(POSES[i]);
        const s = COUPLE_H / ref.h;
        card.position.y = (meta.h - meta.feet[1]) * s - SEAT;
        card.name = POSES[i];
        frameCards.push(card);
      }
    } else {
      const rig = new THREE.Group();
      rig.name = 'couple-fallback';
      coupleWrap.add(rig);
      const add = (who, pose, x, facing) => {
        let card = null;
        try {
          card = figures.figureCard(paper, who, { outfit: 'casual', pose, facing, scale: 1.1 });
        } catch {
          card = null;
        }
        if (!card) return null;
        card.position.x = x;
        card.name = `${who}-${pose}`;
        rig.add(card);
        return card;
      };
      frameCards.push(add('her', 'holdHandsL', -0.32, 'right'), add('him', 'holdHandsR', 0.18, 'left'));
    }

    const himText = L('I thought we were\nalready dating!', '¡Yo creía que\nya éramos novios!').split('\n');
    const herText = L('…sure.', '…ajá.');
    const himBubble = speechBubble(THREE, paper, FONT, C, {
      w: 760, h: 340,
      lines: [
        { text: himText[0] || '', font: 'hand', px: 0.20, color: C.ink, dy: -0.2 },
        { text: himText[1] || '', font: 'display', px: 0.18, color: C.tomato, dy: 0.2 },
      ],
      tail: 'right',
    });
    // Bubbles live in a rig at the feet. Scaling the rig (not the bubble) collapses
    // them onto the hinge, which stays inside the page while it turns.
    // His bubble sits left of the calendar so FEBRUARY stays readable.
    const bubbleRig = new THREE.Group();
    bubbleRig.name = 'bubbles';
    coupleWrap.add(bubbleRig);
    himBubble.name = 'bubble-him';
    himBubble.position.set(-0.52, 2.14, 0.03);
    himBubble.scale.set(1.08, 0.50, 1);
    bubbleRig.add(himBubble);

    const herBubble = speechBubble(THREE, paper, FONT, C, {
      w: 380, h: 200,
      lines: [{ text: herText, font: 'hand', px: 0.42, color: C.ink, dy: 0.02 }],
      tail: 'right',
    });
    herBubble.name = 'bubble-her';
    herBubble.position.set(-1.18, 1.92, 0.03);
    herBubble.scale.set(0.58, 0.30, 1);
    bubbleRig.add(herBubble);

    // ---------------------------------------------------------------- vignettes (scale 0 until their beat; the stand-up still folds flat)
    const school = stageActor(track, popup, characterArt, paper, characters, figures, {
      id: 'school-couple', height: VIGNETTE_H, side: 'left', x: 2.82, z: 0.18,
      tag: L('school together', 'a la escuela juntos'),
      fallback: { who: 'her', outfit: 'school', pose: 'stand', facing: 'right' },
      THREE, FONT, C,
    });
    const work = stageActor(track, popup, characterArt, paper, characters, figures, {
      id: 'vest-chat', height: VIGNETTE_H, side: 'right', x: 2.48, z: 0.7,
      tag: L('work together', 'al trabajo juntos'),
      fallback: { who: 'him', outfit: 'vest', pose: 'stand', facing: 'left' },
      THREE, FONT, C,
    });

    // ---------------------------------------------------------------- props, both pages
    const stageProp = (id, side, height, z, xWant, fallback) => {
      const meta = info(id);
      const e = meta ? extents(meta, height) : null;
      const toward = e ? (side === 'left' ? e.maxX : -e.minX) : height * 0.45;
      const away = e ? (side === 'left' ? -e.minX : e.maxX) : height * 0.45;
      const minX = toward + height * 0.5 + 0.08;
      const maxX = PAGE_W - away - 0.05;
      let x = xWant < minX ? minX : xWant;
      if (x > maxX) x = maxX;
      const zMin = height - 1.46;
      let zz = z < zMin ? zMin : z;
      if (zz > 1.4) zz = 1.4;
      const stand = track(popup.standUp({
        side, x, z: zz, fold: 'back', width: (e ? e.width : height), height,
      }));
      const wrap = new THREE.Group();
      wrap.name = id;
      stand.mount.add(wrap);
      if (meta) {
        const card = characterArt.characterCard(paper, art, id, { height });
        if (card) {
          seatStand(card, meta, height);
          card.name = id;
          wrap.add(card);
        }
      } else {
        wrap.add(fallbackProp(paper, id, e ? e.width : height * 0.8, height));
      }
      return wrap;
    };
    stageProp('heart-stick', 'left', 1.38, 0.02, 3.12, null);
    stageProp('candle-table', 'left', 0.98, 1.18, 3.05, null);
    const valentine = stageProp('valentine-cards', 'left', 0.56, 1.32, 1.9, null);
    stageProp('envelope-pile', 'right', 1.02, 0.28, 1.72, null);
    stageProp('heart-balloons', 'right', 1.48, 0.04, 3.12, null);
    stageProp('photo-booth-strip', 'right', 1.32, 0.48, 3.38, null);
    stageProp('bouquet', 'right', 0.9, 1.22, 1.42, null);
    stageProp('confetti-cluster', 'right', 0.72, 1.28, 2.35, null);

    // ---------------------------------------------------------------- kiss hero + heart arch (spread-space; collapsed unless fully open)
    // Collapsed origin stays on the right page (a point near the gutter fails the
    // closed-book angle test). The drawing itself is shifted back toward centre.
    const kissWrap = new THREE.Group();
    kissWrap.name = 'first-kiss';
    // Collapsed origin stays on the right page. The drawing is shifted so its
    // centre sits under the heart arch, in front of it.
    kissWrap.position.set(0.55, 0.02, 0.96);
    group.add(kissWrap);
    const kissCard = mountFree(kissWrap, characterArt, paper, characters, figures, 'first-kiss', KISS_H, {
      who: 'her', outfit: 'casual', pose: 'stand', facing: 'right',
    });
    const kissMeta = hasPose('first-kiss') ? characters.info('first-kiss') : null;
    const archCenterX = 0.04;
    let kissFeetX = archCenterX;
    if (kissMeta) {
      const s = KISS_H / kissMeta.h;
      kissFeetX = archCenterX - ((kissMeta.w / 2) - kissMeta.feet[0]) * s;
    }
    if (kissCard) kissCard.position.x = kissFeetX - 0.55;

    const archWrap = new THREE.Group();
    archWrap.name = 'heart-arch';
    archWrap.position.set(0.55, 0.02, 0.26);
    group.add(archWrap);
    if (has('heart-arch')) {
      const card = characterArt.characterCard(paper, art, 'heart-arch', { height: ARCH_H });
      if (card) {
        const meta = art.info('heart-arch');
        const pad = (meta.h - meta.feet[1]) * (ARCH_H / meta.h);
        card.position.set(0.04 - 0.55, Math.max(0, pad - 0.03), 0);
        card.name = 'heart-arch';
        archWrap.add(card);
      }
    }

    const GAR_SHOW = 0.52;
    const garWrap = new THREE.Group();
    garWrap.name = 'garland';
    garWrap.position.set(0.55, 0.02, 0.42);
    group.add(garWrap);
    if (has('garland')) {
      const card = characterArt.characterCard(paper, art, 'garland', { height: GAR_SHOW });
      if (card) {
        const meta = art.info('garland');
        const s = GAR_SHOW / meta.h;
        const pad = (meta.h - meta.feet[1]) * s;
        const centre = ((meta.w / 2) - meta.feet[0]) * s;
        card.position.set(-centre - 0.55, 2.82 + pad, 0);
        card.name = 'garland';
        garWrap.add(card);
      }
    }

    // Far and weak, so the kiss drawing keeps its own colours. A light parked
    // on the card washed the upper bodies out to white.
    const glow = new THREE.PointLight('#ffd0c4', 0, 14, 2);
    glow.name = 'official-glow';
    glow.castShadow = false;
    glow.position.set(0.15, 3.7, -1.85);
    group.add(glow);

    const bits = new THREE.Group();
    bits.name = 'bits';
    group.add(bits);
    const hearts = [];
    const confetti = [];
    buildBits(THREE, paper, rng, bits, hearts, confetti, C, officialAt);

    const pose = { hands: frameCards[0] || null, banter: frameCards[1] || null };
    const visual = refMeta ? ((refMeta.w / 2) - refMeta.feet[0]) * (COUPLE_H / refMeta.h) : -0.2;
    const coupleAimX = -coupleX + visual;
    const kissAimX = archCenterX;
    const kissArrive = kissAt + 0.38;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 1.0, at: [0, 0.85, 0], size: 7.5, from: 'front' },
        { t: calendarAt + 0.35, hold: 2.15, at: [0.4, 1.22, -0.45], size: 3.7, from: 'front' },
        { t: officialAt + 0.28, hold: 2.45, at: [coupleAimX, 1.12, coupleZ], size: 2.35, from: 'front' },
        { t: alreadyAt + 0.3, hold: 3.7, at: [coupleAimX, 1.42, coupleZ], size: 2.55, from: 'front' },
        {
          t: schoolAt + 0.28,
          hold: 1.55,
          at: [-school.x + 0.42, 1.02, school.z],
          size: 1.9,
          from: 'front',
        },
        {
          t: workAt + 0.28,
          hold: 2.05,
          at: [work.x - 0.28, 1.02, work.z],
          size: 1.9,
          from: 'front',
        },
        {
          t: kissArrive,
          hold: Math.max(1.2, kissHoldEnd - kissArrive),
          at: [kissAimX, 1.02, 0.84],
          size: 2.2,
          from: 'front',
        },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const gate = alpha > OPEN * Math.PI ? 1 : 0;
        const risen = popup.rise(alpha);

        const banter = t >= alreadyAt;
        if (pose.hands) pose.hands.visible = !banter;
        if (pose.banter) pose.banter.visible = banter;
        const pop = bump(t, alreadyAt);
        const breathe = 1 + Math.sin(t * 1.45) * 0.012;
        const hop = gate * bump(t, calendarAt);
        const sx = breathe * (1 - 0.05 * pop);
        const sy = breathe * (1 + 0.08 * pop + 0.05 * hop);
        if (pose.hands) pose.hands.scale.set(sx, sy, 1);
        if (pose.banter) pose.banter.scale.set(sx, sy, 1);
        coupleWrap.position.y = gate * hop * 0.06;
        // One hero at a time: the earlier couple folds away just before the kiss.
        let away = smoothstep(kissAt - 0.58, kissAt + 0.02, t);
        away = away * away;
        const live = gate * (1 - away);
        coupleWrap.scale.set(live, live, live > 0 ? 1 : 0);

        const sway = gate * Math.sin(t * 1.25) * 0.012;
        posePop(garWrap, t, kissAt + 0.05, 0.55, gate, ease);
        garWrap.rotation.z = sway;
        if (valentine) {
          valentine.position.y = 0.045;
          valentine.rotation.z = gate * Math.sin(t * 1.15) * 0.018;
        }

        const draw = smoothstep(officialAt, officialAt + 0.75, t);
        heart.mesh.geometry.setDrawRange(0, Math.floor(draw * heart.tris) * 3);
        let su = smoothstep(officialAt, officialAt + 0.32, t);
        let ss = ease.outBack(su);
        if (ss < 0) ss = 0;
        else if (ss > 1.06) ss = 1.06;
        stamp.scale.set(ss * gate, ss * gate, 1);
        poseDust(dust, t, officialAt, gate);
        poseSheet(sheetL, t, kissAt, gate, -1);
        poseSheet(sheetR, t, kissAt, gate, 1);

        const talkFade = 1 - smoothstep(schoolAt - 0.85, schoolAt - 0.15, t);
        bubbleRig.scale.setScalar(gate * talkFade * bubblePop(t, alreadyAt, herAt, ease));

        posePop(school.wrap, t, schoolAt, 0.36, gate, ease);
        posePop(work.wrap, t, workAt, 0.36, gate, ease);
        if (school.wrap) school.wrap.position.y = gate * Math.sin(t * 1.7 + 0.4) * 0.01;
        if (work.wrap) work.wrap.position.y = gate * Math.sin(t * 1.55 + 1.2) * 0.01;

        posePop(archWrap, t, kissAt - 0.08, 0.42, gate, ease);
        posePop(kissWrap, t, kissAt - 0.02, 0.46, gate, ease);
        const kissBreathe = 1 + gate * Math.sin(t * 1.3) * 0.012;
        if (kissWrap.scale.x > 0.2) kissWrap.scale.multiplyScalar(kissBreathe);

        bits.scale.setScalar(gate);
        poseBits(hearts, confetti, t, officialAt, kissAt, alreadyAt, schoolAt);

        const rose = smoothstep(kissAt, kissAt + 0.7, t);
        const warm = smoothstep(officialAt, officialAt + 0.45, t);
        glow.color.r = 1;
        glow.color.g = 0.84 - 0.06 * rose;
        glow.color.b = 0.78 - 0.06 * rose;
        glow.intensity = risen * (1.6 + 1.1 * warm + 1.4 * rose);
      },
    };
  },
};

/** One rig scale for both bubbles: his pops first, hers a beat later, neither past 1.06. */
function bubblePop(t, himAt, herAt, ease) {
  const pop = (at, dur) => {
    let u = (t - at) / dur;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
    u = u * u * (3 - 2 * u);
    let s = ease.outBack(u);
    if (s < 0) s = 0;
    else if (s > 1.06) s = 1.06;
    return s;
  };
  const him = pop(himAt, 0.32);
  const her = pop(herAt, 0.3);
  return him > her ? him : her;
}

function posePop(wrap, t, at, dur, gate, ease) {
  if (!wrap) return;
  let u = (t - at) / dur;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  u = u * u * (3 - 2 * u);
  let s = ease.outBack(u);
  if (s < 0) s = 0;
  else if (s > 1.07) s = 1.07;
  wrap.scale.set(s * gate, s * gate, 1);
}

function poseSheet(group, t, at, gate, side) {
  if (!gate || t < at) {
    group.position.set(0, 0, 0.012);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
    return;
  }
  let u = (t - at) / 0.7;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  const lift = u * u * (3 - 2 * u);
  const flutter = Math.sin(u * Math.PI) * (1 - u);
  group.position.set(side * 0.42 * lift, 1.05 * lift + flutter * 0.05, 0.012 + 0.28 * lift);
  group.rotation.set(0.4 * lift, 0, side * -0.22 * lift);
  let shrink = 1 - lift;
  if (shrink < 0.02) shrink = 0.02;
  group.scale.set(shrink, shrink, 1);
}

function letterCalendar(ctx, w, h, FONT, C, mode) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const month = L('FEBRUARY', 'FEBRERO');
  const headerY = 0.102 * h;
  const monthFont = (size) => `${size}px ${FONT.display}`;
  const monthPx = fitSize(ctx, month, monthFont, Math.round(h * 0.085), w * 0.36);
  ctx.font = monthFont(monthPx);
  ctx.fillStyle = '#fff8ee';
  ctx.fillText(month, w * 0.27, headerY);

  const day = mode === 'seven' ? '7' : '14';
  const dayY = mode === 'seven' ? 0.46 : 0.27;
  const dayX = mode === 'seven' ? 0.74 : 0.86;
  if (mode === 'fourteen') paintHeart(ctx, w * dayX, h * dayY, h * 0.16, h * 0.15);
  const dayFont = (size) => `${size}px ${FONT.display}`;
  const dayPx = fitSize(ctx, day, dayFont, Math.round(h * (mode === 'seven' ? 0.40 : 0.26)), w * 0.28);
  ctx.lineJoin = 'round';
  ctx.lineWidth = dayPx * 0.07;
  ctx.strokeStyle = C.cream;
  ctx.font = dayFont(dayPx);
  ctx.strokeText(day, w * dayX, h * dayY);
  ctx.fillStyle = '#c4373a';
  ctx.fillText(day, w * dayX, h * dayY);

  if (mode === 'seven') {
    const yearFont = (size) => `700 ${size}px ${FONT.hand}`;
    const yearPx = fitSize(ctx, '2024', yearFont, Math.round(h * 0.085), w * 0.22);
    ctx.font = yearFont(yearPx);
    ctx.fillStyle = C.ink;
    ctx.fillText('2024', w * 0.74, h * 0.62);
  } else {
    // In the red header, right half, so the arch does not cover the phrase.
    const phrase = L("Valentine's Day", 'Día de San Valentín');
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const px = fitSize(ctx, phrase, font, Math.round(h * 0.055), w * 0.40);
    ctx.font = font(px);
    ctx.fillStyle = '#fff8ee';
    ctx.fillText(phrase, w * 0.76, headerY);
  }
  ctx.restore();
}

function paintHeart(ctx, x, y, rx, ry) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#e2574c';
  ctx.beginPath();
  ctx.moveTo(0, ry);
  ctx.bezierCurveTo(-rx, ry * 0.35, -rx, -ry * 0.35, 0, -ry * 0.15);
  ctx.bezierCurveTo(rx, -ry * 0.35, rx, ry * 0.35, 0, ry);
  ctx.fill();
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

function letterLeft(ctx, w, h, FONT, C) {
  // Far edge, left of the couple and clear of the school card's shadow.
  const text = L('finally official!', '¡por fin oficial!');
  paintFloorLine(ctx, w, h, FONT, C, text, w * 0.40, h * 0.085, w * 0.46);
}

function letterRight(ctx, w, h, FONT, C) {
  // Far edge of the right page, beside the bouquet rather than under it.
  const text = L('relationship status: ✓ taken', 'estado: ✓ en una relación');
  paintFloorLine(ctx, w, h, FONT, C, text, w * 0.58, h * 0.085, w * 0.62);
}

function paintFloorLine(ctx, w, h, FONT, C, text, x, y, maxW) {
  ctx.save();
  const hand = (size) => `700 ${size}px ${FONT.hand}`;
  const words = text.split(' ');
  let lines = [text];
  let px = fitSize(ctx, text, hand, Math.round(h * 0.052), maxW);
  ctx.font = hand(px);
  if (ctx.measureText(text).width > maxW && words.length > 2) {
    let best = 1;
    let bestD = 1e9;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const d = Math.abs(a.length - b.length);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    px = Math.min(
      fitSize(ctx, lines[0], hand, Math.round(h * 0.048), maxW),
      fitSize(ctx, lines[1], hand, Math.round(h * 0.048), maxW),
    );
  }
  ctx.font = hand(px);
  let widest = 0;
  for (let i = 0; i < lines.length; i++) {
    const tw = ctx.measureText(lines[i]).width;
    if (tw > widest) widest = tw;
  }
  const lineH = px * 1.15;
  const blockH = lineH * lines.length;
  pill(ctx, x, y, widest + px * 1.35, blockH + px * 0.55, 'rgba(246, 237, 217, 0.94)');
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = hand(px);
  const y0 = y - blockH / 2 + lineH / 2;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y0 + i * lineH + px * 0.04);
  ctx.restore();
  void w;
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

function heartRibbon(THREE, cx, cy, rx, ry, halfW, color) {
  const N = 48;
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
  for (let i = 0; i <= N; i++) pts.push(cx + (raw[i * 2] - mx) * sx, cy + (raw[i * 2 + 1] - my) * sy);
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
      x0 + nx, y0 + ny, 0, x0 - nx, y0 - ny, 0, x1 + nx, y1 + ny, 0,
      x0 - nx, y0 - ny, 0, x1 - nx, y1 - ny, 0, x1 + nx, y1 + ny, 0,
    ];
    for (let k = 0; k < quad.length; k++) pos[p++] = quad[k];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setDrawRange(0, 0);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, side: THREE.DoubleSide, toneMapped: false,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, tris: N * 2 };
}

function stampMesh(THREE, paper, FONT, size) {
  const word = L('OFFICIAL', 'OFICIAL');
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
  const px = fitSize(ctx, word, font, 48, 158);
  ctx.font = font(px);
  ctx.fillText(word, 128, 134);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: paper.texture(canvas), transparent: true, alphaTest: 0.45,
    side: THREE.DoubleSide, toneMapped: false,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(0);
  return mesh;
}

function dustPuffs(THREE, paper) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(246, 237, 217, 0.9)');
  g.addColorStop(1, 'rgba(246, 237, 217, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas), transparent: true, depthWrite: false, toneMapped: false,
  });
  const geo = new THREE.PlaneGeometry(0.14, 0.14);
  const specs = [
    { ox: 0.15, oy: 0.07, dx: 0.2, dy: 0.1 },
    { ox: -0.13, oy: 0.09, dx: -0.18, dy: 0.11 },
    { ox: 0.04, oy: 0.15, dx: 0.05, dy: 0.18 },
  ];
  const out = [];
  for (let i = 0; i < specs.length; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'dust';
    mesh.castShadow = false;
    mesh.position.set(specs[i].ox, specs[i].oy, 0.002);
    mesh.scale.setScalar(0);
    out.push({ mesh, ...specs[i] });
  }
  return out;
}

function poseDust(dust, t, at, gate) {
  const age = (t - at) / 0.48;
  const show = gate && age > 0 && age < 1;
  for (let i = 0; i < dust.length; i++) {
    const d = dust[i];
    if (!show) {
      d.mesh.scale.setScalar(0);
      continue;
    }
    const k = 1 - age;
    d.mesh.position.set(d.ox + d.dx * age, d.oy + d.dy * age, 0.002);
    d.mesh.scale.setScalar(k * 0.85);
    d.mesh.material.opacity = k;
  }
}

function fallbackProp(paper, id, width, height) {
  const canvas = paper.paint(180, 180, (ctx, w, h) => {
    ctx.fillStyle = '#f6edd9';
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = '#e2574c';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, w - 28, h - 28);
  }, { dieCut: 4, seed: 11, grain: 0.04 });
  const card = paper.card({ canvas, width, height, anchor: 'bottom-center' });
  card.name = id;
  return card;
}

function mountFree(parent, characterArt, paper, characters, figures, id, height, fallback) {
  const card = characterArt.actor(paper, characters, figures, id, fallback, { height });
  if (!card) return null;
  const meta = characters && characters.has && characters.has(id) ? characters.info(id) : null;
  if (meta) {
    const pad = (meta.h - meta.feet[1]) * (height / meta.h);
    card.position.y = Math.max(0, pad - 0.028);
  }
  card.name = id;
  parent.add(card);
  return card;
}

function stageActor(track, popup, characterArt, paper, characters, figures, spec) {
  const { id, height, side, x, z, tag, fallback, THREE, FONT, C } = spec;
  const meta = characters && characters.has && characters.has(id) ? characters.info(id) : null;
  const e = meta ? extents(meta, height) : { maxX: height * 0.4, minX: -height * 0.4, width: height * 0.8 };
  const toward = side === 'left' ? e.maxX : -e.minX;
  const away = side === 'left' ? -e.minX : e.maxX;
  let hx = x;
  const minX = toward + height * 0.5 + 0.08;
  const maxX = PAGE_W - away - 0.06;
  if (hx < minX) hx = minX;
  if (hx > maxX) hx = maxX;
  let zz = z < height - 1.46 ? height - 1.46 : z;
  if (zz > 1.38) zz = 1.38;
  const stand = track(popup.standUp({
    side, x: hx, z: zz, fold: 'back', width: Math.max(e.width, 1.15), height,
  }));
  const wrap = new THREE.Group();
  wrap.name = id;
  stand.mount.add(wrap);
  const card = characterArt.actor(paper, characters, figures, id, fallback, { height });
  if (card && meta) seatStand(card, meta, height);
  if (card) {
    card.name = id;
    wrap.add(card);
  }
  const label = tagMesh(THREE, paper, FONT, C, tag, 1.32, 0.3);
  label.name = `${id}-tag`;
  label.position.set(0, height + 0.16, 0.02);
  wrap.add(label);
  wrap.scale.setScalar(0);
  return { wrap, x: hx, z: zz };
}

function tagMesh(THREE, paper, FONT, C, text, worldW, worldH) {
  const W = 720;
  const H = Math.round(W * (worldH / worldW));
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(246, 237, 217, 0.96)';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(16, 16, W - 32, H - 32, 36);
  ctx.fill();
  ctx.stroke();
  const font = (px) => `700 ${px}px ${FONT.hand}`;
  const px = fitSize(ctx, text, font, Math.round(H * 0.46), W - 80);
  ctx.font = font(px);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + px * 0.06);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), new THREE.MeshBasicMaterial({
    map: paper.texture(canvas), transparent: true, alphaTest: 0.3,
    side: THREE.DoubleSide, toneMapped: false,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function speechBubble(THREE, paper, FONT, C, spec) {
  const { canvas, ctx } = paper.makeCanvas(spec.w, spec.h);
  ctx.clearRect(0, 0, spec.w, spec.h);
  const m = 18;
  const bodyH = spec.h - 58;
  ctx.fillStyle = '#fffaf3';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(m, m, spec.w - m * 2, bodyH, 36);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  if (spec.tail === 'left') {
    ctx.moveTo(spec.w * 0.30, m + bodyH - 2);
    ctx.lineTo(spec.w * 0.18, spec.h - 8);
    ctx.lineTo(spec.w * 0.48, m + bodyH - 2);
  } else {
    ctx.moveTo(spec.w * 0.52, m + bodyH - 2);
    ctx.lineTo(spec.w * 0.78, spec.h - 8);
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
    const px = fitSize(ctx, line.text, font, Math.round(bodyH * line.px * 2.2), spec.w - m * 4);
    ctx.font = font(px);
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, cx, cy + line.dy * bodyH);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: paper.texture(canvas), transparent: true, alphaTest: 0.35,
    side: THREE.DoubleSide, toneMapped: false,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(0);
  return mesh;
}

function buildBits(THREE, paper, rng, parent, hearts, confetti, C, at) {
  const heart = heartTex(paper);
  const hGeo = new THREE.PlaneGeometry(0.12, 0.12);
  const spots = [
    { x: -2.7, z: 0.15 },
    { x: -1.15, z: 1.05 },
    { x: 0.9, z: -0.35 },
    { x: 2.15, z: 0.85 },
    { x: 2.9, z: -0.15 },
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
      mesh, x: spots[i].x, z: spots[i].z, phase: i * 1.37, y0: 0.55 + (i % 3) * 0.15,
    });
  }
  const geo = new THREE.PlaneGeometry(0.05, 0.075);
  const colors = [C.tomato, C.mustard, C.sky, C.blush, C.leaf];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i], side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'confetti';
    mesh.castShadow = false;
    const y0 = 1.05 + rng.next() * 0.2;
    const vy = 1.1 + rng.next() * 0.4;
    const g = 2.5;
    const T = (vy + Math.sqrt(vy * vy + 2 * g * (y0 - 0.08))) / g;
    parent.add(mesh);
    confetti.push({
      mesh, y0, vy, g, T,
      x0: -0.35 + rng.next() * 1.1,
      z0: -0.2 + rng.next() * 0.55,
      vx: (rng.next() - 0.5) * 0.7,
      vz: (rng.next() - 0.5) * 0.35,
      delay: rng.next() * 0.25,
      spin: (rng.next() - 0.5) * 5,
      rot: rng.next() * Math.PI,
      at,
      kx: -0.15 + rng.next() * 0.7,
      kz: 0.75 + rng.next() * 0.3,
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

function poseBits(hearts, confetti, t, officialAt, kissAt, alreadyAt, schoolAt) {
  for (let i = 0; i < hearts.length; i++) {
    const p = hearts[i];
    let x = p.x + Math.sin(t * 0.55 + p.phase) * 0.14;
    let y = p.y0 + (0.5 + 0.5 * Math.sin(t * 0.32 + p.phase)) * 0.45;
    let z = p.z + Math.cos(t * 0.4 + p.phase) * 0.08;
    if (i === 0 && t >= alreadyAt + 2.6 && t < schoolAt) {
      const u = (t - (alreadyAt + 2.6)) / 0.45;
      const k = u < 0 ? 0 : u > 1 ? 1 : u;
      x = p.x + ( -1.45 - p.x) * k;
      y = p.y0 + (1.45 - p.y0) * k;
      z = p.z + (0.8 - p.z) * k;
    }
    if (t >= kissAt) {
      const age = t - kissAt;
      const rad = age < 1.3 ? age * 0.85 : 1.1;
      x = 0.08 + Math.cos(p.phase) * rad;
      z = 0.85 + Math.sin(p.phase) * 0.22;
      y = 0.45 + age * 0.42;
    }
    if (x < -3.2) x = -3.2;
    else if (x > 3.2) x = 3.2;
    if (z < -1.35) z = -1.35;
    else if (z > 1.35) z = 1.35;
    if (y < 0.08) y = 0.08;
    else if (y > 2.15) y = 2.15;
    p.mesh.position.set(x, y, z);
    p.mesh.rotation.z = Math.sin(t * 0.7 + p.phase) * 0.35;
  }
  for (let i = 0; i < confetti.length; i++) {
    const p = confetti[i];
    const burst = t >= kissAt ? kissAt : officialAt;
    const x0 = t >= kissAt ? p.kx : p.x0;
    const z0 = t >= kissAt ? p.kz : p.z0;
    const age = t - burst - p.delay;
    const mesh = p.mesh;
    if (age <= 0) {
      mesh.position.set(x0, 0.08, z0);
      mesh.rotation.z = p.rot;
      mesh.scale.setScalar(0);
      continue;
    }
    mesh.scale.setScalar(1);
    if (age < p.T) {
      let y = p.y0 + p.vy * age - 0.5 * p.g * age * age;
      if (y < 0.08) y = 0.08;
      let x = x0 + p.vx * age;
      let z = z0 + p.vz * age;
      if (x < -3.15) x = -3.15;
      else if (x > 3.15) x = 3.15;
      if (z < -1.3) z = -1.3;
      else if (z > 1.3) z = 1.3;
      mesh.position.set(x, y, z);
      mesh.rotation.z = p.rot + p.spin * age;
    } else {
      let x = x0 + p.vx * p.T;
      let z = z0 + p.vz * p.T;
      if (x < -3.15) x = -3.15;
      else if (x > 3.15) x = 3.15;
      if (z < -1.3) z = -1.3;
      else if (z > 1.3) z = 1.3;
      mesh.position.set(x, 0.08, z);
      mesh.rotation.z = p.rot + p.spin * p.T;
    }
  }
}
