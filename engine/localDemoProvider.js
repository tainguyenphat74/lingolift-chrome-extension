import { STYLES, assertValidRequest } from "./provider.js";

/**
 * Deterministic, fully offline demo rewrite provider.
 *
 * This is NOT a real translation/rewriting model. It uses rule-based
 * cleanup (whitespace, punctuation, capitalization) plus fixed
 * phrase-substitution dictionaries per style, so the same input always
 * produces the same output with zero network access and zero API key.
 * It exists so LingoLift is fully usable out of the box; see
 * README.md for how to swap this out for a real backend/LLM provider.
 */

const SIMULATED_LATENCY_MS = 250;

// --- Style dictionaries -----------------------------------------------

/** Texting shorthand -> standard English. Used for the "natural" style. */
const NATURAL_FIXUPS = {
  u: "you",
  ur: "your",
  r: "are",
  pls: "please",
  plz: "please",
  thx: "thanks",
  gr8: "great",
  l8r: "later",
  b4: "before",
  "2day": "today",
  "2morrow": "tomorrow",
  "2nite": "tonight",
  im: "I'm",
  dont: "don't",
  cant: "can't",
  wont: "won't",
  youre: "you're",
  theyre: "they're",
  isnt: "isn't",
  wasnt: "wasn't",
  didnt: "didn't",
  doesnt: "doesn't",
};

/** Casual/informal -> formal wording. Used for the "professional" style. */
const PROFESSIONAL_MAP = {
  hey: "Hello",
  hi: "Hello",
  hiya: "Hello",
  yo: "Hello",
  thanks: "Thank you",
  thx: "Thank you",
  "can't": "cannot",
  "won't": "will not",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "i'm": "I am",
  "i've": "I have",
  "i'll": "I will",
  "i'd": "I would",
  "you're": "you are",
  "you've": "you have",
  "you'll": "you will",
  "it's": "it is",
  "that's": "that is",
  "there's": "there is",
  wanna: "want to",
  gonna: "going to",
  gotta: "have to",
  kinda: "somewhat",
  sorta: "somewhat",
  yeah: "yes",
  yep: "yes",
  nope: "no",
  ok: "okay",
  asap: "as soon as possible",
  btw: "by the way",
  fyi: "for your information",
  sorry: "I apologize",
  guys: "everyone",
  stuff: "materials",
  "a lot": "a great deal",
};

/** Formal -> casual/informal wording. Used for the "casual" style. */
const CASUAL_MAP = {
  hello: "Hey",
  greetings: "Hey",
  "thank you": "Thanks",
  cannot: "can't",
  "will not": "won't",
  "do not": "don't",
  "does not": "doesn't",
  "did not": "didn't",
  "is not": "isn't",
  "are not": "aren't",
  "was not": "wasn't",
  "were not": "weren't",
  "i am": "I'm",
  "i have": "I've",
  "i will": "I'll",
  "i would": "I'd",
  "you are": "you're",
  "you have": "you've",
  "you will": "you'll",
  "it is": "it's",
  "that is": "that's",
  "there is": "there's",
  "want to": "wanna",
  "going to": "gonna",
  "have to": "gotta",
  "as soon as possible": "ASAP",
  "for your information": "FYI",
  "by the way": "BTW",
  yes: "yeah",
  no: "nope",
  okay: "ok",
  "i apologize": "sorry",
  everyone: "guys",
  "a great deal": "a lot",
};

const STYLE_MAPS = {
  [STYLES.NATURAL]: NATURAL_FIXUPS,
  [STYLES.PROFESSIONAL]: PROFESSIONAL_MAP,
  [STYLES.CASUAL]: CASUAL_MAP,
};

const STYLE_INTRO_VI = {
  [STYLES.NATURAL]:
    "Bản chỉnh sửa giữ nguyên giọng văn tự nhiên, chỉ chuẩn hoá kiểu viết tắt nhắn tin, khoảng trắng và dấu câu.",
  [STYLES.PROFESSIONAL]:
    "Bản chỉnh sửa chuyển sang văn phong trang trọng: mở rộng từ viết tắt, thay từ thông tục bằng từ ngữ chuyên nghiệp hơn, và chuẩn hoá dấu câu.",
  [STYLES.CASUAL]:
    "Bản chỉnh sửa chuyển sang giọng văn gần gũi, thân thiện hơn: rút gọn các cụm trang trọng và dùng từ ngữ đời thường.",
};

// --- Text cleanup helpers ----------------------------------------------

function normalizeWhitespace(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tightenPunctuationSpacing(text) {
  return text
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ");
}

function capitalizeSentences(text) {
  return text.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, lead, letter) => lead + letter.toUpperCase());
}

function ensureTerminalPunctuation(text) {
  const trimmed = text.trim();
  if (!trimmed || /[.!?]["')\]]?$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchCase(source, replacement) {
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (/[a-z]/i.test(source[0]) && source[0] === source[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Applies a lowercase-keyed phrase map to text, preserving case, and
 * returns the result plus a list of {from, to} substitutions made. */
function applyPhraseMap(text, map) {
  const keys = Object.keys(map).sort(
    (a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length
  );
  if (keys.length === 0) return { result: text, changes: [] };

  const pattern = new RegExp(`\\b(${keys.map(escapeRegExp).join("|")})\\b`, "gi");
  const changes = [];
  const result = text.replace(pattern, (match) => {
    const replacement = map[match.toLowerCase()];
    if (replacement === undefined) return match;
    const cased = matchCase(match, replacement);
    changes.push({ from: match, to: cased });
    return cased;
  });
  return { result, changes };
}

function dedupeChanges(changes) {
  const seen = new Set();
  const unique = [];
  for (const change of changes) {
    const key = `${change.from.toLowerCase()}=>${change.to.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(change);
    }
  }
  return unique;
}

function buildExplanation(style, changes) {
  const intro = STYLE_INTRO_VI[style];
  const examples = dedupeChanges(changes).slice(0, 3);
  if (examples.length === 0) {
    return `${intro} Văn bản gốc đã khá phù hợp với phong cách này nên chỉ có vài thay đổi nhỏ về định dạng.`;
  }
  const exampleText = examples.map((c) => `"${c.from}" → "${c.to}"`).join(", ");
  return `${intro} Ví dụ: ${exampleText}.`;
}

// --- Public provider -----------------------------------------------------

function rewriteSync(text, style) {
  let working = normalizeWhitespace(text);
  working = tightenPunctuationSpacing(working);
  working = capitalizeSentences(working);

  const { result, changes } = applyPhraseMap(working, STYLE_MAPS[style]);
  working = capitalizeSentences(result);
  working = ensureTerminalPunctuation(working);

  return {
    rewrittenText: working,
    explanationVi: buildExplanation(style, changes),
  };
}

export const localDemoProvider = {
  id: "local-demo",
  async rewrite(request) {
    assertValidRequest(request);
    const { text, style } = request;
    // Fixed (non-random) delay so the UI's loading state is exercised the
    // same way a real network-backed provider would use it.
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
    return rewriteSync(text, style);
  },
};
