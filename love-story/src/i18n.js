/**
 * i18n.js — English and Spanish for the shell around the scenes.
 *
 * LANG is fixed when this module loads: window.__LANG if it is set (an unknown value stays
 * English and does not fall through to the URL), otherwise the last `lang` query parameter,
 * otherwise English. Anything that is not `en` or `es` is English. Switching language reloads
 * the page, so nothing here listens for a change.
 *
 * This module does not import the timeline. timeline.js, titles.js, book.js, ui.js and main.js
 * import it.
 */

export const LANGS = ['en', 'es'];

function known(raw) {
  const code = String(raw ?? '').trim().toLowerCase();
  return LANGS.includes(code) ? code : 'en';
}

function resolveLang() {
  try {
    if (typeof window !== 'undefined' && window.__LANG != null && String(window.__LANG) !== '') {
      return known(window.__LANG);
    }
    if (typeof location !== 'undefined') {
      const all = new URLSearchParams(location.search).getAll('lang');
      if (all.length) return known(all[all.length - 1]);
    }
  } catch {
    /* no document: English */
  }
  return 'en';
}

export const LANG = resolveLang();

/** Spanish when LANG is es and a Spanish string was given; otherwise English. */
export function L(en, es) {
  if (LANG === 'es' && es != null && es !== '') return es;
  return en;
}

/** The narration line in the active language. */
export function narrationText(line) {
  if (!line) return '';
  return L(line.text, line.es);
}

/** The spread's washi-tape title in the active language. */
export function spreadTitle(spread) {
  if (!spread) return '';
  return L(spread.title, spread.titleEs);
}

/** Shared UI and title strings. Spread titles live on SPREADS, not here. */
export const STRINGS = {
  pageTitle: { en: 'Our Love Story', es: 'Nuestra historia de amor' },
  coverTitle: { en: 'OUR LOVE STORY', es: 'NUESTRA HISTORIA DE AMOR' },
  endNames: { en: 'BRIAN & MARLIN', es: 'BRIAN & MARLIN' },
  endDate: { en: 'February 6, 2027', es: '6 de febrero de 2027' },
  chapterCover: { en: 'Cover', es: 'Portada' },
  chapterEnd: { en: 'See you there', es: 'Nos vemos ahí' },
  controls: { en: 'Film controls', es: 'Controles de la película' },
  seek: { en: 'Seek', es: 'Buscar' },
  play: { en: 'Play', es: 'Reproducir' },
  pause: { en: 'Pause', es: 'Pausa' },
  replay: { en: 'Replay', es: 'Otra vez' },
  mute: { en: 'Mute', es: 'Silenciar' },
  unmute: { en: 'Unmute', es: 'Activar sonido' },
  fullscreen: { en: 'Full screen', es: 'Pantalla completa' },
  exitFullscreen: { en: 'Exit full screen', es: 'Salir de pantalla completa' },
  readAgain: { en: 'Read it again', es: 'Leerla otra vez' },
  of: { en: 'of', es: 'de' },
  language: { en: 'Language', es: 'Idioma' },
  begin: { en: 'Begin', es: 'Empezar' },
  introLine: { en: 'Open the scrapbook and see how it all began.', es: 'Abre el álbum y mira cómo empezó todo.' },
  introHint: { en: 'About four and a half minutes · best with sound', es: 'Unos cuatro minutos y medio · mejor con sonido' },
  introStatus: { en: 'gluing in the photos…', es: 'pegando las fotos…' },
  introAria: { en: 'Our Love Story', es: 'Nuestra historia de amor' },
  errorFold: {
    en: 'The pages stuck together while folding. Please reload to try again.',
    es: 'Las páginas se pegaron al doblarse. Recarga para intentarlo de nuevo.',
  },
  errorWebgl: {
    en: 'This film is drawn live with WebGL, which this browser could not provide.',
    es: 'Esta película se dibuja en vivo con WebGL, y este navegador no pudo hacerlo.',
  },
  canvasAria: {
    en: 'A hand-made pop-up scrapbook on a desk, telling how Brian and Marlin met and got engaged',
    es: 'Un álbum pop-up hecho a mano sobre un escritorio, que cuenta cómo se conocieron Brian y Marlin',
  },
  metaDescription: {
    en: 'Our Love Story — Brian & Marlin. A four-and-a-half-minute pop-up scrapbook film about how they met, drawn live in your browser.',
    es: 'Nuestra historia de amor — Brian y Marlin. Una película de unos cuatro minutos y medio, un álbum pop-up sobre cómo se conocieron, dibujada en vivo en el navegador.',
  },
  stubPlaceholder: { en: 'a real pop-up scene goes here', es: 'aquí va una escena pop-up de verdad' },
};

export function tr(key) {
  const row = STRINGS[key];
  if (!row) return key;
  return L(row.en, row.es);
}

/** Three cover lines: OUR / LOVE / STORY, or NUESTRA / HISTORIA / DE AMOR. */
export function coverLines(title = tr('coverTitle')) {
  const words = String(title).trim().split(/\s+/);
  if (words.length === 4) return [words[0], words[1], `${words[2]}\u00a0${words[3]}`];
  return words;
}

/** Page title, <html lang>, and the static intro card. Safe to call more than once. */
export function applyChrome() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = LANG;
  document.title = tr('pageTitle');
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', tr('metaDescription'));

  const title = document.getElementById('intro-title');
  if (title) {
    title.setAttribute('aria-label', tr('introAria'));
    const lines = coverLines();
    const spans = title.querySelectorAll('.intro__word');
    lines.forEach((line, i) => {
      const span = spans[i];
      if (!span) return;
      span.replaceChildren(...[...line].map((ch) => {
        const letter = document.createElement('i');
        letter.textContent = ch;
        return letter;
      }));
    });
  }
  const line = document.querySelector('.intro__line');
  if (line) line.textContent = tr('introLine');
  const hint = document.querySelector('.intro__hint');
  if (hint) hint.textContent = tr('introHint');
  const intro = document.getElementById('intro');
  const status = document.querySelector('.intro__status-text');
  if (status && intro && intro.dataset.state !== 'error') status.textContent = tr('introStatus');
  const begin = document.querySelector('.intro__begin');
  if (begin) {
    const text = [...begin.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
    const label = ` ${tr('begin')}`;
    if (text.length) text[text.length - 1].textContent = label;
    else begin.append(document.createTextNode(label));
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyChrome);
  else applyChrome();
}
