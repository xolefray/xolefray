// Spread 1 — "How we met". Coworkers on the shop floor, then the lunch-break table.
// Pop-up picture book. Times come from timeline.BEATS / SPREADS / NARRATION (never as literals).
// Drawings: characters/poses him-vest, her-vest, cycle "lunch"; set pieces in art/walmart/.
// update() allocates nothing. One shared mountain gamma so the store and the shelves nest.

const GAMMA = 1.78;
const OPEN = 0.985; // α/π above which rising hearts may leave the card plane
const STORE_H = 2.16;
const SHELF_H = 1.4;
const SHELF_W = 5.4;
const LUNCH_H = 1.55;
const HIM_H = 1.62;
const HER_H = 1.46;

function bump(t, at) {
  const u = (t - at) / 0.34;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
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

/** Bottom of the canvas sits on yBottom; the group's origin stays the feet. */
function plant(card, info, height, x, yBottom, z) {
  const s = height / info.h;
  card.position.set(x, yBottom + (info.h - info.feet[1]) * s, z);
  return s;
}

export default {
  id: 'walmart',
  title: 'How we met',
  build(ctx) {
    const { THREE, paper, popup, rng, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, NARRATION, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'walmart');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'walmart';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const nYes = NARRATION.find((n) => n.id === 'n04');
    const yesAt = nYes ? nYes.start : BEATS.coworkers;

    // ---------------------------------------------------------------- pages
    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const L = cloneCanvas(paper, art.canvas('page-left'));
      const R = cloneCanvas(paper, art.canvas('page-right'));
      paintLeftPage(L.ctx, L.canvas.width, L.canvas.height, FONT, C, rng);
      paintRightPage(R.ctx, R.canvas.width, R.canvas.height, FONT, C);
      leftArt = L.canvas;
      rightArt = R.canvas;
    } else {
      leftArt = paper.page((ctx, w, h) => {
        ctx.fillStyle = '#e7e1d4';
        ctx.fillRect(0, 0, w, h);
        paintLeftPage(ctx, w, h, FONT, C, rng);
      }, { seed: 11, tint: '#e7e1d4' });
      rightArt = paper.page((ctx, w, h) => {
        ctx.fillStyle = '#f3e2d2';
        ctx.fillRect(0, 0, w, h);
        paintRightPage(ctx, w, h, FONT, C);
      }, { seed: 12, tint: '#f3e2d2' });
    }

    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };

    // ---------------------------------------------------------------- back: store front (mountain vFold)
    const storeInfo = info('store-front');
    const storeW = storeInfo ? STORE_H * (storeInfo.w / storeInfo.h) : 5.68;
    const storeZ = -0.78;
    const store = track(popup.vFold({ z0: storeZ, gamma: GAMMA, width: storeW, height: STORE_H }));
    if (storeInfo) {
      const painted = cloneCanvas(paper, art.canvas('store-front'));
      paintWalmart(painted.ctx, painted.canvas.width, painted.canvas.height, FONT, C, rng);
      const cut = paper.dieCut(painted.canvas, { margin: 8 });
      const halves = paper.splitCard({ canvas: cut, width: storeW, height: STORE_H });
      halves.left.name = 'store-left';
      halves.right.name = 'store-right';
      store.left.add(halves.left);
      store.right.add(halves.right);
    } else {
      const flat = paper.paint(1024, 390, (ctx, w, h) => {
        ctx.fillStyle = '#7eb0d8';
        ctx.fillRect(24, 36, w - 48, h * 0.28);
        ctx.fillStyle = '#f3e6cf';
        ctx.fillRect(w * 0.22, h * 0.16, w * 0.56, h * 0.22);
        ctx.fillStyle = '#f6edd9';
        ctx.fillRect(24, h * 0.42, w - 48, h * 0.46);
        paintWalmart(ctx, w, h, FONT, C, rng);
      }, { dieCut: 8, seed: 2 });
      const halves = paper.splitCard({ canvas: flat, width: storeW, height: STORE_H });
      store.left.add(halves.left);
      store.right.add(halves.right);
    }

    // ---------------------------------------------------------------- mid: shelves, same gamma, in front of the store
    const shelves = track(popup.vFold({ z0: 0.02, gamma: GAMMA, width: SHELF_W, height: SHELF_H }));
    const shelfArtH = 1.16;
    let shelfLeft = null;
    let shelfRight = null;
    if (has('shelves-left')) {
      shelfLeft = characterArt.characterCard(paper, art, 'shelves-left', { height: shelfArtH });
      // Inner edge stays off the crease: card thickness at the gutter fails the fold angle.
      plant(shelfLeft, art.info('shelves-left'), shelfArtH, -1.62, 0, 0);
      shelfLeft.name = 'shelves-left';
      shelves.left.add(shelfLeft);
    }
    if (has('shelves-right')) {
      shelfRight = characterArt.characterCard(paper, art, 'shelves-right', { height: shelfArtH });
      plant(shelfRight, art.info('shelves-right'), shelfArtH, 1.55, 0, 0);
      shelfRight.name = 'shelves-right';
      shelves.right.add(shelfRight);
    }
    const sale = makeSale(paper, FONT, C);
    if (shelfLeft) {
      sale.position.set(0.35, 1.02, 0.008);
      shelfLeft.add(sale);
    }

    // ---------------------------------------------------------------- left page: the two in vests, boxes, carts, checkout
    const him = track(popup.standUp({
      side: 'left', x: 2.05, z: 0.62, fold: 'back', width: 0.52, height: HIM_H,
    }));
    const her = track(popup.standUp({
      side: 'left', x: 1.15, z: 0.8, fold: 'back', width: 0.58, height: HER_H,
    }));
    const himRig = new THREE.Group();
    himRig.name = 'him-vest';
    him.mount.add(himRig);
    const herRig = new THREE.Group();
    herRig.name = 'her-vest';
    her.mount.add(herRig);

    const himCard = characterArt.actor(paper, characters, figures, 'him-vest', {
      who: 'him', outfit: 'vest', pose: 'stand', facing: 'left',
    }, { height: HIM_H });
    const herCard = characterArt.actor(paper, characters, figures, 'her-vest', {
      who: 'her', outfit: 'vest', pose: 'stand', facing: 'right',
    }, { height: HER_H });
    if (himCard && characters && characters.has && characters.has('him-vest')) {
      plant(himCard, characters.info('him-vest'), HIM_H, 0, 0, 0);
    }
    if (herCard && characters && characters.has && characters.has('her-vest')) {
      plant(herCard, characters.info('her-vest'), HER_H, 0, 0, 0);
    }
    if (himCard) himRig.add(himCard);
    if (herCard) herRig.add(herCard);

    const hi = makeBubble(paper, FONT, 'hi', 280, 180, 3);
    const hiCard = paper.card({ canvas: hi, width: 0.34, height: 0.22, anchor: 'center' });
    hiCard.name = 'hi';
    // Pivot sits on her head. Scaling the pivot collapses the bubble there while folded;
    // open, the card itself floats just above her hair. −X is toward him.
    const hiPivot = new THREE.Group();
    hiPivot.name = 'hi-pivot';
    hiPivot.position.set(-0.02, 1.12, 0);
    hiCard.position.set(0, 0.32, 0.02);
    hiPivot.add(hiCard);
    herRig.add(hiPivot);

    // Knee-high, in the x-gap between her (outer ≈ 1.37) and him (gutter edge ≈ 1.82).
    // The drawing hangs toward local −X, which is the outer side of the left page.
    const boxes = track(popup.standUp({
      side: 'left', x: 1.50, z: 1.08, fold: 'back', width: 0.46, height: 0.48,
    }));
    if (has('boxes')) {
      const card = characterArt.characterCard(paper, art, 'boxes', { height: 0.48 });
      plant(card, art.info('boxes'), 0.48, 0, 0, 0);
      card.name = 'boxes';
      boxes.mount.add(card);
    }

    const carts = track(popup.standUp({
      side: 'left', x: 3.02, z: 1.18, fold: 'back', width: 1.16, height: 0.4,
    }));
    if (has('carts')) {
      const card = characterArt.characterCard(paper, art, 'carts', { height: 0.4 });
      plant(card, art.info('carts'), 0.4, 0, 0, 0);
      card.name = 'carts';
      carts.mount.add(card);
    }

    const checkout = track(popup.standUp({
      side: 'left', x: 3.08, z: -0.52, fold: 'front', width: 0.9, height: 0.88,
    }));
    if (has('checkout')) {
      const card = characterArt.characterCard(paper, art, 'checkout', { height: 0.88 });
      plant(card, art.info('checkout'), 0.88, 0, 0, 0);
      card.name = 'checkout';
      checkout.mount.add(card);
    }

    // "yes, really →" lies on the floor and pops in on that line.
    const yesNote = track(popup.onPage({ side: 'left', x: 0.58, z: 1.28, lift: 0.008 }));
    const yesCanvas = paper.paint(560, 200, (ctx, w, h) => {
      const font = (size) => `700 ${size}px ${FONT.hand}`;
      const size = fitSize(ctx, 'yes, really →', font, Math.round(h * 0.42), w * 0.86);
      ctx.font = font(size);
      ctx.fillStyle = '#9d3a3a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('yes, really →', w / 2, h * 0.48);
    }, { dieCut: 12, seed: 4, grain: 0.04 });
    const yesCard = paper.card({ canvas: yesCanvas, width: 0.72, height: 0.26, anchor: 'bottom-center' });
    yesCard.rotation.x = -Math.PI / 2;
    yesCard.name = 'yes-really';
    const yesPivot = new THREE.Group();
    yesPivot.add(yesCard);
    yesNote.mount.add(yesPivot);

    // ---------------------------------------------------------------- right page: lunch table (hero), vending, clock
    const lunch = track(popup.standUp({
      side: 'right', x: 1.95, z: 0.42, fold: 'back', width: 1.68, height: LUNCH_H,
    }));
    const lunchRig = new THREE.Group();
    lunchRig.name = 'lunch';
    lunch.mount.add(lunchRig);

    const cycle = characters && characters.cycle ? characters.cycle('lunch') : [];
    const flip = cycle.length
      ? characterArt.characterFlip(paper, characters, cycle, { height: LUNCH_H })
      : null;
    if (flip) {
      const ref = characters.info(cycle[0]);
      plant(flip.group, ref, LUNCH_H, 0, 0, 0);
      lunchRig.add(flip.group);
    } else {
      const sit = (who, x, facing) => {
        let card = null;
        try {
          card = figures.figureCard(paper, who, { outfit: 'vest', pose: 'sit', facing, scale: who === 'him' ? 0.9 : 0.82 });
        } catch {
          card = null;
        }
        if (!card) return;
        if (card.userData && card.userData.baseline) card.position.y = -card.userData.baseline;
        card.position.x = x;
        card.name = `${who}-sit`;
        lunchRig.add(card);
      };
      sit('her', -0.38, 'right');
      sit('him', 0.38, 'left');
    }

    const bubbles = {
      ha: placeBubble(paper, FONT, lunchRig, 'ha!', 300, 180, -0.52, 1.26, 5),
      dots: placeBubble(paper, FONT, lunchRig, '…', 240, 170, 0.22, 1.28, 6),
      heart: placeBubble(paper, FONT, lunchRig, '♥', 180, 160, -0.12, 1.34, 7),
      payHer: placeBubble(paper, FONT, lunchRig, "I'll pay!", 420, 190, -0.48, 1.2, 8),
      payHim: placeBubble(paper, FONT, lunchRig, "No, I'LL pay!", 460, 190, 0.16, 1.22, 9),
      paid: placeStamp(paper, FONT, lunchRig, 0.46, 1.42),
    };

    const steamTex = steamTexture(paper);
    const steams = [];
    const steamGeo = new THREE.PlaneGeometry(0.09, 0.16);
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: steamTex, transparent: true, depthWrite: false, toneMapped: false,
      });
      const mesh = new THREE.Mesh(steamGeo, mat);
      mesh.name = 'steam';
      mesh.castShadow = false;
      mesh.position.set(i === 0 ? -0.26 : 0.1, 0.86, 0.02);
      if (flip) flip.group.add(mesh);
      else lunchRig.add(mesh);
      steams.push(mesh);
    }

    const bits = new THREE.Group();
    bits.name = 'hearts';
    lunchRig.add(bits);
    const hearts = [];
    const heartMap = heartTex(paper);
    const hGeo = new THREE.PlaneGeometry(0.11, 0.1);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: heartMap,
        color: i % 2 ? C.blush : C.tomato,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(hGeo, mat);
      mesh.name = 'heart';
      mesh.castShadow = false;
      bits.add(mesh);
      hearts.push({
        mesh,
        x0: -0.42 + rng.next() * 0.7,
        z0: 0.02 + rng.next() * 0.03,
        phase: rng.next() * 6,
        delay: rng.next() * 0.55,
      });
    }

    const vending = track(popup.standUp({
      side: 'right', x: 3.12, z: -0.62, fold: 'front', width: 0.62, height: 1.16,
    }));
    if (has('vending')) {
      const card = characterArt.characterCard(paper, art, 'vending', { height: 1.16 });
      plant(card, art.info('vending'), 1.16, 0, 0, 0);
      card.name = 'vending';
      vending.mount.add(card);
    }

    // In front of the vending machine and clear of the lunch card's outer edge (≈ 2.62).
    const clock = track(popup.standUp({
      side: 'right', x: 3.05, z: 1.16, fold: 'back', width: 0.56, height: 0.55,
    }));
    const clockRig = new THREE.Group();
    clockRig.name = 'clock';
    clock.mount.add(clockRig);
    let clockCard = null;
    if (has('clock')) {
      clockCard = characterArt.characterCard(paper, art, 'clock', { height: 0.55 });
      plant(clockCard, art.info('clock'), 0.55, 0, 0, 0);
      clockCard.name = 'clock-face';
      clockRig.add(clockCard);
    } else {
      const face = paper.paint(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#f6edd9';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#6b4630';
        ctx.lineWidth = 8;
        ctx.stroke();
      }, { dieCut: 8, seed: 3 });
      const card = paper.card({ canvas: face, width: 0.5, height: 0.5, anchor: 'bottom-center' });
      clockCard = card;
      clockRig.add(card);
    }
    const handGeo = new THREE.PlaneGeometry(0.016, 0.16);
    handGeo.translate(0, 0.07, 0);
    const hourGeo = new THREE.PlaneGeometry(0.02, 0.1);
    hourGeo.translate(0, 0.04, 0);
    const handMat = new THREE.MeshBasicMaterial({ color: '#3a2f2a', side: THREE.DoubleSide });
    const minute = new THREE.Mesh(handGeo, handMat);
    const hour = new THREE.Mesh(hourGeo, handMat);
    minute.name = 'minute-hand';
    hour.name = 'hour-hand';
    minute.castShadow = false;
    hour.castShadow = false;
    // Hub in feet-space: 730×740 face, feet (365, 715), height 0.55 → centre ≈ (0, 0.256).
    // Parent is the planted card, so this is already above the hinge.
    const hubY = clockCard && clockCard !== clockRig ? 0.256 : 0.27;
    minute.position.set(0, hubY, 0.012);
    hour.position.set(0, hubY, 0.014);
    (clockCard || clockRig).add(minute, hour);

    const glow = new THREE.PointLight('#ffd0a4', 0, 7, 2);
    glow.name = 'warm-lights';
    glow.castShadow = false;
    glow.position.set(0.4, 1.45, 0.35);
    group.add(glow);

    const state = { frame: 0 };
    const lunchBeat = BEATS.lunch;
    const pay = BEATS.payArgument;
    const wins = BEATS.heWins;
    const food = BEATS.foodUntouched;
    const sparks = BEATS.sparks;

    const signT = spread.open + 0.5;
    const lunchCue = lunchBeat + 0.2;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 0.45, at: [0, 0.7, 0], size: 7.5, from: 'front' },
        { t: signT, hold: 2.3, at: [0, 1.55, -0.5], size: 4, from: 'front' },
        { t: BEATS.coworkers, hold: 2.1, at: [-1.6, 0.85, 0.7], size: 2.2, from: 'front' },
        { t: lunchCue, hold: (wins + 1) - lunchCue, at: [1.9, 0.82, 0.4], size: 2.4, from: 'front' },
        { t: sparks, hold: (spread.close - 0.7) - sparks, at: [1.85, 0.95, 0.4], size: 1.8, from: 'front' },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const open = alpha > OPEN * Math.PI ? 1 : 0;
        const risen = popup.rise(alpha);

        const turn = smoothstep(BEATS.coworkers, BEATS.coworkers + 0.5, t);
        // Yaw swings the card out of its plane. That only stays inside the page
        // wedge near fully open, so the turn eases in with α.
        const posed = smoothstep(0.9 * Math.PI, 0.99 * Math.PI, alpha);
        const hop = bump(t, BEATS.coworkers) * posed;
        const bobH = (Math.sin(t * 1.8) * 0.5 + 0.5) * 0.012 * posed + hop * 0.04;
        const bobS = (Math.sin(t * 1.8 + 1.2) * 0.5 + 0.5) * 0.012 * posed + hop * 0.035;
        himRig.position.y = bobH;
        herRig.position.y = bobS;
        const breathe = 1 + Math.sin(t * 1.6) * 0.012 * posed;
        himRig.scale.set(breathe, breathe + hop * 0.05, 1);
        herRig.scale.set(breathe, breathe + hop * 0.04, 1);
        // Open left page: mount +X is world +X, toward the gutter. He (outer) looks +X; she looks −X.
        himRig.rotation.y = 0.7 * turn * posed;
        herRig.rotation.y = -0.62 * turn * posed;

        const hiIn = smoothstep(BEATS.coworkers, BEATS.coworkers + 0.28, t);
        const hiOut = 1 - smoothstep(lunchBeat - 0.2, lunchBeat + 0.2, t);
        hiPivot.scale.setScalar(clamp(ease.outBack(hiIn), 0, 1.1) * hiOut * posed);

        let frame = 0;
        if (t >= wins) frame = 2;
        else if (t >= pay) frame = 1;
        if (flip && frame !== state.frame) {
          flip.show(frame);
          state.frame = frame;
        }
        const pop = bump(t, lunchBeat) * 0.7 + bump(t, pay) + bump(t, wins) + bump(t, sparks) * 0.55;
        const lb = 1 + Math.sin(t * 1.55) * 0.012;
        lunchRig.scale.set(lb * (1 - 0.055 * pop), lb * (1 + 0.09 * pop), 1);

        const chat = smoothstep(lunchBeat, lunchBeat + 0.3, t) * (1 - smoothstep(pay - 0.25, pay + 0.15, t));
        bubbles.ha.scale.setScalar(clamp(ease.outBack(smoothstep(lunchBeat, lunchBeat + 0.35, t)), 0, 1.08) * (chat > 0 ? 1 : 0));
        bubbles.dots.scale.setScalar(clamp(ease.outBack(smoothstep(lunchBeat + 0.45, lunchBeat + 0.8, t)), 0, 1.08) * (chat > 0 ? 1 : 0));
        bubbles.heart.scale.setScalar(clamp(ease.outBack(smoothstep(lunchBeat + 0.7, lunchBeat + 1.05, t)), 0, 1.08) * chat);

        const argue = smoothstep(pay, pay + 0.28, t) * (1 - smoothstep(wins - 0.2, wins + 0.12, t));
        bubbles.payHer.scale.setScalar(clamp(ease.outBack(smoothstep(pay, pay + 0.32, t)), 0, 1.08) * (argue > 0 ? 1 : 0));
        bubbles.payHim.scale.setScalar(clamp(ease.outBack(smoothstep(pay + 0.35, pay + 0.7, t)), 0, 1.08) * (argue > 0 ? 1 : 0));
        const won = smoothstep(wins, wins + 0.3, t);
        bubbles.paid.scale.setScalar(clamp(ease.outBack(won), 0, 1.08));

        const fadeSteam = 1 - smoothstep(food, food + 1.3, t);
        for (let i = 0; i < steams.length; i++) {
          const wob = 0.85 + 0.15 * Math.sin(t * (3.2 + i) + i);
          steams[i].material.opacity = fadeSteam * wob * (0.35 + 0.65 * smoothstep(lunchBeat, lunchBeat + 0.4, t));
          steams[i].position.y = 0.84 + Math.sin(t * 2.4 + i * 2) * 0.02;
          steams[i].scale.y = 0.85 + 0.2 * Math.sin(t * 4 + i);
        }

        // Hands rest at about ten past twelve, then the minute hand sweeps once the food is forgotten.
        const sweep = smoothstep(food, food + 2.6, t);
        minute.rotation.z = -0.55 + sweep * 5.4 + Math.sin(t * 0.6) * 0.02;
        hour.rotation.z = -1.15 + sweep * 0.55;

        bits.scale.setScalar(open && t >= sparks ? 1 : 0);
        poseHearts(hearts, t, sparks);

        let ys = ease.outBack(smoothstep(yesAt, yesAt + 0.45, t));
        if (ys < 0) ys = 0;
        else if (ys > 1.06) ys = 1.06;
        yesPivot.scale.setScalar(ys);

        glow.intensity = risen * smoothstep(sparks, sparks + 0.8, t) * 2.4;
      },
    };
  },
};

function paintWalmart(ctx, w, h, FONT, C, rng) {
  // Blank sign panel measured on store-front.webp: x 0.16–0.84, y 0.17–0.39.
  const font = (size) => `${size}px ${FONT.display}`;
  const size = fitSize(ctx, 'WALMART', font, Math.round(h * 0.16), w * 0.6);
  const colors = [C.tomato, C.mustard, C.teal, C.sky, C.leaf, C.blush, C.cream];
  cutWord(ctx, 'WALMART', w * 0.5, h * 0.28, size, FONT, colors, rng);
}

function cutWord(ctx, text, cx, cy, px, FONT, colors, rng) {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.font = `${px}px ${FONT.display}`;
  const gap = px * 0.045;
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + gap;
  total -= gap;
  let x = cx - total / 2;
  let i = 0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(x + w / 2, cy);
    ctx.rotate((rng.next() - 0.5) * 0.06);
    ctx.lineWidth = px * 0.14;
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

function paintLeftPage(ctx, w, h, FONT, C, rng) {
  // Gutter is the right edge; keep the inner 6% empty. Title sits near the reader, outer side.
  const font = (size) => `${size}px ${FONT.display}`;
  const size = fitSize(ctx, 'How we met', font, Math.round(h * 0.075), w * 0.46);
  const colors = [C.tomato, C.mustard, C.teal, C.sky, C.leaf, C.blush];
  // Front floor. The box stack covers only the tail of "met" (seen in the film frame).
  cutWord(ctx, 'How we met', w * 0.46, h * 0.76, size, FONT, colors, rng);

  const hand = (px) => `700 ${px}px ${FONT.hand}`;
  const yes = fitSize(ctx, 'yes, really →', hand, Math.round(h * 0.055), w * 0.36);
  ctx.font = hand(yes);
  ctx.fillStyle = '#9d3a3a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('yes, really →', w * 0.12, h * 0.62);

  // A blank price-tag doodle, far and away from the gutter.
  ctx.save();
  ctx.translate(w * 0.18, h * 0.22);
  ctx.rotate(-0.18);
  ctx.fillStyle = C.mustard;
  ctx.strokeStyle = '#3a2f2a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(46, -16);
  ctx.lineTo(40, 22);
  ctx.lineTo(-8, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(8, -8, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#f6edd9';
  ctx.fill();
  ctx.restore();
}

function paintRightPage(ctx, w, h, FONT, C) {
  // Gutter is the left edge. Note and receipt sit on the outer half.
  ctx.save();
  ctx.translate(w * 0.70, h * 0.58);
  ctx.rotate(0.06);
  ctx.fillStyle = 'rgba(232, 210, 150, 0.9)';
  ctx.fillRect(-26, -108, 52, 18);
  ctx.fillStyle = '#f7f3e8';
  ctx.strokeStyle = '#c9bfae';
  ctx.lineWidth = 2;
  ctx.fillRect(-62, -96, 124, 168);
  ctx.strokeRect(-62, -96, 124, 168);
  ctx.strokeStyle = '#e0d6c6';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-46, -64 + i * 22);
    ctx.lineTo(46, -60 + i * 22);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(w * 0.40, h * 0.70);
  ctx.rotate(-0.04);
  const font = (size) => `700 ${size}px ${FONT.hand}`;
  const size = fitSize(ctx, 'lunch break!', font, Math.round(h * 0.07), w * 0.4);
  ctx.font = font(size);
  ctx.fillStyle = '#9d3a3a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('lunch break!', 0, 0);
  ctx.restore();

  // Tiny doodled clock, far outer corner (the sweeping clock is a pop-up).
  ctx.save();
  ctx.translate(w * 0.86, h * 0.16);
  ctx.strokeStyle = '#6b4630';
  ctx.fillStyle = '#f6edd9';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(0, -14);
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 4);
  ctx.stroke();
  ctx.restore();
}

function makeBubble(paper, FONT, text, w, h, seed) {
  return paper.paint(w, h, (ctx, W, H) => {
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, text, font, Math.round(H * 0.34), W * 0.78);
    ctx.fillStyle = '#fffdf8';
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = Math.max(4, H * 0.04);
    ctx.beginPath();
    ctx.roundRect(W * 0.08, H * 0.06, W * 0.84, H * 0.66, H * 0.22);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 0.30, H * 0.70);
    ctx.lineTo(W * 0.24, H * 0.96);
    ctx.lineTo(W * 0.48, H * 0.70);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = font(size);
    ctx.fillStyle = '#3a2f2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W * 0.5, H * 0.38);
  }, { dieCut: 8, seed, grain: 0.04 });
}

function placeBubble(paper, FONT, parent, text, w, h, x, y, seed) {
  const canvas = makeBubble(paper, FONT, text, w, h, seed);
  const card = paper.card({
    canvas,
    width: 0.34 * (w / 300),
    height: 0.2 * (h / 180),
    anchor: 'center',
  });
  card.name = text;
  card.position.set(x, y, 0.025);
  card.scale.setScalar(0);
  parent.add(card);
  return card;
}

function placeStamp(paper, FONT, parent, x, y) {
  const canvas = paper.paint(280, 220, (ctx, w, h) => {
    ctx.fillStyle = '#e9b23e';
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.46, h * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.moveTo(w * 0.38, h * 0.46);
    ctx.lineTo(w * 0.47, h * 0.56);
    ctx.lineTo(w * 0.64, h * 0.34);
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, 'paid', font, Math.round(h * 0.2), w * 0.5);
    ctx.font = font(size);
    ctx.fillStyle = '#3a2f2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('paid', w * 0.5, h * 0.7);
  }, { dieCut: 8, seed: 10, grain: 0.04 });
  const card = paper.card({ canvas, width: 0.32, height: 0.25, anchor: 'center' });
  card.name = 'paid';
  card.position.set(x, y, 0.03);
  card.scale.setScalar(0);
  parent.add(card);
  return card;
}

function makeSale(paper, FONT, C) {
  const canvas = paper.paint(220, 200, (ctx, w, h) => {
    ctx.fillStyle = C.mustard;
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    const cx = w / 2;
    const cy = h * 0.46;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 2 === 0 ? h * 0.4 : h * 0.22;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, 'sale!', font, Math.round(h * 0.24), w * 0.62);
    ctx.font = font(size);
    ctx.fillStyle = '#3a2f2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('sale!', cx, cy);
  }, { dieCut: 6, seed: 14, grain: 0.04 });
  const card = paper.card({ canvas, width: 0.32, height: 0.29, anchor: 'center' });
  card.name = 'sale';
  return card;
}

function steamTexture(paper) {
  const { canvas, ctx } = paper.makeCanvas(32, 64);
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(16, 34, 8, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  return paper.texture(canvas);
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

function poseHearts(hearts, t, at) {
  for (let i = 0; i < hearts.length; i++) {
    const p = hearts[i];
    const age = t - at - p.delay;
    const y = age > 0 ? 0.7 + Math.min(0.85, age * 0.32) : 0.7;
    p.mesh.position.set(p.x0 + Math.sin(t * 1.3 + p.phase) * 0.06, y, p.z0);
    p.mesh.material.opacity = age <= 0 ? 0 : Math.max(0, 1 - (y - 0.7) / 1.0);
    p.mesh.rotation.z = Math.sin(t * 1.15 + p.phase) * 0.25;
  }
}
