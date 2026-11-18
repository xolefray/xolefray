// Spread — "Lunch breaks". The staff room where one assigned break became hours, then "our thing".
// Times come from timeline.BEATS / SPREADS. Drawings: lunch-0, then lunch-talk frames lunch-laugh and lunch-lean.
// Lettering is painted in code through L(). update() allocates nothing.
import { L } from '../i18n.js';
import { PHOTO_ASPECT, photoPrint } from '../photos.js';

const GAMMA = Math.PI / 2 + 0.09;
const WALL_Z = -1.22;
const WALL_W = 5.25;
const HERO_H = 1.6;
const POSES = ['lunch-0', 'lunch-laugh', 'lunch-lean'];
const DAYS = [
  ['MON', 'LUN'],
  ['TUE', 'MAR'],
  ['WED', 'MIÉ'],
  ['THU', 'JUE'],
  ['FRI', 'VIE'],
];
// Window hole on back-wall.webp.
const WINDOW = { u0: 0.575, v0: 0.15, u1: 0.905, v1: 0.675 };

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

function plane(THREE, paper, canvas, width, height, anchor) {
  const geo = new THREE.PlaneGeometry(width, height);
  if (anchor === 'bottom') geo.translate(0, height / 2, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: paper.texture(canvas),
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function ellipseStroke(THREE, cx, cy, rx, ry, halfW) {
  const N = 48;
  const pos = new Float32Array(N * 6 * 3);
  let p = 0;
  for (let i = 0; i < N; i++) {
    const a0 = -Math.PI / 2 + (i / N) * Math.PI * 2;
    const a1 = -Math.PI / 2 + ((i + 1) / N) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * rx;
    const y0 = cy + Math.sin(a0) * ry;
    const x1 = cx + Math.cos(a1) * rx;
    const y1 = cy + Math.sin(a1) * ry;
    let tx = x1 - x0;
    let ty = y1 - y0;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty * halfW;
    const ny = tx * halfW;
    const quad = [
      x0 + nx, y0 + ny, 0,
      x0 - nx, y0 - ny, 0,
      x1 + nx, y1 + ny, 0,
      x0 - nx, y0 - ny, 0,
      x1 - nx, y1 - ny, 0,
      x1 + nx, y1 + ny, 0,
    ];
    for (let k = 0; k < quad.length; k++) pos[p++] = quad[k];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setDrawRange(0, 0);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: '#d1232c',
    side: THREE.DoubleSide,
    toneMapped: false,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, tris: N * 2 };
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

export default {
  id: 'lunch',
  title: 'Lunch breaks',
  build(ctx) {
    const { THREE, paper, popup, rng, photos, figures, FONT, timeline, characters, characterArt, art } = ctx;
    const { BEATS, SPREADS, smoothstep, ease } = timeline;
    const spread = SPREADS.find((s) => s.id === 'lunch');
    const C = paper.PALETTES.scrapbook;
    const group = new THREE.Group();
    group.name = 'lunch';
    const rand = rng && rng.next ? rng : { next: () => 0.37 };

    const has = (id) => !!(art && art.has && art.has(id));
    const info = (id) => (has(id) ? art.info(id) : null);
    const hasChar = (id) => !!(characters && characters.has && characters.has(id));

    const lunchAt = BEATS.lunch;
    const quickAt = BEATS.quickBreak;
    const hoursAt = BEATS.hoursTalking;
    const ourAt = BEATS.ourThing;
    const sparksAt = BEATS.sparks;

    const ink = C.ink;
    const hand = (size) => `700 ${size}px ${FONT.hand}`;
    const display = (size) => `400 ${size}px ${FONT.display}`;

    // ---------------------------------------------------------------- pages
    const doodle = (g, w, h, gutterRight) => {
      const label = L('break room', 'sala de descanso');
      g.save();
      g.translate(gutterRight ? w * 0.08 : w * 0.62, h * 0.84);
      g.rotate(gutterRight ? -0.03 : 0.04);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const size = fitSize(g, label, hand, 40, w * 0.3);
      g.font = hand(size);
      g.fillStyle = ink;
      g.fillText(label, 0, 0);
      g.restore();
      const hx = gutterRight ? w * 0.1 : w * 0.86;
      g.save();
      g.translate(hx, h * 0.7);
      g.fillStyle = C.blush;
      g.beginPath();
      g.moveTo(0, 14);
      g.bezierCurveTo(-18, 0, -8, -16, 0, -5);
      g.bezierCurveTo(8, -16, 18, 0, 0, 14);
      g.fill();
      g.restore();
    };

    let leftArt;
    let rightArt;
    if (has('page-left') && has('page-right')) {
      const Lpage = paper.makeCanvas(art.canvas('page-left').width, art.canvas('page-left').height);
      Lpage.ctx.drawImage(art.canvas('page-left'), 0, 0);
      const Rpage = paper.makeCanvas(art.canvas('page-right').width, art.canvas('page-right').height);
      Rpage.ctx.drawImage(art.canvas('page-right'), 0, 0);
      doodle(Lpage.ctx, Lpage.canvas.width, Lpage.canvas.height, true);
      doodle(Rpage.ctx, Rpage.canvas.width, Rpage.canvas.height, false);
      leftArt = Lpage.canvas;
      rightArt = Rpage.canvas;
    } else {
      const checker = (g, w, h) => {
        const n = 8;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            g.fillStyle = (x + y) % 2 ? '#f3d2b0' : '#f7efe2';
            g.fillRect((x * w) / n, (y * h) / n, w / n + 1, h / n + 1);
          }
        }
      };
      leftArt = paper.page((g, w, h) => { checker(g, w, h); doodle(g, w, h, true); }, { seed: 21, tint: '#f6efe4' });
      rightArt = paper.page((g, w, h) => { checker(g, w, h); doodle(g, w, h, false); }, { seed: 22, tint: '#f6efe4' });
    }

    const folds = [];
    const track = (m) => {
      folds.push(m);
      group.add(m.object);
      return m;
    };

    // ---------------------------------------------------------------- back wall (mountain V) + sky in the window
    const wallInfo = info('back-wall');
    const wallH = wallInfo ? WALL_W * (wallInfo.h / wallInfo.w) : 2.2;
    const wall = track(popup.vFold({ z0: WALL_Z, gamma: GAMMA, width: WALL_W, height: wallH }));
    const skyMats = [];
    {
      const u0 = WINDOW.u0;
      const u1 = WINDOW.u1;
      const yTop = (1 - WINDOW.v0) * wallH;
      const yBot = (1 - WINDOW.v1) * wallH;
      const x0 = (u0 - 0.5) * WALL_W - 0.04;
      const x1 = (u1 - 0.5) * WALL_W + 0.04;
      const sw = x1 - x0;
      const sh = (yTop - yBot) + 0.08;
      const skies = [paintSky(paper, 'day'), paintSky(paper, 'sunset'), paintSky(paper, 'night')];
      for (let i = 0; i < skies.length; i++) {
        const mesh = plane(THREE, paper, skies[i], sw, sh, 'bottom');
        mesh.position.set((x0 + x1) / 2, yBot - 0.04, -0.02);
        mesh.material.transparent = true;
        mesh.material.opacity = i === 0 ? 1 : 0;
        mesh.material.depthWrite = false;
        mesh.name = `sky-${i}`;
        wall.right.add(mesh);
        skyMats.push(mesh.material);
      }
    }
    if (wallInfo) {
      const cut = paper.dieCut(art.canvas('back-wall'), { margin: 10 });
      const halves = paper.splitCard({ canvas: cut, width: WALL_W, height: wallH });
      halves.left.name = 'wall-left';
      halves.right.name = 'wall-right';
      wall.left.add(halves.left);
      wall.right.add(halves.right);
    }

    // ---------------------------------------------------------------- notice board + a much larger schedule sheet
    // The drawn blank on the board is small. A code-painted sheet covers most of the cork
    // so the title, both rows, the circle and the side note read in a size-2.4 frame.
    const BOARD_H = 1.70;
    // Sheet stays tall so the rows stay large. It sits left of centre on the cork
    // so a note fits on the gutter side of the circle, still inside the board.
    const SHEET_W = 1.26;
    const SHEET_H = 1.48;
    let boardCenter = [-1.35, 1.05, WALL_Z];
    const schedule = { mesh: null, textures: [], phase: -1 };
    const notePivot = new THREE.Group();
    notePivot.name = 'same-break';
    let circle = null;
    if (info('notice-board')) {
      const meta = info('notice-board');
      const m = metrics(meta, BOARD_H);
      const board = characterArt.characterCard(paper, art, 'notice-board', { height: BOARD_H });
      board.name = 'notice-board';
      // Image bottom sits just above the wall's base. Feet are the card origin.
      const boardX = -1.58;
      const boardFoot = m.drop + 0.04;
      board.position.set(boardX, boardFoot, 0.008);
      wall.left.add(board);

      const sheetX = -0.36;
      const sheetY = (meta.feet[1] - meta.h * 0.5) * m.s;
      const title = L('BREAK SCHEDULE', 'HORARIO DE DESCANSOS');
      const maps = [0, 1, 2, 3].map((n) => scheduleMap(paper, FONT, title, n));
      const mesh = plane(THREE, paper, maps[0], SHEET_W, SHEET_H, 'center');
      mesh.material.alphaTest = 0.04;
      mesh.position.set(sheetX, sheetY, 0.012);
      mesh.name = 'schedule';
      mesh.scale.setScalar(0);
      board.add(mesh);
      schedule.mesh = mesh;
      schedule.textures = [paper.texture(maps[0])];
      mesh.material.map = schedule.textures[0];
      for (let i = 1; i < maps.length; i++) schedule.textures.push(paper.texture(maps[i]));

      // Circle the two name rows (lower half of the sheet), inside the paper.
      circle = ellipseStroke(THREE, 0, -SHEET_H * 0.145, SHEET_W * 0.44, SHEET_H * 0.20, 0.016);
      circle.mesh.position.z = 0.003;
      circle.mesh.name = 'schedule-circle';
      mesh.add(circle.mesh);

      const noteText = L('same break!', '¡mismo descanso!');
      const noteW = 0.42;
      const noteH = 0.38;
      const noteCanvas = paper.paint(700, 420, (ctx, w, h) => {
        ctx.fillStyle = '#fff6df';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 8;
        roundRect(ctx, 28, 16, w - 44, h - 32, 26);
        ctx.fill();
        ctx.stroke();
        // Arrow on the left edge, pointing at the circled names.
        ctx.strokeStyle = C.tomato;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(40, h * 0.52);
        ctx.lineTo(10, h * 0.38);
        ctx.moveTo(40, h * 0.52);
        ctx.lineTo(24, h * 0.78);
        ctx.stroke();
        const handNote = (size) => `700 ${size}px ${FONT.hand}`;
        const words = noteText.split(' ');
        const one = fitSize(ctx, noteText, handNote, Math.round(h * 0.34), w * 0.62);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (words.length > 1 && one < h * 0.22) {
          const a = words.slice(0, -1).join(' ');
          const b = words[words.length - 1];
          const size = Math.min(
            fitSize(ctx, a, handNote, Math.round(h * 0.30), w * 0.64),
            fitSize(ctx, b, handNote, Math.round(h * 0.30), w * 0.64),
          );
          ctx.font = handNote(size);
          ctx.fillText(a, w * 0.58, h * 0.36);
          ctx.fillText(b, w * 0.58, h * 0.66);
        } else {
          ctx.font = handNote(one);
          ctx.fillText(noteText, w * 0.58, h * 0.50);
        }
      }, { dieCut: 8, seed: 9, grain: 0.04 });
      const note = paper.card({ canvas: noteCanvas, width: noteW, height: noteH, anchor: 'center' });
      note.name = 'same-break-card';
      // Gutter side of the sheet, level with the circled rows. Stays on the cork,
      // clear of the lockers and of the gutter bisector.
      const noteX = sheetX + SHEET_W / 2 + noteW / 2 + 0.03;
      notePivot.position.set(noteX, sheetY - SHEET_H * 0.145, 0.008);
      notePivot.rotation.z = 0;
      notePivot.scale.setScalar(0);
      notePivot.add(note);
      board.add(notePivot);

      boardCenter = [boardX + (sheetX + noteX) * 0.5, boardFoot + sheetY, WALL_Z + 0.02];
    }

    // Painted sign above the board, and two posters under the window, so the wall is not bare.
    {
      const signText = L('BREAK ROOM', 'SALA DE DESCANSO');
      const signCanvas = paper.paint(1100, 220, (ctx, w, h) => {
        ctx.fillStyle = '#c9843a';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 10;
        roundRect(ctx, 8, 14, w - 16, h - 28, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e7b15a';
        roundRect(ctx, 22, 28, w - 44, h - 58, 12);
        ctx.fill();
        const font = (size) => `400 ${size}px ${FONT.display}`;
        const size = fitSize(ctx, signText, font, Math.round(h * 0.46), w * 0.86);
        ctx.font = font(size);
        ctx.fillStyle = '#fff8ee';
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(4, size * 0.08);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(signText, w / 2, h * 0.52);
        ctx.fillText(signText, w / 2, h * 0.52);
      }, { dieCut: 6, seed: 31, grain: 0.05 });
      const sign = plane(THREE, paper, signCanvas, 2.05, 0.26, 'center');
      sign.name = 'break-room-sign';
      sign.position.set(-1.45, wallH - 0.18, 0.01);
      wall.left.add(sign);

      const posters = [
        { text: L('today\'s soup', 'sopa del día'), tint: '#f4e2c4', accent: C.tomato, x: 0.48, kind: 'bowl' },
        { text: L('be kind', 'sé amable'), tint: '#fde8ea', accent: C.blush, x: 1.72, kind: 'heart' },
      ];
      for (let i = 0; i < posters.length; i++) {
        const spec = posters[i];
        const canvas = posterCanvas(paper, FONT, spec.text, spec.tint, spec.accent, spec.kind, ink);
        const card = plane(THREE, paper, canvas, 0.46, 0.58, 'bottom');
        card.name = `poster-${i}`;
        card.position.set(spec.x, 0.12, 0.014);
        wall.right.add(card);
      }
    }

    // ---------------------------------------------------------------- clock on the wall, hands painted in code
    const clockRig = new THREE.Group();
    clockRig.name = 'clock';
    let minute = null;
    let hour = null;
    const tagPivot = new THREE.Group();
    const laterPivot = new THREE.Group();
    const strike = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.012),
      new THREE.MeshBasicMaterial({ color: '#d1232c', side: THREE.DoubleSide, toneMapped: false }),
    );
    strike.name = 'tag-strike';
    strike.scale.x = 0;
    if (info('clock')) {
      const ch = 0.5;
      const meta = info('clock');
      const m = metrics(meta, ch);
      const card = characterArt.characterCard(paper, art, 'clock', { height: ch });
      card.name = 'clock-face';
      card.position.y = m.drop;
      clockRig.add(card);
      // Under the window, between the posters. Tags sit beside the face so they stay on the wall.
      clockRig.position.set(1.08, 0.20, 0.016);
      wall.right.add(clockRig);
      const hubY = (meta.feet[1] - meta.h * 0.5) * m.s;
      const handGeo = new THREE.PlaneGeometry(0.018, 0.17);
      handGeo.translate(0, 0.08, 0);
      const hourGeo = new THREE.PlaneGeometry(0.024, 0.11);
      hourGeo.translate(0, 0.05, 0);
      const handMat = new THREE.MeshBasicMaterial({ color: '#3a2f2a', side: THREE.DoubleSide });
      minute = new THREE.Mesh(handGeo, handMat);
      hour = new THREE.Mesh(hourGeo, handMat);
      minute.name = 'minute-hand';
      hour.name = 'hour-hand';
      minute.position.set(0, hubY, 0.006);
      hour.position.set(0, hubY, 0.008);
      card.add(minute, hour);

      const tagText = L('30 min', '30 min');
      const tagCanvas = paper.paint(360, 160, (ctx, w, h) => {
        ctx.fillStyle = '#fff4c8';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 8;
        roundRect(ctx, 12, 12, w - 24, h - 24, 26);
        ctx.fill();
        ctx.stroke();
        const size = fitSize(ctx, tagText, hand, Math.round(h * 0.42), w * 0.8);
        ctx.font = hand(size);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, w / 2, h / 2);
      }, { dieCut: 6, seed: 11, grain: 0.04 });
      const tag = paper.card({ canvas: tagCanvas, width: 0.36, height: 0.16, anchor: 'center' });
      tag.name = 'tag-30';
      tagPivot.position.set(0.40, 0.30, 0.004);
      tagPivot.scale.setScalar(0);
      tagPivot.add(tag);
      strike.position.set(0, 0, 0.003);
      tagPivot.add(strike);
      clockRig.add(tagPivot);

      const laterText = L('…3 hours later', '…3 horas después');
      const laterCanvas = paper.paint(640, 180, (ctx, w, h) => {
        ctx.fillStyle = '#fff6df';
        ctx.strokeStyle = ink;
        ctx.lineWidth = 8;
        roundRect(ctx, 12, 14, w - 24, h - 28, 24);
        ctx.fill();
        ctx.stroke();
        const size = fitSize(ctx, laterText, hand, Math.round(h * 0.4), w * 0.88);
        ctx.font = hand(size);
        ctx.fillStyle = C.tomato;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(laterText, w / 2, h / 2);
      }, { dieCut: 6, seed: 12, grain: 0.04 });
      const later = paper.card({ canvas: laterCanvas, width: 0.62, height: 0.17, anchor: 'center' });
      later.name = 'tag-later';
      laterPivot.position.set(-0.46, 0.16, 0.004);
      laterPivot.scale.setScalar(0);
      laterPivot.add(later);
      clockRig.add(laterPivot);
    }

    // ---------------------------------------------------------------- foreground props, both pages
    const prop = (id, side, x, z, fold, height) => {
      const meta = info(id);
      if (!meta) return null;
      const m = metrics(meta, height);
      const mech = track(popup.standUp({
        side, x, z, fold,
        width: m.width,
        height: height + 0.03,
      }));
      const card = characterArt.characterCard(paper, art, id, { height });
      card.name = id;
      // Feet are the group's origin. Slide x so the drawing is centred on the hinge.
      card.position.set((m.left - m.right) / 2, m.drop + 0.012, 0);
      mech.mount.add(card);
      return { mech, card, m };
    };
    prop('lockers', 'left', 2.92, -1.02, 'front', 1.28);
    prop('water-cooler', 'left', 2.72, 1.12, 'back', 0.96);
    const smallTable = prop('table-small', 'left', 1.42, -0.35, 'back', 0.58);
    const plant = prop('plant', 'left', 3.22, 1.08, 'back', 0.66);
    prop('fridge', 'right', 3.22, -1.08, 'front', 1.18);
    prop('counter', 'right', 2.22, -0.72, 'back', 0.74);
    // Back corner, clear of the lunch print that stands beside the table.
    prop('vending', 'right', 2.95, -0.18, 'back', 0.82);

    // ---------------------------------------------------------------- hero: the lunch table, centre front of the right page
    // Centre-front of the right page, up as soon as the spread opens (not parked at the lip).
    const heroX = 1.80;
    const heroZ = 0.78;
    const hero = track(popup.standUp({
      side: 'right', x: heroX, z: heroZ, fold: 'back', width: 1.78, height: 1.68,
    }));
    const heroRig = new THREE.Group();
    heroRig.name = 'lunch-table';
    hero.mount.add(heroRig);
    let flip = null;
    let heroShift = 0;
    if (hasChar('lunch-0')) {
      flip = characterArt.characterFlip(paper, characters, POSES, { height: HERO_H });
      const ref = characters.info('lunch-0');
      const m = metrics(ref, HERO_H);
      heroShift = (m.left - m.right) / 2;
      flip.group.position.set(heroShift, m.drop + 0.012, 0);
      flip.group.name = 'lunch-poses';
      heroRig.add(flip.group);
    } else {
      const sit = (who, x, facing) => {
        let card = null;
        try {
          card = figures.figureCard(paper, who, { outfit: 'vest', pose: 'sit', facing });
        } catch { card = null; }
        if (!card) return;
        card.position.x = x;
        card.name = `${who}-sit`;
        heroRig.add(card);
      };
      sit('her', -0.38, 'right');
      sit('him', 0.38, 'left');
    }

    const bubbles = [];
    const bubbleSpecs = [
      { text: L('ha ha!', '¡ja ja!'), x: -0.34, y: 1.56, w: 0.48, h: 0.24, at: 0.05 },
      { text: '…', x: 0.26, y: 1.58, w: 0.26, h: 0.2, at: 0.5 },
      { text: '♥', x: 0.0, y: 1.72, w: 0.22, h: 0.18, at: 0.95 },
    ];
    for (let i = 0; i < bubbleSpecs.length; i++) {
      const spec = bubbleSpecs[i];
      const canvas = speechCanvas(paper, FONT, spec.text, spec.text.length < 3);
      const mesh = plane(THREE, paper, canvas, spec.w, spec.h, 'bottom');
      const pivot = new THREE.Group();
      pivot.position.set(spec.x, 1.46, 0.03);
      pivot.scale.setScalar(0);
      mesh.position.y = spec.y - 1.46;
      mesh.name = `bubble-${i}`;
      pivot.add(mesh);
      heroRig.add(pivot);
      bubbles.push({ pivot, at: spec.at });
    }

    const bits = new THREE.Group();
    bits.name = 'hearts';
    heroRig.add(bits);
    const hMap = heartTex(paper);
    const hGeo = new THREE.PlaneGeometry(0.12, 0.11);
    const hearts = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: hMap,
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
        x0: -0.12 + rand.next() * 0.24,
        phase: rand.next() * 6,
        delay: rand.next() * 0.7,
      });
    }

    const ribbonText = L('our thing', 'lo nuestro');
    const ribbonCanvas = paper.paint(720, 200, (ctx, w, h) => {
      ctx.fillStyle = C.tomato;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(36, 28);
      ctx.lineTo(w - 36, 28);
      ctx.lineTo(w - 8, h / 2);
      ctx.lineTo(w - 36, h - 28);
      ctx.lineTo(36, h - 28);
      ctx.lineTo(8, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const size = fitSize(ctx, ribbonText, hand, Math.round(h * 0.4), w * 0.7);
      ctx.font = hand(size);
      ctx.fillStyle = '#fff8ee';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ribbonText, w / 2, h * 0.52);
    }, { dieCut: 6, seed: 15, grain: 0.04 });
    const ribbon = plane(THREE, paper, ribbonCanvas, 0.98, 0.26, 'center');
    ribbon.name = 'our-thing';
    const ribbonPivot = new THREE.Group();
    ribbonPivot.position.set(0.02, 1.5, 0.04);
    ribbonPivot.scale.setScalar(0);
    ribbon.position.y = 0.16;
    ribbonPivot.add(ribbon);
    heroRig.add(ribbonPivot);

    const glowCanvas = paper.makeCanvas(128, 128);
    {
      const g = glowCanvas.ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
      g.addColorStop(0, 'rgba(255, 214, 150, 0.85)');
      g.addColorStop(1, 'rgba(255, 180, 90, 0)');
      glowCanvas.ctx.fillStyle = g;
      glowCanvas.ctx.fillRect(0, 0, 128, 128);
    }
    const glow = plane(THREE, paper, glowCanvas.canvas, 1.7, 1.4, 'center');
    glow.material.depthWrite = false;
    glow.material.opacity = 0;
    glow.position.set(0, 0.15, 0.02);
    glow.name = 'warm-glow';
    const glowPivot = new THREE.Group();
    glowPivot.position.set(0.04, 0.85, 0);
    glowPivot.add(glow);
    heroRig.add(glowPivot);

    // Tear-off calendar on the near corner of their table. Five days, each stamped.
    const calRoot = new THREE.Group();
    calRoot.name = 'calendar';
    calRoot.position.set(-0.72, 0.46, 0.02);
    heroRig.add(calRoot);
    const calPages = [];
    for (let i = DAYS.length - 1; i >= 0; i--) {
      const canvas = dayCanvas(paper, FONT, L(DAYS[i][0], DAYS[i][1]), C, i);
      const mesh = plane(THREE, paper, canvas, 0.24, 0.3, 'bottom');
      const pivot = new THREE.Group();
      pivot.position.y = 0.3;
      mesh.position.y = -0.3;
      pivot.add(mesh);
      calRoot.add(pivot);
      calPages.push({ pivot, i });
    }

    // ---------------------------------------------------------------- photo print beside the table, same page, not over the two
    const shot = photoPrint(photos ? photos.lunch : null, {
      aspect: PHOTO_ASPECT.lunch,
      tilt: -0.05,
      tape: true,
      caption: L('our first lunch date', 'nuestra primera cita de almuerzo'),
      seed: 4,
    });
    const shotRatio = shot.height / shot.width;
    let photoH = shotRatio >= 1 ? 1.12 : 1.12 * shotRatio;
    let photoW = photoH / shotRatio;
    const photoX = 3.14;
    const photoZ = 0.96;
    const photoLim = popup.standUpLimits({ x: photoX, z: photoZ, width: photoW, fold: 'back' });
    if (photoH > photoLim.maxHeightLoose) {
      photoH = photoLim.maxHeightLoose * 0.96;
      photoW = photoH / shotRatio;
    }
    const photo = track(popup.standUp({
      side: 'right', x: photoX, z: photoZ, fold: 'back', width: photoW, height: photoH,
    }));
    const photoMesh = plane(THREE, paper, shot, photoW, photoH, 'bottom');
    photoMesh.name = 'photo-lunch';
    const photoPivot = new THREE.Group();
    photoPivot.name = 'photo-pivot';
    photoPivot.scale.setScalar(0);
    photoPivot.add(photoMesh);
    photo.mount.add(photoPivot);

    const lamp = new THREE.PointLight('#ffd2a4', 0, 6.5, 2);
    lamp.name = 'room-warmth';
    lamp.castShadow = false;
    lamp.position.set(1.5, 1.55, 0.45);
    group.add(lamp);

    const state = { frame: 0 };
    // 11:50 → 12:30 (clockwise), then three more hours to 3:30.
    const MIN_1150 = -50 / 60 * Math.PI * 2;
    const MIN_1230 = -3 * Math.PI;
    const HOUR_1150 = -(11 + 50 / 60) / 12 * Math.PI * 2;
    const HOUR_1230 = HOUR_1150 - (40 / 60) * (Math.PI / 6);

    // Cue anchors in the open spread. Wall local x ≈ world x (gamma is near a right angle).
    const clockAt = [1.08, 0.52, WALL_Z];
    const tableAt = [heroX, 1.02, heroZ];
    // Table centre and the print, plus the little calendar on the table's near corner.
    // Tight on the pair and the print together, so the foreground floor is not the subject.
    const ourAtPoint = [2.32, 1.08, (heroZ + photoZ) * 0.5];

    return {
      group,
      leftArt,
      rightArt,
      cues: [
        { t: spread.open, hold: 0.55, at: [0.35, 0.8, 0.15], size: 7.5, from: 'front' },
        // Schedule is the star through the circle and the side note. Hold past t=52.
        { t: lunchAt + 0.15, hold: 3.15, at: boardCenter, size: 2.4, from: 'front' },
        // Table is already standing; the camera reaches it during the first line.
        { t: lunchAt + 3.45, hold: quickAt - lunchAt - 3.7, at: tableAt, size: 2.55, from: 'front' },
        { t: quickAt + 0.2, hold: 2.15, at: clockAt, size: 1.9, from: 'front' },
        { t: hoursAt + 0.25, hold: ourAt - hoursAt - 0.55, at: [heroX, 1.12, heroZ], size: 2.2, from: 'front' },
        { t: ourAt + 0.4, hold: sparksAt - ourAt - 0.7, at: ourAtPoint, size: 2.7, from: 'front' },
        // Last rest is the two of them, held until the page-turn wide takes over.
        { t: sparksAt + 0.2, hold: Math.max(1.2, spread.close - sparksAt - 0.85), at: [heroX, 1.15, heroZ], size: 2.15, from: 'front' },
      ],
      update(alpha, t) {
        for (let i = 0; i < folds.length; i++) folds[i].update(alpha);
        const risen = popup.rise(alpha);
        const posed = smoothstep(0.9 * Math.PI, Math.PI, alpha);

        // Writing starts as the page finishes opening, so t≈50.5 already shows the rows.
        const write0 = lunchAt - 0.9;
        const showTitle = smoothstep(write0, write0 + 0.26, t);
        const row1 = smoothstep(write0 + 0.32, write0 + 0.55, t);
        const row2 = smoothstep(write0 + 0.62, write0 + 0.86, t);
        let phase = 0;
        if (row2 > 0.5) phase = 3;
        else if (row1 > 0.5) phase = 2;
        else if (showTitle > 0.5) phase = 1;
        if (schedule.mesh) {
          if (phase !== schedule.phase) {
            schedule.mesh.material.map = schedule.textures[phase];
            schedule.mesh.material.needsUpdate = false;
            schedule.phase = phase;
          }
          const sheetIn = smoothstep(spread.open - 0.05, spread.open + 0.28, t);
          schedule.mesh.scale.setScalar(sheetIn);
        }
        if (circle) {
          const draw = smoothstep(write0 + 0.95, write0 + 1.5, t);
          circle.mesh.geometry.setDrawRange(0, Math.floor(draw * circle.tris) * 3);
        }
        let note = ease.outBack(smoothstep(write0 + 1.55, write0 + 1.92, t));
        if (note < 0) note = 0;
        else if (note > 1.06) note = 1.06;
        notePivot.scale.setScalar(note);
        notePivot.rotation.z = 0;

        const toLunch = smoothstep(quickAt, quickAt + 0.75, t);
        const spin = smoothstep(hoursAt, hoursAt + 3.3, t);
        if (minute) {
          minute.rotation.z = MIN_1150 + (MIN_1230 - MIN_1150) * toLunch + spin * (-6 * Math.PI);
          hour.rotation.z = HOUR_1150 + (HOUR_1230 - HOUR_1150) * toLunch + spin * (-Math.PI / 2);
        }
        let tagIn = ease.outBack(smoothstep(quickAt + 0.15, quickAt + 0.55, t));
        if (tagIn < 0) tagIn = 0;
        else if (tagIn > 1.05) tagIn = 1.05;
        tagPivot.scale.setScalar(tagIn);
        strike.scale.x = smoothstep(hoursAt, hoursAt + 0.45, t);
        let laterIn = ease.outBack(smoothstep(hoursAt + 0.35, hoursAt + 0.8, t));
        if (laterIn < 0) laterIn = 0;
        else if (laterIn > 1.05) laterIn = 1.05;
        laterPivot.scale.setScalar(laterIn);

        const daySky = 1 - smoothstep(hoursAt, hoursAt + 1.35, t);
        const sunset = smoothstep(hoursAt, hoursAt + 1.2, t) * (1 - smoothstep(hoursAt + 1.35, hoursAt + 2.7, t));
        const night = smoothstep(hoursAt + 1.45, hoursAt + 3.1, t);
        if (skyMats.length === 3) {
          skyMats[0].opacity = daySky;
          skyMats[1].opacity = sunset;
          skyMats[2].opacity = night;
        }

        let frame = 0;
        if (t >= ourAt) frame = 2;
        else if (t >= hoursAt) frame = 1;
        if (flip && frame !== state.frame) {
          flip.show(frame);
          state.frame = frame;
        }
        const pop = bump(t, lunchAt, 0.45) + bump(t, hoursAt, 0.4) * 0.8 + bump(t, ourAt, 0.4) * 0.7 + bump(t, sparksAt, 0.45) * 0.6;
        const breathe = 1 + Math.sin(t * 1.7) * 0.012 * posed;
        const stretch = posed * pop;
        heroRig.scale.set(breathe * (1 - 0.04 * stretch), breathe * (1 + 0.06 * stretch), 1);
        heroRig.position.y = Math.sin(t * 1.5) * 0.008 * posed;

        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i];
          const u = smoothstep(hoursAt + b.at, hoursAt + b.at + 0.35, t);
          let s = ease.outBack(u);
          if (s < 0) s = 0;
          else if (s > 1.06) s = 1.06;
          b.pivot.scale.setScalar(s * posed);
        }

        let calPop = ease.outBack(smoothstep(ourAt, ourAt + 0.4, t));
        if (calPop < 0) calPop = 0;
        else if (calPop > 1.05) calPop = 1.05;
        calRoot.scale.setScalar(calPop * (posed < 0.02 ? 0 : 1));
        for (let i = 0; i < calPages.length; i++) {
          const page = calPages[i];
          const start = ourAt + 0.15 + page.i * 0.72;
          // Monday is on top (added last) and flips first; Friday stays.
          const flipping = page.i < DAYS.length - 1;
          const u = flipping ? smoothstep(start, start + 0.5, t) : 0;
          page.pivot.rotation.x = -u * 1.05 * posed;
          page.pivot.scale.setScalar(u > 0.96 ? 0 : 1);
        }

        let photoIn = 0;
        if (photoPivot) {
          photoIn = ease.outBack(smoothstep(ourAt + 0.12, ourAt + 0.5, t));
          if (photoIn < 0) photoIn = 0;
          else if (photoIn > 1.05) photoIn = 1.05;
          photoPivot.scale.setScalar(photoIn);
          photoPivot.rotation.z = Math.sin(t * 1.4) * 0.015 * photoIn * posed;
        }

        bits.scale.setScalar(posed > 0.8 && t >= sparksAt ? 1 : 0);
        for (let i = 0; i < hearts.length; i++) {
          const p = hearts[i];
          const age = t - sparksAt - p.delay;
          const y = age > 0 ? 1.0 + Math.min(0.62, age * 0.26) : 1.0;
          p.mesh.position.set(p.x0 + Math.sin(t * 1.4 + p.phase) * 0.05, y, 0.05);
          p.mesh.material.opacity = age <= 0 ? 0 : Math.max(0, 1 - (y - 1.0) / 0.78);
          p.mesh.rotation.z = Math.sin(t * 1.2 + p.phase) * 0.3;
        }

        let rib = ease.outBack(smoothstep(sparksAt, sparksAt + 0.55, t));
        if (rib < 0) rib = 0;
        else if (rib > 1.05) rib = 1.05;
        ribbonPivot.scale.set(rib * posed, rib * posed, rib > 0 ? 1 : 0);
        glowPivot.scale.setScalar(posed > 0.5 ? 1 : 0);
        glow.material.opacity = smoothstep(sparksAt, sparksAt + 0.8, t) * 0.85 * posed;
        lamp.intensity = risen * (0.25 + smoothstep(sparksAt, sparksAt + 0.9, t) * 2.1);

        if (plant) {
          plant.card.rotation.z = Math.sin(t * 1.3) * 0.02 * posed;
        }
        if (smallTable) {
          smallTable.card.position.y = smallTable.m.drop + 0.01 + Math.sin(t * 1.1) * 0.004 * posed;
        }
        void heroShift;
      },
    };
  },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function scheduleMap(paper, FONT, title, phase) {
  const W = 820;
  const H = 980;
  const { canvas, ctx } = paper.makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff6e4';
  ctx.strokeStyle = '#3a2f2a';
  ctx.lineWidth = 8;
  roundRect(ctx, 10, 10, W - 20, H - 20, 28);
  ctx.fill();
  ctx.stroke();
  // Ruled lines, so a blank sheet still reads as a schedule before the names write.
  ctx.strokeStyle = 'rgba(157, 58, 58, 0.18)';
  ctx.lineWidth = 3;
  for (let y = 300; y < H - 40; y += 86) {
    ctx.beginPath();
    ctx.moveTo(48, y);
    ctx.lineTo(W - 48, y);
    ctx.stroke();
  }
  if (phase < 1) return canvas;
  const ink = '#3a2f2a';
  const hand = (size) => `700 ${size}px ${FONT.hand}`;
  const lines = titleLines(ctx, title, hand, 112, W - 120);
  const titleSize = lines.size;
  ctx.font = hand(titleSize);
  ctx.fillStyle = '#9d3a3a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = lines.rows.length === 1 ? 150 : 118;
  const gap = titleSize * 1.15;
  for (let i = 0; i < lines.rows.length; i++) {
    ctx.fillText(lines.rows[i], W / 2, top + i * gap);
  }
  if (phase < 2) return canvas;
  const row = (name, y) => {
    const size = fitSize(ctx, `${name}  12:30`, hand, 132, W - 150);
    ctx.font = hand(size);
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 78, y);
    ctx.textAlign = 'right';
    ctx.fillText('12:30', W - 78, y);
  };
  row('Brian', 520);
  if (phase >= 3) row('Marlin', 740);
  return canvas;
}

function titleLines(ctx, title, font, px, maxW) {
  const words = title.split(' ');
  const widthOf = (text, size) => {
    ctx.font = font(size);
    return ctx.measureText(text).width;
  };
  if (words.length < 2 || widthOf(title, px) <= maxW) {
    const size = fitSize(ctx, title, font, px, maxW);
    return { rows: [title], size };
  }
  let split = 1;
  let best = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(widthOf(a, px), widthOf(b, px));
    if (w < best) { best = w; split = i; }
  }
  const rows = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
  let size = px;
  const widest = Math.max(widthOf(rows[0], size), widthOf(rows[1], size));
  if (widest > maxW && widest > 0) size *= maxW / widest;
  return { rows, size };
}

function posterCanvas(paper, FONT, text, tint, accent, kind, ink) {
  return paper.paint(420, 540, (ctx, w, h) => {
    ctx.fillStyle = tint;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8;
    roundRect(ctx, 12, 12, w - 24, h - 24, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fffdf8';
    ctx.beginPath();
    ctx.arc(w * 0.5, 36, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (kind === 'bowl') {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.42, 78, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#f6d27a';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.36, 62, 22, 0, Math.PI, 0);
      ctx.fill();
    } else {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.5);
      ctx.bezierCurveTo(w * 0.18, h * 0.28, w * 0.22, h * 0.12, w * 0.5, h * 0.24);
      ctx.bezierCurveTo(w * 0.78, h * 0.12, w * 0.82, h * 0.28, w * 0.5, h * 0.5);
      ctx.fill();
    }
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, text, font, 54, w * 0.78);
    ctx.font = font(size);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h * 0.78);
  }, { dieCut: 8, seed: text.length + 4, grain: 0.05 });
}

function speechCanvas(paper, FONT, text, burst) {
  const w = burst ? 240 : 420;
  const h = 220;
  return paper.paint(w, h, (ctx, W, H) => {
    ctx.fillStyle = '#fffdf8';
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(W * 0.08, H * 0.06, W * 0.84, H * 0.62, 28);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 0.42, H * 0.66);
    ctx.lineTo(W * 0.5, H * 0.94);
    ctx.lineTo(W * 0.6, H * 0.66);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const face = text.length < 3 ? FONT.display : FONT.hand;
    const font = (size) => `700 ${size}px ${face}`;
    const size = fitSize(ctx, text, font, Math.round(H * (text.length < 3 ? 0.34 : 0.26)), W * 0.74);
    ctx.font = font(size);
    ctx.fillStyle = text === '♥' ? '#e2574c' : '#3a2f2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W * 0.5, H * 0.36);
  }, { dieCut: 6, seed: text.length * 5 + 3, grain: 0.04 });
}

function dayCanvas(paper, FONT, day, C, n) {
  return paper.paint(300, 380, (ctx, w, h) => {
    ctx.fillStyle = '#f7efe2';
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = 6;
    ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = C.tomato;
    ctx.fillRect(10, 10, w - 20, 78);
    const font = (size) => `700 ${size}px ${FONT.hand}`;
    const size = fitSize(ctx, day, font, 54, w * 0.8);
    ctx.font = font(size);
    ctx.fillStyle = '#fff8ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(day, w / 2, 50);
    // Tiny lunch tray.
    ctx.fillStyle = '#f4e2c4';
    ctx.strokeStyle = '#6b4630';
    ctx.lineWidth = 4;
    roundRect(ctx, 78, 150, 144, 70, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e7c48a';
    ctx.fillRect(96, 164, 48, 28);
    ctx.fillStyle = '#7fb069';
    ctx.fillRect(150, 168, 48, 18);
    // Heart stamp.
    ctx.save();
    ctx.translate(w / 2 + (n - 2) * 6, 280);
    ctx.fillStyle = C.blush;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.bezierCurveTo(-26, 2, -12, -20, 0, -6);
    ctx.bezierCurveTo(12, -20, 26, 2, 0, 22);
    ctx.fill();
    ctx.restore();
  }, { dieCut: 4, seed: 20 + n, grain: 0.05 });
}

function paintSky(paper, kind) {
  const { canvas, ctx } = paper.makeCanvas(512, 360);
  const g = ctx.createLinearGradient(0, 0, 0, 360);
  if (kind === 'day') {
    g.addColorStop(0, '#7ec8ef');
    g.addColorStop(1, '#d7f0ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 360);
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.arc(390, 80, 28, 0, Math.PI * 2);
    ctx.fill();
    cloud(ctx, 120, 90, 1);
    cloud(ctx, 250, 150, 0.7);
  } else if (kind === 'sunset') {
    g.addColorStop(0, '#5c6cb5');
    g.addColorStop(0.45, '#f29a6a');
    g.addColorStop(1, '#f6d38a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 360);
    ctx.fillStyle = '#ffb15a';
    ctx.beginPath();
    ctx.arc(360, 250, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120, 70, 90, 0.35)';
    cloud(ctx, 140, 80, 1.1);
  } else {
    g.addColorStop(0, '#141a3a');
    g.addColorStop(1, '#2a3d68');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 360);
    ctx.fillStyle = '#f4ecd2';
    ctx.beginPath();
    ctx.arc(400, 70, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff8e8';
    const stars = [[40, 40], [90, 110], [160, 50], [220, 140], [300, 60], [340, 160], [80, 200], [200, 220], [460, 180], [140, 280]];
    for (let i = 0; i < stars.length; i++) {
      ctx.fillRect(stars[i][0], stars[i][1], 3, 3);
    }
  }
  return canvas;
}

function cloud(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.arc(22, 4, 14, 0, Math.PI * 2);
  ctx.arc(-20, 6, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


