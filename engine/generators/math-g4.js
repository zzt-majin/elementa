// engine/generators/math-g4.js
// 國小四年級上學期數學題型產生器（獨立於六年級 engine/generators/math.js）。
// 使用方式：import { registerTypes } from '../generate.js'; import { MATH_G4_TYPES } from './math-g4.js'; registerTypes(MATH_G4_TYPES);
// 每個產生器回傳格式與 engine/generate.js 相同：{ type: '選擇'|'填答', text, options, answers, unit, tip }
import { F, cmp, gcd, fracText, mixedText, acceptAll } from '../frac.js';
import { retry } from './math.js';

function choice(rng, right, wrongs, { keepOrder = false } = {}) {
  const seen = new Set([right]);
  const ws = [];
  for (const w of wrongs) if (w != null && !seen.has(w)) { seen.add(w); ws.push(w); }
  if (!ws.length) retry();
  const opts = [{ text: right, correct: true }, ...ws.slice(0, 3).map((t) => ({ text: t, correct: false }))];
  return keepOrder ? opts : rng.shuffle(opts);
}
const fill = (text, answers, unit, tip) => ({ type: '填答', text, answers, unit: unit || '', tip });
const pick = (text, options, tip) => ({ type: '選擇', text, options, tip });

const SIGN_OPTS = ['大於（＞）', '小於（＜）', '等於（＝）'];
const signText = (d) => (d > 0 ? '大於（＞）' : d < 0 ? '小於（＜）' : '等於（＝）');

/** 把萬以上整數寫成「幾萬幾千」的課本讀法（例如 258000 → 25 萬 8000） */
function wanText(n) {
  const w = Math.floor(n / 10000);
  const r = n % 10000;
  return r === 0 ? w + ' 萬' : w + ' 萬 ' + r;
}

// =====================================================================
// 單元一：一億以內的數
// =====================================================================
const bignumUnit = {
  /** 「比…少／比…多」逆向大數加減應用題（常錯：看到「少」就無腦減） */
  'g4-bignum-word'(rng) {
    const baseW = rng.int(120, 750); // 120 萬～750 萬
    const baseT = rng.int(1, 9) * 1000 + rng.int(1, 9) * 10000;
    const base = baseW * 10000 + (baseT % 100000);
    const diffW = rng.int(12, 68);
    const diffT = rng.int(1, 9) * 1000;
    const diff = diffW * 10000 + diffT;
    const less = rng.chance(0.65); // 考卷最容易錯的是「上個月比這個月少→求這個月要用加」
    const ans = less ? base + diff : base - diff;
    if (ans <= 0 || ans >= 99999999) retry();
    const ctx = rng.pick([
      { subj: '爺爺響應愛心公益，上個月捐了', cmp: '比這個月', ask: '這個月捐了多少元', u: '元', aName: '上個月', bName: '這個月' },
      { subj: '圖書館去年借出', cmp: '比今年', ask: '今年借出多少本書', u: '本', aName: '去年', bName: '今年' },
      { subj: '遊樂園這個月入園人數是', cmp: '比上個月', ask: '上個月入園人數是多少人', u: '人', aName: '這個月', bName: '上個月' },
      { subj: '工廠上半年賣出', cmp: '比下半年', ask: '下半年賣出多少個商品', u: '個', aName: '上半年', bName: '下半年' },
    ]);
    const dir = less ? '少' : '多';
    const op = less ? '＋' : '－';
    const wrongOp = less ? '－' : '＋';
    return fill(
      ctx.subj + ' ' + base + ' ' + ctx.u + '，' + ctx.cmp + dir + ' ' + wanText(diff) + ' ' + ctx.u + '。' + ctx.ask + '？',
      [String(ans)],
      ctx.u,
      '先想清楚誰比較多：' + ctx.aName + '「比' + ctx.bName + dir + '」，代表' + ctx.bName + '比較' + (less ? '多' : '少') + '，所以要用' + (less ? '加法' : '減法') + '（不要看到「' + dir + '」就直接用' + wrongOp + '）。' + wanText(diff) + ' ＝ ' + diff + '，列式：' + base + ' ' + op + ' ' + diff + ' ＝ ' + ans + ' ' + ctx.u + '。'
    );
  },

  /** 大數位值組合比大小（如：6 個千萬 ＋ 12 個十萬 ○ 62000000） */
  'g4-bignum-compare'(rng) {
    const a = rng.int(2, 8);        // 幾個千萬
    const b = rng.int(11, 29);      // 幾個十萬（故意超過 10，考進位到百萬）
    const leftVal = a * 10000000 + b * 100000;
    const mode = rng.int(0, 2);
    let rightVal;
    if (mode === 0) rightVal = leftVal; // 相等
    else if (mode === 1) rightVal = a * 10000000 + (b + rng.pick([-10, -2, -1])) * 100000;
    else rightVal = a * 10000000 + (b + rng.pick([1, 2, 10])) * 100000;
    if (rightVal <= 0) retry();
    const right = signText(leftVal - rightVal);
    return pick(
      '比大小：' + a + ' 個千萬 ＋ ' + b + ' 個十萬 ○ ' + rightVal + '，○ 裡要填什麼？',
      choice(rng, right, SIGN_OPTS.filter((s) => s !== right), { keepOrder: true }),
      a + ' 個千萬是 ' + (a * 10000000) + '，' + b + ' 個十萬是 ' + (b * 100000) + '（10 個十萬＝1 個百萬），合起來是 ' + leftVal + '。再和 ' + rightVal + ' 比較，所以填' + right + '。'
    );
  },
};

// =====================================================================
// 單元二：整數的乘法（末尾 0、分配律拆數、整百乘法比方案）
// =====================================================================
const ZERO_PAIRS = [
  [800, 125], [400, 25], [80, 125], [40, 250], [200, 50],
  [500, 160], [500, 120], [250, 40], [250, 80], [250, 160],
  [125, 400], [125, 160], [600, 50], [400, 75], [800, 25],
  [500, 240], [200, 150], [50, 400], [25, 800], [125, 240],
];

function trailingZeros(n) {
  let c = 0;
  while (n > 0 && n % 10 === 0) { c++; n /= 10; }
  return c;
}

const mulUnit = {
  /** 乘積末尾有幾個 0（選擇題，專治只數原題末尾 0、漏算 2×5／4×25／8×125 產生的 0） */
  'g4-mul-zeros'(rng) {
    const [a, b] = rng.pick(ZERO_PAIRS);
    const swap = rng.chance(0.5);
    const x = swap ? b : a, y = swap ? a : b;
    const prod = x * y;
    const z = trailingZeros(prod);
    const naive = trailingZeros(x) + trailingZeros(y);
    const right = z + ' 個';
    const candidates = [naive, z - 1, z + 1, z - 2, z + 2].filter((k) => k >= 1 && k !== z);
    const wrongs = [...new Set(candidates)].map((k) => k + ' 個');
    return pick(
      '算式「' + x + ' × ' + y + '」算出答案後，積的末尾一共有幾個 0？',
      choice(rng, right, wrongs),
      '不能只數題目原本的 ' + naive + ' 個 0！前面數字相乘還會產生新的 0：' + x + ' × ' + y + ' ＝ ' + prod + '，從右邊數過來一共有 ' + z + ' 個 0。'
    );
  },

  /** 乘法分配律拆數判斷（選擇題，考拆前數、拆後數、湊整減 1） */
  'g4-mul-dist'(rng) {
    const a = rng.int(2, 8) * 10 + rng.int(2, 8); // 例如 62
    const b10 = rng.int(3, 8);                    // 例如 4 (代表 49 或 48)
    const b = b10 * 10 + 9;                       // 例如 49（方便出 50 - 1）
    const aTen = Math.floor(a / 10) * 10, aOne = a % 10;
    const bTen = Math.floor(b / 10) * 10, bOne = b % 10;
    const bNext = b + 1;
    const item = rng.pick([['手工月餅', '盒', '塊'], ['鳳梨酥', '盒', '個'], ['色紙', '包', '張'], ['鉛筆', '打', '枝']]);
    const rights = [
      '先算 ' + a + ' × ' + bTen + '，再加上 ' + a + ' × ' + bOne,
      '先算 ' + aTen + ' × ' + b + '，再加上 ' + aOne + ' × ' + b,
      '先算 ' + a + ' × ' + bNext + '，再減去 ' + a + ' × 1',
    ];
    const wrongs = [
      '先算 ' + a + ' × ' + b10 + '，再加上 ' + a + ' × ' + bOne,       // 漏把十位變 40
      '先算 ' + aTen + ' × ' + bTen + '，再加上 ' + aOne + ' × ' + bOne, // 漏交叉項
      '先算 ' + a + ' × ' + bNext + '，再加上 ' + a + ' × 1',           // 減寫成加
    ];
    const askWrong = rng.chance(0.45);
    const head = '商店訂購 ' + b + ' ' + item[1] + item[0] + '，每' + item[1] + '有 ' + a + ' ' + item[2] + '，共有多少' + item[2] + '？';
    if (askWrong) {
      const w = rng.pick(wrongs);
      return pick(
        head + '下面哪一個算法是「錯的」？',
        choice(rng, w, rights),
        '算 ' + a + ' × ' + b + ' 可以把 ' + b + ' 拆成 ' + bTen + ' ＋ ' + bOne + ' 或 ' + bNext + ' － 1，也可以把 ' + a + ' 拆成 ' + aTen + ' ＋ ' + aOne + '。錯誤選項「' + w + '」拆錯了，算出來不等於 ' + (a * b) + '。'
      );
    }
    const r = rng.pick(rights);
    return pick(
      head + '下面哪一個算法是「對的」？',
      choice(rng, r, wrongs),
      a + ' × ' + b + ' ＝ ' + (a * b) + '。正確選項「' + r + '」剛好把其中一個數拆開分別相乘再合併；注意十位數字 ' + b10 + ' 代表 ' + bTen + '，不能只乘 ' + b10 + '。'
    );
  },

  /** 整十整百乘法與優惠方案比划算（專治 350 × 600 進位錯拼成 183000） */
  'g4-mul-plan'(rng) {
    const qty = rng.pick([400, 500, 600, 700, 800]);
    const unitPrice = rng.pick([300, 400, 500, 600]);
    const offEach = rng.pick([30, 40, 50, 60]);
    const newPrice = unitPrice - offEach; // 例如 350（十位與百位乘單數會進位）
    const orig = qty * unitPrice;
    const plan1 = qty * newPrice;
    const offTotal = rng.pick([10000, 20000, 30000]);
    const plan2 = orig - offTotal;
    if (plan1 === plan2 || plan1 <= 0 || plan2 <= 0) retry();
    const cheap = Math.min(plan1, plan2);
    const better = plan1 < plan2 ? '方案一' : '方案二';
    const item = rng.pick(['環保餐具組', '保溫杯組', '彩色筆組', '禮盒']);
    return fill(
      '老闆進貨 ' + qty + ' 組' + item + '，每組原價 ' + unitPrice + ' 元。方案一：每組折 ' + offEach + ' 元；方案二：總價直接折 ' + wanText(offTotal) + '元。選擇比較划算的方案，要付多少元？',
      [String(cheap)],
      '元',
      '方案一：每組 ' + unitPrice + ' － ' + offEach + ' ＝ ' + newPrice + ' 元，' + newPrice + ' × ' + qty + ' ＝ ' + plan1 + ' 元（算 ' + (newPrice / 10) + ' × ' + (qty / 100) + ' 要記得進位，再補 3 個 0）。方案二：原價 ' + unitPrice + ' × ' + qty + ' ＝ ' + orig + ' 元，折 ' + offTotal + ' 元後是 ' + plan2 + ' 元。' + better + '較划算，付 ' + cheap + ' 元。'
    );
  },
};

// =====================================================================
// 單元三：角度（直角 90°、平角 180°、周角 360°、時鐘大格）
// =====================================================================
const angleUnit = {
  /** 直角／平角互補互餘與特殊角定義（專治把直角 90° 與平角 180° 搞混） */
  'g4-angle-special'(rng) {
    const v = rng.int(0, 2);
    if (v === 0) {
      // 直角 90° 互餘（對應期中五：65° 再加幾度是直角？妹妹誤用 180-65=115）
      const a = rng.int(15, 75);
      const ans = 90 - a;
      return fill(
        '一個 ' + a + ' 度的角，再加幾度合起來就會是一個「直角」？',
        [String(ans)],
        '度',
        '直角是 90 度（不是平角 180 度！）。90 － ' + a + ' ＝ ' + ans + ' 度。驗算：' + a + ' ＋ ' + ans + ' ＝ 90 度。'
      );
    }
    if (v === 1) {
      // 平角 180° 互補（對應期中三-1：兩角合起來是平角 180°）
      const a = rng.int(25, 155);
      if (a === 90) retry();
      const ans = 180 - a;
      return fill(
        '∠1 和 ∠2 合起來剛好是一個「平角」，已知 ∠1 是 ' + a + ' 度，∠2 是幾度？',
        [String(ans)],
        '度',
        '平角是 180 度（一條直線），所以 ∠2 ＝ 180 － ' + a + ' ＝ ' + ans + ' 度。驗算：' + a + ' ＋ ' + ans + ' ＝ 180 度。'
      );
    }
    // 鐘面指針旋轉角度與角名稱（對應期中三-2）
    const cases = [
      { grids: 3, deg: 90, name: '直角', desc: '從 12 順時針轉到 3（走了 3 大格）' },
      { grids: 6, deg: 180, name: '平角', desc: '從 12 順時針轉到 6（走了 6 大格）' },
      { grids: 12, deg: 360, name: '周角', desc: '從 3 順時針轉一圈回到 3（走了 12 大格）' },
      { grids: 3, deg: 90, name: '直角', desc: '從 3 順時針轉到 6（走了 3 大格）' },
      { grids: 6, deg: 180, name: '平角', desc: '從 3 順時針轉到 9（走了 6 大格）' },
    ];
    const c = rng.pick(cases);
    return pick(
      '鐘面上的指針每走 1 大格是 30 度。指針' + c.desc + '，共旋轉了 ' + c.deg + ' 度，形成的角屬於什麼角？',
      choice(rng, c.name, ['平角', '直角', '周角', '鈍角', '銳角'].filter((x) => x !== c.name)), // 特殊角放前面，最容易混的一定在選項裡
      '記住三個特殊角：90 度是「直角」、180 度是「平角」、轉一整圈 360 度是「周角」。這題轉了 30 × ' + c.grids + ' ＝ ' + c.deg + ' 度，是' + c.name + '。'
    );
  },
};

// =====================================================================
// 單元四：公里與公尺（複名數退位加減、單位換算與相距問題）
// =====================================================================
const kmUnit = {
  /** 公里與公尺複名數退位減法＆面對面出發相距問題（專治 5 公里 20 公尺誤當 5200 公尺） */
  'g4-km-calc'(rng) {
    const v = rng.int(0, 1);
    if (v === 0) {
      // 例如：5 公里 20 公尺 － 70 公尺 ＝ 幾公尺？（對應期中二-7）
      const km = rng.int(2, 9);
      const m = rng.int(1, 9) * 10; // 10～90 公尺（百位是 0，最容易寫成 5200！）
      const subM = m + rng.int(2, 9) * 10; // 一定需要退位
      const totalM = km * 1000 + m;
      const ans = totalM - subM;
      return fill(
        km + ' 公里 ' + m + ' 公尺 － ' + subM + ' 公尺 ＝ 多少公尺？',
        [String(ans)],
        '公尺',
        '1 公里 ＝ 1000 公尺，所以 ' + km + ' 公里 ' + m + ' 公尺 ＝ ' + totalM + ' 公尺（注意百位是 0，不是 ' + (km * 1000 + m * 10) + ' 公尺！）。再相減：' + totalM + ' － ' + subM + ' ＝ ' + ans + ' 公尺。'
      );
    }
    // 面對面出發相距幾公尺（對應期中七-1）
    const totalKm = rng.int(5, 10);
    const aKm = rng.int(1, Math.floor(totalKm / 2));
    const aM = rng.int(1, 8) * 100;
    const bKm = rng.int(1, totalKm - aKm - 1);
    const bM = rng.int(1, 8) * 100;
    const aTotal = aKm * 1000 + aM;
    const bTotal = bKm * 1000 + bM;
    const sum = aTotal + bTotal;
    if (sum >= totalKm * 1000) retry();
    const gap = totalKm * 1000 - sum;
    return fill(
      '健行路線全長 ' + totalKm + ' 公里，兩人分別從甲、乙兩站同時面對面出發。甲走了 ' + aKm + ' 公里 ' + aM + ' 公尺，乙走了 ' + bTotal + ' 公尺，現在兩人之間相距幾公尺？',
      [String(gap)],
      '公尺',
      '先全部換成公尺：全長 ' + (totalKm * 1000) + ' 公尺，甲走了 ' + aTotal + ' 公尺，乙走了 ' + bTotal + ' 公尺。兩人共走了 ' + aTotal + ' ＋ ' + bTotal + ' ＝ ' + sum + ' 公尺，還相距 ' + (totalKm * 1000) + ' － ' + sum + ' ＝ ' + gap + ' 公尺。'
    );
  },
};

// =====================================================================
// 單元五：分數（真分數、假分數、帶分數互換與數線）
// =====================================================================
const fracG4Unit = {
  /** 假分數與帶分數互換比大小（對應期中二-4：48/8 ○ 5又7/8） */
  'g4-frac-compare'(rng) {
    const d = rng.pick([4, 5, 6, 7, 8, 9, 10]);
    const whole = rng.int(2, 6);
    const rem = rng.int(1, d - 1);
    const mixedNum = whole * d + rem;
    const delta = rng.pick([-2, -1, 0, 1, 2]);
    const impNum = mixedNum + delta;
    if (impNum <= d) retry();
    const leftImp = rng.chance(0.5);
    const impStr = impNum + '/' + d;
    const mixStr = whole + '又' + rem + '/' + d;
    const diff = leftImp ? impNum - mixedNum : mixedNum - impNum;
    const right = signText(diff);
    return pick(
      '比大小：' + (leftImp ? impStr + ' ○ ' + mixStr : mixStr + ' ○ ' + impStr) + '，○ 裡要填什麼？',
      choice(rng, right, SIGN_OPTS.filter((s) => s !== right), { keepOrder: true }),
      '把帶分數 ' + mixStr + ' 換成假分數：(' + whole + ' × ' + d + ' ＋ ' + rem + ')/' + d + ' ＝ ' + mixedNum + '/' + d + '。分母都是 ' + d + '，直接比分子 ' + (leftImp ? impNum + ' 和 ' + mixedNum : mixedNum + ' 和 ' + impNum) + '，所以填' + right + '。'
    );
  },

  /** 分數數線判讀帶分數（對應期中三-3：專治把 1又3/5 看成 2又3/5） */
  'g4-frac-line'(rng) {
    const d = rng.pick([3, 4, 5, 6, 8, 10]);
    const whole = rng.int(1, 3);
    const rem = rng.int(1, d - 1);
    const f = F(whole * d + rem, d);
    const ansMixed = whole + '又' + rem + '/' + d;
    const ansImp = (whole * d + rem) + '/' + d;
    const answers = [...new Set([ansMixed, ansImp, ...acceptAll(f)])];
    return fill(
      '數線上每個相鄰整數之間都平分成 ' + d + ' 小格。如果從 ' + whole + ' 再往右數 ' + rem + ' 小格（還沒到 ' + (whole + 1) + '），這個位置代表的帶分數是多少？',
      answers,
      '',
      '每 1 小格是 1/' + d + '。點在 ' + whole + ' 和 ' + (whole + 1) + ' 之間，整數部分是左邊的 ' + whole + '（不是右邊的 ' + (whole + 1) + '！），再多 ' + rem + ' 格，所以是 ' + ansMixed + '（換成假分數是 ' + ansImp + '）。'
    );
  },
};

// =====================================================================
// 單元六：除以三位數與多個 0 的除法（6-3、6-4）
// =====================================================================
const div3Unit = {
  /** 除以三位數與多個 0 的除法（專治同消 0 後商多補 0、或餘數忘記補回 0） */
  'g4-div3-zeros'(rng) {
    const v = rng.int(0, 2);
    if (v === 0) {
      // 整除且被除數、除數末尾都有多個 0（對應第 14 回 ①-8：9000 ÷ 500 = 18，常多補 0 寫成 180）
      const q = rng.int(6, 28);
      const dBase = rng.pick([2, 3, 4, 5, 6, 8, 12, 15, 18, 25]);
      const zeros = dBase < 10 ? 100 : 10; // 除數是 200~800 或 120~250
      const divisor = dBase * zeros;
      const dividend = divisor * q;
      if (dividend > 9800 || dividend < 1000) retry();
      return fill(
        dividend + ' ÷ ' + divisor + ' ＝ ？',
        [String(q)],
        '',
        '被除數和除數末尾同時消掉一樣多個 0（變成 ' + (dividend / zeros) + ' ÷ ' + dBase + '），商不變，直接等於 ' + q + '（算完商不用再補 0！）。驗算：' + divisor + ' × ' + q + ' ＝ ' + dividend + '。'
      );
    }
    if (v === 1) {
      // 應用題：有餘數且末尾有 0，問「剩下幾…」專治餘數忘記補回 0（對應第 14 回 ③-4：7080 ÷ 250 = 28 ... 80）
      const divisor = rng.pick([120, 150, 180, 200, 240, 250, 300, 400]);
      const q = rng.int(5, 29);
      const rBase = rng.int(1, Math.floor(divisor / 10) - 1);
      const rem = rBase * 10;
      const dividend = divisor * q + rem;
      if (dividend > 9800 || dividend < 1000) retry();
      const askRem = rng.chance(0.55);
      const ctx = rng.pick([
        { item: '麻繩', totalU: '公分', pack: '每 ' + divisor + ' 公分剪成一段', qAsk: '最多可以剪成幾段', rAsk: '剪完後剩下幾公分', qU: '段', rU: '公分' },
        { item: '麵粉', totalU: '公克', pack: '每 ' + divisor + ' 公克裝成一袋', qAsk: '最多可以裝滿幾袋', rAsk: '裝完後剩下幾公克', qU: '袋', rU: '公克' },
        { item: '果汁', totalU: '毫升', pack: '每 ' + divisor + ' 毫升裝成一瓶', qAsk: '最多可以裝滿幾瓶', rAsk: '裝完後剩下幾毫升', qU: '瓶', rU: '毫升' },
      ]);
      return fill(
        '有一批 ' + dividend + ' ' + ctx.totalU + '的' + ctx.item + '，' + ctx.pack + '，' + (askRem ? ctx.rAsk : ctx.qAsk) + '？',
        [String(askRem ? rem : q)],
        askRem ? ctx.rU : ctx.qU,
        '列式：' + dividend + ' ÷ ' + divisor + ' ＝ ' + q + ' ⋯ ' + rem + '。如果同時消掉 1 個 0 算 ' + (dividend / 10) + ' ÷ ' + (divisor / 10) + ' ＝ ' + q + ' ⋯ ' + rBase + '，商是 ' + q + ' 不變，但「餘數要補回 1 個 0」變成 ' + rem + ' ' + ctx.rU + '！驗算：' + divisor + ' × ' + q + ' ＋ ' + rem + ' ＝ ' + dividend + '。'
      );
    }
    // 選擇題：哪一個算式的商和 X ÷ Y 一樣？（對應第 14 回 ②-1、②-2）
    const dBase = rng.pick([3, 4, 5, 6, 7, 8, 9]);
    const q = rng.int(7, 25);
    const dividend = dBase * q * 100;
    const divisor = dBase * 100;
    if (dividend > 9900) retry();
    const right = (dividend / 100) + ' ÷ ' + dBase;
    const wrongs = [
      (dividend / 10) + ' ÷ ' + dBase,        // 被除數消 1 個 0、除數消 2 個 0
      dividend + ' ÷ ' + (divisor / 10),      // 只消除數的 0
      (dividend / 100) + ' ÷ ' + (divisor / 10), // 消的 0 個數不同
    ];
    return pick(
      '下面哪一個算式的商和「' + dividend + ' ÷ ' + divisor + '」一樣？',
      choice(rng, right, wrongs),
      '被除數和除數要同時消掉「一樣多個 0」，商才會不變。同時消掉 2 個 0 得到 ' + right + '（商都是 ' + q + '）。'
    );
  },
};

/** 全部四年級上學期題型：代號 → 產生器 */
export const MATH_G4_TYPES = { ...bignumUnit, ...mulUnit, ...angleUnit, ...kmUnit, ...fracG4Unit, ...div3Unit };
