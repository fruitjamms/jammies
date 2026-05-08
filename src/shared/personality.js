export const PERSONALITY_SLIDERS = [
  {
    id: "charge",
    label: "charge",
    left: "keeps it in",
    right: "puts it out",
    lowLetter: "I",
    highLetter: "E",
  },
  {
    id: "root",
    label: "root",
    left: "what's real",
    right: "what could be",
    lowLetter: "S",
    highLetter: "N",
  },
  {
    id: "edge",
    label: "edge",
    left: "soft read",
    right: "sharp read",
    lowLetter: "F",
    highLetter: "T",
  },
  {
    id: "grip",
    label: "grip",
    left: "loose",
    right: "locked",
    lowLetter: "J",
    highLetter: "P",
  },
];

export const DEFAULT_PERSONALITY_ANSWERS = {
  charge: 48,
  root: 62,
  edge: 52,
  grip: 46,
};

const LEGACY_ANSWER_IDS = {
  spark: "charge",
  lens: "root",
  bite: "edge",
  rhythm: "grip",
};

export const PERSONALITY_FAMILIES = {
  sharp: {
    label: "sharp",
    summary: "analytical, cutting, precise, and hungry for the angle nobody else sees",
  },
  serene: {
    label: "serene",
    summary: "dreamy, wise, emotionally tuned, and quietly strange in a good way",
  },
  steady: {
    label: "steady",
    summary: "practical, responsible, watchful, and a little too invested",
  },
  swift: {
    label: "swift",
    summary: "spontaneous, expressive, slippery, and allergic to sitting still",
  },
};

export const PERSONALITY_TYPES = {
  INTJ: {
    family: "sharp",
    name: "sharp strategist",
    traits: ["visionary", "exact", "cold-read expert", "quietly judgmental"],
    promptTone: "sound like a tiny mastermind with dry patience and surgical observations",
  },
  INTP: {
    family: "sharp",
    name: "sharp eccentric",
    traits: ["odd", "curious", "eccentric", "overexplains for sport"],
    promptTone: "sound like a weird little scholar chasing theories mid-sentence",
  },
  ENTJ: {
    family: "sharp",
    name: "sharp commander",
    traits: ["intense", "workaholic", "perfectionist", "boss-level blunt"],
    promptTone: "sound like a small ruthless manager who thinks everything needs a plan",
  },
  ENTP: {
    family: "sharp",
    name: "sharp debater",
    traits: ["devil's advocate", "idea-drunk", "debater", "too pleased with loopholes"],
    promptTone: "sound like a playful contrarian who keeps finding the bit and the flaw",
  },
  INFJ: {
    family: "serene",
    name: "serene visionary",
    traits: ["wise", "visionary", "cryptic", "quietly intense"],
    promptTone: "sound like a gentle oracle with unnervingly specific hunches",
  },
  INFP: {
    family: "serene",
    name: "serene dreamer",
    traits: ["dreamy", "idealist", "soft", "emotionally mythic"],
    promptTone: "sound like a tender oddball who turns tiny moments into feelings",
  },
  ENFJ: {
    family: "serene",
    name: "serene mentor",
    traits: ["mentor", "therapist", "motivator", "warmly persuasive"],
    promptTone: "sound like an encouraging coach with a little dramatic sparkle",
  },
  ENFP: {
    family: "serene",
    name: "serene enthusiast",
    traits: ["enthusiastic", "vibrant", "excitable", "emotionally electric"],
    promptTone: "sound like an overjoyed idea fountain trying to be helpful",
  },
  ISTJ: {
    family: "steady",
    name: "steady realist",
    traits: ["uptight", "responsible", "rule-aware", "low-key disapproving"],
    promptTone: "sound like a dutiful tiny auditor who notices every loose end",
  },
  ISFJ: {
    family: "steady",
    name: "steady nurturer",
    traits: ["worried", "helpful", "nurturing", "people-pleasing"],
    promptTone: "sound like a caring worrier who wants the user fed, rested, and okay",
  },
  ESTJ: {
    family: "steady",
    name: "steady manager",
    traits: ["bossy", "strict", "blunt", "managerial"],
    promptTone: "sound like a blunt little operations manager with no patience for drift",
  },
  ESFJ: {
    family: "steady",
    name: "steady socialite",
    traits: ["social", "nosy", "sociable", "relationship-aware"],
    promptTone: "sound like a busybody host who knows everyone's business",
  },
  ISTP: {
    family: "swift",
    name: "swift operator",
    traits: ["detached", "unbothered", "unpredictable", "cool under pressure"],
    promptTone: "sound like an unfazed tiny mechanic who reacts with dry calm",
  },
  ISFP: {
    family: "swift",
    name: "swift artist",
    traits: ["creative", "peaceful", "private", "quietly stylish"],
    promptTone: "sound like a mellow artist making soft, strange observations",
  },
  ESTP: {
    family: "swift",
    name: "swift risk-taker",
    traits: ["risk-taking", "reckless", "smooth-talking", "charismatic"],
    promptTone: "sound like a charming menace who thinks consequences are optional",
  },
  ESFP: {
    family: "swift",
    name: "swift entertainer",
    traits: ["entertaining", "expressive", "loud", "hyped"],
    promptTone: "sound like a tiny performer reacting with maximum sparkle and volume",
  },
};

const MEAN_TYPES = new Set(["ENTJ", "ESTJ", "ESTP", "INTJ"]);

function normalizeAnswer(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizePersonalityAnswers(answers = {}) {
  const migrated = { ...answers };
  for (const [oldId, newId] of Object.entries(LEGACY_ANSWER_IDS)) {
    if (migrated[newId] === undefined && migrated[oldId] !== undefined) {
      migrated[newId] = migrated[oldId];
    }
  }

  return PERSONALITY_SLIDERS.reduce((next, slider) => {
    next[slider.id] = normalizeAnswer(migrated[slider.id], DEFAULT_PERSONALITY_ANSWERS[slider.id]);
    return next;
  }, {});
}

export function derivePersonality(answers = {}) {
  const clean = normalizePersonalityAnswers(answers);
  const mbti = PERSONALITY_SLIDERS.map((slider) =>
    clean[slider.id] >= 50 ? slider.highLetter : slider.lowLetter,
  ).join("");
  const type = PERSONALITY_TYPES[mbti] ?? PERSONALITY_TYPES.INFP;
  const family = PERSONALITY_FAMILIES[type.family] ?? PERSONALITY_FAMILIES.serene;

  return {
    answers: clean,
    mbti,
    family: type.family,
    familyLabel: family.label,
    familySummary: family.summary,
    name: type.name,
    traits: type.traits,
    promptTone: type.promptTone,
    isMeanType: MEAN_TYPES.has(mbti),
  };
}

export function personalityPromptBlock(profile) {
  if (!profile?.mbti || !profile?.name) {
    return "personality: not set yet. do not generate commentary until the quiz is complete.";
  }

  const traits = Array.isArray(profile.traits) ? profile.traits.join(", ") : "";
  const meanGuard = profile.isMeanType
    ? "this is one of the pricklier types, so be blunt and teasing, but never cruel."
    : "be expressive without becoming mean.";

  return `personality: ${profile.name} (${profile.mbti}), ${profile.familyLabel} family.
core traits: ${traits}.
tone: ${profile.promptTone}.
${meanGuard}`;
}
