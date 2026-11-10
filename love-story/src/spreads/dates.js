// Spread 2 — "The “dates”". A walk with the dog, a chaperone, an Uber chase, the same school.
// Times come from timeline.BEATS / SPREADS. Drawings: character cycles and love-story/art/dates/.
// update() allocates nothing. Slider pieces scale with popup.rise so they lie flat while the page turns.
const GAMMA = 1.64;
const BACK_Z = -0.98;
const HALF = 3.35;
const HOUSE_W = 3.22;
const SCHOOL_H = 2.02;
const WALK_H = 1.52;
const SISTER_H = 1.02;
const RUN_H = 1.42;
const CHEER_H = 1.56;
const SCHOOL_COUPLE_H = 1.55;
const CAR_H = 0.74;
const CLEAR = 0.02; // keeps a die-cut corner above the hinge when a card leans

// Centre-house window, fractions of the houses drawing (glass, measured on the cut-out).
const WIN = { x0: 0.452, x1: 0.559, y0: 0.340, y1: 0.518 };
// Blank sign on the school facade.
const SIGN = { x: 0.504, y: 0.529, maxW: 0.30 };

function bump(t, at, dur) {
  const u = (t - at) / dur;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

function twitch(t, at) {
  const u = (t - at) / 0.7;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI * 3) * (1 - u);
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function popIn(ease, t, at, dur) {
  const u = (t - at) / dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let s = ease.outBack(u);
  if (s < 0) s = 0;
  else if (s > 1.06) s = 1.06;
  return s;
}

function fitSize(ctx, text, font, px, maxW) {
  let size = px;
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  if (w > maxW) size *= maxW / w;
  return size;
}

function cloneCanvas(paper, src) {
  const { canvas, ctx } = paper.makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return { canvas, ctx };
}

// characterCard puts the feet on the group origin, so the padded canvas hangs below the hinge.
function metrics(info, height) {
  const s = height / info.h;
  return {
    s,
    drop: (info.h - info.feet[1]) * s,
    left: info.feet[0] * s,
    right: (info.w - info.feet[0]) * s,
    width: info.w * s,
  };
}

function seat(card, info, height, extra) {
  if (!card || !info) return null;
  const m = metrics(info, height);
  card.position.y = m.drop + (extra || 0);
  return m;
}

export default {
  id: 'dates',
  title: 'The “dates”',
  build(ctx) {
    const { THREE, paper, popup, rng, photos, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'dates');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'dates';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const charInfo = (id) => (characters && characters.info ? characters.info(id) : null);

    const dogWalk = BEATS.dogWalk;
    const sisterAt = BEATS.sisterTagsAlong;
    const chase = BEATS.uberChaseStart;
    const rescue = BEATS.phoneRescued;
    const schoolAt = BEATS.sameSchool;
    const parentsAt = BEATS.strictParents;

    // ---------------------------------------------------------------- pages
    const ink = C.ink;
    const letter = (g, text, x, y, px, rot, color, maxW) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const size = fitSize(g, text, (n) => `700 ${n}px ${FONT.hand}`, px, maxW);
      g.font = `700 ${size}px ${FONT.hand}`;
      g.fillStyle = color;
      g.fillText(text, 0, 0);
      g.restore();
    };
    const heart = (g, x, y, r, color) => {
      g.save();
      g.translate(x, y);
      g.beginPath();
      g.moveTo(0, r * 0.85);
      g.bezierCurveTo(-r * 1.4, -r * 0.15, -r * 0.55, -r * 1.15, 0, -r * 0.35);
      g.bezierCurveTo(r * 0.55, -r * 1.15, r * 1.4, -r * 0.15, 0, r * 0.85);
      g.fillStyle = color;
      g.fill();
      g.restore();
    };

    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const L = cloneCanvas(paper, art.canvas('page-left'));
      const R = cloneCanvas(paper, art.canvas('page-right'));
      const lw = L.canvas.width;
      const lh = L.canvas.height;
      // Cream column beside the map, ending before the gutter shade (rightmost ~6%).
      letter(L.ctx, 'date #1:', lw * 0.80, lh * 0.30, 48, -0.03, ink, lw * 0.15);
      letter(L.ctx, 'walking the dog', lw * 0.785, lh * 0.365, 34, -0.012, ink, lw * 0.175);
      letter(L.ctx, 'date #2:', lw * 0.80, lh * 0.47, 48, 0.02, ink, lw * 0.15);
      letter(L.ctx, 'walking the dog', lw * 0.785, lh * 0.535, 34, 0.02, ink, lw * 0.175);
      heart(L.ctx, lw * 0.80, lh * 0.22, 14, C.blush);
      heart(L.ctx, lw * 0.755, lh * 0.25, 10, C.tomato);
      const rw = R.canvas.width;
      const rh = R.canvas.height;
      letter(R.ctx, 'the chase →', rw * 0.06, rh * 0.30, 40, -0.02, ink, rw * 0.38);
      letter(R.ctx, 'to the same school', rw * 0.42, rh * 0.14, 34, 0.03, C.teal, rw * 0.46);
      R.ctx.save();
      R.ctx.strokeStyle = 'rgba(58, 47, 42, 0.45)';
      R.ctx.lineWidth = 3;
      R.ctx.setLineDash([2, 11]);
      R.ctx.lineCap = 'round';
      R.ctx.beginPath();
      R.ctx.moveTo(rw * 0.08, rh * 0.58);
      R.ctx.quadraticCurveTo(rw * 0.48, rh * 0.56, rw * 0.78, rh * 0.34);
      R.ctx.stroke();
      R.ctx.restore();
      heart(R.ctx, rw * 0.18, rh * 0.70, 12, C.blush);
      leftArt = L.canvas;
      rightArt = R.canvas;
    } else {
      const ground = (g, w, h) => {
        g.fillStyle = '#f4efe2';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(90, 70, 40, 0.45)';
        g.setLineDash([8, 12]);
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(w * 0.08, h * 0.62);
        g.lineTo(w * 0.92, h * 0.58);
        g.stroke();
        g.setLineDash([]);
      };
      leftArt = paper.page((g, w, h) => {
        ground(g, w, h);
        letter(g, 'date #1:', w * 0.12, h * 0.24, 48, -0.03, ink, w * 0.4);
        letter(g, 'walking the dog', w * 0.14, h * 0.32, 36, -0.01, ink, w * 0.5);
        letter(g, 'date #2:', w * 0.12, h * 0.42, 48, 0.02, ink, w * 0.4);
        letter(g, 'walking the dog', w * 0.14, h * 0.50, 36, 0.02, ink, w * 0.5);
      }, { seed: 21, tint: '#f4efe2' });
      rightArt = paper.page((g, w, h) => {
        ground(g, w, h);
        letter(g, 'the chase →', w * 0.12, h * 0.32, 42, 0, ink, w * 0.6);
        letter(g, 'to the same school', w * 0.4, h * 0.18, 36, 0.02, C.teal, w * 0.5);
      }, { seed: 22, tint: '#f7f1e4' });
    }

    // ---------------------------------------------------------------- mechanisms
    const folds = [];
    const track = (m) => {
      folds.push(m);
      group.add(m.object);
      return m;
    };

    const hInfo = info('houses');
    const sInfo = info('school');
    const houseH = hInfo ? HOUSE_W * (hInfo.h / hInfo.w) : 1.5;
    const backH = Math.max(houseH, SCHOOL_H) + 0.04;
    const back = track(popup.vFold({ z0: BACK_Z, gamma: GAMMA, width: HALF * 2, height: backH }));

    let houses = null;
    let parents = null;
    let parentsX = 0;
    let parentsY = 0;
    if (hInfo) {
      houses = characterArt.characterCard(paper, art, 'houses', { height: houseH });
      houses.name = 'houses';
      const hm = metrics(hInfo, houseH);
      // Row sits on the left half. Image-right edge stays just clear of the crease.
      houses.position.set(-hm.right - 0.12, hm.drop, 0);
      back.left.add(houses);

      const pInfo = charInfo('parents-window');
      const winW = (WIN.x1 - WIN.x0) * hm.width;
      const winH = pInfo ? winW * (pInfo.h / pInfo.w) * 1.02 : (WIN.y1 - WIN.y0) * houseH;
      const cx = ((WIN.x0 + WIN.x1) * 0.5 * hInfo.w - hInfo.feet[0]) * hm.s;
      const cy = (hInfo.feet[1] - (WIN.y0 + WIN.y1) * 0.5 * hInfo.h) * hm.s;
      parents = characterArt.actor(
        paper, characters, figures, 'parents-window',
        { who: 'her', outfit: 'casual', pose: 'stand' },
        { height: winH },
      );
      if (parents) {
        parents.name = 'parents-window';
        // Feet are the bottom of the frame; centre the frame on the dark pane.
        const mid = pInfo ? (pInfo.feet[1] - pInfo.h * 0.5) * (winH / pInfo.h) : winH * 0.42;
        parentsX = cx;
        parentsY = cy - mid;
        parents.position.set(parentsX, parentsY, 0.02);
        houses.add(parents);
      }
    }

    if (sInfo) {
      const painted = cloneCanvas(paper, art.canvas('school'));
      const { ctx: sctx, canvas } = painted;
      const font = (n) => `700 ${n}px ${FONT.hand}`;
      const size = fitSize(sctx, 'same school?!', font, Math.round(canvas.height * 0.042), canvas.width * SIGN.maxW);
      sctx.font = font(size);
      sctx.fillStyle = '#8d3a32';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText('same school?!', canvas.width * SIGN.x, canvas.height * SIGN.y);
      const cut = paper.dieCut(canvas, { margin: 10 });
      const sm = metrics(sInfo, SCHOOL_H);
      const mesh = paper.card({ canvas: cut, width: sm.width, height: SCHOOL_H, anchor: 'bottom-center' });
      mesh.position.set(((sInfo.w / 2) - sInfo.feet[0]) * sm.s, (sInfo.feet[1] - sInfo.h) * sm.s, 0);
      const schoolCard = new THREE.Group();
      schoolCard.name = 'school';
      schoolCard.add(mesh);
      schoolCard.position.set(HALF - sm.right - 0.08, sm.drop, 0);
      back.right.add(schoolCard);
    }

    const stand = (side, x, z, fold, width, height, name) => {
      const m = track(popup.standUp({ side, x, z, fold, width, height }));
      m.mount.name = name;
      return m.mount;
    };

    const addProp = (mount, id, height) => {
      if (!has(id)) return null;
      const card = characterArt.characterCard(paper, art, id, { height });
      if (!card) return null;
      seat(card, art.info(id), height, 0);
      card.name = id;
      mount.add(card);
      return card;
    };

    // Far trees fold toward the reader so a tall card still fits the far edge.
    const treesA = stand('left', 2.55, -0.42, 'front', 1.50, 1.28, 'trees-a');
    addProp(treesA, 'trees-a', 1.28);
    const treesB = stand('right', 2.62, -0.62, 'front', 1.02, 1.05, 'trees-b');
    addProp(treesB, 'trees-b', 1.05);
    const bench = stand('left', 3.02, -0.48, 'front', 0.80, 1.16, 'park-bench');
    addProp(bench, 'park-bench', 1.16);
    const fence = stand('left', 2.15, 1.16, 'back', 1.88, 0.46, 'fence');
    addProp(fence, 'fence', 0.46);
    const hedge = stand('right', 1.95, 1.12, 'back', 2.20, 0.38, 'bush-row');
    addProp(hedge, 'bush-row', 0.38);

    // ---------------------------------------------------------------- sliders
    // x is distance from the gutter. Polylines (no curve overshoot) so a wide card stays on the page.
    // Walkers head toward the gutter; the car and the chase head toward the outer edge.
    const walkPath = [[2.48, 0.36], [2.22, 0.48], [1.98, 0.40]];
    const sisterPath = [[3.08, 0.64], [2.82, 0.74], [2.58, 0.66]];
    const carPath = [[2.58, 0.06], [2.88, 0.10], [3.15, 0.06]];
    const runPath = [[1.30, 0.52], [1.58, 0.58], [1.86, 0.52]];

    const walkSlider = popup.slider({ side: 'left', path: walkPath, lift: 0.012, smooth: false });
    const sisterSlider = popup.slider({ side: 'left', path: sisterPath, lift: 0.014, smooth: false });
    const carSlider = popup.slider({ side: 'right', path: carPath, lift: 0.012, smooth: false });
    const runSlider = popup.slider({ side: 'right', path: runPath, lift: 0.014, smooth: false });
    group.add(walkSlider.object, sisterSlider.object, carSlider.object, runSlider.object);

    const holderOf = (slider, name) => {
      const h = new THREE.Group();
      h.name = name;
      slider.mount.add(h);
      return h;
    };
    const walkHold = holderOf(walkSlider, 'walk-couple');
    const sisterHold = holderOf(sisterSlider, 'walk-sister');
    const carHold = holderOf(carSlider, 'car');
    const runHold = holderOf(runSlider, 'run-couple');
    const cheerHold = holderOf(runSlider, 'phone-cheer');

    const cycle = (name) => (characters && characters.cycle ? characters.cycle(name) : []);
    const walkIds = cycle('walk-couple');
    const sisterIds = cycle('walk-sister');
    const runIds = cycle('run-couple');
    const walkFlip = mountFlip(paper, characters, characterArt, walkIds, WALK_H);
    const sisterFlip = mountFlip(paper, characters, characterArt, sisterIds, SISTER_H);
    const runFlip = mountFlip(paper, characters, characterArt, runIds, RUN_H);
    if (walkFlip) {
      seatFlip(walkFlip, walkIds, characters, WALK_H);
      walkHold.add(walkFlip.group);
    }
    if (sisterFlip) {
      seatFlip(sisterFlip, sisterIds, characters, SISTER_H);
      sisterHold.add(sisterFlip.group);
    }
    if (runFlip) {
      seatFlip(runFlip, runIds, characters, RUN_H);
      runHold.add(runFlip.group);
    }

    const cheer = characterArt.actor(
      paper, characters, figures, 'phone-cheer',
      { who: 'her', outfit: 'casual', pose: 'wave' },
      { height: CHEER_H },
    );
    if (cheer) {
      cheer.name = 'phone-cheer';
      seat(cheer, charInfo('phone-cheer'), CHEER_H, CLEAR);
      cheerHold.add(cheer);
    }
    const car = characterArt.actor(paper, characters, figures, 'car', null, { height: CAR_H });
    if (car) {
      car.name = 'car';
      seat(car, charInfo('car'), CAR_H, CLEAR);
      carHold.add(car);
    }

    const flag = speechCard(THREE, paper, FONT, 'chaperone ★', 520, 200, C);
    flag.name = 'chaperone';
    flag.position.set(0.04, SISTER_H * 0.94, 0.02);
    flag.scale.set(0.50, 0.24, 1);
    sisterHold.add(flag);

    const burst = speechCard(THREE, paper, FONT, 'got it!', 480, 480, C, true);
    burst.name = 'got-it';
    burst.position.set(0.32, CHEER_H * 0.58, 0.03);
    burst.scale.set(0.48, 0.48, 1);
    cheerHold.add(burst);

    const banner = speechCard(THREE, paper, FONT, 'adventure!', 640, 200, C);
    banner.name = 'adventure';
    banner.position.set(0.95, CHEER_H * 0.70, 0.04);
    banner.scale.set(0.82, 0.30, 1);
    cheerHold.add(banner);

    const glow = glowSprite(THREE, paper);
    glow.name = 'phone-glow';
    // Rear side window, over the phone already drawn in the car.
    glow.position.set(-0.30, CAR_H * 0.62, 0.03);
    carHold.add(glow);

    const uMark = speechCard(THREE, paper, FONT, 'U', 180, 120, C);
    uMark.name = 'rideshare';
    uMark.position.set(-0.22, CAR_H * 0.98, 0.03);
    uMark.scale.set(0.26, 0.15, 1);
    carHold.add(uMark);

    const coupleW = 1.16;
    const coupleStand = stand('right', 2.20, 0.42, 'back', coupleW, SCHOOL_COUPLE_H, 'school-couple');
    const schoolHold = new THREE.Group();
    schoolHold.name = 'school-couple';
    coupleStand.add(schoolHold);
    const schoolCouple = characterArt.actor(
      paper, characters, figures, 'school-couple',
      { who: 'him', outfit: 'school', pose: 'wave' },
      { height: SCHOOL_COUPLE_H },
    );
    if (schoolCouple) {
      schoolCouple.name = 'school-couple';
      seat(schoolCouple, charInfo('school-couple'), SCHOOL_COUPLE_H, 0);
      schoolHold.add(schoolCouple);
    }

    const lamp = new THREE.PointLight('#ffd9a0', 0, 3.4, 2);
    lamp.name = 'lamp';
    lamp.castShadow = false;
    lamp.position.set(-2.95, 1.05, -0.35);
    group.add(lamp);

    void photos;
    void rng;

    const walkSpan = (chase - 0.25) - dogWalk;
    const chaseSpan = rescue - chase;
    const state = { walk: 0, sister: 0, run: 0 };

    // Cue anchors follow the same paths the sliders walk (open-flat: left page x is negative).
    const along = (path, u) => {
      const n = path.length - 1;
      const f = clamp01(u) * n;
      const i = Math.min(n - 1, Math.floor(f));
      const t = f - i;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    };
    const walkAt = (t) => along(walkPath, (t - dogWalk) / walkSpan);
    const chaseAt = (t) => {
      const p = clamp01((t - chase) / chaseSpan);
      const u = p < 0.72 ? (p / 0.72) * 0.86 : 0.86 + 0.14 * (1 - (1 - (p - 0.72) / 0.28) ** 2);
      return along(runPath, u);
    };
    const w47 = walkAt(dogWalk + 1.5);
    const w52 = walkAt(dogWalk + 6.5);
    const ch58 = chaseAt(chase + 1.5);
    const endRun = along(runPath, 1);

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 2.2, at: [0, 0.85, 0], size: 7.5, from: 'front' },
        { t: parentsAt + 0.2, hold: 1.8, at: [-1.66, 1.05, -1.05], size: 2.0, from: 'front' },
        { t: dogWalk + 1.5, hold: 2.2, at: [-w47[0], 0.9, w47[1]], size: 2.6, from: 'left' },
        { t: dogWalk + 6.5, hold: 2.4, at: [-w52[0], 0.9, w52[1]], size: 2.6, from: 'front' },
        { t: chase + 1.5, hold: 2.0, at: [ch58[0] + 0.35, 0.75, 0.38], size: 3.2, from: 'right' },
        { t: rescue + 0.15, hold: 1.8, at: [endRun[0], 0.95, endRun[1]], size: 2.2, from: 'front' },
        {
          t: schoolAt + 0.9,
          hold: Math.max(0.8, spread.close - 0.6 - (schoolAt + 0.9)),
          at: [2.2, 1.15, 0.05],
          size: 3.0,
          from: 'right',
        },
      ],
      update(alpha, t) {
        const n = folds.length;
        for (let i = 0; i < n; i++) folds[i].update(alpha);
        const risen = popup.rise(alpha);

        const walkU = clamp01((t - dogWalk) / walkSpan);
        const chaseP = clamp01((t - chase) / chaseSpan);
        let chaseU;
        if (chaseP < 0.72) chaseU = (chaseP / 0.72) * 0.86;
        else {
          const k = (chaseP - 0.72) / 0.28;
          chaseU = 0.86 + 0.14 * (1 - (1 - k) * (1 - k));
        }

        walkSlider.update(alpha, walkU);
        sisterSlider.update(alpha, walkU);
        carSlider.update(alpha, chaseU);
        runSlider.update(alpha, chaseU);

        // One couple group is full size at a time: the last one is gone before the next begins.
        const walkShow = smoothstep(dogWalk, dogWalk + 0.35, t) * (1 - smoothstep(chase - 0.28, chase - 0.02, t));
        const sisterShow = smoothstep(sisterAt, sisterAt + 0.35, t) * (1 - smoothstep(chase - 0.28, chase - 0.02, t));
        const runShow = smoothstep(chase + 0.02, chase + 0.28, t) * (1 - smoothstep(rescue - 0.28, rescue - 0.02, t));
        const cheerShow = smoothstep(rescue + 0.02, rescue + 0.26, t) * (1 - smoothstep(schoolAt - 0.32, schoolAt - 0.04, t));
        const schoolShow = popIn(ease, t, schoolAt, 0.42);
        const carShow = smoothstep(chase, chase + 0.28, t) * (1 - smoothstep(schoolAt - 0.4, schoolAt - 0.02, t));

        const breathe = 1 + Math.sin(t * 1.55) * 0.012;
        poseGroup(walkHold, walkFlip, risen * walkShow, breathe, bump(t, dogWalk, 0.36), Math.sin(t * 2.2) * 0.012, state, 'walk', t, dogWalk, 3);
        poseGroup(sisterHold, sisterFlip, risen * sisterShow, breathe, bump(t, sisterAt, 0.34), Math.sin(t * 2.4 + 1) * 0.012, state, 'sister', t, sisterAt, 3);
        poseGroup(runHold, runFlip, risen * runShow, breathe, bump(t, chase, 0.28), Math.sin(t * 3.1) * 0.014, state, 'run', t, chase, 8);

        const cheerPop = bump(t, rescue, 0.32);
        const cs = risen * cheerShow;
        cheerHold.scale.set(breathe * (1 - 0.05 * cheerPop) * cs, breathe * (1 + 0.08 * cheerPop) * cs, cs > 0 ? 1 : 0);
        cheerHold.position.y = Math.sin(t * 2.1) * 0.008 * cheerShow;
        cheerHold.rotation.z = Math.sin(t * 1.7) * 0.012 * cheerShow;
        banner.scale.x = 0.82 * smoothstep(rescue, rescue + 0.35, t);
        const pulse = 0.85 + 0.15 * Math.sin(t * 7);
        burst.scale.set(0.48 * pulse, 0.48 * pulse, 1);

        const cr = carShow * risen;
        carHold.scale.set(cr, cr, cr > 0 ? 1 : 0);
        carHold.position.y = Math.sin(t * 9) * 0.004 * carShow * (t < rescue ? 1 : 0.2);
        const glowOn = t < rescue + 0.15 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 8)) : 0;
        glow.scale.setScalar(glowOn * carShow);

        const ss = schoolShow;
        const sb = 1 + Math.sin(t * 1.4) * 0.01 * (ss > 0.2 ? 1 : 0);
        const sp = bump(t, schoolAt, 0.4);
        schoolHold.scale.set(sb * (1 - 0.04 * sp) * ss, sb * (1 + 0.07 * sp) * ss, ss > 0 ? 1 : 0);
        schoolHold.rotation.z = Math.sin(t * 1.3) * 0.01 * ss;

        if (parents) {
          const w = twitch(t, parentsAt);
          parents.position.x = parentsX + w * 0.03;
          parents.position.y = parentsY;
          parents.rotation.z = w * 0.08;
        }

        lamp.intensity = risen * (0.32 + 0.1 * Math.sin(t * 2.2));
      },
    };
  },
};

function mountFlip(paper, characters, characterArt, ids, height) {
  if (!ids || !ids.length || !characters || !characters.has || !characters.has(ids[0])) return null;
  return characterArt.characterFlip(paper, characters, ids, { height });
}

function seatFlip(flip, ids, characters, height) {
  const ref = characters.info(ids[0]);
  if (!ref) return;
  const scale = height / ref.h;
  let drop = 0;
  for (let i = 0; i < ids.length; i++) {
    const info = characters.info(ids[i]);
    if (!info) continue;
    const d = (info.h - info.feet[1]) * scale;
    if (d > drop) drop = d;
  }
  flip.group.position.y = drop + CLEAR;
}

function poseGroup(hold, flip, show, breathe, pop, lean, state, key, t, at, hz) {
  const sx = breathe * (1 - 0.04 * pop) * show;
  const sy = breathe * (1 + 0.07 * pop) * show;
  hold.scale.set(sx, sy, show > 0 ? 1 : 0);
  hold.position.y = Math.sin(t * 2.1 + at) * 0.006 * (show > 0 ? 1 : 0);
  hold.rotation.z = lean * (show > 0 ? 1 : 0);
  if (!flip) return;
  const frame = Math.floor(Math.max(0, t - at) * hz) % flip.count;
  if (frame !== state[key]) {
    flip.show(frame);
    state[key] = frame;
  }
}

function speechCard(THREE, paper, FONT, text, w, h, C, burst) {
  const canvas = paper.paint(w, h, (ctx, pw, ph) => {
    if (burst) {
      ctx.translate(pw / 2, ph / 2);
      ctx.fillStyle = '#fff4d2';
      ctx.strokeStyle = C.mustard;
      ctx.lineWidth = 10;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? ph * 0.46 : ph * 0.28;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.tomato;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(ph * 0.16)}px ${FONT.display}`;
      ctx.fillText(text, 0, ph * 0.02);
    } else {
      const rad = Math.min(pw, ph) * 0.22;
      ctx.fillStyle = '#fffaf1';
      ctx.strokeStyle = C.kraftDeep;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.roundRect(16, 16, pw - 32, ph - 32, rad);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const face = text.length < 3 ? FONT.display : FONT.hand;
      ctx.font = `700 ${Math.round(ph * (text.length < 3 ? 0.46 : 0.34))}px ${face}`;
      ctx.fillText(text, pw / 2, ph * 0.52);
    }
  }, { dieCut: 8, seed: text.length * 3 });
  const card = paper.card({ canvas, width: 1, height: h / w, anchor: 'bottom-center' });
  const g = new THREE.Group();
  g.add(card);
  return g;
}

function glowSprite(THREE, paper) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  const grd = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255, 244, 190, 0.95)');
  grd.addColorStop(0.45, 'rgba(120, 190, 255, 0.55)');
  grd.addColorStop(1, 'rgba(120, 190, 255, 0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), mat);
  mesh.castShadow = false;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}
