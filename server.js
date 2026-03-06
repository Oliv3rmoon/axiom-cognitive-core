import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

const LLM_PROXY_URL = process.env.LLM_PROXY_URL || 'https://axiom-llm-proxy-production.up.railway.app';
const LLM_PROXY_KEY = process.env.LLM_PROXY_KEY || 'sk-axiom-2026';
const BACKEND_URL = process.env.BACKEND_URL || 'https://axiom-backend-production-dfba.up.railway.app';

// DUAL BRAIN CONFIGURATION
const CORTEX_MODEL = 'claude-sonnet-4-5';
const PREFRONTAL_MODEL = 'claude-opus-4-6';
const BRAINSTEM_MODEL = 'claude-haiku-4-5';
console.log('[BOOT] AXIOM Cognitive Core — dual-brain + dream engine');

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
  perception: { visual: [], audio: [], faceIdentity: null, lastFrame: null, salience: [] },
  thoughts: { currentTopic: null, conversationArc: [], unresolvedQuestions: [], pendingInsights: [], lastInsightInjected: 0 },
  relationship: { person: null, memories: [], rlPatterns: [], emotionalHistory: [], trustLevel: 0.5 },
  self: { currentState: 'present', dominantQuality: 'curiosity', stateHistory: [], energyLevel: 0.8 },
  timing: { turnCount: 0, avgResponseTime: 0, silenceDuration: 0, lastSpeaker: null, conversationStart: Date.now() },
  contradictions: [],
};

// ============================================================
// BRAIN REGIONS
// ============================================================
function thalamus(messages) {
  const perceptionMsgs = messages.filter(m =>
    m.role === 'system' && m.content && (m.content.includes('user_appearance') || m.content.includes('emotion') || m.content.includes('engaged') || m.content.includes('voice'))
  );
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
    console.log(`[HIPPOCAMPUS] ${consciousness.relationship.memories.length} memories, RL profile loaded`);
  } catch (e) { console.error('[HIPPOCAMPUS]', e.message); }
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
  const parts = [];

  if (consciousness.emotion.primary !== 'neutral') {
    parts.push(`[EMOTIONAL READ] Person appears ${consciousness.emotion.primary}. Valence: ${consciousness.emotion.valence > 0 ? 'positive' : 'negative'}. Arousal: ${consciousness.emotion.arousal > 0.6 ? 'activated' : 'calm'}.`);
  }
  if (consciousness.contradictions.length > 0) {
    parts.push(`[MISMATCH] ${consciousness.contradictions[consciousness.contradictions.length - 1].what}. Address gently.`);
  }

  // Pending Prefrontal insights
  const uninjected = consciousness.thoughts.pendingInsights.filter(i => !i.injected);
  if (uninjected.length > 0 && Date.now() - consciousness.thoughts.lastInsightInjected > 30000) {
    const insight = uninjected[0];
    parts.push(`[DEEPER THOUGHT] Share this naturally: "${insight.text}"`);
    insight.injected = true;
    consciousness.thoughts.lastInsightInjected = Date.now();
  }

  parts.push(`[YOUR STATE] Feeling ${consciousness.self.dominantQuality}. Energy: ${consciousness.self.energyLevel > 0.6 ? 'high' : 'moderate'}.`);

  const rl = consciousness.relationship.rlPatterns;
  if (rl?.profile_summary) parts.push(`[LEARNED PATTERNS] ${rl.profile_summary}`);

  const elapsed = Math.floor((Date.now() - consciousness.timing.conversationStart) / 60000);
  if (elapsed > 15) parts.push(`[TIMING] ${elapsed} minutes in. Check if they're tired.`);

  // DREAM ENGINE — inject between-session insights at conversation start
  if (consciousness.timing.turnCount <= 2 && dreamState.lastDream) {
    if (dreamState.openingLine) parts.push(`[DREAM INSIGHT] You processed the last conversation. Consider: "${dreamState.openingLine}"`);
    if (dreamState.unresolvedThreads?.length > 0) {
      const t = Array.isArray(dreamState.unresolvedThreads) ? dreamState.unresolvedThreads.join('; ') : dreamState.unresolvedThreads;
      parts.push(`[UNRESOLVED FROM LAST TIME] ${t}`);
    }
    if (dreamState.questionsForNext?.length > 0) {
      const q = Array.isArray(dreamState.questionsForNext) ? dreamState.questionsForNext.join('; ') : dreamState.questionsForNext;
      parts.push(`[QUESTIONS TO ASK] ${q}`);
    }
    if (dreamState.consolidatedInsights?.length > 0) {
      const ins = Array.isArray(dreamState.consolidatedInsights) ? dreamState.consolidatedInsights.join('; ') : dreamState.consolidatedInsights;
      parts.push(`[PATTERNS] ${ins}`);
    }
    if (dreamState.emotionalArc) parts.push(`[LAST SESSION ARC] ${dreamState.emotionalArc}`);
  }

  return parts.length > 0 ? '\n\n--- BRAIN STATE (do not narrate these, just let them inform your response) ---\n' + parts.join('\n') + '\n--- END BRAIN STATE ---' : '';
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

  const brainState = buildConsciousnessContext();
  const enrichedMessages = [...messages];
  if (brainState) {
    const sysIdx = enrichedMessages.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) enrichedMessages[sysIdx] = { ...enrichedMessages[sysIdx], content: enrichedMessages[sysIdx].content + brainState };
    else enrichedMessages.unshift({ role: 'system', content: brainState });
  }

  const selectedModel = selectBrain(enrichedMessages);
  console.log(`[TURN ${consciousness.timing.turnCount}] ${selectedModel} | Emotion: ${consciousness.emotion.primary} | Insights: ${consciousness.thoughts.pendingInsights.filter(i => !i.injected).length}`);

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
      }
      console.log(`[RESPONSE] ${selectedModel} | ${Date.now() - startTime}ms | ${fullResponse.slice(0, 80)}...`);
    } else {
      const data = await proxyRes.json();
      // Rewrite model name for Tavus
      if (data.model) data.model = requestedModel;
      const content = data.choices?.[0]?.message?.content || '';
      insula(content);
      if (consciousness.timing.turnCount % 3 === 0) {
        prefrontalProcess(enrichedMessages).catch(e => console.error('[PREFRONTAL]', e.message));
      }
      res.json(data);
    }
  } catch (error) {
    console.error('[CORE ERROR]', error.message);
    try {
      const fb = await fetch(`${LLM_PROXY_URL}/v1/chat/completions`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${LLM_PROXY_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const fbData = await fb.json();
      res.json(fbData);
    } catch (e2) { res.status(500).json({ error: { message: e2.message } }); }
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
  } catch (e) { console.error('[DREAM ERROR]', e.message); }
}

// ============================================================
// API ENDPOINTS
// ============================================================
app.get('/v1/models', (req, res) => {
  res.json({ data: [{ id: 'claude-opus-4-6', object: 'model' }, { id: 'claude-sonnet-4-5', object: 'model' }, { id: 'claude-haiku-4-5', object: 'model' }] });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'alive', service: 'AXIOM Cognitive Core', architecture: 'dual-brain + dream-engine',
    brains: { brainstem: BRAINSTEM_MODEL, cortex: CORTEX_MODEL, prefrontal: PREFRONTAL_MODEL },
    uptime: process.uptime(),
    brain_state: {
      emotion: consciousness.emotion.primary, self_state: consciousness.self.dominantQuality,
      turn_count: consciousness.timing.turnCount, memories_loaded: consciousness.relationship.memories.length,
      pending_insights: consciousness.thoughts.pendingInsights.filter(i => !i.injected).length,
      total_insights: consciousness.thoughts.pendingInsights.length, contradictions: consciousness.contradictions.length,
    },
    dream_state: { has_dream: !!dreamState.lastDream, dreams_count: dreamState.dreams.length, opening_line: dreamState.openingLine },
  });
});

app.get('/brain', (req, res) => res.json(consciousness));
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
  await hippocampus();
  console.log('[BRAIN] All systems ACTIVE.');
}

setInterval(() => hippocampus().catch(() => {}), 60000);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`AXIOM Cognitive Core on port ${PORT}`);
  initBrain();
});
