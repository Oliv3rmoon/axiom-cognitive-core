// lib/symbolic-verifier.js
//
// AXIOM Layer 3 — Symbolic Verification Engine (SVE)
//
// Runs alongside the LLM. Given a freshly-generated response, extracts
// verifiable claims, checks them for logical consistency, grounds them
// against AXIOM's world model + memory, checks consistency against
// conversation history, and returns a calibrated confidence report.
//
// Single-file ES module. No new npm dependencies — uses global `fetch`.
// See PRD-2-neuro-symbolic-reasoning.md for the full spec.

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const NEGATION_TOKENS = new Set([
  'not', "n't", 'no', 'never', 'none', 'cannot', "can't", "won't", "isn't",
  "aren't", "wasn't", "weren't", "doesn't", "don't", "didn't",
]);

const STOPWORDS = new Set([
  'the','a','an','of','to','in','on','at','for','and','or','but','is','are',
  'was','were','be','been','being','it','this','that','these','those','with',
  'as','by','from','into','about','than','then','so','if','while','because',
  'i','you','he','she','we','they','my','your','our','their','me','him','her',
  'us','them','do','does','did','have','has','had',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function contentTokens(text) {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function cosineCounts(a, b) {
  const ca = new Map();
  const cb = new Map();
  for (const t of a) ca.set(t, (ca.get(t) || 0) + 1);
  for (const t of b) cb.set(t, (cb.get(t) || 0) + 1);
  let dot = 0, na = 0, nb = 0;
  for (const [, v] of ca) na += v * v;
  for (const [, v] of cb) nb += v * v;
  for (const [k, v] of ca) if (cb.has(k)) dot += v * cb.get(k);
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function hasNegation(text) {
  const toks = tokenize(text);
  return toks.some((t) => NEGATION_TOKENS.has(t));
}

function allPairs(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++) out.push([arr[i], arr[j]]);
  return out;
}

function safeJsonArray(text) {
  if (!text) return null;
  // Strip code fences
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Claim Extractor — uses Haiku via LLM proxy, falls back to heuristic split
// ---------------------------------------------------------------------------

class ClaimExtractor {
  constructor({ llmProxyUrl, llmProxyKey, maxClaims = 20 } = {}) {
    this.llmProxyUrl = llmProxyUrl;
    this.llmProxyKey = llmProxyKey;
    this.maxClaims = maxClaims;
  }

  buildPrompt(response) {
    return `Extract all verifiable claims from this text as JSON.
Each claim should have: id, type (factual/causal/logical/temporal/comparative), text (verbatim),
subject, predicate, object, and any qualifiers.
Mark opinions and subjective statements as type "subjective" — these are not verified.
Only extract claims that could be checked for truth or logical validity.

Text: ${response}

Return ONLY valid JSON array.`;
  }

  async extract(responseText) {
    if (!responseText || !responseText.trim()) return [];

    if (this.llmProxyUrl) {
      try {
        const res = await fetch(this.llmProxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.llmProxyKey ? { Authorization: `Bearer ${this.llmProxyKey}` } : {}),
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages: [{ role: 'user', content: this.buildPrompt(responseText) }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text =
            data?.content?.[0]?.text ??
            data?.completion ??
            data?.message?.content ??
            data?.text ??
            '';
          const parsed = safeJsonArray(text);
          if (parsed) return this.normalize(parsed).slice(0, this.maxClaims);
        }
      } catch {
        // fall through to heuristic
      }
    }

    return this.heuristicExtract(responseText).slice(0, this.maxClaims);
  }

  normalize(rawClaims) {
    return rawClaims
      .map((c, i) => ({
        id: c.id || `c${i + 1}`,
        type: c.type || 'factual',
        text: c.text || '',
        subject: c.subject || '',
        predicate: c.predicate || '',
        object: c.object || '',
        temporal: c.temporal || null,
        qualifiers: c.qualifiers || null,
      }))
      .filter((c) => c.text && c.type !== 'subjective');
  }

  // Fallback: split on sentence boundaries, treat each as a factual claim.
  heuristicExtract(text) {
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return sentences.map((s, i) => ({
      id: `c${i + 1}`,
      type: 'factual',
      text: s,
      subject: '',
      predicate: '',
      object: '',
      temporal: null,
      qualifiers: null,
    }));
  }
}

// ---------------------------------------------------------------------------
// Logic Checker — contradictions, unsupported causal, temporal ordering
// ---------------------------------------------------------------------------

class LogicChecker {
  check(claims) {
    const issues = [];

    // 1. Contradiction detection via lexical overlap + negation polarity
    for (const [a, b] of allPairs(claims)) {
      if (this.contradicts(a, b)) {
        issues.push({
          type: 'contradiction',
          severity: 'high',
          claim_ids: [a.id, b.id],
          description: `"${a.text}" contradicts "${b.text}"`,
          suggestion: 'Acknowledge the tension or clarify the distinction',
        });
      }
    }

    // 2. Causal claims with no supporting context
    const causalClaims = claims.filter((c) => c.type === 'causal');
    for (const claim of causalClaims) {
      if (!this.hasSupportingEvidence(claim, claims)) {
        issues.push({
          type: 'unsupported_causal',
          severity: 'medium',
          claim_ids: [claim.id],
          description: `Causal claim "${claim.text}" lacks supporting evidence in response`,
          suggestion: 'Add "possibly" or "this might be because" hedging',
        });
      }
    }

    // 3. Temporal consistency — flag claims with decreasing chronology
    const temporal = claims
      .filter((c) => c.temporal)
      .map((c) => ({ c, year: this.parseYear(c.temporal) }))
      .filter((x) => x.year != null);
    for (let i = 1; i < temporal.length; i++) {
      const prev = temporal[i - 1];
      const cur = temporal[i];
      // If the narrative implies "before/after" ordering and years disagree,
      // that's suspicious. We only flag outright year duplicates on the same
      // subject with different predicates as low-severity noise.
      if (
        prev.c.subject &&
        prev.c.subject === cur.c.subject &&
        prev.year === cur.year &&
        prev.c.predicate !== cur.c.predicate
      ) {
        issues.push({
          type: 'temporal_overlap',
          severity: 'low',
          claim_ids: [prev.c.id, cur.c.id],
          description: `Two different events attributed to ${prev.c.subject} in ${prev.year}`,
          suggestion: 'Check whether both events really happened in the same year',
        });
      }
    }

    return issues;
  }

  contradicts(a, b) {
    if (!a.text || !b.text) return false;
    const ta = contentTokens(a.text);
    const tb = contentTokens(b.text);
    const overlap = jaccard(ta, tb);
    if (overlap < 0.4) return false; // not about the same thing
    // Same-subject, opposite polarity
    const negA = hasNegation(a.text);
    const negB = hasNegation(b.text);
    if (negA !== negB) return true;
    // Same subject+predicate, different object
    if (
      a.subject &&
      b.subject &&
      a.subject.toLowerCase() === b.subject.toLowerCase() &&
      a.predicate &&
      b.predicate &&
      a.predicate.toLowerCase() === b.predicate.toLowerCase() &&
      a.object &&
      b.object &&
      a.object.toLowerCase() !== b.object.toLowerCase()
    ) {
      return true;
    }
    return false;
  }

  hasSupportingEvidence(causalClaim, allClaims) {
    // A causal claim is "supported" if some other claim shares vocabulary
    // with its subject or object.
    const target = contentTokens(`${causalClaim.subject} ${causalClaim.object} ${causalClaim.text}`);
    if (target.length === 0) return true;
    for (const c of allClaims) {
      if (c.id === causalClaim.id) continue;
      const overlap = jaccard(target, contentTokens(c.text));
      if (overlap > 0.2) return true;
    }
    return false;
  }

  parseYear(temporal) {
    if (!temporal) return null;
    const m = String(temporal).match(/\b(\d{3,4})\b/);
    return m ? parseInt(m[1], 10) : null;
  }
}

// ---------------------------------------------------------------------------
// Fact Grounder — world model + episodic memory
// ---------------------------------------------------------------------------

class FactGrounder {
  constructor({ worldModelUrl, backendUrl } = {}) {
    this.worldModelUrl = worldModelUrl;
    this.backendUrl = backendUrl;
  }

  async ground(claims) {
    const factual = claims.filter((c) => c.type === 'factual');
    if (factual.length === 0) return [];

    const issues = [];
    const results = await Promise.all(
      factual.map((c) =>
        Promise.all([this.queryWorldModel(c), this.queryMemory(c)]).then(
          ([wm, mem]) => ({ claim: c, wm, mem })
        )
      )
    );

    for (const { claim, wm, mem } of results) {
      if (wm && wm.contradicts) {
        issues.push({
          type: 'factual_conflict',
          severity: 'high',
          claim_ids: [claim.id],
          description: `"${claim.text}" conflicts with known fact: "${wm.known_fact}"`,
          suggestion: 'Correct the fact or acknowledge uncertainty',
        });
      }
      if (mem && mem.contradicts_past) {
        issues.push({
          type: 'memory_conflict',
          severity: 'medium',
          claim_ids: [claim.id],
          description: `"${claim.text}" conflicts with what AXIOM previously said: "${mem.past_claim}"`,
          suggestion: 'Acknowledge the change in understanding',
        });
      }
    }

    return issues;
  }

  async queryWorldModel(claim) {
    if (!this.worldModelUrl) return null;
    try {
      const url = `${this.worldModelUrl.replace(/\/$/, '')}/world-model/query`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: claim.subject,
          predicate: claim.predicate,
          object: claim.object,
          text: claim.text,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      // Expected shape: { known_fact, matches, contradicts }
      return {
        contradicts: !!data.contradicts,
        known_fact: data.known_fact || '',
      };
    } catch {
      return null;
    }
  }

  async queryMemory(claim) {
    if (!this.backendUrl) return null;
    try {
      const q = encodeURIComponent(claim.text.slice(0, 200));
      const url = `${this.backendUrl.replace(/\/$/, '')}/api/memories?query=${q}&limit=5`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const memories = Array.isArray(data) ? data : data?.memories || [];
      // Compare claim text against each memory. If a memory is lexically
      // similar but has opposite polarity, flag as memory_conflict.
      const claimTokens = contentTokens(claim.text);
      const claimNeg = hasNegation(claim.text);
      for (const m of memories) {
        const mText = m.text || m.content || m.summary || '';
        if (!mText) continue;
        const mTokens = contentTokens(mText);
        const sim = jaccard(claimTokens, mTokens);
        if (sim > 0.5 && hasNegation(mText) !== claimNeg) {
          return { contradicts_past: true, past_claim: mText.slice(0, 200) };
        }
      }
      return { contradicts_past: false };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Consistency Checker — current response vs. conversation history
// ---------------------------------------------------------------------------

class ConsistencyChecker {
  check(responseText, conversationHistory = []) {
    const issues = [];
    if (!responseText || conversationHistory.length === 0) return issues;

    const curTokens = contentTokens(responseText);
    const curNeg = hasNegation(responseText);

    const priorAssistant = conversationHistory
      .filter((m) => m.role === 'assistant' && m.content)
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .filter(Boolean);

    for (const prior of priorAssistant) {
      const priorTokens = contentTokens(prior);
      const sim = cosineCounts(curTokens, priorTokens);
      if (sim > 0.55 && hasNegation(prior) !== curNeg) {
        issues.push({
          type: 'self_inconsistency',
          severity: 'medium',
          claim_ids: [],
          description:
            'Current response appears to take an opposing position to a prior turn in this conversation',
          suggestion: 'Acknowledge the change in stance or clarify the distinction',
        });
        break; // one is enough
      }
    }

    return issues;
  }
}

// ---------------------------------------------------------------------------
// Confidence Calibrator
// ---------------------------------------------------------------------------

class ConfidenceCalibrator {
  calibrate(claims, logicIssues, factIssues, consistencyIssues, config) {
    const all = [...logicIssues, ...factIssues, ...consistencyIssues];
    const high = all.filter((i) => i.severity === 'high').length;
    const med = all.filter((i) => i.severity === 'medium').length;

    let confidence = 1.0;
    confidence -= high * 0.3;
    confidence -= med * 0.1;
    confidence = Math.max(0.1, Math.min(1.0, confidence));

    const claimConfidence = {};
    for (const claim of claims) {
      const hit = all.filter((i) => (i.claim_ids || []).includes(claim.id));
      claimConfidence[claim.id] = hit.length === 0 ? 0.95 : 0.4;
    }

    return {
      overall_confidence: confidence,
      claim_confidence: claimConfidence,
      should_hedge: confidence < (config?.hedgingThreshold ?? 0.7),
      should_flag: high > 0 || confidence < (config?.flaggingThreshold ?? 0.5),
      hedging_suggestions: all.map((i) => i.suggestion).filter(Boolean),
    };
  }
}

// ---------------------------------------------------------------------------
// Hedging templates
// ---------------------------------------------------------------------------

const hedgingTemplates = {
  factual_conflict: [
    "I think {claim}, though I should note I'm not entirely certain about this.",
    "If I recall correctly, {claim} — but I'd want to double-check that.",
  ],
  contradiction: [
    'I realize I may be holding two perspectives here — {claim_a} and also {claim_b}. Let me think about which is more accurate.',
  ],
  unsupported_causal: [
    "This might be because {claim}, though I'm not sure of the exact causal relationship.",
  ],
  memory_conflict: [
    'I may have said something different before — {past_claim}. I want to be transparent that my understanding has shifted.',
  ],
  self_inconsistency: [
    "I notice this may be in tension with what I said earlier — I want to flag that my view here isn't fully settled.",
  ],
  temporal_overlap: [
    'I want to flag some uncertainty about the exact timing of these events.',
  ],
};

// ---------------------------------------------------------------------------
// SymbolicVerifier — the orchestrator
// ---------------------------------------------------------------------------

class SymbolicVerifier {
  constructor(opts = {}) {
    this.config = {
      enabled: true,
      minClaimsToVerify: 2,
      maxClaimsToExtract: 20,
      hedgingThreshold: 0.7,
      flaggingThreshold: 0.5,
      skipForEmotional: true,
      logAllVerifications: false,
      ...opts,
    };

    this.extractor = new ClaimExtractor({
      llmProxyUrl: opts.llmProxyUrl,
      llmProxyKey: opts.llmProxyKey,
      maxClaims: this.config.maxClaimsToExtract,
    });
    this.logicChecker = new LogicChecker();
    this.factGrounder = new FactGrounder({
      worldModelUrl: opts.worldModelUrl,
      backendUrl: opts.backendUrl,
    });
    this.consistencyChecker = new ConsistencyChecker();
    this.calibrator = new ConfidenceCalibrator();
  }

  async verify(responseText, context = {}) {
    const start = Date.now();

    const empty = (extra = {}) => ({
      valid: true,
      overall_confidence: 1.0,
      claims_extracted: 0,
      issues: [],
      should_hedge: false,
      should_flag: false,
      hedging_applied: [],
      latency_ms: Date.now() - start,
      ...extra,
    });

    if (!this.config.enabled) return empty({ skipped: 'disabled' });
    if (!responseText || !responseText.trim()) return empty({ skipped: 'empty_response' });
    if (this.config.skipForEmotional && this.isPurelyEmotional(responseText)) {
      return empty({ skipped: 'emotional' });
    }

    // 1. Extract claims
    const claims = await this.extractor.extract(responseText);

    if (claims.length < this.config.minClaimsToVerify) {
      return empty({ claims_extracted: claims.length, skipped: 'too_few_claims' });
    }

    // 2-4. Run checks (logic is sync; grounder + consistency can run in parallel)
    const logicIssues = this.logicChecker.check(claims);
    const [factIssues, consistencyIssues] = await Promise.all([
      this.factGrounder.ground(claims),
      Promise.resolve(
        this.consistencyChecker.check(responseText, context.conversationHistory || [])
      ),
    ]);

    // 5. Calibrate
    const cal = this.calibrator.calibrate(
      claims,
      logicIssues,
      factIssues,
      consistencyIssues,
      this.config
    );

    const issues = [...logicIssues, ...factIssues, ...consistencyIssues];

    const result = {
      valid: issues.filter((i) => i.severity === 'high').length === 0,
      overall_confidence: cal.overall_confidence,
      claim_confidence: cal.claim_confidence,
      claims_extracted: claims.length,
      claims,
      issues,
      should_hedge: cal.should_hedge,
      should_flag: cal.should_flag,
      hedging_applied: [],
      latency_ms: Date.now() - start,
    };

    if (this.config.logAllVerifications) {
      // eslint-disable-next-line no-console
      console.log('[SVE]', JSON.stringify({
        conf: result.overall_confidence,
        issues: result.issues.map((i) => i.type),
        latency: result.latency_ms,
      }));
    }

    return result;
  }

  // Very lightweight heuristic: responses that are short and rich in
  // affect words are treated as emotional and skipped.
  isPurelyEmotional(text) {
    if (text.length > 240) return false;
    const affect = /\b(sorry|love|hate|glad|happy|sad|angry|afraid|miss|hug|care|feel|felt|thank)\b/i;
    return affect.test(text) && !/\b(because|therefore|since|so that|which means)\b/i.test(text);
  }

  // Injects hedging language into the response based on the verification.
  // Strategy: append a single natural-sounding uncertainty note per unique
  // issue type, up to 2 notes. We avoid rewriting the original text.
  addHedging(responseText, verification) {
    if (!verification || !verification.should_hedge) return responseText;
    const applied = [];
    const seen = new Set();
    const notes = [];

    for (const issue of verification.issues) {
      if (seen.has(issue.type)) continue;
      const templates = hedgingTemplates[issue.type];
      if (!templates || templates.length === 0) continue;
      const template = templates[0];
      let note = template;

      if (issue.type === 'contradiction') {
        const [aId, bId] = issue.claim_ids || [];
        const a = verification.claims?.find((c) => c.id === aId);
        const b = verification.claims?.find((c) => c.id === bId);
        if (a && b) note = template.replace('{claim_a}', a.text).replace('{claim_b}', b.text);
      } else if (issue.type === 'memory_conflict') {
        const match = /previously said: "([^"]+)"/.exec(issue.description);
        if (match) note = template.replace('{past_claim}', match[1]);
      } else {
        const id = issue.claim_ids?.[0];
        const claim = id && verification.claims?.find((c) => c.id === id);
        if (claim) note = template.replace('{claim}', claim.text);
      }

      notes.push(note);
      applied.push(`${issue.type}: hedged`);
      seen.add(issue.type);
      if (notes.length >= 2) break;
    }

    verification.hedging_applied = applied;
    if (notes.length === 0) return responseText;
    return `${responseText.trim()}\n\n${notes.join(' ')}`;
  }
}

export default SymbolicVerifier;
export {
  SymbolicVerifier,
  ClaimExtractor,
  LogicChecker,
  FactGrounder,
  ConsistencyChecker,
  ConfidenceCalibrator,
  hedgingTemplates,
};
