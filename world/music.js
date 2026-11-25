// world/music.js
// 背景音樂：用 Web Audio 即時合成八音盒聲，旋律由 config/world.json 的 music 提供。
// 不需要任何音樂檔，沒有版權問題。小孩第一次點畫面後才開始，可以靜音。

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

export function noteToHz(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) return 0;
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

export function createMusicBox(cfg, { muted = false } = {}) {
  let ctx = null;
  let master = null;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let isMuted = muted;
  const beat = 60 / cfg.beatsPerMinute / 2; // 每個音符是八分音符

  function chime(freq, at, length, gain) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, at + length);
    out.connect(master);
    // 基音＋兩個泛音，聽起來像八音盒
    [[1, 1], [2, 0.35], [3.01, 0.12]].forEach(([mul, g]) => {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mul;
      og.gain.value = g;
      osc.connect(og).connect(out);
      osc.start(at);
      osc.stop(at + length + 0.05);
    });
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.25) {
      const note = cfg.notes[step % cfg.notes.length];
      if (note && note !== '-') chime(noteToHz(note), nextTime, 1.4, 0.5);
      if (step % 4 === 0 && cfg.bass && cfg.bass.length) {
        const b = cfg.bass[Math.floor(step / 4) % cfg.bass.length];
        chime(noteToHz(b), nextTime, 2.2, 0.35);
      }
      step++;
      nextTime += beat;
    }
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = isMuted ? 0 : cfg.volume;
    master.connect(ctx.destination);
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 100);
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
  }

  function setMuted(m) {
    isMuted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : cfg.volume, ctx.currentTime, 0.1);
  }

  return {
    start,
    setMuted,
    get muted() { return isMuted; },
    stop() { if (timer) clearInterval(timer); if (ctx) ctx.close(); ctx = null; },
  };
}
