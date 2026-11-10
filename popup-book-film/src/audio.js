// STUB audio: no-op object with the contracted methods. Must stay silent until
// a user gesture (the real implementation creates its AudioContext lazily).
export function createAudio(ctx, film) {
  let muted = false;
  return {
    update(state) {},
    setMuted(b) { muted = !!b; },
    get muted() { return muted; },
  };
}
