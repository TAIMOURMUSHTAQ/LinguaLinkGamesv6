"""Regenerate js/kit/wordlist.js from LinguaLink360's articulation word list.

The word list lives in the LinguaLink360 repository (one folder up from lingualink-play):
  database/seeders/PhoneticWordSeeder.php       English: 24 sounds, initial / medial / final words
  database/seeders/UrduPhoneticWordSeeder.php   Urdu: 38 letters, initial / medial / final words
Word Garden uses only these words, in the same order. After changing a seeder, run from lingualink-play:
  python scripts/make-wordlist.py
and commit js/kit/wordlist.js. The emoji pictures (PIC below) are matched by word; a word without one
is shown as animated word art.
"""
import json, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
repo = os.path.normpath(os.path.join(HERE, "..", ".."))
out = os.path.normpath(os.path.join(HERE, "..", "js", "kit", "wordlist.js"))
en = open(os.path.join(repo, 'database', 'seeders', 'PhoneticWordSeeder.php'), encoding='utf-8').read()
ur = open(os.path.join(repo, 'database', 'seeders', 'UrduPhoneticWordSeeder.php'), encoding='utf-8').read()

english = {}
for m in re.finditer(r"\['phonetic_symbol' => '([^']+)', 'position' => '(\w+)', 'words' => \[([^\]]*)\]\]", en):
    sym, pos, words = m.group(1), m.group(2), re.findall(r"'([^']*)'", m.group(3))
    english.setdefault(sym, {})[pos] = words

urdu = {}
# blocks: ['symbol' => '/ا/', 'words' => [ 'initial' => [...], 'medial' => [...], 'final' => [...] ]]
for m in re.finditer(r"\['symbol' => '([^']+)', 'words' => \[(.*?)\]\],", ur, flags=re.S):
    sym, body = m.group(1), m.group(2)
    d = {}
    for p in re.finditer(r"'(initial|medial|final)'\s*=>\s*\[([^\]]*)\]", body):
        d[p.group(1)] = re.findall(r"'([^']*)'", p.group(2))
    urdu[sym] = d


d = {'english': english, 'urdu': urdu}


IDS = {'/p/': 'p', '/b/': 'b', '/t/': 't', '/d/': 'd', '/k/': 'k', '/g/': 'g', '/f/': 'f', '/v/': 'v', '/s/': 's', '/z/': 'z',
       '/ʃ/': 'sh', '/ʒ/': 'zh', '/h/': 'h', '/m/': 'm', '/n/': 'n', '/ŋ/': 'ng', '/l/': 'l', '/r/': 'r', '/w/': 'w', '/j/': 'y',
       '/tʃ/': 'ch', '/dʒ/': 'j', '/θ/': 'th', '/ð/': 'dh'}
# how each sound is usually written (for underlining it in the word), longest first
GRAPHEMES = {'p': ['pp', 'p'], 'b': ['bb', 'b'], 't': ['tt', 't'], 'd': ['dd', 'd'], 'k': ['ck', 'cc', 'ch', 'k', 'c', 'q'],
             'g': ['gg', 'g'], 'f': ['ff', 'ph', 'gh', 'f'], 'v': ['v'], 's': ['ss', 'sc', 's', 'c'], 'z': ['zz', 'z', 's'],
             'sh': ['sh', 'ti', 'ci', 'ss', 'ce', 's'], 'zh': ['si', 'su', 'ge', 'g', 's'], 'h': ['h'], 'm': ['mm', 'm'],
             'n': ['nn', 'n'], 'ng': ['ng', 'n'], 'l': ['ll', 'l'], 'r': ['rr', 'r'], 'w': ['wh', 'w', 'o'], 'y': ['y', 'i'],
             'ch': ['tch', 'ch', 'tu', 't'], 'j': ['dge', 'dg', 'ge', 'j', 'g'], 'th': ['th'], 'dh': ['th']}
EXAMPLE = {}
english = {}
for sym, pos in d['english'].items():
    i = IDS[sym]
    english[i] = {k: pos.get(k, []) for k in ('initial', 'medial', 'final')}
    EXAMPLE[i] = (pos.get('initial') or pos.get('medial') or pos.get('final'))[0]

# a picture where one fits the word clearly (emoji in Unicode 14 or older, so older devices show them)
PIC = {
 'pen': '🖊️', 'pig': '🐷', 'pan': '🍳', 'pot': '🍲', 'pie': '🥧', 'park': '🏞️', 'puppy': '🐶', 'pizza': '🍕', 'paper': '📄',
 'happy': '😀', 'apple': '🍎', 'open': '🔓', 'pepper': '🌶️', 'cupcake': '🧁', 'typing': '⌨️', 'sleepy': '😴',
 'cap': '🧢', 'map': '🗺️', 'cup': '☕', 'lip': '👄', 'tap': '🚰', 'soup': '🥣', 'sleep': '😴',
 'ball': '⚽', 'bed': '🛏️', 'bat': '🦇', 'book': '📖', 'baby': '👶', 'box': '📦', 'bird': '🐦', 'bus': '🚌', 'bag': '👜',
 'rabbit': '🐰', 'zebra': '🦓', 'robot': '🤖', 'ribbon': '🎀', 'mobile': '📱', 'cabin': '🛖',
 'cab': '🚕', 'tub': '🛁', 'web': '🕸️', 'bulb': '💡', 'club': '♣️',
 'tiger': '🐯', 'ten': '🔟', 'toy': '🧸', 'time': '⏰', 'tooth': '🦷',
 'butter': '🧈', 'water': '💧', 'kitten': '🐱', 'potato': '🥔', 'mountain': '⛰️', 'city': '🏙️', 'letter': '✉️',
 'cat': '🐱', 'hat': '🎩', 'boat': '⛵', 'hot': '🔥', 'light': '💡', 'fruit': '🍇', 'coat': '🧥',
 'dog': '🐶', 'door': '🚪', 'duck': '🦆', 'doll': '🪆', 'day': '☀️', 'dad': '👨', 'dish': '🍽️', 'dig': '⛏️', 'dark': '🌑',
 'ladder': '🪜', 'reading': '📚', 'teddy': '🧸', 'spider': '🕷️', 'riding': '🚴', 'lady': '👩',
 'red': '🔴', 'food': '🍔', 'road': '🛣️', 'seed': '🌱', 'bread': '🍞', 'cloud': '☁️', 'hand': '✋',
 'car': '🚗', 'kite': '🪁', 'key': '🔑', 'king': '🤴', 'cow': '🐄', 'cake': '🎂', 'corn': '🌽',
 'rocket': '🚀', 'cookie': '🍪', 'chicken': '🐔', 'lucky': '🍀', 'soccer': '⚽', 'secret': '🤫', 'talking': '🗣️',
 'milk': '🥛', 'clock': '🕰️', 'rock': '🪨', 'snack': '🍿', 'check': '✅', 'peak': '🏔️',
 'goat': '🐐', 'girl': '👧', 'game': '🎮', 'gift': '🎁', 'gold': '🥇', 'garden': '🌷', 'green': '🟢',
 'dragon': '🐉', 'foggy': '🌫️', 'eagle': '🦅', 'hugging': '🤗',
 'leg': '🦵', 'hug': '🤗', 'log': '🪵', 'egg': '🥚', 'flag': '🚩', 'tag': '🏷️',
 'fish': '🐟', 'fork': '🍴', 'four': '4️⃣', 'farm': '🚜', 'fox': '🦊', 'foot': '🦶', 'face': '🙂', 'fall': '🍂',
 'coffee': '☕', 'muffin': '🧁', 'office': '🏢', 'dolphin': '🐬', 'sofa': '🛋️', 'laughing': '😂', 'traffic': '🚦', 'waffle': '🧇',
 'leaf': '🍃', 'roof': '🏠', 'cough': '😷', 'puff': '💨', 'scarf': '🧣',
 'van': '🚐', 'vest': '🦺', 'vase': '🏺', 'vote': '🗳️', 'voice': '🗣️', 'village': '🏘️',
 'seven': '7️⃣', 'river': '🏞️', 'movie': '🎬', 'travel': '✈️', 'heavy': '🏋️',
 'love': '❤️', 'give': '🎁', 'five': '5️⃣', 'wave': '🌊', 'glove': '🧤', 'dove': '🕊️',
 'sun': '☀️', 'sand': '🏖️', 'sock': '🧦', 'seal': '🦭', 'sail': '⛵', 'soap': '🧼',
 'castle': '🏰', 'pencil': '✏️', 'desert': '🏜️', 'biscuit': '🍪', 'kissing': '😘', 'icing': '🧁',
 'house': '🏠', 'dress': '👗', 'grass': '🌱', 'class': '🏫', 'mouse': '🐭', 'glass': '🥛', 'kiss': '💋', 'horse': '🐴',
 'zoo': '🦁', 'zip': '🤐', 'zero': '0️⃣', 'zipper': '🤐', 'zigzag': '⚡',
 'lizard': '🦎', 'puzzle': '🧩', 'music': '🎵', 'dizzy': '😵', 'lazy': '🦥', 'frozen': '🥶', 'noisy': '📢',
 'nose': '👃', 'rose': '🌹', 'prize': '🏆', 'buzz': '🐝', 'quiz': '❓', 'shoes': '👟',
 'ship': '🚢', 'shoe': '👟', 'shark': '🦈', 'shop': '🏪', 'shell': '🐚', 'sheep': '🐑', 'shirt': '👕', 'shower': '🚿', 'shake': '🥤',
 'ocean': '🌊', 'lotion': '🧴', 'fishing': '🎣', 'flashlight': '🔦', 'spaceship': '🛸', 'washing': '🧼',
 'wash': '🧼', 'brush': '🖌️', 'cash': '💵', 'wish': '🌠', 'bush': '🌳', 'flash': '⚡',
 'giraffe': '🦒', 'treasure': '💰', 'vision': '👓',
 'hen': '🐔', 'hill': '⛰️', 'home': '🏠', 'hair': '💇', 'ham': '🍖', 'hide': '🙈',
 'man': '👨', 'moon': '🌙', 'meat': '🥩', 'mom': '👩', 'meal': '🍽️',
 'hammer': '🔨', 'summer': '🏖️', 'lemon': '🍋', 'camel': '🐫', 'family': '👪', 'yummy': '😋', 'camera': '📷', 'farmer': '🧑‍🌾',
 'drum': '🥁', 'dream': '💭', 'poem': '📜',
 'nail': '💅', 'night': '🌙', 'nine': '9️⃣', 'nest': '🪺', 'nut': '🥜', 'note': '🎵',
 'banana': '🍌', 'money': '💰', 'bunny': '🐰', 'funny': '😂', 'planet': '🪐', 'donut': '🍩', 'dinner': '🍽️', 'sunny': '☀️',
 'can': '🥫', 'rain': '🌧️', 'run': '🏃', 'lion': '🦁', 'onion': '🧅',
 'singing': '🎤', 'running': '🏃', 'finger': '☝️', 'hungry': '😋', 'jungle': '🌴', 'angel': '👼',
 'song': '🎵', 'ring': '💍', 'strong': '💪',
 'lamp': '💡', 'lake': '🏞️', 'lock': '🔒', 'look': '👀',
 'balloon': '🎈', 'yellow': '🟡', 'salad': '🥗', 'hello': '👋', 'flower': '🌸', 'melon': '🍈',
 'bell': '🔔', 'mail': '📬', 'pool': '🏊', 'cool': '😎',
 'rope': '🪢', 'carrot': '🥕', 'berry': '🍓', 'story': '📖', 'pirate': '🏴‍☠️', 'orange': '🍊', 'mirror': '🪞', 'arrow': '🏹',
 'star': '⭐', 'bear': '🐻', 'ear': '👂', 'fire': '🔥', 'chair': '🪑', 'deer': '🦌',
 'window': '🪟', 'worm': '🪱', 'wind': '🌬️', 'white': '⚪', 'watch': '⌚', 'cowboy': '🤠', 'sandwich': '🥪', 'power': '⚡', 'highway': '🛣️',
 'saw': '🪚',
 'yes': '✅', 'yawn': '🥱', 'yo-yo': '🪀', 'yam': '🍠', 'piano': '🎹',
 'chip': '🍟', 'cheese': '🧀', 'chain': '⛓️', 'child': '🧒', 'chimp': '🐒', 'teacher': '🧑‍🏫', 'peaches': '🍑', 'kitchen': '🍳', 'statue': '🗽', 'nature': '🌳',
 'beach': '🏖️', 'peach': '🍑', 'lunch': '🍱', 'torch': '🔦',
 'juice': '🧃', 'jet': '✈️', 'jacket': '🧥', 'joke': '😂', 'magic': '🪄', 'pigeon': '🐦', 'hedgehog': '🦔', 'ninja': '🥷',
 'bridge': '🌉', 'page': '📄', 'judge': '🧑‍⚖️', 'badge': '📛',
 'thumb': '👍', 'think': '🤔', 'three': '3️⃣', 'thank': '🙏',
 'birthday': '🎂', 'toothbrush': '🪥', 'athlete': '🏃',
 'bath': '🛁', 'teeth': '🦷', 'mouth': '👄', 'earth': '🌍', 'math': '➕',
 'mother': '👩', 'brother': '👦', 'father': '👨', 'weather': '🌦️', 'feather': '🪶',
}
all_words = {w for p in english.values() for ws in p.values() for w in ws}
missing = sorted(k for k in PIC if k not in all_words)
assert not missing, missing

URDU_ORDER = list(d['urdu'].keys())
urdu = {}
for sym, pos in d['urdu'].items():
    letter = sym.strip('/')
    urdu[letter] = {k: pos.get(k, []) for k in ('initial', 'medial', 'final')}

js = []
js.append('// The articulation word list, the same one LinguaLink360 uses (database/seeders/PhoneticWordSeeder.php')
js.append('// and UrduPhoneticWordSeeder.php). Generated: do not edit by hand; change the seeders and regenerate.')
js.append('// Word Garden uses only these words. Pictures: an emoji where one fits the word clearly; every other')
js.append('// word is shown as animated word art (garden.js).')
js.append('')
js.append('// English: 24 sounds, each with words where the sound is at the start, in the middle and at the end.')
js.append('export const SOUNDS_EN = ' + json.dumps([{'id': k, 'ipa': sym, 'example': EXAMPLE[k]} for sym, k in IDS.items() if k in english], ensure_ascii=False) + ';')
js.append('export const WORDS_EN = ' + json.dumps(english, ensure_ascii=False) + ';')
js.append('export const GRAPHEMES_EN = ' + json.dumps(GRAPHEMES, ensure_ascii=False) + ';')
js.append('export const PICTURES_EN = ' + json.dumps(PIC, ensure_ascii=False) + ';')
js.append('')
js.append('// Urdu: one entry per letter, with words where the letter is at the start, in the middle and at the end.')
js.append('export const SOUNDS_UR = ' + json.dumps([{'id': l, 'ipa': '/' + l + '/', 'example': (urdu[l]['initial'] or urdu[l]['medial'] or urdu[l]['final'] or [''])[0]} for l in urdu], ensure_ascii=False) + ';')
js.append('export const WORDS_UR = ' + json.dumps(urdu, ensure_ascii=False) + ';')
open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(js) + '\n')
print('ok', len(english), len(urdu), len(PIC), 'pictures of', len(all_words), 'words')
