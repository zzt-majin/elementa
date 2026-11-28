// world/speech.js
// 英語朗讀：用瀏覽器內建的 Web Speech API（speechSynthesis），免費、不用伺服器、沒有素材版權問題。
// 每台裝置的聲音不一樣；找不到英文聲音時，按鈕旁邊會寫「這台裝置沒有英文朗讀聲音」。
// 之後有預先做好的音檔（assets/audio/），可以在 say() 前面先找音檔播。
// 參數在 config/speech.json：lang（en-US）、rate（正常速度）、slowRate（慢速）。

export function createSpeaker(config = {}, synth = globalThis.speechSynthesis) {
  const lang = config.lang || 'en-US';
  const rate = Number(config.rate) > 0 ? Number(config.rate) : 0.9;
  const slowRate = Number(config.slowRate) > 0 ? Number(config.slowRate) : 0.6;
  let voice = null;
  let checked = false;

  function pickVoice() {
    if (!synth || typeof synth.getVoices !== 'function') return null;
    const all = synth.getVoices() || [];
    const want = lang.toLowerCase();
    const en = all.filter((v) => String(v.lang || '').toLowerCase().replace('_', '-').startsWith('en'));
    voice = en.find((v) => v.lang.toLowerCase().replace('_', '-') === want) || en[0] || null;
    if (all.length) checked = true;
    return voice;
  }
  if (synth && typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', pickVoice);
  pickVoice();

  return {
    /** 這台裝置能不能唸英文（聲音清單還沒載好時先當作可以，按下去再看） */
    get available() { if (!voice) pickVoice(); return !!synth && (!!voice || !checked); },
    /** 唸一段英文；slow：慢速。回傳 false 表示這台裝置唸不出來 */
    say(text, { slow = false } = {}) {
      if (!synth || !text || typeof SpeechSynthesisUtterance === 'undefined') return false;
      if (!voice) pickVoice();
      if (checked && !voice) return false;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = voice?.lang || lang;
      if (voice) u.voice = voice;
      u.rate = slow ? slowRate : rate;
      synth.speak(u);
      return true;
    },
    stop() { try { synth?.cancel(); } catch { /* 沒有朗讀功能 */ } },
  };
}

/**
 * 一排喇叭按鈕：「🔊 聽」「🐢 慢慢聽」。唸不出來時換成一行說明。
 * labels：config/text.json 的 speech 區（listen、again、slow、none）。
 * again：聽寫題用「🔊 再聽一次」的字（第一次按完也會換成這個字）。
 */
export function speakButtons(speaker, text, labels = {}, { again = false } = {}) {
  const row = document.createElement('div');
  row.className = 'speak-row';
  const note = document.createElement('span');
  note.className = 'speak-none';
  note.setAttribute('aria-live', 'polite');
  const make = (label, slow) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost small speak';
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation(); // 學習卡上按喇叭不要翻面
      const ok = speaker?.say(text, { slow });
      if (!ok) { note.textContent = labels.none || ''; return; }
      if (!slow && labels.again) b.textContent = labels.again;
    });
    return b;
  };
  row.append(make(again ? labels.again || labels.listen : labels.listen, false), make(labels.slow, true), note);
  if (speaker && !speaker.available) note.textContent = labels.none || '';
  return row;
}
