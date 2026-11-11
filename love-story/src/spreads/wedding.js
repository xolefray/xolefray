// Spread 8 — "February 6, 2027". The book stays open under the end card.
// Times come from timeline.BEATS / SPREADS / END_CARD. Lettering goes through L().
// Drawings: wedding cycle, cherry-flower, and the milestone portraits on the ribbon.
// One mountain gamma keeps the arch, the couple, the garland and the ribbon parallel.
// update() allocates nothing.
import { L } from '../i18n.js';

const GAMMA = 1.78;
const COUPLE_BODY = 1.72;
const COUPLE_Z = -0.52;
const ARCH_Z = -0.9;
const ARCH_H = 2.38;
const ARCH_EXTRA = 336;
const GARLAND_Z = -0.64;
const RIB_Z = 0.34;
const RIB_H = 1.12;
const RIB_W = 6.2;
const HIDDEN = 0.001;
const PI = Math.PI;

// Per frame, the seam between the two bodies. wedding-1 leans across the midline;
// both frames share wedding-0's seam so the fold does not cut a face.
const COUPLE_SPLIT = { 'wedding-0': 317, 'wedding-1': 317 };

const MEDAL_SLOTS = [-0.8, -0.44, 0.16, 0.48, 0.8];

export default {
  id: 'wedding',
  title: 'February 6, 2027',
  build(ctx) {
    const { THREE, paper, popup, rng, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, END_CARD, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'wedding');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'wedding';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);

    // ---------------------------------------------------------------- pages
    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      leftArt = art.canvas('page-left');
      rightArt = art.canvas('page-right');
    } else {
      const floor = (ctx2, w, h, gutterRight) => {
        ctx2.fillStyle = '#d7e6c4';
        ctx2.fillRect(0, 0, w, h);
        ctx2.fillStyle = '#f4c9cf';
        for (let i = 0; i < 16; i++) {
          const x = gutterRight ? w * (0.1 + (i % 5) * 0.05) : w * (0.5 + (i % 5) * 0.08);
          const y = h * (0.14 + (i * 0.05) % 0.75);
          ctx2.beginPath();
          ctx2.ellipse(x, y, 9, 6, i, 0, Math.PI * 2);
          ctx2.fill();
        }
      };
      leftArt = paper.page((ctx2, w, h) => floor(ctx2, w, h, false), { seed: 6, tint: '#e7f0d8' });
      rightArt = paper.page((ctx2, w, h) => floor(ctx2, w, h, true), { seed: 7, tint: '#e7f0d8' });
    }

    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };

    // ---------------------------------------------------------------- trees + arch (the garden rises with the page)
    const treesH = 2.05;
    const treesZ = -1.05;
    const tInfo = info('trees-backdrop');
    const treesNat = treesH * (tInfo ? tInfo.w / tInfo.h : 1.94);
    const treesFit = fitV(popup, treesZ, treesH, Math.min(Math.max(treesNat, 4.1), 4.6));
    const trees = track(popup.vFold({ z0: treesZ, gamma: GAMMA, width: treesFit.w, height: treesFit.h }));
    if (tInfo) mountSplit(paper, trees, art.canvas('trees-backdrop'), treesFit.w, treesFit.h, 'trees');
    else {
      const flat = paper.paint(1100, 520, (ctx2, w, h) => {
        ctx2.fillStyle = '#f3c98a';
        ctx2.fillRect(20, 20, w - 40, h * 0.72);
        ctx2.fillStyle = '#7fb069';
        ctx2.fillRect(20, h * 0.7, w - 40, h * 0.22);
      }, { dieCut: 0, seed: 3 });
      mountSplit(paper, trees, flat, treesFit.w, treesFit.h, 'trees');
    }

    const archSrc = has('arch') ? art.canvas('arch') : null;
    const archBuilt = archSrc ? extendArch(paper, archSrc, ARCH_EXTRA) : null;
    const archPainted = archBuilt ? archBuilt.canvas : null;
    const archPxH = archPainted ? archPainted.height : 512;
    const archWantW = archPainted ? ARCH_H * (archPainted.width / archPxH) : 4.1;
    const archFit = fitV(popup, ARCH_Z, ARCH_H, archWantW);
    const arch = track(popup.vFold({ z0: ARCH_Z, gamma: GAMMA, width: archFit.w, height: archFit.h }));
    if (archBuilt) mountSplit(paper, arch, archPainted, archFit.w, archFit.h, 'arch');
    else {
      const flat = paper.paint(1000, 480, (ctx2, w, h) => {
        ctx2.strokeStyle = '#7d9a62';
        ctx2.lineWidth = 26;
        ctx2.beginPath();
        ctx2.moveTo(w * 0.12, h * 0.92);
        ctx2.quadraticCurveTo(w * 0.5, h * 0.08, w * 0.88, h * 0.92);
        ctx2.stroke();
      }, { dieCut: 8, seed: 4 });
      mountSplit(paper, arch, flat, archFit.w, archFit.h, 'arch');
    }

    const lanternRigs = [];
    let lanternH = 0;
    if (has('lantern-string')) {
      const meta = art.info('lantern-string');
      const lanternW = Math.min(archFit.w * 0.7, 2.35);
      lanternH = lanternW * meta.h / meta.w;
      const swagPx = archSrc ? opaqueRun(archSrc, 0.5).bot : 165;
      const swagY = archFit.h * (1 - swagPx / archPxH);
      const y = Math.max(0.25, swagY - lanternH - 0.04);
      const halves = mountSplit(paper, arch, art.canvas('lantern-string'), lanternW, lanternH, 'lanterns', y, 0);
      lanternRigs.push(halves.left, halves.right);
    }

    // ---------------------------------------------------------------- couple, under the arch
    const couplePair = mountCouple(paper, characters, COUPLE_BODY);
    // Room above the hair for the "I do" bubbles, still inside the V-fold rectangle.
    const bubbleLift = 0.4;
    const coupleFit = fitV(popup, COUPLE_Z, couplePair.height + bubbleLift, Math.max(couplePair.width, 1.15));
    const coupleScale = couplePair.height > 0
      ? Math.min(1, Math.max(0.2, coupleFit.h - bubbleLift) / couplePair.height)
      : 1;
    const couple = track(popup.vFold({
      z0: COUPLE_Z,
      gamma: GAMMA,
      width: Math.max(0.4, couplePair.width * coupleScale),
      height: Math.max(0.4, couplePair.height * coupleScale + bubbleLift),
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

    const bubbleL = bubbleMesh(THREE, paper, FONT, L('I do!', '¡Sí, acepto!'), false);
    bubbleL.name = 'i-do-her';
    bubbleL.position.set(-0.22, coupleTop + 0.05, 0.012);
    leftRig.add(bubbleL);
    const bubbleR = bubbleMesh(THREE, paper, FONT, L('I do!', '¡Sí, acepto!'), true);
    bubbleR.name = 'i-do-him';
    bubbleR.position.set(0.24, coupleTop + 0.05, 0.012);
    rightRig.add(bubbleR);

    // ---------------------------------------------------------------- 3 YEARS garland + numbered hearts
    const garlandFit = fitV(popup, GARLAND_Z, 2.02, 5.1);
    const garland = track(popup.vFold({
      z0: GARLAND_Z, gamma: GAMMA, width: garlandFit.w, height: garlandFit.h,
    }));
    const halfG = garlandFit.w / 2;
    const ropeY = Math.min(garlandFit.h * 0.84, garlandFit.h - 0.26);
    const ropeH = 0.42;
    const ropeW = Math.min(halfG * 0.96, 2.55);
    const ropeL = decal(THREE, paper, ropeCanvas(paper, FONT, false), ropeW, ropeH);
    ropeL.name = 'garland-left';
    ropeL.position.set(-ropeW * 0.5, ropeY, 0.008);
    garland.left.add(ropeL);
    const ropeR = decal(THREE, paper, ropeCanvas(paper, FONT, true), ropeW, ropeH);
    ropeR.name = 'garland-right';
    ropeR.position.set(ropeW * 0.5, ropeY, 0.008);
    garland.right.add(ropeR);
    const years = decal(THREE, paper, yearsCanvas(paper, FONT, C), Math.min(1.05, halfG * 0.42), 0.32);
    years.name = 'three-years';
    years.position.set(-halfG * 0.76, ropeY + 0.02, 0.012);
    years.scale.setScalar(HIDDEN);
    garland.left.add(years);

    // Hearts hang on the rope, beside the couple, so the third one is not lost behind the easel.
    const heartH = Math.min(0.7, ropeY * 0.42);
    const heartW = heartH * 0.92;
    const heartY = ropeY - heartH * 0.36;
    const heartSpecs = [
      { n: '1', parent: garland.left, x: -halfG * 0.46, at: BEATS.threeYears },
      { n: '2', parent: garland.left, x: -halfG * 0.16, at: BEATS.threeYears + 2.15 },
      { n: '3', parent: garland.right, x: halfG * 0.42, at: BEATS.threeYears + 4.3 },
    ];
    const hearts = [];
    for (let i = 0; i < heartSpecs.length; i++) {
      const spec = heartSpecs[i];
      const mesh = decal(THREE, paper, heartCanvas(paper, FONT, spec.n, i), heartW, heartH);
      mesh.name = `heart-${spec.n}`;
      mesh.position.set(spec.x, heartY, 0.012);
      mesh.scale.setScalar(HIDDEN);
      spec.parent.add(mesh);
      hearts.push({ mesh, at: spec.at });
    }

    // ---------------------------------------------------------------- easel sign (the date is lettered on the beat)
    const easelH = 1.22;
    const easelX = 1.62;
    const easelZ = 0.48;
    const easel = stand(THREE, track, popup, 'right', easelX, easelZ, 0.7, easelH, 'easel');
    if (has('easel')) addProp(characterArt, paper, art, easel.rig, 'easel', easel.height, 0, 0);
    const signW = 1.12;
    const signH = 0.58;
    const signBoard = decal(THREE, paper, boardCanvas(paper), signW, signH);
    signBoard.name = 'date-board';
    signBoard.position.set(0, easel.height * 0.5, 0.01);
    easel.rig.add(signBoard);
    const signText = decal(THREE, paper, dateCanvas(paper, FONT, C), signW * 0.94, signH * 0.78);
    signText.name = 'date-letters';
    signText.position.set(0, easel.height * 0.5, 0.02);
    signText.scale.setScalar(HIDDEN);
    easel.rig.add(signText);

    // ---------------------------------------------------------------- garden props
    const flowerRigs = [];
    flowerRigs.push(propStand(THREE, track, popup, characterArt, paper, art, {
      id: 'chairs-left', side: 'left', x: 2.35, z: -0.85, height: 0.46, name: 'chairs-left',
    }));
    flowerRigs.push(propStand(THREE, track, popup, characterArt, paper, art, {
      id: 'chairs-right', side: 'right', x: 2.7, z: -0.95, height: 0.42, name: 'chairs-right',
    }));
    flowerRigs.push(propStand(THREE, track, popup, characterArt, paper, art, {
      id: 'flower-pots', side: 'left', x: 3.05, z: -0.55, height: 0.95, name: 'flowers-left',
    }));
    flowerRigs.push(propStand(THREE, track, popup, characterArt, paper, art, {
      id: 'flower-pots', side: 'right', x: 3.05, z: -0.62, height: 0.82, flip: true, name: 'flowers-right',
    }));
    propStand(THREE, track, popup, characterArt, paper, art, {
      id: 'cake', side: 'right', x: 2.95, z: 0.15, height: 0.62, name: 'cake',
    });

    // ---------------------------------------------------------------- February 2027 desk calendar
    const calX = 2.28;
    const calZ = 0.55;
    let calH = 1.42;
    const calSrc = has('desk-calendar')
      ? cloneCanvas(paper, art.canvas('desk-calendar'))
      : { canvas: paper.paint(640, 640, (ctx2, w, h) => {
        ctx2.fillStyle = '#f6edd9';
        ctx2.fillRect(28, 28, w - 56, h - 56);
      }, { dieCut: 0, seed: 8 }), ctx: null };
    const calPaint = cloneCanvas(paper, calSrc.canvas);
    const grid = paintMonth(calPaint.ctx, calPaint.canvas.width, calPaint.canvas.height, FONT, C);
    const calAspect = calPaint.canvas.width / calPaint.canvas.height;
    let calW = calH * calAspect;
    const calLim0 = popup.standUpLimits({ x: calX, z: calZ, width: calW, fold: 'back' });
    if (calW > calLim0.maxWidth * 0.92) {
      calW = calLim0.maxWidth * 0.92;
      calH = calW / calAspect;
    }
    const calLim = popup.standUpLimits({ x: calX, z: calZ, width: calW, fold: 'back' });
    if (calH > calLim.maxHeight * 0.96) {
      calH = calLim.maxHeight * 0.96;
      calW = calH * calAspect;
    }
    const cal = track(popup.standUp({
      side: 'right', x: calX, z: calZ, fold: 'back', width: calW, height: calH,
    }));
    const calRig = new THREE.Group();
    calRig.name = 'calendar';
    cal.mount.add(calRig);
    const calCard = paper.card({
      canvas: calPaint.canvas,
      width: calW,
      height: calH,
      anchor: 'bottom-center',
    });
    calCard.name = 'desk-calendar';
    calRig.add(calCard);
    const toLocal = (px, py) => ({
      x: (px / calPaint.canvas.width - 0.5) * calW,
      y: (1 - py / calPaint.canvas.height) * calH,
    });
    const p6 = toLocal(grid.d6.x, grid.d6.y);
    const p7 = toLocal(grid.d7.x, grid.d7.y);
    const cell = (grid.cell / calPaint.canvas.width) * calW;
    const ring = decal(THREE, paper, ringCanvas(paper), cell * 1.55, cell * 1.55);
    ring.name = 'anniversary-ring';
    ring.position.set(p7.x, p7.y, 0.012);
    ring.scale.setScalar(HIDDEN);
    calCard.add(ring);
    const note = toLocal(grid.note.x, grid.note.y);
    const sticky = decal(THREE, paper, stickyCanvas(paper, FONT, C), calW * 0.7, calH * 0.16);
    sticky.name = 'sunday-note';
    sticky.position.set(note.x, note.y, 0.02);
    sticky.scale.setScalar(HIDDEN);
    calCard.add(sticky);
    const saturday = decal(THREE, paper, saturdayCanvas(paper, FONT, C), calW * 0.5, calH * 0.11);
    saturday.name = 'saturday-label';
    saturday.position.set(p6.x - calW * 0.12, Math.max(cell, p6.y - cell * 1.45), 0.028);
    saturday.scale.setScalar(HIDDEN);
    calCard.add(saturday);

    // ---------------------------------------------------------------- milestone ribbon
    const ribFit = fitV(popup, RIB_Z, RIB_H, RIB_W);
    const ribCanvas = paper.paint(1680, 420, (ctx2, w, h) => drawRibbonBand(ctx2, w, h, C), { dieCut: 7, seed: 21 });
    const rib = track(popup.vFold({ z0: RIB_Z, gamma: GAMMA, width: ribFit.w, height: ribFit.h }));
    const ribHalves = paper.splitCard({ canvas: ribCanvas, width: ribFit.w, height: ribFit.h });
    const ribL = new THREE.Group();
    const ribR = new THREE.Group();
    ribL.name = 'ribbon-left';
    ribR.name = 'ribbon-right';
    ribL.add(ribHalves.left);
    ribR.add(ribHalves.right);
    rib.left.add(ribL);
    rib.right.add(ribR);
    ribHalves.left.name = 'ribbon-band-left';
    ribHalves.right.name = 'ribbon-band-right';

    const medalMeta = [
      { beat: BEATS.coworkersMilestone, id: 'vest-chat', label: L('coworkers', 'compañeros de trabajo'), slot: 0, big: false },
      { beat: BEATS.classmatesMilestone, id: 'school-couple', label: L('classmates', 'compañeros de clase'), slot: 1, big: false },
      { beat: BEATS.dogParentsMilestone, id: 'life-dogcuddle', label: L('dog parents', 'papás perrunos'), slot: 2, big: false },
      { beat: BEATS.homeownersMilestone, id: 'life-keys', label: L('homeowners', 'dueños de casa'), slot: 3, big: false },
      { beat: BEATS.husbandAndWife, id: 'wedding-0', label: L('husband & wife', 'esposos'), slot: 4, big: true },
    ];
    const medals = [];
    const halfW = ribFit.w / 2;
    for (let i = 0; i < medalMeta.length; i++) {
      const spec = medalMeta[i];
      const h = (spec.big ? 0.92 : 0.74) * (ribFit.h / RIB_H);
      const canvas = medalCanvas(paper, characters, FONT, C, spec.id, spec.label, i, spec.big);
      const w = h * (canvas.width / canvas.height);
      const mesh = decal(THREE, paper, canvas, w, h);
      mesh.name = `medal-${spec.id}`;
      const x = MEDAL_SLOTS[spec.slot] * halfW;
      const y = ribFit.h * 0.5;
      mesh.position.set(x, y, 0.01);
      mesh.scale.setScalar(HIDDEN);
      (x < 0 ? ribL : ribR).add(mesh);
      medals.push({ mesh, at: spec.beat, baseY: y, baseX: x });
    }

    const sparkGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const sparkMat = spriteMat(THREE, paper, sparkCanvas(paper), true);
    const sparks = [];
    const sparkN = 7;
    for (let i = 0; i < sparkN; i++) {
      const along = i / (sparkN - 1);
      const x = -halfW * 0.86 + along * halfW * 1.72;
      const mesh = new THREE.Mesh(sparkGeo, sparkMat);
      mesh.name = 'fate-spark';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.position.set(x, ribFit.h * 0.56, 0.006);
      mesh.scale.setScalar(HIDDEN);
      (x < 0 ? ribL : ribR).add(mesh);
      sparks.push({ mesh, along, phase: rng.next() * Math.PI * 2 });
    }

    // ---------------------------------------------------------------- "See you there!" above the arch line
    const banZ = -0.78;
    const banH = 2.2;
    const banW = 5.2;
    const banFit = fitV(popup, banZ, banH, banW);
    const banCanvas = bannerCanvas(paper, FONT, C, banFit.h);
    const banner = track(popup.vFold({ z0: banZ, gamma: GAMMA, width: banFit.w, height: banFit.h }));
    const banHalves = paper.splitCard({ canvas: banCanvas, width: banFit.w, height: banFit.h });
    banHalves.left.name = 'banner-left';
    banHalves.right.name = 'banner-right';
    banner.left.add(banHalves.left);
    banner.right.add(banHalves.right);

    // ---------------------------------------------------------------- Cherry, flower girl, in front of the aisle
    const cherryH = 0.6;
    const cherryX = 1.95;
    const cherryZ = 1.12;
    const cherryW = 1.2;
    const cherryLim = popup.standUpLimits({ x: cherryX, z: cherryZ, width: cherryW, fold: 'back' });
    const cherry = track(popup.standUp({
      side: 'left', x: cherryX, z: cherryZ, fold: 'back',
      width: Math.min(cherryW, cherryLim.maxWidth * 0.96),
      height: Math.min(0.72, cherryLim.maxHeight * 0.96),
    }));
    const cherryRig = new THREE.Group();
    cherryRig.name = 'cherry';
    cherry.mount.add(cherryRig);
    const cherryCard = characterArt.actor(
      paper, characters, figures, 'cherry-flower',
      { who: 'her', outfit: 'casual', pose: 'stand', facing: 'right' },
      { height: cherryH },
    );
    if (cherryCard) {
      cherryCard.name = 'cherry-flower';
      cherryRig.add(cherryCard);
    }
    const cherryTag = decal(THREE, paper, tagCanvas(paper, FONT, L('flower girl: Cherry', 'niña de las flores: Cherry'), C), 1.16, 0.26);
    cherryTag.name = 'cherry-tag';
    cherryTag.position.set(0.02, 0.16, 0.016);
    cherryTag.scale.setScalar(HIDDEN);
    cherryRig.add(cherryTag);

    // ---------------------------------------------------------------- petals (from "I do") and confetti (celebrate)
    const scatterL = track(popup.onPage({ side: 'left', x: 1.7, z: 0.35, lift: 0.008 }));
    const scatterR = track(popup.onPage({ side: 'right', x: 1.55, z: 0.42, lift: 0.008 }));
    const bitsL = new THREE.Group();
    const bitsR = new THREE.Group();
    bitsL.name = 'petals-left';
    bitsR.name = 'petals-right';
    scatterL.mount.add(bitsL);
    scatterR.mount.add(bitsR);
    const confL = new THREE.Group();
    const confR = new THREE.Group();
    confL.name = 'confetti-left';
    confR.name = 'confetti-right';
    scatterL.mount.add(confL);
    scatterR.mount.add(confR);

    const petalGeo = new THREE.PlaneGeometry(0.18, 0.28);
    const confGeo = new THREE.PlaneGeometry(0.14, 0.2);
    const petals = [];
    const confetti = [];
    const petalA = spriteMat(THREE, paper, paintPetal(paper, '#e8788c'));
    const petalB = spriteMat(THREE, paper, paintPetal(paper, '#f6c2c8'));
    const confColors = [C.tomato, C.mustard, C.teal, C.sky];
    addFloater(THREE, bitsL, petals, petalGeo, petalA, rng, 2, -0.7, 0.35, 1.35);
    addFloater(THREE, bitsR, petals, petalGeo, petalB, rng, 2, -0.4, 0.7, 1.25);
    for (let i = 0; i < 4; i++) {
      const mat = spriteMat(THREE, paper, paintConfetti(paper, confColors[i]));
      addFloater(THREE, i < 2 ? confL : confR, confetti, confGeo, mat, rng, 1, -0.55 + i * 0.25, 0.15 + i * 0.2, 1.5);
    }

    const twinkles = [];
    const starMat = spriteMat(THREE, paper, paintStar(paper), true);
    const starGeo = new THREE.PlaneGeometry(0.14, 0.14);
    addTwinkles(THREE, arch, twinkles, starGeo, starMat, archFit.w, archFit.h, 4);
    if (lanternRigs.length && lanternH > 0) {
      const half = lanternRigs[0].userData.halfW || 1.1;
      addLanternGlows(THREE, lanternRigs, twinkles, starGeo, starMat, half, lanternH);
    }

    const glow = new THREE.PointLight('#ffd7a8', 0, 6.2, 1.6);
    glow.name = 'wedding-glow';
    glow.castShadow = false;
    glow.position.set(0, 1.55, -0.15);
    group.add(glow);

    const actHeartsEnd = BEATS.coworkersMilestone - 0.15;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open + 0.22, hold: 1.5, at: [0, 1.15, -0.1], size: 7.5, from: 'front' },
        { t: BEATS.threeYears + 1.5, hold: 8.2, at: [0.4, 1.2, -0.2], size: 4.4, from: 'front' },
        { t: BEATS.anniversaryWish + 0.45, hold: 7.2, at: [calX, calH * 0.52, calZ], size: 1.85, from: 'front' },
        { t: BEATS.coworkersMilestone + 0.25, hold: 1.5, at: [-2.05, 0.62, RIB_Z], size: 2.7, from: 'front' },
        { t: BEATS.dogParentsMilestone + 0.1, hold: 1.35, at: [0.85, 0.62, RIB_Z], size: 2.9, from: 'front' },
        { t: BEATS.husbandAndWife + 0.15, hold: 1.7, at: [halfW * 0.8, 0.64, RIB_Z], size: 1.75, from: 'front' },
        { t: BEATS.fullOfFate + 0.6, hold: 4.4, at: [0.15, 0.7, RIB_Z], size: 5.6, from: 'low' },
        { t: BEATS.celebrate + 0.45, hold: 5.4, at: [-0.15, 1.2, 0.05], size: 4.8, from: 'front' },
        { t: BEATS.endCard, hold: END_CARD.end - END_CARD.start, at: [0, 1.35, -0.15], size: 7.5, from: 'high' },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const risen = popup.rise(alpha);
        const calm = t >= BEATS.endCard ? 0.4 : 1;
        const fade = 1 - smoothstep(BEATS.fadeOut, END_CARD.end, t);

        showPair(t >= BEATS.iDo ? 1 : 0);
        const vow = bump(t, BEATS.iDo, 0.45);
        const breathe = 1 + Math.sin(t * 1.4) * 0.012 * calm;
        const sx = breathe * (1 - 0.05 * vow);
        const sy = breathe * (1 + 0.06 * vow);
        leftRig.scale.set(sx, sy, 1);
        rightRig.scale.set(sx, sy, 1);
        const bob = Math.sin(t * 1.4) * 0.008 * risen * calm;
        leftRig.position.y = bob;
        rightRig.position.y = bob;

        const bubbleS = showBetween(ease, smoothstep, t, BEATS.iDo, BEATS.anniversaryWish);
        bubbleL.scale.setScalar(bubbleS);
        bubbleR.scale.setScalar(bubbleS);
        bubbleL.position.y = coupleTop + 0.05 + Math.sin(t * 1.8) * 0.012 * bubbleS;
        bubbleR.position.y = coupleTop + 0.05 + Math.sin(t * 1.8 + 0.6) * 0.012 * bubbleS;

        const gardenS = showBetween(ease, smoothstep, t, BEATS.threeYears, actHeartsEnd);
        garland.left.scale.set(gardenS, gardenS, 1);
        garland.right.scale.set(gardenS, gardenS, 1);
        ropeL.rotation.z = Math.sin(t * 1.1) * 0.02 * calm * gardenS;
        ropeR.rotation.z = Math.sin(t * 1.1 + 1) * 0.02 * calm * gardenS;
        const yearS = showBetween(ease, smoothstep, t, BEATS.threeYears + 2.15, actHeartsEnd);
        years.scale.setScalar(yearS);
        for (let i = 0; i < hearts.length; i++) {
          const h = hearts[i];
          const s = popAt(ease, t, h.at, 0.42);
          h.mesh.scale.setScalar(s);
          h.mesh.rotation.z = Math.sin(t * 1.25 + i) * 0.04 * calm * (s > 0.2 ? 1 : 0);
        }

        const easelS = showBetween(ease, smoothstep, t, spread.open, BEATS.anniversaryWish);
        easel.rig.scale.setScalar(easelS);
        const letterS = showBetween(ease, smoothstep, t, BEATS.weddingDate, BEATS.anniversaryWish);
        signText.scale.setScalar(Math.max(HIDDEN, letterS));

        const calS = showBetween(ease, smoothstep, t, BEATS.anniversaryWish, BEATS.coworkersMilestone - 0.05);
        calRig.scale.setScalar(calS);
        const ringIn = popAt(ease, t, BEATS.anniversaryWish + 0.28, 0.4);
        const jump = smoothstep(BEATS.notSunday, BEATS.notSunday + 0.5, t);
        ring.position.x = p7.x + (p6.x - p7.x) * jump;
        ring.position.y = p7.y + (p6.y - p7.y) * jump;
        ring.scale.setScalar(Math.max(HIDDEN, ringIn));
        ring.rotation.z = Math.sin(t * 1.5) * 0.05 * ringIn;
        const slap = popAt(ease, t, BEATS.notSunday, 0.3);
        sticky.scale.setScalar(slap);
        const slapU = Math.min(1, Math.max(0, (t - BEATS.notSunday) / 0.3));
        sticky.rotation.z = -0.26 * (1 - slapU) - 0.06;
        saturday.scale.setScalar(popAt(ease, t, BEATS.notSunday + 0.55, 0.35));

        const unfurl = popAt(ease, t, BEATS.coworkersMilestone, 0.4);
        ribL.scale.x = unfurl;
        ribR.scale.x = unfurl;
        const partyHop = bump(t, BEATS.celebrate, 0.55);
        for (let i = 0; i < medals.length; i++) {
          const m = medals[i];
          const s = popAt(ease, t, m.at, 0.38);
          const hop = 1 + 0.08 * partyHop;
          m.mesh.scale.set(s * hop, s * hop, 1);
          m.mesh.position.y = m.baseY + Math.sin(t * 1.5 + i) * 0.01 * calm * s;
        }

        const head = smoothstep(BEATS.fullOfFate, BEATS.fullOfFate + 4.6, t);
        const sparkCalm = t >= BEATS.endCard ? 0.55 : 1;
        for (let i = 0; i < sparks.length; i++) {
          const s = sparks[i];
          const d = head - s.along;
          const on = d <= 0 ? 0 : Math.min(1, d * 7);
          const tw = 0.72 + 0.28 * Math.sin(t * 3.2 * sparkCalm + s.phase);
          s.mesh.scale.setScalar(Math.max(HIDDEN, on * tw * (t >= BEATS.endCard ? 0.7 : 1)));
        }

        const ban = popAt(ease, t, BEATS.celebrate, 0.5);
        banner.left.scale.x = ban;
        banner.right.scale.x = ban;

        const dogS = popAt(ease, t, BEATS.celebrate + 0.35, 0.4);
        cherryRig.scale.setScalar(dogS);
        cherryRig.position.y = Math.sin(t * 2.1) * 0.01 * calm * dogS;
        cherryRig.rotation.z = Math.sin(t * 1.6) * 0.03 * calm * dogS;
        cherryTag.scale.setScalar(popAt(ease, t, BEATS.celebrate + 0.85, 0.35));

        for (let i = 0; i < flowerRigs.length; i++) {
          const rig = flowerRigs[i];
          if (!rig) continue;
          rig.rotation.z = Math.sin(t * 1.05 + i * 1.4) * 0.02 * risen * calm;
        }
        for (let i = 0; i < lanternRigs.length; i++) {
          lanternRigs[i].rotation.z = Math.sin(t * 1.2 + i) * 0.016 * risen * calm;
        }

        const petalBorn = smoothstep(BEATS.iDo, BEATS.iDo + 0.7, t);
        const confBorn = smoothstep(BEATS.celebrate, BEATS.celebrate + 0.8, t);
        // Floaters ride the page normal. Keep them shut until the book is open,
        // or a petal above the left page crosses the allowed fold angle.
        const pageOpen = smoothstep(PI * 0.9, PI, alpha);
        bitsL.scale.setScalar(Math.max(HIDDEN, risen * petalBorn * pageOpen));
        bitsR.scale.setScalar(Math.max(HIDDEN, risen * petalBorn * pageOpen));
        confL.scale.setScalar(Math.max(HIDDEN, risen * confBorn * pageOpen));
        confR.scale.setScalar(Math.max(HIDDEN, risen * confBorn * pageOpen));
        poseFall(petals, t, calm);
        poseFall(confetti, t, calm);

        const party = smoothstep(BEATS.celebrate, BEATS.celebrate + 0.6, t);
        const soft = t >= BEATS.endCard ? 0.45 : 1;
        for (let i = 0; i < twinkles.length; i++) {
          const tw = twinkles[i];
          const pulse = 0.6 + 0.4 * Math.sin(t * tw.freq * soft + tw.phase);
          tw.mesh.scale.setScalar(tw.base * pulse * (1 + 0.9 * party * soft));
        }
        glow.intensity = risen * fade * (0.55 + 1.25 * party * soft);
      },
    };
  },
};

function popAt(ease, t, at, dur) {
  const u = (t - at) / dur;
  if (u <= 0) return HIDDEN;
  if (u >= 1) return 1;
  let s = ease.outBack(u);
  if (s < HIDDEN) s = HIDDEN;
  else if (s > 1.05) s = 1.05;
  return s;
}

function showBetween(ease, smoothstep, t, a, b) {
  const inn = popAt(ease, t, a, 0.42);
  const out = 1 - smoothstep(b - 0.4, b, t);
  const s = inn * out;
  return s < HIDDEN ? HIDDEN : s;
}

function bump(t, at, dur) {
  const u = (t - at) / dur;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
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

function fitV(popup, z0, height, width) {
  let h = height;
  let w = width;
  for (let i = 0; i < 14; i++) {
    if (popup.vFoldLimits({ z0, gamma: GAMMA, width: w, height: h }).fits) return { w, h };
    h *= 0.97;
    w *= 0.97;
  }
  return { w, h };
}

function decal(THREE, paper, canvas, w, h) {
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({
    map: paper.cutoutTexture(canvas),
    transparent: true,
    alphaTest: 0.4,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
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

function stand(THREE, track, popup, side, x, z, width, height, name) {
  const lim = popup.standUpLimits({ x, z, width, fold: 'back' });
  let w = width;
  let h = height;
  if (w > lim.maxWidth * 0.96 && w > 0) {
    h *= (lim.maxWidth * 0.96) / w;
    w = lim.maxWidth * 0.96;
  }
  const lim2 = popup.standUpLimits({ x, z, width: w, fold: 'back' });
  if (h > lim2.maxHeightLoose * 0.96) h = lim2.maxHeightLoose * 0.96;
  const mech = track(popup.standUp({ side, x, z, fold: 'back', width: w, height: h }));
  const rig = new THREE.Group();
  rig.name = name;
  mech.mount.add(rig);
  return { mech, rig, width: w, height: h };
}

function propStand(THREE, track, popup, characterArt, paper, art, opts) {
  const meta = art && art.has && art.has(opts.id) ? art.info(opts.id) : null;
  let height = opts.height;
  let width = meta ? height * (meta.w / meta.h) : height * 0.7;
  const placed = stand(THREE, track, popup, opts.side, opts.x, opts.z, width, height, opts.name);
  if (meta) addProp(characterArt, paper, art, placed.rig, opts.id, placed.height, 0, 0, opts.flip);
  return placed.rig;
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

function mountSplit(paper, mech, canvas, width, height, name, y = 0, z = 0) {
  const cut = paper.dieCut(canvas, { margin: 8 });
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

function extendArch(paper, src, extra) {
  const sw = src.width;
  const sh = src.height;
  const footH = 48;
  const bandTop = 336;
  const bandBot = sh - footH;
  const bandH = Math.max(1, bandBot - bandTop);
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

function centreOnColumn(paper, src, split) {
  const half = Math.max(split, src.width - split);
  const { canvas, ctx } = paper.makeCanvas(half * 2, src.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, half - split, 0);
  return canvas;
}

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
    const meta = characters.info(id);
    const src = characters.canvas(id);
    if (!meta || !src) continue;
    const split = COUPLE_SPLIT[id] ?? Math.round(src.width / 2);
    const placed = centreOnColumn(paper, cropToFeet(paper, src, meta.feet[1]), split);
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
  try {
    const her = figures.figureCard(paper, 'her', { outfit: 'wedding', pose: 'holdHandsL', facing: 'left', scale: 1.6 });
    const him = figures.figureCard(paper, 'him', { outfit: 'wedding', pose: 'holdHandsR', scale: 1.5 });
    if (her) leftRig.add(her);
    if (him) rightRig.add(him);
  } catch {
    /* illustrated cards are the film; the dolls are only a fallback */
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.32);
  ctx.bezierCurveTo(x - s * 1.05, y - s * 0.45, x - s * 0.2, y - s * 1.05, x, y - s * 0.38);
  ctx.bezierCurveTo(x + s * 0.2, y - s * 1.05, x + s * 1.05, y - s * 0.45, x, y + s * 0.32);
  ctx.closePath();
}

function heartCanvas(paper, FONT, numeral, seed) {
  return paper.paint(420, 400, (ctx, w, h) => {
    ctx.fillStyle = seed === 1 ? '#f3a0b0' : '#e86372';
    heartPath(ctx, w * 0.5, h * 0.56, h * 0.36);
    ctx.fill();
    ctx.strokeStyle = '#fffaf4';
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.fillStyle = '#fffaf4';
    const font = (size) => `${size}px ${FONT.display}`;
    const size = fitSize(ctx, numeral, font, Math.round(h * 0.34), w * 0.4);
    ctx.font = font(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(numeral, w * 0.5, h * 0.48);
    ctx.strokeStyle = '#6f9a62';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.22);
    ctx.quadraticCurveTo(w * 0.08, h * 0.08, w * 0.28, h * 0.1);
    ctx.moveTo(w * 0.78, h * 0.2);
    ctx.quadraticCurveTo(w * 0.94, h * 0.06, w * 0.84, h * 0.24);
    ctx.stroke();
  }, { dieCut: 8, seed: 11 + seed });
}

function ropeCanvas(paper, FONT, right) {
  return paper.paint(700, 220, (ctx, w, h) => {
    ctx.strokeStyle = '#7ea36a';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(right ? 0 : w * 0.08, h * 0.62);
    ctx.quadraticCurveTo(w * 0.5, h * 0.28, right ? w * 0.92 : w, h * 0.58);
    ctx.stroke();
    ctx.fillStyle = '#e7a3b0';
    for (let i = 0; i < 4; i++) {
      const x = w * (0.18 + i * 0.2);
      ctx.beginPath();
      ctx.ellipse(x, h * 0.48, 11, 16, i, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { dieCut: 4, seed: right ? 15 : 14 });
}

function yearsCanvas(paper, FONT, C) {
  const text = L('3 YEARS', '3 AÑOS');
  return paper.paint(640, 200, (ctx, w, h) => {
    ctx.fillStyle = '#fff6ea';
    roundRect(ctx, w * 0.06, h * 0.18, w * 0.88, h * 0.64, 28);
    ctx.fill();
    ctx.strokeStyle = C.tomato;
    ctx.lineWidth = 7;
    ctx.stroke();
    const font = (size) => `${size}px ${FONT.display}`;
    const size = fitSize(ctx, text, font, Math.round(h * 0.46), w * 0.78);
    ctx.font = font(size);
    ctx.fillStyle = C.tomato;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w * 0.5, h * 0.52);
  }, { dieCut: 6, seed: 16 });
}

function boardCanvas(paper) {
  return paper.paint(560, 300, (ctx, w, h) => {
    ctx.fillStyle = '#fffaf3';
    roundRect(ctx, 16, 16, w - 32, h - 32, 18);
    ctx.fill();
    ctx.strokeStyle = '#e7b4c0';
    ctx.lineWidth = 8;
    ctx.stroke();
  }, { dieCut: 6, seed: 17 });
}

function dateCanvas(paper, FONT, C) {
  const text = L('February 6, 2027', '6 de febrero de 2027');
  return paper.paint(640, 300, (ctx, w, h) => {
    const font = (size) => `${size}px ${FONT.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9a3d48';
    const one = fitSize(ctx, text, font, Math.round(h * 0.28), w * 0.9);
    if (one >= h * 0.16) {
      ctx.font = font(one);
      ctx.fillText(text, w * 0.5, h * 0.52);
      return;
    }
    const parts = text.split(' ');
    const mid = Math.ceil(parts.length / 2);
    const a = parts.slice(0, mid).join(' ');
    const b = parts.slice(mid).join(' ');
    const size = Math.min(
      fitSize(ctx, a, font, Math.round(h * 0.28), w * 0.9),
      fitSize(ctx, b, font, Math.round(h * 0.28), w * 0.9),
    );
    ctx.font = font(size);
    ctx.fillText(a, w * 0.5, h * 0.38);
    ctx.fillText(b, w * 0.5, h * 0.68);
  }, { dieCut: 0, grain: 0, seed: 18 });
}

function bubbleMesh(THREE, paper, FONT, text, tailLeft) {
  const canvas = paper.paint(520, 260, (ctx, w, h) => {
    ctx.fillStyle = '#fffdf8';
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = 8;
    roundRect(ctx, w * 0.06, h * 0.06, w * 0.88, h * 0.62, 36);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    const tip = tailLeft ? w * 0.32 : w * 0.68;
    ctx.moveTo(tip - w * 0.08, h * 0.66);
    ctx.lineTo(tip, h * 0.94);
    ctx.lineTo(tip + w * 0.1, h * 0.66);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, text, font, Math.round(h * 0.3), w * 0.78);
    ctx.font = font(size);
    ctx.fillStyle = '#9a3d48';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w * 0.5, h * 0.38);
  }, { dieCut: 6, seed: tailLeft ? 19 : 20 });
  return decal(THREE, paper, canvas, 0.64, 0.34);
}

function paintMonth(ctx, w, h, FONT, C) {
  // Cream face of the desk block (the right edge is the wooden side).
  const x0 = w * 0.09;
  const x1 = w * 0.84;
  const y0 = h * 0.14;
  const y1 = h * 0.84;
  const faceW = x1 - x0;
  const faceH = y1 - y0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const display = (size) => `${size}px ${FONT.display}`;
  const hand = (size) => `700 ${size}px ${FONT.hand}`;
  const title = L('February 2027', 'febrero 2027');
  ctx.fillStyle = '#9a3d48';
  ctx.font = display(fitSize(ctx, title, display, Math.round(faceH * 0.11), faceW * 0.9));
  ctx.fillText(title, (x0 + x1) / 2, y0 + faceH * 0.08);

  const days = L('S M T W T F S', 'D L M M J V S').split(' ');
  const headY = y0 + faceH * 0.2;
  ctx.fillStyle = C.ink;
  for (let i = 0; i < 7; i++) {
    const label = days[i] || '';
    const cx = x0 + faceW * (i + 0.5) / 7;
    ctx.font = hand(fitSize(ctx, label, hand, Math.round(faceH * 0.07), faceW / 7 * 0.85));
    ctx.fillText(label, cx, headY);
  }

  const gridTop = y0 + faceH * 0.28;
  const gridH = faceH * 0.5;
  const rowH = gridH / 5;
  const colW = faceW / 7;
  ctx.fillStyle = C.ink;
  const numFont = display(Math.round(rowH * 0.62));
  ctx.font = numFont;
  for (let d = 1; d <= 28; d++) {
    const col = d % 7;
    const row = Math.floor(d / 7);
    const cx = x0 + colW * (col + 0.5);
    const cy = gridTop + rowH * (row + 0.5);
    ctx.fillStyle = d === 6 || d === 7 ? '#9a3d48' : C.ink;
    ctx.fillText(String(d), cx, cy);
  }
  const cellOf = (d) => {
    const col = d % 7;
    const row = Math.floor(d / 7);
    return {
      x: x0 + colW * (col + 0.5),
      y: gridTop + rowH * (row + 0.5),
    };
  };
  const note = L('our anniversary ♥', 'nuestro aniversario ♥');
  const noteY = y0 + faceH * 0.9;
  ctx.fillStyle = '#8a5a4a';
  ctx.font = hand(fitSize(ctx, note, hand, Math.round(faceH * 0.075), faceW * 0.92));
  ctx.fillText(note, (x0 + x1) / 2, noteY);
  return { d6: cellOf(6), d7: cellOf(7), note: { x: (x0 + x1) / 2, y: noteY }, cell: colW };
}

function ringCanvas(paper) {
  return paper.paint(256, 256, (ctx, w, h) => {
    ctx.strokeStyle = '#e2574c';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(w * 0.48, h * 0.52, w * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e2574c';
    heartPath(ctx, w * 0.74, h * 0.3, 28);
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 22 });
}

function stickyCanvas(paper, FONT, C) {
  const text = L('…a Sunday?!', '…¿en domingo?!');
  return paper.paint(640, 240, (ctx, w, h) => {
    ctx.fillStyle = '#ffe58a';
    ctx.strokeStyle = '#e2c15a';
    ctx.lineWidth = 6;
    roundRect(ctx, 18, 16, w - 36, h - 32, 12);
    ctx.fill();
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, text, font, Math.round(h * 0.42), w * 0.86);
    ctx.font = font(size);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w * 0.5, h * 0.52);
  }, { dieCut: 5, seed: 23 });
}

function saturdayCanvas(paper, FONT, C) {
  const text = L('Saturday it is!', '¡mejor el sábado!');
  return paper.paint(720, 200, (ctx, w, h) => {
    ctx.fillStyle = '#fff6ea';
    ctx.strokeStyle = C.teal;
    ctx.lineWidth = 7;
    roundRect(ctx, 14, 18, w - 28, h - 36, 22);
    ctx.fill();
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, text, font, Math.round(h * 0.42), w * 0.88);
    ctx.font = font(size);
    ctx.fillStyle = '#1f6f68';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w * 0.5, h * 0.52);
  }, { dieCut: 5, seed: 24 });
}

function drawRibbonBand(ctx, w, h, C) {
  const top = h * 0.22;
  const band = h * 0.56;
  ctx.fillStyle = '#f8e4ea';
  roundRect(ctx, w * 0.03, top, w * 0.94, band, h * 0.12);
  ctx.fill();
  ctx.strokeStyle = '#e7b4c0';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#f8e4ea';
  ctx.beginPath();
  ctx.moveTo(w * 0.03, top + band * 0.2);
  ctx.lineTo(w * 0.008, top + band * 0.5);
  ctx.lineTo(w * 0.03, top + band * 0.8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.97, top + band * 0.2);
  ctx.lineTo(w * 0.992, top + band * 0.5);
  ctx.lineTo(w * 0.97, top + band * 0.8);
  ctx.fill();
  ctx.strokeStyle = C.mustard;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.moveTo(w * 0.08, top + band * 0.5);
  ctx.lineTo(w * 0.92, top + band * 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
}

function medalCanvas(paper, characters, FONT, C, id, label, index, big) {
  const colors = [C.sky, C.mustard, C.leaf, C.teal, C.tomato];
  const ink = colors[index % colors.length];
  return paper.paint(640, 500, (ctx, w, h) => {
    const cx = w * 0.5;
    const cy = h * 0.34;
    const r = Math.min(w, h) * 0.3;
    ctx.fillStyle = '#fffaf4';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    const src = characters && characters.canvas ? characters.canvas(id) : null;
    if (src) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
      ctx.clip();
      const scale = (r * 1.85) / src.width;
      const dw = src.width * scale;
      const dh = src.height * scale;
      ctx.drawImage(src, cx - dw / 2, cy - r * 0.9, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = ink;
      heartPath(ctx, cx, cy + r * 0.15, r * 0.35);
      ctx.fill();
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = big ? 14 : 11;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fffaf4';
    roundRect(ctx, w * 0.03, h * 0.7, w * 0.94, h * 0.24, 16);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, label, font, Math.round(h * 0.12), w * 0.88);
    ctx.font = font(size);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w * 0.5, h * 0.82);
  }, { dieCut: 8, seed: 30 + index });
}

function bannerCanvas(paper, FONT, C, worldH) {
  const text = L('See you there!', '¡Los esperamos!');
  const pxH = 900;
  // Image top is the plane top. A strip there hangs the banner above the couple.
  const strip = Math.max(0.12, Math.min(0.2, 0.44 / Math.max(0.5, worldH)));
  return paper.paint(1500, pxH, (ctx, w, h) => {
    const bh = h * strip;
    const y = h * 0.012;
    ctx.fillStyle = '#fff6ea';
    roundRect(ctx, w * 0.05, y, w * 0.9, bh, bh * 0.42);
    ctx.fill();
    ctx.strokeStyle = C.tomato;
    ctx.lineWidth = 10;
    ctx.stroke();
    const font = (size) => `${size}px ${FONT.display}`;
    const size = fitSize(ctx, text, font, Math.round(bh * 0.58), w * 0.82);
    ctx.font = font(size);
    ctx.fillStyle = C.tomato;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w * 0.5, y + bh * 0.54);
  }, { dieCut: 0, grain: 0.04, seed: 40 });
}

function tagCanvas(paper, FONT, text, C) {
  return paper.paint(760, 180, (ctx, w, h) => {
    ctx.fillStyle = '#fffaf4';
    ctx.strokeStyle = '#e7b4c0';
    ctx.lineWidth = 6;
    roundRect(ctx, 12, 16, w - 24, h - 32, 20);
    ctx.fill();
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, text, font, Math.round(h * 0.42), w * 0.88);
    ctx.font = font(size);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w * 0.5, h * 0.52);
  }, { dieCut: 5, seed: 41 });
}

function sparkCanvas(paper) {
  return paper.paint(64, 64, (ctx) => {
    ctx.translate(32, 32);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 26 : 7;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 42 });
}

function paintPetal(paper, color) {
  return paper.paint(64, 96, (ctx) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(32, 48, 16, 34, 0, 0, Math.PI * 2);
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 43 });
}

function paintConfetti(paper, color) {
  return paper.paint(64, 80, (ctx) => {
    ctx.fillStyle = color;
    ctx.translate(32, 40);
    ctx.rotate(0.4);
    ctx.fillRect(-16, -22, 32, 44);
  }, { dieCut: 0, grain: 0, seed: 44 });
}

function paintStar(paper) {
  return paper.paint(64, 64, (ctx) => {
    ctx.translate(32, 32);
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 28 : 8;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }, { dieCut: 0, grain: 0, seed: 45 });
}

function addFloater(THREE, parent, list, geo, mat, rng, count, x0, x1, rise) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'floater';
    parent.add(mesh);
    list.push({
      mesh,
      x: x0 + rng.next() * (x1 - x0),
      z: -0.25 + rng.next() * 0.5,
      phase: rng.next() * Math.PI * 2,
      spin: (rng.next() - 0.5) * 1.2,
      speed: 0.11 + rng.next() * 0.06,
      rise,
    });
  }
}

function poseFall(list, t, calm) {
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const u = (t * p.speed + p.phase) % 1;
    // The quad is centred, so a fall that reaches 0 puts vertices through the page.
    const y = 0.2 + (1 - u) * p.rise;
    p.mesh.position.set(
      p.x + Math.sin(t * 0.6 + p.phase) * 0.08,
      y,
      p.z,
    );
    p.mesh.rotation.z = p.phase + t * p.spin * calm;
    p.mesh.scale.setScalar(0.85 + 0.15 * Math.sin(t + p.phase));
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
    const u = 0.28 + (i % Math.max(1, count / 2)) * 0.38;
    const x = (leftSide ? -1 : 1) * half * u;
    mesh.position.set(x, archH * (0.8 - (i % 2) * 0.06), 0);
    side.add(mesh);
    list.push({ mesh, freq: 2.1 + (i % 3) * 0.4, phase: i * 1.3, base: 0.8 });
  }
}

function addLanternGlows(THREE, rigs, list, geo, mat, halfW, lanternH) {
  for (let s = 0; s < rigs.length; s++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'lantern-glow';
    const sign = s === 0 ? -1 : 1;
    mesh.position.set(sign * halfW * 0.45, lanternH * 0.55, 0);
    rigs[s].add(mesh);
    list.push({ mesh, freq: 1.6 + s * 0.35, phase: s * 2.1, base: 1.15 });
  }
}
