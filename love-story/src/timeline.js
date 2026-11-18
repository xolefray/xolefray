/**
 * timeline.js — master schedule of "Our Love Story" (Brian & Marlin's wedding pop-up film).
 *
 * THE single source of truth for film timing: duration, leaf turns, spread windows, the narrator's
 * script (shown as captions now, recorded as a voice-over later), named story beats, the end card,
 * chapters, easing helpers, the leaf-angle function (film time -> one angle per leaf) and a
 * wall-clock Player. Everything here is pure except Player, which reads performance.now().
 *
 * Every other module (spreads, camera, titles, environment, audio) imports its times from here:
 * never hard-code a film time anywhere else. To retime the film, edit the schedule this file
 * was generated from, then this file.
 *
 * Version 3. Book: 10 leaves (0 = front cover, 1..8 inner
 * boards, 9 = back cover, which never moves) and nine spreads
 * k = 1..9; spread k lies between leaf k-1 and leaf k and opens while leaf k-1 turns.
 * Duration 308 s (5:08). Japan is spread k = 7.
 * The narrator speaks as "we". Each narration line and each spread title exists in English and Spanish;
 * which one is shown is chosen in i18n.js (LANG), not by retiming anything here.
 */
import { LEAVES } from './dims.js';
import { L, tr } from './i18n.js';

export const DURATION = 308;

export const COUPLE = {
  "him": "Brian",
  "her": "Marlin",
  "names": "Brian & Marlin",
  "weddingDate": "February 6, 2027",
  "officialDate": "February 7, 2024",
  "weddingDateEs": "6 de febrero de 2027",
  "officialDateEs": "7 de febrero de 2024"
};

/** Leaf turns: leaf i rotates φ 0 -> π between start and end (film seconds). */
export const LEAF_TURNS = [
  {
    "leaf": 0,
    "start": 9.9,
    "end": 12.9
  },
  {
    "leaf": 1,
    "start": 46.1,
    "end": 49.1
  },
  {
    "leaf": 2,
    "start": 72.6,
    "end": 75.6
  },
  {
    "leaf": 3,
    "start": 110.3,
    "end": 113.3
  },
  {
    "leaf": 4,
    "start": 148.8,
    "end": 151.8
  },
  {
    "leaf": 5,
    "start": 173.4,
    "end": 176.4
  },
  {
    "leaf": 6,
    "start": 194.7,
    "end": 197.7
  },
  {
    "leaf": 7,
    "start": 235.1,
    "end": 238.1
  },
  {
    "leaf": 8,
    "start": 253.4,
    "end": 256.4
  }
];

/** start = begins opening, open = fully open, close = begins closing, end = closed (null = never). */
export const SPREADS = [
  {
    "k": 1,
    "id": "walmart",
    "title": "Where it all began",
    "titleEs": "Donde todo comenzó",
    "start": 9.9,
    "open": 12.9,
    "close": 46.1,
    "end": 49.1
  },
  {
    "k": 2,
    "id": "lunch",
    "title": "Lunch breaks",
    "titleEs": "La hora del almuerzo",
    "start": 46.1,
    "open": 49.1,
    "close": 72.6,
    "end": 75.6
  },
  {
    "k": 3,
    "id": "dates",
    "title": "Creative dates",
    "titleEs": "Citas creativas",
    "start": 72.6,
    "open": 75.6,
    "close": 110.3,
    "end": 113.3
  },
  {
    "k": 4,
    "id": "fate",
    "title": "A little bit of fate",
    "titleEs": "Un poquito de destino",
    "start": 110.3,
    "open": 113.3,
    "close": 148.8,
    "end": 151.8
  },
  {
    "k": 5,
    "id": "official",
    "title": "February 7, 2024",
    "titleEs": "7 de febrero de 2024",
    "start": 148.8,
    "open": 151.8,
    "close": 173.4,
    "end": 176.4
  },
  {
    "k": 6,
    "id": "life",
    "title": "Building our life",
    "titleEs": "Construyendo nuestra vida",
    "start": 173.4,
    "open": 176.4,
    "close": 194.7,
    "end": 197.7
  },
  {
    "k": 7,
    "id": "japan",
    "title": "Our Japan adventure",
    "titleEs": "Nuestra aventura en Japón",
    "start": 194.7,
    "open": 197.7,
    "close": 235.1,
    "end": 238.1
  },
  {
    "k": 8,
    "id": "proposal",
    "title": "On her birthday",
    "titleEs": "En su cumpleaños",
    "start": 235.1,
    "open": 238.1,
    "close": 253.4,
    "end": 256.4
  },
  {
    "k": 9,
    "id": "wedding",
    "title": "February 6, 2027",
    "titleEs": "6 de febrero de 2027",
    "start": 253.4,
    "open": 256.4,
    "close": null,
    "end": null
  }
];

/**
 * The narrator's script, in both languages. start/end = when the line is spoken (and its caption
 * shown), in film seconds; spread = the spread it belongs to (0 = the closed book / cover).
 * `text` is English, `es` is Spanish. Copy both exactly — typographic quotes, ellipses, ¡ ¿, accents.
 */
export const NARRATION = [
  {
    "id": "c1",
    "start": 2.6,
    "end": 5.2,
    "spread": 0,
    "text": "This is our love story.",
    "es": "Esta es nuestra historia de amor."
  },
  {
    "id": "c2",
    "start": 5.9,
    "end": 8.9,
    "spread": 0,
    "text": "It began in the most unexpected place…",
    "es": "Comenzó en el lugar más inesperado…"
  },
  {
    "id": "w1",
    "start": 12.5,
    "end": 14.1,
    "spread": 1,
    "text": "Walmart.",
    "es": "Walmart."
  },
  {
    "id": "w2",
    "start": 15.2,
    "end": 22.3,
    "spread": 1,
    "text": "What started as two coworkers quickly turned into something neither of us saw coming.",
    "es": "Lo que empezó como dos compañeros de trabajo pronto se convirtió en algo que ninguno de los dos vio venir."
  },
  {
    "id": "w3",
    "start": 23.1,
    "end": 27.8,
    "spread": 1,
    "text": "At first, we were just passing by each other during our shifts.",
    "es": "Al principio, solo nos cruzábamos durante nuestros turnos."
  },
  {
    "id": "w4",
    "start": 28.6,
    "end": 35.8,
    "spread": 1,
    "text": "Marlin was a little shy and nervous around people. Brian was always kind and easy to talk to.",
    "es": "Marlin era un poco tímida y se ponía nerviosa con la gente. Brian siempre fue amable y muy fácil de tratar."
  },
  {
    "id": "w5",
    "start": 36.6,
    "end": 44.5,
    "spread": 1,
    "text": "Something made us curious about each other, and little by little, our conversations turned into something more.",
    "es": "Algo nos despertó curiosidad el uno por el otro y, poco a poco, nuestras conversaciones se convirtieron en algo más."
  },
  {
    "id": "l1",
    "start": 50.1,
    "end": 56,
    "spread": 2,
    "text": "Our first real connection happened during an assigned lunch break.",
    "es": "Nuestra primera conexión de verdad surgió en un descanso de almuerzo que nos asignaron."
  },
  {
    "id": "l2",
    "start": 56.8,
    "end": 62.6,
    "spread": 2,
    "text": "What was supposed to be a quick break turned into hours of talking and laughing.",
    "es": "Lo que iba a ser un descanso rápido se convirtió en horas de hablar y reír."
  },
  {
    "id": "l3",
    "start": 63.4,
    "end": 71,
    "spread": 2,
    "text": "From then on, lunch breaks became our thing, and we always found ourselves looking forward to the next one.",
    "es": "Desde entonces, los almuerzos se volvieron lo nuestro, y siempre nos quedábamos esperando el siguiente."
  },
  {
    "id": "d1",
    "start": 76.6,
    "end": 82.1,
    "spread": 3,
    "text": "As we got closer, we had to get creative with our dates.",
    "es": "A medida que nos acercábamos, tuvimos que ponernos creativos con nuestras citas."
  },
  {
    "id": "d2",
    "start": 82.9,
    "end": 89.4,
    "spread": 3,
    "text": "Because of strict parents, our first little adventures were walking Oliver together…",
    "es": "Con papás estrictos, nuestras primeras pequeñas aventuras fueron sacar a pasear a Oliver juntos…"
  },
  {
    "id": "d3",
    "start": 90,
    "end": 98.2,
    "spread": 3,
    "text": "…and before long, Marlin’s little sister became our unofficial third wheel, tagging along on practically every date.",
    "es": "…y muy pronto, la hermanita de Marlin se convirtió en nuestra chaperona no oficial, acompañándonos en casi todas las citas."
  },
  {
    "id": "d4",
    "start": 99,
    "end": 108.7,
    "spread": 3,
    "text": "Between dog walks, late nights, and even chasing down an Uber to rescue a forgotten phone, we started making memories of our own.",
    "es": "Entre paseos con el perro, noches largas y hasta perseguir un Uber para rescatar un celular olvidado, empezamos a crear nuestros propios recuerdos."
  },
  {
    "id": "f1",
    "start": 114.3,
    "end": 118.7,
    "spread": 4,
    "text": "Our first official date outside of work was at the movies.",
    "es": "Nuestra primera cita oficial fuera del trabajo fue en el cine."
  },
  {
    "id": "f2",
    "start": 119.4,
    "end": 124.1,
    "spread": 4,
    "text": "We didn’t even sit next to each other… but hey, it was a start!",
    "es": "Ni siquiera nos sentamos juntos… ¡pero por algo se empieza!"
  },
  {
    "id": "f3",
    "start": 125.1,
    "end": 130.9,
    "spread": 4,
    "text": "Somewhere along the way, we discovered we were meant to cross paths again.",
    "es": "En algún punto del camino, descubrimos que estábamos destinados a cruzarnos otra vez."
  },
  {
    "id": "f4",
    "start": 131.7,
    "end": 141.5,
    "spread": 4,
    "text": "When Marlin was encouraged to go to college, and was even thinking about leaving Walmart, she found out Brian went to the very same school.",
    "es": "Cuando animaron a Marlin a ir a la universidad, y hasta pensaba dejar Walmart, descubrió que Brian estudiaba en la misma escuela."
  },
  {
    "id": "f5",
    "start": 142.3,
    "end": 147.2,
    "spread": 4,
    "text": "What seemed like a coincidence felt a little more like fate.",
    "es": "Lo que parecía una coincidencia se sintió un poco más como el destino."
  },
  {
    "id": "o1",
    "start": 152.8,
    "end": 157.4,
    "spread": 5,
    "text": "On February 7, 2024, we finally made it official…",
    "es": "El 7 de febrero de 2024, por fin hicimos oficial nuestra relación…"
  },
  {
    "id": "o2",
    "start": 158,
    "end": 162.8,
    "spread": 5,
    "text": "…although Brian still insists he thought we were already dating.",
    "es": "…aunque Brian todavía insiste en que él creía que ya éramos novios."
  },
  {
    "id": "o3",
    "start": 163.7,
    "end": 167.2,
    "spread": 5,
    "text": "We went to school together, worked together…",
    "es": "Íbamos a la escuela juntos, trabajábamos juntos…"
  },
  {
    "id": "o4",
    "start": 167.8,
    "end": 171.8,
    "spread": 5,
    "text": "…and shared our first kiss on Valentine’s Day.",
    "es": "…y nos dimos nuestro primer beso el Día de San Valentín."
  },
  {
    "id": "h1",
    "start": 177.4,
    "end": 181.5,
    "spread": 6,
    "text": "As time went on, we kept building our life together.",
    "es": "Con el tiempo, seguimos construyendo nuestra vida juntos."
  },
  {
    "id": "h2",
    "start": 182.3,
    "end": 188.1,
    "spread": 6,
    "text": "We moved in together, and welcomed our first dog together: Cherry.",
    "es": "Nos fuimos a vivir juntos y le dimos la bienvenida a nuestra primera perrita: Cherry."
  },
  {
    "id": "h3",
    "start": 188.9,
    "end": 192.1,
    "spread": 6,
    "text": "Later, we bought a home of our own.",
    "es": "Más adelante, compramos nuestra propia casa."
  },
  {
    "id": "j1",
    "start": 198.7,
    "end": 204.8,
    "spread": 7,
    "text": "For our two-year anniversary, we packed our bags and flew across the world to Japan.",
    "es": "Para nuestro segundo aniversario, hicimos las maletas y cruzamos el mundo hasta Japón."
  },
  {
    "id": "j2",
    "start": 205.6,
    "end": 212.7,
    "spread": 7,
    "text": "We wandered Tokyo side by side, from the great red lantern at Asakusa to streets glowing with neon.",
    "es": "Recorrimos Tokio lado a lado, desde el gran farol rojo de Asakusa hasta calles llenas de luces de neón."
  },
  {
    "id": "j3",
    "start": 213.7,
    "end": 218.6,
    "spread": 7,
    "text": "We tried everything, got a little lost, and laughed the whole way.",
    "es": "Probamos de todo, nos perdimos un poquito y nos reímos todo el camino."
  },
  {
    "id": "j4",
    "start": 219.4,
    "end": 226.2,
    "spread": 7,
    "text": "Celebrating two years together on the other side of the world is something we’ll never forget.",
    "es": "Celebrar dos años juntos al otro lado del mundo es algo que nunca olvidaremos."
  },
  {
    "id": "j5",
    "start": 227.4,
    "end": 232.9,
    "spread": 7,
    "text": "It was more than a trip. It was the start of another unforgettable chapter.",
    "es": "Fue más que un viaje. Fue el comienzo de otro capítulo inolvidable."
  },
  {
    "id": "p1",
    "start": 239.1,
    "end": 242.9,
    "spread": 8,
    "text": "On Marlin’s birthday, Brian got down on one knee…",
    "es": "En el cumpleaños de Marlin, Brian se arrodilló…"
  },
  {
    "id": "p2",
    "start": 243.6,
    "end": 246.8,
    "spread": 8,
    "text": "…and asked her to spend forever with him.",
    "es": "…y le pidió pasar toda la vida juntos."
  },
  {
    "id": "x1",
    "start": 257.4,
    "end": 264.2,
    "spread": 9,
    "text": "And now, after three years together, we’re finally making it official in a whole new way!",
    "es": "Y ahora, después de tres años juntos, ¡por fin lo haremos oficial de una manera completamente nueva!"
  },
  {
    "id": "x2",
    "start": 265,
    "end": 268.4,
    "spread": 9,
    "text": "On February 6, 2027, we’ll be saying “I do.”",
    "es": "El 6 de febrero de 2027 diremos «Sí, acepto»."
  },
  {
    "id": "x3",
    "start": 269.4,
    "end": 277.5,
    "spread": 9,
    "text": "We wanted February 7, our anniversary… but apparently a Sunday wasn’t everyone’s idea of a good party!",
    "es": "Queríamos el 7 de febrero, nuestro aniversario… ¡pero al parecer un domingo no era la idea de una buena fiesta para todos!"
  },
  {
    "id": "x4",
    "start": 278.5,
    "end": 285.4,
    "spread": 9,
    "text": "From Walmart coworkers to college classmates, dog parents, homeowners, and now husband and wife…",
    "es": "De compañeros en Walmart a compañeros de universidad, papás perrunos, dueños de casa y, ahora, esposos…"
  },
  {
    "id": "x5",
    "start": 286,
    "end": 291.9,
    "spread": 9,
    "text": "…our story has been full of unexpected turns, laughter, and a little bit of fate.",
    "es": "…nuestra historia ha estado llena de giros inesperados, risas y un poquito de destino."
  },
  {
    "id": "x6",
    "start": 292.8,
    "end": 297.4,
    "spread": 9,
    "text": "We can’t wait to celebrate the next chapter with you!",
    "es": "¡No podemos esperar para celebrar el próximo capítulo con ustedes!"
  }
];

/** Named moments (film seconds). Spreads, camera, lights and score animate to these. */
export const BEATS = {
  "lampOn": 0.4,
  "coverReveal": 1.5,
  "walmartSign": 12.5,
  "coworkers": 15.2,
  "passingBy": 23.1,
  "shy": 28.6,
  "kind": 32.3,
  "curious": 36.6,
  "somethingMore": 40.9,
  "lunch": 50.1,
  "quickBreak": 56.8,
  "hoursTalking": 59.4,
  "ourThing": 63.4,
  "sparks": 68,
  "creativeDates": 76.6,
  "strictParents": 82.9,
  "dogWalk": 85.6,
  "sisterTagsAlong": 91,
  "lateNights": 100.2,
  "uberChaseStart": 101.9,
  "phoneRescued": 105.4,
  "memories": 106.8,
  "movies": 114.3,
  "apartSeats": 119.4,
  "itsAStart": 122.2,
  "crossPaths": 125.1,
  "college": 131.7,
  "leavingWalmart": 134.9,
  "sameSchool": 137.8,
  "fate": 142.3,
  "calendar": 152.8,
  "official": 155.3,
  "alreadyDating": 158.5,
  "schoolTogether": 163.7,
  "workTogether": 165.6,
  "firstKiss": 168.6,
  "buildingLife": 177.4,
  "firstPlace": 182.3,
  "cherry": 185.2,
  "home": 188.9,
  "twoYears": 198.7,
  "flight": 201.3,
  "arrive": 203.6,
  "tokyo": 205.6,
  "asakusa": 207.7,
  "neon": 210.7,
  "food": 213.7,
  "lost": 215.8,
  "laughed": 217.3,
  "lanterns": 219.4,
  "anniversary": 222.3,
  "moreThanATrip": 227.4,
  "nextChapter": 230.2,
  "birthday": 239.1,
  "kneel": 241,
  "question": 243.6,
  "threeYears": 257.4,
  "weddingDate": 265,
  "iDo": 267,
  "anniversaryWish": 269.4,
  "notSunday": 273,
  "coworkersMilestone": 278.9,
  "classmatesMilestone": 280.4,
  "dogParentsMilestone": 281.7,
  "homeownersMilestone": 282.8,
  "husbandAndWife": 284,
  "fullOfFate": 286,
  "celebrate": 292.8,
  "photoReveal": 247.7,
  "yes": 249.6,
  "takeoff": 192.7,
  "japan": 203.6,
  "endCard": 299.6,
  "fadeOut": 305.1
};

/**
 * version-1 aliases — beat names the six existing scenes (and the score) still import.
 * Each is the beat that now carries that moment. Do not delete these until those
 * scenes stop reading the old names.
 */
BEATS.payArgument = BEATS.hoursTalking; // version-1 name, same moment as hoursTalking
BEATS.heWins = BEATS.hoursTalking; // version-1 name, same moment as hoursTalking
BEATS.foodUntouched = BEATS.ourThing; // version-1 name, same moment as ourThing
BEATS.dogOfTheirOwn = BEATS.cherry; // version-1 name, same moment as cherry
BEATS.walmartToForever = BEATS.coworkersMilestone; // version-1 name, same moment as coworkersMilestone

/** The closing card (names + date): appears at start, the picture fades from fadeStart to end. */
export const END_CARD = {
  "start": 299.6,
  "end": 308,
  "fadeStart": 305.1
};

/** Scrubber chapters, derived: the cover, one per spread (from the moment it starts opening), the end card. */
export const CHAPTERS = [
  { t: 0, label: tr('chapterCover') },
  ...SPREADS.map((s) => ({ t: s.start, label: L(s.title, s.titleEs) })),
  { t: END_CARD.start, label: tr('chapterEnd') },
];

export function clamp(x, a = 0, b = 1) {
  return x < a ? a : x > b ? b : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Normalised progress of t through [a, b], clamped to [0, 1]. */
export function seg(t, a, b) {
  return clamp((t - a) / (b - a));
}

export function smoothstep(a, b, x) {
  const u = clamp((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

export const ease = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
};

/**
 * Leaf angles [φ0..φ(LEAVES−1)] at film time t. The back cover is always 0. Pass `out` (an array
 * of at least LEAVES numbers) to fill and return it instead of allocating (per-frame use).
 */
export function leafAngles(t, out = new Array(LEAVES).fill(0)) {
  out.fill(0, 0, LEAVES);
  for (const turn of LEAF_TURNS) {
    out[turn.leaf] = Math.PI * ease.inOutCubic(seg(t, turn.start, turn.end));
  }
  return out;
}

/** Opening angle α_k of spread k (1..SPREADS.length) for the given leaf angles. */
export function spreadAlpha(k, phis) {
  return phis[k - 1] - phis[k];
}

/** Wall-clock film player. Time is clamped to [0, duration]; pauses and fires onEnd at the end. */
export class Player {
  constructor(duration = DURATION) {
    this.duration = duration;
    this.rate = 1;
    this.onEnd = null;
    this._time = 0;
    this._playing = false;
    this._last = 0;
  }

  get playing() {
    return this._playing;
  }

  get time() {
    if (this._playing) {
      const now = performance.now();
      this._time = clamp(this._time + ((now - this._last) / 1000) * this.rate, 0, this.duration);
      this._last = now;
      if (this._time >= this.duration) {
        this._playing = false;
        if (this.onEnd) this.onEnd();
      }
    }
    return this._time;
  }

  play() {
    if (this._playing) return;
    if (this._time >= this.duration) this._time = 0;
    this._last = performance.now();
    this._playing = true;
  }

  pause() {
    if (!this._playing) return;
    this.time; // fold elapsed wall time into _time
    this._playing = false;
  }

  toggle() {
    if (this._playing) this.pause();
    else this.play();
  }

  seek(t) {
    this._time = clamp(t, 0, this.duration);
    this._last = performance.now();
  }
}
