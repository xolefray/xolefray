// Spread — "A little bit of fate". Left page: the first movie date (they sat one seat apart).
// Right page: the college, where Marlin finds Brian. Times come from timeline.BEATS / SPREADS.
// Lettering is drawn in code through L(). update() allocates nothing.
import { L } from '../i18n.js';

const GAMMA = 1.66; // mountain, near π/2 so a wide facade still lies inside the page
const RIBBON_G = 1.12; // shared by the couple and the ribbon so the two valleys stay parallel
const BACK_Z = -1.02;
const FACADE_W = 6.1;
const FACADE_H = 2.16;
const CLEAR = 0.02;

const SCREEN_H = 1.62;
const MARQUEE_H = 0.5;
const COLLEGE_H = 2.04;
const MOVIES_H = 1.5;
const HER_H = 1.55;
const HIM_H = 1.56;
const COUPLE_H = 1.58;

function bump(t, at, dur) {
  const u = (t - at) / dur;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

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

function metrics(info, height) {
  const s = height / info.h;
  return {
    s,
    drop: (info.h - info.feet[1]) * s,
    left: info.feet[0] * s,
    right: (info.w - info.feet[0]) * s,
    width: info.w * s,
  };
}

function seat(card, info, height, extra) {
  if (!card || !info) return null;
  const m = metrics(info, height);
  card.position.y = m.drop + (extra || 0);
  return m;
}

export default {
  id: 'fate',
  title: 'A little bit of fate',
  build(ctx) {
    const { THREE, paper, popup, characters, characterArt, art, FONT, timeline, figures } = ctx;
    const { BEATS, SPREADS, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'fate');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'fate';
    bindPaper(paper);

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const charInfo = (id) => (characters && characters.info ? characters.info(id) : null);
    const cycle = (name) => (characters && characters.cycle ? characters.cycle(name) : []);

    const movies = BEATS.movies;
    const apart = BEATS.apartSeats;
    const startAt = BEATS.itsAStart;
    const cross = BEATS.crossPaths;
    const collegeAt = BEATS.college;
    const leaving = BEATS.leavingWalmart;
    const schoolAt = BEATS.sameSchool;
    const fateAt = BEATS.fate;

    // ---------------------------------------------------------------- pages
    let leftArt;
    let rightArt;
    const ticket = L('ADMIT ONE', 'ENTRADA');
    if (has('page-left') && has('page-right')) {
      const Lft = cloneCanvas(paper, art.canvas('page-left'));
      const lw = Lft.canvas.width;
      const lh = Lft.canvas.height;
      // Two blank stubs measured on the carpet (fractions of the page). Right edge is the gutter.
      stamp(Lft.ctx, FONT, ticket, lw * 0.277, lh * 0.610, lw * 0.26, -0.06);
      stamp(Lft.ctx, FONT, ticket, lw * 0.316, lh * 0.755, lw * 0.18, 0.04);
      leftArt = Lft.canvas;
      rightArt = art.canvas('page-right');
    } else {
      leftArt = paper.page((g, w, h) => {
        g.fillStyle = '#7a2e32';
        g.fillRect(0, 0, w, h);
        stamp(g, FONT, ticket, w * 0.30, h * 0.62, w * 0.26, -0.06);
        stamp(g, FONT, ticket, w * 0.34, h * 0.76, w * 0.18, 0.04);
      }, { seed: 41, tint: '#7a2e32' });
      rightArt = paper.page((g, w, h) => {
        g.fillStyle = '#c9e6b0';
        g.fillRect(0, 0, w, h);
      }, { seed: 42, tint: '#d5ecc0' });
    }

    // ---------------------------------------------------------------- mechanisms
    const folds = [];
    const track = (m) => {
      folds.push(m);
      group.add(m.object);
      return m;
    };
    const stand = (side, x, z, fold, width, height, name) => {
      const m = track(popup.standUp({ side, x, z, fold, width, height }));
      m.mount.name = name;
      return m.mount;
    };
    const holdOf = (parent, name) => {
      const h = new THREE.Group();
      h.name = name;
      parent.add(h);
      return h;
    };

    const back = track(popup.vFold({ z0: BACK_Z, gamma: GAMMA, width: FACADE_W, height: FACADE_H }));
    back.object.name = 'facade';

    // Screen on the left half of the mountain. The marquee is a child so it clears the seat rows.
    const reels = [];
    const screenPivot = holdOf(back.left, 'screen');
    screenPivot.position.set(-1.82, 0, 0);
    const screenInfo = info('screen');
    if (screenInfo) {
      const screen = characterArt.characterCard(paper, art, 'screen', { height: SCREEN_H });
      if (screen) {
        screen.name = 'screen';
        seat(screen, screenInfo, SCREEN_H, CLEAR);
        screenPivot.add(screen);
      }
      const sw = screenInfo.w * (SCREEN_H / screenInfo.h);
      // Beige screen opening, inset so the curtains and the stage stay visible.
      const picW = sw * 0.60;
      const picH = SCREEN_H * 0.58;
      const picY = CLEAR + SCREEN_H * 0.52;
      const reelGeo = new THREE.PlaneGeometry(picW, picH);
      const reelKinds = ['3', '2', '1', 'title'];
      for (let i = 0; i < reelKinds.length; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: paper.texture(paintReel(paper, FONT, reelKinds[i])),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(reelGeo, mat);
        mesh.name = reelKinds[i] === 'title' ? 'reel-title' : `reel-${reelKinds[i]}`;
        mesh.position.set(0, picY, 0.012 + i * 0.001);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.visible = false;
        screenPivot.add(mesh);
        reels.push(mesh);
      }
      const flickerMat = new THREE.MeshBasicMaterial({
        color: '#fff6d8',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const flicker = new THREE.Mesh(new THREE.PlaneGeometry(picW, picH), flickerMat);
      flicker.name = 'flicker';
      flicker.position.set(0, picY, 0.018);
      flicker.castShadow = false;
      flicker.receiveShadow = false;
      screenPivot.add(flicker);
      screenPivot.userData.flicker = flicker;
    }
    const marqueeInfo = info('marquee');
    if (marqueeInfo) {
      const painted = cloneCanvas(paper, art.canvas('marquee'));
      letterMarquee(painted.ctx, painted.canvas, FONT, C);
      const marquee = cardFrom(THREE, paper, painted.canvas, marqueeInfo, MARQUEE_H);
      marquee.name = 'marquee';
      const mDrop = (marqueeInfo.h - marqueeInfo.feet[1]) * (MARQUEE_H / marqueeInfo.h);
      marquee.position.set(0, CLEAR + SCREEN_H - 0.18 + mDrop, 0.02);
      screenPivot.add(marquee);
    }

    const collegePivot = holdOf(back.right, 'college');
    collegePivot.position.set(1.62, 0, 0);
    const collegeInfo = info('college');
    if (collegeInfo) {
      const college = characterArt.characterCard(paper, art, 'college', { height: COLLEGE_H });
      if (college) {
        college.name = 'college';
        seat(college, collegeInfo, COLLEGE_H, CLEAR);
        collegePivot.add(college);
      }
    }

    const seatMidW = widthOf(info('seats-mid'), 0.66, 2.2);
    const seatFrontW = widthOf(info('seats-front'), 0.58, 1.4);
    const moviesW = widthOf(charInfo('movies-0'), MOVIES_H, 2.2);
    const concessionW = widthOf(info('concession'), 1.0, 0.9);
    const projectorW = widthOf(info('projector'), 0.7, 0.5);
    const bannerW = widthOf(info('banner'), 0.98, 1.7);
    const treesW = widthOf(info('trees'), 1.28, 1.2);
    const bikeW = widthOf(info('bike-rack'), 0.58, 1.0);
    const signW = widthOf(info('signpost'), 0.98, 0.8);
    const himW = widthOf(charInfo('him-campus'), HIM_H, 0.7);

    const seatsMid = holdOf(stand('left', 1.72, -0.22, 'back', seatMidW, 0.66, 'seats-mid'), 'seats-mid');
    addProp(seatsMid, 'seats-mid', 0.66);
    const seatsFront = holdOf(stand('left', 1.58, 0.20, 'back', seatFrontW, 0.58, 'seats-front'), 'seats-front');
    addProp(seatsFront, 'seats-front', 0.58);
    const concession = holdOf(stand('left', 3.02, -0.32, 'back', concessionW, 1.0, 'concession'), 'concession');
    addProp(concession, 'concession', 1.0);
    const projector = holdOf(stand('left', 0.95, -0.28, 'back', projectorW, 0.7, 'projector'), 'projector');
    addProp(projector, 'projector', 0.7);

    const moviesMount = stand('left', 2.0, 0.86, 'back', moviesW, MOVIES_H, 'movies');
    const moviesHold = holdOf(moviesMount, 'movies');
    const movieIds = cycle('movies');
    const moviesFlip = mountFlip(paper, characters, characterArt, movieIds, MOVIES_H);
    if (moviesFlip) {
      seatFlip(moviesFlip, movieIds, characters, MOVIES_H);
      moviesHold.add(moviesFlip.group);
    } else {
      const one = characterArt.actor(paper, characters, figures, 'movies-0', { who: 'her', outfit: 'casual', pose: 'sit' }, { height: MOVIES_H });
      if (one) {
        one.name = 'movies-0';
        seat(one, charInfo('movies-0'), MOVIES_H, CLEAR);
        moviesHold.add(one);
      }
    }

    const apartNote = doodle(paper, THREE, arrowNote(FONT, C, L('one whole seat apart', 'un asiento entero de distancia')));
    apartNote.name = 'apart';
    apartNote.position.set(0, 0.58, 0.02);
    moviesHold.add(apartNote);

    const startNote = doodle(paper, THREE, heartNote(FONT, C, L('…it was a start!', '…¡por algo se empieza!')));
    startNote.name = 'its-a-start';
    startNote.position.set(0, 0.92, 0.02);
    moviesHold.add(startNote);

    const kernelGeo = kernelGeometry(THREE);
    const kernelMat = kernelMaterial(THREE, paper);
    const kernelA = new THREE.Mesh(kernelGeo, kernelMat);
    const kernelB = new THREE.Mesh(kernelGeo, kernelMat);
    kernelA.name = 'kernel-a';
    kernelB.name = 'kernel-b';
    kernelA.position.set(-0.06, 0.78, 0.02);
    kernelB.position.set(0.12, 0.74, 0.02);
    kernelA.castShadow = kernelB.castShadow = false;
    moviesHold.add(kernelA, kernelB);

    const trees = holdOf(stand('right', 2.88, -0.78, 'front', treesW, 1.28, 'trees'), 'trees');
    addProp(trees, 'trees', 1.28);
    const bannerMount = stand('right', 2.64, -0.06, 'back', bannerW, 0.98, 'banner');
    const bannerHold = holdOf(bannerMount, 'banner');
    addProp(bannerHold, 'banner', 0.98);
    const bannerText = doodle(paper, THREE, bannerWords(FONT, C, L('WELCOME, STUDENTS', 'BIENVENIDOS, ESTUDIANTES')));
    bannerText.name = 'banner-words';
    bannerText.position.set(0.34, 0.52, 0.03);
    bannerHold.add(bannerText);

    const bike = holdOf(stand('right', 2.92, 0.88, 'back', bikeW, 0.58, 'bike-rack'), 'bike-rack');
    addProp(bike, 'bike-rack', 0.58);
    const sign = holdOf(stand('right', 3.08, 1.20, 'back', signW, 0.98, 'signpost'), 'signpost');
    addProp(sign, 'signpost', 0.98);

    // Her walks in from the gutter. The slider stands her up; rise() lays her flat before the page shuts.
    const herPath = [[0.92, 0.42], [1.18, 0.18], [1.38, 0.02]];
    const herSlider = popup.slider({ side: 'right', path: herPath, lift: 0.012, smooth: false });
    group.add(herSlider.object);
    const herHold = holdOf(herSlider.mount, 'her-campus');
    const her = characterArt.actor(
      paper, characters, figures, 'her-campus',
      { who: 'her', outfit: 'casual', pose: 'walk' },
      { height: HER_H },
    );
    if (her) {
      her.name = 'her-campus';
      seat(her, charInfo('her-campus'), HER_H, CLEAR);
      herHold.add(her);
    }
    // Slider +Z follows her walk, about 40° off the reader. A negative yaw brings the
    // bubbles back toward world +Z, beside her head rather than across her face.
    const bubCollege = doodle(paper, THREE, thoughtBubble(FONT, C, L('college?', '¿la universidad?'), false));
    bubCollege.name = 'college-thought';
    bubCollege.position.set(0.78, 1.12, 0.03);
    bubCollege.rotation.y = -0.70;
    herHold.add(bubCollege);
    const bubWalmart = doodle(paper, THREE, thoughtBubble(FONT, C, L('leave Walmart?', '¿dejar Walmart?'), true));
    bubWalmart.name = 'walmart-thought';
    bubWalmart.position.set(1.02, 1.46, 0.03);
    bubWalmart.rotation.y = -0.70;
    herHold.add(bubWalmart);

    const himMount = stand('right', 1.78, 0.68, 'back', himW, HIM_H, 'him-campus');
    const himHold = holdOf(himMount, 'him-campus');
    const him = characterArt.actor(
      paper, characters, figures, 'him-campus',
      { who: 'him', outfit: 'casual', pose: 'wave' },
      { height: HIM_H },
    );
    if (him) {
      him.name = 'him-campus';
      seat(him, charInfo('him-campus'), HIM_H, CLEAR);
      himHold.add(him);
    }
    const himLine = doodle(paper, THREE, surpriseBubble(FONT, C, L('You go here too?!', '¿Tú también estudias aquí?!')));
    himLine.name = 'you-go-here';
    // Above his head, on the outer side of the page, so it cannot sit across Marlin's face.
    himLine.position.set(0.72, 1.72, 0.03);
    himHold.add(himLine);

    // Couple and ribbon share a valley angle. Text stays off the centre seam.
    const coupleInfo = charInfo('school-couple');
    const coupleW = coupleInfo ? coupleInfo.w * (COUPLE_H / coupleInfo.h) : 1.1;
    const coupleFold = track(popup.vFold({ z0: 0.46, gamma: RIBBON_G, width: coupleW, height: COUPLE_H }));
    coupleFold.object.name = 'school-couple';
    const coupleL = holdOf(coupleFold.left, 'school-couple-l');
    const coupleR = holdOf(coupleFold.right, 'school-couple-r');
    if (coupleInfo && characters && characters.canvas && characters.canvas('school-couple')) {
      const cut = paper.dieCut(characters.canvas('school-couple'), { margin: 8 });
      const cW = coupleInfo.w * (COUPLE_H / coupleInfo.h);
      const parts = paper.splitCard({ canvas: cut, width: cW, height: COUPLE_H });
      parts.left.name = 'couple-left';
      parts.right.name = 'couple-right';
      coupleL.add(parts.left);
      coupleR.add(parts.right);
    }

    const ribbonFold = track(popup.vFold({ z0: 0.66, gamma: RIBBON_G, width: 3.44, height: 0.44 }));
    ribbonFold.object.name = 'ribbon';
    const ribbonL = holdOf(ribbonFold.left, 'ribbon-l');
    const ribbonR = holdOf(ribbonFold.right, 'ribbon-r');
    const ribbonCanvas = ribbonArt(paper, FONT, C, L('a little bit of fate', 'un poquito de destino'));
    const ribbonParts = paper.splitCard({ canvas: ribbonCanvas, width: 3.44, height: 0.44 });
    ribbonParts.left.name = 'ribbon-left';
    ribbonParts.right.name = 'ribbon-right';
    ribbonL.add(ribbonParts.left);
    ribbonR.add(ribbonParts.right);

    const sparkGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const sparkMat = new THREE.MeshBasicMaterial({
      map: paper.texture(sparkleCanvas(paper, C)),
      alphaTest: 0.4,
      transparent: false,
      depthWrite: false,
    });
    const sparkles = [];
    const sparkAt = [[ribbonL, -0.55, 0.30], [ribbonL, -1.25, 0.14], [ribbonR, 0.62, 0.28]];
    for (let i = 0; i < sparkAt.length; i++) {
      const mesh = new THREE.Mesh(sparkGeo, sparkMat);
      mesh.name = 'sparkle';
      mesh.position.set(sparkAt[i][1], sparkAt[i][2], 0.02);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      sparkAt[i][0].add(mesh);
      sparkles.push(mesh);
    }

    // Dotted trails on the right page, from the gutter toward the college door, then a heart.
    // Stamps lean toward the reader. rise() collapses them onto the page as it shuts.
    const trailPage = track(popup.onPage({ side: 'right', x: 0.02, z: 0, lift: 0.012 }));
    trailPage.mount.name = 'trails';
    // Flat on the lawn, long axis along the walk. Toes (canvas top) point toward −Z, then yaw toward the door.
    const footGeo = new THREE.PlaneGeometry(0.26, 0.38);
    footGeo.rotateX(-Math.PI / 2);
    const footMap = paper.texture(dotCanvas(paper));
    const footMat = [
      new THREE.MeshBasicMaterial({ map: footMap, color: C.teal, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ map: footMap, color: C.mustard, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    ];
    const footPts = [
      [0.68, 0.38], [1.08, 0.24], [1.46, 0.12], [1.78, 0.04],
      [0.82, 0.56], [1.22, 0.38], [1.58, 0.22], [1.90, 0.10],
    ];
    const footprints = [];
    for (let i = 0; i < footPts.length; i++) {
      const mesh = new THREE.Mesh(footGeo, footMat[i < 4 ? 0 : 1]);
      mesh.name = 'footprint';
      mesh.position.set(footPts[i][0], 0, footPts[i][1]);
      mesh.rotation.y = 0.55;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      trailPage.mount.add(mesh);
      footprints.push(mesh);
    }
    const heart = new THREE.Mesh(footGeo, new THREE.MeshBasicMaterial({
      map: paper.texture(heartCanvas(paper, C)),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    heart.name = 'trail-heart';
    heart.position.set(1.84, 0, 0.08);
    heart.rotation.y = 0;
    heart.castShadow = false;
    trailPage.mount.add(heart);

    const lamp = new THREE.PointLight('#ffd2a8', 0, 4.2, 1.6);
    lamp.name = 'cinema-light';
    lamp.castShadow = false;
    lamp.position.set(-1.7, 1.45, 0.15);
    group.add(lamp);

    const flicker = screenPivot.userData.flicker || null;
    const state = { movies: 0 };
    const herSpan = 2.7;

    function addProp(mount, id, height) {
      if (!has(id)) return null;
      const card = characterArt.characterCard(paper, art, id, { height });
      if (!card) return null;
      card.name = id;
      seat(card, art.info(id), height, CLEAR);
      mount.add(card);
      return card;
    }

    // Cue anchors are spread-frame (left page x is negative). Holds cover the beats that share a shot.
    const cues = [
      { t: spread.open, hold: 1.1, at: [0, 1.2, 0], size: 7.5, from: 'front' },
      { t: movies + 0.45, hold: 4.4, at: [-1.65, 1.15, -0.15], size: 3.8, from: 'left' },
      { t: apart + 0.25, hold: 5.4, at: [-2.0, 0.95, 0.72], size: 2.3, from: 'front' },
      { t: cross + 0.5, hold: 5.6, at: [1.7, 1.25, -0.3], size: 4.2, from: 'right' },
      { t: collegeAt + 0.45, hold: 5.2, at: [1.4, 1.05, 0.15], size: 2.2, from: 'right' },
      // She stands gutter-side of him. A left-front close keeps both faces and the
      // bubble (outer side of Brian) in frame; her reaction is the point of the shot.
      { t: schoolAt + 0.35, hold: 3.6, at: [1.82, 1.38, 0.3], size: 2.6, from: 'left' },
      // size 4 from the front reads as the whole spread. 2.15 is a two-shot the ribbon still fits.
      { t: fateAt + 0.45, hold: 3.7, at: [0.02, 0.98, 0.48], size: 2.15, from: 'front' },
      { t: fateAt + 4.6, hold: 1.35, at: [0, 1.15, 0], size: 7.5, from: 'front' },
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

        const cin = popIn(ease, t, movies, 0.34);
        const cinB = popIn(ease, t, movies + 0.16, 0.32);
        const cinC = popIn(ease, t, movies + 0.32, 0.34);
        const yard = popIn(ease, t, movies + 0.28, 0.4);
        const hall = popIn(ease, t, cross, 0.46);
        const herShow = smoothstep(collegeAt, collegeAt + 0.32, t) * (1 - smoothstep(fateAt, fateAt + 0.5, t));
        const himShow = popIn(ease, t, schoolAt, 0.4) * (1 - smoothstep(fateAt, fateAt + 0.5, t));
        const coupleShow = popIn(ease, t, fateAt, 0.42);
        const ribbonShow = popIn(ease, t, fateAt + 0.12, 0.4);
        const words = popIn(ease, t, schoolAt, 0.36);
        const apartShow = smoothstep(apart, apart + 0.28, t) * (1 - smoothstep(startAt, startAt + 0.22, t));
        const startShow = smoothstep(startAt, startAt + 0.3, t);
        const bubFade = 1 - smoothstep(schoolAt, schoolAt + 0.28, t);
        const bub1 = smoothstep(collegeAt + 0.12, collegeAt + 0.4, t) * bubFade;
        const bub2 = smoothstep(leaving, leaving + 0.32, t) * bubFade;
        const himTalk = smoothstep(schoolAt + 0.08, schoolAt + 0.36, t);

        const breathe = 1 + Math.sin(t * 1.5) * 0.01;
        show(screenPivot, cin);
        show(seatsMid, cinB);
        show(seatsFront, cinB);
        show(concession, cinC * breathe);
        const nod = bump(t, movies + 2.6, 0.85);
        projector.rotation.z = nod * 0.14;
        show(projector, cinC);
        projector.scale.y = cinC * (1 + 0.03 * nod);

        const flipPop = bump(t, startAt, 0.3);
        const ms = cinC;
        moviesHold.scale.set(breathe * (1 - 0.06 * flipPop) * ms, breathe * (1 + 0.08 * flipPop) * ms, ms > 0 ? 1 : 0);
        if (moviesFlip) {
          const frame = t >= startAt ? 1 : 0;
          if (frame !== state.movies) {
            moviesFlip.show(frame);
            state.movies = frame;
          }
        }
        setScale(apartNote, apartShow, 0.92);
        setScale(startNote, startShow, 0.78);
        const hop = bump(t, apart, 1.05);
        const kShow = apartShow;
        kernelA.scale.setScalar(kShow);
        kernelB.scale.setScalar(kShow);
        kernelA.position.y = 0.78 + Math.abs(Math.sin(t * 13)) * 0.18 * hop;
        kernelB.position.y = 0.74 + Math.abs(Math.sin(t * 13 + 1.1)) * 0.14 * hop;

        const age = t - movies;
        const reelAt = [0, 0.85, 1.6, 2.3];
        const reelEnd = [0.85, 1.6, 2.3, 80];
        const flick = 0.88 + 0.08 * Math.abs(Math.sin(t * 6.4)) + 0.04 * Math.abs(Math.sin(t * 15.7));
        for (let i = 0; i < reels.length; i++) {
          const fade = 0.16;
          let w = smoothstep(reelAt[i], reelAt[i] + fade, age) * (1 - smoothstep(reelEnd[i] - fade, reelEnd[i], age));
          if (w < 0) w = 0;
          else if (w > 1) w = 1;
          w *= flick;
          reels[i].visible = w > 0.03;
          reels[i].material.opacity = w;
        }
        if (flicker) flicker.material.opacity = cin * (0.03 + 0.06 * Math.abs(Math.sin(t * 8.5)));

        show(collegePivot, hall);
        const flutter = bump(t, cross + 4.3, 0.8);
        bannerHold.rotation.z = Math.sin(t * 1.35) * 0.012 * hall + flutter * 0.05;
        bannerHold.scale.set(hall * (1 + 0.035 * flutter), hall * (1 - 0.02 * flutter), hall > 0 ? 1 : 0);
        setScale(bannerText, words, 1.08);
        trees.rotation.z = Math.sin(t * 1.15) * 0.015 * yard;
        show(trees, yard);
        show(bike, yard);
        sign.rotation.z = Math.sin(t * 1.6) * 0.02 * yard + bump(t, movies + 4.0, 0.6) * 0.08;
        show(sign, yard);

        const herU = clamp01((t - collegeAt) / herSpan);
        herSlider.update(alpha, herU);
        const hs = risen * herShow;
        herHold.scale.set(hs, hs, hs > 0 ? 1 : 0);
        herHold.position.y = Math.sin(t * 2.2) * 0.006 * herShow;
        bubCollege.position.y = 1.12 + 0.06 * bub2;
        bubCollege.position.x = 0.78;
        setScale(bubCollege, bub1, 0.86);
        setScale(bubWalmart, bub2, 0.98);

        const wave = bump(t, schoolAt, 0.45) + 0.55 * bump(t, schoolAt + 2.6, 0.7);
        himHold.rotation.z = Math.sin(t * 2.5) * 0.03 * himShow + wave * 0.07;
        show(himHold, himShow);
        setScale(himLine, himTalk, 1.05);

        show(coupleL, coupleShow);
        show(coupleR, coupleShow);
        show(ribbonL, ribbonShow);
        show(ribbonR, ribbonShow);
        for (let i = 0; i < sparkles.length; i++) {
          const p = 0.75 + 0.25 * Math.sin(t * 4.2 + i * 1.7);
          sparkles[i].scale.setScalar(p);
          sparkles[i].rotation.z = Math.sin(t * 1.8 + i) * 0.3;
        }

        // Pairs draw together: index 0..3 teal, 4..7 mustard, step i of each pair shares a delay.
        for (let i = 0; i < footprints.length; i++) {
          const step = i < 4 ? i : i - 4;
          const u = smoothstep(cross + step * 1.25, cross + step * 1.25 + 0.5, t);
          footprints[i].scale.setScalar(u * risen);
        }
        const heartShow = popIn(ease, t, schoolAt, 0.4);
        heart.scale.setScalar(1.85 * heartShow * risen);

        lamp.intensity = risen * cin * (0.55 + 0.2 * Math.sin(t * 6.5));
      },
    };
  },
};

function widthOf(info, height, fallback) {
  if (!info || !(info.h > 0)) return fallback;
  return info.w * (height / info.h);
}

function show(obj, s) {
  obj.scale.set(s, s, s > 0 ? 1 : 0);
}

function setScale(obj, s, x) {
  obj.scale.set(x * s, x * s, s > 0 ? 1 : 0);
}

function cardFrom(THREE, paper, canvas, info, height) {
  const cut = paper.dieCut(canvas, { margin: 10 });
  const s = height / info.h;
  const mesh = paper.card({ canvas: cut, width: info.w * s, height, anchor: 'bottom-center' });
  mesh.position.set(((info.w / 2) - info.feet[0]) * s, (info.feet[1] - info.h) * s, 0);
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

function mountFlip(paper, characters, characterArt, ids, height) {
  if (!ids || !ids.length || !characters || !characters.has || !characters.has(ids[0])) return null;
  return characterArt.characterFlip(paper, characters, ids, { height });
}

function seatFlip(flip, ids, characters, height) {
  const ref = characters.info(ids[0]);
  if (!ref) return;
  const scale = height / ref.h;
  let drop = 0;
  for (let i = 0; i < ids.length; i++) {
    const inf = characters.info(ids[i]);
    if (!inf) continue;
    const d = (inf.h - inf.feet[1]) * scale;
    if (d > drop) drop = d;
  }
  flip.group.position.y = drop + CLEAR;
}

function doodle(paper, THREE, canvas) {
  const mat = new THREE.MeshStandardMaterial({
    map: paper.texture(canvas),
    alphaTest: 0.35,
    roughness: 0.94,
    metalness: 0,
  });
  const w = 1;
  const h = canvas.height / canvas.width;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function stamp(g, FONT, text, x, y, maxW, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = fitSize(g, text, (n) => `${n}px ${FONT.display}`, 54, maxW);
  g.font = `${size}px ${FONT.display}`;
  g.fillStyle = '#8d3a32';
  g.fillText(text, 0, 2);
  g.restore();
}

function paintReel(paper, FONT, kind) {
  const W = 640;
  const H = 400;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.fillStyle = '#161311';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#f3ead7';
  ctx.lineWidth = 10;
  ctx.strokeRect(28, 22, W - 56, H - 44);
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 36, W - 84, H - 72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (n) => `${n}px ${FONT.display}`;
  if (kind === 'title') {
    reelHeart(ctx, W * 0.38, H * 0.30, 26, '#e2574c');
    reelHeart(ctx, W * 0.62, H * 0.30, 26, '#e2574c');
    const line = L('THE BEGINNING', 'EL COMIENZO');
    const px = fitSize(ctx, line, font, 72, W * 0.78);
    ctx.fillStyle = '#f6efe2';
    ctx.font = font(px);
    ctx.fillText(line, W / 2, H * 0.64);
    ctx.strokeStyle = '#e7c56a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W * 0.30, H * 0.80);
    ctx.lineTo(W * 0.70, H * 0.80);
    ctx.stroke();
  } else {
    const cx = W / 2;
    const cy = H / 2;
    ctx.strokeStyle = '#f3ead7';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, H * 0.30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - H * 0.38);
    ctx.lineTo(cx, cy + H * 0.38);
    ctx.moveTo(cx - W * 0.20, cy);
    ctx.lineTo(cx + W * 0.20, cy);
    ctx.stroke();
    ctx.fillStyle = '#f6efe2';
    ctx.font = font(148);
    ctx.fillText(kind, cx, cy + 6);
    ctx.font = font(26);
    ctx.fillStyle = '#c8c0b4';
    ctx.fillText(kind, W * 0.12, H * 0.16);
  }
  return canvas;
}

function reelHeart(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.85);
  ctx.bezierCurveTo(-r * 1.35, -r * 0.1, -r * 0.5, -r * 1.15, 0, -r * 0.32);
  ctx.bezierCurveTo(r * 0.5, -r * 1.15, r * 1.35, -r * 0.1, 0, r * 0.85);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function letterMarquee(ctx, canvas, FONT, C) {
  const line = L('NOW SHOWING: FIRST DATE', 'HOY: PRIMERA CITA');
  const cut = line.indexOf(':');
  const top = cut > 0 ? line.slice(0, cut + 1) : line;
  const bot = cut > 0 ? line.slice(cut + 1).trim() : '';
  const font = (n) => `${n}px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8d3a32';
  const maxW = canvas.width * 0.70;
  if (!bot) {
    const size = fitSize(ctx, top, font, Math.round(canvas.height * 0.28), maxW);
    ctx.font = font(size);
    ctx.fillText(top, canvas.width * 0.5, canvas.height * 0.50);
    return;
  }
  const sa = fitSize(ctx, top, font, Math.round(canvas.height * 0.22), maxW);
  const sb = fitSize(ctx, bot, font, Math.round(canvas.height * 0.26), maxW);
  const s = Math.min(sa, sb);
  ctx.font = font(s);
  ctx.fillText(top, canvas.width * 0.5, canvas.height * 0.40);
  ctx.fillText(bot, canvas.width * 0.5, canvas.height * 0.64);
  void C;
}

function arrowNote(FONT, C, text) {
  const w = 640;
  const h = 280;
  const { canvas, ctx } = makePaint(w, h);
  ctx.strokeStyle = C.ink;
  ctx.fillStyle = C.ink;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  const y = 58;
  ctx.beginPath();
  ctx.moveTo(48, y);
  ctx.bezierCurveTo(220, y - 16, 520, y + 14, w - 48, y);
  ctx.stroke();
  head(ctx, 48, y, 1);
  head(ctx, w - 48, y, -1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `700 ${n}px ${FONT.hand}`, 58, w * 0.88);
  ctx.font = `700 ${size}px ${FONT.hand}`;
  ctx.fillText(text, w / 2, 138);
  return finish(canvas, 5, text.length);
}

function heartNote(FONT, C, text) {
  const w = 560;
  const h = 300;
  const { canvas, ctx } = makePaint(w, h);
  heartPath(ctx, w * 0.5, 58, 28, C.tomato);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitSize(ctx, text, (n) => `700 ${n}px ${FONT.hand}`, 58, w * 0.9);
  ctx.font = `700 ${size}px ${FONT.hand}`;
  ctx.fillText(text, w / 2, 160);
  return finish(canvas, 5, 7);
}

function bannerWords(FONT, C, text) {
  const w = 980;
  const h = 240;
  const { canvas, ctx } = makePaint(w, h);
  const font = (n) => `${n}px ${FONT.display}`;
  const parts = text.split(' ');
  const mid = Math.ceil(parts.length / 2);
  const a = parts.slice(0, mid).join(' ');
  const b = parts.slice(mid).join(' ');
  ctx.fillStyle = '#8d3a32';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sa = fitSize(ctx, a, font, 96, w * 0.92);
  const sb = b ? fitSize(ctx, b, font, 96, w * 0.92) : sa;
  const s = Math.min(sa, sb);
  ctx.font = font(s);
  if (b) {
    ctx.fillText(a, w / 2, h * 0.34);
    ctx.fillText(b, w / 2, h * 0.70);
  } else {
    ctx.fillText(a, w / 2, h * 0.52);
  }
  void C;
  return finish(canvas, 4, 11);
}

function thoughtBubble(FONT, C, text, vest) {
  const w = vest ? 760 : 640;
  const h = 300;
  const { canvas, ctx } = makePaint(w, h);
  ctx.fillStyle = '#fffaf1';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 8;
  blob(ctx, w * 0.52, h * 0.42, w * 0.40, h * 0.28);
  ctx.fill();
  ctx.stroke();
  // Tail down toward her head.
  ctx.beginPath();
  ctx.arc(w * 0.30, h * 0.78, 16, 0, Math.PI * 2);
  ctx.arc(w * 0.22, h * 0.90, 9, 0, Math.PI * 2);
  ctx.fill();
  if (vest) drawVest(ctx, C, w * 0.24, h * 0.42, 54);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (n) => `700 ${n}px ${FONT.hand}`;
  const maxW = vest ? w * 0.48 : w * 0.62;
  const cx = vest ? w * 0.60 : w * 0.52;
  const size = fitSize(ctx, text, font, 58, maxW);
  if (size < 40 && text.includes(' ')) {
    const words = text.split(' ');
    const cut = Math.ceil(words.length / 2);
    const a = words.slice(0, cut).join(' ');
    const b = words.slice(cut).join(' ');
    const s2 = Math.min(fitSize(ctx, a, font, 52, maxW), fitSize(ctx, b, font, 52, maxW));
    ctx.font = font(s2);
    ctx.fillText(a, cx, h * 0.34);
    ctx.fillText(b, cx, h * 0.52);
  } else {
    ctx.font = font(size);
    ctx.fillText(text, cx, h * 0.42);
  }
  return finish(canvas, 6, text.length + (vest ? 3 : 0));
}

function surpriseBubble(FONT, C, text) {
  const w = 860;
  const h = 320;
  const { canvas, ctx } = makePaint(w, h);
  ctx.fillStyle = '#fff4d2';
  ctx.strokeStyle = C.mustard;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.translate(w * 0.18, h * 0.30);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 46 : 24;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fffaf1';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 8;
  roundBox(ctx, w * 0.30, 28, w * 0.66, h * 0.62, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (n) => `700 ${n}px ${FONT.hand}`;
  const maxW = w * 0.58;
  const words = text.split(' ');
  const cut = Math.ceil(words.length / 2);
  const a = words.slice(0, cut).join(' ');
  const b = words.slice(cut).join(' ');
  const cx = w * 0.63;
  if (b) {
    const s = Math.min(fitSize(ctx, a, font, 52, maxW), fitSize(ctx, b, font, 52, maxW));
    ctx.font = font(s);
    ctx.fillText(a, cx, h * 0.32);
    ctx.fillText(b, cx, h * 0.50);
  } else {
    const s = fitSize(ctx, text, font, 54, maxW);
    ctx.font = font(s);
    ctx.fillText(text, cx, h * 0.40);
  }
  return finish(canvas, 6, 13);
}

function ribbonArt(paper, FONT, C, phrase) {
  const W = 1600;
  const H = 300;
  return paper.paint(W, H, (ctx) => {
    ctx.fillStyle = C.tomato;
    ctx.beginPath();
    ctx.moveTo(16, H * 0.50);
    ctx.lineTo(78, H * 0.20);
    ctx.lineTo(W - 78, H * 0.20);
    ctx.lineTo(W - 16, H * 0.50);
    ctx.lineTo(W - 78, H * 0.80);
    ctx.lineTo(78, H * 0.80);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.mustard;
    ctx.lineWidth = 12;
    ctx.stroke();
    const words = phrase.split(' ');
    const font = (n) => `${n}px ${FONT.display}`;
    ctx.font = font(120);
    let best = 1;
    let bestD = 1e9;
    for (let i = 1; i < words.length; i++) {
      const Lft = words.slice(0, i).join(' ');
      const Rgt = words.slice(i).join(' ');
      const d = Math.abs(ctx.measureText(Lft).width - ctx.measureText(Rgt).width);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const left = words.slice(0, best).join(' ');
    const right = words.slice(best).join(' ');
    const maxW = W * 0.40;
    const s = Math.min(fitSize(ctx, left, font, 118, maxW), fitSize(ctx, right, font, 118, maxW));
    ctx.font = font(s);
    ctx.fillStyle = C.cream;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText(left, W * 0.46, H * 0.52);
    ctx.textAlign = 'left';
    ctx.fillText(right, W * 0.54, H * 0.52);
  }, { dieCut: 8, grain: 0.04, seed: 17 });
}

function drawVest(ctx, C, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(-s * 0.28, -s * 0.34);
  ctx.lineTo(s * 0.28, -s * 0.34);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = C.vest;
  ctx.beginPath();
  ctx.moveTo(-s * 0.34, -s * 0.22);
  ctx.lineTo(s * 0.34, -s * 0.22);
  ctx.lineTo(s * 0.28, s * 0.48);
  ctx.lineTo(-s * 0.28, s * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.badge;
  ctx.fillRect(-s * 0.16, -s * 0.02, s * 0.32, s * 0.12);
  ctx.restore();
}

function heartPath(ctx, x, y, r, color) {
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

function head(ctx, x, y, dir) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dir * 26, y - 16);
  ctx.lineTo(x + dir * 26, y + 16);
  ctx.closePath();
  ctx.fill();
}

function blob(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
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

let paintPaper = null;

function bindPaper(paper) {
  paintPaper = paper;
}

function makePaint(w, h) {
  return paintPaper.makeCanvas(w, h);
}

function finish(canvas, margin, seed) {
  return paintPaper.paint(canvas.width, canvas.height, (ctx) => {
    ctx.drawImage(canvas, 0, 0);
  }, { dieCut: margin, grain: 0.04, seed });
}

function kernelGeometry(THREE) {
  const g = new THREE.PlaneGeometry(0.09, 0.11);
  g.translate(0, 0.055, 0);
  return g;
}

function kernelMaterial(THREE, paper) {
  return new THREE.MeshBasicMaterial({
    map: paper.texture(kernelCanvas(paper)),
    alphaTest: 0.4,
    depthWrite: false,
  });
}

function kernelCanvas(paper) {
  bindPaper(paper);
  const { canvas, ctx } = paper.makeCanvas(64, 80);
  ctx.fillStyle = '#f6edd9';
  ctx.beginPath();
  ctx.ellipse(32, 40, 18, 26, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e9b23e';
  ctx.lineWidth = 4;
  ctx.stroke();
  return canvas;
}

function sparkleCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  ctx.fillStyle = '#fff6d2';
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(38, 26);
  ctx.lineTo(60, 32);
  ctx.lineTo(38, 38);
  ctx.lineTo(32, 60);
  ctx.lineTo(26, 38);
  ctx.lineTo(4, 32);
  ctx.lineTo(26, 26);
  ctx.closePath();
  ctx.fill();
  return canvas;
}

function dotCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2a2118';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(32, 38, 15, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(22, 18, 6, 0, Math.PI * 2);
  ctx.arc(42, 18, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  return canvas;
}

function heartCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(128, 128);
  heartPath(ctx, 64, 68, 40, '#e2574c');
  return canvas;
}
