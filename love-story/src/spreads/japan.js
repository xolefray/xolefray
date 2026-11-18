// Spread — "Our Japan adventure". Left page: Asakusa by day. Right page: Tokyo by night.
// The finale meets in the centre, across the gutter. Times come from timeline.BEATS.
// Lettering is drawn in code through L(). update() allocates nothing. Cards stay opaque.
import { L } from '../i18n.js';
import { PHOTO_ASPECT, photoPrint } from '../photos.js';

const HERO = 1.6;
const BACK_G = 1.68;
const ARCH_G = 1.25;
const SKY_Z = -1.18;
const SKY_W = 4.8;
const SKY_H = 1.58;
const FUJI_Z = -0.55;
const FUJI_H = 1.12;

const FLIGHT = [
  [-3.3, 0.2], [-2.5, 0.62], [-1.7, -0.2], [-0.85, 0.5],
  [0.05, -0.28], [0.95, 0.48], [1.8, -0.08], [2.6, 0.38], [3.25, 0.08],
];
const WALK = [
  [-2.55, 0.46], [-1.55, 0.52], [-0.7, 0.4],
  [0.85, 0.36], [1.7, 0.3], [2.4, 0.26],
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
  else if (s > 1.08) s = 1.08;
  return s;
}

function bump(t, at, dur) {
  const u = (t - at) / dur;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

// Paper flip: 0 hidden, 1 face-on. Scale X only, so the card turns edge-on and stays opaque.
function face(t, tIn, tOut) {
  const IN = 0.26;
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
  obj.scale.set(f, breathe * (1 + 0.07 * kick), 1);
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
    const wideAt = 233.0;

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
      const h = holdOf(m.mount, name);
      return h;
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

    // ------------------------------------------------------------------ back: sky, then Fuji
    const sky = track(popup.vFold({ z0: SKY_Z, gamma: BACK_G, width: SKY_W, height: SKY_H }));
    sky.object.name = 'sky';
    const skyMat = has('sky-day') ? mapMat(THREE, paper, art.canvas('sky-day')) : null;
    const nightMat = has('sky-night') ? mapMat(THREE, paper, art.canvas('sky-night')) : null;
    const dayHalves = [];
    const nightPivots = [];
    if (skyMat) {
      dayHalves.push(halfPlane(THREE, skyMat, SKY_W, SKY_H, -1), halfPlane(THREE, skyMat, SKY_W, SKY_H, 1));
      sky.left.add(dayHalves[0]);
      sky.right.add(dayHalves[1]);
    }
    if (nightMat) {
      const nL = halfPlane(THREE, nightMat, SKY_W, SKY_H, -1);
      const nR = halfPlane(THREE, nightMat, SKY_W, SKY_H, 1);
      const pL = holdOf(sky.left, 'sky-night-l');
      const pR = holdOf(sky.right, 'sky-night-r');
      pL.position.z = 0.004;
      pR.position.z = 0.004;
      pL.add(nL);
      pR.add(nR);
      nightPivots.push(pL, pR);
    }
    const starDots = [];
    if (nightPivots.length) {
      const starGeo = new THREE.PlaneGeometry(0.07, 0.07);
      const starMat = new THREE.MeshBasicMaterial({
        map: paper.texture(starCanvas(paper, C)),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const at = [[-1.5, 1.15], [-0.7, 0.85], [0.8, 1.2], [1.55, 0.78]];
      for (let i = 0; i < at.length; i++) {
        const mesh = new THREE.Mesh(starGeo, starMat);
        mesh.name = 'star';
        mesh.position.set(at[i][0], at[i][1], 0.006);
        mesh.castShadow = false;
        nightPivots[i < 2 ? 0 : 1].add(mesh);
        starDots.push(mesh);
      }
    }

    const fujiW = widthOf(info('fuji'), FUJI_H, 3.2);
    const fuji = track(popup.vFold({ z0: FUJI_Z, gamma: BACK_G, width: fujiW, height: FUJI_H }));
    fuji.object.name = 'fuji';
    const fujiPivot = holdOf(fuji.object, 'fuji-pivot');
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

    // ------------------------------------------------------------------ left page, day
    const pagodaH = 2.0;
    const pagoda = stand('left', 3.02, -1.0, 'front', widthOf(info('pagoda'), pagodaH, 1), pagodaH, 'pagoda');
    const pagodaCard = sheet('pagoda', pagodaH);
    if (pagodaCard) pagoda.add(pagodaCard);

    const gateH = 1.78;
    const gateW = widthOf(info('kaminarimon'), gateH, 2.3);
    const gate = stand('left', 2.18, -0.4, 'front', gateW, gateH, 'gate');
    const gateCard = sheet('kaminarimon', gateH);
    if (gateCard) gate.add(gateCard);

    const plumH = 0.9;
    const plum = stand('left', 1.15, -0.42, 'back', widthOf(info('plum-branch'), plumH, 0.95), plumH, 'plum');
    const plumCard = sheet('plum-branch', plumH);
    if (plumCard) plum.add(plumCard);

    // ------------------------------------------------------------------ right page, night
    const cityH = 1.28;
    const cityW = widthOf(info('city-night'), cityH, 2.6);
    const city = stand('right', 2.2, -0.82, 'front', cityW, cityH, 'city');
    const cityCard = sheet('city-night', cityH);
    if (cityCard) city.add(cityCard);

    const neonSpec = [
      ['neon-sign-a', 1.02, 1.42, -0.15],
      ['neon-sign-b', 0.7, 2.15, 0.02],
      ['neon-sign-c', 0.52, 2.85, -0.32],
    ];
    const neons = [];
    const neonMats = [];
    for (let i = 0; i < neonSpec.length; i++) {
      const [id, h, x, z] = neonSpec[i];
      const w = widthOf(info(id), h, 0.6);
      const hold = stand('right', x, z, 'back', w, h, id);
      const card = sheet(id, h);
      if (card) {
        hold.add(card);
        card.traverse((o) => {
          if (o.isMesh && o.material && o.material.emissive) neonMats.push(o.material);
        });
      }
      const glowH = h * 1.05;
      const glowGeo = new THREE.PlaneGeometry(w * 1.2, glowH);
      glowGeo.translate(0, glowH * 0.5, 0);
      const glow = new THREE.Mesh(
        glowGeo,
        new THREE.MeshBasicMaterial({
          color: i === 1 ? '#7ef0e4' : i === 2 ? '#ffd56a' : '#ff9ec4',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      glow.name = `${id}-glow`;
      glow.position.set(0, h * 0.08, -0.012);
      glow.castShadow = false;
      hold.add(glow);
      neons.push({ hold, glow });
    }

    const vendH = 1.12;
    const vend = stand('right', 3.12, 0.28, 'back', widthOf(info('vending-machine'), vendH, 0.6), vendH, 'vending');
    const vendCard = sheet('vending-machine', vendH);
    const vendMats = [];
    if (vendCard) {
      vend.add(vendCard);
      vendCard.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) vendMats.push(o.material);
      });
    }

    const signH = 1.36;
    const signW = widthOf(info('signpost'), signH, 0.75);
    const sign = stand('right', 2.55, 0.08, 'back', signW, signH, 'signpost');
    if (has('signpost')) {
      const painted = cloneCanvas(paper, art.canvas('signpost'));
      letterSign(painted.ctx, painted.canvas, FONT);
      const card = oneSided(THREE, paper, painted.canvas, info('signpost'), signH);
      card.name = 'signpost';
      sign.add(card);
    }

    // ------------------------------------------------------------------ opening: suitcase, tag, pass
    const suitH = 0.74;
    const suitW = widthOf(info('suitcase-stickers'), suitH, 0.45);
    // Far enough from the gutter that the tag stays inside the loose wedge.
    const suit = stand('left', 1.42, 0.9, 'back', suitW + 0.9, suitH + 0.55, 'suitcase');
    const suitCard = prop('suitcase-stickers', suitH);
    if (suitCard) suit.add(suitCard);
    const tag = painted(THREE, paper, heartTag(paper, FONT, C, L('2 years ♥', '2 años ♥')), 0.62);
    tag.name = 'heart-tag';
    tag.position.set(-0.02, suitH * 0.92, 0.03);
    suit.add(tag);
    const passH = 0.3;
    const passW = widthOf(info('boarding-pass'), passH, 0.72);
    let pass = null;
    if (has('boarding-pass')) {
      const paintedPass = cloneCanvas(paper, art.canvas('boarding-pass'));
      letterPass(paintedPass.ctx, paintedPass.canvas, FONT, L('TO: JAPAN', 'DESTINO: JAPÓN'));
      pass = oneSided(THREE, paper, paintedPass.canvas, info('boarding-pass'), passH);
      pass.name = 'boarding-pass';
      // Left-page +X points at the gutter, so the pass slides the other way.
      pass.position.set(-0.02, suitH * 0.42, 0.04);
      suit.add(pass);
    }

    // ------------------------------------------------------------------ flight
    const planeSlider = track(popup.slider({ side: 'spread', path: FLIGHT, lift: 0.004, smooth: true }));
    const planeRoot = holdOf(planeSlider.mount, 'plane');
    const planeCard = prop('paper-plane', 0.32);
    if (planeCard) planeRoot.add(planeCard);
    const cloudL = track(popup.onPage({ side: 'left', x: 1.7, z: -0.15, lift: 0.004 }));
    const cloudR = track(popup.onPage({ side: 'right', x: 1.9, z: 0.2, lift: 0.004 }));
    const cloudA = painted(THREE, paper, cloudCanvas(paper), 0.55);
    const cloudB = painted(THREE, paper, cloudCanvas(paper), 0.42);
    cloudA.name = 'cloud-a';
    cloudB.name = 'cloud-b';
    cloudL.mount.add(cloudA);
    cloudR.mount.add(cloudB);

    const dotGeo = new THREE.PlaneGeometry(0.08, 0.08);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({
      map: paper.texture(dotCanvas(paper, C)),
      alphaTest: 0.4,
      depthWrite: false,
    });
    const leftDots = [];
    const rightDots = [];
    for (let i = 0; i < FLIGHT.length; i++) {
      (FLIGHT[i][0] < 0 ? leftDots : rightDots).push(i);
    }
    const dotsPageL = track(popup.onPage({ side: 'left', x: 1.6, z: 0, lift: 0.008 }));
    const dotsPageR = track(popup.onPage({ side: 'right', x: 1.6, z: 0, lift: 0.008 }));
    const dotsL = new THREE.InstancedMesh(dotGeo, dotMat, Math.max(1, leftDots.length));
    const dotsR = new THREE.InstancedMesh(dotGeo, dotMat, Math.max(1, rightDots.length));
    dotsL.name = 'flight-dots-l';
    dotsR.name = 'flight-dots-r';
    dotsL.castShadow = dotsR.castShadow = false;
    dotsPageL.mount.add(dotsL);
    dotsPageR.mount.add(dotsR);

    // ------------------------------------------------------------------ heroes
    const arriveW = widthOf(charInfo(characters, 'japan-arrive'), HERO, 1.3);
    const arriveHold = stand('left', 1.85, 0.52, 'back', arriveW, HERO + 0.2, 'japan-arrive');
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
    const bubble = painted(THREE, paper, speech(paper, FONT, C, L('We made it!', '¡Llegamos!')), 0.92);
    bubble.name = 'made-it';
    bubble.position.set(-0.55, HERO * 0.78, 0.05);
    arriveHold.add(bubble);

    const stamp = painted(THREE, paper, stampArt(paper, FONT, C, L('JAPAN', 'JAPÓN')), 0.62);
    stamp.name = 'passport-stamp';
    const stampHold = stand('left', 2.55, 0.22, 'back', 0.66, 0.66, 'stamp');
    stampHold.add(stamp);

    const walkSlider = track(popup.slider({ side: 'spread', path: WALK, lift: 0.01, smooth: false }));
    const walkRoot = holdOf(walkSlider.mount, 'japan-walk');
    const walkIds = characters && characters.cycle ? characters.cycle('japan-walk') : [];
    const walkFlip = walkIds.length
      ? characterArt.characterFlip(paper, characters, walkIds, { height: HERO })
      : null;
    if (walkFlip) {
      seat(walkFlip.group, charInfo(characters, walkIds[0]), HERO);
      walkRoot.add(walkFlip.group);
    } else {
      const one = characterArt.actor(
        paper, characters, figures, 'japan-walk-0',
        { who: 'her', outfit: 'casual', pose: 'walk' },
        { height: HERO },
      );
      if (one) {
        one.name = 'japan-walk-0';
        seat(one, charInfo(characters, 'japan-walk-0'), HERO);
        walkRoot.add(one);
      }
    }

    const selfieW = widthOf(charInfo(characters, 'japan-selfie'), HERO, 1);
    const selfieHold = stand('left', 1.62, 0.78, 'back', selfieW, HERO, 'japan-selfie');
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
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.7), flashMat);
    flash.name = 'flash';
    flash.position.set(0, 0.9, 0.06);
    flash.castShadow = false;
    selfieHold.add(flash);

    const shot = photoPrint(photos ? photos.tokyo : null, {
      width: 520,
      style: 'polaroid',
      caption: L('Tokyo · 2 years', 'Tokio · 2 años'),
      tilt: -0.05,
      tape: true,
      aspect: PHOTO_ASPECT.tokyo,
      seed: 21,
    });
    const shotRatio = shot.width / shot.height;
    const shotLong = 1.18;
    const shotW = shotRatio >= 1 ? shotLong : shotLong * shotRatio;
    const shotH = shotRatio >= 1 ? shotLong / shotRatio : shotLong;
    const printHold = stand('left', 2.72, 0.48, 'back', shotW, shotH, 'tokyo-print');
    const printCard = paper.card({
      canvas: paper.dieCut(shot, { margin: 2 }),
      width: shotW,
      height: shotH,
      anchor: 'bottom-center',
    });
    printCard.name = 'tokyo-print';
    printHold.add(printCard);

    const stallH = 1.28;
    const stallW = widthOf(info('ramen-stall'), stallH, 1.3);
    const stall = stand('right', 2.55, 0.55, 'back', stallW, stallH, 'ramen-stall');
    const stallCard = sheet('ramen-stall', stallH);
    if (stallCard) stall.add(stallCard);
    const steam = [];
    const steamGeo = new THREE.PlaneGeometry(0.28, 0.42);
    const steamMat = new THREE.MeshBasicMaterial({
      map: paper.texture(steamCanvas(paper)),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(steamGeo, steamMat);
      mesh.name = 'steam';
      mesh.position.set(-0.18 + i * 0.28, stallH * 0.72, 0.04);
      mesh.castShadow = false;
      stall.add(mesh);
      steam.push(mesh);
    }

    const ramenH = 1.5;
    const ramenW = widthOf(charInfo(characters, 'japan-ramen'), ramenH, 1.8);
    const ramenHold = stand('right', 1.95, 0.98, 'back', ramenW, ramenH, 'japan-ramen');
    const ramenCard = characterArt.actor(
      paper, characters, figures, 'japan-ramen',
      { who: 'couple', outfit: 'casual', pose: 'sit' },
      { height: ramenH },
    );
    if (ramenCard) {
      ramenCard.name = 'japan-ramen';
      seat(ramenCard, charInfo(characters, 'japan-ramen'), ramenH);
      ramenHold.add(ramenCard);
    }

    const foods = [];
    const foodIds = ['food-sushi', 'food-ramen', 'food-dango', 'food-taiyaki', 'food-matcha'];
    const foodBits = [];
    let foodSpan = 0;
    for (let i = 0; i < foodIds.length; i++) {
      const id = foodIds[i];
      const h = 0.3;
      const bit = has(id) ? oneSided(THREE, paper, ticked(paper, art.canvas(id), C), info(id), h) : null;
      if (!bit) continue;
      bit.name = id;
      const w = widthOf(info(id), h, 0.28);
      foodBits.push({ bit, w });
      foodSpan += w + (foodBits.length > 1 ? 0.06 : 0);
    }
    const snack = stand('right', 2.15, 0.18, 'back', Math.min(2.2, foodSpan + 0.1), 0.72, 'snacks');
    let foodX = -foodSpan / 2;
    for (let i = 0; i < foodBits.length; i++) {
      const { bit, w } = foodBits[i];
      bit.position.set(foodX + w / 2, 0, 0.02);
      foodX += w + 0.06;
      snack.add(bit);
      foods.push(bit);
    }
    const tried = painted(THREE, paper, noteArt(paper, FONT, C, L('we tried everything', 'probamos de todo')), 1.15);
    tried.name = 'tried-everything';
    tried.position.set(-0.15, 0.42, 0.03);
    tried.rotation.z = -0.06;
    snack.add(tried);

    const lostH = HERO;
    const lostW = widthOf(charInfo(characters, 'japan-lost-0'), lostH, 1.45);
    const lostHold = stand('right', 2.05, 0.58, 'back', lostW, lostH, 'japan-lost');
    const lostIds = characters && characters.cycle ? characters.cycle('japan-lost') : [];
    const lostFlip = lostIds.length
      ? characterArt.characterFlip(paper, characters, lostIds, { height: lostH })
      : null;
    if (lostFlip) {
      seat(lostFlip.group, charInfo(characters, lostIds[0]), lostH);
      lostHold.add(lostFlip.group);
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
      }
    }
    const qMark = painted(THREE, paper, questionArt(paper, FONT, C), 0.34);
    qMark.name = 'lost-question';
    qMark.position.set(0.78, lostH * 0.82, 0.04);
    lostHold.add(qMark);
    const haCanvas = haArt(paper, FONT, C, L('ha ha ha!', '¡ja, ja, ja!'));
    const ha = [];
    for (let i = 0; i < 3; i++) {
      const mesh = painted(THREE, paper, haCanvas, 0.7 - i * 0.06);
      mesh.name = 'ha-ha';
      mesh.position.set(-0.35 + i * 0.42, lostH * 0.7 + i * 0.08, 0.05);
      mesh.rotation.z = -0.18 + i * 0.16;
      lostHold.add(mesh);
      ha.push(mesh);
    }

    const pathPage = track(popup.onPage({ side: 'right', x: 1.85, z: 0.32, lift: 0.01 }));
    const PATH_N = 14;
    const pathX = new Float64Array(PATH_N);
    const pathZ = new Float64Array(PATH_N);
    const pathA = new Float64Array(PATH_N);
    for (let i = 0; i < PATH_N; i++) {
      const a = (i / PATH_N) * Math.PI * 2;
      pathX[i] = Math.cos(a) * 0.52;
      pathZ[i] = Math.sin(a) * 0.3;
      pathA[i] = a + Math.PI * 0.5;
    }
    const dashGeo = new THREE.PlaneGeometry(0.16, 0.03);
    dashGeo.rotateX(-Math.PI / 2);
    const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({
      map: paper.texture(dashCanvas(paper, C)),
      alphaTest: 0.4,
      depthWrite: false,
    }), PATH_N);
    dashes.name = 'lost-path';
    dashes.castShadow = false;
    pathPage.mount.add(dashes);

    // ------------------------------------------------------------------ lantern arch, wish, hug, finale
    const arch = track(popup.vFold({ z0: 0.08, gamma: ARCH_G, width: 5.0, height: 0.92 }));
    arch.object.name = 'lantern-arch';
    const archPivotL = holdOf(arch.left, 'arch-l');
    const archPivotR = holdOf(arch.right, 'arch-r');
    const ropeMat = new THREE.MeshStandardMaterial({ color: '#8d3a32', roughness: 0.9 });
    const ropeL = new THREE.Mesh(ropeGeo(THREE, -1), ropeMat);
    const ropeR = new THREE.Mesh(ropeGeo(THREE, 1), ropeMat);
    ropeL.name = 'rope-l';
    ropeR.name = 'rope-r';
    archPivotL.add(ropeL);
    archPivotR.add(ropeR);
    const lanternSpots = [
      [-1.85, 0.2], [-1.15, 0.32], [-0.45, 0.4],
      [0.4, 0.4], [1.1, 0.32], [1.75, 0.22], [2.25, 0.14],
    ];
    const lanternMeshes = [];
    if (has('lantern')) {
      const proto = oneSided(THREE, paper, art.canvas('lantern'), info('lantern'), 0.44);
      for (let i = 0; i < lanternSpots.length; i++) {
        const g = proto.clone(true);
        g.name = 'lantern';
        g.position.set(lanternSpots[i][0], lanternSpots[i][1], 0.03);
        (lanternSpots[i][0] < 0 ? archPivotL : archPivotR).add(g);
        lanternMeshes.push(g);
      }
    }

    const wishH = HERO;
    const wishW = widthOf(charInfo(characters, 'japan-wish'), wishH, 0.95);
    const wishHold = stand('left', 1.42, 0.6, 'back', wishW, wishH, 'japan-wish');
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
    const moteGeo = new THREE.PlaneGeometry(0.08, 0.08);
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

    const heartH = 1.28;
    const heartW = widthOf(info('heart-big'), heartH, 1.3);
    const heartFold = track(popup.vFold({ z0: 0.2, gamma: ARCH_G, width: heartW, height: heartH }));
    heartFold.object.name = 'heart-big';
    const heartPivot = holdOf(heartFold.object, 'heart-pivot');
    if (has('heart-big')) {
      const parts = paper.splitCard({
        canvas: paper.dieCut(art.canvas('heart-big'), { margin: 6 }),
        width: heartW,
        height: heartH,
      });
      parts.left.name = 'heart-l';
      parts.right.name = 'heart-r';
      heartFold.left.add(parts.left);
      heartFold.right.add(parts.right);
    }

    const hugH = 1.58;
    const hugW = widthOf(charInfo(characters, 'japan-hug'), hugH, 0.82);
    const hugHold = stand('left', 1.22, 0.74, 'back', hugW, hugH, 'japan-hug');
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

    const ribW = 3.15;
    const ribH = 1.15;
    const ribbon = track(popup.vFold({ z0: 0.52, gamma: ARCH_G, width: ribW, height: ribH }));
    ribbon.object.name = 'anniversary-ribbon';
    const ribCanvas = ribbonArt(paper, FONT, C, L('happy anniversary ♥', '¡feliz aniversario! ♥'), true);
    const ribParts = paper.splitCard({ canvas: ribCanvas, width: ribW, height: ribH });
    ribParts.left.name = 'ribbon-l';
    ribParts.right.name = 'ribbon-r';
    const ribL = holdOf(ribbon.left, 'ribbon-face-l');
    const ribR = holdOf(ribbon.right, 'ribbon-face-r');
    ribL.add(ribParts.left);
    ribR.add(ribParts.right);

    const floatHearts = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.14, 0.14),
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

    const memPageL = track(popup.onPage({ side: 'left', x: 1.9, z: 0, lift: 0.012 }));
    const memPageR = track(popup.onPage({ side: 'right', x: 2.2, z: 0, lift: 0.012 }));
    const memories = [];
    const memSpec = [
      [memPageL.mount, 'kaminarimon', -0.15, -0.55, 0.08],
      [memPageL.mount, 'signpost', -0.85, 0.55, -0.12],
      [memPageR.mount, 'food-ramen', 0.55, -0.15, 0.1],
    ];
    for (let i = 0; i < memSpec.length; i++) {
      const [parent, id, x, z, tilt] = memSpec[i];
      const canvas = has(id) ? memoryArt(paper, art.canvas(id)) : memoryArt(paper, null);
      const mesh = painted(THREE, paper, canvas, 0.78);
      mesh.name = `memory-${id}`;
      const rig = new THREE.Group();
      rig.position.set(x, 0, z);
      rig.rotation.y = tilt;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.z = 0.22;
      rig.add(mesh);
      parent.add(rig);
      memories.push(rig);
    }

    const byeSlider = track(popup.slider({
      side: 'right',
      path: [[0.7, 0.58], [1.55, 0.5], [2.4, 0.4], [3.05, 0.32]],
      lift: 0.01,
      smooth: false,
    }));
    const byeRoot = holdOf(byeSlider.mount, 'japan-goodbye');
    const byeCard = characterArt.actor(
      paper, characters, figures, 'japan-goodbye',
      { who: 'couple', outfit: 'casual', pose: 'walk' },
      { height: 1.55 },
    );
    if (byeCard) {
      byeCard.name = 'japan-goodbye';
      seat(byeCard, charInfo(characters, 'japan-goodbye'), 1.55);
      byeRoot.add(byeCard);
    }

    const arrowHold = stand('right', 1.85, 0.12, 'back', 2.5, 0.46, 'next-arrow');
    const arrow = painted(THREE, paper, ribbonArt(paper, FONT, C, L('next chapter →', 'próximo capítulo →'), false), 2.35);
    arrow.name = 'next-chapter';
    arrow.position.set(0, 0, 0.02);
    arrowHold.add(arrow);
    const sparkGeo = new THREE.PlaneGeometry(0.12, 0.12);
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

    const neonLight = new THREE.PointLight('#ffb4d2', 0, 3.4, 1.5);
    neonLight.name = 'neon-light';
    neonLight.castShadow = false;
    neonLight.position.set(1.9, 1.15, 0.05);
    const warmLight = new THREE.PointLight('#ffc48a', 0, 3.6, 1.45);
    warmLight.name = 'lantern-light';
    warmLight.castShadow = false;
    warmLight.position.set(-0.15, 1.35, 0.35);
    group.add(neonLight, warmLight);

    const scratchM = new THREE.Matrix4();
    const scratchP = new THREE.Vector3();
    const scratchQ = new THREE.Quaternion();
    const scratchS = new THREE.Vector3();
    const YUP = new THREE.Vector3(0, 1, 0);
    let lostFrame = 0;

    const cues = [
      { t: open + 0.2, hold: 0.55, at: [0, 1.15, 0.05], size: 7.5, from: 'front' },
      { t: twoYears + 0.4, hold: 1.15, at: [-0.85, 0.78, 0.72], size: 3.2, from: 'front' },
      { t: flight + 0.3, hold: 1.3, at: [0.05, 1.0, 0.1], size: 5.5, from: 'high' },
      { t: arrive + 0.4, hold: 1.3, at: [-1.65, 1.15, 0.28], size: 2.4, from: 'front' },
      { t: tokyo + 0.4, hold: 1.2, at: [-1.45, 1.05, 0.35], size: 3.5, from: 'front' },
      { t: asakusa + 0.45, hold: 2.15, at: [-2.05, 1.2, 0.2], size: 2.6, from: 'left' },
      { t: neon + 0.45, hold: 2.05, at: [1.75, 1.05, -0.05], size: 4.4, from: 'right' },
      { t: food + 0.4, hold: 1.25, at: [2.05, 1.05, 0.62], size: 2.45, from: 'front' },
      { t: lost + 0.3, hold: 2.95, at: [1.55, 1.12, 0.42], size: 2.35, from: 'front' },
      { t: lanterns + 0.45, hold: 1.85, at: [-0.15, 1.15, 0.2], size: 3.6, from: 'front' },
      { t: anniversary + 0.45, hold: 4.2, at: [-0.35, 1.2, 0.4], size: 2.25, from: 'front' },
      { t: more + 0.35, hold: 1.65, at: [0.05, 1.05, 0.15], size: 4.3, from: 'front' },
      { t: next + 0.45, hold: 1.55, at: [1.55, 1.0, 0.32], size: 3.5, from: 'right' },
      { t: wideAt, hold: 1.55, at: [0, 1.15, 0.05], size: 7.5, from: 'front' },
    ];

    return {
      group,
      leftArt,
      rightArt,
      cues,
      update(alpha, t) {
        const n = folds.length;
        for (let i = 0; i < n; i++) folds[i].update(alpha);
        const risen = popup.rise(alpha);
        const breathe = 1 + Math.sin(t * 1.55) * 0.012;

        const suitS = popIn(ease, t, twoYears - 0.2, 0.42) * (1 - smoothstep(arrive - 0.62, arrive - 0.32, t));
        applyFace(suit, suitS, 1, bump(t, twoYears, 0.45));
        const tagS = popIn(ease, t, twoYears + 0.02, 0.3) * suitS;
        tag.scale.set(tagS, tagS, tagS > 0.02 ? 1 : 0);
        tag.rotation.z = Math.sin(t * 2.4) * 0.08 * tagS;
        if (pass) {
          const slide = smoothstep(twoYears + 0.12, twoYears + 0.7, t);
          pass.position.x = -0.02 - slide * (passW * 0.72);
          pass.scale.set(suitS, suitS, suitS > 0.02 ? 1 : 0);
        }

        const uFly = smoothstep(flight, arrive - 0.08, t);
        const planeS = smoothstep(flight - 0.15, flight + 0.28, t) * (1 - smoothstep(arrive - 0.2, arrive + 0.15, t));
        planeSlider.update(alpha, uFly);
        const arc = Math.sin(uFly * Math.PI) * 0.48 + Math.sin(uFly * Math.PI * 2) * 0.12;
        planeRoot.position.y = arc * risen;
        const ps = planeS * risen;
        planeRoot.scale.set(ps, ps, ps > 0.02 ? 1 : 0);
        planeRoot.rotation.z = Math.sin(uFly * Math.PI * 3) * 0.45 * planeS;
        layDots(dotsL, leftDots, FLIGHT, 1.6, uFly, planeS, scratchM, scratchP, scratchQ, scratchS);
        layDots(dotsR, rightDots, FLIGHT, 1.6, uFly, planeS, scratchM, scratchP, scratchQ, scratchS);
        const drift = Math.sin(t * 0.45) * 0.18;
        cloudA.position.set(drift, risen * 0.62, 0);
        cloudB.position.set(-drift * 0.8, risen * 0.48, 0);
        const cS = planeS * risen;
        cloudA.scale.set(cS, cS, cS > 0.02 ? 1 : 0);
        cloudB.scale.set(cS * 0.9, cS * 0.9, cS > 0.02 ? 1 : 0);

        const dayS = popIn(ease, t, arrive - 0.05, 0.5);
        for (let i = 0; i < dayHalves.length; i++) {
          dayHalves[i].scale.set(1, dayS, 1);
        }
        fujiPivot.scale.set(dayS, dayS, dayS > 0.02 ? 1 : 0);
        const placeS = popIn(ease, t, arrive + 0.05, 0.4);
        applyFace(plum, placeS, 1, 0);
        applyFace(pagoda, placeS, 1, bump(t, arrive, 0.4));

        const arriveF = face(t, arrive + 0.05, tokyo - 0.18);
        applyFace(arriveHold, arriveF, arriveF > 0.92 ? breathe : 1, bump(t, arrive + 0.1, 0.4));
        const bubS = popIn(ease, t, arrive + 0.28, 0.28) * (arriveF > 0.4 ? 1 : 0);
        bubble.scale.set(bubS, bubS, bubS > 0.02 ? 1 : 0);
        const stampS = popIn(ease, t, arrive + 0.35, 0.26);
        const thump = bump(t, arrive + 0.35, 0.28);
        stampHold.scale.set(stampS * (1 + 0.12 * thump), stampS * (1 - 0.08 * thump), stampS > 0.02 ? 1 : 0);

        const gateS = popIn(ease, t, asakusa, 0.4);
        applyFace(gate, gateS, 1, bump(t, asakusa, 0.36));
        gate.rotation.z = Math.sin(t * 1.25) * 0.03 * (gateS > 0.5 ? 1 : 0);

        let walkU = 0;
        if (t < neon) walkU = smoothstep(tokyo, asakusa - 0.15, t) * 0.42;
        else walkU = 0.42 + smoothstep(neon, food - 0.2, t) * 0.58;
        const walkShow = smoothstep(tokyo, tokyo + 0.28, t) * (1 - smoothstep(asakusa - 0.08, asakusa + 0.2, t))
          + smoothstep(neon, neon + 0.22, t) * (1 - smoothstep(food - 0.1, food + 0.22, t));
        const ws = Math.min(1, walkShow) * risen;
        walkSlider.update(alpha, walkU);
        walkRoot.scale.set(ws, ws, ws > 0.02 ? 1 : 0);
        const stepping = ws > 0.35;
        const phase = t * 3;
        const frac = phase - Math.floor(phase);
        walkRoot.position.y = stepping ? Math.sin(frac * Math.PI) * 0.05 : 0;
        walkRoot.rotation.z = stepping ? Math.sin(frac * Math.PI * 2) * 0.046 : 0;
        if (walkFlip) walkFlip.show(Math.floor(phase) & 1);

        const signS = popIn(ease, t, tokyo + 0.05, 0.32);
        applyFace(sign, signS, 1, bump(t, tokyo, 0.3));
        const spinning = smoothstep(lost, lost + 0.35, t) * (1 - smoothstep(laughed + 0.15, lanterns - 0.15, t));
        sign.rotation.z = spinning * Math.sin(t * 7.5) * 1.15;

        const selfieF = face(t, asakusa + 0.12, neon - 0.2);
        applyFace(selfieHold, selfieF, selfieF > 0.92 ? breathe : 1, bump(t, asakusa + 0.15, 0.36));
        const flashU = bump(t, asakusa + 0.72, 0.18);
        flash.scale.setScalar(flashU > 0.05 ? 1 : 0);
        flashMat.opacity = flashU * 0.92;
        const printS = popIn(ease, t, asakusa + 0.48, 0.36);
        applyFace(printHold, printS, 1, bump(t, asakusa + 0.5, 0.3));

        const nightS = popIn(ease, t, neon, 0.48);
        for (let i = 0; i < nightPivots.length; i++) {
          nightPivots[i].scale.set(nightS > 0.02 ? 1 : 0, nightS, 1);
        }
        for (let i = 0; i < starDots.length; i++) {
          const tw = nightS * (0.45 + 0.55 * Math.abs(Math.sin(t * 2.4 + i * 1.3)));
          starDots[i].scale.setScalar(tw);
        }
        const cityS = popIn(ease, t, neon + 0.05, 0.42);
        applyFace(city, cityS, 1, bump(t, neon, 0.35));
        const neonAt = [neon + 0.2, neon + 0.48, neon + 0.76];
        let neonOn = 0;
        for (let i = 0; i < neons.length; i++) {
          const s = popIn(ease, t, neonAt[i], 0.28);
          applyFace(neons[i].hold, s, 1, bump(t, neonAt[i], 0.3));
          const glow = (0.55 + 0.45 * Math.abs(Math.sin(t * 3.2 + i))) * (s > 0.6 ? 1 : 0);
          neons[i].glow.scale.set(s, s, 1);
          neons[i].glow.material.opacity = glow * 0.85;
          if (s > 0.6) neonOn = 1;
        }
        for (let i = 0; i < neonMats.length; i++) {
          neonMats[i].emissive.set('#ffe6f2');
          neonMats[i].emissiveIntensity = neonOn * (0.35 + 0.25 * Math.abs(Math.sin(t * 4 + i)));
        }
        const vendS = popIn(ease, t, neon + 0.9, 0.3);
        applyFace(vend, vendS, 1, bump(t, neon + 0.9, 0.28));
        for (let i = 0; i < vendMats.length; i++) {
          vendMats[i].emissive.set('#d7fff4');
          vendMats[i].emissiveIntensity = vendS > 0.7 ? 0.4 : 0;
        }
        neonLight.intensity = risen * neonOn * (0.55 + 0.15 * Math.sin(t * 5));

        const stallS = popIn(ease, t, food, 0.36);
        applyFace(stall, stallS, 1, bump(t, food, 0.32));
        const ramenF = face(t, food + 0.08, lost - 0.18);
        applyFace(ramenHold, ramenF, ramenF > 0.92 ? breathe : 1, bump(t, food + 0.1, 0.34));
        for (let i = 0; i < foods.length; i++) {
          const s = popIn(ease, t, food + 0.28 + i * 0.16, 0.24) * (stallS > 0.4 ? 1 : 0);
          foods[i].scale.set(s, s, s > 0.02 ? 1 : 0);
        }
        const noteS = popIn(ease, t, food + 0.85, 0.3) * (stallS > 0.4 ? 1 : 0);
        tried.scale.set(noteS, noteS, noteS > 0.02 ? 1 : 0);
        const steamOn = ramenF > 0.5 ? 1 : 0;
        for (let i = 0; i < steam.length; i++) {
          const w = (t * 0.7 + i * 0.45) % 1;
          steam[i].position.y = stallH * 0.62 + w * 0.28;
          steam[i].position.x = -0.2 + i * 0.3 + Math.sin(t * 1.6 + i) * 0.03;
          steam[i].scale.setScalar(0.7 + w * 0.5);
          steam[i].material.opacity = steamOn * Math.sin(w * Math.PI) * 0.8;
        }

        const lostF = face(t, lost, lanterns - 0.2);
        applyFace(lostHold, lostF, lostF > 0.92 ? breathe : 1, bump(t, lost, 0.3));
        const frame = t >= laughed ? 1 : 0;
        if (lostFlip && frame !== lostFrame) {
          lostFlip.show(frame);
          lostFrame = frame;
        }
        const flick = bump(t, laughed, 0.22);
        if (lostF > 0.9) lostHold.scale.x = Math.max(0.08, 1 - 0.92 * flick);
        const qS = popIn(ease, t, lost + 0.22, 0.24) * (lostF > 0.4 ? 1 : 0);
        qMark.scale.set(qS, qS, qS > 0.02 ? 1 : 0);
        qMark.rotation.z = Math.sin(t * 3) * 0.1 * qS;
        const haS = popIn(ease, t, laughed + 0.05, 0.22) * (lostF > 0.5 ? 1 : 0);
        for (let i = 0; i < ha.length; i++) {
          const hop = haS > 0.2 ? Math.abs(Math.sin(t * 6 + i)) * 0.06 : 0;
          ha[i].scale.set(haS, haS, haS > 0.02 ? 1 : 0);
          ha[i].position.y = lostH * 0.7 + i * 0.08 + hop;
        }
        const prog = smoothstep(lost + 0.1, lost + 1.15, t) * (lostF > 0.2 ? 1 : 0);
        for (let i = 0; i < PATH_N; i++) {
          const s = prog * PATH_N > i + 0.2 ? 1 : 0;
          scratchP.set(pathX[i], 0.002, pathZ[i]);
          scratchQ.setFromAxisAngle(YUP, pathA[i]);
          scratchS.set(s, 1, s > 0 ? 1 : 0);
          scratchM.compose(scratchP, scratchQ, scratchS);
          dashes.setMatrixAt(i, scratchM);
        }
        dashes.instanceMatrix.needsUpdate = true;

        const archS = popIn(ease, t, lanterns, 0.45);
        archPivotL.scale.set(archS, archS, archS > 0.02 ? 1 : 0);
        archPivotR.scale.set(archS, archS, archS > 0.02 ? 1 : 0);
        for (let i = 0; i < lanternMeshes.length; i++) {
          const s = popIn(ease, t, lanterns + 0.2 + i * 0.14, 0.22);
          lanternMeshes[i].scale.set(s, s, s > 0.02 ? 1 : 0);
          lanternMeshes[i].rotation.z = Math.sin(t * 1.35 + i) * 0.05 * (s > 0.6 ? 1 : 0);
        }
        const wishF = face(t, lanterns + 0.2, anniversary - 0.18);
        applyFace(wishHold, wishF, wishF > 0.92 ? breathe : 1, bump(t, lanterns + 0.25, 0.34));
        for (let i = 0; i < 5; i++) {
          const age = (t * 0.35 + i * 0.17) % 1;
          const on = wishF > 0.6 ? Math.sin(age * Math.PI) : 0;
          scratchP.set(-0.2 + (i - 2) * 0.12, 0.9 + age * 0.55, 0.05);
          scratchQ.identity();
          scratchS.set(on, on, on > 0.02 ? 1 : 0);
          scratchM.compose(scratchP, scratchQ, scratchS);
          motes.setMatrixAt(i, scratchM);
        }
        motes.instanceMatrix.needsUpdate = true;

        const hugF = face(t, anniversary, next - 0.2);
        applyFace(hugHold, hugF, hugF > 0.92 ? breathe : 1, bump(t, anniversary, 0.4));
        const heartS = popIn(ease, t, anniversary + 0.05, 0.4) * (hugF > 0.3 || t > next ? 1 : 0);
        // Heart stays behind the goodbye wide.
        const heartStay = Math.max(heartS, popIn(ease, t, anniversary + 0.05, 0.4) * (t > anniversary ? 1 : 0));
        heartPivot.scale.set(heartStay, heartStay, heartStay > 0.02 ? 1 : 0);
        const ribS = popIn(ease, t, anniversary + 0.28, 0.4);
        ribL.scale.set(ribS, ribS, ribS > 0.02 ? 1 : 0);
        ribR.scale.set(ribS, ribS, ribS > 0.02 ? 1 : 0);
        const heartsOn = smoothstep(anniversary + 0.35, anniversary + 0.7, t);
        for (let i = 0; i < 5; i++) {
          const age = (t * 0.28 + i * 0.19) % 1;
          const on = heartsOn * Math.sin(age * Math.PI);
          scratchP.set(-0.15 + (i - 2) * 0.1, 1.05 + age * 0.4, 0.06);
          scratchQ.identity();
          scratchS.set(on * 0.9, on * 0.9, on > 0.02 ? 1 : 0);
          scratchM.compose(scratchP, scratchQ, scratchS);
          floatHearts.setMatrixAt(i, scratchM);
        }
        floatHearts.instanceMatrix.needsUpdate = true;
        warmLight.intensity = risen * (archS > 0.5 ? 0.45 : 0) + risen * heartsOn * 0.35;

        for (let i = 0; i < memories.length; i++) {
          const s = popIn(ease, t, more + i * 0.18, 0.32);
          memories[i].scale.set(s, s, s > 0.02 ? 1 : 0);
        }

        const byeS = smoothstep(next, next + 0.3, t) * risen;
        const byeU = smoothstep(next + 0.15, wideAt - 0.15, t);
        byeSlider.update(alpha, byeU);
        byeRoot.scale.set(byeS, byeS, byeS > 0.02 ? 1 : 0);
        const bphase = t * 2.6;
        const bfrac = bphase - Math.floor(bphase);
        byeRoot.position.y = byeS > 0.4 ? Math.sin(bfrac * Math.PI) * 0.04 : 0;
        byeRoot.rotation.z = byeS > 0.4 ? Math.sin(bfrac * Math.PI * 2) * 0.04 : 0;
        const arrowS = popIn(ease, t, next + 0.35, 0.36);
        applyFace(arrowHold, arrowS, 1, bump(t, next + 0.4, 0.3));
        const sparkOn = arrowS > 0.5 ? 1 : 0;
        for (let i = 0; i < 6; i++) {
          const p = 0.55 + 0.45 * Math.abs(Math.sin(t * 3.4 + i));
          scratchP.set(-0.9 + i * 0.36, 0.32 + Math.sin(t * 2 + i) * 0.06, 0.04);
          scratchQ.identity();
          scratchS.set(p * sparkOn, p * sparkOn, sparkOn);
          scratchM.compose(scratchP, scratchQ, scratchS);
          sparks.setMatrixAt(i, scratchM);
        }
        sparks.instanceMatrix.needsUpdate = true;

        void wideAt;
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
    alphaTest: 0.45,
    roughness: 0.94,
    metalness: 0,
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
    alphaTest: 0.32,
    roughness: 0.94,
    metalness: 0,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function ropeGeo(THREE, side) {
  const geo = new THREE.PlaneGeometry(2.35, 0.028);
  geo.translate(side * 1.2, 0.7, 0.02);
  return geo;
}

function layDots(mesh, indices, path, originX, uFly, show, m, p, q, s) {
  const last = path.length - 1;
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k];
    const u = i / last;
    const grow = (uFly - u) / 0.07;
    const sc = show * (grow <= 0 ? 0 : grow >= 1 ? 1 : grow);
    // onPage origin sits `originX` from the gutter. Spread X maps back to that.
    const lx = Math.abs(path[i][0]) - originX;
    p.set(lx, 0.002, path[i][1]);
    q.identity();
    s.set(sc, 1, sc > 0.02 ? 1 : 0);
    m.compose(p, q, s);
    mesh.setMatrixAt(k, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function letterSign(ctx, canvas, FONT) {
  const text = L('Tokyo', 'Tokio');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6b4630';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 78, 250);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, 300, 152);
}

function letterPass(ctx, canvas, FONT, text) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6b4630';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 92, canvas.width * 0.58);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, canvas.width * 0.36, canvas.height * 0.5);
}

function heartTag(paper, FONT, C, text) {
  const W = 640;
  const H = 560;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.translate(W / 2, H * 0.48);
  ctx.beginPath();
  ctx.moveTo(0, 150);
  ctx.bezierCurveTo(-210, 40, -200, -150, 0, -40);
  ctx.bezierCurveTo(200, -150, 210, 40, 0, 150);
  ctx.fillStyle = '#e2574c';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#f6edd9';
  ctx.stroke();
  ctx.fillStyle = '#fffaf3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, 64, 300);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, 0, 8);
  void C;
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

function stampArt(paper, FONT, C, text) {
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
  void C;
  return canvas;
}

function noteArt(paper, FONT, C, text) {
  const W = 860;
  const H = 280;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#fff7df';
  roundBox(ctx, 16, 30, W - 32, H - 60, 18);
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `700 ${n}px ${FONT.hand}`, 78, W * 0.84);
  ctx.font = `700 ${size}px ${FONT.hand}`;
  ctx.fillText(text, W / 2, H * 0.48);
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

function ribbonArt(paper, FONT, C, text, tall) {
  const W = 1400;
  const H = tall ? 520 : 180;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  const y = tall ? H * 0.62 : H * 0.5;
  const bh = tall ? 150 : H - 16;
  ctx.fillStyle = C.tomato;
  roundBox(ctx, 20, y - bh / 2, W - 40, bh, 24);
  ctx.fill();
  ctx.fillStyle = '#fffaf3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `${n}px ${FONT.display}`, tall ? 78 : 64, W * 0.9);
  ctx.font = `${size}px ${FONT.display}`;
  ctx.fillText(text, W / 2, y + 4);
  return canvas;
}

function ticked(paper, src, C) {
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
  void C;
  return canvas;
}

function memoryArt(paper, src) {
  const W = 460;
  const H = 540;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#fffaf3';
  roundBox(ctx, 8, 8, W - 16, H - 16, 10);
  ctx.fill();
  const x = 32;
  const y = 32;
  const w = W - 64;
  const h = H - 120;
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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
