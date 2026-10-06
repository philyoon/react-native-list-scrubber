// Generated demo data. Deterministic so screenshots and the GIF are repeatable.

const FIRST = [
  'Ada',
  'Bea',
  'Cal',
  'Dov',
  'Eli',
  'Fay',
  'Gus',
  'Hal',
  'Ida',
  'Jo',
  'Kai',
  'Lea',
  'Max',
  'Nia',
  'Oli',
  'Pia',
  'Quinn',
  'Rex',
  'Sol',
  'Tia',
  'Uma',
  'Vic',
  'Wes',
  'Xan',
  'Yan',
  'Zoe',
];
const LAST_START = [
  'Ab',
  'Bar',
  'Cor',
  'Dal',
  'Ever',
  'Fen',
  'Gar',
  'Hol',
  'Ing',
  'Jar',
  'Kel',
  'Lan',
  'Mor',
  'Nor',
  'Oak',
  'Pem',
  'Quil',
  'Ros',
  'Sel',
  'Tor',
  'Ul',
  'Ven',
  'Wil',
  'Xer',
  'Yar',
  'Zel',
];
const LAST_END = ['by', 'ton', 'wood', 'ley', 'field', 'man', 'ford', 'well', 'son', 'stead'];

/** A small seeded random generator (mulberry32) */
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Contact {
  id: string;
  name: string;
  /** Last name, used for sorting and the section letter */
  last: string;
}

/** `count` contacts sorted by last name. Some letters get many more than others, like real names. */
export function makeContacts(count: number): Contact[] {
  const rand = random(7);
  const out: Contact[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    // Skew towards the first half of the alphabet so sections have uneven sizes.
    const li = Math.floor(Math.pow(rand(), 1.6) * LAST_START.length);
    const last = LAST_START[li]! + LAST_END[Math.floor(rand() * LAST_END.length)]!;
    const first = FIRST[Math.floor(rand() * FIRST.length)]!;
    const name = `${first} ${last}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ id: String(out.length), name, last });
  }
  return out.sort((a, b) => a.last.localeCompare(b.last) || a.name.localeCompare(b.name));
}

export interface Section {
  title: string;
  data: Contact[];
}

export function groupByLetter(contacts: Contact[]): Section[] {
  const sections: Section[] = [];
  for (const c of contacts) {
    const letter = c.last[0]!.toUpperCase();
    const last = sections[sections.length - 1];
    if (last?.title === letter) last.data.push(c);
    else sections.push({ title: letter, data: [c] });
  }
  return sections;
}

export interface Entry {
  id: string;
  title: string;
  date: Date;
}

const TOPICS = ['Run', 'Notes', 'Photo walk', 'Reading', 'Groceries', 'Call', 'Recipe', 'Idea', 'Workout'];

/** `count` journal entries, newest first, a few per day going back in time */
export function makeEntries(count: number): Entry[] {
  const rand = random(3);
  const start = new Date(2026, 9, 6).getTime();
  const out: Entry[] = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    t -= Math.floor(rand() * 20 * 3600 * 1000);
    out.push({ id: String(i), title: TOPICS[Math.floor(rand() * TOPICS.length)]!, date: new Date(t) });
  }
  return out;
}

const MONTH = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' });
const DAY = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' });
export const monthLabel = (d: Date) => MONTH.format(d);
export const dayLabel = (d: Date) => DAY.format(d);
