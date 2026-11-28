// world/pet-voice.js
// 寵物的叫聲：瀏覽器即時合成（Web Audio），沒有音檔、沒有版權問題。參數和家長 2026-11-28 試聽 OK 的版本一樣。
//   tudog 臺灣土狗：兩聲短短的「汪汪」；shepherd 德國狼犬：低沉一聲；husky 哈士奇：一聲短叫＋長嚎「嗚——」；
//   lab 拉不拉多：渾厚的「汪嗚～」尾音上揚；tabby 虎斑貓：先升高再滑下來的「喵～」。
// 每次叫都有一點點不同（音高、時間隨機差一點），比較像真的。
// 背景音樂關掉（muted()）時不出聲；第一次叫要在小孩點過畫面之後（瀏覽器規定）。

export const VOICES = ['tudog', 'shepherd', 'husky', 'lab', 'tabby'];

/**
 * volume：0～1（config/pets.json 的 sound.volume）；muted：回傳現在是不是靜音的函式（跟背景音樂的開關走）。
 * 回傳 { play(voice, level = 1) → 叫多久（秒，靜音或不能播放時是 0）, played（檢查用：叫過幾次） }
 */
export function createPetVoice({ volume = 0.6, muted = () => false } = {}) {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let played = 0;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => { if (document.hidden && ctx) ctx.suspend(); });
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const jit = (v, r = 0.06) => v * (1 + (Math.random() * 2 - 1) * r);

  // 一聲狗叫：音高很快往下掉的鋸齒波＋一點氣音，經過兩個共振峰
  function bark(out0, t, { f0, f1, dur, formant, gain = 1, rough = 0.35 }) {
    const c = ctx;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    out.gain.exponentialRampToValueAtTime(gain * 0.5, t + dur * 0.45);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(out0);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(jit(f0), t);
    o.frequency.exponentialRampToValueAtTime(jit(f1), t + dur * 0.8);
    // 喉嚨的粗糙感：很快的音高抖動
    const lfo = c.createOscillator(); const lg = c.createGain();
    lfo.frequency.value = 38; lg.gain.value = f1 * 0.06;
    lfo.connect(lg); lg.connect(o.frequency);
    for (const [fq, q, g] of [[formant, 2.2, 1], [formant * 2.3, 4, 0.45]]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = jit(fq, 0.04); bp.Q.value = q;
      const gg = c.createGain(); gg.gain.value = g;
      o.connect(bp); bp.connect(gg); gg.connect(out);
    }
    const n = c.createBufferSource(); n.buffer = noiseBuf;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = formant * 1.4; nf.Q.value = 0.9;
    const ng = c.createGain(); ng.gain.setValueAtTime(rough, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.5);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    o.start(t); lfo.start(t); n.start(t, Math.random() * 0.5);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  }

  // 長嚎：音高慢慢升上去再下來，有顫音
  function howl(out0, t, { dur = 1.7, low = 380, high = 640 }) {
    const c = ctx;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.7, t + 0.25);
    out.gain.setValueAtTime(0.7, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(out0);
    const o = c.createOscillator(); o.type = 'triangle';
    const o2 = c.createOscillator(); o2.type = 'sawtooth';
    const g2 = c.createGain(); g2.gain.value = 0.18;
    for (const osc of [o, o2]) {
      osc.frequency.setValueAtTime(jit(low), t);
      osc.frequency.linearRampToValueAtTime(jit(high), t + dur * 0.45);
      osc.frequency.linearRampToValueAtTime(jit(high * 0.82), t + dur * 0.8);
      osc.frequency.linearRampToValueAtTime(jit(low * 0.9), t + dur);
    }
    const vib = c.createOscillator(); const vg = c.createGain();
    vib.frequency.value = 5.5; vg.gain.value = 9;
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(out);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + 0.05); }
  }

  // 喵：嘴巴從閉到開再閉（共振峰移動），音高先升再滑下來
  function meow(out0, t, { dur = 0.75, f = 560 }) {
    const c = ctx;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.6, t + 0.06);
    out.gain.setValueAtTime(0.6, t + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(out0);
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(jit(f * 0.85), t);
    o.frequency.linearRampToValueAtTime(jit(f * 1.35), t + dur * 0.35);
    o.frequency.linearRampToValueAtTime(jit(f * 0.95), t + dur);
    const vib = c.createOscillator(); const vg = c.createGain();
    vib.frequency.value = 7; vg.gain.value = 6; vib.connect(vg); vg.connect(o.frequency);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
    f1.frequency.setValueAtTime(500, t); f1.frequency.linearRampToValueAtTime(1300, t + dur * 0.4); f1.frequency.linearRampToValueAtTime(650, t + dur);
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
    f2.frequency.setValueAtTime(1800, t); f2.frequency.linearRampToValueAtTime(2600, t + dur * 0.4); f2.frequency.linearRampToValueAtTime(1500, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.5;
    o.connect(f1); f1.connect(out); o.connect(f2); f2.connect(g2); g2.connect(out);
    for (const x of [o, vib]) { x.start(t); x.stop(t + dur + 0.05); }
  }

  const SOUNDS = {
    tudog: (o, t) => { bark(o, t, { f0: 820, f1: 470, dur: 0.16, formant: 1250 }); bark(o, t + jit(0.22, 0.1), { f0: 860, f1: 480, dur: 0.15, formant: 1300, gain: 0.9 }); return 0.5; },
    shepherd: (o, t) => { bark(o, t, { f0: 520, f1: 260, dur: 0.28, formant: 820, gain: 1, rough: 0.5 }); return 0.4; },
    husky: (o, t) => { bark(o, t, { f0: 620, f1: 420, dur: 0.12, formant: 1000, gain: 0.5 }); howl(o, t + 0.18, { dur: 1.7 }); return 2.0; },
    lab: (o, t) => { bark(o, t, { f0: 560, f1: 330, dur: 0.22, formant: 950, rough: 0.25 }); howl(o, t + 0.2, { dur: 0.45, low: 330, high: 470 }); return 0.75; },
    tabby: (o, t) => { meow(o, t, { dur: 0.75 }); return 0.85; },
  };

  return {
    play(voice, level = 1) {
      const fn = SOUNDS[voice] || SOUNDS.tudog;
      if (muted() || !(level > 0)) return 0;
      try {
        const c = audio();
        if (!c) return 0;
        // 每一聲自己一個音量（遠的小聲）
        const out = c.createGain();
        out.gain.value = Math.min(1, level);
        out.connect(master);
        played += 1;
        return fn(out, c.currentTime + 0.03);
      } catch (err) {
        return 0;
      }
    },
    get played() { return played; },
  };
}
