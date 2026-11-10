// Spread 5 — "The question". Marlin's birthday: Brian kneels, the ring, the photo, yes.
// Pop-up picture book. Times come from timeline.BEATS / SPREADS (never written as literals).
// Drawings: characters cycle "proposal" and love-story/art/proposal/. update() allocates nothing.
import { photoPrint, PHOTO_ASPECT } from '../photos.js';

const GAMMA = 1.78; // one mountain angle — the backdrop is the only vFold
const COUPLE_H = 1.6; // hero card: proposal-0's canvas is this tall (staging 1.5–1.7)
const ANCHOR_X = -0.08; // her centre, in the couple standUp ( +X toward the gutter )
// Couple hinge, page-local (distance from the gutter). Middle of the left page, front half.
const COUPLE_X = 1.72;
const COUPLE_Z = 0.6;
// Her / pair pixel-x so each frame keeps her (or the hug) planted. Measured from the drawings.
const ANCHOR_PX = [181, 185, 280];
const OPEN = 0.985; // α/π above which free pieces (confetti, the photo's swing) may leave the card plane

const FLAMES = [
  { u: 0.420, v: 0.060 },
  { u: 0.457, v: 0.058 },
  { u: 0.494, v: 0.040 },
  { u: 0.533, v: 0.056 },
  { u: 0.572, v: 0.062 },
];

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

export default {
  id: 'proposal',
  title: 'The question',
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
    const letterRibbon = (ctx, w, h) => {
      ctx.save();
      ctx.translate(w * 0.30, h * 0.80);
      ctx.rotate(-0.07);
      const rw = w * 0.46;
      const rh = h * 0.075;
      ctx.fillStyle = '#f7ddd4';
      ctx.strokeStyle = '#e7b4aa';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-rw / 2, -rh / 2, rw, rh, rh * 0.4);
      ctx.fill();
      ctx.stroke();
      // forked ribbon ends
      ctx.fillStyle = '#f0c9c2';
      ctx.beginPath();
      ctx.moveTo(-rw / 2, -rh * 0.35);
      ctx.lineTo(-rw / 2 - rh * 0.7, 0);
      ctx.lineTo(-rw / 2, rh * 0.35);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(rw / 2, -rh * 0.35);
      ctx.lineTo(rw / 2 + rh * 0.7, 0);
      ctx.lineTo(rw / 2, rh * 0.35);
      ctx.fill();
      const font = (size) => `700 ${size}px ${FONT.hand}`;
      const size = fitSize(ctx, 'happy birthday!', font, Math.round(h * 0.052), rw * 0.86);
      ctx.font = font(size);
      ctx.fillStyle = '#9d3a3a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('happy birthday!', 0, rh * 0.04);
      ctx.restore();
    };

    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const L = cloneCanvas(paper, art.canvas('page-left'));
      letterRibbon(L.ctx, L.canvas.width, L.canvas.height);
      leftArt = L.canvas;
      rightArt = art.canvas('page-right');
    } else {
      const floor = (ctx, w, h, gutterRight) => {
        ctx.fillStyle = '#f6e3da';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = C.tomato;
        for (let i = 0; i < 26; i++) {
          const x = gutterRight ? w * (0.15 + rng.next() * 0.8) : w * rng.next() * 0.82;
          const y = h * (0.08 + rng.next() * 0.84);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rng.next() * 3);
          ctx.fillRect(-7, -5, 14, 10);
          ctx.restore();
        }
      };
      leftArt = paper.page((ctx, w, h) => {
        floor(ctx, w, h, false);
        letterRibbon(ctx, w, h);
      }, { seed: 5, tint: '#f6e3da' });
      rightArt = paper.page((ctx, w, h) => floor(ctx, w, h, true), { seed: 6, tint: '#f8ebe4' });
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
      const { ctx, canvas } = painted;
      const font = (size) => `700 ${size}px ${FONT.hand}`;
      const size = fitSize(ctx, 'Birthday', font, Math.round(canvas.height * 0.15), canvas.width * 0.26);
      ctx.font = font(size);
      ctx.fillStyle = '#f6ead4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Stacked on the right half. The YES ribbon crosses the left page and the gutter,
      // and from the film camera it covers that whole left panel.
      ctx.fillText('Happy', canvas.width * 0.74, canvas.height * 0.40);
      ctx.fillText('Birthday', canvas.width * 0.74, canvas.height * 0.60);
      const cut = paper.dieCut(canvas, { margin: 8 });
      const halves = paper.splitCard({ canvas: cut, width: backdropW, height: backdropH });
      halves.left.name = 'backdrop-left';
      halves.right.name = 'backdrop-right';
      banner.left.add(halves.left);
      banner.right.add(halves.right);
    } else {
      const flat = paper.paint(1024, 420, (ctx, w, h) => {
        ctx.fillStyle = '#2c2a2e';
        ctx.fillRect(18, 18, w - 36, h - 36);
        ctx.font = `700 ${Math.round(h * 0.28)}px ${FONT.hand}`;
        ctx.fillStyle = '#f6ead4';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Happy', w * 0.74, h * 0.40);
        ctx.fillText('Birthday', w * 0.74, h * 0.60);
      }, { dieCut: 8, seed: 3 });
      const halves = paper.splitCard({ canvas: flat, width: backdropW, height: backdropH });
      banner.left.add(halves.left);
      banner.right.add(halves.right);
    }

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

    // YES banner: a wide ribbon above the couple, reaching the gutter. It is a sibling of the
    // flip-book so the squash does not drag it. yesRig scales toward the hinge with the page
    // (popup.rise) so the full-size ribbon never has to fold; yesFace scales on both axes to unfurl.
    const BANNER_W = 3.15;
    const BANNER_H = 0.8;
    const yesRig = new THREE.Group();
    yesRig.name = 'banner-yes';
    const yesFace = new THREE.Group();
    yesFace.position.set(0.05, 1.64, -0.02);
    const yesCanvas = paintYesBanner(paper, FONT, C, rng);
    const yesCard = paper.card({
      canvas: paper.dieCut(yesCanvas, { margin: 8 }),
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
    if (has('cake-table')) {
      const card = characterArt.characterCard(paper, art, 'cake-table', { height: cakeH });
      const meta = art.info('cake-table');
      const s = cakeH / meta.h;
      card.position.y = (meta.h - meta.feet[1]) * s;
      card.name = 'cake-table';
      cake.mount.add(card);
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
    if (has('gifts')) addProp(characterArt, paper, art, gifts.mount, 'gifts', giftH, 0, 0);

    const streamH = 0.32;
    const streamers = track(popup.standUp({
      side: 'left', x: 1.85, z: 1.18, fold: 'back', width: 0.64, height: streamH,
    }));
    if (has('streamers')) addProp(characterArt, paper, art, streamers.mount, 'streamers', streamH, 0, 0);

    const hatH = 0.34;
    const hat = track(popup.standUp({
      side: 'right', x: 0.58, z: 1.12, fold: 'back', width: 0.24, height: hatH,
    }));
    if (has('party-hat')) addProp(characterArt, paper, art, hat.mount, 'party-hat', hatH, 0, 0);

    const bunchH = 1.12;
    const bunch = track(popup.standUp({
      side: 'right', x: 3.15, z: 0.06, fold: 'back', width: 0.52, height: bunchH,
    }));
    if (has('balloon-bunch')) addProp(characterArt, paper, art, bunch.mount, 'balloon-bunch', bunchH, 0, 0);

    // ---------------------------------------------------------------- the print (right page). Sized at build so strict R2 holds.
    const shot = photoPrint(photos ? photos.proposal : null, {
      width: 680,
      style: 'print',
      caption: 'she said…',
      tape: false,
      tilt: 0,
      aspect: PHOTO_ASPECT.proposal,
      seed: 5,
    });
    const ratio = shot.height / shot.width;
    // Large as the loose stand-up allows, still shorter than the backdrop, with a lane
    // outside it for the balloon bunch. Hinge sits near the middle of the right page.
    let photoH = 1.88;
    let photoW = photoH / ratio;
    const photoX = 2.05;
    let photoZ = photoH - 1.38;
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

    const kneel = BEATS.kneel;
    const question = BEATS.question;
    const photoReveal = BEATS.photoReveal;
    const yes = BEATS.yes;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 1.7, at: [0, 0.95, 0], size: 7.5, from: 'front' },
        // Kneeling pair, close. Ring sits in his hands on frame 1 (see sparkle placement).
        { t: kneel + 0.5, hold: 2.2, at: [-1.48, 0.86, COUPLE_Z], size: 2.1, from: 'front' },
        { t: question, hold: 1.5, at: [-1.40, 0.8, COUPLE_Z + 0.04], size: 1.2, from: 'front' },
        { t: photoReveal + 0.3, hold: 1.4, at: [photoX, photoH * 0.46, photoZ], size: 2.2, from: 'right' },
        {
          t: yes + 0.2,
          hold: (spread.close - 0.5) - (yes + 0.2),
          // Couple + ribbon + the print, one frame.
          at: [0.15, 1.15, 0.3],
          size: 3.2,
          from: 'front',
        },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const open = alpha > OPEN * Math.PI ? 1 : 0;
        const risen = popup.rise(alpha);

        // couple frames + squash. Every frame is scaled (hidden ones stay inside the same box).
        let frame = 0;
        if (t >= yes) frame = 2;
        else if (t >= kneel) frame = 1;
        if (flip) {
          if (frame !== state.frame) {
            flip.show(frame);
            state.frame = frame;
          }
          const pop = bump(t, kneel) + bump(t, yes);
          const breathe = 1 + Math.sin(t * 1.55) * 0.012;
          const sx = breathe * (1 - 0.07 * pop);
          const sy = breathe * (1 + 0.11 * pop);
          for (let i = 0; i < frameCards.length; i++) frameCards[i].scale.set(sx, sy, 1);
        } else if (frameCards.fallbackKneel) {
          const standing = frame === 0;
          for (let i = 0; i < 2; i++) if (frameCards[i]) frameCards[i].visible = standing;
          const k = frameCards.fallbackKneel;
          for (let i = 0; i < k.length; i++) if (k[i]) k[i].visible = !standing;
        }

        if (sparkle) {
          const on = t >= question && t < yes ? 0.22 * (0.72 + 0.28 * Math.sin(t * 16)) : 0;
          sparkle.scale.setScalar(on);
        }

        {
          // Collapse onto the hinge while the page is not open; unfurl on both axes on the beat.
          const u = smoothstep(yes, yes + 0.55, t);
          let s = ease.outBack(u);
          if (s < 0) s = 0;
          else if (s > 1.05) s = 1.05;
          const show = Math.max(0.0008, s);
          const lift = Math.max(0.0008, risen);
          yesRig.scale.set(lift, lift, 1);
          yesFace.scale.set(show, show, 1);
          yesFace.rotation.z = Math.sin(t * 1.35) * 0.028 * show * risen;
        }

        const party = smoothstep(yes, yes + 0.5, t);
        const bob = 0.012 + 0.03 * party;
        for (let i = 0; i < balloonRigs.length; i++) {
          const base = balloonRigs[i].userData.baseY;
          balloonRigs[i].position.y = base + bob * (0.5 + 0.5 * Math.sin(t * 2.1 + i));
          balloonRigs[i].rotation.z = Math.sin(t * 1.6 + i * 1.4) * (0.025 + 0.04 * party);
        }

        for (let i = 0; i < flames.length; i++) {
          flames[i].scale.y = 0.78 + 0.22 * Math.sin(t * (7 + i) + i * 1.7);
        }

        const hopT = t - yes;
        const hop = hopT > 0 ? Math.abs(Math.sin(hopT * 6)) * Math.exp(-hopT * 0.75) * 0.11 : 0;
        dogRig.position.y = hop;
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

        const swell = smoothstep(yes, yes + 0.4, t) * (1 - smoothstep(yes + 1.4, yes + 2.6, t));
        glow.intensity = risen * (1.15 + 2.4 * swell);
      },
    };
  },
};

// Wide bunting: a ribbon with chunky cut letters and a row of pennants. Blank of any
// generated text — the word is painted here so it stays readable.
function paintYesBanner(paper, FONT, C, rng) {
  const W = 1600;
  const H = 360;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  const ink = '#2b2622';
  const top = 22;
  const bot = 214;
  const pennantColors = [C.tomato, C.cream, ink, C.blush, C.mustard, C.tomato, C.cream, ink, C.blush, C.mustard, C.tomato];
  const count = pennantColors.length;
  const left = 118;
  const right = W - 118;
  const step = (right - left) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = left + i * step;
    const pw = 86;
    const ph = 122;
    ctx.beginPath();
    ctx.moveTo(x - pw / 2, bot - 18);
    ctx.lineTo(x + pw / 2, bot - 18);
    ctx.lineTo(x, bot - 18 + ph);
    ctx.closePath();
    ctx.fillStyle = pennantColors[i];
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  // Swallowtail ribbon. Forked ends sit inside the canvas so the die-cut border fits.
  ctx.beginPath();
  ctx.moveTo(54, top + 36);
  ctx.lineTo(108, top);
  ctx.quadraticCurveTo(W / 2, top - 10, W - 108, top);
  ctx.lineTo(W - 54, top + 36);
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
  ctx.moveTo(28, top + 6);
  ctx.quadraticCurveTo(W / 2, top - 8, W - 28, top + 6);
  ctx.strokeStyle = '#b08968';
  ctx.lineWidth = 4;
  ctx.stroke();
  const font = (size) => `${size}px ${FONT.display}`;
  const size = fitSize(ctx, 'YES!', font, 168, W * 0.62);
  cutWord(ctx, 'YES!', W / 2, (top + bot) / 2 + 10, size, FONT, [C.tomato, ink, C.mustard, C.tomato], rng);
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

function cutWord(ctx, text, cx, cy, px, FONT, colors, rng) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.font = `${px}px ${FONT.display}`;
  const gap = px * 0.04;
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + gap;
  total -= gap;
  let x = cx - total / 2;
  let i = 0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(x + w / 2, cy);
    ctx.rotate((rng.next() - 0.5) * 0.1);
    ctx.lineWidth = px * 0.16;
    ctx.strokeStyle = '#2b2622';
    ctx.strokeText(ch, -w / 2, 0);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillText(ch, -w / 2, 0);
    ctx.restore();
    x += w + gap;
    i++;
  }
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
  return { geo: new THREE.PlaneGeometry(0.038, 0.058), mat };
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

function buildBits(THREE, paper, rng, parent, confetti, hearts, C) {
  const colors = [C.tomato, '#2b2622', C.cream, C.mustard, '#fbf7ee', C.blush];
  const geo = new THREE.PlaneGeometry(0.052, 0.078);
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
      delay: rng.next() * 0.45,
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
  const hGeo = new THREE.PlaneGeometry(0.1, 0.1);
  const hMatBase = { map: heart, transparent: true, depthWrite: false, toneMapped: false };
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({ ...hMatBase, color: i % 2 ? C.blush : C.tomato });
    const mesh = new THREE.Mesh(hGeo, mat);
    mesh.name = 'heart';
    mesh.castShadow = false;
    const piece = {
      mesh,
      x0: -0.35 + rng.next() * 1.6,
      z0: -0.25 + rng.next() * 0.7,
      phase: rng.next() * 6,
      delay: 0.1 + rng.next() * 0.55,
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
    if (age < p.T) {
      const arc = p.vy * age - 0.5 * p.g * age * age;
      mesh.position.set(p.x0 + p.vx * age, arc > 0.07 ? arc : 0.07, p.z0 + p.vz * age);
      mesh.rotation.z = p.rot + p.spin * age;
    } else {
      mesh.position.set(p.x1, 0.07, p.z1);
      mesh.rotation.z = p.rot + p.spin * p.T;
    }
  }
  for (let i = 0; i < hearts.length; i++) {
    const p = hearts[i];
    const age = t - yes - p.delay;
    const y = age > 0 ? 0.09 + Math.min(1.05, age * 0.4) : 0.09;
    p.mesh.position.set(p.x0 + Math.sin(t * 1.4 + p.phase) * 0.06, y, p.z0);
    p.mesh.material.opacity = age <= 0 ? 0 : Math.max(0, 1 - y / 1.2);
    p.mesh.rotation.z = Math.sin(t * 1.1 + p.phase) * 0.2;
  }
}

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}
