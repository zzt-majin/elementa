---
id: jie-6a-en-u1
title: Unit 1 Where Did You Go Last Weekend?
kid: 姐姐
grade: 六上
subject: 英語
---
英語教材檔（格式見 docs/英語島.md）。英語產生器（engine/generators/english.js）只讀這個檔，
程式裡不寫英文題目；要換課就另外寫一份，關卡檔的 bank 欄位寫這個檔的 id。

每一行：`- 欄位 | 欄位 | 名稱=值 | 名稱=值`。前面沒有「=」的是固定欄位（各段的說明寫在段名後面），後面是附加資料。
句型裡的 {…} 會換成字：{place} 地方、{place2} 另一個地方、{act} 做的事（過去式）、{actBase} 做的事（原形）、
{actS} 做的事（現在式 he/she）、{act2} 另一件事、{time} 時間詞、{who} 別人、{pron} he/she、{Pron} He/She、
{Who} 開頭大寫的人；後面加 Zh 是中文（{placeZh}、{timeZh}、{whoZh}、{actZh}、{act2Zh}、{place2Zh}）。

## places 地方（英文 | 中文 | pic=圖檔名）
- department store | 百貨公司 | pic=department-store
- night market | 夜市 | pic=night-market
- amusement park | 遊樂園 | pic=amusement-park
- riverside park | 河濱公園 | pic=riverside-park

## activities 做了什麼事（過去式 | 中文 | base=原形 | s=現在式 he/she | pic=圖檔名）
- ate snacks | 吃點心 | base=eat snacks | s=eats snacks | pic=ate-snacks
- drank juice | 喝果汁 | base=drink juice | s=drinks juice | pic=drank-juice
- flew a kite | 放風箏 | base=fly a kite | s=flies a kite | pic=flew-a-kite
- rode a bike | 騎腳踏車 | base=ride a bike | s=rides a bike | pic=rode-a-bike
- saw a movie | 看電影 | base=see a movie | s=sees a movie | pic=saw-a-movie
- went shopping | 去購物 | base=go shopping | s=goes shopping | pic=went-shopping

## verbs 動詞變化（原形 | 過去式 | 中文 | s=現在式 he/she | obj=後面接的字 | kind=怎麼變）
- eat | ate | 吃 | s=eats | obj=snacks | kind=不規則變化
- drink | drank | 喝 | s=drinks | obj=juice | kind=不規則變化
- fly | flew | 放（風箏）、飛 | s=flies | obj=a kite | kind=不規則變化
- ride | rode | 騎 | s=rides | obj=a bike | kind=不規則變化
- see | saw | 看見 | s=sees | obj=a movie | kind=不規則變化
- go | went | 去 | s=goes | obj=shopping | kind=不規則變化
- play | played | 玩、打（球） | s=plays | obj=basketball | kind=規則變化：加 ed
- watch | watched | 觀看 | s=watches | obj=videos | kind=規則變化：加 ed
- study | studied | 讀書、學習 | s=studies | obj=English | kind=子音＋y：y 改成 i 再加 ed
- visit | visited | 拜訪 | s=visits | obj=a friend | kind=規則變化：加 ed
- walk | walked | 散步、遛（狗） | s=walks | obj=the dog | kind=規則變化：加 ed

## times 時間詞（英文 | 中文 | now=1 表示現在式）
- yesterday | 昨天
- last night | 昨天晚上
- last weekend | 上個週末
- last Sunday | 上個星期天
- yesterday afternoon | 昨天下午
- yesterday morning | 昨天早上
- yesterday evening | 昨天傍晚
- every day | 每天 | now=1

## people 人（英文 | 中文 | pron=I／we／he／she | name=1 表示人名，句中也大寫）
- I | 我 | pron=I
- we | 我們 | pron=we
- Tina | Tina | pron=she | name=1
- Ben | Ben | pron=he | name=1
- my sister | 我姐姐 | pron=she
- my brother | 我哥哥 | pron=he

## patterns 問答句型（問句 | 正確回答 | ctx=題目前面的情境 | wrong=錯的選項，用 ;; 隔開）
- Where did you go {time}? | I went to the {place} {time}. | wrong=I go to the {place} {time}. ;; I {act} {time}. ;; Yes, I did.
- What did you do {time}? | I {act} {time}. | wrong=I {actBase} {time}. ;; Yes, I did. ;; I went {act} {time}.
- What did {who} do {time}? | {Pron} {act} {time}. | wrong={Pron} {actS} {time}. ;; Yes, {pron} did. ;; {Pron} {actBase} {time}.
- Did you go to the {place} {time}? | Yes, we did. | ctx=（你們{timeZh}去了{placeZh}。） | wrong=Yes, we do. ;; No, we didn't. ;; Yes, we are.
- Did you go to the {place} {time}? | No, we didn't. | ctx=（你們{timeZh}去了{place2Zh}，沒有去{placeZh}。） | wrong=No, we don't. ;; Yes, we did. ;; No, we aren't.
- Did {who} {actBase} {time}? | Yes, {pron} did. | ctx=（{whoZh}{timeZh}{actZh}。） | wrong=Yes, {pron} does. ;; No, {pron} didn't. ;; Yes, {pron} is.
- Did {who} {actBase} {time}? | No, {pron} didn't. | ctx=（{whoZh}{timeZh}{act2Zh}，沒有{actZh}。） | wrong=No, {pron} doesn't. ;; Yes, {pron} did. ;; No, {pron} isn't.

## make 造句（英文句子 | 中文）：聽寫和中翻英的整句題用
- {Who} went to the {place} {time}. | {whoZh}{timeZh}去了{placeZh}。
- {Who} {act} {time}. | {whoZh}{timeZh}{actZh}。

## sentences 句型例句（英文 | 中文 | 回答或說明）：只放學習卡
- Where did you go last weekend? | 你上個週末去了哪裡？ | I went to the night market last weekend.（我上個週末去了夜市。）
- What did you do? | 你做了什麼？ | I ate snacks.（我吃了點心。）
- What did Tina do yesterday? | Tina 昨天做了什麼？ | She flew a kite.（她放了風箏。）
- Did you go to the amusement park yesterday? | 你們昨天去了遊樂園嗎？ | Yes, we did.／No, we didn't.（didn't ＝ did not）
- He plays baseball every day. | 他每天打棒球。 | every day 是現在式：he、she 後面的動詞要加 s。
- He played baseball yesterday. | 他昨天打了棒球。 | yesterday 是過去：用過去式，不管是誰都一樣，不用加 s。

## soft-c 軟 c：唸 /s/（英文 | 中文 | hard=1 表示這個字裡也有硬 c）
- ice | 冰
- city | 城市
- spicy | 辣的
- cell | 細胞
- pencil | 鉛筆
- center | 中心
- cycle | 循環 | hard=1

## hard-c 硬 c：唸 /k/（英文 | 中文）
- candy | 糖果
- doctor | 醫生
- music | 音樂
- cat | 貓
- coat | 外套

## extras 補充字（英文 | 中文）：只放學習卡，不考拼字
- beef noodles | 牛肉麵
- Taiwanese snacks | 臺灣小吃
- artwork | 藝術作品
- landmark | 地標
- firework | 煙火
- floor | 樓層
- The early bird gets the worm. | 早起的鳥兒有蟲吃。
