// engine/pets.js
// 商店的寵物：有哪幾種、買了哪幾隻、每天的飼料和清潔費。純計算，不碰畫面、不含小孩名字。
// 買寵物記在建設本（engine/build.js，kind 'pet'，key 'pet-<種類>'，name 是取的名字），會存到試算表「建設」工作表。
// 每天的費用不另外記：照買的那一天到今天過了幾天算（和歐巴幣一樣，每次重算，換裝置也一樣）。
//   買的那一天不扣，隔天開始每天扣 price × feeRate；歐巴幣不夠也照扣，餘額會變負的。
import { effectiveBuilds, cleanName } from './build.js';
import { localDate } from './lunar.js';

export const PET_PREFIX = 'pet-';
const LOOKS = ['tudog', 'shepherd', 'husky'];

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
      colors: { body: col(c.body, '#e0a85a'), dark: col(c.dark, '#8a5a2b'), light: col(c.light, '#f6dfb4'), eye: col(c.eye, '#3b2a30') },
    });
  }
  return {
    feeRate: rate >= 0 && rate <= 1 ? rate : 0.1,
    nameMax: max >= 1 && max <= 40 ? max : 16,
    breeds,
  };
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
 * 回傳 [{ code, key, name, breed（種類的名字）, at, price（買的時候花的）, fee（每天多少）, build }]
 * config 裡已經拿掉的種類照樣算錢（不會因為改設定就少扣），畫面用 tudog 的樣子。
 */
export function ownedPets(builds, rules) {
  const out = [];
  for (const b of effectiveBuilds(builds)) {
    if (b.kind !== 'pet' || !b.key.startsWith(PET_PREFIX)) continue;
    const code = b.key.slice(PET_PREFIX.length);
    const breed = rules?.breeds?.find((x) => x.code === code) || null;
    out.push({ code, key: b.key, name: b.name || '', breed: breed?.name || code, look: breed, at: b.at, price: b.coins, fee: dailyFee(b.coins, rules), build: b });
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
 * 商店裡一種寵物現在的狀態：'owned' 已經有了、'ready' 可以買、'short' 錢不夠、'locked' 沒登入（沒有小孩）。
 * 回傳 { state, short（還差幾枚）, owned（買了的那一隻） }
 */
export function shopState(breed, { kid, coins, owned }) {
  const mine = (owned || []).find((p) => p.code === breed.code) || null;
  if (mine) return { state: 'owned', short: 0, owned: mine };
  if (!kid) return { state: 'locked', short: 0, owned: null };
  const short = Math.max(0, breed.price - (Number(coins) || 0));
  return { state: short ? 'short' : 'ready', short, owned: null };
}

/** 新買的一筆（給建設本）：名字整理過、空的就不收（回傳 null） */
export function petRecord({ id, at, breed, name, rules }) {
  const n = cleanName(name, rules?.nameMax ?? 16);
  if (!n || !breed) return null;
  return { id, at, kind: 'pet', key: PET_PREFIX + breed.code, coins: breed.price, gems: {}, name: n };
}

/** 歐巴幣是負的：寵物肚子餓（不走動、哭哭） */
export const isHungry = (coins) => Number(coins) < 0;
