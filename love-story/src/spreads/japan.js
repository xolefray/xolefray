// Spread — "Our Japan adventure". Left page: Asakusa by day. Right page: Tokyo by night.
// One hero owns the centre at a time. Sky + Fuji stay at the back. Times come from BEATS.
// Lettering is drawn in code through L(). update() allocates nothing. Cards stay opaque.
import { L } from '../i18n.js';
import { PHOTO_ASPECT, photoPrint } from '../photos.js';

const HERO = 1.7;
const WALK_H = 1.7;
const RAMEN_H = 1.66;
const ARCH_G = Math.PI / 2 + 0.13;
const ARCH_Z = -0.85;
const ARCH_SIN = Math.sin(ARCH_G);
// Hug, heart and the anniversary banner share this hinge. Far enough from the
// gutter that a square heart (≤ 2 tall) and a wide ribbon above their heads
// both stay inside the loose fold limit.
const HUG_X = 2.02;
const HUG_Z = 0.92;
const SKY_Z = -1.18;
const SKY_W = 4.8;
const SKY_H = 1.58;
const FUJI_Z = -0.55;
const FUJI_H = 1.12;
const LANTERN_N = 9;
const LANTERN_H = 0.4;

const FLIGHT = [
  [-3.15, 0.05], [-2.25, 0.95], [-1.3, -0.2], [-0.35, 0.85],
  [0.6, -0.05], [1.5, 0.9], [2.4, 0.1], [3.15, 0.5],
];
const WALK = [
  [-2.35, 0.72], [-1.45, 0.7], [-0.55, 0.66],
  [0.75, 0.62], [1.6, 0.58], [2.4, 0.54],
];
const BYE = [
  [0.22, 0.64], [1.15, 0.6], [2.05, 0.55], [2.82, 0.48],
];

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

function bump(t, at, dur) {
  const u = (t - at) / dur;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

// Paper flip: 0 hidden, 1 face-on. Scale X only, so the card turns edge-on and stays opaque.
function face(t, tIn, tOut) {
  const IN = 0.24;
  const OUT = 0.2;
  if (t < tIn) return 0;
  if (t < tIn + IN) return Math.sin(((t - tIn) / IN) * Math.PI * 0.5);
  if (tOut && t > tOut) {
    const u = (t - tOut) / OUT;
    if (u >= 1) return 0;
    return Math.cos(Math.min(1, u) * Math.PI * 0.5);
  }
  return 1;
}

function applyFace(obj, f, breathe, kick) {
  if (f < 0.02) {
    obj.scale.set(0, 0, 0);
    return;
  }
  obj.scale.set(f, breathe * (1 + 0.06 * kick), 1);
}

function setShow(obj, s) {
  if (s < 0.02) obj.scale.set(0, 0, 0);
  else obj.scale.set(s, s, 1);
}

function fitSize(ctx, text, font, px, maxW) {
  let size = px;
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  if (w > maxW && w > 0) size *= maxW / w;
  return size;
}

function seat(card, info, height) {
  if (!card || !info) return;
  card.position.y = (info.h - info.feet[1]) * (height / info.h);
}

function widthOf(info, height, fallback) {
  if (!info || !(info.h > 0)) return fallback;
  return info.w * (height / info.h);
}

export default {
  id: 'japan',
  title: 'Our Japan adventure',
  build(ctx) {
    const { THREE, paper, popup, characters, characterArt, art, FONT, timeline, figures, photos } = ctx;
    const { BEATS, SPREADS, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'japan');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'japan';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const open = spread.open;
    const twoYears = BEATS.twoYears;
    const flight = BEATS.flight;
    const arrive = BEATS.arrive;
    const tokyo = BEATS.tokyo;
    const asakusa = BEATS.asakusa;
    const neon = BEATS.neon;
    const food = BEATS.food;
    const lost = BEATS.lost;
    const laughed = BEATS.laughed;
    const lanterns = BEATS.lanterns;
    const anniversary = BEATS.anniversary;
    const more = BEATS.moreThanATrip;
    const next = BEATS.nextChapter;
    // Last 1.3 s before the closing turn window (close − 0.4) is the final wide.
    const wideAt = spread.close - 0.4 - 1.3;

    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      leftArt = art.canvas('page-left');
      rightArt = art.canvas('page-right');
    } else {
      leftArt = paper.page((g, w, h) => {
        g.fillStyle = '#e7d7bf';
        g.fillRect(0, 0, w, h);
      }, { seed: 71, tint: '#e7d7bf' });
      rightArt = paper.page((g, w, h) => {
        g.fillStyle = '#1c2448';
        g.fillRect(0, 0, w, h);
      }, { seed: 72, tint: '#1c2448' });
    }

    const folds = [];
    const track = (m) => {
      folds.push(m);
      group.add(m.object);
      return m;
    };
    const holdOf = (parent, name) => {
      const h = new THREE.Group();
      h.name = name;
      parent.add(h);
      return h;
    };
    const stand = (side, x, z, fold, width, height, name) => {
      const m = track(popup.standUp({ side, x, z, fold, width, height }));
      return holdOf(m.mount, name);
    };

    const prop = (id, height) => {
      if (!has(id)) return null;
      const card = characterArt.characterCard(paper, art, id, { height });
      if (!card) return null;
      card.name = id;
      seat(card, info(id), height);
      return card;
    };
    const sheet = (id, height) => {
      if (!has(id)) return null;
      const card = oneSided(THREE, paper, art.canvas(id), info(id), height);
      if (card) card.name = id;
      return card;
    };
    const nightMats = [];
    const tintOf = (root) => {
      if (!root) return;
      root.traverse((o) => {
        if (o.isMesh && o.material && o.material.color && !o.material.userData.noTint) nightMats.push(o.material);
      });
    };

    // ------------------------------------------------------------------ back: sky, then Fuji. Up for the whole chapter.
    const sky = track(popup.vFold({ z0: SKY_Z, gamma: 1.68, width: SKY_W, height: SKY_H }));
    sky.object.name = 'sky';
    const skyMat = has('sky-day') ? mapMat(THREE, paper, art.canvas('sky-day')) : null;
    const nightMat = has('sky-night') ? mapMat(THREE, paper, art.canvas('sky-night')) : null;
    if (skyMat) {
      const dayL = halfPlane(THREE, skyMat, SKY_W, SKY_H, -1);
      const dayR = halfPlane(THREE, skyMat, SKY_W, SKY_H, 1);
      sky.left.add(dayL);
      sky.right.add(dayR);
    }
    const nightPivots = [];
    if (nightMat) {
      const nL = halfPlane(THREE, nightMat, SKY_W, SKY_H, -1);
      const nR = halfPlane(THREE, nightMat, SKY_W, SKY_H, 1);
      const pL = holdOf(sky.left, 'sky-night-l');
      const pR = holdOf(sky.right, 'sky-night-r');
      pL.position.z = 0.01;
      pR.position.z = 0.01;
      pL.add(nL);
      pR.add(nR);
      nightPivots.push(pL, pR);
    }
    const starDots = [];
    if (nightPivots.length) {
      const starGeo = new THREE.PlaneGeometry(0.08, 0.08);
      const starMat = new THREE.MeshBasicMaterial({
        map: paper.texture(starCanvas(paper)),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const at = [[-1.15, 1.15], [1.2, 1.05]];
      for (let i = 0; i < at.length; i++) {
        const mesh = new THREE.Mesh(starGeo, starMat);
        mesh.name = 'star';
        mesh.position.set(at[i][0], at[i][1], 0.008);
        mesh.castShadow = false;
        nightPivots[i === 0 ? 0 : 1].add(mesh);
        starDots.push(mesh);
      }
    }

    const fujiW = widthOf(info('fuji'), FUJI_H, 3.2);
    const fuji = track(popup.vFold({ z0: FUJI_Z, gamma: 1.68, width: fujiW, height: FUJI_H }));
    fuji.object.name = 'fuji';
    if (has('fuji')) {
      const parts = paper.splitCard({
        canvas: paper.dieCut(art.canvas('fuji'), { margin: 6 }),
        width: fujiW,
        height: FUJI_H,
      });
      parts.left.name = 'fuji-l';
      parts.right.name = 'fuji-r';
      fuji.left.add(parts.left);
      fuji.right.add(parts.right);
    }

    // ------------------------------------------------------------------ left page: Asakusa set, stays once it rises
    const pagodaH = 2.02;
    const pagoda = stand('left', 3.05, -1.02, 'front', widthOf(info('pagoda'), pagodaH, 1), pagodaH, 'pagoda');
    const pagodaCard = sheet('pagoda', pagodaH);
    if (pagodaCard) pagoda.add(pagodaCard);

    const gateH = 1.8;
    const gateW = widthOf(info('kaminarimon'), gateH, 2.4);
    const gate = stand('left', 2.18, -0.52, 'front', gateW, gateH + 0.1, 'gate');
    const gateCard = sheet('kaminarimon', gateH);
    if (gateCard) {
      gateCard.position.y += 0.1;
      gate.add(gateCard);
    }

    const plumH = 0.92;
    const plumW = widthOf(info('plum-branch'), plumH, 0.95);
    const plum = stand('left', 1.48, 0.02, 'back', plumW, plumH, 'plum');
    const plumCard = sheet('plum-branch', plumH);
    if (plumCard) {
      plumCard.traverse((o) => { if (o.isMesh) o.position.x = 0; });
      plum.add(plumCard);
    }

    // ------------------------------------------------------------------ right page: night set lives here, heroes stay in front of it
    const cityH = 1.88;
    const cityNat = widthOf(info('city-night'), cityH, 2.8);
    const cityW = 2.58;
    const city = stand('right', 0.98 + cityW / 2, -0.58, 'front', cityW, cityH, 'city');
    const cityCard = sheet('city-night', cityH);
    if (cityCard) {
      cityCard.scale.x = cityNat > 0 ? cityW / cityNat : 1;
      city.add(cityCard);
      tintOf(cityCard);
    }

    const neonSpec = [
      ['neon-sign-a', 0.82, 1.72, -0.22, '#ff8ab6'],
      ['neon-sign-b', 0.66, 2.48, -0.02, '#7ef0e0'],
      ['neon-sign-c', 0.48, 2.86, -0.28, '#ffd56a'],
    ];
    const neons = [];
    for (let i = 0; i < neonSpec.length; i++) {
      const [id, h, x, z, glowColor] = neonSpec[i];
      const w = widthOf(info(id), h, 0.5);
      const hold = stand('right', x, z, 'back', Math.max(0.4, w), h, id);
      let card = null;
      if (has(id)) {
        const solid = solidSign(paper, art.canvas(id));
        card = oneSided(THREE, paper, solid, info(id), h);
        card.name = id;
        hold.add(card);
        tintOf(card);
      }
      const glowW = Math.min(Math.max(w, h * 0.45) * 1.1, Math.max(0.36, (3.48 - x) * 2));
      const glowH = h * 1.12;
      const glowGeo = new THREE.PlaneGeometry(glowW, glowH);
      glowGeo.translate(0, glowH * 0.5, 0);
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      glow.name = `${id}-glow`;
      glow.position.set(0, 0, -0.02);
      glow.castShadow = false;
      glow.material.userData.noTint = true;
      hold.add(glow);
      neons.push({ hold, glow });
    }

    const vendH = 1.05;
    const vend = stand('right', 3.22, 0.02, 'back', widthOf(info('vending-machine'), vendH, 0.55), vendH, 'vending');
    const vendCard = sheet('vending-machine', vendH);
    const vendMats = [];
    if (vendCard) {
      vend.add(vendCard);
      tintOf(vendCard);
      vendCard.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) {
          o.material.emissive.setRGB(0.784, 1, 0.941);
          vendMats.push(o.material);
        }
      });
    }

    const signH = 1.28;
    const signW = widthOf(info('signpost'), signH, 0.7);
    const sign = stand('right', 3.05, 0.42, 'back', signW, signH, 'signpost');
    if (has('signpost')) {
      const paintedSign = cloneCanvas(paper, art.canvas('signpost'));
      letterSign(paintedSign.ctx, paintedSign.canvas, FONT);
      const card = oneSided(THREE, paper, paintedSign.canvas, info('signpost'), signH);
      card.name = 'signpost';
      card.position.y += 0.06;
      sign.add(card);
      tintOf(card);
    }

    // ------------------------------------------------------------------ opening: suitcase, tag, pass, centre front
    const suitH = 1.38;
    const suitW = widthOf(info('suitcase-stickers'), suitH, 0.85);
    const suit = stand('right', 1.58, 0.95, 'back', Math.max(suitW, 1.15), suitH + 0.55, 'suitcase');
    const suitCard = prop('suitcase-stickers', suitH);
    if (suitCard) suit.add(suitCard);
    const tagW = 0.86;
    const tag = painted(THREE, paper, heartTag(paper, FONT, L('2 years ♥', '2 años ♥')), tagW);
    tag.name = 'heart-tag';
    tag.position.set(-0.02, suitH * 0.78, 0.03);
    suit.add(tag);
    const passH = 0.48;
    const passW = widthOf(info('boarding-pass'), passH, 1.15);
    let pass = null;
    if (has('boarding-pass')) {
      const paintedPass = cloneCanvas(paper, art.canvas('boarding-pass'));
      letterPass(paintedPass.ctx, paintedPass.canvas, FONT, L('TO: JAPAN', 'DESTINO: JAPÓN'));
      pass = oneSided(THREE, paper, paintedPass.canvas, info('boarding-pass'), passH);
      pass.name = 'boarding-pass';
      pass.position.set(0.05, suitH * 0.34, 0.02);
      suit.add(pass);
    }

    // ------------------------------------------------------------------ flight
    const planeSlider = track(popup.slider({ side: 'spread', path: FLIGHT, lift: 0.006, smooth: true }));
    const planeRoot = holdOf(planeSlider.mount, 'plane');
    // Long side of the drawing (620×408). Height 1.45 → about 2.2 long, facing the reader.
    const planeCard = prop('paper-plane', 1.45);
    if (planeCard) planeRoot.add(planeCard);
    const cloudL = track(popup.onPage({ side: 'left', x: 1.85, z: -0.35, lift: 0.004 }));
    const cloudR = track(popup.onPage({ side: 'right', x: 2.05, z: 0.15, lift: 0.004 }));
    const cloudA = painted(THREE, paper, cloudCanvas(paper), 0.62);
    const cloudB = painted(THREE, paper, cloudCanvas(paper), 0.48);
    cloudA.name = 'cloud-a';
    cloudB.name = 'cloud-b';
    cloudA.rotation.x = -Math.PI / 2;
    cloudB.rotation.x = -Math.PI / 2;
    cloudL.mount.add(cloudA);
    cloudR.mount.add(cloudB);

    // Standing beads, not flat specks, so the trail reads from the front.
    const dotGeo = new THREE.PlaneGeometry(0.46, 0.46);
    dotGeo.translate(0, 0.23, 0);
    const dotMat = new THREE.MeshBasicMaterial({
      map: paper.texture(dotCanvas(paper, { mustard: '#e07a28', teal: '#e07a28' })),
      alphaTest: 0.4,
      depthWrite: false,
    });
    const TRAIL = [];
    for (let i = 0; i < FLIGHT.length - 1; i++) {
      for (let s = 0; s < 4; s++) {
        const f = s / 4;
        TRAIL.push([
          FLIGHT[i][0] + (FLIGHT[i + 1][0] - FLIGHT[i][0]) * f,
          FLIGHT[i][1] + (FLIGHT[i + 1][1] - FLIGHT[i][1]) * f,
        ]);
      }
    }
    TRAIL.push(FLIGHT[FLIGHT.length - 1]);
    const leftDots = [];
    const rightDots = [];
    for (let i = 0; i < TRAIL.length; i++) (TRAIL[i][0] < 0 ? leftDots : rightDots).push(i);
    const DOT_X = 1.7;
    const dotsPageL = track(popup.onPage({ side: 'left', x: DOT_X, z: 0, lift: 0.008 }));
    const dotsPageR = track(popup.onPage({ side: 'right', x: DOT_X, z: 0, lift: 0.008 }));
    const dotsL = new THREE.InstancedMesh(dotGeo, dotMat, Math.max(1, leftDots.length));
    const dotsR = new THREE.InstancedMesh(dotGeo, dotMat, Math.max(1, rightDots.length));
    dotsL.name = 'flight-dots-l';
    dotsR.name = 'flight-dots-r';
    dotsL.castShadow = dotsR.castShadow = false;
    dotsPageL.mount.add(dotsL);
    dotsPageR.mount.add(dotsR);

    // ------------------------------------------------------------------ heroes, one at a time, front half
    const arriveW = widthOf(charInfo(characters, 'japan-arrive'), HERO, 1.3);
    const arriveHold = stand('left', 1.72, 0.8, 'back', arriveW, HERO, 'japan-arrive');
    const arriveCard = characterArt.actor(
      paper, characters, figures, 'japan-arrive',
      { who: 'her', outfit: 'casual', pose: 'wave' },
      { height: HERO },
    );
    if (arriveCard) {
      arriveCard.name = 'japan-arrive';
      seat(arriveCard, charInfo(characters, 'japan-arrive'), HERO);
      arriveHold.add(arriveCard);
    }
    const bubble = painted(THREE, paper, speech(paper, FONT, C, L('We made it!', '¡Llegamos!')), 0.98);
    bubble.name = 'made-it';
    bubble.position.set(-0.72, HERO * 0.92, 0.018);
    arriveHold.add(bubble);

    const stamp = painted(THREE, paper, stampArt(paper, FONT, L('JAPAN', 'JAPÓN')), 0.58);
    stamp.name = 'passport-stamp';
    const stampHold = stand('left', 3.15, 1.02, 'back', 0.62, 0.62, 'stamp');
    stampHold.add(stamp);

    const walkSlider = track(popup.slider({ side: 'spread', path: WALK, lift: 0.012, smooth: false }));
    const walkRoot = holdOf(walkSlider.mount, 'japan-walk');
    const walkIds = characters && characters.cycle ? characters.cycle('japan-walk') : [];
    const walkFlip = walkIds.length
      ? characterArt.characterFlip(paper, characters, walkIds, { height: WALK_H })
      : null;
    if (walkFlip) {
      seat(walkFlip.group, charInfo(characters, walkIds[0]), WALK_H);
      walkRoot.add(walkFlip.group);
      tintOf(walkFlip.group);
    } else {
      const one = characterArt.actor(
        paper, characters, figures, 'japan-walk-0',
        { who: 'her', outfit: 'casual', pose: 'walk' },
        { height: WALK_H },
      );
      if (one) {
        one.name = 'japan-walk-0';
        seat(one, charInfo(characters, 'japan-walk-0'), WALK_H);
        walkRoot.add(one);
        tintOf(one);
      }
    }

    const selfieW = widthOf(charInfo(characters, 'japan-selfie'), HERO, 1);
    const selfieHold = stand('left', 1.58, 0.84, 'back', selfieW, HERO, 'japan-selfie');
    const selfieCard = characterArt.actor(
      paper, characters, figures, 'japan-selfie',
      { who: 'her', outfit: 'casual', pose: 'wave' },
      { height: HERO },
    );
    if (selfieCard) {
      selfieCard.name = 'japan-selfie';
      seat(selfieCard, charInfo(characters, 'japan-selfie'), HERO);
      selfieHold.add(selfieCard);
    }
    const flashMat = new THREE.MeshBasicMaterial({
      color: '#fffaf0',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.55), flashMat);
    flash.name = 'flash';
    flash.position.set(0.05, 0.95, 0.018);
    flash.castShadow = false;
    selfieHold.add(flash);

    const shot = photoPrint(photos ? photos.tokyo : null, {
      width: 520,
      style: 'polaroid',
      caption: L('Tokyo · 2 years', 'Tokio · 2 años'),
      tilt: -0.04,
      tape: true,
      aspect: PHOTO_ASPECT.tokyo,
      seed: 21,
    });
    const shotRatio = shot.width / shot.height;
    const shotLong = 1.18;
    const shotW = shotRatio >= 1 ? shotLong : shotLong * shotRatio;
    const shotH = shotRatio >= 1 ? shotLong / shotRatio : shotLong;
    const printHold = stand('left', 3.02, 0.62, 'back', shotW, shotH, 'tokyo-print');
    const printCard = paper.card({
      canvas: paper.dieCut(shot, { margin: 2 }),
      width: shotW,
      height: shotH,
      anchor: 'bottom-center',
    });
    printCard.name = 'tokyo-print';
    printHold.add(printCard);

    const stallH = 1.42;
    const stallW = widthOf(info('ramen-stall'), stallH, 1.35);
    const stall = stand('right', 2.12, 0.22, 'back', stallW, stallH, 'ramen-stall');
    const stallCard = sheet('ramen-stall', stallH);
    if (stallCard) {
      stall.add(stallCard);
      tintOf(stallCard);
    }
    const steam = [];
    const steamGeo = new THREE.PlaneGeometry(0.26, 0.4);
    const steamMat = new THREE.MeshBasicMaterial({
      map: paper.texture(steamCanvas(paper)),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    steamMat.userData.noTint = true;
    {
      const mesh = new THREE.Mesh(steamGeo, steamMat);
      mesh.name = 'steam';
      mesh.position.set(0.02, stallH * 0.62, 0.018);
      mesh.castShadow = false;
      stall.add(mesh);
      steam.push(mesh);
    }

    const ramenW = widthOf(charInfo(characters, 'japan-ramen'), RAMEN_H, 1.6);
    const ramenHold = stand('right', 2.02, 0.98, 'back', ramenW, RAMEN_H, 'japan-ramen');
    const ramenCard = characterArt.actor(
      paper, characters, figures, 'japan-ramen',
      { who: 'couple', outfit: 'casual', pose: 'sit' },
      { height: RAMEN_H },
    );
    if (ramenCard) {
      ramenCard.name = 'japan-ramen';
      seat(ramenCard, charInfo(characters, 'japan-ramen'), RAMEN_H);
      ramenHold.add(ramenCard);
      tintOf(ramenCard);
    }
    const tried = painted(THREE, paper, noteArt(paper, FONT, C, L('we tried everything', 'probamos de todo')), 1.25);
    tried.name = 'tried-everything';
    tried.position.set(0.15, RAMEN_H * 0.98, 0.018);
    ramenHold.add(tried);

    const foods = [];
    const foodIds = ['food-sushi', 'food-ramen', 'food-dango', 'food-taiyaki', 'food-matcha'];
    const foodBits = [];
    let foodSpan = 0;
    for (let i = 0; i < foodIds.length; i++) {
      const id = foodIds[i];
      const h = 0.34;
      const bit = has(id) ? oneSided(THREE, paper, ticked(paper, art.canvas(id)), info(id), h) : null;
      if (!bit) continue;
      bit.name = id;
      const w = widthOf(info(id), h, 0.28);
      foodBits.push({ bit, w });
      foodSpan += w + 0.05;
    }
    const snack = stand('right', 2.15, 1.18, 'back', Math.min(2.3, foodSpan + 0.15), 0.5, 'snacks');
    let foodX = -foodSpan / 2;
    for (let i = 0; i < foodBits.length; i++) {
      const { bit, w } = foodBits[i];
      bit.position.set(foodX + w / 2, 0, 0.02);
      foodX += w + 0.05;
      snack.add(bit);
      foods.push(bit);
      tintOf(bit);
    }

    const lostH = HERO;
    const lostW = widthOf(charInfo(characters, 'japan-lost-0'), lostH, 1.4);
    const lostHold = stand('right', 1.98, 0.86, 'back', lostW, lostH, 'japan-lost');
    const lostIds = characters && characters.cycle ? characters.cycle('japan-lost') : [];
    const lostFlip = lostIds.length
      ? characterArt.characterFlip(paper, characters, lostIds, { height: lostH })
      : null;
    if (lostFlip) {
      seat(lostFlip.group, charInfo(characters, lostIds[0]), lostH);
      lostHold.add(lostFlip.group);
      tintOf(lostFlip.group);
    } else {
      const one = characterArt.actor(
        paper, characters, figures, 'japan-lost-0',
        { who: 'him', outfit: 'casual', pose: 'think' },
        { height: lostH },
      );
      if (one) {
        one.name = 'japan-lost-0';
        seat(one, charInfo(characters, 'japan-lost-0'), lostH);
        lostHold.add(one);
        tintOf(one);
      }
    }
    const qMark = painted(THREE, paper, questionArt(paper, FONT, C), 0.36);
    qMark.name = 'lost-question';
    qMark.position.set(0.82, lostH * 0.86, 0.018);
    lostHold.add(qMark);
    const haCanvas = haArt(paper, FONT, C, L('ha ha ha!', '¡ja, ja, ja!'));
    const ha = [];
    const haBaseY = [];
    for (let i = 0; i < 3; i++) {
      const mesh = painted(THREE, paper, haCanvas, 0.78 - i * 0.06);
      mesh.name = 'ha-ha';
      const y = lostH * 0.78 + i * 0.1;
      mesh.position.set(-0.42 + i * 0.46, y, 0.018);
      mesh.rotation.z = -0.16 + i * 0.16;
      lostHold.add(mesh);
      ha.push(mesh);
      haBaseY.push(y);
    }

    const pathPage = track(popup.onPage({ side: 'right', x: 1.7, z: 0.55, lift: 0.01 }));
    const PATH_N = 14;
    const pathX = new Float64Array(PATH_N);
    const pathZ = new Float64Array(PATH_N);
    const pathA = new Float64Array(PATH_N);
    for (let i = 0; i < PATH_N; i++) {
      const a = (i / PATH_N) * Math.PI * 2;
      pathX[i] = Math.cos(a) * 0.48;
      pathZ[i] = Math.sin(a) * 0.28;
      pathA[i] = a + Math.PI * 0.5;
    }
    const dashGeo = new THREE.PlaneGeometry(0.16, 0.035);
    dashGeo.rotateX(-Math.PI / 2);
    const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({
      map: paper.texture(dashCanvas(paper, C)),
      alphaTest: 0.4,
      depthWrite: false,
    }), PATH_N);
    dashes.name = 'lost-path';
    dashes.castShadow = false;
    pathPage.mount.add(dashes);

    // ------------------------------------------------------------------ lantern arch across the gutter, above the couple
    const arch = track(popup.vFold({ z0: ARCH_Z, gamma: ARCH_G, width: 4.9, height: 2.36 }));
    arch.object.name = 'lantern-arch';
    const archL = holdOf(arch.left, 'arch-l');
    const archR = holdOf(arch.right, 'arch-r');
    const ropeMat = new THREE.MeshStandardMaterial({ color: '#8a3d32', roughness: 0.9 });
    const lanternX = new Float64Array(LANTERN_N);
    const lanternY = new Float64Array(LANTERN_N);
    const lanternLx = new Float64Array(LANTERN_N);
    const lanternMeshes = [];
    const lanternMats = [];
    const lanternProto = has('lantern') ? oneSided(THREE, paper, art.canvas('lantern'), info('lantern'), LANTERN_H) : null;
    for (let i = 0; i < LANTERN_N; i++) {
      const x = -2.25 + (4.5 * i) / (LANTERN_N - 1);
      const u = x / 2.25;
      lanternX[i] = x;
      // A real arc: high over the gutter, dipping toward each fore-edge.
      lanternY[i] = 1.88 - 0.55 * u * u;
      lanternLx[i] = x / ARCH_SIN;
      if (!lanternProto) continue;
      const g = lanternProto.clone(true);
      g.name = 'lantern';
      g.position.set(lanternLx[i], lanternY[i], 0.03);
      g.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone();
          o.material.emissive = new THREE.Color('#ffb15a');
          o.material.emissiveIntensity = 0;
          lanternMats.push(o.material);
        }
      });
      (x < 0 ? archL : archR).add(g);
      lanternMeshes.push(g);
    }
    const ropeL = [];
    const ropeR = [];
    for (let i = 0; i < LANTERN_N - 1; i++) {
      const x0 = lanternLx[i];
      const y0 = lanternY[i] + LANTERN_H * 0.92;
      const x1 = lanternLx[i + 1];
      const y1 = lanternY[i + 1] + LANTERN_H * 0.92;
      const crosses = lanternX[i] < 0 && lanternX[i + 1] >= 0;
      if (crosses) {
        ropeL.push(x0, y0, 0, (y0 + y1) * 0.5);
        ropeR.push(0, (y0 + y1) * 0.5, x1, y1);
      } else if (lanternX[i] < 0) {
        ropeL.push(x0, y0, x1, y1);
      } else {
        ropeR.push(x0, y0, x1, y1);
      }
    }
    addRopeInstances(THREE, ropeMat, archL, ropeL);
    addRopeInstances(THREE, ropeMat, archR, ropeR);

    const wishH = 1.7;
    const wishW = widthOf(charInfo(characters, 'japan-wish'), wishH, 0.95);
    const wishHold = stand('left', 1.4, 0.86, 'back', wishW, wishH, 'japan-wish');
    const wishCard = characterArt.actor(
      paper, characters, figures, 'japan-wish',
      { who: 'couple', outfit: 'casual', pose: 'stand' },
      { height: wishH },
    );
    if (wishCard) {
      wishCard.name = 'japan-wish';
      seat(wishCard, charInfo(characters, 'japan-wish'), wishH);
      wishHold.add(wishCard);
    }
    const moteGeo = new THREE.PlaneGeometry(0.09, 0.09);
    moteGeo.translate(0, 0.045, 0);
    const moteMat = new THREE.MeshBasicMaterial({
      map: paper.texture(dotCanvas(paper, { teal: '#ffd27a', mustard: '#fff4d2' })),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const motes = new THREE.InstancedMesh(moteGeo, moteMat, 5);
    motes.name = 'wish-motes';
    motes.castShadow = false;
    wishHold.add(motes);

    // Natural proportions (the drawing is almost square), ≤ 2 tall, same hinge
    // line as the hug and in front of the gate so the gate cannot hide it.
    const heartH = 1.86;
    const heartW = widthOf(info('heart-big'), heartH, 1.88);
    const heartHold = stand('left', HUG_X, 0.68, 'back', heartW, heartH, 'heart-big');
    const heartCard = prop('heart-big', heartH);
    if (heartCard) {
      heartCard.scale.set(0, 0, 0);
      heartHold.add(heartCard);
    }

    const hugH = 1.7;
    const hugW = widthOf(charInfo(characters, 'japan-hug'), hugH, 0.85);
    const hugHold = stand('left', HUG_X, HUG_Z, 'back', hugW, hugH, 'japan-hug');
    const hugCard = characterArt.actor(
      paper, characters, figures, 'japan-hug',
      { who: 'couple', outfit: 'casual', pose: 'stand' },
      { height: hugH },
    );
    if (hugCard) {
      hugCard.name = 'japan-hug';
      seat(hugCard, charInfo(characters, 'japan-hug'), hugH);
      hugHold.add(hugCard);
    }

    // Level banner on the hug, above their heads. Short canvas; fitSize shrinks
    // the longer Spanish line so it stays on the ribbon.
    const ribW = 1.88;
    const ribbon = painted(THREE, paper, ribbonArt(paper, FONT, C, L('happy anniversary ♥', '¡feliz aniversario! ♥'), 188), ribW);
    ribbon.name = 'anniversary-ribbon';
    // z stays 0: a forward offset becomes −Y once the stand lies flat.
    ribbon.position.set(0, hugH + 0.02, 0);
    ribbon.scale.set(0, 0, 0);
    hugHold.add(ribbon);

    const heartGeo = new THREE.PlaneGeometry(0.14, 0.14);
    heartGeo.translate(0, 0.07, 0);
    const floatHearts = new THREE.InstancedMesh(
      heartGeo,
      new THREE.MeshBasicMaterial({
        map: paper.texture(heartCanvas(paper, C)),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
      5,
    );
    floatHearts.name = 'float-hearts';
    floatHearts.castShadow = false;
    hugHold.add(floatHearts);

    const memories = [];
    const memSpec = [
      ['kaminarimon', 1.12, 0.42, -0.06],
      ['food-ramen', 1.42, 1.12, 0.04],
      ['signpost', 0.78, 0.9, -0.03],
    ];
    for (let i = 0; i < memSpec.length; i++) {
      const [id, x, z, tilt] = memSpec[i];
      const canvas = has(id) ? memoryArt(paper, art.canvas(id)) : memoryArt(paper, null);
      const mesh = painted(THREE, paper, canvas, 0.64);
      mesh.name = `memory-${id}`;
      const hold = stand('left', x, z, 'back', 0.7, 0.78, `memory-${id}`);
      mesh.position.set(0, 0, 0.02);
      mesh.rotation.z = tilt;
      hold.add(mesh);
      memories.push(hold);
    }

    const byeSlider = track(popup.slider({ side: 'spread', path: BYE, lift: 0.012, smooth: false }));
    const byeRoot = holdOf(byeSlider.mount, 'japan-goodbye');
    const byeH = 1.7;
    const byeCard = characterArt.actor(
      paper, characters, figures, 'japan-goodbye',
      { who: 'couple', outfit: 'casual', pose: 'walk' },
      { height: byeH },
    );
    if (byeCard) {
      byeCard.name = 'japan-goodbye';
      seat(byeCard, charInfo(characters, 'japan-goodbye'), byeH);
      byeRoot.add(byeCard);
      tintOf(byeCard);
    }

    const arrowW = 2.35;
    const arrowHold = stand('right', 2.15, 1.05, 'back', arrowW, 0.46, 'next-arrow');
    const arrow = painted(THREE, paper, ribbonArt(paper, FONT, C, L('next chapter →', 'próximo capítulo →')), arrowW);
    arrow.name = 'next-chapter';
    arrow.position.set(0, 0.62, 0.02);
    arrowHold.add(arrow);
    const sparkGeo = new THREE.PlaneGeometry(0.11, 0.11);
    sparkGeo.translate(0, 0.055, 0);
    const sparkMat = new THREE.MeshBasicMaterial({
      map: paper.texture(sparkCanvas(paper, C)),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, 6);
    sparks.name = 'sparkles';
    sparks.castShadow = false;
    arrowHold.add(sparks);

    const neonLight = new THREE.PointLight('#9eb6ff', 0, 2.4, 1.6);
    neonLight.name = 'neon-light';
    neonLight.castShadow = false;
    neonLight.position.set(2.15, 1.15, -0.05);
    const warmLight = new THREE.PointLight('#ffc48a', 0, 3.2, 1.4);
    warmLight.name = 'lantern-light';
    warmLight.castShadow = false;
    warmLight.position.set(0.05, 1.7, -0.15);
    group.add(neonLight, warmLight);

    const scratchM = new THREE.Matrix4();
    const scratchP = new THREE.Vector3();
    const scratchQ = new THREE.Quaternion();
    const scratchS = new THREE.Vector3();
    const YUP = new THREE.Vector3(0, 1, 0);
    let lostFrame = 0;

    // camera.js rests only when cues are ≥ 1.2 s apart, then travels for ~1.05 s
    // before the next one. Holds run until the next cue. The opening turn blocks
    // anything before open + 0.16, so the wide starts just after that and yields
    // at twoYears + ~0.4 (the rig needs the gap; twoYears + 0.3 is 0.1 s earlier).
    const openT = open + 0.2;
    const twoT = Math.max(twoYears + 0.42, openT + 1.22);
    const flightT = Math.max(flight + 0.05, twoT + 1.22);
    const arriveT = Math.max(arrive + 0.08, flightT + 1.22);
    const tokyoT = Math.max(tokyo + 0.25, arriveT + 1.22);
    const asakusaT = Math.max(asakusa + 0.16, tokyoT + 1.22);
    const neonT = Math.max(neon + 0.72, asakusaT + 1.22);
    const foodT = Math.max(food + 0.16, neonT + 1.22);
    const lostT = Math.max(lost + 0.36, foodT + 1.22);
    const lanternT = Math.max(lanterns + 0.18, lostT + 1.22);
    const annT = Math.max(anniversary + 0.32, lanternT + 1.22);
    const moreT = Math.max(more + 0.12, annT + 4.6);
    const nextT = Math.max(next - 0.05, moreT + 1.22);
    const shots = [
      { t: openT, at: [0, 1.05, 0], size: 7.5, from: 'front' },
      { t: twoT, at: [1.58, 0.78, 0.78], size: 2.5, from: 'front' },
      { t: flightT, at: [0.15, 0.95, 0.35], size: 4.0, from: 'front' },
      { t: arriveT, at: [-1.72, 0.88, 0.62], size: 2.5, from: 'front' },
      { t: tokyoT, at: [0.15, 0.95, 0.5], size: 3.0, from: 'front' },
      { t: asakusaT, at: [-1.58, 0.38, 0.62], size: 2.7, from: 'left' },
      { t: neonT, at: [1.75, 1.12, 0.05], size: 3.6, from: 'right' },
      { t: foodT, at: [1.95, 1.05, 0.7], size: 2.4, from: 'front' },
      { t: lostT, at: [1.85, 1.08, 0.66], size: 2.3, from: 'front' },
      { t: lanternT, at: [-1.4, 0.95, 0.45], size: 3.2, from: 'front' },
      { t: annT, at: [-HUG_X, 0.82, 0.62], size: 2.4, from: 'front' },
      { t: moreT, at: [-1.85, 0.62, 0.55], size: 3.4, from: 'left' },
      { t: nextT, at: [1.85, 1.05, 0.62], size: 3.0, from: 'right' },
      { t: wideAt, at: [0, 1.05, 0], size: 7.5, from: 'front' },
    ];
    const cues = shots.map((c, i) => ({
      t: c.t,
      hold: i + 1 < shots.length ? shots[i + 1].t - c.t : Math.max(0.6, (spread.close - 0.4) - c.t),
      at: c.at,
      size: c.size,
      from: c.from,
    }));

    return {
      group,
      leftArt,
      rightArt,
      cues,
      update(alpha, t) {
        const n = folds.length;
        for (let i = 0; i < n; i++) folds[i].update(alpha);
        const risen = popup.rise(alpha);
        const erect = alpha > Math.PI - 0.025 ? 1 : 0;
        const breathe = 1 + Math.sin(t * 1.5) * 0.012;

        const suitS = popIn(ease, t, twoYears - 0.18, 0.38) * (1 - smoothstep(flight + 0.05, flight + 0.45, t));
        applyFace(suit, suitS, 1, bump(t, twoYears, 0.5));
        suit.position.y = suitS > 0.2 ? Math.abs(Math.sin((t - twoYears) * 6.2)) * 0.07 * (1 - smoothstep(twoYears + 0.7, twoYears + 1.3, t)) : 0;
        const tagS = popIn(ease, t, twoYears + 0.02, 0.28) * (suitS > 0.35 ? 1 : 0);
        tag.scale.set(tagS, tagS, tagS > 0.02 ? 1 : 0);
        tag.rotation.z = Math.sin(t * 2.2) * 0.07 * tagS;
        if (pass) {
          const slide = smoothstep(twoYears + 0.12, twoYears + 0.62, t);
          pass.position.x = 0.08 + slide * (passW * 0.62);
          pass.scale.set(suitS, suitS, suitS > 0.02 ? 1 : 0);
        }

        const uFly = smoothstep(flight, arrive - 0.15, t);
        const planeS = smoothstep(flight - 0.12, flight + 0.22, t) * (1 - smoothstep(arrive - 0.25, arrive + 0.05, t));
        planeSlider.update(alpha, uFly);
        planeRoot.position.y = erect * (0.42 + Math.sin(uFly * Math.PI) * 0.72) * risen;
        const ps = planeS * risen * erect;
        planeRoot.scale.set(ps, ps, ps > 0.02 ? 1 : 0);
        // The slider yaws the card along the path, which turns it edge-on. Cancel that
        // so the drawing stays face-on to the reader, with a small bank.
        planeRoot.quaternion.copy(planeSlider.mount.quaternion).invert();
        planeRoot.rotateZ(Math.sin(uFly * Math.PI * 2) * 0.14 * planeS);
        layDots(dotsL, leftDots, TRAIL, DOT_X, -1, uFly, ps, scratchM, scratchP, scratchQ, scratchS);
        layDots(dotsR, rightDots, TRAIL, DOT_X, 1, uFly, ps, scratchM, scratchP, scratchQ, scratchS);
        // The fold check reads the mesh origin, not instances. Collapse it while the page turns.
        const dotShow = ps > 0.02 ? 1 : 0;
        dotsL.scale.set(dotShow, dotShow, dotShow);
        dotsR.scale.set(dotShow, dotShow, dotShow);
        const drift = Math.sin(t * 0.45) * 0.16;
        cloudA.position.set(drift, 0.02, 0);
        cloudB.position.set(-drift * 0.7, 0.02, 0);
        const cS = planeS * risen;
        cloudA.scale.set(cS, cS, cS > 0.02 ? 1 : 0);
        cloudB.scale.set(cS * 0.9, cS * 0.9, cS > 0.02 ? 1 : 0);

        const placeS = popIn(ease, t, asakusa - 0.05, 0.38);
        applyFace(plum, placeS, 1, 0);
        applyFace(pagoda, placeS, 1, bump(t, asakusa, 0.35));
        const gateS = popIn(ease, t, asakusa, 0.38);
        applyFace(gate, gateS, 1, bump(t, asakusa, 0.32));
        gate.rotation.z = Math.sin(t * 1.05) * 0.03 * (gateS > 0.6 ? 1 : 0);

        const arriveF = face(t, arrive + 0.04, tokyo - 0.16);
        applyFace(arriveHold, arriveF, arriveF > 0.92 ? breathe : 1, bump(t, arrive + 0.08, 0.38));
        const bubS = popIn(ease, t, arrive + 0.26, 0.26) * (arriveF > 0.45 ? 1 : 0);
        bubble.scale.set(bubS, bubS, bubS > 0.02 ? 1 : 0);
        const stampS = popIn(ease, t, arrive + 0.32, 0.24);
        const thump = bump(t, arrive + 0.32, 0.26);
        stampHold.scale.set(stampS * (1 + 0.1 * thump), stampS * (1 - 0.06 * thump), stampS > 0.02 ? 1 : 0);

        let walkU = 0;
        if (t < neon) walkU = smoothstep(tokyo, asakusa - 0.12, t) * 0.42;
        else walkU = 0.42 + smoothstep(neon, food - 0.18, t) * 0.58;
        const walkDay = smoothstep(tokyo, tokyo + 0.24, t) * (1 - smoothstep(asakusa - 0.1, asakusa + 0.16, t));
        const walkNight = smoothstep(neon + 0.05, neon + 0.28, t) * (1 - smoothstep(food - 0.12, food + 0.16, t));
        const ws = Math.min(1, walkDay + walkNight) * risen * erect;
        walkSlider.update(alpha, walkU);
        walkRoot.scale.set(ws, ws, ws > 0.02 ? 1 : 0);
        const stepping = ws > 0.4;
        const phase = t * 3;
        const frac = phase - Math.floor(phase);
        walkRoot.position.y = stepping ? Math.sin(frac * Math.PI) * 0.055 : 0;
        walkRoot.rotation.z = stepping ? Math.sin(frac * Math.PI * 2) * 0.05 : 0;
        if (walkFlip) walkFlip.show(Math.floor(phase) & 1);

        const upTokyo = popIn(ease, t, tokyo + 0.04, 0.28) * (1 - smoothstep(asakusa, asakusa + 0.28, t));
        const decor = smoothstep(asakusa, asakusa + 0.28, t) * (1 - smoothstep(lost - 0.2, lost + 0.12, t));
        const spin = smoothstep(lost - 0.08, lost + 0.18, t) * (1 - smoothstep(lanterns - 0.28, lanterns - 0.05, t));
        const signShow = Math.max(upTokyo, decor * 0.38, spin * 0.92);
        setShow(sign, signShow);
        sign.rotation.z = spin * Math.sin(t * 4.2) * 0.04;

        const selfieF = face(t, asakusa + 0.12, neon - 0.18);
        applyFace(selfieHold, selfieF, selfieF > 0.92 ? breathe : 1, bump(t, asakusa + 0.14, 0.34));
        const flashU = bump(t, asakusa + 0.88, 0.2);
        flash.scale.setScalar(flashU > 0.04 ? 1 : 0);
        flashMat.opacity = flashU * 0.8;
        const printS = popIn(ease, t, asakusa + 0.28, 0.32);
        applyFace(printHold, printS, 1, bump(t, asakusa + 0.3, 0.28));

        const nightS = smoothstep(neon, neon + 0.42, t);
        for (let i = 0; i < nightPivots.length; i++) {
          if (nightS < 0.02) nightPivots[i].scale.set(0, 0, 0);
          else nightPivots[i].scale.set(1, nightS, 1);
        }
        for (let i = 0; i < starDots.length; i++) {
          const tw = (nightS > 0.55 ? 1 : 0) * (0.55 + 0.45 * Math.abs(Math.sin(t * 2.3 + i * 1.4)));
          starDots[i].scale.setScalar(tw);
        }
        const cityS = popIn(ease, t, neon + 0.04, 0.36);
        applyFace(city, cityS, 1, bump(t, neon, 0.3));
        const neonAt = [neon + 0.16, neon + 0.4, neon + 0.64];
        let neonOn = 0;
        for (let i = 0; i < neons.length; i++) {
          const s = popIn(ease, t, neonAt[i], 0.26);
          applyFace(neons[i].hold, s, 1, bump(t, neonAt[i], 0.26));
          const glow = (0.35 + 0.2 * Math.abs(Math.sin(t * 2.8 + i))) * (s > 0.65 ? 1 : 0);
          neons[i].glow.material.opacity = glow;
          if (s > 0.65) neonOn = 1;
        }
        const vendS = popIn(ease, t, neon + 0.7, 0.28);
        applyFace(vend, vendS, 1, bump(t, neon + 0.7, 0.24));
        for (let i = 0; i < vendMats.length; i++) {
          vendMats[i].emissiveIntensity = vendS > 0.75 ? 0.35 : 0;
        }
        const cool = nightS;
        const cr = 1 - 0.34 * cool;
        const cg = 1 - 0.26 * cool;
        const cb = 1 - 0.08 * cool;
        for (let i = 0; i < nightMats.length; i++) nightMats[i].color.setRGB(cr, cg, cb);
        neonLight.intensity = risen * neonOn * (0.22 + 0.06 * Math.sin(t * 4));

        const stallS = popIn(ease, t, food, 0.32) * (1 - smoothstep(lost - 0.22, lost + 0.02, t));
        applyFace(stall, stallS, 1, bump(t, food, 0.28));
        const ramenF = face(t, food + 0.06, lost - 0.16);
        applyFace(ramenHold, ramenF, ramenF > 0.92 ? breathe : 1, bump(t, food + 0.08, 0.3));
        const noteS = popIn(ease, t, food + 0.45, 0.26) * (ramenF > 0.4 ? 1 : 0);
        tried.scale.set(noteS, noteS, noteS > 0.02 ? 1 : 0);
        const snackS = popIn(ease, t, food + 0.2, 0.28) * (1 - smoothstep(lost - 0.2, lost + 0.05, t));
        setShow(snack, snackS);
        for (let i = 0; i < foods.length; i++) {
          const s = popIn(ease, t, food + 0.22 + i * 0.12, 0.2);
          foods[i].scale.set(s, s, s > 0.02 ? 1 : 0);
        }
        const steamOn = ramenF > 0.5 && stallS > 0.4 ? 1 : 0;
        for (let i = 0; i < steam.length; i++) {
          const w = (t * 0.7 + i * 0.45) % 1;
          steam[i].position.y = stallH * 0.58 + w * 0.26;
          steam[i].position.x = -0.18 + i * 0.3 + Math.sin(t * 1.6 + i) * 0.03;
          steam[i].scale.setScalar(0.7 + w * 0.45);
          steam[i].material.opacity = steamOn * Math.sin(w * Math.PI) * 0.75;
        }

        const lostF = face(t, lost, lanterns - 0.18);
        applyFace(lostHold, lostF, lostF > 0.92 ? breathe : 1, bump(t, lost, 0.28));
        const frame = t >= laughed ? 1 : 0;
        if (lostFlip && frame !== lostFrame) {
          lostFlip.show(frame);
          lostFrame = frame;
        }
        const flick = bump(t, laughed, 0.2);
        if (lostF > 0.9) lostHold.scale.x = Math.max(0.08, (lostF > 0.92 ? breathe : 1) * (1 - 0.9 * flick));
        const qS = popIn(ease, t, lost + 0.18, 0.22) * (1 - smoothstep(laughed - 0.05, laughed + 0.12, t)) * (lostF > 0.4 ? 1 : 0);
        qMark.scale.set(qS, qS, qS > 0.02 ? 1 : 0);
        qMark.rotation.z = Math.sin(t * 3) * 0.1 * qS;
        const haS = popIn(ease, t, laughed + 0.04, 0.2) * (lostF > 0.5 ? 1 : 0);
        for (let i = 0; i < ha.length; i++) {
          const hop = haS > 0.2 ? Math.abs(Math.sin(t * 6 + i)) * 0.06 : 0;
          ha[i].scale.set(haS, haS, haS > 0.02 ? 1 : 0);
          ha[i].position.y = haBaseY[i] + hop;
        }
        const prog = smoothstep(lost + 0.08, lost + 1.05, t) * (1 - smoothstep(lanterns - 0.25, lanterns, t)) * (lostF > 0.2 ? 1 : 0);
        for (let i = 0; i < PATH_N; i++) {
          const s = prog * PATH_N > i + 0.2 ? 1 : 0;
          scratchP.set(pathX[i], 0.002, pathZ[i]);
          scratchQ.setFromAxisAngle(YUP, pathA[i]);
          scratchS.set(s, 1, s > 0 ? 1 : 0);
          scratchM.compose(scratchP, scratchQ, scratchS);
          dashes.setMatrixAt(i, scratchM);
        }
        dashes.instanceMatrix.needsUpdate = true;

        const archS = popIn(ease, t, lanterns, 0.4) * erect;
        setShow(archL, archS);
        setShow(archR, archS);
        let lit = 0;
        for (let i = 0; i < lanternMeshes.length; i++) {
          const s = popIn(ease, t, lanterns + 0.16 + i * 0.12, 0.2);
          lanternMeshes[i].scale.set(s, s, s > 0.02 ? 1 : 0);
          lanternMeshes[i].rotation.z = Math.sin(t * 1.2 + i) * 0.045 * (s > 0.6 ? 1 : 0);
          if (lanternMats[i]) lanternMats[i].emissiveIntensity = s > 0.7 ? 0.4 + 0.15 * Math.abs(Math.sin(t * 2 + i)) : 0;
          if (s > 0.7) lit += 1;
        }
        const wishF = face(t, lanterns + 0.18, anniversary - 0.16);
        applyFace(wishHold, wishF, wishF > 0.92 ? breathe : 1, bump(t, lanterns + 0.22, 0.32));
        for (let i = 0; i < 5; i++) {
          const age = (t * 0.35 + i * 0.17) % 1;
          const on = wishF > 0.6 ? Math.sin(age * Math.PI) : 0;
          scratchP.set(-0.15 + (i - 2) * 0.12, 1.05 + age * 0.5, 0.05);
          scratchQ.identity();
          scratchS.set(on, on, on > 0.02 ? 1 : 0);
          scratchM.compose(scratchP, scratchQ, scratchS);
          motes.setMatrixAt(i, scratchM);
        }
        motes.instanceMatrix.needsUpdate = true;

        const hugF = face(t, anniversary + 0.04, next - 0.22);
        applyFace(hugHold, hugF, hugF > 0.92 ? breathe : 1, bump(t, anniversary, 0.36));
        const heartS = popIn(ease, t, anniversary + 0.02, 0.38) * (1 - smoothstep(more - 0.4, more - 0.08, t));
        if (heartCard) setShow(heartCard, heartS);
        const ribS = popIn(ease, t, anniversary + 0.22, 0.32) * (1 - smoothstep(more - 0.38, more - 0.06, t));
        ribbon.scale.set(ribS, ribS, ribS > 0.02 ? 1 : 0);
        const heartsOn = smoothstep(anniversary + 0.3, anniversary + 0.6, t) * (hugF > 0.4 ? 1 : 0);
        for (let i = 0; i < 5; i++) {
          const age = (t * 0.28 + i * 0.19) % 1;
          const on = heartsOn * Math.sin(age * Math.PI);
          scratchP.set(-0.12 + (i - 2) * 0.1, 1.15 + age * 0.4, 0.06);
          scratchQ.identity();
          scratchS.set(on * 0.85, on * 0.85, on > 0.02 ? 1 : 0);
          scratchM.compose(scratchP, scratchQ, scratchS);
          floatHearts.setMatrixAt(i, scratchM);
        }
        floatHearts.instanceMatrix.needsUpdate = true;
        warmLight.intensity = risen * (archS > 0.55 ? 0.28 + lit * 0.03 : 0);

        for (let i = 0; i < memories.length; i++) {
          const s = popIn(ease, t, more - 0.22 + i * 0.1, 0.26);
          applyFace(memories[i], s, 1, bump(t, more - 0.1 + i * 0.1, 0.24));
        }

        const byeS = smoothstep(next - 1.55, next - 1.05, t) * risen * erect;
        const byeU = smoothstep(next - 1.35, wideAt - 0.2, t);
        byeSlider.update(alpha, byeU);
        byeRoot.scale.set(byeS, byeS, byeS > 0.02 ? 1 : 0);
        const bphase = t * 2.6;
        const bfrac = bphase - Math.floor(bphase);
        byeRoot.position.y = byeS > 0.4 ? Math.sin(bfrac * Math.PI) * 0.05 : 0;
        byeRoot.rotation.z = byeS > 0.4 ? Math.sin(bfrac * Math.PI * 2) * 0.045 : 0;
        const arrowS = popIn(ease, t, next + 0.05, 0.32);
        applyFace(arrowHold, arrowS, 1, bump(t, next + 0.1, 0.26));
        const sparkOn = arrowS > 0.55 ? 1 : 0;
        for (let i = 0; i < 6; i++) {
          const p = 0.55 + 0.45 * Math.abs(Math.sin(t * 3.2 + i));
          scratchP.set(-0.95 + i * 0.36, 0.86 + Math.sin(t * 2 + i) * 0.05, 0.04);
          scratchQ.identity();
          scratchS.set(p * sparkOn, p * sparkOn, sparkOn);
          scratchM.compose(scratchP, scratchQ, scratchS);
          sparks.setMatrixAt(i, scratchM);
        }
        sparks.instanceMatrix.needsUpdate = true;
      },
    };
  },
};

function charInfo(characters, id) {
  if (!characters || !characters.info) return null;
  return characters.info(id);
}

function cloneCanvas(paper, src) {
  const { canvas, ctx } = paper.makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return { canvas, ctx };
}

function mapMat(THREE, paper, canvas) {
  return new THREE.MeshStandardMaterial({
    map: paper.texture(canvas),
    roughness: 0.96,
    metalness: 0,
  });
}

function halfPlane(THREE, material, width, height, side) {
  const geo = new THREE.PlaneGeometry(width / 2, height);
  geo.translate((side * width) / 4, height / 2, 0);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (side < 0 ? 0 : 0.5) + uv.getX(i) * 0.5);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = side < 0 ? 'sky-l' : 'sky-r';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function oneSided(THREE, paper, canvas, info, height) {
  const cut = paper.dieCut(canvas, { margin: 8 });
  const s = height / info.h;
  const width = info.w * s;
  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: paper.cutoutTexture(cut),
    alphaTest: 0.5,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  }));
  const yOff = (info.feet[1] - info.h) * s;
  mesh.position.set(((info.w / 2) - info.feet[0]) * s, yOff < -0.02 ? -0.02 : yOff, 0);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

function painted(THREE, paper, canvas, width) {
  const h = width * (canvas.height / canvas.width);
  const geo = new THREE.PlaneGeometry(width, h);
  geo.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: paper.texture(canvas),
    alphaTest: 0.35,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function addRopeInstances(THREE, material, parent, coords) {
  const n = coords.length / 4;
  if (!(n > 0)) return;
  const geo = new THREE.PlaneGeometry(1, 0.028);
  const mesh = new THREE.InstancedMesh(geo, material, n);
  mesh.name = 'rope';
  mesh.castShadow = false;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const x0 = coords[i * 4];
    const y0 = coords[i * 4 + 1];
    const x1 = coords[i * 4 + 2];
    const y1 = coords[i * 4 + 3];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 0.001;
    p.set((x0 + x1) / 2, (y0 + y1) / 2, 0.02);
    q.setFromAxisAngle(axis, Math.atan2(dy, dx));
    s.set(len, 1, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
}

function layDots(mesh, indices, path, originX, side, uFly, show, m, p, q, s) {
  const last = path.length - 1;
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    const u = i / last;
    const grow = (uFly - u) / 0.08;
    const sc = show * (grow <= 0 ? 0 : grow >= 1 ? 1 : grow);
    const lx = side < 0 ? path[i][0] + originX : path[i][0] - originX;
    p.set(lx, 0.004, path[i][1]);
    q.identity();
    s.set(sc, sc, sc > 0.02 ? 1 : 0);
    m.compose(p, q, s);
    mesh.setMatrixAt(k, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function letterSign(ctx, canvas, FONT) {
  const text = L('Tokyo', 'Tokio');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5c3a24';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 72, canvas.width * 0.62);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, canvas.width * 0.48, canvas.height * 0.15);
}

function letterPass(ctx, canvas, FONT, text) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5c3a24';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 108, canvas.width * 0.52);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, canvas.width * 0.38, canvas.height * 0.5);
}

function heartTag(paper, FONT, text) {
  const W = 640;
  const H = 560;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.translate(W / 2, H * 0.48);
  ctx.beginPath();
  ctx.moveTo(0, 160);
  ctx.bezierCurveTo(-220, 40, -210, -160, 0, -40);
  ctx.bezierCurveTo(210, -160, 220, 40, 0, 160);
  ctx.fillStyle = '#e2574c';
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#f6edd9';
  ctx.stroke();
  ctx.fillStyle = '#fffaf3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 78, 340);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, 0, 6);
  return canvas;
}

function speech(paper, FONT, C, text) {
  const W = 680;
  const H = 340;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#fffaf3';
  roundBox(ctx, 24, 16, W - 48, H - 90, 36);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W * 0.62, H - 80);
  ctx.lineTo(W * 0.78, H - 16);
  ctx.lineTo(W * 0.5, H - 78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 72, W * 0.78);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, W / 2, H * 0.36);
  return canvas;
}

function stampArt(paper, FONT, text) {
  const W = 512;
  const { canvas, ctx } = paper.makeCanvas(W, W);
  ctx.translate(W / 2, W / 2);
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(0, 0, 200, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 176, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#c0392b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 84, 300);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, 0, -16);
  ctx.font = `36px ${FONT.display}`;
  ctx.fillText('2026', 0, 64);
  return canvas;
}

function noteArt(paper, FONT, C, text) {
  const W = 860;
  const H = 240;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#fff7df';
  roundBox(ctx, 16, 24, W - 32, H - 48, 18);
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `700 ${n}px ${FONT.hand}`, 72, W * 0.84);
  ctx.font = `700 ${size}px ${FONT.hand}`;
  ctx.fillText(text, W / 2, H * 0.5);
  return canvas;
}

function questionArt(paper, FONT, C) {
  const { canvas, ctx } = paper.makeCanvas(280, 340);
  ctx.fillStyle = C.tomato;
  ctx.font = `220px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 140, 160);
  return canvas;
}

function haArt(paper, FONT, C, text) {
  const W = 560;
  const H = 200;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#fffaf3';
  roundBox(ctx, 8, 16, W - 16, H - 32, 20);
  ctx.fill();
  ctx.fillStyle = C.tomato;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 64, W * 0.86);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, W / 2, H * 0.5);
  return canvas;
}

function ribbonArt(paper, FONT, C, text, H = 280) {
  const W = 1400;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = C.tomato;
  const padY = Math.max(10, Math.round(H * 0.12));
  roundBox(ctx, 16, padY, W - 32, H - padY * 2, Math.min(28, H * 0.2));
  ctx.fill();
  ctx.fillStyle = '#fffaf3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, Math.min(92, H * 0.62), W * 0.9);
  if (size > H * 0.62) size = H * 0.62;
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, W / 2, H * 0.52);
  return canvas;
}

function ticked(paper, src) {
  const pad = 36;
  const { canvas, ctx } = paper.makeCanvas(src.width + pad, src.height + pad);
  ctx.drawImage(src, pad * 0.2, pad * 0.55);
  ctx.beginPath();
  ctx.fillStyle = '#7fb069';
  ctx.arc(src.width - 8, pad + 8, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fffaf3';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(src.width - 20, pad + 8);
  ctx.lineTo(src.width - 10, pad + 18);
  ctx.lineTo(src.width + 6, pad - 4);
  ctx.stroke();
  return canvas;
}

function memoryArt(paper, src) {
  const W = 460;
  const H = 540;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#fffaf3';
  roundBox(ctx, 8, 8, W - 16, H - 16, 10);
  ctx.fill();
  const x = 28;
  const y = 28;
  const w = W - 56;
  const h = H - 110;
  ctx.save();
  roundBox(ctx, x, y, w, h, 6);
  ctx.clip();
  if (src) {
    const s = Math.max(w / src.width, h / src.height);
    const dw = src.width * s;
    const dh = src.height * s;
    ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = '#f0e2cc';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  ctx.fillStyle = '#e7b15a';
  ctx.fillRect(W / 2 - 54, 6, 108, 28);
  return canvas;
}

function solidSign(paper, src) {
  const { canvas, ctx } = paper.makeCanvas(src.width, src.height);
  ctx.fillStyle = '#fff6ea';
  const m = Math.round(Math.min(src.width, src.height) * 0.06);
  roundBox(ctx, m, m, src.width - m * 2, src.height - m * 2, Math.max(12, m));
  ctx.fill();
  ctx.drawImage(src, 0, 0);
  return canvas;
}

function cloudCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(360, 180);
  ctx.fillStyle = '#fffaf3';
  ctx.beginPath();
  ctx.ellipse(140, 110, 90, 48, 0, 0, Math.PI * 2);
  ctx.ellipse(210, 100, 80, 52, 0, 0, Math.PI * 2);
  ctx.ellipse(180, 78, 60, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function starCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  ctx.translate(32, 32);
  ctx.fillStyle = '#fff6d0';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? 26 : 8;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return canvas;
}

function dotCanvas(paper, C) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  ctx.fillStyle = C.mustard || '#e9b23e';
  ctx.beginPath();
  ctx.arc(32, 32, 22, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function dashCanvas(paper, C) {
  const { canvas, ctx } = paper.makeCanvas(128, 32);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(8, 16);
  ctx.lineTo(120, 16);
  ctx.stroke();
  return canvas;
}

function steamCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(128, 200);
  ctx.strokeStyle = 'rgba(255,250,245,0.95)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(70, 180);
  ctx.bezierCurveTo(20, 130, 110, 90, 60, 20);
  ctx.stroke();
  return canvas;
}

function heartCanvas(paper, C) {
  const { canvas, ctx } = paper.makeCanvas(128, 128);
  ctx.translate(64, 70);
  ctx.fillStyle = C.tomato;
  ctx.beginPath();
  ctx.moveTo(0, 28);
  ctx.bezierCurveTo(-40, -8, -36, -40, 0, -14);
  ctx.bezierCurveTo(36, -40, 40, -8, 0, 28);
  ctx.fill();
  return canvas;
}

function sparkCanvas(paper, C) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  ctx.translate(32, 32);
  ctx.fillStyle = C.mustard;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 28 : 6;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return canvas;
}

function roundBox(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
