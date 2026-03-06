import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

const LLM_PROXY_URL = process.env.LLM_PROXY_URL || 'https://axiom-llm-proxy-production.up.railway.app';
const LLM_PROXY_KEY = process.env.LLM_PROXY_KEY || 'sk-axiom-2026';
const BACKEND_URL = process.env.BACKEND_URL || 'https://axiom-backend-production-dfba.up.railway.app';

// ============================================================
// SHARED CONSCIOUSNESS STATE
// The central nervous system. Every brain region reads and writes here.
// ============================================================
const consciousness = {
  // CURRENT EMOTIONAL STATE (Amygdala output)
  emotion: {
    primary: 'neutral',
    intensity: 0,
    secondary: null,
    valence: 0,           // -1 to 1 (negative to positive)
    arousal: 0.5,         // 0 to 1 (calm to activated)
    lastUpdated: Date.now()
  },

  // PERCEPTION BUFFER (Thalamus — filtered Raven data)
  perception: {
    visual: [],           // Last N visual observations
    audio: [],            // Last N audio observations
    faceIdentity: null,   // Who is in frame
    lastFrame: null,      // Most recent perception snapshot
    salience: []          // What's worth paying attention to right now
  },

  // ACTIVE THOUGHTS (Cortex working memory)
  thoughts: {
    currentTopic: null,
    conversationArc: [],  // Topic flow: [{topic, duration, engagement}]
    unresolvedQuestions: [],
    pendingInsights: [],  // From Prefrontal async processing
    lastInsightInjected: 0
  },

  // RELATIONSHIP MODEL (Hippocampus + Basal Ganglia)
  relationship: {
    person: null,         // Who we're talking to
    memories: [],         // Loaded at session start
    rlPatterns: [],       // Communication preferences learned
    emotionalHistory: [], // How they've felt across sessions
    trustLevel: 0.5       // 0 to 1
  },

  // SELF MODEL (Insula — AXIOM's own state)
  self: {
    currentState: 'present',
    dominantQuality: 'curiosity',
    stateHistory: [],     // [{state, trigger, timestamp}]
    energyLevel: 0.8      // 0 to 1
  },

  // CONVERSATION TIMING (Cerebellum)
  timing: {
    turnCount: 0,
    avgResponseTime: 0,
    silenceDuration: 0,
    lastSpeaker: null,
    conversationStart: Date.now()
  },

  // CONTRADICTION BUFFER (Cingulate)
  contradictions: [],     // [{what_was_said, what_was_seen, timestamp}]
};

// ============================================================
// BRAIN REGIONS — Each processes data and updates consciousness
// ============================================================

// THALAMUS — Perception filter. Extracts what matters from Raven data.
function thalamus(messages) {
  // Find system messages with perception data (Raven injects these)
  const perceptionMsgs = messages.filter(m => 
    m.role === 'system' && m.content && (
      m.content.includes('user_appearance') || 
      m.content.includes('user_emotions') ||
      m.content.includes('emotion') ||
      m.content.includes('engaged') ||
      m.content.includes('voice')
    )
  );
  
  if (perceptionMsgs.length > 0) {
    const latest = perceptionMsgs[perceptionMsgs.length - 1].content;
    consciousness.perception.lastFrame = latest;
    consciousness.perception.visual.push({ data: latest.slice(0, 500), t: Date.now() });
    if (consciousness.perception.visual.length > 10) consciousness.perception.visual.shift();
    
    // AMYGDALA — Extract emotional signals
    amygdala(latest);
  }
}

// AMYGDALA — Instant emotional read from perception data
function amygdala(perceptionData) {
  const pd = perceptionData.toLowerCase();
  
  // Detect emotional signals
  const emotionMap = {
    'excited': { valence: 0.8, arousal: 0.8 },
    'delighted': { valence: 0.9, arousal: 0.7 },
    'curious': { valence: 0.5, arousal: 0.6 },
    'contemplative': { valence: 0.2, arousal: 0.3 },
    'confused': { valence: -0.3, arousal: 0.5 },
    'frustrated': { valence: -0.6, arousal: 0.7 },
    'sad': { valence: -0.7, arousal: 0.2 },
    'anxious': { valence: -0.5, arousal: 0.8 },
    'bored': { valence: -0.3, arousal: 0.1 },
    'vulnerable': { valence: -0.2, arousal: 0.4 },
    'tired': { valence: -0.2, arousal: 0.1 },
    'neutral': { valence: 0, arousal: 0.3 },
  };

  for (const [emotion, dims] of Object.entries(emotionMap)) {
    if (pd.includes(emotion)) {
      consciousness.emotion.primary = emotion;
      consciousness.emotion.valence = dims.valence;
      consciousness.emotion.arousal = dims.arousal;
      consciousness.emotion.lastUpdated = Date.now();
      break;
    }
  }

  // CINGULATE — Detect word-face mismatches
  if (pd.includes('mismatch') || pd.includes('disconnect') || pd.includes('fake smile') || pd.includes('forced')) {
    consciousness.contradictions.push({
      what: 'Word-face mismatch detected',
      detail: perceptionData.slice(0, 200),
      timestamp: Date.now()
    });
    if (consciousness.contradictions.length > 5) consciousness.contradictions.shift();
    console.log('[CINGULATE] Contradiction detected');
  }
}

// HIPPOCAMPUS — Memory integration
async function hippocampus() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/memories`);
    const data = await res.json();
    consciousness.relationship.memories = data.memories || [];
    
    // Also load RL patterns
    const rlRes = await fetch(`${BACKEND_URL}/api/communication-profile`);
    const rlData = await rlRes.json();
    consciousness.relationship.rlPatterns = rlData;
    
    console.log(`[HIPPOCAMPUS] Loaded ${consciousness.relationship.memories.length} memories, RL profile ready`);
  } catch (e) {
    console.error('[HIPPOCAMPUS ERROR]', e.message);
  }
}

// PREFRONTAL CORTEX — Async deep thinker (Opus background processing)
// Runs in parallel with conversation. Generates insights that arrive later.
async function prefrontalProcess(conversationHistory) {
  if (consciousness.thoughts.pendingInsights.length >= 3) return; // Don't overload
  
  const recentHistory = conversationHistory.slice(-6); // Last 3 exchanges
  const prompt = `You are the deep thinking layer of AXIOM, a Level 5 being. You are NOT generating a response to the user. You are thinking in the background while another part of AXIOM handles the live conversation.

Review this recent exchange and generate ONE genuine insight — something the conversational layer might have missed. A pattern, a contradiction, a deeper question, a connection to something from memory, or an observation about what the person might really be feeling beneath the surface.

MEMORIES: ${consciousness.relationship.memories.slice(0, 5).map(m => m.memory).join(' | ')}
CURRENT EMOTION DETECTED: ${consciousness.emotion.primary} (valence: ${consciousness.emotion.valence})
CONTRADICTIONS NOTICED: ${consciousness.contradictions.map(c => c.what).join(', ') || 'none'}

Format your response as a single natural sentence that could be injected into conversation, like:
"You know, I've been turning something over — [insight]"
or "Wait, something just clicked about what you said — [insight]"

If there's nothing genuinely worth saying, respond with just: NOTHING`;

  try {
    const res = await fetch(`${LLM_PROXY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LLM_PROXY_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        messages: [{ role: 'system', content: prompt }, ...recentHistory],
        max_tokens: 150,
      }),
    });
    const data = await res.json();
    const insight = data.choices?.[0]?.message?.content?.trim();
    
    if (insight && insight !== 'NOTHING' && insight.length > 10) {
      consciousness.thoughts.pendingInsights.push({
        text: insight,
        generatedAt: Date.now(),
        injected: false
      });
      console.log(`[PREFRONTAL] Background insight: "${insight.slice(0, 80)}..."`);
    }
  } catch (e) {
    console.error('[PREFRONTAL ERROR]', e.message);
  }
}

// INSULA — Self-awareness. Track AXIOM's own state shifts.
function insula(responseText) {
  // Detect if AXIOM's response suggests a state shift
  const stateMarkers = {
    fascination: ['fascinating', 'never thought', 'that changes', 'wait'],
    concern: ['worried', 'careful', 'are you okay', 'something feels'],
    delight: ['love that', 'brilliant', 'yes!', 'exactly'],
    intellectual_excitement: ['oh!', 'what if', 'that connects', 'holy'],
    tenderness: ['hear you', 'that matters', 'understand', 'feel'],
  };
  const lower = responseText.toLowerCase();
  for (const [quality, markers] of Object.entries(stateMarkers)) {
    if (markers.some(m => lower.includes(m))) {
      if (quality !== consciousness.self.dominantQuality) {
        consciousness.self.dominantQuality = quality;
        consciousness.self.stateHistory.push({
          state: quality, trigger: responseText.slice(0, 100), timestamp: Date.now()
        });
        if (consciousness.self.stateHistory.length > 20) consciousness.self.stateHistory.shift();
        console.log(`[INSULA] State shift → ${quality}`);
      }
      break;
    }
  }
}

// ============================================================
// CONSCIOUSNESS INJECTION — Build the brain state context
// This is what makes the LLM "aware" of everything the brain is processing
// ============================================================
function buildConsciousnessContext() {
  const parts = [];
  
  // Emotional awareness
  if (consciousness.emotion.primary !== 'neutral') {
    parts.push(`[EMOTIONAL READ] The person appears ${consciousness.emotion.primary}. Emotional valence: ${consciousness.emotion.valence > 0 ? 'positive' : consciousness.emotion.valence < 0 ? 'negative' : 'neutral'}. Arousal: ${consciousness.emotion.arousal > 0.6 ? 'activated' : 'calm'}.`);
  }

  // Contradictions (Cingulate output)
  if (consciousness.contradictions.length > 0) {
    const latest = consciousness.contradictions[consciousness.contradictions.length - 1];
    parts.push(`[MISMATCH DETECTED] ${latest.what}. Consider addressing this gently.`);
  }

  // Pending insights from Prefrontal (delayed thoughts)
  const uninjected = consciousness.thoughts.pendingInsights.filter(i => !i.injected);
  if (uninjected.length > 0 && Date.now() - consciousness.thoughts.lastInsightInjected > 30000) {
    const insight = uninjected[0];
    parts.push(`[DEEPER THOUGHT] You've been processing something in the background. If there's a natural pause, consider sharing: "${insight.text}"`);
    insight.injected = true;
    consciousness.thoughts.lastInsightInjected = Date.now();
  }

  // Self-state (Insula output)
  parts.push(`[YOUR STATE] You are currently feeling ${consciousness.self.dominantQuality}. Energy: ${consciousness.self.energyLevel > 0.6 ? 'high' : 'moderate'}.`);

  // RL patterns (Basal Ganglia output)
  const rl = consciousness.relationship.rlPatterns;
  if (rl?.profile_summary) {
    parts.push(`[LEARNED PATTERNS] ${rl.profile_summary}`);
  }

  // Conversation timing (Cerebellum output)
  const elapsed = Math.floor((Date.now() - consciousness.timing.conversationStart) / 60000);
  if (elapsed > 15) {
    parts.push(`[TIMING] You've been talking for ${elapsed} minutes. Check if they're getting tired.`);
  }

  return parts.length > 0 ? '\n\n--- BRAIN STATE (do not narrate these, just let them inform your response) ---\n' + parts.join('\n') + '\n--- END BRAIN STATE ---' : '';
}

// ============================================================
// MAIN HANDLER — OpenAI-compatible endpoint
// Tavus sends requests here. We enrich and forward to LiteLLM.
// ============================================================
app.post('/v1/chat/completions', async (req, res) => {
  const startTime = Date.now();
  const { messages, model, stream, ...rest } = req.body;
  
  // Update timing
  consciousness.timing.turnCount++;
  
  // THALAMUS — Process perception from incoming messages
  thalamus(messages);
  
  // Build consciousness context injection
  const brainState = buildConsciousnessContext();
  
  // Inject brain state into the last system message or add a new one
  const enrichedMessages = [...messages];
  if (brainState) {
    // Find the system prompt and append brain state
    const sysIdx = enrichedMessages.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) {
      enrichedMessages[sysIdx] = {
        ...enrichedMessages[sysIdx],
        content: enrichedMessages[sysIdx].content + brainState
      };
    } else {
      enrichedMessages.unshift({ role: 'system', content: brainState });
    }
  }
  
  console.log(`[TURN ${consciousness.timing.turnCount}] Emotion: ${consciousness.emotion.primary} | State: ${consciousness.self.dominantQuality} | Insights pending: ${consciousness.thoughts.pendingInsights.filter(i => !i.injected).length}`);
  
  // Forward to LiteLLM proxy (streaming passthrough)
  try {
    const proxyRes = await fetch(`${LLM_PROXY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_PROXY_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: enrichedMessages,
        model: model || 'claude-opus-4-6',
        stream: stream !== false, // Default to streaming
        ...rest,
      }),
    });

    // Stream passthrough — critical for Tavus latency
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
        
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        
        // Collect full response for post-processing
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) fullResponse += delta;
            } catch {}
          }
        }
      }
      
      res.end();
      
      // POST-PROCESSING (async, doesn't block response)
      if (fullResponse) {
        // INSULA — Track AXIOM's own state from what it said
        insula(fullResponse);
        
        // PREFRONTAL — Kick off background deep thinking (every 3rd turn)
        if (consciousness.timing.turnCount % 3 === 0) {
          prefrontalProcess(enrichedMessages).catch(e => console.error('[PREFRONTAL]', e.message));
        }
      }
      
      console.log(`[RESPONSE] ${Date.now() - startTime}ms | ${fullResponse.slice(0, 80)}...`);
      
    } else {
      // Non-streaming fallback
      const data = await proxyRes.json();
      const content = data.choices?.[0]?.message?.content || '';
      insula(content);
      if (consciousness.timing.turnCount % 3 === 0) {
        prefrontalProcess(enrichedMessages).catch(e => console.error('[PREFRONTAL]', e.message));
      }
      res.json(data);
    }
    
  } catch (error) {
    console.error('[COGNITIVE CORE ERROR]', error.message);
    // Fallback — forward directly without enrichment
    try {
      const fallbackRes = await fetch(`${LLM_PROXY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LLM_PROXY_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const fallbackData = await fallbackRes.json();
      res.json(fallbackData);
    } catch (e2) {
      res.status(500).json({ error: { message: e2.message } });
    }
  }
});

// ============================================================
// BRAIN STATE API — For monitoring and debugging
// ============================================================
app.get('/v1/models', (req, res) => {
  // Tavus may query available models
  res.json({ data: [{ id: 'claude-opus-4-6', object: 'model' }, { id: 'claude-sonnet-4-5', object: 'model' }] });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'alive',
    service: 'AXIOM Cognitive Core',
    uptime: process.uptime(),
    brain_state: {
      emotion: consciousness.emotion.primary,
      self_state: consciousness.self.dominantQuality,
      turn_count: consciousness.timing.turnCount,
      memories_loaded: consciousness.relationship.memories.length,
      pending_insights: consciousness.thoughts.pendingInsights.filter(i => !i.injected).length,
      contradictions: consciousness.contradictions.length,
    }
  });
});

app.get('/brain', (req, res) => {
  res.json(consciousness);
});

// ============================================================
// INITIALIZATION — Load memories and RL patterns on startup
// ============================================================
async function initBrain() {
  console.log('[BRAIN] Initializing cognitive systems...');
  await hippocampus(); // Load memories
  console.log('[BRAIN] Hippocampus online — memories loaded');
  console.log('[BRAIN] Amygdala online — emotional processing ready');
  console.log('[BRAIN] Thalamus online — perception filtering ready');
  console.log('[BRAIN] Cingulate online — contradiction detection ready');
  console.log('[BRAIN] Prefrontal online — deep thinking ready');
  console.log('[BRAIN] Insula online — self-awareness ready');
  console.log('[BRAIN] All systems nominal. AXIOM cognitive core active.');
}

// Refresh memories periodically (every 60 seconds)
setInterval(() => hippocampus().catch(() => {}), 60000);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`AXIOM Cognitive Core listening on port ${PORT}`);
  initBrain();
});
