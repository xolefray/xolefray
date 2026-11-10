// Spread 4 — "A life together". Four vignettes along a scrapbook path:
// a first apartment, their chihuahua, a house with both names, the trip to Japan.
// Times come from timeline.BEATS / NARRATION / SPREADS. update() allocates nothing.
import { photoPrint, PHOTO_ASPECT } from '../photos.js';

const GAMMA = 1.78; // one mountain angle — the sky band is the only vFold
const SKY_W = 6.0;
const SKY_H = 1.7;
const SKY_Z0 = -0.45;
const OPEN = 0.92; // α/π above which hinged extras (the SOLD sign, smoke) may leave the card

// Page-local hinges (distance from the gutter). Spread x is −x on the left page, +x on the right.
const APT_X = 2.72;
const APT_Z = 0.18;
const APT_H = 1.5;
const BOX_X = 2.32;
const BOX_Z = 0.7;
const BOX_H = 1.32;
const DOG_X = 1.58;
const DOG_Z = 0.42;
const DOG_H = 1.28;
const HOP_X = 2.02;
const HOP_Z = 0.98;
const HOP_H = 0.46;
const BED_X = 1.22;
const BED_Z = 1.12;
const BED_H = 0.36;
const PRINT_X = 0.82;
const PRINT_Z = 0.78;
const HOUSE_X = 1.92;
const HOUSE_Z = 0.16;
const HOUSE_H = 1.62;
const TORII_X = 3.12;
const TORII_Z = 0.05;
const TORII_H = 1.4;
const JAPAN_X = 2.9;
const JAPAN_Z = 0.52;
const JAPAN_H = 1.26;
const CASE_X = 2.28;
const CASE_Z = 1.02;
const CASE_H = 0.5;

const LIGHT_AT = [
  [-2.2, 1.55, 1.35],
  [-1.35, 1.45, 1.45],
  [1.65, 1.6, 1.4],
  [2.65, 1.55, 1.35],
];

function bump(t, at) {
  const u = (t - at) / 0.4;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
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

export default {
  id: 'life',
  title: 'A life together',
  build(ctx) {
    const { THREE, paper, popup, rng, photos, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, NARRATION, COUPLE, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'life');
    const n17 = NARRATION.find((n) => n.id === 'n17');
    const n21 = NARRATION.find((n) => n.id === 'n21');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'life';

    const has = (id) => !!(art && art.has && art.has(id));
    const meta = (id) => (has(id) ? art.info(id) : null);

    const first = BEATS.firstPlace;
    const dogBeat = BEATS.dogOfTheirOwn;
    const home = BEATS.home;
    const japan = BEATS.japan;
    const filled = n17 ? n17.start : first - 3.4;
    const beats = [first, dogBeat, home, japan];

    // ---------------------------------------------------------------- pages
    const pages = paintPages(paper, art, has, FONT, C, rng);
    const leftArt = pages.left;
    const rightArt = pages.right;

    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };

    // ---------------------------------------------------------------- sky (mountain vFold) + Fuji on the right half
    const sky = track(popup.vFold({ z0: SKY_Z0, gamma: GAMMA, width: SKY_W, height: SKY_H }));
    if (has('sky-band')) {
      const src = art.canvas('sky-band');
      const cut = paper.dieCut(src, { margin: 6 });
      const halves = paper.splitCard({ canvas: cut, width: SKY_W, height: SKY_H });
      halves.left.name = 'sky-left';
      halves.right.name = 'sky-right';
      sky.left.add(halves.left);
      sky.right.add(halves.right);
      if (has('fuji')) {
        const fujiH = 0.86;
        const fuji = characterArt.characterCard(paper, art, 'fuji', { height: fujiH });
        const fm = meta('fuji');
        const fs = fujiH / fm.h;
        // Right half spans x ∈ [0, SKY_W/2]. Keep the whole card inside that half.
        fuji.position.set(1.55, 0.18 + (fm.h - fm.feet[1]) * fs, 0.012);
        fuji.name = 'fuji';
        sky.right.add(fuji);
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

    // ---------------------------------------------------------------- vignette pieces
    const vignetteRigs = [[], [], [], []];
    const vignetteMats = [[], [], [], []];

    const addRig = (index, stand, name) => {
      const rig = new THREE.Group();
      rig.name = name;
      stand.mount.add(rig);
      vignetteRigs[index].push(rig);
      return rig;
    };

    const watch = (index, root) => {
      root.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) {
          o.material.emissive.setHex(0xffc48a);
          vignetteMats[index].push(o.material);
        }
      });
    };

    // (1) first place — apartment, then the two of them with the box
    const apt = track(popup.standUp({
      side: 'left', x: APT_X, z: APT_Z, fold: 'back', width: 1.35, height: APT_H,
    }));
    const aptRig = addRig(0, apt, 'apartment');
    let aptCard = null;
    if (has('apartment')) {
      aptCard = mountProp(characterArt, paper, art, aptRig, 'apartment', APT_H);
      if (aptCard) watch(0, aptCard);
    }
    const keyPivot = new THREE.Group();
    keyPivot.name = 'key';
    const keyCard = makeKey(paper, THREE, 0.16);
    // Ribbon (top of the drawing) sits on the knob; the key hangs below it.
    keyCard.position.y = -0.16;
    keyPivot.add(keyCard);
    if (aptCard) {
      const am = meta('apartment');
      const as = APT_H / am.h;
      // Upper-left door stile. The knob itself sits behind the couple.
      // z stays inside the card thickness: on the left page a forward offset
      // points below the closed book, and the fold check allows only 0.03.
      keyPivot.position.set((72 - am.feet[0]) * as, (am.feet[1] - 210) * as, 0.008);
      aptCard.add(keyPivot);
    } else {
      keyPivot.position.set(0.16, 0.78, 0.03);
      aptRig.add(keyPivot);
    }

    const boxers = track(popup.standUp({
      side: 'left', x: BOX_X, z: BOX_Z, fold: 'back', width: 0.85, height: BOX_H,
    }));
    const boxRig = addRig(0, boxers, 'life-box');
    const boxCard = characterArt.actor(paper, characters, figures, 'life-box', {
      who: 'him', outfit: 'casual', pose: 'stand', facing: 'left',
    }, { height: BOX_H });
    if (boxCard) {
      liftFeet(boxCard, characters, 'life-box', BOX_H);
      boxRig.add(boxCard);
      watch(0, boxCard);
    }

    // (2) a dog of their own — the cuddle, the hop, the bed, the polaroid
    const dogStand = track(popup.standUp({
      side: 'left', x: DOG_X, z: DOG_Z, fold: 'back', width: 0.78, height: DOG_H,
    }));
    const dogRig = addRig(1, dogStand, 'life-dog');
    const cuddle = characterArt.actor(paper, characters, figures, 'life-dogcuddle', {
      who: 'her', outfit: 'casual', pose: 'stand', facing: 'right',
    }, { height: DOG_H });
    if (cuddle) {
      liftFeet(cuddle, characters, 'life-dogcuddle', DOG_H);
      dogRig.add(cuddle);
      watch(1, cuddle);
    }

    const hopStand = track(popup.standUp({
      side: 'left', x: HOP_X, z: HOP_Z, fold: 'back', width: 0.4, height: HOP_H,
    }));
    const hopRig = addRig(1, hopStand, 'dog-hop');
    const hop = new THREE.Group();
    hop.name = 'dog-jump';
    hopRig.add(hop);
    const hopCard = characterArt.actor(paper, characters, figures, 'dog-jump', {
      who: 'dog', pose: 'run',
    }, { height: HOP_H });
    if (hopCard) {
      liftFeet(hopCard, characters, 'dog-jump', HOP_H);
      // The drawing's feet pixel is the stretched back paw. Slide the body onto the hinge.
      const dm = characters && characters.info ? characters.info('dog-jump') : null;
      if (dm) hopCard.position.x -= ((280 - dm.feet[0]) * HOP_H) / dm.h;
      hop.add(hopCard);
      watch(1, hopCard);
    }

    const bed = track(popup.standUp({
      side: 'left', x: BED_X, z: BED_Z, fold: 'back', width: 0.62, height: BED_H,
    }));
    const bedRig = addRig(1, bed, 'dog-bed');
    if (has('dog-bed')) {
      const card = mountProp(characterArt, paper, art, bedRig, 'dog-bed', BED_H);
      if (card) watch(1, card);
    }

    const shot = photoPrint(photos ? photos.dog : null, {
      width: 460,
      style: 'polaroid',
      caption: 'best boy',
      tilt: -0.06,
      tape: true,
      aspect: PHOTO_ASPECT.dog,
      seed: 4,
    });
    const printRatio = shot.height / shot.width;
    let printH = 0.7;
    let printW = printH / printRatio;
    const printLim = popup.standUpLimits({ x: PRINT_X, z: PRINT_Z, width: printW, fold: 'back' });
    if (printH > printLim.maxHeightLoose * 0.9) {
      printH = printLim.maxHeightLoose * 0.9;
      printW = printH / printRatio;
    }
    const printStand = track(popup.standUp({
      side: 'left', x: PRINT_X, z: PRINT_Z, fold: 'back', width: printW, height: printH,
    }));
    const printRig = addRig(1, printStand, 'polaroid');
    const printCard = paper.card({
      canvas: paper.dieCut(shot, { margin: 4 }),
      width: printW,
      height: printH,
      anchor: 'bottom-center',
    });
    printCard.name = 'polaroid';
    printRig.add(printCard);
    watch(1, printCard);

    // (3) home — the house, the names, the SOLD sign
    const house = track(popup.standUp({
      side: 'right', x: HOUSE_X, z: HOUSE_Z, fold: 'back', width: 1.55, height: HOUSE_H,
    }));
    const houseRig = addRig(2, house, 'house');
    let sold = null;
    const smokes = [];
    if (has('house')) {
      const hm = meta('house');
      const painted = cloneCanvas(paper, art.canvas('house'));
      letterMailbox(painted.ctx, painted.canvas, FONT, C, COUPLE.names);
      const card = cardFromCanvas(THREE, paper, painted.canvas, hm.feet, HOUSE_H, 'house');
      const s = HOUSE_H / hm.h;
      card.position.y = (hm.h - hm.feet[1]) * s + 0.02;
      houseRig.add(card);
      watch(2, card);

      // Children of the house card: local origin is the feet pixel.
      // Blank yard sign on the drawing: x 546–670, y 528–622. Bottom-centre of SOLD
      // sits on the board so the flip covers it.
      const soldPx = [608, 616];
      sold = new THREE.Group();
      sold.name = 'sold';
      sold.position.set((soldPx[0] - hm.feet[0]) * s, (hm.feet[1] - soldPx[1]) * s, 0.03);
      const soldCard = paper.card({
        canvas: paintSold(paper, FONT, C, rng),
        width: 112 * s,
        height: 84 * s,
        anchor: 'bottom-center',
      });
      soldCard.name = 'sold';
      sold.add(soldCard);
      card.add(sold);

      const porchKey = new THREE.Group();
      porchKey.name = 'porch-key';
      // Under the mailbox (box is x 406–488, y 492–573).
      porchKey.position.set((447 - hm.feet[0]) * s, (hm.feet[1] - 578) * s, 0.03);
      const porchCard = makeKey(paper, THREE, 0.11);
      porchCard.position.y = -0.11;
      porchKey.add(porchCard);
      card.add(porchKey);
      houseRig.userData.porchKey = porchKey;

      const puff = puffTex(paper, THREE);
      // Chimney crown, measured: brick from y 43, x 470–524.
      // Stay under the card top. The crown is y≈43; a little lower keeps the
      // puff inside the page when the house lies flat.
      const chimneyX = (497 - hm.feet[0]) * s;
      const chimneyY = (hm.feet[1] - 78) * s;
      for (let i = 0; i < 3; i++) {
        const mesh = new THREE.Mesh(puff.geo, puff.mat.clone());
        mesh.name = 'smoke';
        mesh.castShadow = false;
        mesh.position.set(chimneyX, chimneyY, 0.02);
        mesh.userData.baseX = chimneyX;
        mesh.userData.baseY = chimneyY;
        mesh.userData.phase = i * 0.33;
        card.add(mesh);
        smokes.push(mesh);
      }
    } else {
      sold = new THREE.Group();
      sold.name = 'sold';
      sold.position.set(0.32, 0.42, 0.03);
      houseRig.add(sold);
    }

    const owners = track(popup.standUp({
      side: 'right', x: HOUSE_X - 0.15, z: HOUSE_Z + 0.62, fold: 'back', width: 0.85, height: 1.3,
    }));
    const ownerRig = addRig(2, owners, 'life-keys');
    const keysCard = characterArt.actor(paper, characters, figures, 'life-keys', {
      who: 'her', outfit: 'casual', pose: 'stand', facing: 'left',
    }, { height: 1.3 });
    if (keysCard) {
      liftFeet(keysCard, characters, 'life-keys', 1.3);
      ownerRig.add(keysCard);
      watch(2, keysCard);
    }

    // (4) Japan — torii, the two tourists, a stickered suitcase
    const torii = track(popup.standUp({
      // The drawing's weight is toward the gutter, so the centred-width check
      // would lie. Real vertices are what the fold test measures.
      side: 'right', x: TORII_X, z: TORII_Z, fold: 'back', width: 0.64, height: TORII_H,
    }));
    const toriiRig = addRig(3, torii, 'torii');
    if (has('torii')) {
      const card = mountProp(characterArt, paper, art, toriiRig, 'torii', TORII_H);
      if (card) watch(3, card);
    }

    const tourists = track(popup.standUp({
      side: 'right', x: JAPAN_X, z: JAPAN_Z, fold: 'back', width: 0.95, height: JAPAN_H,
    }));
    const japanRig = addRig(3, tourists, 'life-japan');
    const japanCard = characterArt.actor(paper, characters, figures, 'life-japan', {
      who: 'him', outfit: 'casual', pose: 'wave', facing: 'left',
    }, { height: JAPAN_H });
    if (japanCard) {
      liftFeet(japanCard, characters, 'life-japan', JAPAN_H);
      japanRig.add(japanCard);
      watch(3, japanCard);
    }

    const suitcase = track(popup.standUp({
      side: 'right', x: CASE_X, z: CASE_Z, fold: 'back', width: 0.36, height: CASE_H,
    }));
    const caseRig = addRig(3, suitcase, 'suitcase');
    if (has('suitcase-stickers')) {
      const card = mountProp(characterArt, paper, art, caseRig, 'suitcase-stickers', CASE_H);
      if (card) watch(3, card);
    }

    // Paper plane + petals. One holder, scaled by popup.rise so it is gone while the page turns.
    const flight = new THREE.Group();
    flight.name = 'flight';
    group.add(flight);
    let plane = null;
    if (has('paper-plane')) {
      plane = characterArt.characterCard(paper, art, 'paper-plane', { height: 0.28, flip: true });
      if (plane) {
        const pm = meta('paper-plane');
        plane.position.y = (pm.h - pm.feet[1]) * (0.28 / pm.h);
        plane.name = 'paper-plane';
        flight.add(plane);
      }
    }
    const petals = [];
    const petal = petalMesh(paper, THREE);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(petal.geo, petal.mat.clone());
      mesh.name = 'petal';
      mesh.castShadow = false;
      mesh.userData.x0 = 2.35 + rng.next() * 0.9;
      mesh.userData.z0 = -0.15 + rng.next() * 0.7;
      mesh.userData.phase = rng.next();
      mesh.userData.speed = 0.22 + rng.next() * 0.18;
      mesh.userData.spin = (rng.next() - 0.5) * 2.4;
      flight.add(mesh);
      petals.push(mesh);
    }

    const glow = new THREE.PointLight('#ffd0a4', 0, 4.2, 2);
    glow.name = 'life-glow';
    glow.castShadow = false;
    glow.position.set(0, 1.3, 0.4);
    group.add(glow);

    const porchKey = houseRig.userData.porchKey || null;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 1.6, at: [0, 0.85, 0.1], size: 7.5, from: 'front' },
        { t: round2(first + 0.2), hold: 1.8, at: [-2.35, 0.9, 0.35], size: 2.4, from: 'left' },
        { t: round2(dogBeat + 0.2), hold: 1.8, at: [-1.4, 0.85, 0.5], size: 2.3, from: 'front' },
        { t: round2(home + 0.2), hold: 2.2, at: [1.7, 1.05, 0.2], size: 2.5, from: 'right' },
        { t: round2(japan + 0.3), hold: 2.0, at: [2.75, 1.0, 0.2], size: 2.4, from: 'right' },
        {
          t: round2((n21 ? n21.end : japan + 2.6) + 0.3),
          hold: 1.2,
          at: [0.2, 0.9, 0.15],
          size: 7.5,
          from: 'high',
        },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const risen = popup.rise(alpha);
        const open = alpha > OPEN * Math.PI ? 1 : 0;

        let current = -1;
        if (t >= japan) current = 3;
        else if (t >= home) current = 2;
        else if (t >= dogBeat) current = 1;
        else if (t >= first) current = 0;

        for (let v = 0; v < 4; v++) {
          const pop = bump(t, beats[v]);
          const cascade = bump(t, filled + v * 0.42);
          const grow = (v === current ? 0.1 : 0) * risen;
          const breathe = 1 + Math.sin(t * 1.7 + v * 1.3) * 0.012;
          const s = breathe * (1 + grow + 0.045 * cascade);
          const sx = s * (1 - 0.06 * pop);
          const sy = s * (1 + 0.09 * pop);
          const bob = Math.sin(t * 1.55 + v) * 0.01 * (v === current ? 1.3 : 0.65);
          const lean = Math.sin(t * 1.25 + v * 0.8) * 0.02 * (v === current ? 1.2 : 0.6);
          const rigs = vignetteRigs[v];
          for (let i = 0; i < rigs.length; i++) {
            rigs[i].scale.set(sx, sy, 1);
            rigs[i].position.y = bob;
            rigs[i].rotation.z = lean;
          }
          const mats = vignetteMats[v];
          const warm = (v === current ? 0.24 : 0.035) * risen;
          for (let i = 0; i < mats.length; i++) mats[i].emissiveIntensity = warm;
        }

        // Key on a ribbon at the apartment door, and the spare key by the mailbox.
        keyPivot.rotation.z = Math.sin(t * 2.3) * (0.28 + 0.45 * bump(t, first));
        if (porchKey) porchKey.rotation.z = Math.sin(t * 2.05 + 1.2) * (0.22 + 0.5 * bump(t, home));

        // The chihuahua hops on his beat, then keeps a smaller bounce.
        const age = t - dogBeat;
        const hopY = age > 0
          ? Math.abs(Math.sin(age * 7.5)) * (0.035 + 0.09 * Math.exp(-age * 0.45))
          : Math.abs(Math.sin(t * 3.2)) * 0.012;
        hop.position.y = hopY;
        hop.scale.y = 1 + hopY * 2.2;

        // SOLD swings up off the blank yard sign. Flush with the house unless the book is open.
        if (sold) {
          const u = smoothstep(home, home + 0.55, t);
          let swing = ease.outBack(u);
          if (swing < 0) swing = 0;
          else if (swing > 1.08) swing = 1.08;
          sold.rotation.x = open ? (1 - swing) * (Math.PI / 2) : 0;
        }

        for (let i = 0; i < smokes.length; i++) {
          const mesh = smokes[i];
          const loop = (t * 0.28 + mesh.userData.phase) % 1;
          mesh.position.y = mesh.userData.baseY + open * loop * 0.08;
          mesh.position.x = mesh.userData.baseX + Math.sin(t * 1.4 + i) * 0.015 * open;
          mesh.material.opacity = open * (1 - loop) * 0.9;
          mesh.scale.setScalar(0.85 + loop * 0.45);
        }

        // Squash onto the page. Uniform scale keeps the polar angle, so a high
        // arc still pokes out of a half-open book; only the height may grow.
        flight.scale.set(1, risen, 1);
        const uFly = smoothstep(japan, japan + 2.4, t);
        // Arc stays in front of the sky band: roof height over to the torii.
        const x = 1.4 + (2.75 - 1.4) * uFly;
        const z = 0.42 + (0.05 - 0.42) * uFly;
        const y = 1.08 + Math.sin(uFly * Math.PI) * 0.36;
        const bobPlane = Math.sin(t * 2.4) * 0.025;
        const showPlane = smoothstep(japan - 0.3, japan + 0.25, t);
        if (plane) {
          plane.scale.setScalar(showPlane > 0.001 ? showPlane : 0.001);
          plane.position.x = x;
          plane.position.z = z;
          plane.position.y = y + bobPlane;
          const flying = uFly > 0.02 && uFly < 0.98 ? 1 : 0.25;
          plane.rotation.z = -0.55 * Math.cos(uFly * Math.PI) * flying;
          plane.rotation.x = -0.35;
        }
        for (let i = 0; i < petals.length; i++) {
          const p = petals[i];
          const loop = (t * p.userData.speed + p.userData.phase) % 1;
          p.position.set(
            p.userData.x0 + Math.sin(loop * 6.2 + p.userData.phase) * 0.1,
            0.1 + 1.5 * (1 - loop),
            p.userData.z0,
          );
          p.rotation.z = p.userData.spin * t;
          p.material.opacity = Math.sin(loop * Math.PI) * (0.35 + 0.65 * smoothstep(japan - 0.2, japan + 0.4, t));
        }

        const lit = current < 0 ? 0 : current;
        const at = LIGHT_AT[lit];
        glow.position.x = at[0];
        glow.position.y = at[1];
        glow.position.z = at[2];
        glow.intensity = risen * (current < 0 ? 0.22 : 0.55);
      },
    };
  },
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function liftFeet(card, characters, id, height) {
  const info = characters && characters.info ? characters.info(id) : null;
  if (!info) {
    card.position.y = 0.02;
    return;
  }
  const s = height / info.h;
  // Canvas bottom sits a hair above the hinge so the padding under the shoes never breaks the page.
  card.position.y = (info.h - info.feet[1]) * s + 0.02;
}

function mountProp(characterArt, paper, art, rig, id, height) {
  const card = characterArt.characterCard(paper, art, id, { height });
  if (!card) return null;
  const info = art.info(id);
  const s = height / info.h;
  card.position.y = (info.h - info.feet[1]) * s + 0.02;
  card.name = id;
  rig.add(card);
  return card;
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
  const group = new THREE.Group();
  // paper.card's origin is the canvas bottom-centre. Slide so the feet pixel is the group origin.
  mesh.position.set(((canvas.width / 2) - feet[0]) * s, (feet[1] - canvas.height) * s, 0);
  group.add(mesh);
  group.name = name;
  return group;
}

function paintPages(paper, art, has, FONT, C, rng) {
  let left;
  let right;
  if (has('page-left') && has('page-right')) {
    const L = cloneCanvas(paper, art.canvas('page-left'));
    const R = cloneCanvas(paper, art.canvas('page-right'));
    timelinePath(L.ctx, L.canvas.width, L.canvas.height, 'left', FONT, C);
    timelinePath(R.ctx, R.canvas.width, R.canvas.height, 'right', FONT, C);
    sprinkle(L.ctx, L.canvas.width, L.canvas.height, 'left', C, rng);
    sprinkle(R.ctx, R.canvas.width, R.canvas.height, 'right', C, rng);
    paper.addGrain(L.ctx, L.canvas.width, L.canvas.height, { amount: 0.035, seed: 41, mottle: 0.8 });
    paper.addGrain(R.ctx, R.canvas.width, R.canvas.height, { amount: 0.035, seed: 42, mottle: 0.8 });
    left = L.canvas;
    right = R.canvas;
  } else {
    left = paper.page((ctx, w, h) => {
      ctx.fillStyle = '#f3e6d0';
      ctx.fillRect(0, 0, w, h);
      timelinePath(ctx, w, h, 'left', FONT, C);
    }, { seed: 41, tint: '#f3e6d0' });
    right = paper.page((ctx, w, h) => {
      ctx.fillStyle = '#f7efe2';
      ctx.fillRect(0, 0, w, h);
      timelinePath(ctx, w, h, 'right', FONT, C);
    }, { seed: 42, tint: '#f7efe2' });
  }
  return { left, right };
}

function timelinePath(ctx, w, h, side, FONT, C) {
  ctx.save();
  // Quiet gutter: left page's right edge, right page's left edge. Pins sit on the path.
  // Pins sit near the vignette feet. Page px: left 1024*(1 − x/3.6), right 1024*(x/3.6),
  // py (z+1.5)/3*853, image top = far edge. Inner ~8% by the gutter stays empty.
  const pts = side === 'left'
    ? [[110, 700], [364, 630], [575, 555], [940, 600]]
    : [[90, 610], [510, 630], [825, 555], [970, 540]];
  ctx.strokeStyle = 'rgba(90, 60, 40, 0.55)';
  ctx.lineWidth = 3.5;
  ctx.setLineDash([1.5, 11]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    ctx.quadraticCurveTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 28, q[0], q[1]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (side === 'right') {
    // The flight's dotted route, higher on the page (farther from the reader).
    ctx.strokeStyle = 'rgba(90, 140, 170, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([1.2, 9]);
    ctx.beginPath();
    ctx.moveTo(398, 546);
    ctx.quadraticCurveTo(590, 400, 782, 441);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const pins = side === 'left'
    ? [[364, 630, '1', 'keys!'], [575, 555, '2', 'best boy']]
    : [[510, 630, '3', 'ours.'], [825, 555, '4', 'Japan']];
  for (let i = 0; i < pins.length; i++) {
    const [x, y, num, caption] = pins[i];
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y - 28);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? C.mustard : C.tomato;
    ctx.beginPath();
    ctx.arc(x, y - 44, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#fffaf2';
    ctx.font = `700 24px ${FONT.hand}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, x, y - 42);
    ctx.font = `700 34px ${FONT.hand}`;
    ctx.fillStyle = C.ink;
    ctx.textBaseline = 'top';
    if (caption === 'Japan') {
      tinyPlane(ctx, x - 62, y + 22);
      ctx.fillText('Japan', x + 16, y + 8);
    } else {
      ctx.fillText(caption, x, y + 8);
    }
  }
  ctx.restore();
}

function tinyPlane(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#3a2f2a';
  ctx.fillStyle = '#f4efe4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(26, 0);
  ctx.lineTo(18, 8);
  ctx.lineTo(28, 14);
  ctx.lineTo(10, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function sprinkle(ctx, w, h, side, C, rng) {
  const colors = [C.blush, C.tomato, C.mustard];
  for (let i = 0; i < 3; i++) {
    const x = side === 'left' ? w * (0.08 + rng.next() * 0.42) : w * (0.52 + rng.next() * 0.36);
    const y = h * (0.1 + rng.next() * 0.22);
    doodleHeart(ctx, x, y, 7 + rng.next() * 6, colors[i]);
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

function letterMailbox(ctx, canvas, FONT, C, names) {
  // Mailbox door, measured on the house drawing: below the slot, centred.
  // Mailbox door, measured on house.webp (x 406–488, slot near y 522).
  const cx = 447;
  const cy = 548;
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

function paintSold(paper, FONT, C, rng) {
  const W = 420;
  const H = 300;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#f7f4ec';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(18, 18, W - 36, H - 36, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.tomato;
  ctx.fillRect(18, 18, W - 36, 36);
  const font = (size) => `${size}px ${FONT.display}`;
  const size = fitSize(ctx, 'SOLD', font, 132, W * 0.72);
  ctx.font = font(size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const gap = size * 0.04;
  let total = 0;
  const text = 'SOLD';
  for (const ch of text) total += ctx.measureText(ch).width + gap;
  total -= gap;
  let x = (W - total) / 2;
  const colors = [C.tomato, C.ink, C.mustard, C.tomato];
  let i = 0;
  for (const ch of text) {
    const cw = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(x + cw / 2, H * 0.58);
    ctx.rotate((rng.next() - 0.5) * 0.08);
    ctx.lineWidth = size * 0.14;
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

function makeKey(paper, THREE, height) {
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
    // a short ribbon loop above the bow
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
  return { geo: new THREE.PlaneGeometry(0.18, 0.16), mat };
}

function petalMesh(paper, THREE) {
  const { canvas, ctx } = paper.makeCanvas(32, 40);
  ctx.fillStyle = '#f3a3b4';
  ctx.beginPath();
  ctx.ellipse(16, 20, 9, 15, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7c3cf';
  ctx.beginPath();
  ctx.ellipse(16, 18, 4, 8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  return { geo: new THREE.PlaneGeometry(0.09, 0.12), mat };
}
