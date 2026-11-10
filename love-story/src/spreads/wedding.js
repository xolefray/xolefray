// Spread 6 — "February 6, 2027". The book stays open: the garden keeps twinkling
// under the end card until DURATION. Times come from timeline.BEATS / SPREADS / END_CARD.
// Drawings: characters cycle "wedding", dog-bowtie, and love-story/art/wedding/.
// The couple is one V-fold on the arch's gamma: Marlin on the left half, Brian on the right,
// both wedding frames at one scale, swapped by showing one pair of halves.
// update() allocates nothing.
import { photoPrint, PHOTO_ASPECT } from '../photos.js';

const GAMMA = 1.78; // one mountain angle — arch, trees, couple and ribbon stay parallel
const COUPLE_BODY = 1.8; // feet to the top of the hair, world units
const COUPLE_Z = -0.55; // in front of the arch, centred on the gutter
const ARCH_Z = -0.9;
const ARCH_H = 2.42;
const ARCH_EXTRA = 336; // post extension below the drawing so the swag clears their heads
const RIB_Z = 0.36;
const RIB_H = 1.02; // icons are drawn at 0.45 inside this; "forever" is larger
const RIB_W = 5.4;

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

    // Trees sit behind the arch. Same gamma, so the planes never meet.
    const treesH = 2.08;
    const treesZ = -1.0;
    const tInfo = info('trees-backdrop');
    const treesNat = treesH * (tInfo ? tInfo.w / tInfo.h : 1.94);
    const treesW = fitWidth(treesZ, treesH, Math.min(Math.max(treesNat, 4.2), 4.55));
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

    // Posts are lengthened under the drawing so the centre swag sits above the couple.
    const archSrc = aInfoReady(art);
    const archBuilt = archSrc ? extendArch(paper, archSrc, ARCH_EXTRA) : null;
    const archPainted = archBuilt ? archBuilt.canvas : null;
    const archPxH = archPainted ? archPainted.height : 512;
    const archW = archPainted ? ARCH_H * (archPainted.width / archPxH) : 4.2;
    const archFit = fitPair(popup, ARCH_Z, ARCH_H, archW);
    const archH = archFit.h;
    const arch = track(popup.vFold({ z0: ARCH_Z, gamma: GAMMA, width: archFit.w, height: archH }));
    const swagPx = archSrc ? opaqueRun(archSrc, 0.5).bot : Math.round(512 * 0.32);
    const swagY = archH * (1 - (swagPx > 0 ? swagPx : 165) / archPxH);
    if (archBuilt) {
      paintDate(archBuilt.ctx, archPainted.width, archSrc.height);
      mountSplit(paper, arch, archPainted, archFit.w, archH, 'arch');
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
      mountSplit(paper, arch, flat, archFit.w, archH, 'arch');
    }

    // Lanterns hang in the arch opening, split on the same fold.
    const lanternRigs = [];
    let lanternH = 0;
    if (has('lantern-string')) {
      const meta = art.info('lantern-string');
      const lanternW = Math.min(archFit.w * 0.72, 2.4);
      lanternH = lanternW * meta.h / meta.w;
      // Hang in the opening, just under the swag, so the string frames the couple.
      const y = Math.max(0.2, swagY - lanternH - 0.02);
      // Keep the closed thickness under the fold test (page normal < 0.045).
      const halves = mountSplit(paper, arch, art.canvas('lantern-string'), lanternW, lanternH, 'lantern-string', y, 0.012);
      lanternRigs.push(halves.left, halves.right);
    }

    // ---------------------------------------------------------------- couple, straddling the gutter under the arch
    // The centre column of each drawing already runs between the two bodies
    // (Marlin left, Brian right), so paper.splitCard's midline is the fold.
    const couplePair = mountCouple(paper, characters, COUPLE_BODY);
    const coupleFit = fitPair(popup, COUPLE_Z, couplePair.height * 1.08, Math.max(couplePair.width, 1.1));
    const coupleScale = couplePair.height > coupleFit.h / 1.08 && couplePair.height > 0
      ? (coupleFit.h / 1.08) / couplePair.height
      : 1;
    const couple = track(popup.vFold({
      z0: COUPLE_Z,
      gamma: GAMMA,
      width: couplePair.width * coupleScale,
      height: couplePair.height * coupleScale,
    }));
    const leftRig = new THREE.Group();
    leftRig.name = 'couple-left';
    const rightRig = new THREE.Group();
    rightRig.name = 'couple-right';
    couple.left.add(leftRig);
    couple.right.add(rightRig);
    const pairs = [];
    if (couplePair.frames.length) {
      for (let i = 0; i < couplePair.frames.length; i++) {
        const frame = couplePair.frames[i];
        frame.left.scale.setScalar(coupleScale);
        frame.right.scale.setScalar(coupleScale);
        leftRig.add(frame.left);
        rightRig.add(frame.right);
        pairs.push(frame);
      }
    } else {
      mountFallbackCouple(figures, paper, leftRig, rightRig);
    }
    let shown = -1;
    const showPair = (index) => {
      if (!pairs.length) return;
      let i = index;
      if (i < 0) i = 0;
      if (i >= pairs.length) i = pairs.length - 1;
      if (i === shown) return;
      for (let k = 0; k < pairs.length; k++) {
        const on = k === i;
        pairs[k].left.visible = on;
        pairs[k].right.visible = on;
      }
      shown = i;
    };
    showPair(0);
    const coupleTop = couplePair.height * coupleScale;

    // "They love that date." — a small heart over the joined hands.
    const loveHeart = makeHeartMesh(THREE, paper, 0.28);
    loveHeart.name = 'love-heart';
    loveHeart.position.set(0.02, Math.max(0.4, coupleTop * 0.96), 0.01);
    loveHeart.scale.setScalar(0.001);
    rightRig.add(loveHeart);

    // ---------------------------------------------------------------- dog, right beside Brian
    const dogH = 0.5;
    const dogMeta = characters && characters.info ? characters.info('dog-bowtie') : null;
    const dogW = dogMeta && dogMeta.h ? dogH * (dogMeta.w / dogMeta.h) : 0.28;
    // Beside Brian, just in front of the ribbon so the banner cannot hide him.
    const dog = track(popup.standUp({
      side: 'right', x: 0.8, z: 0.32, fold: 'back', width: dogW, height: dogH,
    }));
    const dogRig = new THREE.Group();
    dogRig.name = 'dog';
    dog.mount.add(dogRig);
    placeDog(characterArt, paper, characters, figures, dogRig, 'dog-bowtie', dogH);

    // ---------------------------------------------------------------- garden around the aisle: chairs face the arch
    placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'chairs-left', side: 'left', x: 1.72, z: 0.02, height: 0.58, name: 'chairs-left',
    });
    placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'chairs-right', side: 'right', x: 1.82, z: -0.06, height: 0.55, name: 'chairs-right',
    });

    const easelH = 1.15;
    const easelX = 2.28;
    const easelZ = 0.68;
    const easel = track(popup.standUp({
      side: 'left', x: easelX, z: easelZ, fold: 'back', width: 0.58, height: easelH,
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
    let photoH = 0.72;
    let photoW = photoH / photoRatio;
    const photoLim = popup.standUpLimits({ x: easelX, z: easelZ, width: photoW, fold: 'back' });
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
      id: 'flower-pots', side: 'left', x: 2.85, z: -0.38, height: 1.02, name: 'flowers-left',
    }));
    flowerRigs.push(placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'flower-pots', side: 'left', x: 3.12, z: 0.92, height: 0.7, name: 'flowers-left-front',
    }));
    flowerRigs.push(placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'flower-pots', side: 'right', x: 2.2, z: -0.48, height: 0.88, flip: true, name: 'flowers-right',
    }));

    placeStand(THREE, track, popup, characterArt, paper, art, {
      id: 'cake', side: 'right', x: 2.35, z: 1.02, height: 0.74, name: 'cake',
    });

    // Desk calendar. The block is blank; the month and the two dates are painted here.
    // SUN 7's cross and SAT 6's heart are separate sprites so the strokes can draw on.
    // Fractions are centres on the cream face (the block's right edge is the wood side).
    const SAT = { x: 0.30, y: 0.50 };
    const SUN = { x: 0.64, y: 0.50 };
    let calH = 1.32;
    const calX = 2.88; // clear of the ribbon's "forever"
    const calZ = 0.46;
    const calCanvas = has('desk-calendar')
      ? cloneCanvas(paper, art.canvas('desk-calendar')).canvas
      : paper.paint(640, 640, (ctx2, w, h) => {
        ctx2.fillStyle = '#f3e6cf';
        ctx2.fillRect(24, 24, w - 48, h - 48);
      }, { dieCut: 0, seed: 8 });
    const calPainted = cloneCanvas(paper, calCanvas);
    paintCalendar(calPainted.ctx, calPainted.canvas.width, calPainted.canvas.height, FONT, C, SAT, SUN);
    const calAspect = calPainted.canvas.width / calPainted.canvas.height;
    let calW = calH * calAspect;
    const calLim0 = popup.standUpLimits({ x: calX, z: calZ, width: calW, fold: 'back' });
    if (calW > calLim0.maxWidth * 0.96) calW = calLim0.maxWidth * 0.96;
    const calLim = popup.standUpLimits({ x: calX, z: calZ, width: calW, fold: 'back' });
    if (calH > calLim.maxHeight * 0.96) {
      calH = calLim.maxHeight * 0.96;
      calW = calH * calAspect;
    }
    const cal = track(popup.standUp({
      side: 'right', x: calX, z: calZ, fold: 'back', width: calW, height: calH,
    }));
    cal.mount.name = 'calendar';
    const calCard = paper.card({
      canvas: paper.dieCut(calPainted.canvas, { margin: 6 }),
      width: calW,
      height: calH,
      anchor: 'bottom-center',
    });
    calCard.name = 'desk-calendar';
    cal.mount.add(calCard);

    const markW = calW * 0.46;
    const cross = makeCross(THREE, paper, markW * 0.86);
    cross.name = 'sunday-cross';
    cross.position.set((SUN.x - 0.5) * calW, (1 - SUN.y) * calH, 0.02);
    cross.scale.setScalar(0.001);
    calCard.add(cross);
    const heartMark = makeHeartRing(THREE, paper, markW);
    heartMark.name = 'saturday-heart';
    heartMark.position.set((SAT.x - 0.5) * calW, (1 - SAT.y) * calH + calH * 0.02, 0.02);
    heartMark.scale.setScalar(0.001);
    calCard.add(heartMark);

    // ---------------------------------------------------------------- ribbon across the front of both pages
    const rib = mountRibbon(THREE, track, popup, paper, FONT, C, rng);

    // ---------------------------------------------------------------- petals, hearts, twinkles
    const scatterL = track(popup.onPage({ side: 'left', x: 1.15, z: 0.12, lift: 0.006 }));
    const scatterR = track(popup.onPage({ side: 'right', x: 1.2, z: 0.16, lift: 0.006 }));
    const bitsL = new THREE.Group();
    bitsL.name = 'petals-left';
    scatterL.mount.add(bitsL);
    const bitsR = new THREE.Group();
    bitsR.name = 'petals-right';
    scatterR.mount.add(bitsR);

    const petalGeo = new THREE.PlaneGeometry(0.22, 0.32);
    const heartGeo = new THREE.PlaneGeometry(0.24, 0.22);
    const petals = [];
    const floatHearts = [];
    const petalMatA = spriteMat(THREE, paper, paintPetal(paper, '#e8788c'));
    const petalMatB = spriteMat(THREE, paper, paintPetal(paper, '#f6c2c8'));
    const floatHeartMat = spriteMat(THREE, paper, paintHeart(paper, '#e2574c'));
    addFloater(THREE, bitsL, petals, petalGeo, petalMatA, rng, 3, -0.85, 0.7);
    addFloater(THREE, bitsR, petals, petalGeo, petalMatB, rng, 3, -0.75, 1.15);
    addFloater(THREE, bitsL, floatHearts, heartGeo, floatHeartMat, rng, 1, -0.4, 0.45);
    addFloater(THREE, bitsR, floatHearts, heartGeo, floatHeartMat, rng, 1, -0.35, 0.85);

    const twinkles = [];
    const starMat = spriteMat(THREE, paper, paintStar(paper), true);
    const starGeo = new THREE.PlaneGeometry(0.16, 0.16);
    addTwinkles(THREE, arch, twinkles, starGeo, starMat, archFit.w, archH, 4);
    if (lanternRigs.length && lanternH > 0) {
      const half = (lanternRigs[0].userData && lanternRigs[0].userData.halfW) || 1.2;
      addLanternGlows(THREE, lanternRigs, twinkles, starGeo, starMat, half, lanternH);
    }

    const glow = new THREE.PointLight('#ffd7a8', 0, 6.5, 1.6);
    glow.name = 'wedding-glow';
    glow.castShadow = false;
    glow.position.set(0, 1.65, COUPLE_Z + 0.2);
    group.add(glow);

    const celebrate = BEATS.celebrate;
    const notSunday = BEATS.notSunday;
    const forever = BEATS.walmartToForever;
    const weddingDate = BEATS.weddingDate;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 1.6, at: [0, 1.15, -0.15], size: 7.5, from: 'front' },
        { t: weddingDate + 0.5, hold: 6.4, at: [0, 1.05, COUPLE_Z], size: 3.0, from: 'front' },
        { t: notSunday + 0.2, hold: 2.8, at: [calX, calH * 0.52, calZ], size: 2.15, from: 'front' },
        { t: forever + 0.25, hold: 2.6, at: [0, 1.0, 0.0], size: 5, from: 'front' },
        { t: celebrate + 0.2, hold: 2.8, at: [0, 1.1, COUPLE_Z], size: 2.8, from: 'front' },
        { t: BEATS.endCard, hold: END_CARD.end - END_CARD.start, at: [0, 1.25, -0.2], size: 7.5, from: 'high' },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const risen = popup.rise(alpha);
        const fade = 1 - smoothstep(END_CARD.fadeStart, END_CARD.end, t);

        showPair(t >= celebrate ? 1 : 0);
        const pop = bump(t, weddingDate) * 0.65 + bump(t, celebrate);
        const breathe = 1 + Math.sin(t * 1.45) * 0.012;
        const sx = breathe * (1 - 0.05 * pop);
        const sy = breathe * (1 + 0.05 * pop);
        leftRig.scale.set(sx, sy, 1);
        rightRig.scale.set(sx, sy, 1);
        const bob = Math.sin(t * 1.45) * 0.008 * risen;
        leftRig.position.y = bob;
        rightRig.position.y = bob;

        const loveU = smoothstep(loveDate, loveDate + 0.45, t);
        let loveS = ease.outBack(clamp01(loveU));
        if (loveS < 0) loveS = 0;
        loveHeart.scale.setScalar(Math.max(0.001, loveS) * (1 + Math.sin(t * 2.2) * 0.06));
        loveHeart.position.y = coupleTop * 0.96 + Math.sin(t * 1.8) * 0.02 * loveS;

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
        const uR = ease.outCubic(smoothstep(forever + 0.28, forever + 1.15, t));
        rib.left.scale.x = Math.max(0.001, uL);
        rib.right.scale.x = Math.max(0.001, uR);

        const born = smoothstep(celebrate, celebrate + 1.15, t);
        bitsL.scale.setScalar(risen);
        bitsR.scale.setScalar(risen);
        poseFloaters(petals, t, born, 1.15);
        poseFloaters(floatHearts, t, born, 1.45);

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

function aInfoReady(art) {
  return art && art.has && art.has('arch') ? art.canvas('arch') : null;
}

function opaqueRun(canvas, xFrac) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(canvas.width * xFrac)));
  const { data, height } = ctx.getImageData(x, 0, 1, canvas.height);
  let top = -1;
  let bot = -1;
  for (let y = 0; y < height; y++) {
    if (data[y * 4 + 3] > 24) {
      if (top < 0) top = y;
      bot = y;
    }
  }
  return { top, bot };
}

// Repeat the plain column so the floral swag stays put and the plinth drops to the new foot.
function extendArch(paper, src, extra) {
  const sw = src.width;
  const sh = src.height;
  const footH = 48;
  const bandTop = 336;
  const bandBot = sh - footH;
  const bandH = bandBot - bandTop;
  const { canvas, ctx } = paper.makeCanvas(sw, sh + extra);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, sw, bandBot, 0, 0, sw, bandBot);
  const destBottom = sh + extra - footH;
  for (let y = bandBot; y < destBottom;) {
    const slice = Math.min(bandH, destBottom - y);
    ctx.drawImage(src, 0, bandTop, sw, slice, 0, y, sw, slice);
    y += slice;
  }
  ctx.drawImage(src, 0, sh - footH, sw, footH, 0, sh + extra - footH, sw, footH);
  return { canvas, ctx };
}

function fitPair(popup, z0, height, width) {
  let h = height;
  let w = width;
  for (let i = 0; i < 12; i++) {
    if (popup.vFoldLimits({ z0, gamma: GAMMA, width: w, height: h }).fits) return { w, h };
    h *= 0.98;
    w *= 0.98;
  }
  return { w, h };
}

function opaqueTop(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > 24) return y;
    }
  }
  return 0;
}

function cropToFeet(paper, src, feetY) {
  const bottom = Math.min(src.height, Math.ceil(feetY) + 12);
  const { canvas, ctx } = paper.makeCanvas(src.width, bottom);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, src.width, bottom, 0, 0, src.width, bottom);
  return canvas;
}

// Pad so `split` (a source column between the two bodies) becomes the canvas centre.
function centreOnColumn(paper, src, split) {
  const half = Math.max(split, src.width - split);
  const { canvas, ctx } = paper.makeCanvas(half * 2, src.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, half - split, 0);
  return canvas;
}

// Per frame: the seam between the faces. wedding-1's centre line cuts Brian's leaned-in head.
const COUPLE_SPLIT = { 'wedding-0': 317, 'wedding-1': 317 };

function mountCouple(paper, characters, bodyH) {
  const empty = { frames: [], width: 1.2, height: bodyH };
  const cycle = characters && characters.cycle ? characters.cycle('wedding') : [];
  if (!cycle.length) return empty;
  const refInfo = characters.info(cycle[0]);
  const refCanvas = characters.canvas(cycle[0]);
  if (!refInfo || !refCanvas || !(refInfo.feet && refInfo.feet[1] > 0)) return empty;
  const bodyPx = Math.max(1, refInfo.feet[1] - opaqueTop(refCanvas));
  const s = bodyH / bodyPx;
  const frames = [];
  let width = 0;
  let height = 0;
  for (let i = 0; i < cycle.length; i++) {
    const id = cycle[i];
    const info = characters.info(id);
    const src = characters.canvas(id);
    if (!info || !src) continue;
    const split = COUPLE_SPLIT[id] ?? Math.round(src.width / 2);
    const placed = centreOnColumn(paper, cropToFeet(paper, src, info.feet[1]), split);
    const cut = paper.dieCut(placed, { margin: 8 });
    const w = cut.width * s;
    const h = cut.height * s;
    const halves = paper.splitCard({ canvas: cut, width: w, height: h });
    halves.left.visible = false;
    halves.right.visible = false;
    halves.left.name = `${id}-left`;
    halves.right.name = `${id}-right`;
    frames.push(halves);
    if (w > width) width = w;
    if (h > height) height = h;
  }
  if (!frames.length) return empty;
  return { frames, width, height };
}

function mountFallbackCouple(figures, paper, leftRig, rightRig) {
  if (!figures || !figures.figureCard) return;
  let her = null;
  let him = null;
  try {
    her = figures.figureCard(paper, 'her', { outfit: 'wedding', pose: 'holdHandsL', facing: 'left', scale: 1.7 });
    him = figures.figureCard(paper, 'him', { outfit: 'wedding', pose: 'holdHandsR', scale: 1.55 });
  } catch {
    return;
  }
  if (her) {
    her.position.set(-0.02, 0, 0);
    leftRig.add(her);
  }
  if (him) {
    him.position.set(0.02, 0, 0);
    rightRig.add(him);
  }
}

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

function paintCalendar(ctx, w, h, FONT, C, sat, sun) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const display = (size) => `${size}px ${FONT.display}`;
  const hand = (size) => `700 ${size}px ${FONT.hand}`;
  ctx.fillStyle = '#8d3d45';
  ctx.font = display(fitSize(ctx, 'FEB 2027', display, Math.round(h * 0.11), w * 0.72));
  ctx.fillText('FEB 2027', w * 0.46, h * 0.16);
  ctx.fillStyle = C.ink;
  ctx.font = hand(Math.round(h * 0.075));
  ctx.fillText('SAT', w * sat.x, h * 0.34);
  ctx.fillText('SUN', w * sun.x, h * 0.34);
  ctx.font = display(Math.round(h * 0.2));
  ctx.fillStyle = '#c4473b';
  ctx.fillText('6', w * sat.x, h * sat.y);
  ctx.fillStyle = C.ink;
  ctx.fillText('7', w * sun.x, h * sun.y);
  // Two lines so the note stays large enough to read in the close cue.
  ctx.fillStyle = '#8a5a4a';
  ctx.font = hand(fitSize(ctx, 'our anniversary', hand, Math.round(h * 0.078), w * 0.78));
  ctx.fillText('our anniversary', w * 0.46, h * 0.74);
  ctx.font = hand(fitSize(ctx, '— almost!', hand, Math.round(h * 0.078), w * 0.7));
  ctx.fillText('— almost!', w * 0.46, h * 0.86);
}

function mountRibbon(THREE, track, popup, paper, FONT, C, rng) {
  const canvas = paper.paint(1590, 300, (ctx, w, h) => {
    drawRibbon(ctx, w, h, FONT, C, rng);
  }, { dieCut: 6, seed: 21 });
  const fit = fitPair(popup, RIB_Z, RIB_H, RIB_W);
  const mech = track(popup.vFold({ z0: RIB_Z, gamma: GAMMA, width: fit.w, height: fit.h }));
  const halves = paper.splitCard({ canvas, width: fit.w, height: fit.h });
  halves.left.name = 'ribbon-left';
  halves.right.name = 'ribbon-right';
  const left = new THREE.Group();
  const right = new THREE.Group();
  left.name = 'ribbon-unfurl-left';
  right.name = 'ribbon-unfurl-right';
  left.add(halves.left);
  right.add(halves.right);
  left.scale.x = 0.001;
  right.scale.x = 0.001;
  mech.left.add(left);
  mech.right.add(right);
  return { left, right, mech };
}

function drawRibbon(ctx, w, h, FONT, C, rng) {
  const ink = C.ink;
  // Icons ≈ 0.45 world on a RIB_H card; "forever" is the large cut-letter word.
  const icon = h * (0.45 / RIB_H);
  const top = h * 0.14;
  const band = h * 0.72;
  const y = top + band * 0.52;
  ctx.fillStyle = '#f8e4ea';
  roundBand(ctx, w * 0.03, top, w * 0.94, band, h * 0.16);
  ctx.fill();
  ctx.strokeStyle = '#e7b4c0';
  ctx.lineWidth = 5;
  ctx.stroke();
  // Swallowtail ends, so it reads as a ribbon rather than a bar.
  ctx.fillStyle = '#f8e4ea';
  ctx.beginPath();
  ctx.moveTo(w * 0.03, top + band * 0.18);
  ctx.lineTo(w * 0.008, y);
  ctx.lineTo(w * 0.03, top + band * 0.82);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.97, top + band * 0.18);
  ctx.lineTo(w * 0.992, y);
  ctx.lineTo(w * 0.97, top + band * 0.82);
  ctx.fill();
  ctx.strokeStyle = C.mustard;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 16]);
  ctx.beginPath();
  ctx.moveTo(w * 0.08, y);
  ctx.lineTo(w * 0.48, y);
  ctx.moveTo(w * 0.52, y);
  ctx.lineTo(w * 0.92, y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawVest(ctx, w * 0.13, y, icon, C);
  drawPaw(ctx, w * 0.32, y, icon * 0.72, C);
  drawHouse(ctx, w * 0.56, y, icon * 0.9, C);
  drawRing(ctx, w * 0.68, y, icon * 0.62, C);
  const font = (size) => `${size}px ${FONT.display}`;
  const size = fitSize(ctx, 'forever', font, Math.round(h * 0.52), w * 0.2);
  cutWord(ctx, 'forever', w * 0.79, y, size, FONT, [C.tomato, ink, C.mustard, C.teal, C.blush, C.leaf, C.sky], rng);
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
    ctx.arc(112, 152, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e2574c';
    heartPath(ctx, 178, 78, 44);
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
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'lantern-glow';
    const sign = s === 0 ? -1 : 1;
    mesh.position.set(sign * halfW * 0.48, lanternH * 0.55, 0.012);
    rigs[s].add(mesh);
    list.push({ mesh, freq: 1.7 + s * 0.4, phase: s * 2.1, base: 1.05 });
  }
}
