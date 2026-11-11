// Spread 1 — "Where it all began". The whole floor is the shop.
// Coworkers, then they pass in the aisle, then shy / kind / curious, then the two of them talking.
// Times come from timeline.BEATS / SPREADS. Lettering goes through L().
// Drawings: him-vest, her-vest, him-cart, her-walkby, her-shy, him-kind, vest-chat.
// Lunch, the receipt, the clock and the vending machine live on the lunch spread now.
// update() allocates nothing. One shared mountain gamma so the store and the shelves nest.

import { L } from '../i18n.js';
import { photoPrint, PHOTO_ASPECT } from '../photos.js';

const GAMMA = 1.78;
const STORE_H = 2.16;
const SHELF_H = 1.4;
const SHELF_ART_H = 1.16;
const SHELF_W = 5.4;

const HIM_H = 1.58;
const HER_H = 1.52;
const CART_H = 1.34;
const WALK_H = 1.22;
const SHY_H = 1.66;
const KIND_H = 1.68;
const CHAT_H = 1.68;

const PASS1 = 2.15;
const PASS_GAP = 0.26;
const PASS2 = 1.5;

function bump(t, at, dur = 0.34) {
  const u = (t - at) / dur;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

function fitSize(ctx, text, font, px, maxW) {
  let size = px;
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  if (w > maxW) size *= maxW / w;
  return size;
}

function cloneCanvas(paper, src) {
  const { canvas, ctx } = paper.makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return { canvas, ctx };
}

/** Feet of a characterCard group sit on the hinge; the canvas bottom does not dip below it. */
function seat(group, info, height) {
  if (!group || !info) return;
  group.position.y = (info.h - info.feet[1]) * (height / info.h);
}

export default {
  id: 'walmart',
  title: 'Where it all began',
  build(ctx) {
    const { THREE, paper, popup, rng, figures, FONT, timeline, characters, characterArt, art, photos } = ctx;
    const { BEATS, SPREADS, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'walmart');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'walmart';

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const hasCh = (id) => !!(characters && characters.has && characters.has(id));

    // ---------------------------------------------------------------- pages
    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const Lpage = cloneCanvas(paper, art.canvas('page-left'));
      const Rpage = cloneCanvas(paper, art.canvas('page-right'));
      paintLeftPage(Lpage.ctx, Lpage.canvas.width, Lpage.canvas.height, FONT, C, rng);
      paintRightPage(Rpage.ctx, Rpage.canvas.width, Rpage.canvas.height, FONT, C);
      leftArt = Lpage.canvas;
      rightArt = Rpage.canvas;
    } else {
      leftArt = paper.page((ctx, w, h) => {
        ctx.fillStyle = '#e4e0d4';
        ctx.fillRect(0, 0, w, h);
        paintLeftPage(ctx, w, h, FONT, C, rng);
      }, { seed: 11, tint: '#e4e0d4' });
      rightArt = paper.page((ctx, w, h) => {
        ctx.fillStyle = '#e4e0d4';
        ctx.fillRect(0, 0, w, h);
        paintRightPage(ctx, w, h, FONT, C);
      }, { seed: 12, tint: '#e4e0d4' });
    }

    const mechanisms = [];
    const track = (m) => {
      mechanisms.push(m);
      group.add(m.object);
      return m;
    };

    const addProp = (mount, id, height) => {
      if (!has(id)) return null;
      const card = characterArt.characterCard(paper, art, id, { height });
      if (!card) return null;
      seat(card, art.info(id), height);
      card.name = id;
      mount.add(card);
      return card;
    };

    // ---------------------------------------------------------------- back: store front
    const storeInfo = info('store-front');
    const storeW = storeInfo ? STORE_H * (storeInfo.w / storeInfo.h) : 5.68;
    const store = track(popup.vFold({ z0: -0.78, gamma: GAMMA, width: storeW, height: STORE_H }));
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
        ctx.fillStyle = '#f6edd9';
        ctx.fillRect(24, h * 0.42, w - 48, h * 0.46);
        paintWalmart(ctx, w, h, FONT, C, rng);
      }, { dieCut: 8, seed: 2 });
      const halves = paper.splitCard({ canvas: flat, width: storeW, height: STORE_H });
      store.left.add(halves.left);
      store.right.add(halves.right);
    }

    // ---------------------------------------------------------------- mid: shelves, same gamma
    const shelves = track(popup.vFold({ z0: 0.02, gamma: GAMMA, width: SHELF_W, height: SHELF_H }));
    if (has('shelves-left')) {
      const shelfLeft = addProp(shelves.left, 'shelves-left', SHELF_ART_H);
      if (shelfLeft) {
        const meta = art.info('shelves-left');
        const s = SHELF_ART_H / meta.h;
        shelfLeft.position.x = -1.62;
        shelfLeft.position.y = (meta.h - meta.feet[1]) * s;
        const sale = makeSale(THREE, paper, FONT, C);
        sale.position.set(0.42, 1.02, 0.02);
        shelfLeft.add(sale);
      }
    }
    if (has('shelves-right')) {
      const shelfRight = addProp(shelves.right, 'shelves-right', SHELF_ART_H);
      if (shelfRight) {
        const meta = art.info('shelves-right');
        shelfRight.position.x = 1.55;
        shelfRight.position.y = (meta.h - meta.feet[1]) * (SHELF_ART_H / meta.h);
      }
    }

    // ---------------------------------------------------------------- set dressing (real folds, always up)
    // His station: the stack sits just behind him, nearer the gutter than the rack.
    const boxes = track(popup.standUp({
      side: 'left', x: 1.92, z: 0.36, fold: 'back', width: 0.48, height: 0.52,
    }));
    const boxesRig = new THREE.Group();
    boxesRig.name = 'boxes';
    boxes.mount.add(boxesRig);
    addProp(boxesRig, 'boxes', 0.52);

    const rackH = 0.7;
    const rackW = has('shirt-rack') ? rackH * (art.info('shirt-rack').w / art.info('shirt-rack').h) : 1.26;
    const shirts = track(popup.standUp({
      side: 'left', x: 2.85, z: 0.28, fold: 'back', width: rackW, height: rackH,
    }));
    addProp(shirts.mount, 'shirt-rack', rackH);

    const endH = 1.12;
    const endW = has('end-cap') ? endH * (art.info('end-cap').w / art.info('end-cap').h) : 0.85;
    const endCap = track(popup.standUp({
      side: 'right', x: 1.62, z: 0.12, fold: 'back', width: endW, height: endH,
    }));
    addProp(endCap.mount, 'end-cap', endH);

    const deskH = 0.86;
    const deskW = has('checkout') ? deskH * (art.info('checkout').w / art.info('checkout').h) : 0.87;
    const checkout = track(popup.standUp({
      side: 'right', x: 2.72, z: 0.22, fold: 'back', width: deskW, height: deskH,
    }));
    addProp(checkout.mount, 'checkout', deskH);

    const cartH = 0.38;
    const cartW = has('carts') ? cartH * (art.info('carts').w / art.info('carts').h) : 1.1;
    const cartX = 2.48;
    const carts = track(popup.standUp({
      side: 'right', x: cartX, z: 0.28, fold: 'back', width: cartW, height: cartH,
    }));
    const cartsRig = new THREE.Group();
    cartsRig.name = 'carts';
    carts.mount.add(cartsRig);
    addProp(cartsRig, 'carts', cartH);

    const wetH = 0.52;
    const wetW = has('wet-floor') ? wetH * (art.info('wet-floor').w / art.info('wet-floor').h) : 0.48;
    const wet = track(popup.standUp({
      side: 'right', x: 1.95, z: 0.16, fold: 'back', width: wetW, height: wetH,
    }));
    addProp(wet.mount, 'wet-floor', wetH);

    // ---------------------------------------------------------------- coworkers
    // Near the gutter and the reader, still at the box station. Loose stand-up: h ≤ 2·(x − w/2).
    const him = track(popup.standUp({
      side: 'left', x: 1.12, z: 1.10, fold: 'back', width: 0.52, height: HIM_H,
    }));
    const himRig = new THREE.Group();
    himRig.name = 'him-vest';
    him.mount.add(himRig);
    const himCard = characterArt.actor(paper, characters, figures, 'him-vest', {
      who: 'him', outfit: 'vest', pose: 'stand', facing: 'right',
    }, { height: HIM_H });
    if (himCard) {
      if (hasCh('him-vest')) seat(himCard, characters.info('him-vest'), HIM_H);
      himCard.name = 'him-vest';
      himRig.add(himCard);
    }
    const brianBadge = decal(THREE, paper, badgeCanvas(paper, FONT, 'Brian'), 0.46, 0.16);
    brianBadge.name = 'brian-badge';
    brianBadge.position.set(-0.02, HIM_H + 0.02, 0.03);
    himRig.add(brianBadge);

    // Her cart station, mirroring him across the gutter.
    const her = track(popup.standUp({
      side: 'right', x: 1.22, z: 1.14, fold: 'back', width: 0.62, height: HER_H,
    }));
    const herRig = new THREE.Group();
    herRig.name = 'her-vest';
    her.mount.add(herRig);
    const herCard = characterArt.actor(paper, characters, figures, 'her-vest', {
      who: 'her', outfit: 'vest', pose: 'stand', facing: 'left',
    }, { height: HER_H });
    if (herCard) {
      if (hasCh('her-vest')) seat(herCard, characters.info('her-vest'), HER_H);
      herCard.name = 'her-vest';
      herRig.add(herCard);
    }
    const marlinBadge = decal(THREE, paper, badgeCanvas(paper, FONT, 'Marlin'), 0.52, 0.16);
    marlinBadge.name = 'marlin-badge';
    marlinBadge.position.set(0.04, HER_H + 0.02, 0.03);
    herRig.add(marlinBadge);

    const spark = decal(THREE, paper, sparkCanvas(paper, C), 0.28, 0.28);
    spark.name = 'scan';
    spark.position.set(0.22, 0.95, 0.04);
    himRig.add(spark);

    // ---------------------------------------------------------------- the taped print (right page, front, in the coworkers view)
    const shot = photoPrint(photos ? photos.walmart : null, {
      width: 680,
      style: 'polaroid',
      caption: L('Walmart days', 'Los días de Walmart'),
      tilt: -0.07,
      tape: true,
      aspect: PHOTO_ASPECT.walmart,
      seed: 7,
    });
    const shotRatio = shot.width / shot.height;
    // Beside her, in the same front band as the two vests, so a size-4 cue holds all three.
    // It scales away when they start passing, which keeps it off vest-chat.
    let photoH = 1.02;
    let photoW = photoH * shotRatio;
    const photoX = 2.12;
    const photoZ = 1.18;
    const photoLim = popup.standUpLimits({ x: photoX, z: photoZ, width: photoW, fold: 'back' });
    if (photoH > photoLim.maxHeightLoose) {
      photoH = photoLim.maxHeightLoose * 0.96;
      photoW = photoH * shotRatio;
    }
    const photo = track(popup.standUp({
      side: 'right', x: photoX, z: photoZ, fold: 'back', width: photoW, height: photoH,
    }));
    const photoPivot = new THREE.Group();
    photoPivot.name = 'walmart-photo';
    const photoCard = paper.card({
      canvas: paper.dieCut(shot, { margin: 6 }),
      width: photoW,
      height: photoH,
      anchor: 'bottom-center',
    });
    photoCard.name = 'walmart-photo';
    photoPivot.add(photoCard);
    photo.mount.add(photoPivot);

    // ---------------------------------------------------------------- passing, along the front aisle, crossing the gutter
    const pathHim = [[1.55, 0.4], [0.04, 0.48], [-1.55, 0.38]];
    const pathHer = [[-1.42, 0.74], [-0.04, 0.66], [1.42, 0.72]];
    const himSlide = popup.slider({ side: 'spread', path: pathHim, lift: 0.012, smooth: false });
    const herSlide = popup.slider({ side: 'spread', path: pathHer, lift: 0.014, smooth: false });
    group.add(himSlide.object, herSlide.object);

    const himAlign = new THREE.Group();
    himAlign.name = 'him-cart-align';
    himSlide.mount.add(himAlign);
    const himPass = new THREE.Group();
    himPass.name = 'him-cart';
    himAlign.add(himPass);
    const himCart = characterArt.actor(paper, characters, figures, 'him-cart', {
      who: 'him', outfit: 'vest', pose: 'walk', facing: 'right',
    }, { height: CART_H });
    if (himCart) {
      if (hasCh('him-cart')) seat(himCart, characters.info('him-cart'), CART_H);
      himCart.name = 'him-cart';
      himPass.add(himCart);
    }
    const herAlign = new THREE.Group();
    herAlign.name = 'her-walk-align';
    herSlide.mount.add(herAlign);
    const herPass = new THREE.Group();
    herPass.name = 'her-walkby';
    herAlign.add(herPass);
    const herWalk = characterArt.actor(paper, characters, figures, 'her-walkby', {
      who: 'her', outfit: 'vest', pose: 'walk', facing: 'right',
    }, { height: WALK_H });
    if (herWalk) {
      if (hasCh('her-walkby')) seat(herWalk, characters.info('her-walkby'), WALK_H);
      herWalk.name = 'her-walkby';
      herPass.add(herWalk);
    }
    const hiHim = decal(THREE, paper, bubbleCanvas(paper, FONT, L('hi', 'hola'), 280, 180, 0.5), 0.32, 0.2);
    hiHim.name = 'hi-him';
    hiHim.position.set(0.16, CART_H + 0.14, 0.05);
    himPass.add(hiHim);
    const hiHer = decal(THREE, paper, bubbleCanvas(paper, FONT, L('hi', 'hola'), 280, 180, 0.42), 0.32, 0.2);
    hiHer.name = 'hi-her';
    hiHer.position.set(-0.12, WALK_H * 0.9, 0.05);
    herPass.add(hiHer);

    // ---------------------------------------------------------------- shy / kind
    const shy = track(popup.standUp({
      side: 'right', x: 1.38, z: 0.7, fold: 'back', width: 0.62, height: SHY_H,
    }));
    const shyRig = new THREE.Group();
    shyRig.name = 'her-shy';
    shy.mount.add(shyRig);
    const shyCard = characterArt.actor(paper, characters, figures, 'her-shy', {
      who: 'her', outfit: 'vest', pose: 'stand', facing: 'left',
    }, { height: SHY_H });
    if (shyCard) {
      if (hasCh('her-shy')) seat(shyCard, characters.info('her-shy'), SHY_H);
      shyCard.name = 'her-shy';
      shyRig.add(shyCard);
    }
    const blush = decal(THREE, paper, blushCanvas(paper), 0.16, 0.1);
    blush.name = 'blush';
    blush.position.set(-0.07, SHY_H * 0.78, 0.04);
    shyRig.add(blush);
    const shyDots = decal(THREE, paper, bubbleCanvas(paper, FONT, '…', 240, 180, 0.5), 0.28, 0.21);
    shyDots.name = 'shy-dots';
    shyDots.position.set(0.16, SHY_H + 0.02, 0.04);
    shyRig.add(shyDots);
    const shyTag = decal(THREE, paper, tagCanvas(paper, FONT, L('a little shy', 'un poco tímida')), 0.92, 0.24);
    shyTag.name = 'shy-tag';
    shyTag.position.set(0.64, SHY_H * 0.58, 0.03);
    shyRig.add(shyTag);

    const kind = track(popup.standUp({
      side: 'left', x: 1.48, z: 0.68, fold: 'back', width: 0.64, height: KIND_H,
    }));
    const kindRig = new THREE.Group();
    kindRig.name = 'him-kind';
    kind.mount.add(kindRig);
    const kindCard = characterArt.actor(paper, characters, figures, 'him-kind', {
      who: 'him', outfit: 'vest', pose: 'wave', facing: 'right',
    }, { height: KIND_H });
    if (kindCard) {
      if (hasCh('him-kind')) seat(kindCard, characters.info('him-kind'), KIND_H);
      kindCard.name = 'him-kind';
      kindRig.add(kindCard);
    }
    const kindBubble = decal(
      THREE, paper,
      bubbleCanvas(paper, FONT, L('Hi! Need a hand?', '¡Hola! ¿Te ayudo?'), 920, 300, 0.34),
      1.18, 0.38,
    );
    kindBubble.name = 'kind-bubble';
    kindBubble.position.set(-0.12, KIND_H + 0.06, 0.04);
    kindRig.add(kindBubble);
    const kindTag = decal(THREE, paper, tagCanvas(paper, FONT, L('easy to talk to', 'muy fácil de tratar')), 1.12, 0.26);
    kindTag.name = 'kind-tag';
    kindTag.position.set(-0.58, KIND_H * 0.62, 0.03);
    kindRig.add(kindTag);

    // ---------------------------------------------------------------- question marks that become hearts, between them
    const marks = new THREE.Group();
    marks.name = 'marks';
    marks.position.set(0, 0, 0.66);
    group.add(marks);
    const qMap = paper.texture(questionCanvas(paper, FONT));
    const hMap = paper.texture(heartCanvas(paper));
    const markGeo = new THREE.PlaneGeometry(0.24, 0.26);
    const MARKS = [
      { x: -0.22, delay: 0.1 },
      { x: 0.04, delay: 0.72 },
      { x: 0.26, delay: 1.34 },
      { x: -0.02, delay: 1.96 },
    ];
    const markMeshes = [];
    for (let i = 0; i < MARKS.length; i++) {
      const qMat = new THREE.MeshBasicMaterial({
        map: qMap, transparent: true, depthWrite: false, toneMapped: false,
      });
      const hMat = new THREE.MeshBasicMaterial({
        map: hMap, color: i % 2 ? C.blush : C.tomato, transparent: true, depthWrite: false, toneMapped: false,
      });
      const qMesh = new THREE.Mesh(markGeo, qMat);
      const hMesh = new THREE.Mesh(markGeo, hMat);
      qMesh.name = 'question';
      hMesh.name = 'mark-heart';
      qMesh.castShadow = false;
      hMesh.castShadow = false;
      qMesh.renderOrder = 3;
      hMesh.renderOrder = 3;
      marks.add(qMesh, hMesh);
      markMeshes.push({ q: qMesh, h: hMesh, x: MARKS[i].x, delay: MARKS[i].delay, phase: i * 1.3 });
    }

    // ---------------------------------------------------------------- vest-chat, the hero
    const chatW = hasCh('vest-chat') ? CHAT_H * (characters.info('vest-chat').w / characters.info('vest-chat').h) : 1.12;
    // As close to centre as the loose stand-up limit allows, and forward toward the reader.
    const chatX = Math.max(1.50, CHAT_H / 2 + chatW / 2 + 0.08);
    const chat = track(popup.standUp({
      side: 'right', x: chatX, z: 1.16, fold: 'back', width: chatW, height: CHAT_H,
    }));
    const chatRig = new THREE.Group();
    chatRig.name = 'vest-chat';
    chat.mount.add(chatRig);
    const chatCard = characterArt.actor(paper, characters, figures, 'vest-chat', {
      who: 'him', outfit: 'vest', pose: 'stand', facing: 'right',
    }, { height: CHAT_H });
    if (chatCard) {
      if (hasCh('vest-chat')) seat(chatCard, characters.info('vest-chat'), CHAT_H);
      chatCard.name = 'vest-chat';
      chatRig.add(chatCard);
    }
    // All four sit above the hair. Plane origin is the centre, so the bottom clears CHAT_H.
    const chatBubbles = [
      placeDecal(THREE, paper, chatRig, bubbleCanvas(paper, FONT, L('ha ha!', '¡ja ja!'), 420, 200, 0.38), 0.50, 0.24, -0.34, CHAT_H + 0.22),
      placeDecal(THREE, paper, chatRig, bubbleCanvas(paper, FONT, '…', 240, 180, 0.55), 0.26, 0.20, 0.36, CHAT_H + 0.20),
      placeDecal(THREE, paper, chatRig, bubbleCanvas(paper, FONT, '♥', 200, 180, 0.48), 0.22, 0.20, 0.02, CHAT_H + 0.42),
      placeDecal(THREE, paper, chatRig, bubbleCanvas(paper, FONT, L('ha ha!', '¡ja ja!'), 380, 190, 0.62), 0.44, 0.22, -0.06, CHAT_H + 0.54),
    ];

    const glow = new THREE.PointLight('#ffb27a', 0, 6, 1.15);
    glow.name = 'warm-lights';
    glow.castShadow = false;
    glow.position.set(1.15, 2.05, -0.1);
    group.add(glow);

    const co = BEATS.coworkers;
    const pass = BEATS.passingBy;
    const shyAt = BEATS.shy;
    const kindAt = BEATS.kind;
    const curiousAt = BEATS.curious;
    const moreAt = BEATS.somethingMore;

    const signT = spread.open + 0.45;
    const coT = co + 0.4;
    const passT = pass + PASS1 * 0.5;
    const shyT = shyAt + 0.3;
    const kindT = kindAt + 0.28;
    const curT = curiousAt + 0.4;
    const moreT = moreAt + 0.4;
    const endCue = spread.close - 0.55;

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: signT - spread.open, at: [0, 0.7, 0], size: 7.5, from: 'front' },
        { t: signT, hold: coT - signT, at: [0, 1.55, -0.5], size: 4.1, from: 'front' },
        { t: coT, hold: passT - coT, at: [0.52, 0.96, 1.02], size: 4.0, from: 'front' },
        { t: passT, hold: shyT - passT, at: [0, 0.95, 0.52], size: 3.6, from: 'front' },
        { t: shyT, hold: kindT - shyT, at: [1.38, 1.05, 0.7], size: 2.3, from: 'front' },
        { t: kindT, hold: curT - kindT, at: [-1.4, 1.32, 0.62], size: 2.6, from: 'front' },
        { t: curT, hold: moreT - curT, at: [0.05, 1.1, 0.66], size: 3.5, from: 'front' },
        {
          t: moreT,
          hold: Math.max(0.6, endCue - moreT),
          at: [chatX, 1.22, 1.02],
          size: 2.0,
          from: 'front',
        },
      ],
      update(alpha, t) {
        const n = mechanisms.length;
        for (let i = 0; i < n; i++) mechanisms[i].update(alpha);
        const posed = smoothstep(0.93 * Math.PI, Math.PI, alpha);
        const risen = popup.rise(alpha);

        const vestShow = smoothstep(co, co + 0.32, t) * (1 - smoothstep(pass - 0.28, pass + 0.12, t));
        const passPack = passPose(t, pass, shyAt, smoothstep);
        const shyShow = smoothstep(shyAt, shyAt + 0.32, t) * (1 - smoothstep(moreAt - 0.28, moreAt + 0.12, t));
        const kindShow = smoothstep(kindAt, kindAt + 0.32, t) * (1 - smoothstep(moreAt - 0.28, moreAt + 0.12, t));
        const chatShow = smoothstep(moreAt, moreAt + 0.36, t);
        const curiousShow = smoothstep(curiousAt, curiousAt + 0.3, t) * (1 - smoothstep(moreAt - 0.2, moreAt + 0.15, t));
        const lean = smoothstep(curiousAt, curiousAt + 0.55, t) * curiousShow;

        const hopBoxes = bump(t, co + 3.2, 0.4);
        boxesRig.position.y = hopBoxes * 0.07;
        boxesRig.rotation.z = Math.sin(t * 1.4) * 0.02 * (t > co ? 1 : 0);
        cartsRig.rotation.z = Math.sin(t * 1.7) * 0.03;
        spark.scale.setScalar(bump(t, co + 3.15, 0.45) * vestShow);

        const breathe = 1 + Math.sin(t * 1.7) * 0.012;
        const hopH = bump(t, co) * 0.9;
        const hopS = bump(t, co + 5.4, 0.4);
        poseRig(himRig, posed * vestShow, breathe, hopH, Math.sin(t * 1.6) * 0.012 * vestShow);
        poseRig(herRig, posed * vestShow, breathe, hopS, Math.sin(t * 1.5 + 1) * 0.012 * vestShow);

        let photoIn = ease.outBack(smoothstep(co + 0.35, co + 0.95, t));
        const photoOut = smoothstep(pass - 0.25, pass + 0.2, t);
        photoIn *= (1 - photoOut);
        if (photoIn < 0) photoIn = 0;
        else if (photoIn > 1.05) photoIn = 1.05;
        photoPivot.scale.setScalar(photoIn);
        photoPivot.position.y = (1 - Math.min(1, photoIn)) * 0.08;

        himSlide.update(alpha, passPack.uHim);
        herSlide.update(alpha, passPack.uHer);
        himAlign.quaternion.copy(himSlide.mount.quaternion).invert();
        herAlign.quaternion.copy(herSlide.mount.quaternion).invert();
        const gHim = Math.sin(passPack.uHim * Math.PI);
        const gHer = Math.sin(passPack.uHer * Math.PI);
        const passMag = posed * passPack.show;
        himPass.scale.set(passPack.flipHim * passMag, passMag * (1 + bump(t, pass, 0.3) * 0.04), passMag > 0 ? 1 : 0);
        herPass.scale.set(passPack.flipHer * passMag, passMag * (1 + bump(t, pass + 0.1, 0.3) * 0.04), passMag > 0 ? 1 : 0);
        himPass.position.y = Math.sin(t * 2.4) * 0.01 * passPack.show;
        herPass.position.y = Math.sin(t * 2.4 + 1) * 0.01 * passPack.show;
        // Glance toward each other as they cross. flip already mirrors the drawing.
        himPass.rotation.y = gHim * 0.28 * passPack.flipHim;
        herPass.rotation.y = -gHer * 0.28 * passPack.flipHer;
        himPass.rotation.z = gHim * 0.05;
        herPass.rotation.z = -gHer * 0.05;
        const hi = gHim > 0.86 ? (gHim - 0.86) / 0.14 : 0;
        const hi2 = (gHer > 0.86 ? (gHer - 0.86) / 0.14 : 0) * passPack.show;
        const hi1 = hi * passPack.show;
        // Parent scale.x is the facing flip. A second flip here keeps the letters readable.
        hiHim.scale.set(passPack.flipHim * hi1, hi1, hi1 > 0 ? 1 : 0);
        hiHer.scale.set(passPack.flipHer * hi2, hi2, hi2 > 0 ? 1 : 0);

        const shyPop = bump(t, shyAt, 0.36);
        poseRig(shyRig, posed * shyShow, breathe, shyPop, -lean * 0.045);
        shyDots.scale.setScalar(clamp(ease.outBack(smoothstep(shyAt + 0.12, shyAt + 0.42, t)), 0, 1.06) * (shyShow > 0.2 ? 1 : 0));
        shyTag.scale.setScalar(clamp(ease.outBack(smoothstep(shyAt + 0.2, shyAt + 0.55, t)), 0, 1.04) * (shyShow > 0.2 ? 1 : 0));
        blush.scale.setScalar((0.75 + 0.25 * Math.sin(t * 3.2)) * (shyShow > 0.4 ? 1 : 0));

        const kindPop = bump(t, kindAt, 0.36);
        const wave = Math.sin(t * 3.1) * 0.016 * kindShow;
        poseRig(kindRig, posed * kindShow, breathe, kindPop, lean * 0.045 + wave);
        kindBubble.scale.setScalar(clamp(ease.outBack(smoothstep(kindAt + 0.1, kindAt + 0.45, t)), 0, 1.06) * (kindShow > 0.2 ? 1 : 0));
        kindTag.scale.setScalar(clamp(ease.outBack(smoothstep(kindAt + 0.22, kindAt + 0.58, t)), 0, 1.04) * (kindShow > 0.2 ? 1 : 0));

        const markShow = posed * curiousShow;
        marks.scale.setScalar(markShow);
        for (let i = 0; i < markMeshes.length; i++) {
          const m = markMeshes[i];
          const age = t - curiousAt - m.delay;
          const up = age > 0 ? Math.min(1, age / 1.15) : 0;
          const y = 0.92 + up * 0.42;
          const turn = smoothstep(curiousAt + m.delay + 0.15, curiousAt + m.delay + 0.7, t);
          const x = m.x + Math.sin(t * 1.3 + m.phase) * 0.03;
          m.q.position.set(x, y, 0);
          m.h.position.set(x, y, 0.001);
          m.q.material.opacity = (1 - turn) * (age > 0 ? 1 : 0);
          m.h.material.opacity = turn * (age > 0 ? 1 : 0);
          m.q.rotation.z = Math.sin(t * 1.4 + m.phase) * 0.2;
          m.h.rotation.z = Math.sin(t * 1.2 + m.phase) * 0.25;
          const s = 0.85 + up * 0.35;
          m.q.scale.setScalar(s);
          m.h.scale.setScalar(s * (0.7 + 0.3 * turn));
        }

        const chatPop = bump(t, moreAt, 0.4);
        poseRig(chatRig, posed * chatShow, breathe, chatPop, Math.sin(t * 1.8) * 0.015 * chatShow);
        for (let i = 0; i < chatBubbles.length; i++) {
          const pop = clamp(ease.outBack(smoothstep(moreAt + 0.12 + i * 0.42, moreAt + 0.48 + i * 0.42, t)), 0, 1.06);
          chatBubbles[i].scale.setScalar(pop * (chatShow > 0.2 ? 1 : 0));
        }

        glow.intensity = risen * smoothstep(moreAt, moreAt + 0.9, t) * 3.4;
      },
    };
  },
};

function poseRig(rig, show, breathe, pop, tilt) {
  const sy = breathe * (1 + 0.06 * pop) * show;
  const sx = breathe * (1 - 0.04 * pop) * show;
  rig.scale.set(sx, sy, show > 0 ? 1 : 0);
  // Pad keeps a tilted card's lower corner above the page (fold check allows y ≥ −0.03).
  rig.position.y = (show > 0 ? 0.012 : 0) + pop * 0.03 * (show > 0 ? 1 : 0);
  rig.rotation.z = tilt;
}

function passPose(t, pass, shyAt, smoothstep) {
  const a = pass;
  const b = pass + PASS1;
  const c = b + PASS_GAP;
  const d = c + PASS2;
  // Path u 0 is the right end for him and the left end for her.
  let uHim = 0;
  let uHer = 0;
  let flipHim = -1;
  let flipHer = 1;
  let show = 0;
  if (t >= a && t < b) {
    const u = smoothstep(a, b, t);
    uHim = u;
    uHer = u;
    flipHim = -1;
    flipHer = 1;
    show = smoothstep(a, a + 0.26, t);
  } else if (t >= b && t < c) {
    uHim = 1;
    uHer = 1;
    flipHim = 1;
    flipHer = -1;
    show = 1;
  } else if (t >= c && t < d) {
    const u = smoothstep(c, d, t);
    uHim = 1 - u;
    uHer = 1 - u;
    flipHim = 1;
    flipHer = -1;
    show = 1;
  } else if (t >= d) {
    uHim = 0;
    uHer = 0;
    flipHim = -1;
    flipHer = 1;
    show = 1 - smoothstep(d, d + 0.32, t);
  }
  show *= 1 - smoothstep(shyAt - 0.35, shyAt + 0.05, t);
  if (show < 0) show = 0;
  return { uHim, uHer, flipHim, flipHer, show };
}

function paintWalmart(ctx, w, h, FONT, C, rng) {
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
  const title = L('Where it all began', 'Donde todo comenzó');
  const font = (size) => `${size}px ${FONT.display}`;
  // Front outer half. 0.82 leaves room for the per-letter gap and the ink stroke.
  const size = fitSize(ctx, title, font, Math.round(h * 0.046), w * 0.5) * 0.82;
  const colors = [C.tomato, C.mustard, C.teal, C.sky, C.leaf, C.blush];
  cutWord(ctx, title, w * 0.32, h * 0.9, size, FONT, colors, rng);
}

function paintRightPage(ctx, w, h, FONT, C) {
  // The art's arrow sits under the checkout. Paint a second one on the open front floor.
  ctx.save();
  ctx.translate(w * 0.46, h * 0.9);
  ctx.fillStyle = C.mustard;
  ctx.beginPath();
  const ax = w * 0.055;
  const ay = h * 0.022;
  ctx.moveTo(-ax, -ay * 0.7);
  ctx.lineTo(ax * 0.15, -ay * 0.7);
  ctx.lineTo(ax * 0.15, -ay * 1.7);
  ctx.lineTo(ax, 0);
  ctx.lineTo(ax * 0.15, ay * 1.7);
  ctx.lineTo(ax * 0.15, ay * 0.7);
  ctx.lineTo(-ax, ay * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Outer front corner. The gutter is the left edge.
  ctx.save();
  ctx.translate(w * 0.86, h * 0.78);
  ctx.rotate(-0.2);
  ctx.fillStyle = C.blush;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.bezierCurveTo(-16, -4, -10, -16, 0, -6);
  ctx.bezierCurveTo(10, -16, 16, -4, 0, 10);
  ctx.fill();
  ctx.restore();
  void FONT;
}

function decal(THREE, paper, canvas, width, height) {
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: paper.texture(canvas),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.renderOrder = 2;
  return mesh;
}

function placeDecal(THREE, paper, parent, canvas, width, height, x, y) {
  const mesh = decal(THREE, paper, canvas, width, height);
  mesh.position.set(x, y, 0.04);
  mesh.scale.setScalar(0);
  parent.add(mesh);
  return mesh;
}

function bubbleCanvas(paper, FONT, text, w, h, tail) {
  const tip = tail == null ? 0.4 : tail;
  return paper.paint(w, h, (ctx, W, H) => {
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, text, font, Math.round(H * 0.32), W * 0.84);
    ctx.fillStyle = '#fffdf8';
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = Math.max(4, H * 0.035);
    ctx.beginPath();
    ctx.roundRect(W * 0.06, H * 0.06, W * 0.88, H * 0.62, H * 0.2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * (tip - 0.08), H * 0.66);
    ctx.lineTo(W * tip, H * 0.96);
    ctx.lineTo(W * (tip + 0.1), H * 0.66);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (text === '♥') {
      const cx = W * 0.5;
      const cy = H * 0.34;
      const s = Math.min(W, H) * 0.16;
      ctx.fillStyle = '#e2574c';
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.85);
      ctx.bezierCurveTo(cx - s * 1.15, cy + s * 0.15, cx - s, cy - s * 0.85, cx - s * 0.4, cy - s * 0.85);
      ctx.bezierCurveTo(cx - s * 0.08, cy - s * 0.85, cx, cy - s * 0.35, cx, cy - s * 0.35);
      ctx.bezierCurveTo(cx, cy - s * 0.35, cx + s * 0.08, cy - s * 0.85, cx + s * 0.4, cy - s * 0.85);
      ctx.bezierCurveTo(cx + s, cy - s * 0.85, cx + s * 1.15, cy + s * 0.15, cx, cy + s * 0.85);
      ctx.fill();
    } else {
      ctx.font = font(size);
      ctx.fillStyle = '#3a2f2a';
      ctx.fillText(text, W * 0.5, H * 0.36);
    }
  }, { dieCut: 8, seed: text.length + 3, grain: 0.04 });
}

function badgeCanvas(paper, FONT, name) {
  return paper.paint(420, 160, (ctx, w, h) => {
    ctx.fillStyle = '#f4c531';
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(w * 0.08, h * 0.18, w * 0.84, h * 0.64, h * 0.28);
    ctx.fill();
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, name, font, Math.round(h * 0.42), w * 0.7);
    ctx.font = font(size);
    ctx.fillStyle = '#3a2f2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, w * 0.5, h * 0.5);
  }, { dieCut: 6, seed: name.length + 4, grain: 0.04 });
}

function tagCanvas(paper, FONT, text) {
  return paper.paint(860, 220, (ctx, w, h) => {
    ctx.fillStyle = '#fffdf8';
    ctx.strokeStyle = '#9d3a3a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(w * 0.04, h * 0.16, w * 0.92, h * 0.68, h * 0.22);
    ctx.fill();
    ctx.stroke();
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, text, font, Math.round(h * 0.4), w * 0.84);
    ctx.font = font(size);
    ctx.fillStyle = '#9d3a3a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w * 0.5, h * 0.5);
  }, { dieCut: 6, seed: text.length + 8, grain: 0.04 });
}

function blushCanvas(paper) {
  return paper.paint(128, 80, (ctx, w, h) => {
    ctx.fillStyle = '#f0a3a0';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.5, w * 0.32, h * 0.28, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }, { dieCut: 4, seed: 9, grain: 0.02 });
}

function sparkCanvas(paper, C) {
  return paper.paint(160, 160, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = C.mustard;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? h * 0.42 : h * 0.16;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }, { dieCut: 4, seed: 15, grain: 0.03 });
}

function questionCanvas(paper, FONT) {
  const { canvas, ctx } = paper.makeCanvas(128, 128);
  ctx.fillStyle = '#3a2f2a';
  ctx.font = `700 96px ${FONT.hand}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 64, 68);
  return canvas;
}

function heartCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(128, 128);
  ctx.fillStyle = '#e2574c';
  ctx.beginPath();
  ctx.moveTo(64, 108);
  ctx.bezierCurveTo(8, 72, 12, 28, 44, 28);
  ctx.bezierCurveTo(60, 28, 64, 44, 64, 44);
  ctx.bezierCurveTo(64, 44, 68, 28, 84, 28);
  ctx.bezierCurveTo(116, 28, 120, 72, 64, 108);
  ctx.fill();
  return canvas;
}

function makeSale(THREE, paper, FONT, C) {
  const canvas = paper.paint(240, 220, (ctx, w, h) => {
    ctx.fillStyle = C.mustard;
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    const cx = w / 2;
    const cy = h * 0.48;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 2 === 0 ? h * 0.4 : h * 0.22;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const label = L('sale!', '¡oferta!');
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, label, font, Math.round(h * 0.2), w * 0.62);
    ctx.font = font(size);
    ctx.fillStyle = '#3a2f2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
  }, { dieCut: 6, seed: 14, grain: 0.04 });
  return decal(THREE, paper, canvas, 0.5, 0.46);
}
