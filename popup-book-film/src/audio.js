// The soundtrack: a procedural lullaby for music box, celesta, harp, pad and a
// little low marimba, plus paper foley — all synthesised with Web Audio from a
// precomputed, deterministic event list (src/audio/score.js).
//
// Live playback: the AudioContext is created/resumed lazily on the first user
// gesture (never before). Sound follows film time: on play / seek / resync a
// "session" maps film time to context time; a look-ahead scheduler starts the
// events that fall within the next LOOKAHEAD seconds; voices that began before
// the start point join mid-note at the right level. Pause / seek / end fade
// the session out in ~40 ms and stop every node.
//
// Offline: renderWav() renders the whole film through an OfflineAudioContext
// with the same session/voice code and returns a 16-bit stereo 44.1 kHz WAV.
import { buildScore } from './audio/score.js';
import { createMaster, createSession, disposeSession, playEvent } from './audio/synth.js';
import { encodeWav } from './audio/wav.js';

const LOOKAHEAD = 0.3;     // seconds of film scheduled ahead of the audio clock
const PUMP_MS = 50;        // scheduler timer period (also pumped from update())
const LEAD = 0.06;         // context-time lead for a session start
const FADE_TAU = 0.012;    // stop fade time constant (~40 ms to silence)
const RESTART_MS = 120;    // seek debounce while playing
const DRIFT_MAX = 0.3;     // film/audio clock drift that triggers a resync ...
const RESYNC_GAP = 2.0;    // ... at most this often (s of audio clock): slow machines whose
                           // film clock lags (dt clamp) get a resync every 2 s, not a stutter
const RATE = 44100;

let SCORE = null;
const score = () => (SCORE ??= buildScore());

/** Schedule every event of `events` with t in [fromFilm, toFilm) plus, if `late`, those already sounding. */
function scheduleRange(S, events, i, toFilm, now) {
  while (i < events.length && events[i].t < toFilm) {
    const ev = events[i++];
    if (playEvent(S, ev, S.ctxOf(ev.t), now)) S.scheduled++;
  }
  return i;
}

function openSession(ac, masterIn, filmStart, ctxStart, autoDispose = true) {
  const S = createSession(ac, masterIn, { autoDispose });
  S.filmStart = filmStart;
  S.ctxStart = ctxStart;
  S.ctxOf = (ft) => ctxStart + (ft - filmStart);
  S.filmAt = (ct) => filmStart + (ct - ctxStart);
  S.scheduled = 0;
  // voices that started before filmStart and are still sounding join mid-note
  const events = score();
  let i = 0;
  while (i < events.length && events[i].t < filmStart) {
    const ev = events[i++];
    if (ev.t + ev.dur > filmStart + 0.01 && playEvent(S, ev, S.ctxOf(ev.t), ctxStart)) S.scheduled++;
  }
  S.next = i;
  return S;
}

export function createAudio(ctx, film) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null;
  let master = null;
  let session = null;
  let muted = false;
  let status = AC ? 'locked' : 'unsupported';   // 'locked' | 'running' | 'unsupported'
  let unlockStamp = -1;                          // event.timeStamp of the unlocking gesture
  let pumpTimer = 0;
  let restartTimer = 0;
  let totalScheduled = 0;
  let sessions = 0;
  const dying = new Set();                       // sessions fading out
  const listeners = new Set();
  const notify = () => { for (const fn of [...listeners]) fn(status); };

  // --- gesture unlock -----------------------------------------------------------
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  function onGesture(e) {
    if (status !== 'locked') return;
    // Only act on a real activation, so the browser never warns about an
    // AudioContext that was not allowed to start (touch pointerdown is not one).
    const ua = navigator.userActivation;
    if (ua && !ua.isActive) return;
    if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey)) return;
    unlock(e);
  }
  function unlock(e) {
    if (status !== 'locked') return;
    try {
      if (!ac) {
        ac = new AC({ latencyHint: 'playback' });
        master = createMaster(ac, ac.destination);
        master.mute.gain.value = muted ? 0 : 1;
        ac.addEventListener('statechange', onState);
      }
      if (e) unlockStamp = e.timeStamp;
      const p = ac.resume();
      if (p && p.then) p.then(onState, () => {});
      onState();
    } catch {
      /* stay locked; a later gesture tries again */
    }
  }
  function onState() {
    if (!ac) return;
    const running = ac.state === 'running';
    const next = running ? 'running' : 'locked';
    if (next === status) return;
    status = next;
    if (running) {
      for (const ev of GESTURES) window.removeEventListener(ev, onGesture, true);
      if (film.playing) start();
    } else {
      stop();
      if (ac.state !== 'closed') for (const ev of GESTURES) window.addEventListener(ev, onGesture, true);
    }
    notify();
  }
  if (AC) for (const ev of GESTURES) window.addEventListener(ev, onGesture, true);

  // --- sessions -------------------------------------------------------------------
  function start() {
    clearTimeout(restartTimer);
    restartTimer = 0;
    if (status !== 'running' || !film.playing) return;
    stop();
    const ft = film.time;
    session = openSession(ac, master.input, ft, ac.currentTime + LEAD);
    sessions++;
    totalScheduled += session.scheduled;
    pump();
    if (!pumpTimer) pumpTimer = setInterval(pump, PUMP_MS);
  }
  function pump() {
    const S = session;
    if (!S) return;
    const filmNow = S.filmAt(ac.currentTime);
    const before = S.scheduled;
    S.next = scheduleRange(S, score(), S.next, filmNow + LOOKAHEAD, ac.currentTime + 0.01);
    totalScheduled += S.scheduled - before;
  }
  function stop() {
    clearInterval(pumpTimer);
    pumpTimer = 0;
    const S = session;
    session = null;
    if (!S) return;
    const now = ac.currentTime;
    const g = S.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(0, now, FADE_TAU);
    for (const V of [...S.voices]) V.stop(now + 0.1);
    dying.add(S);
    setTimeout(() => {
      for (const V of [...S.voices]) V.dispose();
      disposeSession(S);
      dying.delete(S);
    }, 400);
  }
  function restartSoon() {
    stop();
    clearTimeout(restartTimer);
    restartTimer = setTimeout(start, RESTART_MS);
  }

  film.on('play', () => start());
  film.on('pause', () => { clearTimeout(restartTimer); restartTimer = 0; stop(); });
  film.on('end', () => { clearTimeout(restartTimer); restartTimer = 0; stop(); });
  film.on('seek', () => { if (film.playing && status === 'running') restartSoon(); else stop(); });
  document.addEventListener('visibilitychange', () => {
    if (status !== 'running') return;
    if (document.hidden) stop();
    else if (film.playing) restartSoon();
  });

  return {
    update(state) {
      if (status !== 'running') return;
      if (!film.playing) return;
      if (!session) {
        if (!restartTimer) start();
        return;
      }
      // keep the film and audio clocks together
      const drift = session.filmAt(ac.currentTime) - state.t;
      if (Math.abs(drift) > DRIFT_MAX && ac.currentTime > session.ctxStart + RESYNC_GAP) restartSoon();
      else pump();
    },
    setMuted(b) {
      muted = !!b;
      if (!muted && status === 'locked') unlock(null);
      if (master) {
        const g = master.mute.gain;
        const now = ac.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.setTargetAtTime(muted ? 0 : 1, now, 0.03);
      }
      notify();
    },
    get muted() { return muted; },
    /** 'locked' (waiting for a user gesture) | 'running' | 'unsupported'. */
    get status() { return status; },
    /** event.timeStamp of the gesture that unlocked audio (-1 if none yet). */
    get unlockStamp() { return unlockStamp; },
    /** Try to start audio now (call from a user-gesture handler). */
    unlock(e) { unlock(e || null); },
    /** Subscribe to status / mute changes. Returns an unsubscribe function. */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get debug() {
      let voices = 0;
      if (session) voices += session.voices.size;
      for (const S of dying) voices += S.voices.size;
      return {
        context: ac ? ac.state : 'none',
        status, muted,
        sessions,
        session: !!session,
        dyingSessions: dying.size,
        scheduledEvents: totalScheduled,
        activeVoices: voices,
        nodesCreated: (session ? session.created : 0),
        events: score().length,
      };
    },
    /** The complete soundtrack as a 16-bit PCM stereo 44.1 kHz WAV (ArrayBuffer). */
    async renderWav() {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const len = Math.round(film.duration * RATE);
      const oc = new OAC(2, len, RATE);
      const m = createMaster(oc, oc.destination);
      const S = openSession(oc, m.input, 0, 0, false);
      scheduleRange(S, score(), S.next, Infinity, 0);
      S.finish();
      const buf = await oc.startRendering();
      return encodeWav(buf);
    },
  };
}
