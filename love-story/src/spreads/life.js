// Spread 6 — "Building our life". Four stops along a path: moving in, Cherry,
// a home, Japan. One couple card at a time, big and centred on its stop.
// Times come from timeline.BEATS / NARRATION / SPREADS. update() allocates nothing.
import { L } from '../i18n.js';
import { photoPrint, PHOTO_ASPECT } from '../photos.js';

const GAMMA = 1.78;
const SKY_W = 5.7;
const SKY_H = 1.6;
const SKY_Z0 = -0.42;
const OPEN = 0.92;
const CLEAR = 0.02;
const SMALL = 0.34;

// Page distance from the gutter. Spread x is −x on the left page and +x on the right.
const BOX_X = 3.12;
const BOX_Z = 0.02;
const BOX_H = 1.18;
const APT_X = 1.15;
const APT_Z = -0.02;
const APT_H = 1.02;
const BOXER_X = 2.02;
const BOXER_Z = 0.86;
const BOXER_H = 1.32;
const CUDDLE_X = 1.68;
const CUDDLE_Z = 0.58;
const CUDDLE_H = 1.5;
const JUMP_X = 2.35;
const JUMP_Z = 0.88;
const JUMP_H = 0.7;
const BED_X = 1.75;
const BED_Z = 0.22;
const BED_H = 0.5;
// Banner sits above the couple's heads (local y), hinged further back than they stand.
const RIBBON_X = 2.2;
const RIBBON_Z = 0.48;
const RIBBON_W = 2.05;
const RIBBON_H = 0.5;
const RIBBON_LIFT = 1.4;
const HOUSE_X = 2.05;
const HOUSE_Z = 0.16;
const HOUSE_H = 1.22;
const HOME_X = 1.72;
const HOME_Z = 0.7;
const DEED_H = 1.16;
const KEYS_H = 1.38;
const TRAVEL_X = 1.7;
const TRAVEL_Z = 0.55;
const TRAVEL_H = 1.4;
const GATE_X = 2.15;
const GATE_Z = 0.06;
const GATE_H = 1.42;
const TORII_X = 3.02;
const TORII_Z = -0.4;
const TORII_H = 0.88;
const SELFIE_X = 1.95;
const SELFIE_Z = 0.76;
const SELFIE_H = 1.6;

// Bands of moving-boxes.webp, bottom box first (pixel rows).
const BOX_BANDS = [[515, 852], [355, 515], [190, 355], [24, 190]];

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
    const cuddleAt = cherry + 1.15;
    const keysAt = home + (travelAt - home) * 0.5;

    const pages = paintPages(paper, art, has, C);
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
    const tagLeave = [];
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
      const cut = paper.dieCut(art.canvas('sky-band'), { margin: 4 });
      const halves = paper.splitCard({ canvas: cut, width: SKY_W, height: SKY_H });
      halves.left.name = 'sky-left';
      halves.right.name = 'sky-right';
      sky.left.add(halves.left);
      sky.right.add(halves.right);
      if (has('fuji')) {
        const fujiH = 0.72;
        fujiCard = characterArt.characterCard(paper, art, 'fuji', { height: fujiH });
        fujiCard.position.set(1.55, 0.06, 0.02);
        fujiCard.name = 'fuji';
        fujiCard.scale.set(0.001, 0.001, 1);
        sky.right.add(fujiCard);
      }
    } else {
      const flat = paper.paint(1200, 340, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#7eb6e0');
        grd.addColorStop(0.55, '#f6c98a');
        grd.addColorStop(1, '#f3a56a');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      }, { dieCut: 0, seed: 4 });
      const halves = paper.splitCard({ canvas: flat, width: SKY_W, height: SKY_H });
      sky.left.add(halves.left);
      sky.right.add(halves.right);
    }

    // ---------------------------------------------------------------- dotted path
    const path = buildPath();
    const dotsL = makeDots(THREE, paper, path.left.n);
    const dotsR = makeDots(THREE, paper, path.right.n);
    const pageL = track(popup.onPage({ side: 'left', x: 0, z: 0, lift: 0.01 }));
    const pageR = track(popup.onPage({ side: 'right', x: 0, z: 0, lift: 0.012 }));
    pageL.mount.add(dotsL);
    pageR.mount.add(dotsR);
    const sparkL = makeSparks(THREE, paper, pageL.mount, 3);
    const sparkR = makeSparks(THREE, paper, pageR.mount, 3);

    // ---------------------------------------------------------------- opening: boxes stack, couple walks in, ribbon unfurls
    const boxStand = stand('left', BOX_X, BOX_Z, 0.9, BOX_H);
    const boxRig = rigOn(boxStand, 'moving-boxes');
    const boxSlices = buildBoxStack(paper, THREE, has('moving-boxes') ? art.canvas('moving-boxes') : null, BOX_H);
    for (let i = 0; i < boxSlices.length; i++) {
      boxSlices[i].mesh.name = 'moving-boxes';
      boxRig.add(boxSlices[i].mesh);
      watch(0, boxSlices[i].mesh);
    }

    const ribbon = stand('left', RIBBON_X, RIBBON_Z, RIBBON_W, RIBBON_LIFT + RIBBON_H);
    const ribbonRig = rigOn(ribbon, 'ribbon');
    const ribbonCard = paper.card({
      canvas: paintRibbon(paper, FONT, C, L('building our life', 'construyendo nuestra vida')),
      width: RIBBON_W,
      height: RIBBON_H,
      anchor: 'bottom-center',
    });
    ribbonCard.name = 'ribbon';
    ribbonCard.position.y = RIBBON_LIFT;
    ribbonRig.add(ribbonCard);
    watch(0, ribbonCard);

    // ---------------------------------------------------------------- first place
    const aptW = propW(meta('apartment'), APT_H, 1.0);
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
    const boxerRig = addCast(rigOn(boxers, 'life-box'), building, cherry, 0.2);
    watch(0, mountDrawing(boxerRig, 'char', 'life-box', BOXER_H, {
      who: 'him', outfit: 'casual', pose: 'stand', facing: 'left',
    }));
    const firstTag = layTag(paper, THREE, popup, track, FONT, 'left', 2.15, 0.5, 1.75, 0.4,
      L('our first place', 'nuestro primer hogar'), C, 3, 1.36);
    tagHolds.push(firstTag);
    tagAt.push(first);
    tagLeave.push(cherry);

    // ---------------------------------------------------------------- Cherry
    const bedW = propW(meta('dog-bed'), BED_H, 0.7);
    const bed = stand('left', BED_X, BED_Z, bedW, BED_H);
    const bedRig = addShow(rigOn(bed, 'dog-bed'), cherry);
    watch(2, mountDrawing(bedRig, 'art', 'dog-bed', BED_H));

    const jumpW = propW(charInfo('dog-jump'), JUMP_H, 0.5);
    const jumpStand = stand('left', JUMP_X, JUMP_Z, jumpW, JUMP_H);
    const jumpRig = addCast(rigOn(jumpStand, 'dog-jump'), cherry, cuddleAt, 1.4);
    watch(2, mountDrawing(jumpRig, 'char', 'dog-jump', JUMP_H, { who: 'dog', pose: 'run' }));

    const cuddleW = propW(charInfo('life-dogcuddle'), CUDDLE_H, 0.86);
    const cuddleStand = stand('left', CUDDLE_X, CUDDLE_Z, Math.max(cuddleW, 1.15), 2.0);
    const cuddleRig = addCast(rigOn(cuddleStand, 'life-dogcuddle'), cuddleAt, home, 0.6);
    watch(2, mountDrawing(cuddleRig, 'char', 'life-dogcuddle', CUDDLE_H, {
      who: 'her', outfit: 'casual', pose: 'stand', facing: 'right',
    }));
    const cherryTag = paper.card({
      canvas: paintTag(paper, FONT, L('Cherry ♥', 'Cherry ♥'), C, 5, true),
      width: 1.15,
      height: 0.4,
      anchor: 'bottom-center',
    });
    cherryTag.name = 'cherry-tag';
    cherryTag.position.y = 1.56;
    cherryTag.scale.set(0.001, 0.001, 1);
    cuddleStand.mount.add(cherryTag);
    watch(2, cherryTag);

    layPhoto(paper, THREE, popup, track, photoRigs, photos ? photos.dog : null, {
      caption: L('Cherry, our girl', 'Cherry, nuestra niña'),
      aspect: PHOTO_ASPECT.dog,
      seed: 4,
      side: 'left',
      x: 1.02,
      z: 0.36,
      long: 1.02,
      tilt: -0.05,
      at: cuddleAt,
      shrink: home,
    });

    // ---------------------------------------------------------------- home
    const houseW = Math.max(propW(meta('house'), HOUSE_H, 1.2), 1.7);
    const house = stand('right', HOUSE_X, HOUSE_Z, houseW, 1.62);
    const houseRig = rigOn(house, 'house');
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
      // Sit on the blank yard sign, pulled in so it clears the couple in front.
      sold.position.set((590 - hm.feet[0]) * s, (hm.feet[1] - 600) * s, 0.04);
      const soldCard = paper.card({
        canvas: paintSold(paper, FONT, C, rng, L('SOLD', 'VENDIDA')),
        width: 340 * s,
        height: 150 * s,
        anchor: 'bottom-center',
      });
      soldCard.name = 'sold';
      sold.add(soldCard);
      card.add(sold);
      const homeBanner = paper.card({
        canvas: paintTag(paper, FONT, L('a home of our own', 'nuestra propia casa'), C, 7, false),
        width: 1.68,
        height: 0.34,
        anchor: 'bottom-center',
      });
      homeBanner.name = 'home-tag';
      homeBanner.position.y = 1.26;
      houseRig.add(homeBanner);
      watch(3, homeBanner);

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

    const keysW = propW(charInfo('life-keys'), KEYS_H, 0.85);
    const deedW = propW(charInfo('life-deed'), DEED_H, 1.05);
    const homeStand = stand('right', HOME_X, HOME_Z, Math.max(deedW, keysW), KEYS_H);
    const deedRig = addCast(rigOn(homeStand, 'life-deed'), home, keysAt, 0.4);
    watch(3, mountDrawing(deedRig, 'char', 'life-deed', DEED_H, {
      who: 'him', outfit: 'casual', pose: 'sit', facing: 'right',
    }));
    const keysRig = addCast(rigOn(homeStand, 'life-keys'), keysAt, travelAt, 1.1);
    watch(3, mountDrawing(keysRig, 'char', 'life-keys', KEYS_H, {
      who: 'her', outfit: 'casual', pose: 'stand', facing: 'left',
    }));

    layPhoto(paper, THREE, popup, track, photoRigs, photos ? photos.deed : null, {
      caption: L('signing the deed', 'firmando las escrituras'),
      aspect: PHOTO_ASPECT.deed,
      seed: 6,
      side: 'right',
      x: 0.78,
      z: 0.18,
      long: 0.76,
      tilt: 0.04,
      at: home,
      shrink: japan,
    });

    // ---------------------------------------------------------------- Japan
    const travelW = propW(charInfo('life-japan'), TRAVEL_H, 1.0);
    const travel = stand('right', TRAVEL_X, TRAVEL_Z, travelW, TRAVEL_H);
    const travelRig = addCast(rigOn(travel, 'life-japan'), travelAt, japan, 0.3);
    watch(3, mountDrawing(travelRig, 'char', 'life-japan', TRAVEL_H, {
      who: 'him', outfit: 'casual', pose: 'wave', facing: 'left',
    }));

    const toriiW = propW(meta('torii'), TORII_H, 0.9);
    const torii = stand('right', TORII_X, TORII_Z, toriiW, TORII_H);
    const toriiRig = addShow(rigOn(torii, 'torii'), japan);
    watch(4, mountDrawing(toriiRig, 'art', 'torii', TORII_H));

    const gateW = propW(meta('temple-gate'), GATE_H, 1.55);
    const gate = stand('right', GATE_X, GATE_Z, gateW, GATE_H);
    const gateRig = addShow(rigOn(gate, 'temple-gate'), japan);
    watch(4, mountDrawing(gateRig, 'art', 'temple-gate', GATE_H));

    const selfieW = propW(charInfo('japan-selfie'), SELFIE_H, 1.0);
    const selfieStand = stand('right', SELFIE_X, SELFIE_Z, Math.max(selfieW, 1.82), 2.02);
    const selfieRig = addCast(rigOn(selfieStand, 'japan-selfie'), japan, null, 1.6);
    watch(4, mountDrawing(selfieRig, 'char', 'japan-selfie', SELFIE_H, {
      who: 'him', outfit: 'casual', pose: 'wave', facing: 'right',
    }));
    const japanTag = paper.card({
      canvas: paintTag(paper, FONT, L('our two-year anniversary', 'nuestro segundo aniversario'), C, 9, true),
      width: 1.78,
      height: 0.36,
      anchor: 'bottom-center',
    });
    japanTag.name = 'japan-tag';
    japanTag.position.y = 1.64;
    selfieRig.add(japanTag);
    watch(4, japanTag);
    layPhoto(paper, THREE, popup, track, photoRigs, photos ? photos.tokyo : null, {
      caption: L('Tokyo · 2 years', 'Tokio · 2 años'),
      aspect: PHOTO_ASPECT.tokyo,
      seed: 8,
      side: 'right',
      x: 2.78,
      z: 0.46,
      long: 1.12,
      tilt: -0.04,
      at: japan,
      shrink: next,
    });

    const nextTag = layTag(paper, THREE, popup, track, FONT, 'right', 1.45, 1.12, 2.05, 0.48,
      L('next chapter →', 'próximo capítulo →'), C, 11);
    tagHolds.push(nextTag);
    tagAt.push(next);
    tagLeave.push(0);

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

    const glow = new THREE.PointLight('#ffe0b8', 0, 6.5, 2);
    glow.name = 'life-glow';
    glow.castShadow = false;
    glow.position.set(0, 1.5, 0.6);
    group.add(glow);
    const fill = new THREE.PointLight('#fff4e4', 0, 10, 2);
    fill.name = 'life-fill';
    fill.castShadow = false;
    fill.position.set(0.2, 2.5, 1.5);
    group.add(fill);

    const lightAt = [
      [-1.9, 1.55, 0.9],
      [-1.85, 1.45, 0.85],
      [-1.35, 1.5, 0.95],
      [1.55, 1.45, 1.05],
      [2.05, 1.7, 1.2],
    ];

    const cues = [
      { t: spread.open, hold: 0.7, at: [0, 0.9, 0.05], size: 7.5, from: 'front' },
      { t: round2(building + 0.35), hold: 4.0, at: [-2.28, 1.22, 0.32], size: 4.5, from: 'front' },
      { t: round2(first + 0.4), hold: 2.0, at: [-1.85, 1.15, 0.2], size: 3.6, from: 'left' },
      { t: round2(cherry + 1.15), hold: 2.3, at: [-1.4, 0.98, 0.42], size: 2.6, from: 'front' },
      { t: round2(home + 0.5), hold: 2.6, at: [1.35, 1.05, 0.22], size: 3.6, from: 'front' },
      { t: round2(travelAt + 0.4), hold: 1.2, at: [1.55, 1.0, 0.35], size: 3.6, from: 'front' },
      { t: round2(japan + 0.55), hold: 2.0, at: [2.05, 1.1, 0.4], size: 2.8, from: 'front' },
      { t: round2(next + 0.4), hold: 2.85, at: [0.15, 0.82, 0.02], size: 7.6, from: 'high' },
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

        const finale = t >= next ? 1 : 0;

        for (let i = 0; i < boxSlices.length; i++) {
          const at = building + i * 0.72;
          const pop = appear(t, at, outBack);
          const b = bump(t, at);
          const sx = pop * (1 - 0.06 * b);
          const sy = pop * (1 + 0.08 * b);
          boxSlices[i].mesh.scale.set(sx > 0.001 ? sx : 0.001, sy > 0.001 ? sy : 0.001, 1);
        }

        {
          const tuck = smoothstep(first - 0.2, first + 0.4, t);
          const yk = appear(t, building, outBack) * (1 - tuck);
          const xk = smoothstep(building, building + 0.5, t) * (1 - tuck);
          const bob = yk > 0.2 ? 1 + Math.sin(t * 1.5) * 0.01 : 1;
          ribbonRig.scale.set(xk > 0.001 ? xk : 0.001, (yk > 0.001 ? yk : 0.001) * bob, 1);
        }

        for (let i = 0; i < showRigs.length; i++) {
          const pop = appear(t, showAt[i], outBack);
          const breathe = pop > 0.2 ? 1 + Math.sin(t * 1.6 + i) * 0.008 : 1;
          const b = bump(t, showAt[i]);
          const sx = pop * breathe * (1 - 0.05 * b);
          const sy = pop * breathe * (1 + 0.06 * b);
          showRigs[i].scale.set(sx > 0.001 ? sx : 0.001, sy > 0.001 ? sy : 0.001, 1);
          showRigs[i].position.y = pop > 0.2 ? Math.sin(t * 1.4 + i) * 0.008 : 0;
        }
        if (fujiCard) {
          const pop = appear(t, japan, outBack);
          const b = bump(t, japan);
          fujiCard.scale.set(pop * (1 - 0.04 * b) || 0.001, pop * (1 + 0.05 * b) || 0.001, 1);
        }

        for (let i = 0; i < castRigs.length; i++) {
          poseCast(castRigs[i], t, castAt[i], castLeave[i], castPhase[i], outBack);
        }
        {
          const walk = smoothstep(building, building + 1.15, t);
          boxerRig.position.x = (1 - walk) * -0.22;
        }
        {
          const age = t - cherry;
          const alive = t >= cherry && t < cuddleAt + 0.35;
          const hopY = alive && age > 0
            ? Math.abs(Math.sin(age * 6.4)) * (0.04 + 0.14 * Math.exp(-age * 0.55))
            : 0;
          jumpRig.position.y += hopY;
        }
        if (t > next) {
          const k = 1 - 0.34 * smoothstep(next, next + 0.45, t);
          selfieRig.scale.x *= k;
          selfieRig.scale.y *= k;
        }
        if (keyPivot) keyPivot.rotation.z = Math.sin(t * 2.2) * (0.22 + 0.4 * bump(t, first));

        {
          const amount = houseAmount(t, home, japan, next, outBack, smoothstep);
          const breathe = amount > 0.2 ? 1 + Math.sin(t * 1.5) * 0.008 : 1;
          const b = bump(t, home);
          const s = amount * breathe;
          houseRig.scale.set(
            (s > 0.001 ? s : 0.001) * (1 - 0.04 * b),
            (s > 0.001 ? s : 0.001) * (1 + 0.05 * b),
            1,
          );
        }
        if (sold) {
          const u = smoothstep(home, home + 0.55, t);
          let swing = outBack(u);
          if (swing < 0) swing = 0;
          else if (swing > 1.06) swing = 1.06;
          sold.rotation.x = open ? (1 - swing) * (Math.PI / 2) : 0;
        }
        const houseUp = houseAmount(t, home, japan, next, outBack, smoothstep);
        for (let i = 0; i < smokes.length; i++) {
          const mesh = smokes[i];
          const loop = (t * 0.28 + mesh.userData.phase) % 1;
          mesh.position.y = mesh.userData.baseY + open * loop * 0.06;
          mesh.position.x = mesh.userData.baseX + Math.sin(t * 1.4 + i) * 0.012 * open;
          mesh.material.opacity = open * houseUp * (1 - loop) * 0.85;
          mesh.scale.setScalar(0.8 + loop * 0.35);
        }

        {
          const tagIn = appear(t, cuddleAt, outBack);
          const settle = smoothstep(home, home + 0.5, t);
          const s = tagIn * (1 - settle * 0.28);
          cherryTag.scale.set(s > 0.001 ? s : 0.001, s > 0.001 ? s : 0.001, 1);
          cherryTag.position.y = 1.56 - settle * 0.7;
        }

        for (let i = 0; i < photoRigs.length; i++) {
          const p = photoRigs[i];
          const s = photoK(t, p.at, p.shrink, outBack);
          p.hold.scale.setScalar(s > 0.001 ? s : 0.001);
        }
        for (let i = 0; i < tagHolds.length; i++) {
          let s = appear(t, tagAt[i], outBack);
          const leave = tagLeave[i];
          if (leave > 0 && t > leave) {
            const v = (t - leave) / 0.4;
            const k = v >= 1 ? 1 : (v <= 0 ? 0 : v * v * (3 - 2 * v));
            s *= 1 - k;
          }
          tagHolds[i].scale.setScalar(s > 0.001 ? s : 0.001);
        }

        const progress = pathProgress(t, [
          building, building + 1.45, first, home, japan, next,
        ], path.markU, smoothstep);
        layDots(dotsL, path.left, progress, pos, quat, scl, mat);
        layDots(dotsR, path.right, progress, pos, quat, scl, mat);
        const sparkling = t >= next ? 1 : 0;
        placeSparks(sparkL, path.left, t, next, sparkling);
        placeSparks(sparkR, path.right, t, next, sparkling);

        flight.scale.set(1, risen, 1);
        const uFly = smoothstep(travelAt, japan + 0.4, t);
        const showPlane = smoothstep(travelAt - 0.2, travelAt + 0.25, t)
          * (1 - smoothstep(japan + 0.35, japan + 0.9, t));
        if (plane) {
          const x = 0.4 + (2.7 - 0.4) * uFly;
          const z = 0.2 + (-0.1 - 0.2) * uFly;
          const y = 1.15 + Math.sin(uFly * Math.PI) * 0.32;
          plane.scale.setScalar(showPlane > 0.001 ? showPlane : 0.001);
          plane.position.x = x;
          plane.position.z = z;
          plane.position.y = y + Math.sin(t * 2.4) * 0.02;
          plane.rotation.z = -0.5 * Math.cos(uFly * Math.PI);
          plane.rotation.x = -0.3;
        }
        const petalShow = smoothstep(japan - 0.2, japan + 0.35, t) * (finale ? 0.45 : 1);
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
        let key = zone === 0 ? 1.05 : 0.9;
        if (zone === 4 && !finale) key = 1.65;
        if (finale) key = 1.2;
        glow.intensity = risen * key;
        fill.intensity = risen * (zone === 4 || finale ? 0.9 : 0.62);
        for (let v = 0; v < mats.length; v++) {
          const warm = (finale ? 0.14 : (v === zone ? 0.28 : 0.07)) * risen;
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

function houseAmount(t, home, japan, _next, outBack, smoothstep) {
  const up = appear(t, home, outBack);
  const down = smoothstep(japan, japan + 0.5, t);
  return up * (1 - down);
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

function pathProgress(t, marks, markU, smoothstep) {
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
    if (us[i] > 0.985) s *= 2.6;
    pos.set(xs[i], 0.006, zs[i]);
    scl.set(s * 12, 1, s * 12);
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
    const pulse = 0.16 + 0.05 * Math.sin(t * 6 + mesh.userData.phase * 10);
    mesh.scale.setScalar(pulse);
    mesh.material.opacity = 0.55 + 0.4 * Math.sin(t * 5 + i);
  }
}

// Spread-frame polyline. u is arc length, 0 at the boxes and 1 at the page-edge arrow.
function buildPath() {
  const pts = [
    [-2.95, -0.22],
    [-2.5, 0.12],
    [-2.05, 0.4],
    [-1.55, 0.46],
    [-0.7, 0.16],
    [0.5, 0.02],
    [1.2, -0.02],
    [1.9, 0.08],
    [2.5, 0.06],
    [3.15, 0.16],
  ];
  const chevron = [
    [2.92, 0.4],
    [3.34, 0.16],
    [2.92, -0.06],
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

  const stopIdx = [0, 10, 16, 22, 28, raw.length - 1];
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
  const geo = new THREE.PlaneGeometry(0.018, 0.018);
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
  ctx.fillStyle = '#5c3a28';
  ctx.beginPath();
  ctx.arc(16, 16, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f6e7c8';
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

function layTag(paper, THREE, popup, track, FONT, side, x, z, w, h, text, C, seed, lift) {
  const raised = lift > 0;
  const page = raised
    ? track(popup.standUp({ side, x, z, fold: 'back', width: w, height: h + lift }))
    : track(popup.onPage({ side, x, z, lift: 0.018 + seed * 0.0004 }));
  const hold = new THREE.Group();
  hold.name = 'tag';
  hold.scale.setScalar(0.001);
  const canvas = paintTag(paper, FONT, text, C, seed, false);
  let mesh;
  if (raised) {
    mesh = paper.card({ canvas, width: w, height: h, anchor: 'bottom-center' });
    mesh.position.y = lift;
  } else {
    mesh = flatMesh(THREE, paper, canvas, w, h);
  }
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
  const stand = track(popup.standUp({
    side: opts.side,
    x: opts.x,
    z: opts.z,
    fold: 'back',
    width: w,
    height: h,
  }));
  const hold = new THREE.Group();
  hold.name = 'photo';
  hold.scale.setScalar(0.001);
  const mesh = paper.card({
    canvas: paper.dieCut(shot, { margin: 4 }),
    width: w,
    height: h,
    anchor: 'bottom-center',
  });
  mesh.name = 'photo';
  mesh.position.y = CLEAR;
  mesh.rotation.z = opts.tilt;
  hold.add(mesh);
  stand.mount.add(hold);
  photoRigs.push({ hold, at: opts.at, shrink: opts.shrink });
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

function buildBoxStack(paper, THREE, src, totalH) {
  if (!src) return [];
  let bandH = 0;
  for (let i = 0; i < BOX_BANDS.length; i++) bandH += BOX_BANDS[i][1] - BOX_BANDS[i][0];
  const worldW = totalH * src.width / bandH;
  const slices = [];
  let y = 0;
  for (let i = 0; i < BOX_BANDS.length; i++) {
    const y0 = BOX_BANDS[i][0];
    const y1 = BOX_BANDS[i][1];
    const ch = y1 - y0;
    const h = totalH * (ch / bandH);
    const { canvas, ctx } = paper.makeCanvas(src.width, ch);
    ctx.drawImage(src, 0, y0, src.width, ch, 0, 0, src.width, ch);
    const mesh = paper.card({
      canvas,
      width: worldW,
      height: h,
      anchor: 'bottom-center',
    });
    mesh.position.y = y + CLEAR;
    mesh.scale.set(0.001, 0.001, 1);
    slices.push({ mesh, at: i });
    y += h;
  }
  return slices;
}

function paintPages(paper, art, has, C) {
  let left;
  let right;
  if (has('page-left') && has('page-right')) {
    const Lft = cloneCanvas(paper, art.canvas('page-left'));
    const Rgt = cloneCanvas(paper, art.canvas('page-right'));
    paper.addGrain(Lft.ctx, Lft.canvas.width, Lft.canvas.height, { amount: 0.025, seed: 41, mottle: 0.55 });
    paper.addGrain(Rgt.ctx, Rgt.canvas.width, Rgt.canvas.height, { amount: 0.025, seed: 42, mottle: 0.55 });
    left = Lft.canvas;
    right = Rgt.canvas;
  } else {
    left = paper.page((ctx, w, h) => {
      ctx.fillStyle = '#f3e6d0';
      ctx.fillRect(0, 0, w, h);
      doodleHeart(ctx, w * 0.2, h * 0.2, 14, C.tomato);
    }, { seed: 41, tint: '#f3e6d0' });
    right = paper.page((ctx, w, h) => {
      ctx.fillStyle = '#f7efe2';
      ctx.fillRect(0, 0, w, h);
      doodleHeart(ctx, w * 0.75, h * 0.3, 14, C.mustard);
    }, { seed: 42, tint: '#f7efe2' });
  }
  return { left, right };
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
  const W = 1200;
  const H = 300;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = C.tomato;
  ctx.beginPath();
  ctx.moveTo(70, 40);
  ctx.lineTo(W - 70, 40);
  ctx.lineTo(W - 18, H / 2);
  ctx.lineTo(W - 70, H - 40);
  ctx.lineTo(70, H - 40);
  ctx.lineTo(18, H / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff6ea';
  ctx.beginPath();
  ctx.moveTo(102, 72);
  ctx.lineTo(W - 102, 72);
  ctx.lineTo(W - 62, H / 2);
  ctx.lineTo(W - 102, H - 72);
  ctx.lineTo(102, H - 72);
  ctx.lineTo(62, H / 2);
  ctx.closePath();
  ctx.fill();
  const font = (size) => `700 ${size}px ${FONT.hand}`;
  const size = fitSize(ctx, text, font, 108, W * 0.78);
  ctx.font = font(size);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + size * 0.06);
  paper.addGrain(ctx, W, H, { amount: 0.04, seed: 12, mottle: 0.5 });
  return paper.dieCut(canvas, { margin: 6 });
}

function paintTag(paper, FONT, text, C, seed, hero) {
  const W = hero ? 860 : 780;
  const H = hero ? 240 : 200;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = seed % 2 ? '#fff6ea' : '#fde7c2';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = hero ? 10 : 8;
  ctx.beginPath();
  ctx.roundRect(16, 24, W - 32, H - 48, 28);
  ctx.fill();
  ctx.stroke();
  const font = (size) => `700 ${size}px ${FONT.hand}`;
  const maxW = W * 0.86;
  let size = fitSize(ctx, text, font, hero ? 96 : 78, maxW);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = size < (hero ? 58 : 46) ? wrapTwo(text) : [text];
  if (lines.length > 1) {
    size = Math.min(
      fitSize(ctx, lines[0], font, hero ? 78 : 64, maxW),
      fitSize(ctx, lines[1], font, hero ? 78 : 64, maxW),
    );
    ctx.font = font(size);
    ctx.fillText(lines[0], W / 2, H * 0.4);
    ctx.fillText(lines[1], W / 2, H * 0.68);
  } else {
    ctx.font = font(size);
    ctx.fillText(text, W / 2, H / 2 + size * 0.04);
  }
  if (hero) doodleHeart(ctx, W * 0.9, H * 0.34, 18, '#e2574c');
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
  const W = 560;
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
  const size = fitSize(ctx, text, font, 108, W * 0.82);
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

function wrapTwo(text) {
  const words = text.split(' ');
  if (words.length < 2) return [text];
  let cut = 1;
  let best = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const score = Math.abs(a - b);
    if (score < best) {
      best = score;
      cut = i;
    }
  }
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
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
