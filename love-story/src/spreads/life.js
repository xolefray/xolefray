// Spread 6 — "Building our life". One couple card at a time, big and centred on its stop:
// moving boxes and a ribbon, a first apartment, Cherry, a home, Japan, then the next chapter.
// Times come from timeline.BEATS / NARRATION / SPREADS. update() allocates nothing.
import { L } from '../i18n.js';
import { photoPrint, PHOTO_ASPECT } from '../photos.js';

const GAMMA = 1.78;
const SKY_W = 6.0;
const SKY_H = 1.7;
const SKY_Z0 = -0.45;
const OPEN = 0.92;
const CLEAR = 0.02;
const SMALL = 0.42;

// Page distance from the gutter. Spread x is −x on the left page and +x on the right.
// The sky wall sits near z = −0.5, so every prop stays in front of it (z ≥ −0.25).
const BOX_X = 3.02;
const BOX_Z = 0.85;
const BOX_H = 1.22;
const APT_X = 2.2;
const APT_Z = -0.05;
const APT_H = 1.32;
const BOXER_X = 1.9;
const BOXER_Z = 0.5;
const BOXER_H = 1.56;
const CUDDLE_X = 1.72;
const CUDDLE_Z = 0.42;
const CUDDLE_H = 1.5;
const JUMP_X = 1.55;
const JUMP_Z = 0.95;
const JUMP_H = 0.52;
const BED_X = 2.18;
const BED_Z = 0.32;
const BED_H = 0.58;
const RIBBON_X = 2.72;
const RIBBON_Z = -0.15;
const RIBBON_W = 1.55;
const RIBBON_H = 0.56;
const HOUSE_X = 1.48;
const HOUSE_Z = 0.08;
const HOUSE_H = 1.46;
const HOME_X = 1.24;
const HOME_Z = 0.78;
const DEED_H = 1.08;
const KEYS_H = 1.42;
const TRAVEL_X = 1.55;
const TRAVEL_Z = 0.62;
const TRAVEL_H = 1.48;
const GATE_X = 2.58;
const GATE_Z = 0.36;
const GATE_H = 1.68;
const TORII_X = 3.05;
const TORII_Z = -0.08;
const TORII_H = 1.12;
const SELFIE_X = 1.9;
const SELFIE_Z = 1.0;
const SELFIE_H = 1.5;

export default {
  id: 'life',
  title: 'Building our life',
  build(ctx) {
    const { THREE, paper, popup, rng, photos, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, NARRATION, COUPLE, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'life');
    const line = (id) => NARRATION.find((n) => n.id === id);
    const h4 = line('h4');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'life';

    // Scratch for instance matrices. Created once; update() only writes them.
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const mat = new THREE.Matrix4();

    const has = (id) => !!(art && art.has && art.has(id));
    const meta = (id) => (has(id) ? art.info(id) : null);
    const charInfo = (id) => (characters && characters.has && characters.has(id) ? characters.info(id) : null);

    const building = BEATS.buildingLife;
    const first = BEATS.firstPlace;
    const cherry = BEATS.cherry;
    const home = BEATS.home;
    const japan = BEATS.japan;
    const next = BEATS.nextChapter;
    const travelAt = h4 ? h4.start : (home + japan) * 0.5;
    const cuddleAt = cherry + (home - cherry) * 0.4;
    const keysAt = home + (travelAt - home) * 0.5;

    const pages = paintPages(paper, art, has, C, rng);
    const leftArt = pages.left;
    const rightArt = pages.right;

    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };
    const stand = (side, x, z, w, h, fold = 'back') => track(popup.standUp({
      side, x, z, fold, width: w, height: h,
    }));

    const showRigs = [];
    const showAt = [];
    const castRigs = [];
    const castAt = [];
    const castLeave = [];
    const castPhase = [];
    const photoRigs = [];
    const tagHolds = [];
    const tagAt = [];
    const mats = [[], [], [], [], []];

    const addShow = (rig, at) => {
      showRigs.push(rig);
      showAt.push(at);
      return rig;
    };
    const addCast = (rig, at, leave, phase) => {
      castRigs.push(rig);
      castAt.push(at);
      castLeave.push(leave);
      castPhase.push(phase);
      return rig;
    };
    const watch = (zone, root) => {
      if (!root) return;
      root.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) {
          o.material.emissive.setHex(0xffc48a);
          mats[zone].push(o.material);
        }
      });
    };
    const rigOn = (mount, name) => {
      const rig = new THREE.Group();
      rig.name = name;
      mount.mount.add(rig);
      return rig;
    };

    function mountDrawing(rig, source, id, height, fallback) {
      const drawn = source === 'art'
        ? (has(id) ? characterArt.characterCard(paper, art, id, { height }) : null)
        : characterArt.actor(paper, characters, ctx.figures, id, fallback, { height });
      if (!drawn) return null;
      const info = source === 'art' ? meta(id) : charInfo(id);
      seat(drawn, info, height);
      drawn.name = id;
      rig.add(drawn);
      return drawn;
    }

    // ---------------------------------------------------------------- sky
    let fujiCard = null;
    const sky = track(popup.vFold({ z0: SKY_Z0, gamma: GAMMA, width: SKY_W, height: SKY_H }));
    if (has('sky-band')) {
      const cut = paper.dieCut(art.canvas('sky-band'), { margin: 6 });
      const halves = paper.splitCard({ canvas: cut, width: SKY_W, height: SKY_H });
      halves.left.name = 'sky-left';
      halves.right.name = 'sky-right';
      sky.left.add(halves.left);
      sky.right.add(halves.right);
      if (has('fuji')) {
        const fujiH = 0.86;
        fujiCard = characterArt.characterCard(paper, art, 'fuji', { height: fujiH });
        const fm = meta('fuji');
        const fs = fujiH / fm.h;
        fujiCard.position.set(1.55, 0.18 + (fm.h - fm.feet[1]) * fs, 0.012);
        fujiCard.name = 'fuji';
        fujiCard.scale.set(0, 0, 1);
        sky.right.add(fujiCard);
      }
    } else {
      const flat = paper.paint(1200, 360, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#9fd0ea');
        grd.addColorStop(1, '#f6e7c8');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      }, { dieCut: 0, seed: 4 });
      const halves = paper.splitCard({ canvas: flat, width: SKY_W, height: SKY_H });
      sky.left.add(halves.left);
      sky.right.add(halves.right);
    }

    // ---------------------------------------------------------------- dotted path (flat on the pages, draws itself)
    const path = buildPath();
    const dotsL = makeDots(THREE, paper, path.left.n);
    const dotsR = makeDots(THREE, paper, path.right.n);
    const pageL = track(popup.onPage({ side: 'left', x: 0, z: 0, lift: 0.01 }));
    const pageR = track(popup.onPage({ side: 'right', x: 0, z: 0, lift: 0.012 }));
    pageL.mount.add(dotsL);
    pageR.mount.add(dotsR);
    const sparkL = makeSparks(THREE, paper, pageL.mount, 3);
    const sparkR = makeSparks(THREE, paper, pageR.mount, 3);

    // ---------------------------------------------------------------- opening: boxes + ribbon
    const boxW = propW(meta('moving-boxes'), BOX_H, 0.86);
    const boxes = stand('left', BOX_X, BOX_Z, boxW, BOX_H);
    const boxRig = addShow(rigOn(boxes, 'moving-boxes'), spread.open - 1);
    watch(0, mountDrawing(boxRig, 'art', 'moving-boxes', BOX_H));

    const ribbon = stand('right', RIBBON_X, RIBBON_Z, RIBBON_W, RIBBON_H);
    const ribbonRig = addShow(rigOn(ribbon, 'ribbon'), spread.open - 1);
    const ribbonCard = paper.card({
      canvas: paintRibbon(paper, FONT, C, L('building our life', 'construyendo nuestra vida')),
      width: RIBBON_W,
      height: RIBBON_H,
      anchor: 'bottom-center',
    });
    ribbonCard.name = 'ribbon';
    ribbonCard.position.y = CLEAR;
    ribbonRig.add(ribbonCard);
    watch(0, ribbonCard);

    // ---------------------------------------------------------------- first place
    const aptW = propW(meta('apartment'), APT_H, 1.2);
    const apt = stand('left', APT_X, APT_Z, aptW, APT_H);
    const aptRig = addShow(rigOn(apt, 'apartment'), first);
    const aptCard = mountDrawing(aptRig, 'art', 'apartment', APT_H);
    watch(1, aptCard);
    let keyPivot = null;
    if (aptCard && meta('apartment')) {
      const am = meta('apartment');
      const as = APT_H / am.h;
      keyPivot = new THREE.Group();
      keyPivot.name = 'key';
      const keyCard = makeKey(paper, 0.16);
      keyCard.position.y = -0.16;
      keyPivot.add(keyCard);
      keyPivot.position.set((280 - am.feet[0]) * as, (am.feet[1] - 372) * as, 0.02);
      aptCard.add(keyPivot);
    }

    const boxerW = propW(charInfo('life-box'), BOXER_H, 0.94);
    const boxers = stand('left', BOXER_X, BOXER_Z, boxerW, BOXER_H);
    const boxerRig = addCast(rigOn(boxers, 'life-box'), first, cherry, 0.2);
    watch(1, mountDrawing(boxerRig, 'char', 'life-box', BOXER_H, {
      who: 'him', outfit: 'casual', pose: 'stand', facing: 'left',
    }));
    const firstTag = layTag(paper, THREE, popup, track, FONT, 'left', 2.58, 1.22, 1.32, 0.28,
      L('our first place', 'nuestro primer hogar'), C, 3);
    tagHolds.push(firstTag);
    tagAt.push(first);

    // ---------------------------------------------------------------- Cherry
    const bedW = propW(meta('dog-bed'), BED_H, 0.6);
    const bed = stand('left', BED_X, BED_Z, bedW, BED_H);
    const bedRig = addShow(rigOn(bed, 'dog-bed'), cherry);
    watch(2, mountDrawing(bedRig, 'art', 'dog-bed', BED_H));

    const jumpW = propW(charInfo('dog-jump'), JUMP_H, 0.4);
    const jumpStand = stand('left', JUMP_X, JUMP_Z, jumpW, JUMP_H);
    const jumpRig = addCast(rigOn(jumpStand, 'dog-jump'), cherry, cuddleAt, 1.4);
    const jumpCard = mountDrawing(jumpRig, 'char', 'dog-jump', JUMP_H, { who: 'dog', pose: 'run' });
    watch(2, jumpCard);
    const jump = jumpRig;

    const cuddleW = propW(charInfo('life-dogcuddle'), CUDDLE_H, 0.86);
    const cuddleStand = stand('left', CUDDLE_X, CUDDLE_Z, cuddleW, CUDDLE_H);
    const cuddleRig = addCast(rigOn(cuddleStand, 'life-dogcuddle'), cuddleAt, home, 0.6);
    watch(2, mountDrawing(cuddleRig, 'char', 'life-dogcuddle', CUDDLE_H, {
      who: 'her', outfit: 'casual', pose: 'stand', facing: 'right',
    }));

    const cherryTag = layTag(paper, THREE, popup, track, FONT, 'left', 1.08, 1.22, 0.86, 0.26,
      L('Cherry ♥', 'Cherry ♥'), C, 5);
    tagHolds.push(cherryTag);
    tagAt.push(cherry);
    layPhoto(paper, THREE, popup, track, photoRigs, photos ? photos.dog : null, {
      caption: L('Cherry, our girl', 'Cherry, nuestra niña'),
      aspect: PHOTO_ASPECT.dog,
      seed: 4,
      side: 'left',
      x: 0.7,
      z: 0.48,
      long: 1.16,
      tilt: -0.06,
      at: cherry,
      shrink: home,
      retireX: 0.42,
      retireZ: 1.16,
    });

    // ---------------------------------------------------------------- home
    const house = stand('right', HOUSE_X, HOUSE_Z, propW(meta('house'), HOUSE_H, 1.38), HOUSE_H);
    const houseRig = addShow(rigOn(house, 'house'), home);
    let sold = null;
    const smokes = [];
    if (has('house')) {
      const hm = meta('house');
      const painted = cloneCanvas(paper, art.canvas('house'));
      letterMailbox(painted.ctx, FONT, C, COUPLE.names);
      const card = cardFromCanvas(THREE, paper, painted.canvas, hm.feet, HOUSE_H, 'house');
      seat(card, hm, HOUSE_H);
      houseRig.add(card);
      watch(3, card);
      const s = HOUSE_H / hm.h;
      sold = new THREE.Group();
      sold.name = 'sold';
      sold.position.set((616 - hm.feet[0]) * s, (hm.feet[1] - 618) * s, 0.04);
      const soldCard = paper.card({
        canvas: paintSold(paper, FONT, C, rng, L('SOLD', 'VENDIDA')),
        width: 220 * s,
        height: 124 * s,
        anchor: 'bottom-center',
      });
      soldCard.name = 'sold';
      sold.add(soldCard);
      card.add(sold);

      const puff = puffTex(paper, THREE);
      const chimneyX = (490 - hm.feet[0]) * s;
      const chimneyY = (hm.feet[1] - 78) * s;
      for (let i = 0; i < 2; i++) {
        const mesh = new THREE.Mesh(puff.geo, puff.mat.clone());
        mesh.name = 'smoke';
        mesh.castShadow = false;
        mesh.position.set(chimneyX, chimneyY, 0.02);
        mesh.userData.baseX = chimneyX;
        mesh.userData.baseY = chimneyY;
        mesh.userData.phase = i * 0.5;
        card.add(mesh);
        smokes.push(mesh);
      }
    }

    const deedW = propW(charInfo('life-deed'), DEED_H, 1.02);
    const keysW = propW(charInfo('life-keys'), KEYS_H, 0.9);
    const homeStand = stand('right', HOME_X, HOME_Z, keysW, KEYS_H);
    const deedRig = addCast(rigOn(homeStand, 'life-deed'), home, keysAt, 0.4);
    watch(3, mountDrawing(deedRig, 'char', 'life-deed', DEED_H, {
      who: 'him', outfit: 'casual', pose: 'sit', facing: 'right',
    }));
    const keysRig = addCast(rigOn(homeStand, 'life-keys'), keysAt, travelAt, 1.1);
    watch(3, mountDrawing(keysRig, 'char', 'life-keys', KEYS_H, {
      who: 'her', outfit: 'casual', pose: 'stand', facing: 'left',
    }));

    const homeTag = layTag(paper, THREE, popup, track, FONT, 'right', 0.98, 1.26, 1.32, 0.28,
      L('a home of our own', 'nuestra propia casa'), C, 7);
    tagHolds.push(homeTag);
    tagAt.push(home);
    layPhoto(paper, THREE, popup, track, photoRigs, photos ? photos.deed : null, {
      caption: L('signing the deed', 'firmando las escrituras'),
      aspect: PHOTO_ASPECT.deed,
      seed: 6,
      side: 'right',
      x: 2.55,
      z: 0.72,
      long: 1.22,
      tilt: 0.05,
      at: home,
      shrink: japan,
      retireX: 3.15,
      retireZ: 0.42,
    });

    // ---------------------------------------------------------------- Japan
    const travelW = propW(charInfo('life-japan'), TRAVEL_H, 1.06);
    const travel = stand('right', TRAVEL_X, TRAVEL_Z, travelW, TRAVEL_H);
    const travelRig = addCast(rigOn(travel, 'life-japan'), travelAt, japan, 0.3);
    watch(4, mountDrawing(travelRig, 'char', 'life-japan', TRAVEL_H, {
      who: 'him', outfit: 'casual', pose: 'wave', facing: 'left',
    }));

    const toriiW = propW(meta('torii'), TORII_H, 1.15);
    const torii = stand('right', TORII_X, TORII_Z, toriiW, TORII_H);
    const toriiRig = addShow(rigOn(torii, 'torii'), japan);
    watch(4, mountDrawing(toriiRig, 'art', 'torii', TORII_H));

    const gateW = propW(meta('temple-gate'), GATE_H, 1.64);
    const gate = stand('right', GATE_X, GATE_Z, gateW, GATE_H);
    const gateRig = addShow(rigOn(gate, 'temple-gate'), japan);
    watch(4, mountDrawing(gateRig, 'art', 'temple-gate', GATE_H));

    const selfieW = propW(charInfo('japan-selfie'), SELFIE_H, 1.0);
    const selfieStand = stand('right', SELFIE_X, SELFIE_Z, selfieW, SELFIE_H);
    const selfieRig = addCast(rigOn(selfieStand, 'japan-selfie'), japan, null, 1.6);
    watch(4, mountDrawing(selfieRig, 'char', 'japan-selfie', SELFIE_H, {
      who: 'him', outfit: 'casual', pose: 'wave', facing: 'right',
    }));

    const japanTag = layTag(paper, THREE, popup, track, FONT, 'right', 1.55, 0.98, 1.55, 0.28,
      L('our two-year anniversary', 'nuestro segundo aniversario'), C, 9);
    tagHolds.push(japanTag);
    tagAt.push(japan);
    layPhoto(paper, THREE, popup, track, photoRigs, photos ? photos.tokyo : null, {
      caption: L('Tokyo · 2 years', 'Tokio · 2 años'),
      aspect: PHOTO_ASPECT.tokyo,
      seed: 8,
      side: 'right',
      x: 0.92,
      z: 0.22,
      long: 1.18,
      tilt: -0.05,
      at: japan,
      shrink: 0,
      retireX: 0.92,
      retireZ: 0.22,
    });

    const nextTag = layTag(paper, THREE, popup, track, FONT, 'right', 2.45, 1.24, 1.7, 0.3,
      L('next chapter →', 'próximo capítulo →'), C, 11);
    // The anniversary tag sits here until the chapter line replaces it.
    tagHolds.push(nextTag);
    tagAt.push(next);

    // Paper plane + a few petals. Scaled in Y by rise so the arc lies flat while the page turns.
    const flight = new THREE.Group();
    flight.name = 'flight';
    group.add(flight);
    let plane = null;
    if (has('paper-plane')) {
      plane = characterArt.characterCard(paper, art, 'paper-plane', { height: 0.42, flip: true });
      if (plane) {
        const pm = meta('paper-plane');
        plane.position.y = (pm.h - pm.feet[1]) * (0.42 / pm.h);
        plane.name = 'paper-plane';
        flight.add(plane);
      }
    }
    const petals = [];
    const petal = petalMesh(paper, THREE);
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(petal.geo, petal.mat.clone());
      mesh.name = 'petal';
      mesh.castShadow = false;
      mesh.userData.x0 = 1.7 + rng.next() * 1.15;
      mesh.userData.z0 = -0.05 + rng.next() * 0.55;
      mesh.userData.phase = rng.next();
      mesh.userData.speed = 0.22 + rng.next() * 0.16;
      mesh.userData.spin = (rng.next() - 0.5) * 2.2;
      flight.add(mesh);
      petals.push(mesh);
    }

    const glow = new THREE.PointLight('#ffd0a4', 0, 4.2, 2);
    glow.name = 'life-glow';
    glow.castShadow = false;
    glow.position.set(0, 1.3, 0.4);
    group.add(glow);

    const lightAt = [
      [-1.6, 1.3, 0.45],
      [-1.9, 1.25, 0.4],
      [-1.15, 1.2, 0.3],
      [1.7, 1.2, 0.55],
      [2.15, 1.25, 0.55],
    ];

    const cues = [
      { t: spread.open, hold: 2.6, at: [0, 0.85, 0.1], size: 7.5, from: 'front' },
      { t: round2(first + 0.5), hold: 2.2, at: [-1.85, 1.0, 0.4], size: 2.6, from: 'left' },
      { t: round2(cuddleAt + 0.45), hold: 2.0, at: [-1.22, 0.62, 0.45], size: 3.6, from: 'front' },
      { t: round2(home + 0.65), hold: 2.2, at: [1.85, 0.95, 0.6], size: 3.5, from: 'right' },
      { t: round2(japan + 0.6), hold: 2.0, at: [1.55, 1.05, 0.45], size: 3.6, from: 'front' },
      { t: round2(next + 0.45), hold: 2.2, at: [0.35, 0.9, 0.15], size: 7.5, from: 'high' },
    ];

    return {
      group,
      leftArt,
      rightArt,
      cues,
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const risen = popup.rise(alpha);
        const open = alpha > OPEN * Math.PI ? 1 : 0;
        const outBack = ease.outBack;

        let zone = 0;
        if (t >= japan) zone = 4;
        else if (t >= home) zone = 3;
        else if (t >= cherry) zone = 2;
        else if (t >= first) zone = 1;

        for (let i = 0; i < showRigs.length; i++) {
          const pop = appear(t, showAt[i], outBack);
          const breathe = pop > 0.2 ? 1 + Math.sin(t * 1.6 + i) * 0.008 : 1;
          const bumpAt = i === 0 || i === 1 ? building : showAt[i];
          const b = bump(t, bumpAt);
          const sx = pop * breathe * (1 - 0.05 * b);
          const sy = pop * breathe * (1 + 0.06 * b);
          showRigs[i].scale.set(sx, sy, 1);
          showRigs[i].position.y = pop > 0.2 ? Math.sin(t * 1.4 + i) * 0.008 : 0;
        }
        if (fujiCard) {
          const pop = appear(t, japan, outBack);
          const b = bump(t, japan);
          fujiCard.scale.set(pop * (1 - 0.04 * b), pop * (1 + 0.05 * b), 1);
        }

        for (let i = 0; i < castRigs.length; i++) {
          poseCast(castRigs[i], t, castAt[i], castLeave[i], castPhase[i], outBack);
        }
        // Cherry's hop, then a smaller bounce until the cuddle card takes over.
        if (jump) {
          const age = t - cherry;
          const alive = t >= cherry && t < cuddleAt + 0.4;
          const hopY = alive && age > 0
            ? Math.abs(Math.sin(age * 7.2)) * (0.02 + 0.07 * Math.exp(-age * 0.8))
            : 0;
          jump.position.y = hopY;
        }
        if (keyPivot) keyPivot.rotation.z = Math.sin(t * 2.2) * (0.22 + 0.4 * bump(t, first));

        if (sold) {
          const u = smoothstep(home, home + 0.55, t);
          let swing = outBack(u);
          if (swing < 0) swing = 0;
          else if (swing > 1.06) swing = 1.06;
          sold.rotation.x = open ? (1 - swing) * (Math.PI / 2) : 0;
        }
        const houseUp = t >= home ? 1 : 0;
        for (let i = 0; i < smokes.length; i++) {
          const mesh = smokes[i];
          const loop = (t * 0.28 + mesh.userData.phase) % 1;
          mesh.position.y = mesh.userData.baseY + open * houseUp * loop * 0.06;
          mesh.position.x = mesh.userData.baseX + Math.sin(t * 1.4 + i) * 0.012 * open;
          mesh.material.opacity = open * houseUp * (1 - loop) * 0.85;
          mesh.scale.setScalar(0.8 + loop * 0.35);
        }

        for (let i = 0; i < photoRigs.length; i++) {
          const p = photoRigs[i];
          const s = photoK(t, p.at, p.shrink, outBack);
          p.hold.scale.setScalar(s > 0.001 ? s : 0.001);
          let k = 0;
          if (p.shrink > 0 && t > p.shrink) {
            const v = (t - p.shrink) / 0.5;
            k = v >= 1 ? 1 : v * v * (3 - 2 * v);
          }
          p.hold.position.set(
            p.sign * (p.x0 + (p.x1 - p.x0) * k),
            0,
            p.z0 + (p.z1 - p.z0) * k,
          );
        }
        // The house stays, smaller, once Japan takes the right page.
        if (houseRig) {
          const tuck = smoothstep(japan, japan + 0.55, t);
          const k = 1 - tuck * 0.42;
          houseRig.scale.x *= k;
          houseRig.scale.y *= k;
        }
        for (let i = 0; i < tagHolds.length; i++) {
          const s = appear(t, tagAt[i], outBack);
          tagHolds[i].scale.setScalar(s > 0.001 ? s : 0.001);
        }

        const progress = pathProgress(t, building, first, cherry, home, japan, next, path.markU, smoothstep);
        layDots(dotsL, path.left, progress, pos, quat, scl, mat);
        layDots(dotsR, path.right, progress, pos, quat, scl, mat);
        const sparkling = t >= next ? 1 : 0;
        placeSparks(sparkL, path.left, t, next, sparkling);
        placeSparks(sparkR, path.right, t, next, sparkling);

        flight.scale.set(1, risen, 1);
        const uFly = smoothstep(travelAt, japan + 0.7, t);
        const showPlane = smoothstep(travelAt - 0.2, travelAt + 0.25, t)
          * (1 - smoothstep(japan + 0.9, japan + 1.5, t));
        if (plane) {
          const x = 0.55 + (2.85 - 0.55) * uFly;
          const z = 0.15 + (-0.15 - 0.15) * uFly;
          const y = 1.2 + Math.sin(uFly * Math.PI) * 0.28;
          plane.scale.setScalar(showPlane > 0.001 ? showPlane : 0.001);
          plane.position.x = x;
          plane.position.z = z;
          plane.position.y = y + Math.sin(t * 2.4) * 0.02;
          plane.rotation.z = -0.5 * Math.cos(uFly * Math.PI);
          plane.rotation.x = -0.3;
        }
        const petalShow = smoothstep(japan - 0.2, japan + 0.35, t);
        for (let i = 0; i < petals.length; i++) {
          const p = petals[i];
          const loop = (t * p.userData.speed + p.userData.phase) % 1;
          p.position.set(
            p.userData.x0 + Math.sin(loop * 6 + p.userData.phase) * 0.08,
            0.12 + 1.15 * (1 - loop),
            p.userData.z0,
          );
          p.rotation.z = p.userData.spin * t;
          p.material.opacity = Math.sin(loop * Math.PI) * petalShow;
        }

        const at = lightAt[zone];
        glow.position.x = at[0];
        glow.position.y = at[1];
        glow.position.z = at[2];
        glow.intensity = risen * (zone === 0 ? 0.35 : 0.55);
        for (let v = 0; v < mats.length; v++) {
          const warm = (v === zone ? 0.22 : 0.03) * risen;
          const list = mats[v];
          for (let i = 0; i < list.length; i++) list[i].emissiveIntensity = warm;
        }
      },
    };
  },
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function propW(info, height, fallback) {
  if (!info || !(info.h > 0)) return fallback;
  return height * info.w / info.h;
}

function seat(group, info, height) {
  if (!info || !(info.h > 0)) {
    group.position.y = CLEAR;
    return;
  }
  const s = height / info.h;
  group.position.y = (info.h - info.feet[1]) * s + CLEAR;
  group.position.x = (info.feet[0] - info.w / 2) * s;
}

function bump(t, at) {
  const u = (t - at) / 0.42;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

function appear(t, at, outBack) {
  if (t < at) return 0;
  const u = (t - at) / 0.38;
  if (u >= 1) return 1;
  let s = outBack(u);
  if (s < 0) s = 0;
  else if (s > 1) s = 1;
  return s;
}

function poseCast(rig, t, arrive, leave, phase, outBack) {
  let s = 0;
  let squash = 0;
  if (t >= arrive) {
    const u = (t - arrive) / 0.36;
    if (u >= 1) s = 1;
    else {
      s = outBack(u);
      if (s < 0) s = 0;
      else if (s > 1) s = 1;
      squash = Math.sin(u * Math.PI);
    }
    if (leave != null && t > leave) {
      const v = (t - leave) / 0.4;
      if (v >= 1) s = 0;
      else {
        const k = v * v * (3 - 2 * v);
        s *= 1 - k;
      }
      squash = 0;
    }
  }
  const live = s > 0.001;
  const breathe = live ? 1 + Math.sin(t * 1.7 + phase) * 0.01 : 1;
  rig.scale.set(s * breathe * (1 - 0.05 * squash), s * breathe * (1 + 0.07 * squash), 1);
  rig.position.y = live ? Math.sin(t * 1.5 + phase) * 0.01 : 0;
  rig.rotation.z = live ? Math.sin(t * 1.2 + phase) * 0.015 : 0;
}

function photoK(t, arrive, shrink, outBack) {
  let s = appear(t, arrive, outBack);
  if (shrink > 0 && t > shrink) {
    const v = (t - shrink) / 0.45;
    const k = v >= 1 ? 1 : (v <= 0 ? 0 : v * v * (3 - 2 * v));
    s = s * (1 - k) + SMALL * k;
  }
  return s;
}

function pathProgress(t, building, first, cherry, home, japan, next, markU, smoothstep) {
  const marks = [building, first, cherry, home, japan, next];
  if (t <= marks[0]) return 0;
  if (t >= marks[5]) return 1;
  for (let i = 0; i < 5; i++) {
    if (t <= marks[i + 1]) {
      const span = marks[i + 1] - marks[i];
      const u = span > 0 ? (t - marks[i]) / span : 1;
      return markU[i] + (markU[i + 1] - markU[i]) * smoothstep(0, 1, u);
    }
  }
  return 1;
}

function layDots(mesh, pack, progress, pos, quat, scl, mat) {
  const n = pack.n;
  const xs = pack.x;
  const zs = pack.z;
  const us = pack.u;
  for (let i = 0; i < n; i++) {
    const d = (progress - us[i]) * 22;
    let s = d <= 0 ? 0 : d >= 1 ? 1 : d;
    if (us[i] > 0.985) s *= 2.4;
    // Base geometry stays tiny at the gutter (the fold test ignores instance matrices).
    pos.set(xs[i], 0.006, zs[i]);
    scl.set(s * 10, 1, s * 10);
    mat.compose(pos, quat, scl);
    mesh.setMatrixAt(i, mat);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function placeSparks(list, pack, t, next, on) {
  const n = pack.n;
  for (let i = 0; i < list.length; i++) {
    const mesh = list[i];
    if (!on || n < 2) {
      mesh.scale.setScalar(0.001);
      mesh.material.opacity = 0;
      continue;
    }
    const u = (t * 0.28 + mesh.userData.phase) % 1;
    const f = u * (n - 1);
    const a = f | 0;
    const b = a + 1 < n ? a + 1 : a;
    const k = f - a;
    mesh.position.set(
      pack.x[a] + (pack.x[b] - pack.x[a]) * k,
      0.02,
      pack.z[a] + (pack.z[b] - pack.z[a]) * k,
    );
    const pulse = 0.14 + 0.05 * Math.sin(t * 6 + mesh.userData.phase * 10);
    mesh.scale.setScalar(pulse);
    mesh.material.opacity = 0.55 + 0.4 * Math.sin(t * 5 + i);
  }
}

// Spread-frame polyline. u is arc length, 0 at the boxes and 1 at the page-edge arrow.
function buildPath() {
  const pts = [
    [-2.85, 0.72],
    [-2.05, 0.2],
    [-1.35, 0.4],
    [-0.4, 0.22],
    [0.45, 0.18],
    [1.4, 0.4],
    [2.35, 0.35],
    [3.15, 0.95],
    [3.46, 1.2],
  ];
  // Chevron pointing at the outer edge, arriving with the last point.
  const chevron = [
    [3.28, 1.34],
    [3.48, 1.2],
    [3.28, 1.06],
  ];
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(len);
    total += len;
  }
  const raw = [];
  const count = 36;
  for (let i = 0; i <= count; i++) {
    const dist = (total * i) / count;
    let acc = 0;
    let k = 0;
    while (k < seg.length - 1 && acc + seg[k] < dist) {
      acc += seg[k];
      k++;
    }
    const span = seg[k] || 1;
    const f = span > 0 ? (dist - acc) / span : 0;
    const a = pts[k];
    const b = pts[k + 1];
    raw.push([
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      total > 0 ? dist / total : 0,
    ]);
  }
  for (let i = 0; i < chevron.length; i++) raw.push([chevron[i][0], chevron[i][1], 0.995]);

  const stopIdx = [0, 4, 10, 20, 26, raw.length - 1];
  const markU = [];
  for (let i = 0; i < stopIdx.length; i++) markU.push(raw[Math.min(stopIdx[i], raw.length - 1)][2]);
  markU[0] = 0;
  markU[markU.length - 1] = 1;

  const left = takeSide(raw, 'left');
  const right = takeSide(raw, 'right');
  return { left, right, markU };
}

function takeSide(raw, side) {
  const keep = [];
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i][0];
    if (side === 'left' && x < -0.1) keep.push(raw[i]);
    if (side === 'right' && x > 0.1) keep.push(raw[i]);
  }
  const n = Math.max(1, keep.length);
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  const u = new Float32Array(n);
  for (let i = 0; i < keep.length; i++) {
    x[i] = keep[i][0];
    z[i] = keep[i][1];
    u[i] = keep[i][2];
  }
  return { n: keep.length, x, z, u };
}

function makeDots(THREE, paper, n) {
  const geo = new THREE.PlaneGeometry(0.009, 0.009);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(dotCanvas(paper)),
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  mesh.name = 'path-dots';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = Math.max(1, n);
  const m = new THREE.Matrix4();
  m.makeScale(0.001, 1, 0.001);
  for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, m);
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function dotCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(32, 32);
  ctx.fillStyle = '#6b442c';
  ctx.beginPath();
  ctx.arc(16, 16, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f3e2c4';
  ctx.beginPath();
  ctx.arc(16, 16, 4, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function makeSparks(THREE, paper, parent, count) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const base = new THREE.MeshBasicMaterial({
    map: paper.texture(starCanvas(paper)),
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const list = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, base.clone());
    mesh.name = 'sparkle';
    mesh.castShadow = false;
    mesh.userData.phase = i / count;
    mesh.scale.setScalar(0.001);
    parent.add(mesh);
    list.push(mesh);
  }
  return list;
}

function starCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(48, 48);
  ctx.translate(24, 24);
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 8 : 20;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  return canvas;
}

function layTag(paper, THREE, popup, track, FONT, side, x, z, w, h, text, C, seed) {
  const page = track(popup.onPage({ side, x, z, lift: 0.016 + seed * 0.0004 }));
  const hold = new THREE.Group();
  hold.name = 'tag';
  hold.scale.setScalar(0.001);
  const canvas = paintTag(paper, FONT, text, C, seed);
  const mesh = flatMesh(THREE, paper, canvas, w, h);
  mesh.name = 'tag';
  hold.add(mesh);
  page.mount.add(hold);
  return hold;
}

function layPhoto(paper, THREE, popup, track, photoRigs, photo, opts) {
  const shot = photoPrint(photo, {
    width: 520,
    style: 'polaroid',
    caption: opts.caption,
    tilt: opts.tilt,
    tape: true,
    aspect: opts.aspect,
    seed: opts.seed,
  });
  const aspect = shot.width / shot.height;
  let w;
  let h;
  if (aspect >= 1) {
    w = opts.long;
    h = opts.long / aspect;
  } else {
    h = opts.long;
    w = opts.long * aspect;
  }
  const maxW = 2 * Math.min(opts.x - 0.1, 3.5 - opts.x);
  const maxH = 2 * Math.min(opts.z + 1.42, 1.42 - opts.z);
  if (w > maxW && maxW > 0.2) {
    h *= maxW / w;
    w = maxW;
  }
  if (h > maxH && maxH > 0.2) {
    w *= maxH / h;
    h = maxH;
  }
  const sign = opts.side === 'left' ? -1 : 1;
  const page = track(popup.onPage({ side: opts.side, x: 0, z: 0, lift: 0.02 }));
  const hold = new THREE.Group();
  hold.name = 'photo';
  hold.scale.setScalar(0.001);
  hold.position.set(sign * opts.x, 0, opts.z);
  hold.rotation.y = opts.tilt * 0.4;
  const mesh = flatMesh(THREE, paper, paper.dieCut(shot, { margin: 4 }), w, h);
  mesh.name = 'photo';
  hold.add(mesh);
  page.mount.add(hold);
  photoRigs.push({
    hold,
    sign,
    x0: opts.x,
    z0: opts.z,
    x1: opts.retireX,
    z1: opts.retireZ,
    at: opts.at,
    shrink: opts.shrink,
  });
  return hold;
}

function flatMesh(THREE, paper, canvas, w, h) {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    map: paper.texture(canvas),
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function paintPages(paper, art, has, C, rng) {
  let left;
  let right;
  if (has('page-left') && has('page-right')) {
    const Lft = cloneCanvas(paper, art.canvas('page-left'));
    const Rgt = cloneCanvas(paper, art.canvas('page-right'));
    sprinkle(Lft.ctx, Lft.canvas.width, Lft.canvas.height, 'left', C, rng);
    sprinkle(Rgt.ctx, Rgt.canvas.width, Rgt.canvas.height, 'right', C, rng);
    paper.addGrain(Lft.ctx, Lft.canvas.width, Lft.canvas.height, { amount: 0.03, seed: 41, mottle: 0.7 });
    paper.addGrain(Rgt.ctx, Rgt.canvas.width, Rgt.canvas.height, { amount: 0.03, seed: 42, mottle: 0.7 });
    left = Lft.canvas;
    right = Rgt.canvas;
  } else {
    left = paper.page((ctx, w, h) => {
      ctx.fillStyle = '#f3e6d0';
      ctx.fillRect(0, 0, w, h);
      sprinkle(ctx, w, h, 'left', C, rng);
    }, { seed: 41, tint: '#f3e6d0' });
    right = paper.page((ctx, w, h) => {
      ctx.fillStyle = '#f7efe2';
      ctx.fillRect(0, 0, w, h);
      sprinkle(ctx, w, h, 'right', C, rng);
    }, { seed: 42, tint: '#f7efe2' });
  }
  return { left, right };
}

function sprinkle(ctx, w, h, side, C, rng) {
  const colors = [C.blush, C.tomato, C.mustard];
  for (let i = 0; i < 3; i++) {
    const x = side === 'left' ? w * (0.08 + rng.next() * 0.38) : w * (0.55 + rng.next() * 0.32);
    const y = h * (0.08 + rng.next() * 0.18);
    doodleHeart(ctx, x, y, 7 + rng.next() * 5, colors[i]);
  }
}

function doodleHeart(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.85);
  ctx.bezierCurveTo(-r * 1.4, -r * 0.15, -r * 0.55, -r * 1.15, 0, -r * 0.35);
  ctx.bezierCurveTo(r * 0.55, -r * 1.15, r * 1.4, -r * 0.15, 0, r * 0.85);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function paintRibbon(paper, FONT, C, text) {
  const W = 1100;
  const H = 280;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = C.tomato;
  ctx.beginPath();
  ctx.moveTo(78, 46);
  ctx.lineTo(W - 78, 46);
  ctx.lineTo(W - 24, H / 2);
  ctx.lineTo(W - 78, H - 46);
  ctx.lineTo(78, H - 46);
  ctx.lineTo(24, H / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff6ea';
  ctx.beginPath();
  ctx.moveTo(108, 78);
  ctx.lineTo(W - 108, 78);
  ctx.lineTo(W - 70, H / 2);
  ctx.lineTo(W - 108, H - 78);
  ctx.lineTo(108, H - 78);
  ctx.lineTo(70, H / 2);
  ctx.closePath();
  ctx.fill();
  const font = (size) => `700 ${size}px ${FONT.hand}`;
  const size = fitSize(ctx, text, font, 118, W * 0.7);
  ctx.font = font(size);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + size * 0.06);
  paper.addGrain(ctx, W, H, { amount: 0.04, seed: 12, mottle: 0.5 });
  return paper.dieCut(canvas, { margin: 6 });
}

function paintTag(paper, FONT, text, C, seed) {
  const W = 760;
  const H = 200;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = seed % 2 ? '#fff6ea' : '#fde7c2';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(16, 28, W - 32, H - 56, 28);
  ctx.fill();
  ctx.stroke();
  const font = (size) => `700 ${size}px ${FONT.hand}`;
  const size = fitSize(ctx, text, font, 92, W * 0.86);
  ctx.font = font(size);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + size * 0.04);
  if (seed === 5) doodleHeart(ctx, W * 0.86, H * 0.38, 16, '#e2574c');
  paper.addGrain(ctx, W, H, { amount: 0.035, seed, mottle: 0.4 });
  return paper.dieCut(canvas, { margin: 6 });
}

function letterMailbox(ctx, FONT, C, names) {
  const cx = 440;
  const cy = 498;
  const maxW = 68;
  ctx.save();
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (size) => `700 ${size}px ${FONT.hand}`;
  const size = fitSize(ctx, names, font, 20, maxW);
  if (size >= 12) {
    ctx.font = font(size);
    ctx.fillText(names, cx, cy);
  } else {
    const parts = names.split(' & ');
    const top = parts.length > 1 ? `${parts[0]} &` : names;
    const bot = parts.length > 1 ? parts.slice(1).join(' & ') : '';
    const a = fitSize(ctx, top, font, 18, maxW);
    ctx.font = font(a);
    ctx.fillText(top, cx, bot ? cy - 9 : cy);
    if (bot) ctx.fillText(bot, cx, cy + 10);
  }
  ctx.restore();
}

function paintSold(paper, FONT, C, rng, text) {
  const W = 520;
  const H = 300;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#f7f4ec';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(16, 16, W - 32, H - 32, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.tomato;
  ctx.fillRect(16, 16, W - 32, 34);
  const font = (size) => `${size}px ${FONT.display}`;
  const size = fitSize(ctx, text, font, 118, W * 0.84);
  ctx.font = font(size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const gap = size * 0.03;
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + gap;
  total -= gap;
  let x = (W - total) / 2;
  const colors = [C.tomato, C.ink, C.mustard, C.leaf, C.sky, C.tomato, C.ink];
  let i = 0;
  for (const ch of text) {
    const cw = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(x + cw / 2, H * 0.58);
    ctx.rotate((rng.next() - 0.5) * 0.06);
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = '#2b2622';
    ctx.strokeText(ch, -cw / 2, 0);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillText(ch, -cw / 2, 0);
    ctx.restore();
    x += cw + gap;
    i++;
  }
  paper.addGrain(ctx, W, H, { amount: 0.04, seed: 9, mottle: 0.5 });
  return paper.dieCut(canvas, { margin: 6 });
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

function cardFromCanvas(THREE, paper, canvas, feet, height, name) {
  const cut = paper.dieCut(canvas, { margin: 8 });
  const s = height / canvas.height;
  const mesh = paper.card({
    canvas: cut,
    width: canvas.width * s,
    height,
    anchor: 'bottom-center',
  });
  // Feet pixel on the group origin; seat() then centres the sheet on the hinge.
  mesh.position.set(((canvas.width / 2) - feet[0]) * s, (feet[1] - canvas.height) * s, 0);
  const group = new THREE.Group();
  group.name = name;
  group.add(mesh);
  return group;
}

function makeKey(paper, height) {
  const canvas = paper.paint(140, 240, (ctx, w, h) => {
    ctx.strokeStyle = '#8a6230';
    ctx.fillStyle = '#e7c56a';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(w / 2, 52, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbf6ea';
    ctx.beginPath();
    ctx.arc(w / 2, 52, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e7c56a';
    ctx.fillRect(w / 2 - 7, 78, 14, 130);
    ctx.strokeRect(w / 2 - 7, 78, 14, 130);
    ctx.fillRect(w / 2 - 7, 158, 32, 12);
    ctx.fillRect(w / 2 - 7, 182, 24, 12);
    ctx.strokeStyle = '#d45448';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(w / 2, 18, 12, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.stroke();
  }, { dieCut: 5, seed: 7 });
  const aspect = canvas.height / canvas.width;
  return paper.card({
    canvas,
    width: height / aspect,
    height,
    anchor: 'bottom-center',
  });
}

function puffTex(paper, THREE) {
  const { canvas, ctx } = paper.makeCanvas(64, 80);
  const g = ctx.createRadialGradient(32, 50, 4, 32, 40, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(32, 44, 20, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  return { geo: new THREE.PlaneGeometry(0.16, 0.14), mat };
}

function petalMesh(paper, THREE) {
  const { canvas, ctx } = paper.makeCanvas(32, 40);
  ctx.fillStyle = '#f3a3b4';
  ctx.beginPath();
  ctx.ellipse(16, 20, 9, 15, 0.3, 0, Math.PI * 2);
  ctx.fill();
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  return { geo: new THREE.PlaneGeometry(0.09, 0.11), mat };
}
