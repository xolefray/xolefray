// Spread 6 — "February 6, 2027". The book stays open: the garden keeps twinkling
// under the end card until DURATION. Times come from timeline.BEATS / SPREADS / END_CARD.
// Drawings: characters cycle "wedding", dog-bowtie, and love-story/art/wedding/.
// update() allocates nothing.
import { photoPrint, PHOTO_ASPECT } from '../photos.js';

const GAMMA = 1.78; // one mountain angle — arch and trees stay parallel, so they never cross
const COUPLE_H = 1.62;
const COUPLE_X = 1.76; // right page, front half, under the arch
const COUPLE_Z = 0.56;

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

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export default {
  id: 'wedding',
  title: 'February 6, 2027',
  build(ctx) {
    const { THREE, paper, popup, rng, photos, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, END_CARD, NARRATION, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'wedding');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'wedding';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const n25 = NARRATION.find((n) => n.id === 'n25');
    const loveDate = n25 ? n25.start : BEATS.notSunday;

    // ---------------------------------------------------------------- pages
    const letterRibbon = (ctx2, w, h) => {
      ctx2.save();
      ctx2.translate(w * 0.26, h * 0.52);
      ctx2.rotate(-0.06);
      const rw = w * 0.42;
      const rh = h * 0.07;
      ctx2.fillStyle = '#f7e7ea';
      ctx2.strokeStyle = '#e7b4c0';
      ctx2.lineWidth = 3;
      ctx2.beginPath();
      ctx2.roundRect(-rw / 2, -rh / 2, rw, rh, rh * 0.45);
      ctx2.fill();
      ctx2.stroke();
      ctx2.fillStyle = '#f0c9d2';
      ctx2.beginPath();
      ctx2.moveTo(-rw / 2, -rh * 0.32);
      ctx2.lineTo(-rw / 2 - rh * 0.7, 0);
      ctx2.lineTo(-rw / 2, rh * 0.32);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.moveTo(rw / 2, -rh * 0.32);
      ctx2.lineTo(rw / 2 + rh * 0.7, 0);
      ctx2.lineTo(rw / 2, rh * 0.32);
      ctx2.fill();
      const font = (size) => `700 ${size}px ${FONT.hand}`;
      const size = fitSize(ctx2, 'save the date', font, Math.round(h * 0.048), rw * 0.86);
      ctx2.font = font(size);
      ctx2.fillStyle = '#9d3a4a';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText('save the date', 0, rh * 0.04);
      ctx2.restore();
    };

    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const L = cloneCanvas(paper, art.canvas('page-left'));
      letterRibbon(L.ctx, L.canvas.width, L.canvas.height);
      leftArt = L.canvas;
      rightArt = art.canvas('page-right');
    } else {
      const floor = (ctx2, w, h, gutterRight) => {
        ctx2.fillStyle = '#d7e6c4';
        ctx2.fillRect(0, 0, w, h);
        ctx2.fillStyle = '#f4c9cf';
        const n = 18;
        for (let i = 0; i < n; i++) {
          const x = gutterRight ? w * (0.08 + (i % 6) * 0.04) : w * (0.55 + (i % 5) * 0.07);
          const y = h * (0.12 + (i * 0.047) % 0.8);
          ctx2.beginPath();
          ctx2.ellipse(x, y, 9, 6, i, 0, Math.PI * 2);
          ctx2.fill();
        }
      };
      leftArt = paper.page((ctx2, w, h) => {
        floor(ctx2, w, h, false);
        letterRibbon(ctx2, w, h);
      }, { seed: 6, tint: '#e7f0d8' });
      rightArt = paper.page((ctx2, w, h) => floor(ctx2, w, h, true), { seed: 7, tint: '#e7f0d8' });
    }

    // ---------------------------------------------------------------- mechanisms
    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };

    const fitWidth = (z0, height, width) => {
      let w = width;
      for (let i = 0; i < 10; i++) {
        if (popup.vFoldLimits({ z0, gamma: GAMMA, width: w, height }).fits) return w;
        w *= 0.96;
      }
      return w;
    };

    // Trees sit further back; the floral arch is the same gamma, a little nearer the reader.
    const treesH = 2.18;
    const treesZ = -0.9;
    const tInfo = info('trees-backdrop');
    const treesNat = treesH * (tInfo ? tInfo.w / tInfo.h : 1.94);
    const treesW = fitWidth(treesZ, treesH, Math.max(treesNat, 5.05));
    const trees = track(popup.vFold({ z0: treesZ, gamma: GAMMA, width: treesW, height: treesH }));

    const paintDate = (ctx2, w, h) => {
      const text = 'FEBRUARY 6, 2027';
      const font = (size) => `${size}px ${FONT.display}`;
      const size = fitSize(ctx2, text, font, Math.round(h * 0.078), w * 0.46);
      ctx2.font = font(size);
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.lineJoin = 'round';
      // Center of the arch's cream swag. The trees' pennants sit behind that crown.
      const y = h * 0.255;
      ctx2.lineWidth = Math.max(6, size * 0.2);
      ctx2.strokeStyle = '#fff8ee';
      ctx2.strokeText(text, w * 0.5, y);
      ctx2.fillStyle = '#9a3d48';
      ctx2.fillText(text, w * 0.5, y);
    };

    if (tInfo) {
      mountSplit(paper, trees, art.canvas('trees-backdrop'), treesW, treesH, 'trees-backdrop');
    } else {
      const flat = paper.paint(1200, 560, (ctx2, w, h) => {
        ctx2.fillStyle = '#f3c98a';
        ctx2.fillRect(16, 16, w - 32, h - 32);
        ctx2.fillStyle = '#7fb069';
        ctx2.fillRect(16, h * 0.78, w - 32, h * 0.18);
        paintDate(ctx2, w, h);
      }, { dieCut: 0, seed: 3 });
      mountSplit(paper, trees, flat, treesW, treesH, 'trees-backdrop');
    }

    const archH = 2.06;
    const archZ = -0.52;
    const aInfo = info('arch');
    const archNat = archH * (aInfo ? aInfo.w / aInfo.h : 2);
    const archW = fitWidth(archZ, archH, Math.max(archNat, 4.25));
    const arch = track(popup.vFold({ z0: archZ, gamma: GAMMA, width: archW, height: archH }));
    if (aInfo) {
      const painted = cloneCanvas(paper, art.canvas('arch'));
      paintDate(painted.ctx, painted.canvas.width, painted.canvas.height);
      mountSplit(paper, arch, painted.canvas, archW, archH, 'arch');
    } else {
      const flat = paper.paint(1000, 500, (ctx2, w, h) => {
        ctx2.strokeStyle = '#7d9a62';
        ctx2.lineWidth = 28;
        ctx2.beginPath();
        ctx2.moveTo(w * 0.12, h * 0.92);
        ctx2.lineTo(w * 0.12, h * 0.42);
        ctx2.quadraticCurveTo(w * 0.5, h * 0.02, w * 0.88, h * 0.42);
        ctx2.lineTo(w * 0.88, h * 0.92);
        ctx2.stroke();
        paintDate(ctx2, w, h);
      }, { dieCut: 8, seed: 4 });
      mountSplit(paper, arch, flat, archW, archH, 'arch');
    }

    // Lanterns hang in the arch opening, split on the same fold.
    const lanternRigs = [];
    let lanternH = 0;
    if (has('lantern-string')) {
      const meta = art.info('lantern-string');
      const lanternW = Math.min(archW * 0.78, 3.5);
      lanternH = lanternW * meta.h / meta.w;
      const y = Math.max(0.15, archH * 0.8 - lanternH);
      // Keep the closed thickness under the fold test (page normal < 0.045).
      const halves = mountSplit(paper, arch, art.canvas('lantern-string'), lanternW, lanternH, 'lantern-string', y, 0.012);
      lanternRigs.push(halves.left, halves.right);
    }

    // ---------------------------------------------------------------- couple (one card — the drawings are a pair)
    const couple = track(popup.standUp({
      side: 'right', x: COUPLE_X, z: COUPLE_Z, fold: 'back', width: 1.15, height: COUPLE_H,
    }));
    const coupleRig = new THREE.Group();
    coupleRig.name = 'couple';
    couple.mount.add(coupleRig);

    const cycle = characters && characters.cycle ? characters.cycle('wedding') : [];
    const flip = cycle.length
      ? characterArt.characterFlip(paper, characters, cycle, { height: COUPLE_H })
      : null;
    let coupleSpreadX = COUPLE_X - 0.28;
    if (flip) {
      coupleRig.add(flip.group);
      const ref = characters.info(cycle[0]);
      const s = ref ? COUPLE_H / ref.h : 1;
      if (ref) coupleSpreadX = COUPLE_X + ((ref.w / 2) - ref.feet[0]) * s;
      // characterCard plants the feet, so the canvas (and its paper margin) hangs
      // below the hinge. Lift each frame until the canvas bottom sits on the glue line.
      const frames = flip.group.children;
      for (let i = 0; i < frames.length; i++) {
        const meta = characters.info(cycle[i]);
        if (!meta) continue;
        frames[i].position.y = (meta.h - meta.feet[1]) * s;
        frames[i].name = cycle[i];
      }
    } else {
      const add = (who, x, facing) => {
        let card = null;
        try {
          card = figures.figureCard(paper, who, { outfit: 'wedding', pose: 'stand', facing, scale: 0.78 });
        } catch {
          card = null;
        }
        if (!card) return;
        card.position.x = x;
        if (card.userData && card.userData.baseline) card.position.y = -card.userData.baseline;
        card.name = `${who}-wedding`;
        coupleRig.add(card);
      };
      add('her', -0.34, 'right');
      add('him', 0.28, 'left');
    }

    // "They love that date." — a small heart over the couple.
    const loveHeart = makeHeartMesh(THREE, paper, 0.24);
    loveHeart.name = 'love-heart';
    loveHeart.position.set(-0.05, COUPLE_H * 0.92, 0.03);
    loveHeart.scale.setScalar(0.001);
    coupleRig.add(loveHeart);

    // ---------------------------------------------------------------- dog, beside Brian (outer side of the right page)
    const dogH = 0.5;
    const dog = track(popup.standUp({
      side: 'right', x: 2.42, z: 0.9, fold: 'back', width: 0.36, height: dogH,
    }));
    const dogRig = new THREE.Group();
    dogRig.name = 'dog';
    dog.mount.add(dogRig);
    placeDog(characterArt, paper, characters, figures, dogRig, 'dog-bowtie', dogH);

    // ---------------------------------------------------------------- chairs, easel + print, flowers, cake, calendar
    const chairH = 0.74;
    placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'chairs-left', side: 'left', x: 1.95, z: -0.42, height: chairH, name: 'chairs-left',
    });
    placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'chairs-right', side: 'right', x: 2.15, z: -0.5, height: 0.7, name: 'chairs-right',
    });

    const easelH = 1.16;
    const easel = track(popup.standUp({
      side: 'left', x: 2.52, z: 0.12, fold: 'back', width: 0.62, height: easelH,
    }));
    easel.mount.name = 'easel';
    if (has('easel')) addProp(characterArt, paper, art, easel.mount, 'easel', easelH, 0, 0);

    const shot = photoPrint(photos ? photos.cover : null, {
      width: 640,
      style: 'print',
      caption: 'us',
      tape: false,
      tilt: 0,
      aspect: PHOTO_ASPECT.cover,
      seed: 6,
    });
    const photoRatio = shot.height / shot.width;
    let photoH = 0.84;
    let photoW = photoH / photoRatio;
    const photoLim = popup.standUpLimits({ x: 2.52, z: 0.12, width: photoW, fold: 'back' });
    if (photoH > photoLim.maxHeight) {
      photoH = photoLim.maxHeight * 0.96;
      photoW = photoH / photoRatio;
    }
    const photoPivot = new THREE.Group();
    photoPivot.name = 'photo';
    const photoCard = paper.card({
      canvas: paper.dieCut(shot, { margin: 4 }),
      width: photoW,
      height: photoH,
      anchor: 'bottom-center',
    });
    photoPivot.add(photoCard);
    photoPivot.position.set(0, easelH * 0.3, 0.02);
    easel.mount.add(photoPivot);

    const flowerRigs = [];
    flowerRigs.push(placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'flower-pots', side: 'left', x: 3.12, z: 0.62, height: 0.9, name: 'flowers-left',
    }));
    flowerRigs.push(placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'flower-pots', side: 'right', x: 3.16, z: 0.28, height: 0.86, flip: true, name: 'flowers-right',
    }));

    placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'cake', side: 'right', x: 3.05, z: 1.08, height: 0.7, name: 'cake',
    });

    // Desk calendar. The block is blank; the month and the two dates are painted here.
    // SUN 7's cross and SAT 6's heart are separate sprites so the strokes can draw on.
    const calH = 1.02;
    const calX = 2.78;
    const calZ = 0.16;
    const cal = track(popup.standUp({
      side: 'right', x: calX, z: calZ, fold: 'back', width: 1.06, height: calH,
    }));
    cal.mount.name = 'calendar';
    const calCanvas = has('desk-calendar')
      ? cloneCanvas(paper, art.canvas('desk-calendar')).canvas
      : paper.paint(640, 640, (ctx2, w, h) => {
        ctx2.fillStyle = '#f3e6cf';
        ctx2.fillRect(24, 24, w - 48, h - 48);
      }, { dieCut: 0, seed: 8 });
    const calPainted = cloneCanvas(paper, calCanvas);
    paintCalendar(calPainted.ctx, calPainted.canvas.width, calPainted.canvas.height, FONT, C);
    const calW = calH * (calPainted.canvas.width / calPainted.canvas.height);
    const calCard = paper.card({
      canvas: paper.dieCut(calPainted.canvas, { margin: 6 }),
      width: calW,
      height: calH,
      anchor: 'bottom-center',
    });
    calCard.name = 'desk-calendar';
    cal.mount.add(calCard);

    const markW = calW * 0.34;
    const cross = makeCross(THREE, paper, markW);
    cross.name = 'sunday-cross';
    cross.position.set((0.66 - 0.5) * calW, (1 - 0.56) * calH, 0.02);
    cross.scale.setScalar(0.001);
    calCard.add(cross);
    const heartMark = makeHeartRing(THREE, paper, markW * 1.15);
    heartMark.name = 'saturday-heart';
    heartMark.position.set((0.32 - 0.5) * calW, (1 - 0.55) * calH, 0.02);
    heartMark.scale.setScalar(0.001);
    calCard.add(heartMark);

    // ---------------------------------------------------------------- ribbon timeline along the front edge
    const ribH = 0.38;
    const ribLZ = 1.22;
    const ribL = mountRibbon(THREE, track, popup, paper, FONT, C, rng, {
      side: 'left', x: 1.42, z: ribLZ, width: 1.95, height: ribH, which: 'left',
    });
    const ribR = mountRibbon(THREE, track, popup, paper, FONT, C, rng, {
      side: 'right', x: 1.5, z: ribLZ, width: 2.15, height: ribH, which: 'right',
    });

    // ---------------------------------------------------------------- petals, hearts, twinkles
    const scatterL = track(popup.onPage({ side: 'left', x: 1.55, z: 0.35, lift: 0.006 }));
    const scatterR = track(popup.onPage({ side: 'right', x: 1.7, z: 0.45, lift: 0.006 }));
    const bitsL = new THREE.Group();
    bitsL.name = 'petals-left';
    scatterL.mount.add(bitsL);
    const bitsR = new THREE.Group();
    bitsR.name = 'petals-right';
    scatterR.mount.add(bitsR);

    const petalGeo = new THREE.PlaneGeometry(0.15, 0.22);
    const heartGeo = new THREE.PlaneGeometry(0.2, 0.18);
    const petals = [];
    const floatHearts = [];
    const petalMatA = spriteMat(THREE, paper, paintPetal(paper, '#e8788c'));
    const petalMatB = spriteMat(THREE, paper, paintPetal(paper, '#f6c2c8'));
    const floatHeartMat = spriteMat(THREE, paper, paintHeart(paper, '#e2574c'));
    addFloater(THREE, bitsL, petals, petalGeo, petalMatA, rng, 3, -0.55, 0.7);
    addFloater(THREE, bitsR, petals, petalGeo, petalMatB, rng, 3, -0.4, 1.15);
    addFloater(THREE, bitsL, floatHearts, heartGeo, floatHeartMat, rng, 1, -0.2, 0.35);
    addFloater(THREE, bitsR, floatHearts, heartGeo, floatHeartMat, rng, 2, -0.2, 0.9);

    const twinkles = [];
    const starMat = spriteMat(THREE, paper, paintStar(paper), true);
    const starGeo = new THREE.PlaneGeometry(0.16, 0.16);
    addTwinkles(THREE, arch, twinkles, starGeo, starMat, archW, archH, 4);
    if (lanternRigs.length && lanternH > 0) {
      const half = (lanternRigs[0].userData && lanternRigs[0].userData.halfW) || 1.2;
      addLanternGlows(THREE, lanternRigs, twinkles, starGeo, starMat, half, lanternH);
    }

    const glow = new THREE.PointLight('#ffd7a8', 0, 6.5, 1.6);
    glow.name = 'wedding-glow';
    glow.castShadow = false;
    glow.position.set(0.4, 1.55, 0.35);
    group.add(glow);

    let shown = 0;
    const celebrate = BEATS.celebrate;
    const notSunday = BEATS.notSunday;
    const forever = BEATS.walmartToForever;
    const weddingDate = BEATS.weddingDate;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 1.6, at: [0, 1.05, 0], size: 7.5, from: 'front' },
        { t: weddingDate + 0.5, hold: 6.4, at: [coupleSpreadX, 0.95, COUPLE_Z], size: 3.0, from: 'front' },
        { t: notSunday + 0.2, hold: 2.6, at: [calX, calH * 0.5, calZ], size: 1.8, from: 'right' },
        { t: forever + 0.2, hold: 2.5, at: [0.15, 0.32, ribLZ], size: 5.0, from: 'low' },
        { t: celebrate + 0.2, hold: 2.8, at: [coupleSpreadX, 1.0, COUPLE_Z], size: 2.2, from: 'front' },
        { t: BEATS.endCard, hold: END_CARD.end - END_CARD.start, at: [0, 1.2, 0], size: 7.5, from: 'high' },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const risen = popup.rise(alpha);
        const fade = 1 - smoothstep(END_CARD.fadeStart, END_CARD.end, t);

        const frame = t >= celebrate ? 1 : 0;
        if (flip && frame !== shown) {
          flip.show(frame);
          shown = frame;
        }
        const pop = bump(t, weddingDate) * 0.65 + bump(t, celebrate);
        const breathe = 1 + Math.sin(t * 1.45) * 0.012;
        coupleRig.scale.set(breathe * (1 - 0.06 * pop), breathe * (1 + 0.1 * pop), 1);
        coupleRig.position.y = Math.sin(t * 1.45) * 0.008 * risen;

        const loveU = smoothstep(loveDate, loveDate + 0.45, t);
        let loveS = ease.outBack(clamp01(loveU));
        if (loveS < 0) loveS = 0;
        loveHeart.scale.setScalar(Math.max(0.001, loveS) * (1 + Math.sin(t * 2.2) * 0.06));
        loveHeart.position.y = COUPLE_H * 0.92 + Math.sin(t * 1.8) * 0.02 * loveS;

        const ht = t - celebrate;
        let hop = 0;
        if (ht > 0 && ht < 2.6) hop = Math.abs(Math.sin(ht * 7.2)) * (1 - ht / 2.6) * 0.2;
        const idle = Math.sin(t * 2.5) * 0.012;
        dogRig.position.y = (hop + idle) * risen;
        dogRig.scale.y = 1 + hop * 2.2;
        dogRig.rotation.z = Math.sin(t * 2.5) * 0.03 * risen;

        for (let i = 0; i < flowerRigs.length; i++) {
          const rig = flowerRigs[i];
          if (!rig) continue;
          rig.rotation.z = Math.sin(t * 1.15 + i * 1.7) * 0.025 * risen;
        }
        for (let i = 0; i < lanternRigs.length; i++) {
          lanternRigs[i].rotation.z = Math.sin(t * 1.25 + i) * 0.018 * risen;
        }

        const mark = smoothstep(notSunday, notSunday + 0.5, t);
        let xs = ease.outBack(clamp01(mark));
        if (xs < 0) xs = 0;
        else if (xs > 1.06) xs = 1.06;
        cross.scale.setScalar(Math.max(0.001, xs));
        const hu = smoothstep(notSunday + 0.16, notSunday + 0.72, t);
        let hs = ease.outBack(clamp01(hu));
        if (hs < 0) hs = 0;
        else if (hs > 1.06) hs = 1.06;
        heartMark.scale.setScalar(Math.max(0.001, hs));
        heartMark.rotation.z = Math.sin(t * 1.6) * 0.04 * hs;

        const uL = ease.outCubic(smoothstep(forever, forever + 0.7, t));
        const uR = ease.outCubic(smoothstep(forever + 0.22, forever + 1.05, t));
        ribL.pivot.scale.x = Math.max(0.001, uL);
        ribR.pivot.scale.x = Math.max(0.001, uR);

        const born = smoothstep(celebrate, celebrate + 1.15, t);
        bitsL.scale.setScalar(risen);
        bitsR.scale.setScalar(risen);
        poseFloaters(petals, t, born, 0.9);
        poseFloaters(floatHearts, t, born, 1.25);

        const party = smoothstep(celebrate, celebrate + 0.55, t);
        const dateFlash = bump(t, weddingDate);
        for (let i = 0; i < twinkles.length; i++) {
          const tw = twinkles[i];
          const pulse = 0.62 + 0.38 * Math.sin(t * tw.freq + tw.phase);
          tw.mesh.scale.setScalar(tw.base * pulse * (1 + 0.85 * party + 0.7 * dateFlash));
        }

        glow.intensity = risen * fade * (0.65 + 1.15 * party + 0.45 * dateFlash);
      },
    };
  },
};

function mountSplit(paper, mech, canvas, width, height, name, y = 0, z = 0) {
  const cut = canvas.width ? paper.dieCut(canvas, { margin: 8 }) : canvas;
  const halves = paper.splitCard({ canvas: cut, width, height });
  halves.left.name = `${name}-left`;
  halves.right.name = `${name}-right`;
  halves.left.position.set(0, y, z);
  halves.right.position.set(0, y, z);
  halves.left.userData.halfW = width / 2;
  halves.right.userData.halfW = width / 2;
  mech.left.add(halves.left);
  mech.right.add(halves.right);
  return halves;
}

function addProp(characterArt, paper, art, mount, id, height, x, z, flip) {
  const card = characterArt.characterCard(paper, art, id, { height, flip: !!flip });
  if (!card) return null;
  const meta = art.info(id);
  const s = height / meta.h;
  card.position.set(x, (meta.h - meta.feet[1]) * s, z);
  card.name = id;
  mount.add(card);
  return card;
}

function placeStand(THREE, track, popup, characterArt, paper, art, opts) {
  const meta = art && art.has && art.has(opts.id) ? art.info(opts.id) : null;
  let height = opts.height;
  let width = meta ? height * (meta.w / meta.h) : height * 0.7;
  const lim = popup.standUpLimits({ x: opts.x, z: opts.z, width, fold: 'back' });
  const maxW = lim.maxWidth * 0.96;
  if (width > maxW && width > 0) {
    height *= maxW / width;
    width = maxW;
  }
  const lim2 = popup.standUpLimits({ x: opts.x, z: opts.z, width, fold: 'back' });
  if (height > lim2.maxHeightLoose * 0.96) height = lim2.maxHeightLoose * 0.96;
  const mech = track(popup.standUp({
    side: opts.side, x: opts.x, z: opts.z, fold: 'back', width, height,
  }));
  const rig = new THREE.Group();
  rig.name = opts.name;
  mech.mount.add(rig);
  if (meta) addProp(characterArt, paper, art, rig, opts.id, height, 0, 0, opts.flip);
  return rig;
}

function placeDog(characterArt, paper, characters, figures, rig, id, height) {
  let card = null;
  if (characters && characters.has && characters.has(id)) {
    card = characterArt.characterCard(paper, characters, id, { height });
  } else if (figures && figures.figureCard) {
    try {
      card = figures.figureCard(paper, 'chihuahua', { pose: 'sit', accessory: 'bowtie', scale: height / 0.32 });
    } catch {
      card = null;
    }
  }
  if (!card) return null;
  if (characters && characters.info) {
    const meta = characters.info(id);
    if (meta && meta.h) card.position.y = (meta.h - meta.feet[1]) * (height / meta.h);
  }
  card.name = id;
  rig.add(card);
  return card;
}

function paintCalendar(ctx, w, h, FONT, C) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const display = (size) => `${size}px ${FONT.display}`;
  const hand = (size) => `700 ${size}px ${FONT.hand}`;
  ctx.fillStyle = '#8d3d45';
  ctx.font = display(fitSize(ctx, 'FEB 2027', display, Math.round(h * 0.1), w * 0.7));
  ctx.fillText('FEB 2027', w * 0.46, h * 0.2);
  ctx.fillStyle = C.ink;
  ctx.font = hand(Math.round(h * 0.065));
  ctx.fillText('SAT', w * 0.32, h * 0.4);
  ctx.fillText('SUN', w * 0.66, h * 0.4);
  ctx.font = display(Math.round(h * 0.15));
  ctx.fillStyle = '#c4473b';
  ctx.fillText('6', w * 0.32, h * 0.56);
  ctx.fillStyle = C.ink;
  ctx.fillText('7', w * 0.66, h * 0.56);
  ctx.font = hand(fitSize(ctx, 'our anniversary — almost!', hand, Math.round(h * 0.05), w * 0.78));
  ctx.fillStyle = '#8a5a4a';
  ctx.fillText('our anniversary — almost!', w * 0.46, h * 0.8);
}

function mountRibbon(THREE, track, popup, paper, FONT, C, rng, opts) {
  const canvas = paper.paint(opts.which === 'left' ? 980 : 1100, 280, (ctx, w, h) => {
    drawRibbon(ctx, w, h, FONT, C, rng, opts.which);
  }, { dieCut: 8, seed: opts.which === 'left' ? 11 : 12 });
  const mech = track(popup.standUp({
    side: opts.side, x: opts.x, z: opts.z, fold: 'back', width: opts.width, height: opts.height,
  }));
  mech.mount.name = `ribbon-${opts.which}`;
  // Scale about the start of the timeline: image-left, which is local −X.
  const pivot = new THREE.Group();
  pivot.position.x = -opts.width / 2;
  const card = paper.card({ canvas, width: opts.width, height: opts.height, anchor: 'bottom-center' });
  card.position.x = opts.width / 2;
  card.name = `ribbon-${opts.which}`;
  pivot.add(card);
  pivot.scale.x = 0.001;
  mech.mount.add(pivot);
  return { pivot, mech };
}

function drawRibbon(ctx, w, h, FONT, C, rng, which) {
  const ink = C.ink;
  ctx.fillStyle = '#f8e4ea';
  roundBand(ctx, w * 0.06, h * 0.38, w * 0.88, h * 0.3, h * 0.12);
  ctx.fill();
  ctx.strokeStyle = '#e7b4c0';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = C.mustard;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.53);
  ctx.lineTo(w * 0.9, h * 0.53);
  ctx.stroke();
  ctx.setLineDash([]);
  if (which === 'left') {
    drawVest(ctx, w * 0.3, h * 0.52, h * 0.34, C);
    drawPaw(ctx, w * 0.72, h * 0.52, h * 0.22, C);
  } else {
    drawHouse(ctx, w * 0.2, h * 0.52, h * 0.3, C);
    drawRing(ctx, w * 0.48, h * 0.52, h * 0.2, C);
    const font = (size) => `${size}px ${FONT.display}`;
    const size = fitSize(ctx, 'forever', font, Math.round(h * 0.28), w * 0.34);
    cutWord(ctx, 'forever', w * 0.76, h * 0.52, size, FONT, [C.tomato, ink, C.mustard, C.teal, C.blush, C.leaf, C.sky], rng);
  }
}

function roundBand(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawVest(ctx, x, y, s, C) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = C.vest;
  ctx.strokeStyle = '#163e96';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-s * 0.42, -s * 0.48, s * 0.84, s * 0.96, s * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.badge;
  ctx.fillRect(-s * 0.28, -s * 0.18, s * 0.56, s * 0.16);
  ctx.restore();
}

function drawPaw(ctx, x, y, s, C) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#c9844a';
  const pads = [[-0.42, -0.28], [-0.14, -0.5], [0.16, -0.5], [0.44, -0.26]];
  for (let i = 0; i < pads.length; i++) {
    ctx.beginPath();
    ctx.ellipse(pads[i][0] * s, pads[i][1] * s, s * 0.16, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, s * 0.12, s * 0.32, s * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHouse(ctx, x, y, s, C) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = C.tomato;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(s * 0.55, -s * 0.05);
  ctx.lineTo(-s * 0.55, -s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f6edd9';
  ctx.fillRect(-s * 0.38, -s * 0.05, s * 0.76, s * 0.55);
  ctx.fillStyle = C.teal;
  ctx.fillRect(-s * 0.1, s * 0.12, s * 0.2, s * 0.38);
  ctx.restore();
}

function drawRing(ctx, x, y, s, C) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = C.mustard;
  ctx.lineWidth = Math.max(3, s * 0.16);
  ctx.beginPath();
  ctx.arc(0, s * 0.08, s * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#8fd0ea';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(s * 0.16, -s * 0.28);
  ctx.lineTo(-s * 0.16, -s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function cutWord(ctx, text, cx, cy, px, FONT, colors, rng) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.font = `${px}px ${FONT.display}`;
  const gap = px * 0.06;
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + gap;
  total -= gap;
  let x = cx - total / 2;
  let i = 0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(x + w / 2, cy);
    ctx.rotate((rng.next() - 0.5) * 0.08);
    ctx.lineWidth = px * 0.18;
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

function makeCross(THREE, paper, size) {
  const canvas = paper.paint(256, 256, (ctx) => {
    ctx.strokeStyle = '#d64545';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(48, 48);
    ctx.lineTo(208, 208);
    ctx.moveTo(208, 48);
    ctx.lineTo(48, 208);
    ctx.stroke();
  }, { dieCut: 0, grain: 0, seed: 1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), spriteMat(THREE, paper, canvas));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function makeHeartRing(THREE, paper, size) {
  const canvas = paper.paint(256, 256, (ctx) => {
    ctx.strokeStyle = '#e2574c';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(128, 140, 78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e2574c';
    heartPath(ctx, 128, 78, 28);
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), spriteMat(THREE, paper, canvas));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function makeHeartMesh(THREE, paper, size) {
  const canvas = paper.paint(128, 128, (ctx) => {
    ctx.fillStyle = '#e2574c';
    heartPath(ctx, 64, 70, 36);
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 3 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.9), spriteMat(THREE, paper, canvas));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.45, x - s * 0.15, y - s * 0.95, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.15, y - s * 0.95, x + s, y - s * 0.45, x, y + s * 0.35);
  ctx.closePath();
}

function paintPetal(paper, color) {
  return paper.paint(64, 96, (ctx) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(32, 48, 18, 36, 0, 0, Math.PI * 2);
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 4 });
}

function paintHeart(paper, color) {
  return paper.paint(128, 120, (ctx) => {
    ctx.fillStyle = color;
    heartPath(ctx, 64, 72, 40);
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 5 });
}

function paintStar(paper) {
  return paper.paint(64, 64, (ctx) => {
    ctx.translate(32, 32);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 28 : 8;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 6 });
}

function spriteMat(THREE, paper, canvas, additive) {
  return new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
    toneMapped: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function addFloater(THREE, parent, list, geo, mat, rng, count, x0, x1) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.scale.setScalar(0.001);
    mesh.name = 'floater';
    parent.add(mesh);
    list.push({
      mesh,
      x: x0 + rng.next() * (x1 - x0),
      z: -0.35 + rng.next() * 0.7,
      phase: rng.next() * Math.PI * 2,
      spin: (rng.next() - 0.5) * 0.8,
      rise: 0.45 + rng.next() * 0.55,
    });
  }
}

function poseFloaters(list, t, born, lift) {
  // Scale from nothing so a spinning plane never dips through the page.
  const s = born > 0.001 ? born : 0.001;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const bob = Math.sin(t * 1.25 + p.phase) * 0.05;
    const y = s * (lift * p.rise + bob + 0.2);
    p.mesh.position.set(
      p.x + Math.sin(t * 0.65 + p.phase) * 0.05 * s,
      y,
      p.z,
    );
    p.mesh.rotation.z = p.phase + t * p.spin;
    p.mesh.scale.setScalar(s);
  }
}

function addTwinkles(THREE, arch, list, geo, mat, archW, archH, count) {
  const half = archW / 2;
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'twinkle';
    const leftSide = i < count / 2;
    const side = leftSide ? arch.left : arch.right;
    const u = 0.25 + (i % (count / 2)) * 0.4;
    const x = (leftSide ? -1 : 1) * half * u;
    mesh.position.set(x, archH * (0.78 - (i % 2) * 0.08), 0.012);
    side.add(mesh);
    list.push({ mesh, freq: 2.2 + (i % 3) * 0.45, phase: i * 1.3, base: 0.85 });
  }
}

function addLanternGlows(THREE, rigs, list, geo, mat, halfW, lanternH) {
  for (let s = 0; s < rigs.length; s++) {
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = 'lantern-glow';
      const sign = s === 0 ? -1 : 1;
      mesh.position.set(sign * halfW * (0.32 + i * 0.4), lanternH * 0.55, 0.012);
      rigs[s].add(mesh);
      list.push({ mesh, freq: 1.6 + s + i * 0.4, phase: s * 2 + i, base: 1.05 });
    }
  }
}
