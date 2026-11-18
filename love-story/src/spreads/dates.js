// Spread 3 — "Creative dates". A list of date ideas, strict parents, a walk with Oliver,
// the little sister, then night and the Uber phone chase, and a ribbon of memories.
// The same-school moment lives on the fate spread. Times come from timeline.BEATS / SPREADS.
// update() allocates nothing. Slider pieces scale with popup.rise so they lie flat as the page turns.
import { L } from '../i18n.js';
import { photoPrint, PHOTO_ASPECT } from '../photos.js';

const GAMMA = 1.64;
const BACK_Z = -0.98;
const HALF = 3.35;
const HOUSE_W = 3.22;
const WALK_H = 1.58;
const SISTER_H = 1.05;
const RUN_H = 1.18;
const CHEER_H = 1.52;
const CAR_H = 0.76;
const LAMP_H = 1.32;
const MOON_H = 0.92;
const LIST_W = 1.46;
const LIST_H = 1.11;
const CLEAR = 0.02;

// Centre-house window, fractions of the houses drawing (glass, measured on the cut-out).
const WIN = { x0: 0.452, x1: 0.559, y0: 0.34, y1: 0.518 };
// Other panes, fractions of the houses drawing (cx, cy, w, h).
const PANES = [
  [0.22, 0.4, 0.1, 0.13],
  [0.78, 0.39, 0.1, 0.13],
  [0.2, 0.74, 0.08, 0.1],
  [0.78, 0.74, 0.08, 0.1],
];

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
  else if (s > 1.08) s = 1.08;
  return s;
}

function fitSize(ctx, text, font, px, maxW) {
  let size = px;
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  if (w > maxW && w > 0) size *= maxW / w;
  return size;
}

function cloneCanvas(paper, src) {
  const { canvas, ctx } = paper.makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return { canvas, ctx };
}

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

function collectMats(root, out) {
  if (!root) return;
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.color) out.push(o.material);
  });
}

export default {
  id: 'dates',
  title: 'Creative dates',
  build(ctx) {
    const { THREE, paper, popup, photos, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'dates');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'dates';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const charInfo = (id) => (characters && characters.info ? characters.info(id) : null);

    const ideasAt = BEATS.creativeDates;
    const crossDinner = ideasAt + 1.55;
    const crossMovies = ideasAt + 3.15;
    const tickAt = ideasAt + 4.6;
    const parentsAt = BEATS.strictParents;
    const dogWalk = BEATS.dogWalk;
    const sisterAt = BEATS.sisterTagsAlong;
    const nightAt = BEATS.lateNights;
    const chase = BEATS.uberChaseStart;
    const rescue = BEATS.phoneRescued;
    const memoriesAt = BEATS.memories;

    const dayC = new THREE.Color('#ffffff');
    const nightC = new THREE.Color('#7d96c6');
    const tintC = new THREE.Color();

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
      const pageL = cloneCanvas(paper, art.canvas('page-left'));
      const pageR = cloneCanvas(paper, art.canvas('page-right'));
      const lw = pageL.canvas.width;
      const lh = pageL.canvas.height;
      letter(pageL.ctx, L('creative dates', 'citas creativas'), lw * 0.755, lh * 0.3, 42, -0.02, ink, lw * 0.2);
      letter(pageL.ctx, L('walking Oliver', 'paseando a Oliver'), lw * 0.755, lh * 0.38, 32, -0.01, ink, lw * 0.2);
      heart(pageL.ctx, lw * 0.8, lh * 0.2, 14, C.blush);
      heart(pageL.ctx, lw * 0.755, lh * 0.23, 9, C.tomato);
      const rw = pageR.canvas.width;
      const rh = pageR.canvas.height;
      letter(pageR.ctx, L('late nights', 'noches largas'), rw * 0.06, rh * 0.16, 40, -0.02, C.teal, rw * 0.46);
      letter(pageR.ctx, L('the chase →', 'la persecución →'), rw * 0.06, rh * 0.26, 34, -0.012, ink, rw * 0.5);
      heart(pageR.ctx, rw * 0.16, rh * 0.7, 12, C.blush);
      leftArt = pageL.canvas;
      rightArt = pageR.canvas;
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
        letter(g, L('creative dates', 'citas creativas'), w * 0.12, h * 0.28, 48, -0.02, ink, w * 0.7);
        letter(g, L('walking Oliver', 'paseando a Oliver'), w * 0.14, h * 0.38, 36, -0.01, ink, w * 0.7);
      }, { seed: 21, tint: '#f4efe2' });
      rightArt = paper.page((g, w, h) => {
        ground(g, w, h);
        letter(g, L('late nights', 'noches largas'), w * 0.1, h * 0.22, 42, -0.02, C.teal, w * 0.7);
        letter(g, L('the chase →', 'la persecución →'), w * 0.1, h * 0.34, 36, 0, ink, w * 0.75);
      }, { seed: 22, tint: '#f7f1e4' });
    }

    // ---------------------------------------------------------------- mechanisms
    const folds = [];
    const track = (m) => {
      folds.push(m);
      group.add(m.object);
      return m;
    };
    const sceneryMats = [];

    const hInfo = info('houses');
    const houseH = hInfo ? HOUSE_W * (hInfo.h / hInfo.w) : 1.5;
    const backH = houseH + 0.12;
    const back = track(popup.vFold({ z0: BACK_Z, gamma: GAMMA, width: HALF * 2, height: backH }));

    let houses = null;
    let parents = null;
    let parentsX = 0;
    let parentsY = 0;
    const glows = [];
    if (hInfo) {
      houses = characterArt.characterCard(paper, art, 'houses', { height: houseH });
      houses.name = 'houses';
      const hm = metrics(hInfo, houseH);
      houses.position.set(-hm.right - 0.12, hm.drop, 0);
      back.left.add(houses);
      collectMats(houses, sceneryMats);

      const addPane = (fx, fy, fw, fh, z) => {
        const s = hm.s;
        const px = (fx * hInfo.w - hInfo.feet[0]) * s;
        const py = (hInfo.feet[1] - fy * hInfo.h) * s;
        const mesh = glowPlane(THREE, paper, fw * hm.width, fh * houseH, '#ffb15c');
        mesh.position.set(px, py, z);
        houses.add(mesh);
        glows.push(mesh);
      };
      const winCx = (WIN.x0 + WIN.x1) * 0.5;
      const winCy = (WIN.y0 + WIN.y1) * 0.5;
      addPane(winCx, winCy, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, 0.012);
      for (let i = 0; i < PANES.length; i++) addPane(PANES[i][0], PANES[i][1], PANES[i][2], PANES[i][3], 0.016);

      const pInfo = charInfo('parents-window');
      const winW = (WIN.x1 - WIN.x0) * hm.width;
      const winH = pInfo ? winW * (pInfo.h / pInfo.w) * 1.02 : (WIN.y1 - WIN.y0) * houseH;
      const cx = (winCx * hInfo.w - hInfo.feet[0]) * hm.s;
      const cy = (hInfo.feet[1] - winCy * hInfo.h) * hm.s;
      parents = characterArt.actor(
        paper, characters, figures, 'parents-window',
        { who: 'her', outfit: 'casual', pose: 'stand' },
        { height: winH },
      );
      if (parents) {
        parents.name = 'parents-window';
        const mid = pInfo ? (pInfo.feet[1] - pInfo.h * 0.5) * (winH / pInfo.h) : winH * 0.42;
        parentsX = cx;
        parentsY = cy - mid;
        parents.position.set(parentsX, parentsY, 0.03);
        houses.add(parents);
      }
    }

    const stand = (side, x, z, fold, width, height, name) => {
      const m = track(popup.standUp({ side, x, z, fold, width, height }));
      m.mount.name = name;
      return m.mount;
    };
    const addProp = (mount, id, height, mats) => {
      if (!has(id)) return null;
      const card = characterArt.characterCard(paper, art, id, { height });
      if (!card) return null;
      seat(card, art.info(id), height, 0);
      card.name = id;
      mount.add(card);
      if (mats) collectMats(card, mats);
      return card;
    };

    const treesA = stand('left', 2.55, -0.42, 'front', 1.5, 1.28, 'trees-a');
    addProp(treesA, 'trees-a', 1.28, sceneryMats);
    const treesB = stand('right', 2.55, -0.55, 'front', 1.02, 1.05, 'trees-b');
    addProp(treesB, 'trees-b', 1.05, sceneryMats);
    const bench = stand('left', 3.02, -0.48, 'front', 0.8, 1.16, 'park-bench');
    addProp(bench, 'park-bench', 1.16, sceneryMats);
    const fence = stand('left', 2.15, 1.16, 'back', 1.88, 0.46, 'fence');
    addProp(fence, 'fence', 0.46, sceneryMats);
    const hedge = stand('right', 2.85, 0.5, 'back', 1.15, 0.2, 'bush-row');
    addProp(hedge, 'bush-row', 0.2, sceneryMats);

    // Moon rides the empty right half of the house facade and pops in at night.
    const moonHold = new THREE.Group();
    moonHold.name = 'moon-stars';
    if (has('moon-stars')) {
      const moon = characterArt.characterCard(paper, art, 'moon-stars', { height: MOON_H });
      if (moon) {
        // High on the right flap, over the trees, clear of the chase.
        seat(moon, info('moon-stars'), MOON_H, 0.62);
        moon.position.x = 2.28;
        moonHold.add(moon);
      }
    }
    back.right.add(moonHold);

    const lampMount = stand('right', 3.2, -1.02, 'front', 0.32, LAMP_H, 'street-lamp');
    const lampHold = new THREE.Group();
    lampHold.name = 'street-lamp';
    lampMount.add(lampHold);
    addProp(lampHold, 'street-lamp', LAMP_H, null);
    const lampGlow = glowPlane(THREE, paper, 0.34, 0.34, '#ffe1a2');
    lampGlow.position.set(0, LAMP_H * 0.86, 0.012);
    lampHold.add(lampGlow);
    const warmLight = new THREE.PointLight('#ffc48a', 0, 3.4, 2);
    warmLight.name = 'lamp-light';
    warmLight.castShadow = false;
    warmLight.position.set(0, LAMP_H * 0.84, 0.12);
    lampHold.add(warmLight);
    const coolLight = new THREE.PointLight('#b7c6ee', 0, 8, 2);
    coolLight.name = 'night-fill';
    coolLight.castShadow = false;
    coolLight.position.set(0.1, 2.35, -0.15);
    group.add(coolLight);

    // Far-edge dusk wash. Flat on each page, under the pop-ups, never over the characters.
    const washMatL = washMaterial(THREE);
    const washMatR = washMaterial(THREE);
    const washL = track(popup.onPage({ side: 'left', x: 1.8, z: -1.05, lift: 0.003 }));
    const washR = track(popup.onPage({ side: 'right', x: 1.8, z: -1.05, lift: 0.003 }));
    washL.mount.add(washMesh(THREE, washMatL));
    washR.mount.add(washMesh(THREE, washMatR));

    // ---------------------------------------------------------------- the list card (centre-front of the right page)
    const listMount = stand('right', 1.9, 1.2, 'back', LIST_W, LIST_H, 'date-ideas');
    const listHold = new THREE.Group();
    listHold.name = 'date-ideas';
    listMount.add(listHold);
    const list = buildList(THREE, paper, FONT, C, LIST_W, LIST_H);
    listHold.add(list.root);

    // ---------------------------------------------------------------- Oliver's print, taped flat on the left page
    const shot = photoPrint(photos ? photos.oliver : null, {
      width: 560,
      style: 'polaroid',
      caption: 'Oliver',
      tilt: -0.07,
      tape: true,
      aspect: PHOTO_ASPECT.oliver,
      seed: 8,
    });
    const shotRatio = shot.width / shot.height;
    const printLong = 1.12;
    const printW = shotRatio >= 1 ? printLong : printLong * shotRatio;
    const printH = shotRatio >= 1 ? printLong / shotRatio : printLong;
    // Outer garden, beside the walk rather than under the dog.
    const PHOTO_X = 2.62;
    const PHOTO_Z = -0.12;
    const photoPage = track(popup.onPage({ side: 'left', x: PHOTO_X, z: PHOTO_Z, lift: 0.014 }));
    const photoHold = new THREE.Group();
    photoHold.name = 'oliver-photo';
    photoHold.rotation.y = -0.1;
    const photoCard = paper.card({
      canvas: paper.dieCut(shot, { margin: 4 }),
      width: printW,
      height: printH,
      anchor: 'bottom-center',
    });
    // onPage wants the card rotated −π/2 about X: face up, top toward the far edge.
    photoCard.rotation.x = -Math.PI / 2;
    photoCard.position.z = printH / 2;
    photoHold.add(photoCard);
    photoPage.mount.add(photoHold);

    // ---------------------------------------------------------------- sliders
    // x is distance from the gutter. Polylines so a wide card stays on the page.
    // Walkers head toward the gutter; the car and the chase head toward the outer edge.
    const walkPath = [[2.05, 0.72], [1.55, 0.78], [1.15, 0.6]];
    const sisterPath = [[2.55, 1.02], [2.1, 1.08], [1.72, 0.92]];
    const carPath = [[2.62, 0.0], [2.9, 0.04], [3.16, -0.02]];
    const runPath = [[1.12, 0.52], [1.4, 0.58], [1.66, 0.48]];

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

    const flag = speechCard(THREE, paper, FONT, L('third wheel ★', 'chaperona ★'), 620, 240, C);
    flag.name = 'third-wheel';
    flag.position.set(0.02, SISTER_H * 0.96, 0.03);
    flag.scale.set(0.78, 0.32, 1);
    sisterHold.add(flag);

    const tag = nameTag(THREE, paper, FONT, C);
    tag.name = 'oliver-tag';
    // Above Oliver: image-right of the feet, about a head higher than his ears.
    tag.position.set(1.16, 0.5, 0.04);
    tag.userData.baseY = tag.position.y;
    walkHold.add(tag);

    const burst = speechCard(THREE, paper, FONT, L('got it!', '¡lo tenemos!'), 640, 640, C, true);
    burst.name = 'got-it';
    burst.position.set(0.28, CHEER_H * 0.62, 0.04);
    burst.scale.set(0.62, 0.62, 1);
    cheerHold.add(burst);

    const glow = glowSprite(THREE, paper);
    glow.name = 'phone-glow';
    glow.position.set(-0.35, 0.42, 0.03);
    carHold.add(glow);

    const uMark = speechCard(THREE, paper, FONT, 'U', 180, 120, C);
    uMark.name = 'rideshare';
    uMark.position.set(-0.31, 0.54, 0.03);
    uMark.scale.set(0.24, 0.14, 1);
    carHold.add(uMark);

    // ---------------------------------------------------------------- memories
    const frames = [];
    const frameSpecs = [
      ['left', 3.22, 0.42, 0.4, 0.46, -0.05, 3],
      ['right', 2.15, 1.12, 0.44, 0.48, 0.06, 5],
      ['left', 0.72, 1.18, 0.38, 0.42, 0.08, 9],
    ];
    for (let i = 0; i < frameSpecs.length; i++) {
      const [side, x, z, w, h, tilt, seed] = frameSpecs[i];
      const mount = stand(side, x, z, 'back', w, h, 'memory');
      const hold = new THREE.Group();
      hold.name = 'memory';
      hold.rotation.z = tilt;
      const card = paper.card({
        canvas: memoryFrame(paper, FONT, C, seed),
        width: w,
        height: h,
        anchor: 'bottom-center',
      });
      hold.add(card);
      mount.add(hold);
      frames.push(hold);
    }
    const ribbonMount = stand('left', 2.05, 1.42, 'back', 2.2, 0.32, 'ribbon');
    const ribbonHold = new THREE.Group();
    ribbonHold.name = 'memories-ribbon';
    const ribbonCard = paper.card({
      canvas: ribbonBanner(paper, FONT, C),
      width: 2.2,
      height: 0.32,
      anchor: 'bottom-center',
    });
    ribbonHold.add(ribbonCard);
    ribbonMount.add(ribbonHold);

    const walkEnd = chase - 0.45;
    const walkSpan = Math.max(0.5, walkEnd - dogWalk);
    const chaseSpan = Math.max(0.5, rescue - chase);
    const state = { walk: 0, sister: 0, run: 0 };

    const along = (path, u) => {
      const n = path.length - 1;
      const f = clamp01(u) * n;
      const i = Math.min(n - 1, Math.floor(f));
      const tt = f - i;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * tt, path[i][1] + (path[i + 1][1] - path[i][1]) * tt];
    };
    const walkAt = (t) => along(walkPath, (t - dogWalk) / walkSpan);
    const wEarly = walkAt(dogWalk + 1.2);
    const wLate = walkAt(dogWalk + 7.2);
    const sis = along(sisterPath, (sisterAt + 0.7 - dogWalk) / walkSpan);
    const ch = along(carPath, 0.45);
    const endRun = along(runPath, 1);

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 1.8, at: [0, 0.9, 0.05], size: 7.5, from: 'front' },
        { t: ideasAt + 0.55, hold: 2.4, at: [1.9, 0.85, 1.05], size: 2.3, from: 'front' },
        { t: parentsAt + 0.3, hold: 1.8, at: [-1.66, 1.05, -1.0], size: 2.0, from: 'front' },
        { t: dogWalk + 1.2, hold: 2.0, at: [-wEarly[0], 0.9, wEarly[1]], size: 2.4, from: 'left' },
        { t: sisterAt + 0.7, hold: 2.0, at: [-sis[0], 0.85, sis[1]], size: 2.2, from: 'left' },
        {
          t: dogWalk + 7.2,
          hold: 2.2,
          at: [-(wLate[0] + PHOTO_X) * 0.5, 0.65, (wLate[1] + PHOTO_Z) * 0.5],
          size: 3.6,
          from: 'front',
        },
        { t: chase + 0.65, hold: 2.0, at: [ch[0], 0.85, 0.05], size: 4.2, from: 'right' },
        { t: rescue + 0.4, hold: 1.8, at: [(endRun[0] + carPath[2][0]) * 0.5, 0.9, (endRun[1] + carPath[2][1]) * 0.5], size: 3.2, from: 'front' },
        { t: memoriesAt + 0.55, hold: 2.0, at: [-1.85, 0.4, 1.05], size: 3.4, from: 'low' },
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

        const night = smoothstep(nightAt, nightAt + 1.15, t);
        tintC.copy(dayC).lerp(nightC, night);
        for (let i = 0; i < sceneryMats.length; i++) sceneryMats[i].color.copy(tintC);
        const washOp = night * 0.5;
        washMatL.opacity = washOp;
        washMatR.opacity = washOp;
        for (let i = 0; i < glows.length; i++) glows[i].scale.setScalar(night);
        warmLight.intensity = risen * night * (0.7 + 0.12 * Math.sin(t * 3.1));
        coolLight.intensity = risen * night * 0.42;
        lampGlow.scale.setScalar(night);

        const moonShow = popIn(ease, t, nightAt, 0.55);
        const moonS = moonShow;
        const moonBreathe = 1 + Math.sin(t * 1.2) * 0.015 * moonShow;
        moonHold.scale.set(moonBreathe * moonS, moonBreathe * moonS, moonS > 0 ? 1 : 0);
        moonHold.position.y = Math.sin(t * 1.4) * 0.02 * moonShow;

        const ideaPop = popIn(ease, t, ideasAt, 0.42);
        const ideaStay = (1 - smoothstep(dogWalk, dogWalk + 0.8, t) * 0.38)
          * (1 - smoothstep(chase - 0.15, chase + 0.4, t));
        const ideaS = risen * ideaPop * ideaStay;
        const ideaB = 1 + Math.sin(t * 1.5) * 0.012 * (ideaS > 0.2 ? 1 : 0);
        listHold.scale.set(ideaB * ideaS, ideaB * ideaS, ideaS > 0 ? 1 : 0);
        listHold.position.y = Math.sin(t * 1.6) * 0.008 * ideaPop;
        list.dinner.scale.x = smoothstep(crossDinner, crossDinner + 0.42, t);
        list.movies.scale.x = smoothstep(crossMovies, crossMovies + 0.42, t);
        const tick = popIn(ease, t, tickAt, 0.48);
        const flick = Math.sin(clamp01((t - tickAt) / 0.48) * Math.PI);
        list.pick.scale.set(tick, tick, tick > 0 ? 1 : 0);
        list.pick.rotation.z = (1 - tick) * -0.35 + flick * 0.22;

        const photoPop = popIn(ease, t, dogWalk, 0.5);
        photoHold.scale.setScalar(photoPop);
        photoHold.position.y = (1 - photoPop) * 0.18 * (photoPop > 0 ? 1 : 0);

        const walkShow = smoothstep(dogWalk, dogWalk + 0.35, t) * (1 - smoothstep(chase - 0.32, chase - 0.02, t));
        const sisterShow = smoothstep(sisterAt, sisterAt + 0.35, t) * (1 - smoothstep(chase - 0.32, chase - 0.02, t));
        const runShow = smoothstep(chase + 0.02, chase + 0.26, t) * (1 - smoothstep(rescue - 0.24, rescue - 0.02, t));
        const cheerShow = smoothstep(rescue, rescue + 0.28, t);
        const carShow = smoothstep(chase, chase + 0.26, t);

        const breathe = 1 + Math.sin(t * 1.55) * 0.012;
        poseGroup(walkHold, walkFlip, risen * walkShow, breathe, bump(t, dogWalk, 0.36), Math.sin(t * 2.2) * 0.012, state, 'walk', t, dogWalk, 3);
        poseGroup(sisterHold, sisterFlip, risen * sisterShow, breathe, bump(t, sisterAt, 0.34), Math.sin(t * 2.4 + 1) * 0.012, state, 'sister', t, sisterAt, 3);
        poseGroup(runHold, runFlip, risen * runShow, breathe, bump(t, chase, 0.28), Math.sin(t * 3.1) * 0.014, state, 'run', t, chase, 8);

        const tagOn = walkShow > 0 ? 1 : 0;
        tag.position.y = tag.userData.baseY + Math.sin(t * 2.7) * 0.04 * tagOn;
        tag.rotation.z = Math.sin(t * 2.1) * 0.1 * tagOn;

        const cheerPop = bump(t, rescue, 0.32);
        const cs = risen * cheerShow;
        cheerHold.scale.set(breathe * (1 - 0.05 * cheerPop) * cs, breathe * (1 + 0.08 * cheerPop) * cs, cs > 0 ? 1 : 0);
        cheerHold.position.y = Math.sin(t * 2.1) * 0.008 * cheerShow;
        cheerHold.rotation.z = Math.sin(t * 1.7) * 0.012 * cheerShow;
        const pulse = 0.88 + 0.12 * Math.sin(t * 7);
        burst.scale.set(0.62 * pulse, 0.62 * pulse, 1);

        const cr = carShow * risen;
        carHold.scale.set(cr, cr, cr > 0 ? 1 : 0);
        carHold.position.y = Math.sin(t * 9) * 0.004 * carShow * (t < rescue ? 1 : 0.15);
        const glowOn = t < rescue + 0.2 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 8)) : 0;
        glow.scale.setScalar(glowOn * carShow);

        if (parents) {
          const w = twitch(t, parentsAt);
          parents.position.x = parentsX + w * 0.03;
          parents.position.y = parentsY;
          parents.rotation.z = w * 0.08;
        }

        for (let i = 0; i < frames.length; i++) {
          const p = popIn(ease, t, memoriesAt + i * 0.16, 0.4);
          const b = 1 + Math.sin(t * 1.8 + i) * 0.02 * p;
          frames[i].scale.set(b * p, b * p, p > 0 ? 1 : 0);
        }
        const rib = popIn(ease, t, memoriesAt + 0.12, 0.5);
        ribbonHold.scale.set(rib, rib, rib > 0 ? 1 : 0);
        ribbonHold.position.y = Math.sin(t * 1.5) * 0.006 * rib;
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

function roundCard(ctx, w, h, fill, stroke) {
  const m = 28;
  ctx.beginPath();
  ctx.roundRect(m, m, w - m * 2, h - m * 2, 36);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function buildList(THREE, paper, FONT, C, worldW, worldH) {
  const W = 920;
  const H = 700;
  const title = L('DATE IDEAS', 'IDEAS PARA CITAS');
  const dinner = L('dinner', 'cena');
  const movies = L('movies', 'cine');
  const pick = L('✓ walk the dog!', '✓ ¡pasear al perro!');
  const canvas = paper.paint(W, H, (ctx, w, h) => {
    roundCard(ctx, w, h, '#fffaf1', C.kraftDeep);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.tomato;
    const titlePx = fitSize(ctx, title, (n) => `700 ${n}px ${FONT.display}`, Math.round(h * 0.11), w * 0.78);
    ctx.font = `700 ${titlePx}px ${FONT.display}`;
    ctx.fillText(title, w / 2, h * 0.2);
    ctx.fillStyle = C.ink;
    const row = (text, y) => {
      const px = fitSize(ctx, text, (n) => `700 ${n}px ${FONT.hand}`, Math.round(h * 0.09), w * 0.72);
      ctx.font = `700 ${px}px ${FONT.hand}`;
      ctx.fillText(text, w / 2, y);
    };
    row(dinner, h * 0.38);
    row(movies, h * 0.54);
    ctx.strokeStyle = 'rgba(169, 129, 79, 0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.76);
    ctx.lineTo(w * 0.84, h * 0.76);
    ctx.stroke();
  }, { dieCut: 12, seed: 11 });
  const root = new THREE.Group();
  const card = paper.card({ canvas, width: worldW, height: worldH, anchor: 'bottom-center' });
  root.add(card);

  const strike = (fracY) => {
    const mesh = lineMesh(THREE, paper, C.tomato);
    mesh.position.set(-worldW * 0.34, (1 - fracY) * worldH, 0.025);
    mesh.rotation.z = -0.06;
    mesh.scale.x = 0;
    root.add(mesh);
    return mesh;
  };
  const dinnerStrike = strike(0.38);
  const moviesStrike = strike(0.54);

  const pickCanvas = paper.paint(860, 160, (ctx, w, h) => {
    roundCard(ctx, w, h, '#fff6df', C.mustard);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.leaf;
    const px = fitSize(ctx, pick, (n) => `700 ${n}px ${FONT.hand}`, Math.round(h * 0.42), w * 0.84);
    ctx.font = `700 ${px}px ${FONT.hand}`;
    ctx.fillText(pick, w / 2, h * 0.52);
  }, { dieCut: 8, seed: 13 });
  const pickCard = paper.card({
    canvas: pickCanvas,
    width: worldW * 0.88,
    height: worldW * 0.88 * (160 / 860),
    anchor: 'bottom-center',
  });
  const pickHold = new THREE.Group();
  pickHold.add(pickCard);
  pickHold.position.set(0, (1 - 0.84) * worldH, 0.035);
  pickHold.scale.set(0, 0, 0);
  root.add(pickHold);
  return { root, dinner: dinnerStrike, movies: moviesStrike, pick: pickHold };
}

function lineMesh(THREE, paper, color) {
  const canvas = paper.paint(480, 48, (ctx, w, h) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(16, h * 0.55);
    ctx.quadraticCurveTo(w * 0.5, h * 0.3, w - 16, h * 0.62);
    ctx.stroke();
  }, { dieCut: 0, grain: 0.02, seed: 4 });
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
  });
  const geo = new THREE.PlaneGeometry(1.02, 0.06);
  geo.translate(0.51, 0, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function nameTag(THREE, paper, FONT, C) {
  const text = L('Oliver', 'Oliver');
  const canvas = paper.paint(480, 260, (ctx, w, h) => {
    roundCard(ctx, w, h, '#fffaf1', C.kraftDeep);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = fitSize(ctx, text, (n) => `700 ${n}px ${FONT.hand}`, Math.round(h * 0.34), w * 0.8);
    ctx.font = `700 ${px}px ${FONT.hand}`;
    ctx.fillText(text, w / 2, h * 0.4);
    ctx.fillStyle = C.tomato;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.86);
    ctx.lineTo(w * 0.38, h * 0.62);
    ctx.lineTo(w * 0.62, h * 0.62);
    ctx.closePath();
    ctx.fill();
  }, { dieCut: 8, seed: 6 });
  const card = paper.card({ canvas, width: 0.46, height: 0.22, anchor: 'bottom-center' });
  const g = new THREE.Group();
  g.add(card);
  return g;
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
      const px = fitSize(ctx, text, (n) => `700 ${n}px ${FONT.display}`, Math.round(ph * 0.15), pw * 0.7);
      ctx.font = `700 ${px}px ${FONT.display}`;
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
      const px = fitSize(ctx, text, (n) => `700 ${n}px ${face}`, Math.round(ph * (text.length < 3 ? 0.46 : 0.32)), pw * 0.84);
      ctx.font = `700 ${px}px ${face}`;
      ctx.fillText(text, pw / 2, ph * 0.52);
    }
  }, { dieCut: 8, seed: text.length * 3 });
  const card = paper.card({ canvas, width: 1, height: h / w, anchor: 'bottom-center' });
  const g = new THREE.Group();
  g.add(card);
  return g;
}

function memoryFrame(paper, FONT, C, seed) {
  return paper.paint(420, 500, (ctx, w, h) => {
    ctx.fillStyle = '#fffaf1';
    ctx.strokeStyle = C.kraftDeep;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(18, 18, w - 36, h - 36, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f3e2c4';
    ctx.fillRect(w * 0.18, 36, w * 0.28, 22);
    ctx.strokeStyle = C.blush;
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 78, w - 96, h * 0.52);
    const heart = (x, y, r) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.85);
      ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.5, -r * 1.1, 0, -r * 0.32);
      ctx.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.3, -r * 0.1, 0, r * 0.85);
      ctx.fillStyle = seed % 2 === 0 ? C.tomato : C.blush;
      ctx.fill();
      ctx.restore();
    };
    heart(w * 0.38, h * 0.4, 28 + (seed % 5));
    heart(w * 0.62, h * 0.48, 18);
    heart(w * 0.5, h * 0.32, 12);
    ctx.fillStyle = C.ink;
    ctx.font = `700 28px ${FONT.hand}`;
    ctx.textAlign = 'center';
    ctx.fillText('♥', w * 0.5, h * 0.82);
  }, { dieCut: 8, seed });
}

function ribbonBanner(paper, FONT, C) {
  const text = L('memories of our own', 'nuestros propios recuerdos');
  return paper.paint(1100, 200, (ctx, w, h) => {
    ctx.fillStyle = C.tomato;
    ctx.beginPath();
    ctx.moveTo(20, h * 0.28);
    ctx.lineTo(70, h * 0.5);
    ctx.lineTo(20, h * 0.72);
    ctx.lineTo(50, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w - 20, h * 0.28);
    ctx.lineTo(w - 70, h * 0.5);
    ctx.lineTo(w - 20, h * 0.72);
    ctx.lineTo(w - 50, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(48, h * 0.22, w - 96, h * 0.56);
    ctx.fillStyle = '#fffaf1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = fitSize(ctx, text, (n) => `700 ${n}px ${FONT.hand}`, Math.round(h * 0.34), w * 0.78);
    ctx.font = `700 ${px}px ${FONT.hand}`;
    ctx.fillText(text, w / 2, h * 0.5);
  }, { dieCut: 6, seed: 15 });
}

function glowPlane(THREE, paper, w, h, color) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  const grd = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255, 236, 190, 0.95)');
  grd.addColorStop(0.55, 'rgba(255, 176, 80, 0.45)');
  grd.addColorStop(1, 'rgba(255, 176, 80, 0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    color,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function glowSprite(THREE, paper) {
  const mesh = glowPlane(THREE, paper, 0.28, 0.28, '#ffffff');
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

function washMaterial(THREE) {
  return new THREE.MeshBasicMaterial({
    color: '#24365e',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
}

function washMesh(THREE, mat) {
  const geo = new THREE.PlaneGeometry(3.35, 0.78);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'night-wash';
  return mesh;
}
