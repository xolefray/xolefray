// STUB (T0) — replaced by T-titles
/**
 * titles.js — captions, title card and "The End" (minimal stub: plain text div, no fades).
 */

export const CAPTIONS = [
  { start: 1.2, end: 6.0, text: 'The Little Paper Boat', kind: 'title' },
  { start: 1.2, end: 6.0, text: 'a pop-up film in four pages', kind: 'subtitle' },
  { start: 11.0, end: 15.5, text: 'Once, in a forest folded from a single sheet of paper,', kind: 'caption' },
  { start: 16.0, end: 20.5, text: 'a little boat was made from a page that had nothing left to say.', kind: 'caption' },
  { start: 21.0, end: 26.5, text: 'It slipped into the stream — and the stream knew the way.', kind: 'caption' },
  { start: 32.0, end: 36.5, text: 'The stream became a river. The river became the sea.', kind: 'caption' },
  { start: 37.0, end: 41.5, text: 'A lighthouse kept watch, turning its paper light round and round.', kind: 'caption' },
  { start: 42.0, end: 47.5, text: 'The waves were tall, but paper is braver than it looks.', kind: 'caption' },
  { start: 53.0, end: 57.5, text: 'By night it drifted into a city of lanterns,', kind: 'caption' },
  { start: 58.0, end: 62.5, text: 'where every window held a story, still awake.', kind: 'caption' },
  { start: 63.0, end: 68.5, text: 'The boat listened, and kept the quietest one for itself.', kind: 'caption' },
  { start: 74.0, end: 78.5, text: 'At dawn, the boat unfolded… and folded again, into wings.', kind: 'caption' },
  { start: 79.0, end: 83.5, text: 'It rose above the page, past balloons and a paper sun,', kind: 'caption' },
  { start: 84.0, end: 88.5, text: 'until somewhere, a reader turned the page.', kind: 'caption' },
  { start: 89.5, end: 96.0, text: 'The End', kind: 'end' },
];

export function createTitles(container) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;left:0;right:0;bottom:8%;text-align:center;color:#f3ead8;' +
    'font:italic 22px Georgia,serif;text-shadow:0 1px 6px #000;padding:0 16px;pointer-events:none';
  container.appendChild(el);
  let shown = null;
  return {
    update(t) {
      const text = CAPTIONS.filter((c) => t >= c.start && t < c.end)
        .map((c) => c.text)
        .join(' — ');
      if (text !== shown) el.textContent = shown = text;
    },
  };
}
