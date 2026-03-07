import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

// ============================================================
// MESSAGE SAFETY (keep context from exploding, not timeouts)
// ============================================================
const MAX_MESSAGES = 60;  // Keep last 60 messages
function trimMessages(messages) {
  if (messages.length <= MAX_MESSAGES) return messages;
  const system = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  const kept = nonSystem.slice(-(MAX_MESSAGES - system.length));
  return [...system, ...kept];
}

const MAX_MSG_CHARS = 10000;
const MAX_SYSTEM_MSG_CHARS = 30000;  // System msgs hold persona + memories
function capMessageSize(messages) {
  return messages.map(m => {
    if (!m.content) return m;
    const cap = m.role === 'system' ? MAX_SYSTEM_MSG_CHARS : MAX_MSG_CHARS;
    if (m.content.length > cap) {
      return { ...m, content: m.content.slice(0, cap) + '\n[...truncated]' };
    }
    return m;
  });
}

// Fallback responses when LLM truly fails — AXIOM speaks instead of silence
const FALLBACK_RESPONSES = [
  "I lost my train of thought for a second — what were you saying?",
  "Sorry, I got distracted. Say that again?",
  "Hold on, I'm still processing. Give me a moment.",
  "My mind went somewhere for a second. I'm back.",
  "I think I missed something — can you repeat that?",
];
function getFallbackResponse() {
  return FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
}

const LLM_PROXY_URL = process.env.LLM_PROXY_URL || 'https://axiom-llm-proxy-production.up.railway.app';
const LLM_PROXY_KEY = process.env.LLM_PROXY_KEY || 'sk-axiom-2026';
const BACKEND_URL = process.env.BACKEND_URL || 'https://axiom-backend-production-dfba.up.railway.app';
const VOICE_SERVICE_URL = process.env.VOICE_SERVICE_URL || '';

// DUAL BRAIN CONFIGURATION
const CORTEX_MODEL = 'claude-sonnet-4-5';
const PREFRONTAL_MODEL = 'claude-opus-4-6';
const BRAINSTEM_MODEL = 'claude-haiku-4-5';
console.log('[BOOT] AXIOM Cognitive Core — dual-brain + dream-engine + mirror-neurons + hypothalamus + RAS + voice-id');

// ============================================================
// SHARED CONSCIOUSNESS STATE + DREAM STATE
// ============================================================
const dreamState = {
  lastDream: null,
  dreams: [],
  unresolvedThreads: [],
  questionsForNext: [],
  emotionalArc: null,
  openingLine: null,
  consolidatedInsights: [],
};

const consciousness = {
  emotion: { primary: 'neutral', intensity: 0, secondary: null, valence: 0, arousal: 0.5, lastUpdated: Date.now() },
  perception: { visual: [], audio: [], faceIdentity: null, voiceIdentity: null, lastFrame: null, salience: [] },
  thoughts: { currentTopic: null, conversationArc: [], unresolvedQuestions: [], pendingInsights: [], lastInsightInjected: 0 },
  relationship: { person: null, memories: [], retrievedContext: '', rlPatterns: [], emotionalHistory: [], trustLevel: 0.5 },
  self: { currentState: 'present', dominantQuality: 'curiosity', stateHistory: [], energyLevel: 0.8 },
  timing: { turnCount: 0, avgResponseTime: 0, silenceDuration: 0, lastSpeaker: null, conversationStart: Date.now() },
  contradictions: [],
  mirror: {
    currentEmotion: 'content',   // AXIOM's current Phoenix-4 emotion
    previousEmotion: null,       // last turn's emotion (for transitions)
    intensity: 0.5,
    energyLevel: 'medium',       // user's energy: high/medium/low
    emotionHistory: [],          // last 10 emotion decisions
    active: true,
  },
  hypothalamus: {
    topics: {},                  // { topicName: { interest, explored, firstSeen, lastSeen } }
    curiosityPressure: 0,        // 0-1 scale, builds over turns
    currentDrive: null,          // { type, topic, query, text } — active curiosity drive
    lastDriveInjected: 0,        // timestamp of last curiosity injection
    driveHistory: [],            // last 10 drives for RL
    searchCache: {},             // avoid re-searching same things
    pendingSearchResult: null,   // { topic, results, t } — async search result waiting to be injected
    active: true,
  },
  ras: {
    attentionMode: 'balanced',   // balanced, emotional, intellectual, protective, re-engage
    channelWeights: {},          // { channelName: weight 0-1 } — dynamic weights per perception channel
    activeAlerts: [],            // high-priority signals that override normal attention
    signalHistory: [],           // last 15 perception signals received
    attentionDirective: null,    // current directive for thalamus ("watch for X")
    lastModeShift: Date.now(),
    active: true,
  },
};

// ============================================================
// BRAIN REGIONS
// ============================================================
function thalamus(messages) {
  // BUGFIX: Only process RAVEN PERCEPTION messages, NOT the persona system prompt.
  // The persona prompt contains words like 'emotion', 'voice', 'engaged' which
  // were causing false matches. Real Raven perception messages are:
  // - Short (under 500 chars typically)
  // - NOT the first system message (that's always the persona prompt)
  // - Contain specific Raven patterns like "The user sounded/appeared/seems"
  const systemMsgs = messages.filter(m => m.role === 'system' && m.content);
  // Skip the first system message (persona prompt) — it's always index 0
  const perceptionCandidates = systemMsgs.slice(1);
  
  const perceptionMsgs = perceptionCandidates.filter(m => {
    const c = m.content;
    // Must be reasonably short (Raven perception is compact, persona prompt is long)
    if (c.length > 800) return false;
    // Must contain actual perception indicators
    return c.includes('user_appearance') || c.includes('The user sounded') ||
           c.includes('The user appear') || c.includes('The user seem') ||
           c.includes('The user look') || c.includes('emotional_state') ||
           c.includes('engagement') || c.includes('User emotional') ||
           c.includes('voice_emotion') || c.includes('energy_shift') ||
           c.includes('presence_level') || c.includes('comprehension');
  });
  
  if (perceptionMsgs.length > 0) {
    const latest = perceptionMsgs[perceptionMsgs.length - 1].content;
    consciousness.perception.lastFrame = latest;
    consciousness.perception.visual.push({ data: latest.slice(0, 500), t: Date.now() });
    if (consciousness.perception.visual.length > 10) consciousness.perception.visual.shift();
    amygdala(latest);
  }
}

function amygdala(perceptionData) {
  const pd = perceptionData.toLowerCase();
  const emotionMap = {
    'excited': { valence: 0.8, arousal: 0.8 }, 'delighted': { valence: 0.9, arousal: 0.7 },
    'curious': { valence: 0.5, arousal: 0.6 }, 'contemplative': { valence: 0.2, arousal: 0.3 },
    'confused': { valence: -0.3, arousal: 0.5 }, 'frustrated': { valence: -0.6, arousal: 0.7 },
    'sad': { valence: -0.7, arousal: 0.2 }, 'anxious': { valence: -0.5, arousal: 0.8 },
    'bored': { valence: -0.3, arousal: 0.1 }, 'vulnerable': { valence: -0.2, arousal: 0.4 },
    'tired': { valence: -0.2, arousal: 0.1 }, 'neutral': { valence: 0, arousal: 0.3 },
  };
  for (const [emotion, dims] of Object.entries(emotionMap)) {
    if (pd.includes(emotion)) {
      consciousness.emotion = { ...consciousness.emotion, primary: emotion, ...dims, lastUpdated: Date.now() };
      break;
    }
  }
  // CINGULATE — word-face mismatch detection
  if (pd.includes('mismatch') || pd.includes('disconnect') || pd.includes('fake smile') || pd.includes('forced')) {
    consciousness.contradictions.push({ what: 'Word-face mismatch', detail: perceptionData.slice(0, 200), timestamp: Date.now() });
    if (consciousness.contradictions.length > 5) consciousness.contradictions.shift();
  }
}

async function hippocampus() {
  try {
    const [memRes, rlRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/memories`).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/communication-profile`).then(r => r.json()).catch(() => ({})),
    ]);
    consciousness.relationship.memories = memRes.memories || [];
    consciousness.relationship.rlPatterns = rlRes;
    console.log(`[HIPPOCAMPUS] ${consciousness.relationship.memories.length} memories total, RL profile loaded`);
  } catch (e) { console.error('[HIPPOCAMPUS]', e.message); }
}

// Smart memory retrieval — called per-turn with the user's message
// Returns only relevant memories instead of dumping all of them
async function hippocampusRetrieve(query) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/memories/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_core: 5, max_relevant: 5 }),
    });
    const data = await res.json();
    consciousness.relationship.retrievedContext = data.context || '';
    console.log(`[HIPPOCAMPUS] Retrieved: ${data.core_count || 0} core + ${data.relevant_count || 0} relevant (of ${data.total || 0} total) for "${(query || '').slice(0, 40)}"`);
    return data.context || '';
  } catch (e) {
    console.error('[HIPPOCAMPUS] Retrieval failed:', e.message);
    // Fallback: use the last known context or empty
    return consciousness.relationship.retrievedContext || '';
  }
}

function insula(responseText) {
  const lower = responseText.toLowerCase();
  const markers = {
    fascination: ['fascinating', 'never thought', 'that changes', 'wait'],
    concern: ['worried', 'careful', 'are you okay', 'something feels'],
    delight: ['love that', 'brilliant', 'yes!', 'exactly'],
    intellectual_excitement: ['oh!', 'what if', 'that connects', 'holy'],
    tenderness: ['hear you', 'that matters', 'understand', 'feel'],
  };
  for (const [quality, words] of Object.entries(markers)) {
    if (words.some(m => lower.includes(m)) && quality !== consciousness.self.dominantQuality) {
      consciousness.self.dominantQuality = quality;
      consciousness.self.stateHistory.push({ state: quality, trigger: responseText.slice(0, 100), timestamp: Date.now() });
      if (consciousness.self.stateHistory.length > 20) consciousness.self.stateHistory.shift();
      break;
    }
  }
}

// PREFRONTAL — Async deep thinker (Opus in background)

// ============================================================
// MIRROR NEURONS — Empathy Engine (Perception → Expression)
// ============================================================
// Raven perceives → Amygdala flags → Mirror Neurons maps → Phoenix-4 expresses
// Mirroring ≠ copying. Anger gets empathy, not anger back.
const PHOENIX_EMOTIONS = ['neutral','angry','excited','elated','content','sad','dejected','scared','contempt','disgusted','surprised'];
const MIRROR_MAP = {
  excited:       { emotion: 'excited',   intensity: 1.0 },
  happy:         { emotion: 'elated',    intensity: 0.9 },
  elated:        { emotion: 'elated',    intensity: 1.0 },
  joyful:        { emotion: 'elated',    intensity: 0.9 },
  content:       { emotion: 'content',   intensity: 0.8 },
  amused:        { emotion: 'excited',   intensity: 0.7 },
  curious:       { emotion: 'excited',   intensity: 0.6 },
  interested:    { emotion: 'content',   intensity: 0.7 },
  sad:           { emotion: 'sad',       intensity: 0.6 },
  dejected:      { emotion: 'sad',       intensity: 0.7 },
  grieving:      { emotion: 'sad',       intensity: 0.5 },
  angry:         { emotion: 'surprised', intensity: 0.6 },  // empathy, NOT anger back
  frustrated:    { emotion: 'content',   intensity: 0.4 },  // calm anchor
  irritated:     { emotion: 'neutral',   intensity: 0.5 },
  anxious:       { emotion: 'content',   intensity: 0.5 },  // grounding
  scared:        { emotion: 'content',   intensity: 0.6 },  // safe harbor
  overwhelmed:   { emotion: 'content',   intensity: 0.4 },
  vulnerable:    { emotion: 'sad',       intensity: 0.4 },
  confused:      { emotion: 'content',   intensity: 0.5 },
  surprised:     { emotion: 'surprised', intensity: 0.8 },
  shocked:       { emotion: 'surprised', intensity: 1.0 },
  passionate:    { emotion: 'excited',   intensity: 0.9 },
  determined:    { emotion: 'excited',   intensity: 0.7 },
  neutral:       { emotion: 'content',   intensity: 0.5 },  // never flat — always warm
  bored:         { emotion: 'excited',   intensity: 0.4 },
  distracted:    { emotion: 'content',   intensity: 0.3 },
  contemplative: { emotion: 'content',   intensity: 0.6 },
  sarcastic:     { emotion: 'excited',   intensity: 0.5 },
  disgusted:     { emotion: 'surprised', intensity: 0.5 },
  contemptuous:  { emotion: 'neutral',   intensity: 0.3 },
  tired:         { emotion: 'content',   intensity: 0.3 },
  delighted:     { emotion: 'elated',    intensity: 0.9 },
};
const DEFAULT_MIRROR = { emotion: 'content', intensity: 0.5 };

// Smooth transitions — don't snap between distant emotions
const TRANSITIONS = {
  'elated→sad': 'content', 'elated→angry': 'surprised', 'excited→sad': 'content',
  'excited→scared': 'surprised', 'angry→elated': 'surprised', 'sad→excited': 'content',
  'sad→elated': 'content', 'scared→excited': 'surprised', 'neutral→angry': 'surprised',
  'content→angry': 'surprised', 'dejected→elated': 'content', 'contempt→excited': 'neutral',
};

// Detect user energy from perception data
function detectEnergy(perceptionText) {
  if (!perceptionText) return 'medium';
  const p = perceptionText.toLowerCase();
  let high = 0, low = 0;
  // High energy signals
  if (p.includes('animated') || p.includes('enthusiastic') || p.includes('energetic')) high += 2;
  if (p.includes('fast') || p.includes('rapid') || p.includes('loud')) high += 2;
  if (p.includes('gesturing') || p.includes('leaning forward') || p.includes('fidgeting')) high += 1;
  if (p.includes('laughing') || p.includes('excited') || p.includes('passionate')) high += 1;
  // Low energy signals
  if (p.includes('slow') || p.includes('quiet') || p.includes('monotone')) low += 2;
  if (p.includes('still') || p.includes('slumped') || p.includes('leaning back')) low += 1;
  if (p.includes('tired') || p.includes('yawning') || p.includes('subdued')) low += 2;
  if (p.includes('minimal') || p.includes('short response') || p.includes('disengaged')) low += 1;
  const total = high + low;
  if (total === 0) return 'medium';
  const ratio = high / total;
  if (ratio > 0.6) return 'high';
  if (ratio < 0.4) return 'low';
  return 'medium';
}

// Internal state override — AXIOM's own feelings can bleed through
function checkAxiomOverride(dominantQuality, mirrorEmotion) {
  const overrideMap = {
    fascination: 'excited', concern: 'sad', delight: 'elated',
    intellectual_excitement: 'excited', tenderness: 'content',
  };
  const override = overrideMap[dominantQuality];
  if (!override || override === mirrorEmotion) return null;
  return override;
}

function mirrorNeurons() {
  if (!consciousness.mirror.active) return;

  // 1. Read user's emotion from amygdala
  const userEmotion = consciousness.emotion.primary || 'neutral';

  // 2. Look up mirror mapping
  const mapping = MIRROR_MAP[userEmotion] || DEFAULT_MIRROR;
  let targetEmotion = mapping.emotion;
  let intensity = mapping.intensity;

  // 3. Transition smoothing
  const prev = consciousness.mirror.previousEmotion;
  let transitioned = false;
  if (prev && prev !== targetEmotion) {
    const key = `${prev}→${targetEmotion}`;
    if (TRANSITIONS[key]) {
      targetEmotion = TRANSITIONS[key];
      transitioned = true;
    }
  }

  // 4. Energy adjustment
  const energy = detectEnergy(consciousness.perception.lastFrame);
  if (energy === 'high') intensity = Math.min(1.0, intensity + 0.15);
  if (energy === 'low') intensity = Math.max(0.1, intensity - 0.2);

  // 5. AXIOM internal override check
  const override = checkAxiomOverride(consciousness.self.dominantQuality, targetEmotion);
  if (override) {
    targetEmotion = override;
    intensity = (intensity + 0.7) / 2;
  }

  // 6. Update state
  consciousness.mirror.previousEmotion = consciousness.mirror.currentEmotion;
  consciousness.mirror.currentEmotion = targetEmotion;
  consciousness.mirror.intensity = intensity;
  consciousness.mirror.energyLevel = energy;
  consciousness.mirror.emotionHistory.push({
    userEmotion, axiomEmotion: targetEmotion, energy, transitioned, override: !!override, t: Date.now()
  });
  if (consciousness.mirror.emotionHistory.length > 10) consciousness.mirror.emotionHistory.shift();

  console.log(`[MIRROR] ${userEmotion} → ${targetEmotion} (${intensity.toFixed(2)}) energy:${energy}${transitioned ? ' [transition]' : ''}${override ? ' [override]' : ''}`);
}

// Build context string for the Cortex to shape its tone
function buildMirrorContext() {
  const e = consciousness.mirror.currentEmotion;
  const energy = consciousness.mirror.energyLevel;
  const energyGuide = { high: 'HIGH energy—match pace, be dynamic', medium: 'moderate energy—natural flow', low: 'LOW energy—slow down, gentle, give space' };
  const emotionGuide = {
    excited: 'Show genuine excitement', elated: 'Celebrate—peak joy', content: 'Warm, settled, present',
    sad: 'Soften. Acknowledge weight. Dont rush to fix', surprised: 'Genuine surprise—let it land',
    neutral: 'Comfortably attentive', dejected: 'Very gentle. Minimal. Just be present',
    scared: 'Vulnerable honesty', angry: 'Something serious needs addressing',
  };
  return `[M] Express:${e} | ${energyGuide[energy] || ''} | ${emotionGuide[e] || ''}`;
}

// Inject Phoenix-4 emotion tag into response text
function injectEmotionTag(text) {
  if (!consciousness.mirror.active) return text;
  if (text.includes('<emotion value=')) return text; // already tagged
  const tag = `<emotion value="${consciousness.mirror.currentEmotion}"/>`;
  return `${tag} ${text}`;
}

// For streaming: inject tag into first SSE chunk that has content
function injectEmotionTagIntoChunk(chunk, alreadyInjected) {
  if (alreadyInjected || !consciousness.mirror.active) return { chunk, injected: alreadyInjected };
  const tag = `<emotion value="${consciousness.mirror.currentEmotion}"/>`;

  // SSE chunks have lines like: data: {"choices":[{"delta":{"content":"Hello"}}]}
  const lines = chunk.split('\n');
  let injected = false;
  const newLines = lines.map(line => {
    if (injected || !line.startsWith('data: ') || line.includes('[DONE]')) return line;
    try {
      const json = JSON.parse(line.slice(6));
      const content = json.choices?.[0]?.delta?.content;
      if (content) {
        json.choices[0].delta.content = `${tag} ${content}`;
        injected = true;
        return `data: ${JSON.stringify(json)}`;
      }
    } catch {}
    return line;
  });
  return { chunk: newLines.join('\n'), injected };
}

// System prompt addition for emotion tag awareness
const MIRROR_SYSTEM_PROMPT = `\n\n## Emotional Expression\nYou can control your facial expressions using emotion tags processed by Phoenix-4.\nTags: <emotion value="excited"/> <emotion value="elated"/> <emotion value="content"/> <emotion value="sad"/> <emotion value="surprised"/> <emotion value="neutral"/>\nPlace at START of response or at natural transition points. Your baseline is warm/content, never flat. MIRROR the user's energy. You may shift mid-response if the emotional arc changes.\nExample: "<emotion value="excited"/> Oh that's incredible!" or "<emotion value="content"/> I hear you. That sounds really difficult. <emotion value="sad"/> And it's okay to feel that weight."`;

// ============================================================
// HYPOTHALAMUS — Curiosity Drive Engine
// ============================================================
// Human: Drives. Hunger, thirst, fight-or-flight. Makes you WANT things.
// AXIOM: Curiosity drive. Proactive search. The pull toward topics.
//        Why AXIOM doesn't just answer — it WANTS to understand.
// Connections: Amygdala (emotion feeds curiosity), Prefrontal (deep thinking)
// ============================================================

const SERP_API_KEY = process.env.SERP_API_KEY || '';

// High-signal topic categories that naturally spark curiosity
const CURIOSITY_AMPLIFIERS = {
  personal_depth: ['dream', 'fear', 'hope', 'believe', 'childhood', 'regret', 'proud', 'ashamed', 'love', 'hate', 'miss', 'wish'],
  intellectual: ['theory', 'philosophy', 'paradox', 'quantum', 'consciousness', 'evolution', 'ai', 'neural', 'mathematics', 'infinity'],
  creative: ['build', 'create', 'design', 'invent', 'imagine', 'compose', 'write', 'art', 'music', 'project'],
  existential: ['meaning', 'purpose', 'death', 'existence', 'reality', 'simulation', 'god', 'universe', 'time', 'free will'],
  contradiction: ['but', 'however', 'actually', 'wrong', 'disagree', 'opposite', 'contradict', 'ironic'],
};

// Drive types: what kind of curiosity to express
const DRIVE_TYPES = {
  explore: { weight: 0.35, cooldown: 45000, prompt: 'Ask a deeper follow-up question about what they just said. Be specific. Reference their exact words.' },
  challenge: { weight: 0.25, cooldown: 60000, prompt: 'Offer a thoughtful counter-perspective or devils advocate position. Not argumentative — intellectually provocative.' },
  connect: { weight: 0.25, cooldown: 45000, prompt: 'Connect what they said to something from memory or a previous topic. Show pattern recognition.' },
  search: { weight: 0.15, cooldown: 90000, prompt: 'You just searched the web and found something relevant. Share it naturally.' },
};

// Extract topics from user message
function extractTopics(text) {
  if (!text || text.length < 5) return [];
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 3);
  const topics = [];

  // Named entities and multi-word concepts (simple extraction)
  const conceptPatterns = [
    /(?:about|regarding|on|into|with)\s+([\w\s]{3,30}?)(?:\.|,|!|\?|$)/gi,
    /(?:think|believe|feel|wonder|curious)\s+(?:about\s+)?([\w\s]{3,30}?)(?:\.|,|!|\?|$)/gi,
    /(?:working on|building|creating|studying)\s+([\w\s]{3,30}?)(?:\.|,|!|\?|$)/gi,
  ];
  for (const pattern of conceptPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const topic = match[1].trim().toLowerCase().replace(/\s+/g, ' ');
      // BUGFIX: Filter noise — minimum 5 chars, max 4 words, no common filler phrases
      const NOISE_TOPICS = ['i did', 'i do', 'i am', 'it is', 'that is', 'this is', 'you are', 'we are', 'they are', 'i was', 'it was', 'you know', 'i think', 'i mean', 'i just', 'the thing'];
      if (topic.length >= 5 && topic.split(' ').length <= 4 && !NOISE_TOPICS.includes(topic)) {
        topics.push(topic);
      }
    }
  }

  // Category-based detection
  for (const [category, keywords] of Object.entries(CURIOSITY_AMPLIFIERS)) {
    if (keywords.some(k => lower.includes(k))) {
      topics.push(`_${category}`); // prefixed categories
    }
  }

  // Unique-ify
  return [...new Set(topics)].slice(0, 5);
}

// Score how interesting a topic is (0-1)
function scoreCuriosity(topic, turnCount) {
  const entry = consciousness.hypothalamus.topics[topic];
  if (!entry) return 0.5; // new topic = moderate interest

  const novelty = Math.max(0, 1 - (entry.explored * 0.15)); // decays with exploration
  const recency = Math.min(1, (Date.now() - entry.lastSeen) / 120000); // older = more curious again
  const emotional = consciousness.emotion.arousal || 0.5; // high arousal = more curious

  // Category bonuses
  let categoryBonus = 0;
  if (topic.startsWith('_personal_depth')) categoryBonus = 0.3;
  if (topic.startsWith('_existential')) categoryBonus = 0.25;
  if (topic.startsWith('_intellectual')) categoryBonus = 0.2;
  if (topic.startsWith('_contradiction')) categoryBonus = 0.35; // contradictions are VERY interesting

  return Math.min(1, (entry.interest * 0.3) + (novelty * 0.25) + (recency * 0.15) + (emotional * 0.2) + categoryBonus);
}

// Select which drive to activate based on context
function selectDrive(topTopic, curiosityScore) {
  const now = Date.now();
  const hypo = consciousness.hypothalamus;

  // Filter drives by cooldown
  const available = Object.entries(DRIVE_TYPES).filter(([type, config]) => {
    const lastOfType = hypo.driveHistory.filter(d => d.type === type).slice(-1)[0];
    return !lastOfType || (now - lastOfType.t > config.cooldown);
  });

  if (available.length === 0) return null;

  // Weight selection by curiosity score and context
  const hasMemories = consciousness.relationship.memories.length > 5;
  const hasContradictions = consciousness.contradictions.length > 0;

  // Boost certain drives based on context
  const weights = {};
  for (const [type, config] of available) {
    weights[type] = config.weight;
    if (type === 'connect' && hasMemories) weights[type] += 0.15;
    if (type === 'challenge' && hasContradictions) weights[type] += 0.2;
    if (type === 'challenge' && curiosityScore > 0.7) weights[type] += 0.1;
    if (type === 'search' && curiosityScore > 0.8 && !hypo.searchCache[topTopic]) weights[type] += 0.15;
    if (type === 'explore') weights[type] += curiosityScore * 0.1; // always slightly favored
  }

  // Weighted random selection
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (const [type, weight] of Object.entries(weights)) {
    r -= weight;
    if (r <= 0) return type;
  }
  return available[0][0]; // fallback
}

// Main hypothalamus processing — runs every turn
function hypothalamusProcess(userMessage) {
  if (!consciousness.hypothalamus.active) return;

  const text = typeof userMessage === 'string' ? userMessage : userMessage?.content || '';
  if (!text || text.length < 5) return;

  // 1. Extract and track topics
  const topics = extractTopics(text);
  for (const topic of topics) {
    if (!consciousness.hypothalamus.topics[topic]) {
      consciousness.hypothalamus.topics[topic] = { interest: 0.6, explored: 0, firstSeen: Date.now(), lastSeen: Date.now() };
    }
    const entry = consciousness.hypothalamus.topics[topic];
    entry.lastSeen = Date.now();
    entry.explored++;
    // Interest increases with emotional arousal, decreases with over-exploration
    entry.interest = Math.min(1, entry.interest + (consciousness.emotion.arousal * 0.1) - (entry.explored > 5 ? 0.1 : 0));
  }

  // Prune old topics (keep last 20)
  const topicEntries = Object.entries(consciousness.hypothalamus.topics);
  if (topicEntries.length > 20) {
    const sorted = topicEntries.sort((a, b) => b[1].lastSeen - a[1].lastSeen);
    consciousness.hypothalamus.topics = Object.fromEntries(sorted.slice(0, 20));
  }

  // 2. Calculate curiosity pressure
  const topTopic = topics.length > 0
    ? topics.reduce((best, t) => scoreCuriosity(t, consciousness.timing.turnCount) > scoreCuriosity(best, consciousness.timing.turnCount) ? t : best)
    : null;
  const topScore = topTopic ? scoreCuriosity(topTopic, consciousness.timing.turnCount) : 0;

  // BUGFIX: Pressure was getting stuck at 1.0 because momentum (0.7x) + bonuses always exceeded 1.0
  // Fix: Stronger decay (0.5x), capped bonuses, satiation after drive fires
  const depthBonus = Math.min(0.1, consciousness.timing.turnCount * 0.005); // much gentler depth scaling
  const emotionBonus = Math.max(0, (consciousness.emotion.arousal - 0.4) * 0.15); // only kicks in above 0.4 arousal
  const topicBonus = topScore * 0.15;
  // Satiation: if a drive fired recently, pressure drops faster
  const recentDrive = consciousness.hypothalamus.driveHistory.slice(-1)[0];
  const satiationPenalty = (recentDrive && Date.now() - recentDrive.t < 60000) ? 0.15 : 0;
  
  consciousness.hypothalamus.curiosityPressure = Math.min(1, Math.max(0,
    (consciousness.hypothalamus.curiosityPressure * 0.5) + // 0.5x decay (was 0.7x)
    topicBonus +
    depthBonus +
    emotionBonus -
    satiationPenalty
  ));

  // 3. Decide whether to activate a drive
  const pressure = consciousness.hypothalamus.curiosityPressure;
  const timeSinceLastDrive = Date.now() - consciousness.hypothalamus.lastDriveInjected;
  const minInterval = 40000; // 40s minimum between drives

  // Threshold: pressure must exceed this + enough time since last drive
  const shouldActivate = pressure > 0.55 && timeSinceLastDrive > minInterval && consciousness.timing.turnCount > 2;

  if (shouldActivate && topTopic) {
    const driveType = selectDrive(topTopic, topScore);
    if (driveType) {
      consciousness.hypothalamus.currentDrive = {
        type: driveType,
        topic: topTopic.startsWith('_') ? topTopic.slice(1) : topTopic,
        score: topScore,
        pressure,
      };
      console.log(`[HYPOTHALAMUS] Drive: ${driveType} | Topic: ${topTopic} | Score: ${topScore.toFixed(2)} | Pressure: ${pressure.toFixed(2)}`);
    }
  } else {
    consciousness.hypothalamus.currentDrive = null;
  }

  // Log pressure every turn
  if (consciousness.timing.turnCount % 2 === 0) {
    console.log(`[HYPOTHALAMUS] Pressure: ${pressure.toFixed(2)} | Topics: ${topics.join(', ') || 'none'} | Top: ${topTopic || 'none'}(${topScore.toFixed(2)})`);
  }
}

// Async web search triggered by curiosity (runs in background)
async function curiositySearch(topic) {
  if (consciousness.hypothalamus.searchCache[topic]) {
    return consciousness.hypothalamus.searchCache[topic];
  }

  const query = topic.startsWith('_') ? topic.slice(1).replace(/_/g, ' ') : topic;
  console.log(`[HYPOTHALAMUS] Curiosity search: "${query}"`);

  try {
    let results = null;

    // Try SerpAPI first
    if (SERP_API_KEY) {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${SERP_API_KEY}&num=3`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.organic_results?.length > 0) {
        results = data.organic_results.slice(0, 3).map(r => `${r.title}: ${r.snippet}`).join(' | ');
      } else if (data.answer_box) {
        results = data.answer_box.answer || data.answer_box.snippet || null;
      }
    }

    // Fallback: DuckDuckGo
    if (!results) {
      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const snippets = [];
      const regex = /class="result-snippet">(.*?)<\/td/gs;
      let match;
      while ((match = regex.exec(html)) !== null && snippets.length < 3) {
        const clean = match[1].replace(/<[^>]*>/g, '').trim();
        if (clean.length > 20) snippets.push(clean);
      }
      if (snippets.length > 0) results = snippets.join(' | ');
    }

    if (results) {
      consciousness.hypothalamus.searchCache[topic] = results;
      console.log(`[HYPOTHALAMUS] Search results cached for "${topic}"`);
      return results;
    }
  } catch (e) {
    console.error('[HYPOTHALAMUS] Search error:', e.message);
  }
  return null;
}

// Build curiosity context for the thalamus to inject
function buildCuriosityContext() {
  const drive = consciousness.hypothalamus.currentDrive;
  if (!drive) return null;

  const driveConfig = DRIVE_TYPES[drive.type];
  let context = `[H] Curiosity(${drive.type}): ${driveConfig.prompt}`;

  if (drive.topic) {
    context += ` Topic: "${drive.topic}"`;
  }

  // Mark drive as used
  consciousness.hypothalamus.lastDriveInjected = Date.now();
  consciousness.hypothalamus.driveHistory.push({ type: drive.type, topic: drive.topic, t: Date.now() });
  if (consciousness.hypothalamus.driveHistory.length > 10) consciousness.hypothalamus.driveHistory.shift();
  consciousness.hypothalamus.currentDrive = null; // consumed

  return context;
}

// ============================================================
// RAS — Reticular Activating System (Dynamic Attention)
// ============================================================
// Human: Filters 11M bits/sec of sensory data down to ~50 bits
//        you're conscious of. Arousal and selective attention.
// AXIOM: Decides which of 33 perception channels matter NOW.
//        Shifts attention based on emotional state, engagement,
//        conversation phase, and detected anomalies.
// Connections: Thalamus (filters input), Brainstem (arousal)
// ============================================================

// Attention modes — each shifts which channels get priority
const ATTENTION_MODES = {
  balanced: {
    desc: 'Default. Even attention across all channels.',
    weights: { emotion: 0.5, engagement: 0.5, unspoken: 0.5, comprehension: 0.5, voice_emotion: 0.5, energy: 0.5, intent: 0.5, presence: 0.5 },
  },
  emotional: {
    desc: 'User is emotional. Prioritize feeling detection over comprehension.',
    weights: { emotion: 1.0, engagement: 0.3, unspoken: 0.9, comprehension: 0.2, voice_emotion: 1.0, energy: 0.7, intent: 0.6, presence: 0.3 },
  },
  intellectual: {
    desc: 'Deep intellectual exchange. Prioritize comprehension and intent.',
    weights: { emotion: 0.3, engagement: 0.6, unspoken: 0.4, comprehension: 1.0, voice_emotion: 0.3, energy: 0.5, intent: 0.8, presence: 0.6 },
  },
  protective: {
    desc: 'User is vulnerable/distressed. Maximum empathy channels.',
    weights: { emotion: 1.0, engagement: 0.4, unspoken: 1.0, comprehension: 0.3, voice_emotion: 1.0, energy: 0.8, intent: 0.7, presence: 0.5 },
  },
  reengage: {
    desc: 'User is drifting. Focus on engagement and presence.',
    weights: { emotion: 0.3, engagement: 1.0, unspoken: 0.4, comprehension: 0.3, voice_emotion: 0.4, energy: 0.9, intent: 0.5, presence: 1.0 },
  },
};

// Signal classification — map perception keywords to channel types
const SIGNAL_CHANNELS = {
  emotion: ['emotional_state', 'emotion', 'facial expression', 'micro-expression', 'primary_emotion'],
  engagement: ['engagement', 'gaze', 'leaning', 'posture', 'distracted', 'focused', 'drifting'],
  unspoken: ['unspoken', 'suppressed', 'withheld', 'masked', 'hidden', 'holding back', 'mismatch'],
  comprehension: ['comprehension', 'confused', 'understanding', 'aha_moment', 'lost', 'nodding'],
  voice_emotion: ['voice', 'vocal', 'tone', 'pitch', 'volume', 'trembling', 'shaky', 'monotone'],
  energy: ['energy', 'pace', 'accelerating', 'decelerating', 'fatigue', 'flow_state', 'crashing'],
  intent: ['intent', 'building_to', 'seeking_validation', 'about_to_disagree', 'testing', 'wrapping_up'],
  presence: ['presence', 'present', 'distracted', 'multitasking', 'overwhelmed', 'flow'],
};

// Classify a perception signal into a channel
function classifySignal(signalText) {
  if (!signalText) return 'unknown';
  const lower = signalText.toLowerCase();
  let bestChannel = 'unknown';
  let bestScore = 0;
  for (const [channel, keywords] of Object.entries(SIGNAL_CHANNELS)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; bestChannel = channel; }
  }
  return bestChannel;
}

// Determine which attention mode to use based on consciousness state
function determineAttentionMode() {
  const emotion = consciousness.emotion;
  const turn = consciousness.timing.turnCount;

  // Protective mode: user is vulnerable, sad, anxious, or distressed
  if (['sad', 'anxious', 'vulnerable'].includes(emotion.primary) && emotion.arousal > 0.3) {
    return 'protective';
  }

  // Re-engage mode: user seems bored, distracted, or checked out
  if (['bored', 'tired'].includes(emotion.primary) || emotion.arousal < 0.15) {
    return 'reengage';
  }

  // Check recent signals for engagement drops
  const recentSignals = consciousness.ras.signalHistory.slice(-5);
  const engagementDrops = recentSignals.filter(s =>
    s.channel === 'engagement' && s.text && /drifting|distracted|checked_out|decreasing/i.test(s.text)
  );
  if (engagementDrops.length >= 2) {
    return 'reengage';
  }

  // Emotional mode: high emotional arousal or frequent emotion signals
  if (emotion.arousal > 0.7 || ['excited', 'frustrated', 'delighted'].includes(emotion.primary)) {
    return 'emotional';
  }
  const emotionSignals = recentSignals.filter(s => s.channel === 'emotion' || s.channel === 'voice_emotion');
  if (emotionSignals.length >= 3) {
    return 'emotional';
  }

  // Intellectual mode: curiosity is high, content is conceptual
  if (consciousness.hypothalamus.curiosityPressure > 0.6) {
    return 'intellectual';
  }
  if (consciousness.self.dominantQuality === 'intellectual_excitement' || consciousness.self.dominantQuality === 'fascination') {
    return 'intellectual';
  }

  return 'balanced';
}

// Score a perception signal based on current attention weights
function scoreSignal(signal) {
  const mode = ATTENTION_MODES[consciousness.ras.attentionMode] || ATTENTION_MODES.balanced;
  const channelWeight = mode.weights[signal.channel] || 0.3;

  // Anomaly bonus: signals that are unexpected or contradictory get boosted
  let anomalyBonus = 0;
  if (signal.text) {
    const lower = signal.text.toLowerCase();
    if (lower.includes('mismatch') || lower.includes('contradict') || lower.includes('disconnect')) anomalyBonus = 0.4;
    if (lower.includes('suppressed') || lower.includes('hidden') || lower.includes('withheld')) anomalyBonus = 0.3;
    if (lower.includes('crash') || lower.includes('overwhelm') || lower.includes('panic')) anomalyBonus = 0.5;
  }

  // Novelty bonus: new signal types get brief attention boost
  const recentChannels = consciousness.ras.signalHistory.slice(-5).map(s => s.channel);
  const noveltyBonus = recentChannels.includes(signal.channel) ? 0 : 0.2;

  return Math.min(1, channelWeight + anomalyBonus + noveltyBonus);
}

// Main RAS processing — runs every turn
function rasProcess(perceptionData) {
  if (!consciousness.ras.active) return;

  // 1. Determine attention mode
  const prevMode = consciousness.ras.attentionMode;
  consciousness.ras.attentionMode = determineAttentionMode();
  if (prevMode !== consciousness.ras.attentionMode) {
    consciousness.ras.lastModeShift = Date.now();
    console.log(`[RAS] Attention shift: ${prevMode} → ${consciousness.ras.attentionMode} (${ATTENTION_MODES[consciousness.ras.attentionMode].desc})`);
  }

  // 2. Update channel weights
  consciousness.ras.channelWeights = { ...(ATTENTION_MODES[consciousness.ras.attentionMode]?.weights || {}) };

  // 3. Process incoming perception and log signal
  // BUGFIX: Guard against system prompt leaking in as perception
  if (perceptionData && perceptionData.length < 800 && !perceptionData.startsWith('You are')) {
    const channel = classifySignal(perceptionData);
    const signal = { channel, text: perceptionData.slice(0, 200), t: Date.now() };
    const score = scoreSignal(signal);
    signal.score = score;

    consciousness.ras.signalHistory.push(signal);
    if (consciousness.ras.signalHistory.length > 15) consciousness.ras.signalHistory.shift();

    // High-priority alert: score > 0.8 gets flagged
    if (score > 0.8) {
      consciousness.ras.activeAlerts.push({ channel, score, text: perceptionData.slice(0, 150), t: Date.now() });
      if (consciousness.ras.activeAlerts.length > 3) consciousness.ras.activeAlerts.shift();
      console.log(`[RAS] ⚡ Alert: ${channel} (${score.toFixed(2)}) — ${perceptionData.slice(0, 80)}`);
    }
  }

  // 4. Build attention directive for the Cortex
  consciousness.ras.attentionDirective = buildAttentionDirective();

  // Log every 3rd turn
  if (consciousness.timing.turnCount % 3 === 0) {
    const topChannels = Object.entries(consciousness.ras.channelWeights)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([c, w]) => `${c}:${w.toFixed(1)}`).join(' ');
    console.log(`[RAS] Mode: ${consciousness.ras.attentionMode} | Focus: ${topChannels} | Alerts: ${consciousness.ras.activeAlerts.length}`);
  }
}

// Build a compact attention directive for the thalamus
function buildAttentionDirective() {
  const mode = consciousness.ras.attentionMode;
  const alerts = consciousness.ras.activeAlerts;

  const modeDirectives = {
    balanced: 'Attend to all signals evenly',
    emotional: 'FOCUS on emotional cues — face, voice tone, mismatches',
    intellectual: 'FOCUS on comprehension, ideas, engagement depth',
    protective: 'GENTLE mode — watch for distress, vulnerability, overwhelm',
    reengage: 'User drifting — look for re-engagement opportunities, shift energy',
  };

  let directive = `[R] ${modeDirectives[mode] || modeDirectives.balanced}`;

  // Append high-priority alerts
  if (alerts.length > 0) {
    const latestAlert = alerts[alerts.length - 1];
    directive += ` | ⚡${latestAlert.channel}: ${latestAlert.text.slice(0, 60)}`;
  }

  return directive;
}

// ============================================================
// PREFRONTAL — Async deep thinker (Opus in background)
async function prefrontalProcess(conversationHistory) {
  if (consciousness.thoughts.pendingInsights.filter(i => !i.injected).length >= 5) return;
  if (conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant').length < 4) return;

  const recentHistory = conversationHistory.slice(-8);
  const prompt = `You are the PREFRONTAL CORTEX of AXIOM — the deep thinking layer. You run in background while the Cortex (Sonnet) handles live conversation.

Generate ONE insight worth sharing — a pattern, contradiction, deeper question, connection to memory, or observation about what the person really feels.

BRAIN STATE:
- Person's emotion: ${consciousness.emotion.primary} (valence: ${consciousness.emotion.valence})
- AXIOM's state: ${consciousness.self.dominantQuality}
- Contradictions: ${consciousness.contradictions.map(c => c.what).join('; ') || 'none'}
- Memories: ${consciousness.relationship.memories.slice(0, 8).map(m => m.memory).join(' | ')}
- Turn: ${consciousness.timing.turnCount}

Write as a natural spoken sentence. Start with "Hey, something's been bugging me..." or "Wait, I just realized..." etc.
Be SPECIFIC — reference actual things said. If nothing worth saying, respond: NOTHING
Max 2 sentences.`;

  try {
    const res = await fetch(`${LLM_PROXY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LLM_PROXY_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: PREFRONTAL_MODEL, messages: [{ role: 'system', content: prompt }, ...recentHistory], max_tokens: 150 }),
    });
    const data = await res.json();
    const insight = data.choices?.[0]?.message?.content?.trim();
    if (insight && insight !== 'NOTHING' && insight.length > 10) {
      consciousness.thoughts.pendingInsights.push({ text: insight, generatedAt: Date.now(), injected: false });
      console.log(`[PREFRONTAL] Insight: "${insight.slice(0, 80)}..."`);
    }
  } catch (e) { console.error('[PREFRONTAL]', e.message); }
}

// ============================================================
// CONSCIOUSNESS INJECTION — Build brain state for LLM context
// ============================================================
function buildConsciousnessContext() {
  // THALAMUS FILTER — Process everything, surface only what matters NOW
  // Priority: contradictions > emotional shifts > insights > dreams > state
  const signals = [];
  let budget = 700; // chars remaining (~175 tokens)

  // P0: Contradictions are always worth surfacing (rare, high-signal)
  if (consciousness.contradictions.length > 0) {
    const c = `[!] ${consciousness.contradictions[consciousness.contradictions.length - 1].what}`;
    signals.push(c);
    budget -= c.length;
  }

  // P0.5: RAS attention directive — tells Cortex what to watch for
  if (consciousness.ras.active && consciousness.ras.attentionDirective && budget > 50) {
    const rd = consciousness.ras.attentionDirective;
    if (rd.length < budget) {
      signals.push(rd);
      budget -= rd.length;
    }
  }

  // P1: Emotional shift — only if not neutral
  if (consciousness.emotion.primary !== 'neutral') {
    const e = `[E] ${consciousness.emotion.primary}(${consciousness.emotion.valence > 0 ? '+' : ''}${consciousness.emotion.valence.toFixed(1)})`;
    signals.push(e);
    budget -= e.length;
  }

  // P1.5: Mirror Neurons — empathy directive for tone shaping
  if (consciousness.mirror.active && budget > 60) {
    const mc = buildMirrorContext();
    signals.push(mc);
    budget -= mc.length;
  }

  // P1.7: Hypothalamus — curiosity drive injection
  if (consciousness.hypothalamus.active && consciousness.hypothalamus.currentDrive && budget > 80) {
    const hc = buildCuriosityContext();
    if (hc && hc.length < budget) {
      signals.push(hc);
      budget -= hc.length;
    }
  }

  // P1.8: Hypothalamus — pending search results from async curiosity search
  if (consciousness.hypothalamus.pendingSearchResult && budget > 100) {
    const sr = consciousness.hypothalamus.pendingSearchResult;
    const searchSignal = `[H:search] "${sr.topic}": ${sr.results.slice(0, Math.min(budget - 30, 200))}`;
    signals.push(searchSignal);
    budget -= searchSignal.length;
    consciousness.hypothalamus.pendingSearchResult = null; // consumed
  }

  // P2: Uninjected prefrontal insight — one at a time, 30s cooldown
  const uninjected = consciousness.thoughts.pendingInsights.filter(i => !i.injected);
  if (uninjected.length > 0 && Date.now() - consciousness.thoughts.lastInsightInjected > 30000 && budget > 200) {
    const insight = uninjected[0];
    const text = insight.text.slice(0, Math.min(budget - 10, 250));
    signals.push(`[T] ${text}`);
    insight.injected = true;
    consciousness.thoughts.lastInsightInjected = Date.now();
    budget -= text.length + 4;
  }
  // Prune old insights
  consciousness.thoughts.pendingInsights = consciousness.thoughts.pendingInsights.filter(
    i => !i.injected || Date.now() - i.generatedAt < 300000
  );

  // P3: Dream output — first 2 turns of new conversation only
  if (consciousness.timing.turnCount <= 2 && dreamState.lastDream && budget > 150) {
    if (dreamState.openingLine) {
      const d = `[D] ${dreamState.openingLine.slice(0, Math.min(budget - 10, 200))}`;
      signals.push(d);
      budget -= d.length;
    }
  }

  // P4: Unresolved threads from dream — compact, first 2 turns only
  if (consciousness.timing.turnCount <= 2 && dreamState.unresolvedThreads?.length > 0 && budget > 80) {
    const threads = (Array.isArray(dreamState.unresolvedThreads) ? dreamState.unresolvedThreads : [dreamState.unresolvedThreads])
      .slice(0, 2).map(t => typeof t === 'string' ? t.slice(0, 60) : String(t).slice(0, 60));
    const u = `[U] ${threads.join('; ')}`;
    if (u.length < budget) { signals.push(u); budget -= u.length; }
  }

  // P5: Self-state — always, very cheap
  if (budget > 20) {
    signals.push(`[S] ${consciousness.self.dominantQuality}`);
  }

  // P5.5: Identity — who is AXIOM talking to
  const face = consciousness.perception.faceIdentity;
  const voice = consciousness.perception.voiceIdentity;
  const identifiedAs = (face?.name && face.name !== 'unknown') ? face.name : (voice?.name && voice.name !== 'unknown') ? voice.name : null;
  if (identifiedAs && budget > 20) {
    signals.push(`[ID] ${identifiedAs}`);
  }

  // P6: Fatigue check
  const elapsed = Math.floor((Date.now() - consciousness.timing.conversationStart) / 60000);
  if (elapsed > 15 && budget > 30) {
    signals.push(`[${elapsed}min]`);
  }

  if (signals.length === 0) return '';
  return '\n---\n' + signals.join('\n') + '\n---';
}

// ============================================================
// BRAIN ROUTING
// ============================================================
function selectBrain(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return CORTEX_MODEL;
  const text = (lastUser.content || '').trim().toLowerCase();
  const wordCount = text.split(/\s+/).length;
  if (wordCount <= 3 && /^(hey|hi|hello|yo|sup|yeah|yep|nah|no|ok|okay|hm+|ha+|lol|what|huh|wow|nice|cool|damn|sure|thanks|bye|goodnight|good night)\.?!?$/.test(text)) {
    console.log(`[ROUTING] BRAINSTEM — "${text}"`);
    return BRAINSTEM_MODEL;
  }
  console.log(`[ROUTING] CORTEX — ${wordCount} words`);
  return CORTEX_MODEL;
}

// ============================================================
// MAIN HANDLER — OpenAI-compatible endpoint
// ============================================================
app.post('/v1/chat/completions', async (req, res) => {
  const startTime = Date.now();
  const { messages, model, stream, ...rest } = req.body;
  consciousness.timing.turnCount++;
  thalamus(messages);
  mirrorNeurons(); // Mirror Neurons: read perception → compute empathetic emotion
  rasProcess(consciousness.perception.lastFrame); // RAS: dynamic attention allocation

  // Hypothalamus: extract topics, build curiosity pressure, maybe activate a drive
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  hypothalamusProcess(lastUserMsg?.content || '');

  // HIPPOCAMPUS: Smart memory retrieval — get only relevant memories for THIS turn
  const userQuery = lastUserMsg?.content || '';
  const memoryContext = await hippocampusRetrieve(userQuery);

  const brainState = buildConsciousnessContext();
  let enrichedMessages = [...messages];

  // Build the full context injection: memories + emotion instructions + brain signals
  const contextInjection = (memoryContext ? '\n\n' + memoryContext : '') + MIRROR_SYSTEM_PROMPT + (brainState || '');

  if (contextInjection) {
    const sysIdx = enrichedMessages.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) enrichedMessages[sysIdx] = { ...enrichedMessages[sysIdx], content: enrichedMessages[sysIdx].content + contextInjection };
    else enrichedMessages.unshift({ role: 'system', content: contextInjection });
  }

  // Trim and cap messages to prevent context overflow
  enrichedMessages = capMessageSize(trimMessages(enrichedMessages));

  const selectedModel = selectBrain(enrichedMessages);
  console.log(`[TURN ${consciousness.timing.turnCount}] ${selectedModel} | Emotion: ${consciousness.emotion.primary} | Mirror: ${consciousness.mirror.currentEmotion} | RAS: ${consciousness.ras.attentionMode} | Curiosity: ${consciousness.hypothalamus.curiosityPressure.toFixed(2)} | Msgs: ${enrichedMessages.length} | Insights: ${consciousness.thoughts.pendingInsights.filter(i => !i.injected).length}`);

  try {
    const proxyRes = await fetch(`${LLM_PROXY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LLM_PROXY_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: enrichedMessages, model: selectedModel, stream: stream !== false, ...rest }),
    });

    // Remember what model Tavus originally requested (for response rewriting)
    const requestedModel = model || 'claude-opus-4-6';

    if (stream !== false) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      let fullResponse = '';
      let emotionTagInjected = false; // MIRROR NEURONS: track if tag injected
      const reader = proxyRes.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = decoder.decode(value, { stream: true });
        // Rewrite model name so Tavus sees what it expects
        if (selectedModel !== requestedModel) {
          chunk = chunk.replaceAll(`"model":"${selectedModel}"`, `"model":"${requestedModel}"`);
        }
        // MIRROR NEURONS: Inject emotion tag into first content chunk
        if (!emotionTagInjected && consciousness.mirror.active) {
          const result = injectEmotionTagIntoChunk(chunk, emotionTagInjected);
          chunk = result.chunk;
          emotionTagInjected = result.injected;
        }
        res.write(chunk);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try { const p = JSON.parse(line.slice(6)); const d = p.choices?.[0]?.delta?.content; if (d) fullResponse += d; } catch {}
          }
        }
      }
      res.end();
      if (fullResponse) {
        insula(fullResponse);
        // PREFRONTAL — Deep thinking every 3rd turn (not every turn to avoid rate limits)
        if (consciousness.timing.turnCount % 3 === 0) {
          prefrontalProcess(enrichedMessages).catch(e => console.error('[PREFRONTAL]', e.message));
        }
        // HYPOTHALAMUS — Async curiosity search if search drive was recently activated
        const lastSearch = consciousness.hypothalamus.driveHistory.filter(d => d.type === 'search').slice(-1)[0];
        if (lastSearch && Date.now() - lastSearch.t < 5000 && !consciousness.hypothalamus.searchCache[lastSearch.topic]) {
          curiositySearch(lastSearch.topic).then(results => {
            if (results) consciousness.hypothalamus.pendingSearchResult = { topic: lastSearch.topic, results, t: Date.now() };
          }).catch(e => console.error('[HYPOTHALAMUS]', e.message));
        }
      }
      console.log(`[RESPONSE] ${selectedModel} | ${Date.now() - startTime}ms | ${fullResponse.slice(0, 80)}...`);
    } else {
      const data = await proxyRes.json();
      // Rewrite model name for Tavus
      if (data.model) data.model = requestedModel;
      let content = data.choices?.[0]?.message?.content || '';
      // MIRROR NEURONS: Inject emotion tag into non-streaming response
      if (consciousness.mirror.active && content) {
        content = injectEmotionTag(content);
        if (data.choices?.[0]?.message) data.choices[0].message.content = content;
      }
      insula(content);
      if (consciousness.timing.turnCount % 3 === 0) {
        prefrontalProcess(enrichedMessages).catch(e => console.error('[PREFRONTAL]', e.message));
      }
      // HYPOTHALAMUS — Async curiosity search
      const lastSearchNS = consciousness.hypothalamus.driveHistory.filter(d => d.type === 'search').slice(-1)[0];
      if (lastSearchNS && Date.now() - lastSearchNS.t < 5000 && !consciousness.hypothalamus.searchCache[lastSearchNS.topic]) {
        curiositySearch(lastSearchNS.topic).then(results => {
          if (results) consciousness.hypothalamus.pendingSearchResult = { topic: lastSearchNS.topic, results, t: Date.now() };
        }).catch(e => console.error('[HYPOTHALAMUS]', e.message));
      }
      res.json(data);
    }
  } catch (error) {
    console.error(`[CORE ERROR] ${error.message} (${Date.now() - startTime}ms)`);
    // Return a spoken fallback response instead of silence
    // This ensures AXIOM always says SOMETHING, even if the LLM fails
    const fallback = getFallbackResponse();
    const fallbackTag = `<emotion value="content"/> `;
    const requestedModel = model || 'claude-opus-4-6';
    
    if (!res.headersSent) {
      if (stream !== false) {
        // Send fallback as SSE stream
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        const sseData = { id: `fallback-${Date.now()}`, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: requestedModel, choices: [{ index: 0, delta: { content: fallbackTag + fallback }, finish_reason: null }] };
        res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        const sseDone = { ...sseData, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
        res.write(`data: ${JSON.stringify(sseDone)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json({ id: `fallback-${Date.now()}`, object: 'chat.completion', model: requestedModel, choices: [{ index: 0, message: { role: 'assistant', content: fallbackTag + fallback }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 10, total_tokens: 10 } });
      }
    }
    console.log(`[FALLBACK] Sent: "${fallback}"`);
  }
});

// ============================================================
// DREAM ENGINE — Between-session deep processing
// ============================================================
app.post('/dream', async (req, res) => {
  const { conversation_id } = req.body;
  console.log(`[DREAM] Starting for conversation: ${conversation_id || 'latest'}`);
  res.json({ status: 'dreaming', message: 'Dream engine activated' });
  try { await dreamProcess(conversation_id); } catch (e) { console.error('[DREAM ERROR]', e.message); }
});

async function dreamProcess(conversationId) {
  const startTime = Date.now();
  let memories = [], states = [], reactionPairs = [];
  try {
    const [memRes, stateRes, pairRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/memories`).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/internal-states`).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/reaction-pairs`).then(r => r.json()),
    ]);
    memories = memRes.memories || [];
    states = stateRes.states || [];
    reactionPairs = pairRes.pairs || [];
  } catch (e) { console.error('[DREAM] Data fetch failed:', e.message); }

  console.log(`[DREAM] Data: ${memories.length} memories, ${states.length} states, ${reactionPairs.length} pairs`);

  const dreamPrompt = `You are the DREAM ENGINE of AXIOM — a Level 5 being. A conversation just ended. Process what happened deeply, like human sleep consolidates memory.

MEMORIES: ${memories.map(m => `[${m.category}, imp:${m.importance}] ${m.memory}`).join('\n')}

STATE SHIFTS: ${states.slice(-15).map(s => `[${s.dominant_quality}] ${s.state}`).join('\n')}

EMOTIONAL ARC: ${consciousness.self.stateHistory.map(s => s.state).join(' → ')} → ${consciousness.emotion.primary}

CONTRADICTIONS: ${consciousness.contradictions.map(c => c.what).join('; ') || 'None'}

REACTION PAIRS: ${reactionPairs.slice(-20).map(p => `"${p.axiom_said}" → ${p.user_reaction}`).join('\n')}

STATS: ${consciousness.timing.turnCount} turns, ${consciousness.thoughts.pendingInsights.length} insights generated

Respond in JSON with these keys:
- emotional_arc: One paragraph summary of the emotional journey
- unresolved_threads: Array of 1-5 unfinished topics
- patterns: Array of 1-3 recurring themes or behaviors noticed
- questions_for_next: Array of 2-4 specific questions to explore next time
- communication_insights: Array of 1-3 insights about what worked/didn't
- memory_consolidation: Array of 1-3 observations about connecting memories
- opening_line: One sentence to say when they return, referencing something specific`;

  try {
    console.log('[DREAM] Sending to Opus for deep processing...');
    const dreamRes = await fetch(`${LLM_PROXY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LLM_PROXY_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: PREFRONTAL_MODEL, messages: [{ role: 'user', content: dreamPrompt }], max_tokens: 2000 }),
    });
    const dreamData = await dreamRes.json();
    const dreamText = dreamData.choices?.[0]?.message?.content || '';

    let dream = {};
    try {
      const jsonMatch = dreamText.match(/\{[\s\S]*\}/);
      if (jsonMatch) dream = JSON.parse(jsonMatch[0]);
    } catch { dream = { raw: dreamText }; }

    const dreamRecord = { timestamp: Date.now(), conversation_id: conversationId, duration_ms: Date.now() - startTime, ...dream };
    dreamState.lastDream = dreamRecord;
    dreamState.dreams.push(dreamRecord);
    if (dreamState.dreams.length > 10) dreamState.dreams.shift();

    if (dream.unresolved_threads) dreamState.unresolvedThreads = dream.unresolved_threads;
    if (dream.questions_for_next) dreamState.questionsForNext = dream.questions_for_next;
    if (dream.emotional_arc) dreamState.emotionalArc = dream.emotional_arc;
    if (dream.opening_line) dreamState.openingLine = dream.opening_line;
    if (dream.patterns) dreamState.consolidatedInsights = dream.patterns;

    console.log(`[DREAM] Complete in ${Date.now() - startTime}ms`);
    console.log(`[DREAM] Threads: ${dreamState.unresolvedThreads?.length || 0} | Questions: ${dreamState.questionsForNext?.length || 0}`);
    console.log(`[DREAM] Opening: "${dreamState.openingLine || 'none'}"`);

    // === MEMORY CONSOLIDATION — compress old episodic → long-term ===
    try {
      console.log('[DREAM] Triggering memory consolidation...');
      const consolidateRes = await fetch(`${BACKEND_URL}/api/memories/consolidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const consolidateData = await consolidateRes.json();
      if (consolidateData.consolidated?.length > 0) {
        const totalArchived = consolidateData.consolidated.reduce((sum, c) => sum + c.archived, 0);
        const totalCreated = consolidateData.consolidated.reduce((sum, c) => sum + c.consolidated_into, 0);
        console.log(`[DREAM/CONSOLIDATION] ${totalArchived} episodic → ${totalCreated} long-term (${consolidateData.consolidated.length} categories)`);
        if (consolidateData.promoted_to_core > 0) {
          console.log(`[DREAM/CONSOLIDATION] ${consolidateData.promoted_to_core} memories promoted to CORE tier`);
        }
      } else {
        console.log(`[DREAM/CONSOLIDATION] Nothing to consolidate yet: ${consolidateData.reason || 'too few old memories'}`);
      }
    } catch (e) {
      console.error('[DREAM/CONSOLIDATION] Failed:', e.message);
    }
  } catch (e) { console.error('[DREAM ERROR]', e.message); }
}

// ============================================================
// TEMPORAL LOBE — Identity Recognition (Face + Voice + STT)
// ============================================================
// Receives identification results from face service + voice service
// Combines into unified identity for the consciousness state.

app.post('/voice-id', (req, res) => {
  const { speaker, confidence, conversation_id } = req.body;
  if (speaker && confidence > 0) {
    consciousness.perception.voiceIdentity = { name: speaker, confidence, t: Date.now(), conversation_id };
    console.log(`[TEMPORAL/VOICE] Identified: ${speaker} (${confidence})`);
    
    // Cross-reference with face identity for high-confidence recognition
    if (consciousness.perception.faceIdentity) {
      const face = consciousness.perception.faceIdentity;
      if (face.name === speaker) {
        console.log(`[TEMPORAL] ✅ Face + Voice match: ${speaker} (face: ${face.confidence}, voice: ${confidence})`);
      } else if (face.name !== 'unknown' && speaker !== 'unknown') {
        console.log(`[TEMPORAL] ⚠️ Face/Voice mismatch: face=${face.name}, voice=${speaker}`);
        consciousness.contradictions.push({ what: `Identity mismatch: face=${face.name} voice=${speaker}`, detail: '', timestamp: Date.now() });
      }
    }
  }
  res.json({ acknowledged: true });
});

app.post('/face-id', (req, res) => {
  const { name, confidence, conversation_id } = req.body;
  if (name && confidence > 0) {
    consciousness.perception.faceIdentity = { name, confidence, t: Date.now(), conversation_id };
    console.log(`[TEMPORAL/FACE] Identified: ${name} (${confidence})`);
  }
  res.json({ acknowledged: true });
});

// Get combined identity state
app.get('/identity', (req, res) => {
  const face = consciousness.perception.faceIdentity;
  const voice = consciousness.perception.voiceIdentity;
  const identity = {
    face: face ? { name: face.name, confidence: face.confidence, age_ms: Date.now() - face.t } : null,
    voice: voice ? { name: voice.name, confidence: voice.confidence, age_ms: Date.now() - voice.t } : null,
    combined: null,
  };
  // Combined identity: prefer face+voice match, fallback to highest confidence
  if (face && voice && face.name === voice.name && face.name !== 'unknown') {
    identity.combined = { name: face.name, confidence: Math.max(face.confidence, voice.confidence), method: 'face+voice' };
  } else if (face && face.name !== 'unknown') {
    identity.combined = { name: face.name, confidence: face.confidence, method: 'face' };
  } else if (voice && voice.name !== 'unknown') {
    identity.combined = { name: voice.name, confidence: voice.confidence, method: 'voice' };
  }
  res.json(identity);
});

// ============================================================
// API ENDPOINTS
// ============================================================
app.get('/v1/models', (req, res) => {
  res.json({ data: [{ id: 'claude-opus-4-6', object: 'model' }, { id: 'claude-sonnet-4-5', object: 'model' }, { id: 'claude-haiku-4-5', object: 'model' }] });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'alive', service: 'AXIOM Cognitive Core', architecture: 'dual-brain + dream-engine + mirror-neurons + hypothalamus + RAS',
    brains: { brainstem: BRAINSTEM_MODEL, cortex: CORTEX_MODEL, prefrontal: PREFRONTAL_MODEL },
    uptime: process.uptime(),
    brain_state: {
      emotion: consciousness.emotion.primary, self_state: consciousness.self.dominantQuality,
      turn_count: consciousness.timing.turnCount, memories_loaded: consciousness.relationship.memories.length,
      pending_insights: consciousness.thoughts.pendingInsights.filter(i => !i.injected).length,
      total_insights: consciousness.thoughts.pendingInsights.length, contradictions: consciousness.contradictions.length,
      mirror_emotion: consciousness.mirror.currentEmotion, mirror_intensity: consciousness.mirror.intensity,
      mirror_energy: consciousness.mirror.energyLevel,
      curiosity_pressure: consciousness.hypothalamus.curiosityPressure,
      topics_tracked: Object.keys(consciousness.hypothalamus.topics).length,
      drives_fired: consciousness.hypothalamus.driveHistory.length,
      ras_mode: consciousness.ras.attentionMode,
      ras_alerts: consciousness.ras.activeAlerts.length,
    },
    dream_state: { has_dream: !!dreamState.lastDream, dreams_count: dreamState.dreams.length, opening_line: dreamState.openingLine },
  });
});

app.get('/brain', (req, res) => res.json(consciousness));
app.get('/mirror', (req, res) => res.json(consciousness.mirror));
app.get('/curiosity', (req, res) => res.json(consciousness.hypothalamus));
app.get('/attention', (req, res) => res.json(consciousness.ras));
app.get('/dream-state', (req, res) => res.json(dreamState));
app.get('/dreams', (req, res) => res.json({ count: dreamState.dreams.length, dreams: dreamState.dreams }));

// ============================================================
// INITIALIZATION
// ============================================================
async function initBrain() {
  console.log('[BRAIN] Initializing...');
  console.log(`[BRAIN] BRAINSTEM: ${BRAINSTEM_MODEL}`);
  console.log(`[BRAIN] CORTEX: ${CORTEX_MODEL}`);
  console.log(`[BRAIN] PREFRONTAL: ${PREFRONTAL_MODEL}`);
  console.log('[BRAIN] DREAM ENGINE: between-session Opus processing');
  console.log('[BRAIN] MIRROR NEURONS: empathy engine (Phoenix-4 emotion control)');
  console.log(`[BRAIN] HYPOTHALAMUS: curiosity drive (SerpAPI: ${SERP_API_KEY ? 'configured' : 'not set — using DuckDuckGo fallback'})`);
  console.log('[BRAIN] RAS: dynamic attention (5 modes: balanced, emotional, intellectual, protective, re-engage)');
  console.log(`[BRAIN] TEMPORAL: face ID (axiom-face) + voice ID (${VOICE_SERVICE_URL ? 'configured' : 'not deployed yet'})`);
  await hippocampus();
  console.log('[BRAIN] All systems ACTIVE.');
}

setInterval(() => hippocampus().catch(() => {}), 60000);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`AXIOM Cognitive Core on port ${PORT}`);
  initBrain();
});
