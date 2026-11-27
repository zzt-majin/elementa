# tools/compose_music.py
# 群島背景音樂的作曲程式：每一首都是本專案自己寫的旋律，沒有版權問題。
# 每首歌寫下「調、速度、拍子、樂器、和弦進行、兩個動機（節奏＋音的走向）」，
# 這個程式照固定的曲式（A 段 8 小節、B 段 4 小節、A 段回來 4 小節、最後停在主音）展開成音符，
# 寫進 config/music.json。網站只讀 music.json，不用這個程式。
# 要加歌：在 SONGS 加一筆，執行  python3 tools/compose_music.py
import json, os

NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
MODES = {
    'major': [0, 2, 4, 5, 7, 9, 11],
    'minor': [0, 2, 3, 5, 7, 8, 10],
    'dorian': [0, 2, 3, 5, 7, 9, 10],
    'penta': [0, 2, 4, 5, 7, 9, 11],  # 七個音當骨架，弱拍避開第 4、7 音
    'lydian': [0, 2, 4, 6, 7, 9, 11],
}

# 動機：rhythm 是每個音占幾個八分音符（加起來 = 一小節），shape 是離和弦根音幾個音階（0 根音、2 三音、4 五音）
SONGS = [
    dict(name='島上的早晨', key='C', mode='major', bpm=96, meter=4, inst='musicbox',
         prog='I V vi IV I V I I  IV V iii vi  I IV V I',
         a=([1, 1, 1, 1, 1, 1, 2], [0, 2, 4, 2, 3, 2, 0]), b=([2, 1, 1, 2, 2], [4, 3, 2, 1, 2]), seq=1),
    dict(name='花園散步', key='F', mode='major', bpm=92, meter=4, inst='musicbox',
         prog='I IV I V I IV V I  vi IV ii V  I IV V I',
         a=([2, 1, 1, 2, 2], [0, 1, 2, 4, 2]), b=([1, 1, 2, 1, 1, 2], [4, 5, 4, 2, 1, 0]), seq=0),
    dict(name='小海浪', key='D', mode='major', bpm=72, meter=3, inst='harp',
         prog='I I IV IV V V I I  vi vi IV V  I IV V I',
         a=([2, 1, 1, 2], [0, 2, 4, 2]), b=([3, 1, 2], [4, 2, 1]), seq=0),
    dict(name='星星眨眼', key='G', mode='penta', bpm=84, meter=4, inst='celesta',
         prog='I IV I V vi IV V I  IV I ii V  I IV V I',
         a=([1, 1, 2, 1, 1, 2], [4, 4, 7, 4, 2, 0]), b=([2, 2, 1, 1, 2], [2, 4, 5, 4, 2]), seq=0),
    dict(name='雲朵棉花糖', key='A#', mode='major', bpm=80, meter=4, inst='flute',
         prog='I vi IV V I vi ii V  IV V iii vi  ii V I I',
         a=([3, 1, 2, 2], [0, 2, 4, 2]), b=([2, 2, 3, 1], [5, 4, 2, 1]), seq=1),
    dict(name='下雨的窗', key='A', mode='minor', bpm=76, meter=4, inst='kalimba',
         prog='i iv VII III VI iv V i  VI VII i i  iv V i i',
         a=([1, 1, 1, 1, 2, 2], [4, 2, 0, 2, 4, 2]), b=([2, 1, 1, 4], [0, 2, 4, 2]), seq=0),
    dict(name='彩虹滑梯', key='E', mode='major', bpm=116, meter=4, inst='marimba',
         prog='I IV V I vi ii V I  IV V iii vi  IV V I I',
         a=([1, 1, 1, 1, 1, 1, 1, 1], [5, 4, 3, 2, 4, 2, 1, 0]), b=([1, 1, 2, 1, 1, 2], [0, 2, 4, 4, 5, 4]), seq=0),
    dict(name='午後茶會', key='G', mode='major', bpm=88, meter=3, inst='musicbox',
         prog='I V I IV I V V I  IV I ii V  I IV V I',
         a=([2, 2, 2], [0, 2, 4]), b=([1, 1, 2, 2], [4, 5, 4, 2]), seq=1),
    dict(name='螢火蟲', key='E', mode='dorian', bpm=70, meter=4, inst='bell',
         prog='i IV i IV i VII IV i  III VII IV IV  i IV VII i',
         a=([2, 2, 2, 2], [0, 4, 2, 4]), b=([3, 1, 4], [7, 4, 2]), seq=0),
    dict(name='小火車', key='C', mode='major', bpm=126, meter=4, inst='marimba',
         prog='I I V V I I V I  IV IV I I  V V V I',
         a=([1, 1, 1, 1, 2, 2], [0, 0, 2, 2, 4, 4]), b=([1, 1, 1, 1, 4], [4, 3, 2, 1, 0]), seq=0),
    dict(name='雪花舞', key='D', mode='minor', bpm=84, meter=3, inst='celesta',
         prog='i iv i V VI iv V i  III VII i V  i iv V i',
         a=([1, 1, 1, 1, 2], [4, 5, 4, 2, 0]), b=([2, 2, 2], [2, 4, 5]), seq=0),
    dict(name='蒲公英', key='F', mode='penta', bpm=100, meter=4, inst='kalimba',
         prog='I IV I V I IV V I  vi V IV V  I IV V I',
         a=([1, 1, 2, 2, 2], [0, 2, 4, 5, 4]), b=([2, 1, 1, 2, 2], [7, 5, 4, 2, 1]), seq=1),
    dict(name='月亮船', key='C', mode='major', bpm=66, meter=3, inst='harp',
         prog='I vi IV V I vi ii V  IV I IV V  I IV V I',
         a=([3, 1, 2], [4, 2, 0]), b=([2, 2, 2], [5, 4, 2]), seq=0),
    dict(name='糖果屋', key='A', mode='major', bpm=112, meter=4, inst='musicbox',
         prog='I IV I V I IV V I  ii V I vi  IV V I I',
         a=([1, 1, 1, 1, 1, 1, 2], [0, 4, 2, 4, 5, 4, 2]), b=([2, 1, 1, 2, 2], [4, 2, 0, 1, 2]), seq=0),
    dict(name='晨光鳥語', key='G', mode='lydian', bpm=104, meter=4, inst='flute',
         prog='I II I II I II V I  IV V I I  II V I I',
         a=([1, 1, 1, 1, 4], [4, 5, 4, 2, 0]), b=([2, 2, 2, 2], [2, 3, 4, 7]), seq=0),
    dict(name='泡泡浴', key='D', mode='major', bpm=108, meter=4, inst='kalimba',
         prog='I V vi iii IV I IV V  I V vi IV  ii V I I',
         a=([1, 1, 2, 1, 1, 2], [0, 4, 2, 0, 2, 4]), b=([1, 1, 1, 1, 2, 2], [4, 5, 4, 3, 2, 0]), seq=0),
    dict(name='風車村', key='F', mode='major', bpm=92, meter=3, inst='marimba',
         prog='I I V V V V I I  IV IV I V  I IV V I',
         a=([1, 1, 1, 1, 1, 1], [0, 2, 4, 2, 4, 5]), b=([2, 1, 1, 2], [4, 3, 2, 1]), seq=0),
    dict(name='秋千', key='B', mode='minor', bpm=78, meter=3, inst='musicbox',
         prog='i iv V i VI III iv V  i iv VII III  iv V i i',
         a=([2, 1, 3], [0, 2, 4]), b=([1, 1, 1, 1, 2], [7, 6, 4, 2, 4]), seq=1),
    dict(name='貝殼歌', key='E', mode='penta', bpm=86, meter=4, inst='harp',
         prog='I vi IV V I vi IV I  IV V vi vi  IV V I I',
         a=([2, 1, 1, 1, 1, 2], [0, 2, 4, 5, 4, 2]), b=([3, 1, 2, 2], [4, 2, 1, 0]), seq=0),
    dict(name='熊熊午睡', key='C', mode='major', bpm=60, meter=4, inst='flute',
         prog='I IV I V I IV V I  IV I IV V  I IV V I',
         a=([4, 2, 2], [0, 2, 4]), b=([2, 2, 4], [5, 4, 2]), seq=0),
    dict(name='森林小路', key='A', mode='dorian', bpm=96, meter=4, inst='marimba',
         prog='i IV i VII i IV VII i  III IV i i  IV VII i i',
         a=([1, 1, 1, 1, 1, 1, 2], [0, 2, 4, 5, 4, 2, 0]), b=([2, 2, 1, 1, 2], [4, 2, 3, 2, 0]), seq=0),
    dict(name='燈塔晚安', key='F', mode='major', bpm=64, meter=4, inst='bell',
         prog='I iii IV V I vi ii V  IV I ii V  IV V I I',
         a=([2, 2, 4], [4, 2, 0]), b=([2, 2, 2, 2], [2, 4, 5, 4]), seq=0),
    dict(name='草莓園', key='D', mode='major', bpm=120, meter=4, inst='celesta',
         prog='I IV V I I IV V I  vi IV V I  IV V I I',
         a=([1, 1, 1, 1, 2, 2], [2, 4, 2, 0, 4, 2]), b=([1, 1, 2, 1, 1, 2], [4, 4, 5, 2, 2, 4]), seq=1),
]

ROMAN = {'i': 0, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6}


def chord_root(sym):
    return ROMAN[sym.lower()]


def name_of(midi):
    return NOTES[midi % 12] + str(midi // 12 - 1)


def compose(s):
    tonic = NOTES.index(s['key'])
    scale = MODES[s['mode']]
    bar = 8 if s['meter'] == 4 else 6
    prog = s['prog'].split()
    assert len(prog) == 16, s['name']
    for r, _ in (s['a'], s['b']):
        assert sum(r) == bar, (s['name'], r)

    def midi_of(deg, chord_sym=None):
        o, d = divmod(deg, 7)
        semi = scale[d]
        # 小調的屬和弦（V）用升高的導音，聽起來比較有「回家」的感覺
        if s['mode'] == 'minor' and chord_sym == 'V' and d == 6:
            semi += 1
        # 主音放在 C4～B4，旋律大多落在 A4～D6
        return 60 + tonic + semi + 12 * o

    melody = []
    prev = 0  # 上一個音（音階度數），讓每小節開頭接得順
    for i, sym in enumerate(prog):
        root = chord_root(sym)
        in_a = i < 8 or i >= 12
        rhythm, shape = s['a'] if in_a else s['b']
        shift = s['seq'] if (i % 2 == 1 and i not in (7, 15)) else 0
        last_bar = i == 15
        cadence = i in (3, 7, 11, 15)
        if cadence:
            # 段落結尾：前半照動機，最後拉長一個音（第 8、16 小節停在主音）
            half = bar // 2
            rhythm = [1] * half + [half]
            take = [shape[k % len(shape)] for k in range(half)] + [0]
            shape = take
        degs = [root + v + shift for v in shape]
        # 換八度：開頭離上一個音越近越好，也盡量留在音域內（主音往下 1 度到往上 10 度）
        def out_of_range(ds):
            return max(0, -1 - min(ds)) + max(0, max(ds) - 10)
        cands = [[d + 7 * k for d in degs] for k in (-2, -1, 0, 1, 2)]
        degs = min(cands, key=lambda ds: out_of_range(ds) * 2 + abs(ds[0] - prev))
        if cadence and i in (7, 15):
            # 停在主音：找離前一個音最近的主音
            degs[-1] = min((7 * k for k in (-1, 0, 1)), key=lambda d: abs(d - degs[-2]))
        if s['mode'] == 'penta':
            # 五聲：弱拍避開第 4、7 音，往下一格
            degs = [d if (k == 0 or d % 7 not in (3, 6)) else d - 1 for k, d in enumerate(degs)]
        for r, d in zip(rhythm, degs):
            melody.append(name_of(midi_of(d, sym)))
            melody.extend(['-'] * (r - 1))
        prev = degs[-1]
    # 整首太低（最高音不到 E5）就整首升八度，八音盒和小鐘在高音才好聽
    tops = [n for n in melody if n != '-']
    def midi(n):
        return (int(n[-1]) + 1) * 12 + NOTES.index(n[:-1])
    if max(midi(n) for n in tops) < 76:
        melody = [n if n == '-' else name_of(midi(n) + 12) for n in melody]
    # 低音：4 拍子每半小節一個（根音、五音），3 拍子每小節一個
    bass = []
    for sym in prog:
        root = chord_root(sym)
        base = 48 + tonic + scale[root] if tonic + scale[root] < 8 else 36 + tonic + scale[root]  # 低音在 G#2～G3
        if s['meter'] == 4:
            fifth = base + (scale[(root + 4) % 7] - scale[root]) % 12
            bass += [name_of(base), name_of(fifth)]
        else:
            bass.append(name_of(base))
    return {
        'name': s['name'],
        'instrument': s['inst'],
        'beatsPerMinute': s['bpm'],
        'stepsPerBar': bar,
        'bassEvery': 4 if s['meter'] == 4 else 6,
        'notes': melody,
        'bass': bass,
    }


def main():
    songs = [compose(s) for s in SONGS]
    out = {
        '_說明': '群島背景音樂（本專案自己寫的旋律，用 tools/compose_music.py 產生，可以直接改這個檔）。notes 是旋律，一格是八分音符，「-」表示延長上一個音；bass 是低音，每 bassEvery 格一個；instrument 是音色：musicbox 八音盒、marimba 木琴、celesta 鋼片琴、kalimba 拇指琴、harp 豎琴、flute 笛子、bell 小鐘。',
        'volume': 0.18,
        'timeZone': 'Asia/Taipei',
        'songs': songs,
    }
    path = os.path.join(os.path.dirname(__file__), '..', 'config', 'music.json')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{\n')
        f.write('  "_說明": ' + json.dumps(out['_說明'], ensure_ascii=False) + ',\n')
        f.write('  "volume": 0.18,\n  "timeZone": "Asia/Taipei",\n  "songs": [\n')
        for k, s in enumerate(songs):
            f.write('    ' + json.dumps(s, ensure_ascii=False) + (',' if k < len(songs) - 1 else '') + '\n')
        f.write('  ]\n}\n')
    print(len(songs), '首')


if __name__ == '__main__':
    main()
