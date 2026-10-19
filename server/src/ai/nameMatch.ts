// Finding a member by name for the AI assistant (/api/ai/* search). Member
// names are stored in English capitals ("ABDUL RAHAMAN.P"), but people type
// them loosely ("abdurahman p"), or in Malayalam ("അബ്ദുൽ റഹ്മാൻ") - a plain
// substring test misses both. So (ported from the masjid app's nameMatch.js):
//   - Malayalam is turned into English letters (an approximate,
//     Manglish-style spelling: "ബഷീർ" -> "basheer")
//   - both sides are simplified the way people spell loosely (th/t, aa/a,
//     doubled letters, ng/n before k...), then compared word by word, allowing
//     a letter or two off in longer words
//   - initials match words: "KP" matches "SHAREEF.KP" and "K P"
//   - a member code matches too: "KMCC0012", "kmcc 12", "12"

const VOWELS: Record<string, string> = { 'അ': 'a', 'ആ': 'aa', 'ഇ': 'i', 'ഈ': 'ii', 'ഉ': 'u', 'ഊ': 'uu', 'ഋ': 'ru', 'എ': 'e', 'ഏ': 'ee', 'ഐ': 'ai', 'ഒ': 'o', 'ഓ': 'oo', 'ഔ': 'au' };
const SIGNS: Record<string, string> = { 'ാ': 'aa', 'ി': 'i', 'ീ': 'ii', 'ു': 'u', 'ൂ': 'uu', 'ൃ': 'ru', 'െ': 'e', 'േ': 'ee', 'ൈ': 'ai', 'ൊ': 'o', 'ോ': 'oo', 'ൌ': 'au', 'ൗ': 'au' };
const CONSONANTS: Record<string, string> = {
  'ക': 'k', 'ഖ': 'kh', 'ഗ': 'g', 'ഘ': 'gh', 'ങ': 'ng', 'ച': 'ch', 'ഛ': 'chh', 'ജ': 'j', 'ഝ': 'jh', 'ഞ': 'nj',
  'ട': 't', 'ഠ': 'th', 'ഡ': 'd', 'ഢ': 'dh', 'ണ': 'n', 'ത': 'th', 'ഥ': 'th', 'ദ': 'd', 'ധ': 'dh', 'ന': 'n',
  'പ': 'p', 'ഫ': 'f', 'ബ': 'b', 'ഭ': 'bh', 'മ': 'm', 'യ': 'y', 'ര': 'r', 'റ': 'r', 'ല': 'l', 'ള': 'l',
  'ഴ': 'zh', 'വ': 'v', 'ശ': 'sh', 'ഷ': 'sh', 'സ': 's', 'ഹ': 'h', 'ഩ': 'n', 'ഺ': 't',
};
const CHILLU: Record<string, string> = { 'ൺ': 'n', 'ൻ': 'n', 'ർ': 'r', 'ൽ': 'l', 'ൾ': 'l', 'ൿ': 'k' };
const VIRAMA = '്';
const MALAYALAM = /[ഀ-ൿ]/;

// "ബഷീർ" -> "basheer"
export function toLatin(text: string): string {
  // റ്റ is said "tt" and ന്റ "nt".
  const chars = [
    ...String(text)
      .normalize('NFC')
      .replace(/[‌‍]/g, '')
      .replace(/റ്റ/g, 'ട്ട')
      .replace(/ന്റ/g, 'ന്ട'),
  ];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (VOWELS[c]) out += VOWELS[c];
    else if (CHILLU[c]) out += CHILLU[c];
    else if (c === 'ം') out += 'm';
    else if (c === 'ഃ') out += 'h';
    else if (CONSONANTS[c]) {
      out += CONSONANTS[c];
      const next = chars[i + 1];
      if (SIGNS[next]) {
        out += SIGNS[next];
        i++;
      } else if (next === VIRAMA) {
        i++; // no vowel
      } else {
        out += 'a'; // the inherent vowel
      }
    } else if (!SIGNS[c] && c !== VIRAMA) out += c;
  }
  return out;
}

// How people spell loosely in English letters: one form for each.
function simplify(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(th|dh|kh|gh|ph|bh|jh|chh)/g, (m) => m[0])
    .replace(/ch/g, 'c')
    .replace(/sh/g, 's')
    .replace(/zh/g, 'l')
    .replace(/w/g, 'v')
    .replace(/ee|ii|ie/g, 'i')
    .replace(/oo|uu|ou/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/ng(?=[kg])/g, 'n')
    .replace(/(.)\1+/g, '$1');
}

const words = (text: string) => (MALAYALAM.test(text) ? toLatin(text) : String(text)).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

// 0 = no match; higher = better (1 per query word matched, a little less when spelled differently).
function similar(q: string, n: string): number {
  if (q === n) return 1;
  if (n.startsWith(q) && q.length >= 3) return 0.9;
  // A single letter or two is an initial: "P" in "ABDUL RAHAMAN.P".
  if (q.length <= 2 && n.startsWith(q)) return 0.6;
  const allowed = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  return allowed && distance(q, n) <= allowed ? 0.8 : 0;
}

const memberCodeNumber = (s: string) => {
  const m = String(s).toUpperCase().replace(/\s/g, '').match(/^(?:KMCC)?0*(\d{1,5})$/);
  return m ? Number(m[1]) : null;
};

// How well `query` names this member: 0 = not at all.
export function nameScore(query: string, name: string, memberCode = ''): number {
  const q = String(query ?? '').trim();
  if (!q) return 1;
  const qCode = memberCodeNumber(q);
  if (qCode !== null && qCode === memberCodeNumber(memberCode)) return 10;
  // "SHAREEF.KP" -> shareef, kp: dots and spaces both split words. Two letters
  // run together are initials, so they also count one by one: "favas t k"
  // finds "FAVAS TK".
  const nameWords = words(name)
    .flatMap((w) => (/^[a-z]{2}$/.test(w) ? [w, ...w] : [w]))
    .map(simplify)
    .filter(Boolean);
  const queryWords = words(q).map(simplify).filter(Boolean);
  if (!queryWords.length || !nameWords.length) return 0;
  let score = 0;
  for (const qw of queryWords) {
    let best = Math.max(...nameWords.map((nw) => similar(qw, nw)));
    // Initials: "kp" = consecutive words starting with k and p ("k p"), or the word "kp" itself.
    if (!best && qw.length >= 2 && qw.length <= 4 && /^[a-z]+$/.test(qw)) {
      const firsts = nameWords.map((w) => w[0]).join('');
      if (firsts.includes(qw)) best = 0.7;
    }
    if (!best) return 0; // every word typed must be in the name
    score += best;
  }
  return score;
}

// The members a search means, best first (none: an empty list).
export function findMembers<T extends { name: string; memberCode: string }>(query: string, members: T[]): T[] {
  if (!String(query ?? '').trim()) return members;
  const scored = members.map((m) => ({ m, score: nameScore(query, m.name, m.memberCode) })).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  const top = scored.length ? scored[0].score : 0;
  // Only the best: "basheer" finds Basheer, not also Bashir K (one letter off) - unless both score alike.
  return scored.filter((x) => x.score >= top - 0.1).map((x) => x.m);
}
