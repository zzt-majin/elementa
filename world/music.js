// world/music.js
// 背景音樂：用 Web Audio 即時合成，歌是 config/music.json 裡本專案自己寫的旋律（tools/compose_music.py）。
// 不需要任何音樂檔，沒有版權問題。小孩第一次點畫面後才開始；可以換上一首、下一首、關掉。

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

export function noteToHz(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) return 0;
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * 音色：wave 波形；partials 是 [倍頻, 音量]（八音盒、木琴靠泛音聽出差別）；
 * attack 起音秒數；decay 敲下去以後多久消失；sustain = true 的（笛子）照音符長度吹，最後 release 秒收掉。
 */
export const INSTRUMENTS = {
  musicbox: { wave: 'sine', partials: [[1, 1], [2, 0.35], [3.01, 0.12]], attack: 0.01, decay: 1.4, gain: 0.5 },
  marimba: { wave: 'sine', partials: [[1, 1], [3.93, 0.22], [9.2, 0.04]], attack: 0.005, decay: 0.6, gain: 0.6 },
  celesta: { wave: 'triangle', partials: [[1, 1], [2, 0.4], [4, 0.12]], attack: 0.005, decay: 1.0, gain: 0.45 },
  kalimba: { wave: 'sine', partials: [[1, 1], [5.4, 0.14], [11.1, 0.04]], attack: 0.004, decay: 0.9, gain: 0.55 },
  harp: { wave: 'triangle', partials: [[1, 1], [2, 0.22], [3, 0.06]], attack: 0.006, decay: 1.6, gain: 0.45 },
  flute: { wave: 'sine', partials: [[1, 1], [2, 0.12], [3, 0.05]], attack: 0.06, sustain: true, release: 0.18, gain: 0.32 },
  bell: { wave: 'sine', partials: [[1, 1], [2.76, 0.35], [5.4, 0.18], [8.93, 0.06]], attack: 0.004, decay: 2.2, gain: 0.4 },
};
const BASS = { wave: 'sine', partials: [[1, 1], [2, 0.18]], attack: 0.02, gain: 0.32 };

/** 把 config/music.json 整理成歌單；不合格的歌跳過。也接受舊的 world.json music（只有一首） */
export function songList(raw = {}) {
  const list = Array.isArray(raw.songs) ? raw.songs : Array.isArray(raw.notes) ? [{ name: '', ...raw }] : [];
  const out = [];
  for (const s of list) {
    if (!s || !Array.isArray(s.notes) || !s.notes.length || s.notes.length > 2000) continue;
    const notes = s.notes.map((n) => (typeof n === 'string' && (n === '-' || noteToHz(n) > 0) ? n : '-'));
    if (!notes.some((n) => n !== '-')) continue;
    const bpm = Number(s.beatsPerMinute);
    out.push({
      name: typeof s.name === 'string' ? s.name.slice(0, 20) : '',
      instrument: INSTRUMENTS[s.instrument] ? s.instrument : 'musicbox',
      bpm: bpm >= 30 && bpm <= 240 ? bpm : 96,
      notes,
      lengths: noteLengths(notes),
      bass: Array.isArray(s.bass) ? s.bass.filter((n) => typeof n === 'string' && noteToHz(n) > 0) : [],
      bassEvery: Number(s.bassEvery) >= 1 && Number(s.bassEvery) <= 32 ? Math.round(Number(s.bassEvery)) : 4,
    });
  }
  return out;
}

/** 每個音延長幾格（到下一個音為止，繞回開頭也算）；笛子照這個長度吹 */
export function noteLengths(notes) {
  const n = notes.length;
  return notes.map((x, i) => {
    if (x === '-') return 0;
    let k = 1;
    while (k < n && notes[(i + k) % n] === '-') k++;
    return k;
  });
}

/** 換歌：往前或往後，繞一圈 */
export function wrapIndex(i, total) {
  if (!total) return 0;
  return ((Math.round(i) % total) + total) % total;
}

export function createMusicBox(raw, { muted = false, song = 0 } = {}) {
  const songs = songList(raw);
  const volume = Number(raw?.volume) > 0 && Number(raw.volume) <= 1 ? Number(raw.volume) : 0.18;
  let index = wrapIndex(song, songs.length);
  let ctx = null;
  let master = null;
  let bus = null; // 每首歌一條，換歌時把舊的淡出
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let isMuted = muted;
  let isQuiet = false; // 暫時安靜（例如聽寫題要聽朗讀）；和小孩自己按的「關掉音樂」分開記
  const silent = () => isMuted || isQuiet;
  let sleepTimer = null;

  function voice(inst, freq, at, length, level) {
    const out = ctx.createGain();
    const peak = Math.max(0.0002, level * inst.gain);
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(peak, at + inst.attack);
    let end;
    if (inst.sustain) {
      const hold = Math.max(inst.attack + 0.02, length - (inst.release || 0.15));
      out.gain.setValueAtTime(peak, at + hold);
      end = at + hold + (inst.release || 0.15);
    } else {
      end = at + (inst.decay || length);
    }
    out.gain.exponentialRampToValueAtTime(0.0001, end);
    out.connect(bus);
    for (const [mul, g] of inst.partials) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = inst.wave;
      osc.frequency.value = freq * mul;
      og.gain.value = g;
      osc.connect(og).connect(out);
      osc.start(at);
      osc.stop(end + 0.05);
    }
  }

  function schedule() {
    const s = songs[index];
    if (!s || !ctx) return;
    const beat = 60 / s.bpm / 2; // 一格是八分音符
    const inst = INSTRUMENTS[s.instrument];
    while (nextTime < ctx.currentTime + 0.25) {
      const i = step % s.notes.length;
      const note = s.notes[i];
      if (note !== '-') voice(inst, noteToHz(note), nextTime, s.lengths[i] * beat, 1);
      if (s.bass.length && step % s.bassEvery === 0) {
        const b = s.bass[Math.floor(step / s.bassEvery) % s.bass.length];
        voice({ ...BASS, decay: s.bassEvery * beat * 1.1 }, noteToHz(b), nextTime, s.bassEvery * beat, 1);
      }
      step++;
      nextTime += beat;
    }
  }

  function newBus() {
    if (bus) {
      const old = bus;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.08); // 舊歌淡出，不會兩首疊在一起
      setTimeout(() => old.disconnect(), 3000);
    }
    bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(master);
    step = 0;
    nextTime = ctx.currentTime + 0.12;
  }

  function start() {
    if (!songs.length) return;
    if (ctx) { if (ctx.state === 'suspended' && !silent()) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = silent() ? 0 : volume;
    master.connect(ctx.destination);
    newBus();
    timer = setInterval(schedule, 100);
    if (silent()) ctx.suspend();
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else if (!silent()) ctx.resume();
    });
  }

  function apply() {
    if (!ctx) return;
    clearTimeout(sleepTimer);
    if (silent()) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      sleepTimer = setTimeout(() => { if (silent() && ctx) ctx.suspend(); }, 400); // 關掉後讓音效晶片休息，平板比較省電
    } else {
      ctx.resume();
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.08);
    }
  }
  function setMuted(m) { isMuted = !!m; apply(); }
  /** 暫時安靜：on=true 音樂淡出，false 回來（小孩自己關掉音樂的話照樣不放） */
  function setQuiet(on) { isQuiet = !!on; apply(); }

  function setSong(i) {
    index = wrapIndex(i, songs.length);
    if (ctx) newBus();
    return index;
  }

  return {
    start,
    setMuted,
    setQuiet,
    setSong,
    next: () => setSong(index + 1),
    prev: () => setSong(index - 1),
    get muted() { return isMuted; },
    get quiet() { return isQuiet; },
    get index() { return index; },
    get count() { return songs.length; },
    get name() { return songs[index]?.name || ''; },
    stop() { if (timer) clearInterval(timer); if (ctx) ctx.close(); ctx = null; },
  };
}
