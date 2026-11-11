// Spread 7 — "On her birthday". The party wakes up, Brian kneels, he asks,
// the real photo, then YES and the hug until the page turns.
// Times come from timeline.BEATS / SPREADS (never written as literals).
// Drawings: characters cycle "proposal" and love-story/art/proposal/. update() allocates nothing.
import { photoPrint, PHOTO_ASPECT } from '../photos.js';
import { L } from '../i18n.js';

const GAMMA = 1.78; // one mountain angle — the backdrop is the only vFold
const COUPLE_H = 1.6; // hero card: proposal-0's canvas is this tall (staging 1.5–1.7)
const ANCHOR_X = -0.08; // her centre, in the couple standUp ( +X toward the gutter )
// Couple hinge, page-local (distance from the gutter). Middle of the left page, front half.
const COUPLE_X = 1.72;
const COUPLE_Z = 0.6;
// Her / pair pixel-x so each frame keeps her (or the hug) planted. Measured from the drawings.
const ANCHOR_PX = [181, 185, 280];
// Marlin stands in every frame. Crown-to-feet pixels (hair mass, not a stray wisp):
// 867, 846, 889. The shared pixel scale (frame 0's canvas) leaves the kneel a little
// short and the hug a little tall. These factors lock her crown to the hug.
const FRAME_SCALE = [889 / 867, 889 / 846, 1];
const OPEN = 0.985; // α/π above which free pieces (confetti, the photo's swing) may leave the card plane

const FLAMES = [
  { u: 0.420, v: 0.060 },
  { u: 0.457, v: 0.058 },
  { u: 0.494, v: 0.040 },
  { u: 0.533, v: 0.056 },
  { u: 0.572, v: 0.062 },
];

// Banner words, one per page half so the long Spanish line still fits between the balloons.
const SIGN_PPU = 500;
const SIGN_MAX_W = 1.62;

function bump(t, at) {
  const u = (t - at) / 0.34;
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

function clampScale(s) {
  if (s < 0) return 0;
  if (s > 1.08) return 1.08;
  return s;
}

export default {
  id: 'proposal',
  title: 'On her birthday',
  build(ctx) {
    const { THREE, paper, popup, rng, photos, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'proposal');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'proposal';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);

    // ---------------------------------------------------------------- pages
    const letterRibbon = (g, w, h) => {
      const label = L('happy birthday!', '¡feliz cumpleaños!');
      g.save();
      const font = (size) => `700 ${size}px ${FONT.hand}`;
      // Stay on the open left floor. The streamer popper used to cover the long Spanish line.
      const maxW = w * 0.40;
      const size = fitSize(g, label, font, Math.round(h * 0.042), maxW);
      g.font = font(size);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      const m = g.measureText(label);
      const asc = m.actualBoundingBoxAscent || size * 0.8;
      const desc = m.actualBoundingBoxDescent || size * 0.3;
      const padX = size * 0.55;
      const padY = size * 0.32;
      const rw = m.width + padX * 2;
      const rh = asc + desc + padY * 2;
      const right = w * 0.42;
      const cx = Math.max(rw / 2 + w * 0.035, right - rw / 2);
      g.translate(cx, h * 0.86);
      g.rotate(-0.05);
      g.fillStyle = '#f7ddd4';
      g.strokeStyle = '#e7b4aa';
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(-rw / 2, -rh / 2, rw, rh, Math.min(rh * 0.35, rh / 2));
      g.fill();
      g.stroke();
      g.fillStyle = '#f0c9c2';
      g.beginPath();
      g.moveTo(-rw / 2, -rh * 0.32);
      g.lineTo(-rw / 2 - rh * 0.55, 0);
      g.lineTo(-rw / 2, rh * 0.32);
      g.fill();
      g.beginPath();
      g.moveTo(rw / 2, -rh * 0.32);
      g.lineTo(rw / 2 + rh * 0.55, 0);
      g.lineTo(rw / 2, rh * 0.32);
      g.fill();
      g.textAlign = 'center';
      g.fillStyle = '#9d3a3a';
      // Alphabetic baseline that centres the ink, accent and all, in the ribbon.
      g.fillText(label, 0, (asc - desc) / 2);
      g.restore();
    };

    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const painted = cloneCanvas(paper, art.canvas('page-left'));
      letterRibbon(painted.ctx, painted.canvas.width, painted.canvas.height);
      leftArt = painted.canvas;
      rightArt = art.canvas('page-right');
    } else {
      const floor = (g, w, h, gutterRight) => {
        g.fillStyle = '#f6e3da';
        g.fillRect(0, 0, w, h);
        g.fillStyle = C.tomato;
        for (let i = 0; i < 26; i++) {
          const x = gutterRight ? w * (0.15 + rng.next() * 0.8) : w * rng.next() * 0.82;
          const y = h * (0.08 + rng.next() * 0.84);
          g.save();
          g.translate(x, y);
          g.rotate(rng.next() * 3);
          g.fillRect(-7, -5, 14, 10);
          g.restore();
        }
      };
      leftArt = paper.page((g, w, h) => {
        floor(g, w, h, false);
        letterRibbon(g, w, h);
      }, { seed: 5, tint: '#f6e3da' });
      rightArt = paper.page((g, w, h) => floor(g, w, h, true), { seed: 6, tint: '#f8ebe4' });
    }

    // ---------------------------------------------------------------- backdrop (mountain vFold) + balloons on its halves
    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };

    // Tallest layer, stretched a little past the drawing so it spans most of the spread.
    // Balloons sit on the ends; vFoldLimits at this z0 still holds (checked with the fold test).
    const backdropH = 2.3;
    const bInfo = info('backdrop');
    const naturalW = backdropH * (bInfo ? bInfo.w / bInfo.h : 1024 / 487);
    const backdropW = Math.max(naturalW, 5.45);
    const z0 = -0.8;
    const banner = track(popup.vFold({ z0, gamma: GAMMA, width: backdropW, height: backdropH }));

    if (bInfo) {
      const painted = cloneCanvas(paper, art.canvas('backdrop'));
      const cut = paper.dieCut(painted.canvas, { margin: 8 });
      const halves = paper.splitCard({ canvas: cut, width: backdropW, height: backdropH });
      halves.left.name = 'backdrop-left';
      halves.right.name = 'backdrop-right';
      banner.left.add(halves.left);
      banner.right.add(halves.right);
    } else {
      const flat = paper.paint(1024, 420, (g, w, h) => {
        g.fillStyle = '#2c2a2e';
        g.fillRect(18, 18, w - 36, h - 36);
      }, { dieCut: 8, seed: 3 });
      const halves = paper.splitCard({ canvas: flat, width: backdropW, height: backdropH });
      banner.left.add(halves.left);
      banner.right.add(halves.right);
    }

    // Both words stack on the right half. The left half sits behind the balloon column
    // and the couple, so a word there never reads. The longer word sets the size.
    const signColors = [C.tomato, '#fff6e4', C.mustard, C.teal, C.blush, C.leaf];
    const phrase = L('HAPPY BIRTHDAY', 'FELIZ CUMPLEAÑOS');
    const signLines = phrase.split(' ');
    const signFont = (n) => `700 ${n}px ${FONT.hand}`;
    const signProbe = paper.makeCanvas(4, 4).ctx;
    const signLimit = SIGN_MAX_W * SIGN_PPU * 0.9;
    let signPx = 250;
    for (let i = 0; i < signLines.length; i++) {
      signPx = Math.min(signPx, fitSize(signProbe, signLines[i], signFont, 250, signLimit));
    }
    const signY = backdropH * 0.50;
    const signCanvas = paintScriptLines(paper, FONT, signLines, signPx, signColors);
    const signW = signCanvas.width / SIGN_PPU;
    // Whole sign stays on the right half: clear of the crease, clear of the balloon column.
    const balloonInner = 1.95;
    let signX = signW / 2 + 0.12;
    if (signX + signW / 2 > balloonInner) signX = balloonInner - signW / 2;
    const birthdaySign = mountSign(
      THREE, paper, banner.right,
      signCanvas,
      signX, signY,
    );
    if (birthdaySign) birthdaySign.name = 'birthday-sign';

    // Balloons live inside the vFold rectangle so they fold with the banner (not their own standUp —
    // a column that tall will not share the right page with the photo).
    const balloonRigs = [];
    const mountBalloon = (id, side, x, height, flip) => {
      if (!has(id)) return;
      const card = characterArt.characterCard(paper, art, id, { height, flip: !!flip });
      if (!card) return;
      const meta = art.info(id);
      const s = height / meta.h;
      card.position.y = (meta.h - meta.feet[1]) * s + 0.02; // canvas bottom stays above the glue line
      card.position.x = x;
      card.position.z = 0.008;
      card.userData.baseY = card.position.y;
      card.name = id;
      (side === 'left' ? banner.left : banner.right).add(card);
      balloonRigs.push(card);
    };
    // The right-hand column is the fuller bunch; mirror it so both ends match.
    mountBalloon('balloons-right', 'left', -2.38, 2.02, true);
    mountBalloon('balloons-right', 'right', 2.42, 2.02, false);

    // ---------------------------------------------------------------- couple (left page, one card — the drawings are a pair)
    // Middle of the left page, front half. The kneeling pose reaches toward the gutter;
    // loose stand-up height covers the card, and the YES banner collapses with popup.rise.
    const coupleX = COUPLE_X;
    const coupleZ = COUPLE_Z;
    const couple = track(popup.standUp({
      side: 'left', x: coupleX, z: coupleZ, fold: 'back', width: 1.25, height: 1.65,
    }));
    const coupleMount = couple.mount;
    coupleMount.name = 'couple';

    const cycle = characters && characters.cycle ? characters.cycle('proposal') : [];
    const flip = cycle.length
      ? characterArt.characterFlip(paper, characters, cycle, { height: COUPLE_H })
      : null;

    const frameCards = [];
    let sparkle = null;
    if (flip) {
      coupleMount.add(flip.group);
      const ref = characters.info(cycle[0]);
      const s = COUPLE_H / ref.h;
      for (let i = 0; i < flip.group.children.length && i < cycle.length; i++) {
        const card = flip.group.children[i];
        const meta = characters.info(cycle[i]);
        const px = ANCHOR_PX[i] ?? meta.feet[0];
        card.position.x = ANCHOR_X - (px - meta.feet[0]) * s;
        card.position.y = (meta.h - meta.feet[1]) * s;
        card.name = cycle[i];
        frameCards.push(card);
      }
      sparkle = makeSparkle(THREE, paper);
      sparkle.name = 'ring-sparkle';
      if (frameCards[1]) frameCards[1].add(sparkle);
      const p1 = characters.info(cycle[1] || cycle[0]);
      // Ring box sits in his hands on proposal-1 (about 55% across, 42% down).
      const rs = COUPLE_H / ref.h;
      sparkle.position.set((0.55 * p1.w - p1.feet[0]) * rs, (p1.feet[1] - 0.42 * p1.h) * rs, 0.02);
    } else {
      // Paper dolls if the drawings did not load. Two poses each, swapped on the beats.
      const rig = new THREE.Group();
      rig.name = 'couple-fallback';
      coupleMount.add(rig);
      const add = (who, pose, x, facing) => {
        let card = null;
        try {
          card = figures.figureCard(paper, who, { outfit: 'party', pose, facing, scale: 0.82 });
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
      frameCards.push(add('her', 'stand', -0.28, 'right'), add('him', 'stand', 0.32, 'left'));
      const kneelHer = add('her', 'surprised', -0.28, 'right');
      const kneelHim = add('him', 'kneel', 0.38, 'left');
      if (kneelHer) kneelHer.visible = false;
      if (kneelHim) kneelHim.visible = false;
      frameCards.fallbackKneel = [kneelHer, kneelHim];
    }

    // Question bubble. The rig's origin sits by his head so the pop grows from him,
    // and a hidden bubble collapses onto the card instead of standing up on its own.
    const askCanvas = paintAsk(paper, FONT, C);
    const askW = 1.22;
    const askH = askW * (askCanvas.height / askCanvas.width);
    const bubbleRig = new THREE.Group();
    bubbleRig.name = 'ask-rig';
    bubbleRig.position.set(0.58, 1.18, 0);
    const bubble = new THREE.Mesh(
      new THREE.PlaneGeometry(askW, askH),
      new THREE.MeshBasicMaterial({
        map: paper.texture(askCanvas),
        transparent: true,
        alphaTest: 0.3,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    bubble.name = 'ask-bubble';
    bubble.castShadow = false;
    bubble.position.set(0.06, askH * 0.55, 0);
    bubbleRig.add(bubble);
    bubbleRig.scale.setScalar(0.0008);
    coupleMount.add(bubbleRig);

    // One heart above Marlin: a delighted pop at the birthday, then again while he waits.
    const delight = makeHeart(THREE, paper, C.tomato);
    delight.name = 'delight-heart';
    // Rig origin is the hinge, so the heart collapses onto the page while it turns.
    // The mesh sits in the dark banner, right of the balloons.
    const heartRig = new THREE.Group();
    heartRig.name = 'delight-rig';
    delight.position.set(0.22, 2.05, 0.03);
    delight.scale.setScalar(1);
    heartRig.add(delight);
    heartRig.scale.setScalar(0.0008);
    coupleMount.add(heartRig);

    // YES banner: a wide ribbon above the couple, reaching the gutter. It is a sibling of the
    // flip-book so the squash does not drag it. yesRig scales toward the hinge with the page
    // (popup.rise) so the full-size ribbon never has to fold; yesFace scales on both axes to unfurl.
    const yesCanvas = paintYesBanner(paper, FONT, C, rng);
    const BANNER_W = 3.2;
    const BANNER_H = BANNER_W * (yesCanvas.height / yesCanvas.width);
    const yesRig = new THREE.Group();
    yesRig.name = 'banner-yes';
    const yesFace = new THREE.Group();
    yesFace.position.set(0.05, 1.9, 0.02);
    const yesCard = paper.card({
      canvas: paper.dieCut(yesCanvas, { margin: 10 }),
      width: BANNER_W,
      height: BANNER_H,
      anchor: 'bottom-center',
    });
    yesCard.name = 'banner-yes';
    yesFace.add(yesCard);
    yesRig.add(yesFace);
    coupleMount.add(yesRig);

    // ---------------------------------------------------------------- cake, gifts, streamers, hat, bunch
    const cakeH = 1.25;
    const cake = track(popup.standUp({
      side: 'left', x: 2.72, z: 0.02, fold: 'back', width: 1.3, height: cakeH,
    }));
    const flames = [];
    let cakeCard = null;
    if (has('cake-table')) {
      const card = characterArt.characterCard(paper, art, 'cake-table', { height: cakeH });
      const meta = art.info('cake-table');
      const s = cakeH / meta.h;
      card.position.y = (meta.h - meta.feet[1]) * s;
      card.userData.baseY = card.position.y;
      card.name = 'cake-table';
      cake.mount.add(card);
      cakeCard = card;
      const flame = makeFlame(THREE, paper);
      for (let i = 0; i < FLAMES.length; i++) {
        const mesh = new THREE.Mesh(flame.geo, flame.mat);
        mesh.name = 'flame';
        mesh.position.set(
          (FLAMES[i].u * meta.w - meta.feet[0]) * s,
          (meta.feet[1] - FLAMES[i].v * meta.h) * s,
          0.012,
        );
        mesh.castShadow = false;
        mesh.scale.set(1, 1, 1);
        card.add(mesh);
        flames.push(mesh);
      }
    }

    // Gifts: gutter-side mid-ground, beside the print. Bunch: outer mid-ground.
    const giftH = 0.72;
    const gifts = track(popup.standUp({
      side: 'right', x: 0.98, z: -0.02, fold: 'back', width: 0.82, height: giftH,
    }));
    const giftCard = has('gifts') ? addProp(characterArt, paper, art, gifts.mount, 'gifts', giftH, 0, 0) : null;
    if (giftCard) giftCard.userData.baseY = giftCard.position.y;

    const streamH = 0.32;
    const streamers = track(popup.standUp({
      side: 'left', x: 1.22, z: 0.28, fold: 'back', width: 0.64, height: streamH,
    }));
    const streamCard = has('streamers') ? addProp(characterArt, paper, art, streamers.mount, 'streamers', streamH, 0, 0) : null;

    const hatH = 0.34;
    const hat = track(popup.standUp({
      side: 'right', x: 0.58, z: 1.12, fold: 'back', width: 0.24, height: hatH,
    }));
    const hatCard = has('party-hat') ? addProp(characterArt, paper, art, hat.mount, 'party-hat', hatH, 0, 0) : null;

    const bunchH = 1.12;
    const bunch = track(popup.standUp({
      side: 'right', x: 3.32, z: 0.06, fold: 'back', width: 0.52, height: bunchH,
    }));
    const bunchCard = has('balloon-bunch') ? addProp(characterArt, paper, art, bunch.mount, 'balloon-bunch', bunchH, 0, 0) : null;
    if (bunchCard) bunchCard.userData.baseY = bunchCard.position.y;

    // ---------------------------------------------------------------- the print (right page). Sized at build so strict R2 holds.
    const shot = photoPrint(photos ? photos.proposal : null, {
      width: 680,
      style: 'polaroid',
      caption: L('she said yes!', '¡dijo que sí!'),
      tape: true,
      tilt: -0.04,
      aspect: PHOTO_ASPECT.proposal,
      seed: 5,
    });
    const ratio = shot.height / shot.width;
    // 1.1–1.4 on the long side. Sit to the right of the birthday words.
    let photoH = 1.34;
    let photoW = photoH / ratio;
    const photoLeft = signX + signW / 2 + 0.1;
    let photoX = photoLeft + photoW / 2;
    const photoRightMax = 3.02;
    if (photoX + photoW / 2 > photoRightMax) photoX = photoRightMax - photoW / 2;
    let photoZ = 0.36;
    const photoLim = popup.standUpLimits({ x: photoX, z: photoZ, width: photoW, fold: 'back' });
    if (photoH > photoLim.maxHeightLoose) {
      photoH = photoLim.maxHeightLoose * 0.98;
      photoW = photoH / ratio;
      photoZ = photoH - 1.38;
    }
    const photo = track(popup.standUp({
      side: 'right', x: photoX, z: photoZ, fold: 'back', width: photoW, height: photoH,
    }));
    const photoPivot = new THREE.Group();
    photoPivot.name = 'photo';
    const photoCard = paper.card({
      canvas: paper.dieCut(shot, { margin: 6 }),
      width: photoW,
      height: photoH,
      anchor: 'bottom-center',
    });
    photoPivot.add(photoCard);
    photo.mount.add(photoPivot);

    // ---------------------------------------------------------------- dog, outer left, watching
    const dog = track(popup.standUp({
      side: 'left', x: 2.32, z: 0.36, fold: 'back', width: 0.46, height: 0.62,
    }));
    const dogRig = new THREE.Group();
    dogRig.name = 'dog';
    dog.mount.add(dogRig);
    const dogSit = placeDog(characterArt, paper, art, characters, figures, dogRig, 'dog-sit', 0.45, 272);
    const dogJump = placeDog(characterArt, paper, art, characters, figures, dogRig, 'dog-jump', 0.56, 276);
    if (dogJump) dogJump.visible = false;

    // ---------------------------------------------------------------- confetti + hearts (one holder, scaled away unless the book is open)
    const scatter = track(popup.onPage({ side: 'left', x: COUPLE_X, z: 0.42, lift: 0.004 }));
    const bits = new THREE.Group();
    bits.name = 'confetti';
    scatter.mount.add(bits);
    const confetti = [];
    const hearts = [];
    buildBits(THREE, paper, rng, bits, confetti, hearts, C);

    // A small warm practical. No shadow. Fades with the page via popup.rise.
    const glow = new THREE.PointLight('#ffc2a8', 0, 5.5, 2);
    glow.name = 'yes-glow';
    glow.castShadow = false;
    glow.position.set(-1.5, 1.45, 0.75);
    group.add(glow);

    const state = {
      frame: 0,
      dogUp: false,
    };

    const birthday = BEATS.birthday;
    const kneel = BEATS.kneel;
    const question = BEATS.question;
    const photoReveal = BEATS.photoReveal;
    const yes = BEATS.yes;
    const reactAt = question + 1.65;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        // Whole party. Hold covers the birthday beat, then moves in as he kneels.
        { t: spread.open, hold: Math.max(0.6, kneel - spread.open - 0.35), at: [0, 0.95, 0], size: 7.5, from: 'front' },
        { t: kneel + 0.4, hold: Math.max(0.6, question - kneel - 0.55), at: [-1.48, 0.9, COUPLE_Z], size: 2.3, from: 'front' },
        // Bubble and the ring, not the ring alone — the question is the line he says.
        { t: question + 0.32, hold: 2.05, at: [-1.18, 1.18, COUPLE_Z], size: 2.4, from: 'front' },
        { t: photoReveal + 0.35, hold: Math.max(0.6, yes - photoReveal - 0.5), at: [photoX, photoH * 0.42, photoZ], size: 2.4, from: 'right' },
        {
          t: yes + 0.35,
          hold: Math.max(0.6, (spread.close - 0.45) - (yes + 0.35)),
          at: [0.15, 1.15, 0.28],
          size: 3.5,
          from: 'front',
        },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const open = alpha > OPEN * Math.PI ? 1 : 0;
        const risen = popup.rise(alpha);

        const awake = smoothstep(birthday, birthday + 0.45, t);
        const party = smoothstep(yes, yes + 0.5, t);

        // Banner words pop on when the party comes alive, then keep a small sway.
        {
          const show = Math.max(0.0008, clampScale(ease.outBack(smoothstep(birthday, birthday + 0.42, t))));
          if (birthdaySign) {
            birthdaySign.scale.setScalar(show);
            birthdaySign.rotation.z = Math.sin(t * 1.35) * 0.012 * Math.min(1, show * 8);
          }
        }

        // couple frames + squash. Every frame is scaled (hidden ones stay inside the same box).
        let frame = 0;
        if (t >= yes) frame = 2;
        else if (t >= kneel) frame = 1;
        if (flip) {
          if (frame !== state.frame) {
            flip.show(frame);
            state.frame = frame;
          }
          const pop = bump(t, birthday) * 0.85 + bump(t, kneel) + bump(t, yes);
          const breathe = 1 + Math.sin(t * 1.55) * 0.012;
          const sx = breathe * (1 - 0.07 * pop);
          const sy = breathe * (1 + 0.11 * pop);
          for (let i = 0; i < frameCards.length; i++) {
            const fs = FRAME_SCALE[i] || 1;
            frameCards[i].scale.set(sx * fs, sy * fs, 1);
          }
          // Lift only. A sway around the feet, or a negative bob, pushes the shoes through the page.
          const hop = bump(t, birthday) * 0.055 + (frame === 2 ? (0.5 + 0.5 * Math.sin(t * 2.3)) * 0.016 : 0);
          flip.group.position.y = hop;
          flip.group.position.x = Math.sin(t * 1.15) * (frame === 2 ? 0.012 : 0.005);
        } else if (frameCards.fallbackKneel) {
          const standing = frame === 0;
          for (let i = 0; i < 2; i++) if (frameCards[i]) frameCards[i].visible = standing;
          const k = frameCards.fallbackKneel;
          for (let i = 0; i < k.length; i++) if (k[i]) k[i].visible = !standing;
        }

        if (sparkle) {
          // Glint as soon as the box is out; brighter once he asks.
          const on = t >= kneel && t < yes;
          const amp = t >= question ? 0.26 : 0.15;
          sparkle.scale.setScalar(on ? amp * (0.7 + 0.3 * Math.sin(t * 14)) : 0);
        }

        {
          const inn = smoothstep(question, question + 0.32, t);
          const out = smoothstep(photoReveal, photoReveal + 0.4, t);
          const show = Math.max(0.0008, clampScale(ease.outBack(inn)) * (1 - out) * risen);
          bubbleRig.scale.setScalar(show);
          bubble.rotation.z = Math.sin(t * 1.5) * 0.035 * Math.min(1, show * 6);
        }

        // Heart above her at the birthday, then a second rise while the question hangs.
        {
          const dIn = smoothstep(birthday, birthday + 0.22, t);
          const dOut = smoothstep(birthday + 1.05, kneel - 0.05, t);
          const delightK = dIn * (1 - dOut);
          const rIn = smoothstep(reactAt, reactAt + 0.28, t);
          const rOut = smoothstep(photoReveal - 0.2, photoReveal + 0.25, t);
          const reactK = rIn * (1 - rOut);
          const k = delightK > reactK ? delightK : reactK;
          const lift = delightK * Math.max(0, t - birthday) * 0.07 + reactK * Math.max(0, t - reactAt) * 0.09;
          heartRig.scale.setScalar(Math.max(0.0008, k * risen));
          delight.position.y = 2.05 + lift;
          delight.material.opacity = k > 0 ? Math.min(1, k * 1.25) : 0;
          delight.rotation.z = Math.sin(t * 2.2) * 0.18;
        }

        {
          // Collapse onto the hinge while the page is not open; unfurl on both axes on the beat.
          const u = smoothstep(yes, yes + 0.55, t);
          const show = Math.max(0.0008, clampScale(ease.outBack(u)));
          const lift = Math.max(0.0008, risen);
          yesRig.scale.set(lift, lift, 1);
          yesFace.scale.set(show, show, 1);
          yesFace.rotation.z = Math.sin(t * 1.35) * 0.028 * show * risen;
        }

        const bob = 0.004 + awake * (0.02 + 0.032 * party);
        for (let i = 0; i < balloonRigs.length; i++) {
          const base = balloonRigs[i].userData.baseY;
          balloonRigs[i].position.y = base + bob * (0.5 + 0.5 * Math.sin(t * 2.1 + i));
          balloonRigs[i].rotation.z = Math.sin(t * 1.6 + i * 1.4) * (0.01 + awake * (0.02 + 0.045 * party));
        }

        if (cakeCard) {
          cakeCard.position.y = cakeCard.userData.baseY + bump(t, birthday) * 0.045;
        }
        for (let i = 0; i < flames.length; i++) {
          const flick = 0.75 + 0.25 * Math.sin(t * (7 + i) + i * 1.7);
          const lit = awake * (0.45 + 0.7 * flick);
          flames[i].scale.set(0.7 + 0.3 * flick, lit, 1);
        }

        if (streamCard) streamCard.rotation.z = Math.sin(t * 1.8) * 0.03 * awake;
        if (hatCard) hatCard.rotation.z = Math.sin(t * 2.1 + 1) * 0.035 * awake;
        if (bunchCard) {
          // Only lift — a dip pushes the die-cut border through the page.
          const bob = (0.5 + 0.5 * Math.sin(t * 1.7)) * (0.012 + 0.016 * awake + 0.014 * party);
          bunchCard.position.y = bunchCard.userData.baseY + bob;
        }
        if (giftCard) giftCard.position.y = giftCard.userData.baseY + bump(t, yes) * 0.04;

        const hopT = t - yes;
        const hop = hopT > 0 ? Math.abs(Math.sin(hopT * 6)) * Math.exp(-hopT * 0.7) * 0.11 : 0;
        const idle = (t >= yes ? Math.abs(Math.sin(t * 3.1)) * 0.028 : Math.max(0, Math.sin(t * 1.5)) * 0.01 * awake);
        dogRig.position.y = hop + idle;
        dogRig.scale.y = 1 + hop * 1.2;
        const dogUp = t >= yes;
        if (dogUp !== state.dogUp) {
          state.dogUp = dogUp;
          if (dogSit) dogSit.visible = !dogUp;
          if (dogJump) dogJump.visible = dogUp;
        }

        // Swing only while the spread is fully open; otherwise the print is a plain standUp.
        const reveal = smoothstep(photoReveal, photoReveal + 0.9, t);
        photoPivot.rotation.x = open ? (-Math.PI / 2) * (1 - reveal) : 0;
        // A few degrees toward the couple, only while the print is up and the book is open.
        photoPivot.rotation.y = open ? -0.18 * reveal : 0;
        photoPivot.scale.setScalar(reveal > 0.001 ? reveal : 0.0008);

        // One scale on the holder: pieces collapse onto the page, not to their own offsets.
        bits.scale.setScalar(open && t >= yes ? 1 : 0);
        poseBits(confetti, hearts, t, yes);

        const swell = smoothstep(yes, yes + 0.4, t) * (1 - smoothstep(yes + 2.2, yes + 3.4, t));
        glow.intensity = risen * (0.35 * awake + 1.15 * party + 2.6 * swell);
      },
    };
  },
};

// Stacked handwritten lines. Each letter is stroked so Ñ and accents stay inside the card.
function paintScriptLines(paper, FONT, lines, px, colors) {
  const font = `700 ${px}px ${FONT.hand}`;
  const probe = paper.makeCanvas(4, 4).ctx;
  probe.font = font;
  probe.textBaseline = 'alphabetic';
  const gap = px * 0.02;
  const lineGap = px * 0.22;
  let asc = px * 0.8;
  let desc = px * 0.28;
  let maxTotal = 0;
  const laid = [];
  for (let li = 0; li < lines.length; li++) {
    const chars = Array.from(lines[li]);
    const widths = [];
    let total = 0;
    for (let i = 0; i < chars.length; i++) {
      const m = probe.measureText(chars[i]);
      widths.push(m.width);
      total += m.width;
      if (i) total += gap;
      const a = m.actualBoundingBoxAscent || 0;
      const d = m.actualBoundingBoxDescent || 0;
      if (a > asc) asc = a;
      if (d > desc) desc = d;
    }
    if (total > maxTotal) maxTotal = total;
    laid.push({ chars, widths });
  }
  const padX = px * 0.16;
  const padY = px * 0.16;
  const lineH = asc + desc;
  const W = Math.max(8, Math.ceil(maxTotal + padX * 2));
  const H = Math.max(8, Math.ceil(lines.length * lineH + Math.max(0, lines.length - 1) * lineGap + padY * 2));
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, px * 0.055);
  let y = padY + asc;
  let colorI = 0;
  for (let li = 0; li < laid.length; li++) {
    const { chars, widths } = laid[li];
    let total = 0;
    for (let i = 0; i < widths.length; i++) total += widths[i] + (i ? gap : 0);
    let x = (W - total) / 2;
    for (let i = 0; i < chars.length; i++) {
      ctx.strokeStyle = '#3a2418';
      ctx.strokeText(chars[i], x, y);
      ctx.fillStyle = colors[colorI % colors.length];
      ctx.fillText(chars[i], x, y);
      x += widths[i] + gap;
      colorI += 1;
    }
    y += lineH + lineGap;
  }
  return canvas;
}

function mountSign(THREE, paper, parent, canvas, x, y) {
  if (!canvas) return null;
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    alphaTest: 0.28,
    depthWrite: false,
    toneMapped: false,
  });
  const w = canvas.width / SIGN_PPU;
  const h = canvas.height / SIGN_PPU;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, 0.008);
  mesh.castShadow = false;
  mesh.scale.setScalar(0.0008);
  parent.add(mesh);
  return mesh;
}

function paintAsk(paper, FONT, C) {
  const q = L('Will you marry me?', '¿Te casas conmigo?');
  const lines = q.includes(' marry ')
    ? ['Will you', 'marry me?']
    : [q.slice(0, q.lastIndexOf(' ')), q.slice(q.lastIndexOf(' ') + 1)];
  const W = 760;
  const H = 400;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  const m = 16;
  const bodyH = H - 78;
  ctx.fillStyle = '#fffaf3';
  ctx.strokeStyle = C.ink || '#3a2f2a';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(m, m, W - m * 2, bodyH, 40);
  ctx.fill();
  ctx.stroke();
  // Tail down toward his face (he stands to the left of the bubble's centre).
  ctx.beginPath();
  ctx.moveTo(W * 0.30, m + bodyH - 2);
  ctx.lineTo(W * 0.16, H - 12);
  ctx.lineTo(W * 0.48, m + bodyH - 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const font = (size) => `700 ${size}px ${FONT.hand}`;
  let size = 200;
  for (let i = 0; i < lines.length; i++) {
    size = Math.min(size, fitSize(ctx, lines[i], font, 168, W - m * 4));
  }
  ctx.font = font(size);
  const sample = ctx.measureText(lines[0] || q);
  const asc = sample.actualBoundingBoxAscent || size * 0.75;
  const desc = sample.actualBoundingBoxDescent || size * 0.28;
  const gap = size * 0.16;
  const block = lines.length * (asc + desc) + (lines.length - 1) * gap;
  let y = m + (bodyH - block) / 2 + asc;
  ctx.fillStyle = '#9d3a3a';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, y);
    y += asc + desc + gap;
  }
  return canvas;
}

// Wide bunting. The word is painted here (not in the drawing) so ¡ and Í stay in the ribbon
// at the same cap size as YES!.
function paintYesBanner(paper, FONT, C, rng) {
  const word = L('YES!', '¡SÍ!');
  const W = 1700;
  const font = (size) => `${size}px ${FONT.display}`;
  const probe = paper.makeCanvas(8, 8).ctx;
  // English sets the cap size. Spanish keeps it unless the word is genuinely wider.
  // English sets the cap size. A missing ¡ measures as a huge box and must not shrink S or Í.
  const englishPx = fitSize(probe, 'YES!', font, 248, W * 0.62);
  let size = englishPx;
  probe.font = font(size);
  probe.textBaseline = 'middle';
  const iBox = measureGlyph(probe, 'I');
  const bangBox = measureGlyph(probe, '!');
  const acuteBox = measureGlyph(probe, 'Í');
  const invBox = measureGlyph(probe, '¡');
  const customAcute = acuteBox.ascent < iBox.ascent + size * 0.05;
  const customBang = invBox.ascent < size * 0.2 || invBox.w < size * 0.08;
  const advanceOf = (ch) => {
    if (ch === '¡' && customBang) return Math.max(bangBox.w, size * 0.28);
    if (ch === 'Í' && customAcute) return iBox.w;
    return measureGlyph(probe, ch).w;
  };
  const glyphs = Array.from(word);
  const gap0 = size * 0.045;
  let drawn = 0;
  for (let i = 0; i < glyphs.length; i++) drawn += advanceOf(glyphs[i]) + (i ? gap0 : 0);
  const room = W * 0.84;
  if (drawn > room) size *= room / drawn;
  probe.font = font(size);
  probe.textBaseline = 'middle';
  const body = measureGlyph(probe, 'S');
  const ascent = Math.max(body.ascent, size * 0.7);
  const descent = Math.max(body.descent, measureGlyph(probe, '!').descent, size * 0.22);
  const marked = word.includes('Í') || word.includes('¡');
  const head = marked ? size * 0.2 : size * 0.05;
  const foot = size * 0.05;
  const pad = size * 0.08;
  const ribbonTop = 18;
  const cy = ribbonTop + pad + head + ascent;
  const ribbonBot = cy + descent + foot + pad;
  const pennantH = 100;
  const H = Math.ceil(ribbonBot + pennantH + 18);
  const { canvas, ctx } = paper.makeCanvas(W, H);
  const ink = '#2b2622';
  const pennantColors = [C.tomato, C.cream, C.teal, C.blush, C.mustard, C.tomato, C.cream, C.leaf, C.blush, C.mustard, C.tomato];
  const count = pennantColors.length;
  const left = 120;
  const right = W - 120;
  const step = (right - left) / (count - 1);
  const bot = ribbonBot;
  for (let i = 0; i < count; i++) {
    const x = left + i * step;
    const pw = 86;
    const ph = 96;
    ctx.beginPath();
    ctx.moveTo(x - pw / 2, bot - 8);
    ctx.lineTo(x + pw / 2, bot - 8);
    ctx.lineTo(x, bot - 8 + ph);
    ctx.closePath();
    ctx.fillStyle = pennantColors[i];
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(54, ribbonTop + 36);
  ctx.lineTo(108, ribbonTop);
  ctx.quadraticCurveTo(W / 2, ribbonTop - 8, W - 108, ribbonTop);
  ctx.lineTo(W - 54, ribbonTop + 36);
  ctx.lineTo(W - 108, bot);
  ctx.quadraticCurveTo(W / 2, bot + 16, 108, bot);
  ctx.closePath();
  ctx.fillStyle = '#fff8ee';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = C.tomato;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.mustard;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(28, ribbonTop + 4);
  ctx.quadraticCurveTo(W / 2, ribbonTop - 6, W - 28, ribbonTop + 4);
  ctx.strokeStyle = '#b08968';
  ctx.lineWidth = 4;
  ctx.stroke();
  cutWord(ctx, word, W / 2, cy, size, FONT, [C.tomato, C.teal, C.mustard, C.leaf], rng);
  paper.addGrain(ctx, W, H, { amount: 0.04, seed: 11, mottle: 0.6 });
  return canvas;
}

function addProp(characterArt, paper, art, mount, id, height, x, z) {
  const card = characterArt.characterCard(paper, art, id, { height });
  if (!card) return null;
  const meta = art.info(id);
  const s = height / meta.h;
  card.position.set(x, (meta.h - meta.feet[1]) * s, z);
  card.name = id;
  mount.add(card);
  return card;
}

function placeDog(characterArt, paper, art, characters, figures, rig, id, height, bodyPx) {
  let card = null;
  if (characters && characters.has && characters.has(id)) {
    card = characterArt.characterCard(paper, characters, id, { height });
    const meta = characters.info(id);
    const s = height / meta.h;
    // dog-jump's feet pixel is the stretched back paw; keep the body where the sit pose stands.
    const nudge = bodyPx ? -(bodyPx - meta.feet[0]) * s : 0;
    card.position.set(nudge, (meta.h - meta.feet[1]) * s, 0);
  } else if (figures && figures.figureCard) {
    try {
      card = figures.figureCard(paper, 'chihuahua', { pose: id === 'dog-jump' ? 'run' : 'sit', scale: height / 0.32 });
    } catch {
      card = null;
    }
  }
  if (!card) return null;
  card.name = id;
  rig.add(card);
  return card;
}

function measureGlyph(ctx, ch) {
  const m = ctx.measureText(ch);
  return {
    w: m.width,
    ascent: m.actualBoundingBoxAscent || 0,
    descent: m.actualBoundingBoxDescent || 0,
  };
}

function cutWord(ctx, text, cx, cy, px, FONT, colors, rng) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.font = `${px}px ${FONT.display}`;
  const iBox = measureGlyph(ctx, 'I');
  const acuteBox = measureGlyph(ctx, 'Í');
  const bangBox = measureGlyph(ctx, '!');
  const invBox = measureGlyph(ctx, '¡');
  // A missing accent sits no higher than a plain I. A missing ¡ has no ink.
  const drawAcute = acuteBox.ascent < iBox.ascent + px * 0.05;
  const drawBang = invBox.ascent < px * 0.2 || invBox.w < px * 0.08;
  const advance = (ch) => {
    if (ch === '¡' && drawBang) return Math.max(bangBox.w, px * 0.28);
    if (ch === 'Í' && drawAcute) return iBox.w;
    return measureGlyph(ctx, ch).w;
  };
  const gap = px * 0.045;
  const chars = Array.from(text);
  let total = 0;
  for (let i = 0; i < chars.length; i++) total += advance(chars[i]) + gap;
  if (chars.length) total -= gap;
  let x = cx - total / 2;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const w = advance(ch);
    const color = colors[i % colors.length];
    ctx.save();
    ctx.translate(x + w / 2, cy);
    ctx.rotate((rng.next() - 0.5) * 0.06);
    if (ch === '¡' && drawBang) paintInvBang(ctx, px, color);
    else if (ch === 'Í' && drawAcute) {
      paintLetter(ctx, 'I', px, color);
      paintAcute(ctx, px, color);
    } else paintLetter(ctx, ch, px, color);
    ctx.restore();
    x += w + gap;
  }
  ctx.restore();
}

function paintLetter(ctx, ch, px, color) {
  const w = ctx.measureText(ch).width;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, px * 0.055);
  ctx.strokeStyle = '#3a2f2a';
  ctx.shadowColor = 'rgba(43, 30, 22, 0.5)';
  ctx.shadowBlur = px * 0.13;
  ctx.shadowOffsetX = px * 0.03;
  ctx.shadowOffsetY = px * 0.065;
  ctx.strokeText(ch, -w / 2, 0);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = color;
  ctx.fillText(ch, -w / 2, 0);
}

// Drawn only when the display face has no ¡. Dot on top, stem below — an upside-down !.
function paintInvBang(ctx, px, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#3a2f2a';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, px * 0.045);
  const stemW = px * 0.15;
  const stemH = px * 0.4;
  ctx.beginPath();
  ctx.roundRect(-stemW / 2, -px * 0.02, stemW, stemH, stemW * 0.45);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -px * 0.28, px * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Drawn only when Í has no accent of its own. Sits above the cap of a plain I.
function paintAcute(ctx, px, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#3a2f2a';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, px * 0.04);
  ctx.beginPath();
  ctx.moveTo(-px * 0.02, -px * 0.46);
  ctx.lineTo(px * 0.2, -px * 0.66);
  ctx.lineTo(px * 0.28, -px * 0.56);
  ctx.lineTo(px * 0.06, -px * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function makeFlame(THREE, paper) {
  const { canvas, ctx } = paper.makeCanvas(32, 48);
  const g = ctx.createLinearGradient(0, 48, 0, 0);
  g.addColorStop(0, 'rgba(255, 170, 40, 0)');
  g.addColorStop(0.35, 'rgba(255, 186, 46, 0.95)');
  g.addColorStop(1, 'rgba(255, 244, 200, 0.95)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(16, 26, 8, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = paper.texture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, toneMapped: false,
  });
  return { geo: new THREE.PlaneGeometry(0.05, 0.09), mat };
}

function makeSparkle(THREE, paper) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  ctx.translate(32, 32);
  ctx.fillStyle = '#fff6d4';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? 28 : 7;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.castShadow = false;
  mesh.scale.setScalar(0);
  return mesh;
}

function makeHeart(THREE, paper, color) {
  const mat = new THREE.MeshBasicMaterial({
    map: heartTex(paper),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    color,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat);
  mesh.castShadow = false;
  mesh.scale.setScalar(0.0008);
  mesh.material.opacity = 0;
  return mesh;
}

function buildBits(THREE, paper, rng, parent, confetti, hearts, C) {
  const colors = [C.tomato, '#2b2622', C.cream, C.mustard, '#fbf7ee', C.blush];
  const geo = new THREE.PlaneGeometry(0.11, 0.16);
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length], side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'confetti';
    mesh.castShadow = false;
    const x0 = -1.45 + rng.next() * 6.3;
    const z0 = -1.7 + rng.next() * 2.5;
    const piece = {
      mesh,
      x0, z0,
      vx: (rng.next() - 0.5) * 0.28,
      vz: (rng.next() - 0.5) * 0.14,
      vy: 1.15 + rng.next() * 0.55,
      g: 1.25,
      delay: rng.next() * 0.4,
      spin: (rng.next() - 0.5) * 4,
      rot: rng.next() * Math.PI,
    };
    // Land inside the same safe box the launch used.
    const T = (2 * piece.vy) / piece.g;
    piece.x1 = clamp(piece.x0 + piece.vx * T, -1.5, 4.95);
    piece.z1 = clamp(piece.z0 + piece.vz * T, -1.75, 0.88);
    piece.T = T;
    parent.add(mesh);
    confetti.push(piece);
  }
  const heart = heartTex(paper);
  const hGeo = new THREE.PlaneGeometry(0.22, 0.22);
  const hMatBase = { map: heart, transparent: true, depthWrite: false, toneMapped: false };
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({ ...hMatBase, color: i % 2 ? C.blush : C.tomato });
    const mesh = new THREE.Mesh(hGeo, mat);
    mesh.name = 'heart';
    mesh.castShadow = false;
    const piece = {
      mesh,
      x0: -0.55 + rng.next() * 2.4,
      z0: -0.35 + rng.next() * 0.9,
      phase: rng.next() * 6,
      delay: 0.05 + rng.next() * 2.4,
    };
    parent.add(mesh);
    hearts.push(piece);
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

function poseBits(confetti, hearts, t, yes) {
  for (let i = 0; i < confetti.length; i++) {
    const p = confetti[i];
    const age = t - yes - p.delay;
    const mesh = p.mesh;
    if (age <= 0) {
      mesh.position.set(p.x0, 0.07, p.z0);
      mesh.rotation.z = p.rot;
      continue;
    }
    // Two flights, so the hold after YES is not a settled pile.
    const period = p.T + 0.55;
    const wave = age >= period ? 1 : 0;
    const local = age - wave * period;
    if (wave > 0 && local >= p.T) {
      mesh.position.set(p.x1, 0.07, p.z1);
      mesh.rotation.z = p.rot + p.spin * p.T * 2;
    } else if (local < p.T) {
      const arc = p.vy * local - 0.5 * p.g * local * local;
      mesh.position.set(p.x0 + p.vx * local, arc > 0.07 ? arc : 0.07, p.z0 + p.vz * local);
      mesh.rotation.z = p.rot + p.spin * (local + wave * 0.4);
    } else {
      mesh.position.set(p.x1, 0.07, p.z1);
      mesh.rotation.z = p.rot + p.spin * p.T;
    }
  }
  for (let i = 0; i < hearts.length; i++) {
    const p = hearts[i];
    const age = t - yes - p.delay;
    const life = 3.6;
    const y = age > 0 ? 0.1 + Math.min(1.3, age * 0.32) : 0.1;
    p.mesh.position.set(p.x0 + Math.sin(t * 1.4 + p.phase) * 0.07, y, p.z0);
    let op = 0;
    if (age > 0 && age < life) {
      const inn = age < 0.22 ? age / 0.22 : 1;
      const out = age > life - 0.7 ? Math.max(0, (life - age) / 0.7) : 1;
      op = inn * out;
    }
    p.mesh.material.opacity = op;
    p.mesh.rotation.z = Math.sin(t * 1.1 + p.phase) * 0.22;
  }
}

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}
