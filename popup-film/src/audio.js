// STUB (T0) — replaced by T-audio
/**
 * audio.js — procedural music-box score (minimal stub: silent, all methods are no-ops).
 */

export function createAudio() {
  let muted = false;
  return {
    async start() {},
    sync(t, playing) {},
    setMuted(b) {
      muted = !!b;
    },
    get muted() {
      return muted;
    },
  };
}
