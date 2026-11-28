// engine/pets.js
// 商店的寵物：有哪幾種、買了哪幾隻、每天的飼料和清潔費。純計算，不碰畫面、不含小孩名字。
// 買寵物記在建設本（engine/build.js，kind 'pet'，key 'pet-<種類>'，name 是取的名字），會存到試算表「建設」工作表。
// 每天的費用不另外記：照買的那一天到今天過了幾天算（和歐巴幣一樣，每次重算，換裝置也一樣）。
//   買的那一天不扣，隔天開始每天扣 price × feeRate；歐巴幣不夠也照扣，餘額會變負的。
// 送的寵物（config/pets.json 的 gift）也記在建設本：key 'pet-<種類>-gift'、coins 0（沒花錢），
//   不佔「最多買幾隻」，還能再買一隻同一種；每天的費用照那一種的價錢算，領的隔天開始扣。
import { effectiveBuilds, cleanName } from './build.js';
import { localDate } from './lunar.js';

export const PET_PREFIX = 'pet-';
export const GIFT_SUFFIX = '-gift';
const LOOKS = ['tudog', 'shepherd', 'husky', 'lab', 'cat'];
const VOICES = ['tudog', 'shepherd', 'husky', 'lab', 'tabby'];

/** 把 config/pets.json 讀成規則；數字不合理就用預設 */
export function petRules(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const rate = Number(r.feeRate);
  const max = Math.round(Number(r.nameMax));
  const breeds = [];
  const seen = new Set();
  for (const b of Array.isArray(r.breeds) ? r.breeds : []) {
    if (!b || typeof b.code !== 'string' || !/^[a-z0-9]{1,20}$/.test(b.code) || seen.has(b.code)) continue;
    const price = Math.round(Number(b.price));
    if (!(price >= 0 && price <= 100000) || typeof b.name !== 'string' || !b.name) continue;
    seen.add(b.code);
    const c = b.colors && typeof b.colors === 'object' ? b.colors : {};
    const col = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : d);
    const size = Number(b.size);
    breeds.push({
      code: b.code,
      name: b.name.slice(0, 20),
      price,
      look: LOOKS.includes(b.look) ? b.look : 'tudog',
      blurb: typeof b.blurb === 'string' ? b.blurb.slice(0, 60) : '',
      size: size >= 0.3 && size <= 3 ? size : 1,
      voice: VOICES.includes(b.voice) ? b.voice : (LOOKS.includes(b.look) && b.look !== 'cat' ? b.look : b.look === 'cat' ? 'tabby' : 'tudog'),
      say: typeof b.say === 'string' ? b.say.slice(0, 12) : '',
      colors: { body: col(c.body, '#e0a85a'), dark: col(c.dark, '#8a5a2b'), light: col(c.light, '#f6dfb4'), eye: col(c.eye, '#3b2a30') },
    });
  }
  const most = Math.round(Number(r.maxOwned));
  const giftCode = typeof r.gift?.breed === 'string' ? r.gift.breed : '';
  const snd = r.sound && typeof r.sound === 'object' ? r.sound : {};
  const vol = Number(snd.volume);
  const every = Array.isArray(snd.every) && snd.every.length === 2 ? snd.every.map(Number) : [];
  const hear = Number(snd.hear);
  return {
    feeRate: rate >= 0 && rate <= 1 ? rate : 0.1,
    nameMax: max >= 1 && max <= 40 ? max : 16,
    maxOwned: most >= 1 && most <= 50 ? most : 3,
    gift: breeds.some((b) => b.code === giftCode) ? giftCode : '',
    sound: {
      volume: vol >= 0 && vol <= 1 ? vol : 0.6,
      every: every.length === 2 && every[0] >= 3 && every[1] >= every[0] ? every : [30, 60],
      hear: hear > 0 ? hear : 30,
    },
    breeds,
  };
}

/** 建設本的 key 拆成種類和是不是送的：'pet-tudog' → { code: 'tudog', gift: false }，'pet-tudog-gift' → { code: 'tudog', gift: true } */
export function petKey(key) {
  if (typeof key !== 'string' || !key.startsWith(PET_PREFIX)) return null;
  const rest = key.slice(PET_PREFIX.length);
  const gift = rest.endsWith(GIFT_SUFFIX);
  const code = gift ? rest.slice(0, -GIFT_SUFFIX.length) : rest;
  return code ? { code, gift } : null;
}

/** 一隻寵物每天多少錢（四捨五入） */
export const dailyFee = (price, rules) => Math.round(Math.max(0, Number(price) || 0) * (rules?.feeRate ?? 0.1));

/** 某個時間是哪一天，換成「從 1970-01-01 起第幾天」（照 timeZone，預設台灣時間） */
export function dayNumber(ms, timeZone = 'Asia/Taipei') {
  const d = localDate(ms, timeZone);
  return Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86400000);
}

/**
 * 這個小孩有哪些寵物（照買的時間排）：builds 是他的建設紀錄。
 * 回傳 [{ code, key, gift（是不是送的）, name, breed（種類的名字）, at, price（買的時候花的）, fee（每天多少）, build }]
 * config 裡已經拿掉的種類照樣算錢（不會因為改設定就少扣），畫面用 tudog 的樣子。
 */
export function ownedPets(builds, rules) {
  const out = [];
  for (const b of effectiveBuilds(builds)) {
    const k = b.kind === 'pet' ? petKey(b.key) : null;
    if (!k) continue;
    const { code, gift } = k;
    const breed = rules?.breeds?.find((x) => x.code === code) || null;
    // 送的沒花錢，每天的費用照那一種現在的價錢算；買的照買的時候花的算
    const feeBase = gift ? (breed?.price || 0) : b.coins;
    out.push({ code, key: b.key, gift, name: b.name || '', breed: breed?.name || code, look: breed, at: b.at, price: b.coins, fee: dailyFee(feeBase, rules), build: b });
  }
  return out;
}

/**
 * 到 now 為止，每隻寵物扣了幾天、共多少。買的那一天不扣，隔天開始每天扣一次。
 * 回傳 { total, pets: [{ key, days, coins }] }
 */
export function petFees({ builds = [], rules, now = Date.now(), timeZone = 'Asia/Taipei' }) {
  const today = dayNumber(now, timeZone);
  let total = 0;
  const pets = [];
  for (const p of ownedPets(builds, rules)) {
    const days = Math.max(0, today - dayNumber(p.at, timeZone));
    const coins = days * p.fee;
    total += coins;
    pets.push({ key: p.key, days, coins });
  }
  return { total, pets };
}

/** 給 computeWallet 的花費：每隻寵物到今天的飼料和清潔費（一筆一隻） */
export function feeSpends(opts) {
  return petFees(opts).pets.filter((p) => p.coins > 0).map((p) => ({ id: 'fee-' + p.key, coins: p.coins, gems: {} }));
}

/**
 * 商店裡一種寵物現在的狀態：'owned' 已經買了、'full' 已經買滿 max 隻、'ready' 可以買、'short' 錢不夠、'locked' 沒登入（沒有小孩）。
 * 送的不算（送的臺灣土狗還能再買一隻臺灣土狗，也不佔 max）。
 * 回傳 { state, short（還差幾枚）, owned（買了的那一隻） }
 */
export function shopState(breed, { kid, coins, owned, max = 3 }) {
  const bought = (owned || []).filter((p) => !p.gift);
  const mine = bought.find((p) => p.code === breed.code) || null;
  if (mine) return { state: 'owned', short: 0, owned: mine };
  if (!kid) return { state: 'locked', short: 0, owned: null };
  if (bought.length >= max) return { state: 'full', short: 0, owned: null };
  const short = Math.max(0, breed.price - (Number(coins) || 0));
  return { state: short ? 'short' : 'ready', short, owned: null };
}

/** 新買的一筆（給建設本）：名字整理過、空的就不收（回傳 null） */
export function petRecord({ id, at, breed, name, rules }) {
  const n = cleanName(name, rules?.nameMax ?? 16);
  if (!n || !breed) return null;
  return { id, at, kind: 'pet', key: PET_PREFIX + breed.code, coins: breed.price, gems: {}, name: n };
}

/** 送的寵物還沒領：config 有 gift、這個小孩的建設本裡還沒有 'pet-<種類>-gift'。回傳那一種（petRules 的一種）或 null */
export function pendingGift(builds, rules) {
  if (!rules?.gift) return null;
  const key = PET_PREFIX + rules.gift + GIFT_SUFFIX;
  if (effectiveBuilds(builds).some((b) => b.key === key)) return null;
  return rules.breeds.find((b) => b.code === rules.gift) || null;
}

/** 領取送的寵物（給建設本）：沒花錢（coins 0），名字整理過、空的就不收（回傳 null） */
export function giftRecord({ id, at, breed, name, rules }) {
  const n = cleanName(name, rules?.nameMax ?? 16);
  if (!n || !breed) return null;
  return { id, at, kind: 'pet', key: PET_PREFIX + breed.code + GIFT_SUFFIX, coins: 0, gems: {}, name: n };
}

/** 歐巴幣是負的：寵物肚子餓（不走動、哭哭） */
export const isHungry = (coins) => Number(coins) < 0;
