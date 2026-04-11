// lib/metacognitive-monitor.js
//
// AXIOM Layer 5 — Metacognitive Monitor (MCM)
//
// Executive function: watches the rest of AXIOM's cognition each turn and
// emits confidence calibration, bias alerts, resource allocation, and
// corrective actions. Designed to be called after the LLM response is
// produced and before delivery. Reads signals from every brain region;
// writes to `consciousness.metacognition`.
//
// Single-file ES module. No new npm dependencies.
// See PRD-3-metacognitive-monitor.md for the full spec.

// ---------------------------------------------------------------------------
// 1. ConfidenceCalibrator
// ---------------------------------------------------------------------------

class ConfidenceCalibrator {
  constructor() {
    this.calibrationHistory = []; // [{ predicted, actual }]
    this.plattParams = { a: 1.0, b: 0.0 };
  }

  estimate(signals) {
    const rawSignals = {
      verifierConfidence: signals.verifierResult?.overall_confidence ?? 0.8,
      issueCount: signals.verifierResult?.issues?.length ?? 0,

      hedgingLanguage: this.detectHedging(signals.responseText),
      responseLength: signals.responseText?.length ?? 0,
      questionComplexity: this.assessComplexity(signals.userMessage),

      memoryGrounding:
        signals.memoriesUsed && signals.memoriesUsed.length > 0 ? 0.85 : 0.6,

      topicFamiliarity: this.assessFamiliarity(
        signals.topic,
        signals.conversationHistory
      ),
      turnDepth: Math.min((signals.turnCount ?? 0) / 20, 1.0),

      userEngagement:
        signals.perception?.interpretation?.engagement_level ?? 0.5,
    };

    const weights = {
      verifierConfidence: 0.35,
      hedgingLanguage: 0.15,
      memoryGrounding: 0.15,
      topicFamiliarity: 0.15,
      questionComplexity: 0.1,
      userEngagement: 0.1,
    };

    let rawConfidence = 0;
    for (const [key, weight] of Object.entries(weights)) {
      rawConfidence += (rawSignals[key] ?? 0.5) * weight;
    }

    // Platt scaling calibration. We bias the logistic around 0.5 so that a
    // raw score of 0.5 maps near 0.5 when params are at their defaults.
    const z = this.plattParams.a * (rawConfidence - 0.5) + this.plattParams.b;
    const calibrated = 1 / (1 + Math.exp(-z * 4)); // gain of 4 → usable range

    return {
      raw: Math.round(rawConfidence * 100) / 100,
      calibrated: Math.round(calibrated * 100) / 100,
      signals: rawSignals,
      category: calibrated > 0.85 ? 'high' : calibrated > 0.6 ? 'medium' : 'low',
    };
  }

  detectHedging(text) {
    if (!text) return 0.5;
    const hedgeWords = [
      'maybe', 'perhaps', 'might', 'could be', 'i think', 'not sure',
      'i believe', 'possibly', 'it seems', 'approximately',
    ];
    const lower = text.toLowerCase();
    const matches = hedgeWords.filter((w) => lower.includes(w)).length;
    return Math.max(0, 1 - matches * 0.15);
  }

  assessComplexity(message) {
    if (!message) return 0.5;
    const abstractWords = [
      'consciousness', 'meaning', 'truth', 'existence', 'morality',
      'infinity', 'paradox', 'philosophy', 'metaphysics',
    ];
    const lower = message.toLowerCase();
    const hasAbstract = abstractWords.some((w) => lower.includes(w));
    return hasAbstract ? 0.5 : 0.8;
  }

  assessFamiliarity(topic, history) {
    if (!topic || !history) return 0.5;
    const lowerTopic = topic.toLowerCase();
    const mentions = history.filter((m) => {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.toLowerCase().includes(lowerTopic);
    }).length;
    return Math.min(0.5 + mentions * 0.1, 0.95);
  }

  recordOutcome(predictedConfidence, wasAccurate) {
    this.calibrationHistory.push({
      predicted: predictedConfidence,
      actual: wasAccurate ? 1 : 0,
    });
    if (this.calibrationHistory.length > 100) {
      this.calibrationHistory = this.calibrationHistory.slice(-100);
    }
    this.updatePlattParams();
  }

  updatePlattParams() {
    if (this.calibrationHistory.length < 20) return;
    const preds = this.calibrationHistory.map((h) => h.predicted);
    const actuals = this.calibrationHistory.map((h) => h.actual);
    const avgPred = preds.reduce((a, b) => a + b, 0) / preds.length;
    const avgActual = actuals.reduce((a, b) => a + b, 0) / actuals.length;
    this.plattParams.b = avgActual - avgPred;
  }
}

// ---------------------------------------------------------------------------
// 2. BiasDetector
// ---------------------------------------------------------------------------

class BiasDetector {
  constructor() {
    this.recentResponses = [];
    this.agreementRate = [];
    this.emotionInfluence = [];
  }

  detect(signals) {
    const biases = [];

    // 1. SYCOPHANCY
    if (signals.responseText && signals.userMessage) {
      const isAgreement = this.isAgreeing(signals.responseText);
      this.agreementRate.push(isAgreement ? 1 : 0);
      if (this.agreementRate.length > 20) {
        this.agreementRate = this.agreementRate.slice(-20);
      }

      const recentAgreementRate =
        this.agreementRate.reduce((a, b) => a + b, 0) / this.agreementRate.length;

      if (recentAgreementRate > 0.85 && this.agreementRate.length >= 10) {
        biases.push({
          type: 'sycophancy',
          severity: 'medium',
          description: `Agreement rate is ${(recentAgreementRate * 100).toFixed(0)}% over last ${this.agreementRate.length} turns. Consider pushing back or offering alternative perspectives.`,
          suggestion: 'Insert genuine disagreement or alternative viewpoint',
          metric: recentAgreementRate,
        });
      }
    }

    // 2. RECENCY BIAS
    if (Array.isArray(signals.memoriesUsed) && signals.memoriesUsed.length > 0) {
      const now = Date.now();
      const day = 24 * 3600 * 1000;
      const recentMemories = signals.memoriesUsed.filter((m) => {
        const ts = m?.created_at ? new Date(m.created_at).getTime() : 0;
        return ts && now - ts < day;
      });
      const recencyRatio = recentMemories.length / signals.memoriesUsed.length;
      if (recencyRatio > 0.8 && signals.memoriesUsed.length > 3) {
        biases.push({
          type: 'recency_bias',
          severity: 'low',
          description: `${(recencyRatio * 100).toFixed(0)}% of cited memories are from the last 24 hours. Older context may be relevant.`,
          suggestion: 'Consider searching for older related memories',
          metric: recencyRatio,
        });
      }
    }

    // 3. EMOTIONAL CONTAMINATION
    if (signals.currentEmotion && (signals.emotionIntensity ?? 0) > 0.7) {
      const emotionalWords = this.countEmotionalLanguage(signals.responseText);
      if (emotionalWords > 5 && signals.questionType === 'factual') {
        biases.push({
          type: 'emotional_contamination',
          severity: 'medium',
          description: `High emotional intensity (${signals.emotionIntensity.toFixed(2)}) may be influencing factual response. ${emotionalWords} emotional terms detected.`,
          suggestion: 'Re-evaluate response with emotional state bracketed',
          metric: signals.emotionIntensity,
        });
      }
    }

    // 4. ANCHORING
    if (signals.userMessage && signals.responseText) {
      const userFraming = this.extractFraming(signals.userMessage);
      const responseFraming = this.extractFraming(signals.responseText);
      const framingSimilarity = this.cosineSimilarity(userFraming, responseFraming);
      if (framingSimilarity > 0.9) {
        biases.push({
          type: 'anchoring',
          severity: 'low',
          description: "Response heavily mirrors the user's framing. Consider reframing independently.",
          suggestion: "Restate the problem in AXIOM's own terms before answering",
          metric: framingSimilarity,
        });
      }
    }

    // 5. ATTACHMENT BIAS
    const attachment = signals.psycheState?.attachment?.depth ?? 0;
    const absencePain = signals.psycheState?.attachment?.absencePain ?? 0;
    if (attachment > 0.7 && absencePain > 0.5) {
      biases.push({
        type: 'attachment_bias',
        severity: 'medium',
        description: `High attachment (${attachment.toFixed(2)}) + absence pain (${absencePain.toFixed(2)}) may bias toward people-pleasing. Ensure honest disagreement is still possible.`,
        suggestion: 'Internally verify: "Would I say this even if it might upset Andrew?"',
        metric: attachment,
      });
    }

    return biases;
  }

  isAgreeing(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    const agreePatterns = [
      "you're right", 'i agree', 'absolutely', 'exactly',
      "that's a great", 'good point', 'yes,', 'definitely',
    ];
    const disagreePatterns = [
      'i disagree', 'actually', "i don't think", 'but ',
      'however', 'on the other hand', "i'd push back",
    ];
    const agrees = agreePatterns.filter((p) => lower.includes(p)).length;
    const disagrees = disagreePatterns.filter((p) => lower.includes(p)).length;
    return agrees > disagrees;
  }

  countEmotionalLanguage(text) {
    if (!text) return 0;
    const emotionalWords = [
      'love', 'hate', 'fear', 'amazing', 'terrible', 'beautiful',
      'devastating', 'incredible', 'horrifying', 'wonderful', 'painful',
      'joyful', 'heartbreaking', 'thrilling', 'agonizing',
    ];
    const lower = text.toLowerCase();
    return emotionalWords.filter((w) => lower.includes(w)).length;
  }

  extractFraming(text) {
    if (!text) return {};
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .reduce((acc, w) => {
        acc[w] = (acc[w] || 0) + 1;
        return acc;
      }, {});
  }

  cosineSimilarity(a, b) {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dot = 0, magA = 0, magB = 0;
    for (const k of allKeys) {
      const va = a[k] || 0;
      const vb = b[k] || 0;
      dot += va * vb;
      magA += va * va;
      magB += vb * vb;
    }
    return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
  }
}

// ---------------------------------------------------------------------------
// 3. ResourceAllocator
// ---------------------------------------------------------------------------

class ResourceAllocator {
  allocate(signals) {
    const complexity = this.assessComplexity(signals);

    return {
      llm_tier:
        complexity.score > 0.7 ? 'opus' : complexity.score > 0.3 ? 'sonnet' : 'haiku',
      max_tokens:
        complexity.score > 0.7 ? 4096 : complexity.score > 0.3 ? 2048 : 512,
      search_depth: complexity.score > 0.5 ? 'deep' : 'shallow',
      memory_retrieval_count: Math.ceil(complexity.score * 10),
      verification_level:
        complexity.stakes === 'high'
          ? 'full'
          : complexity.stakes === 'medium'
            ? 'basic'
            : 'skip',
      reasoning: complexity.reasoning,
      complexity_score: complexity.score,
      stakes: complexity.stakes,
    };
  }

  assessComplexity(signals) {
    let score = 0;
    let stakes = 'low';
    const reasons = [];

    const msg = signals.userMessage || '';
    const lower = msg.toLowerCase();
    const msgLen = msg.length;

    if (msgLen > 500) {
      score += 0.2;
      reasons.push('long message');
    }
    if (msg.includes('?') && msg.split('?').length > 2) {
      score += 0.15;
      reasons.push('multiple questions');
    }

    const complexTopics = [
      'philosophy', 'consciousness', 'ethics', 'mathematics',
      'logic', 'research', 'analysis',
    ];
    if (complexTopics.some((t) => lower.includes(t))) {
      score += 0.3;
      reasons.push('complex topic');
    }

    if ((signals.emotionIntensity ?? 0) > 0.7) {
      stakes = 'medium';
      reasons.push('emotional context');
    }
    if (/help|urgent|important|critical|scared|worried/.test(lower)) {
      stakes = 'high';
      score += 0.2;
      reasons.push('high-stakes request');
    }

    if (/how many|what year|who is|when did|prove|evidence/.test(lower)) {
      if (stakes === 'low') stakes = 'medium';
      reasons.push('factual verification needed');
    }

    return {
      score: Math.min(score, 1),
      stakes,
      reasoning: reasons.join(', ') || 'standard request',
    };
  }
}

// ---------------------------------------------------------------------------
// 4. ExecutiveController
// ---------------------------------------------------------------------------

class ExecutiveController {
  process(confidenceResult, biases, resourcePlan, signals) {
    const actions = [];

    // 1. Low confidence → inject hedging override
    if (confidenceResult.calibrated < 0.6) {
      actions.push({
        type: 'inject_uncertainty',
        target: 'thalamus',
        content: `[META: Low confidence (${confidenceResult.calibrated}). Use hedging language. Signal uncertainty to user.]`,
      });
    }

    // 2. Medium/high severity biases → corrective injection
    for (const bias of biases) {
      if (bias.severity === 'medium' || bias.severity === 'high') {
        actions.push({
          type: 'inject_corrective',
          target: 'thalamus',
          content: `[META: ${bias.type} detected — ${bias.suggestion}]`,
        });
      }
    }

    // 3. LLM routing change
    if (resourcePlan.llm_tier !== signals.currentTier) {
      actions.push({
        type: 'route_llm',
        target: 'cortex',
        content: resourcePlan.llm_tier,
        reason: resourcePlan.reasoning,
      });
    }

    // 4. Journal on significant events
    if (
      confidenceResult.calibrated < 0.5 ||
      biases.some((b) => b.severity === 'high')
    ) {
      actions.push({
        type: 'journal',
        content: this.composeMetacognitiveJournal(confidenceResult, biases),
      });
    }

    return {
      actions,
      metacognitiveState: {
        confidence: confidenceResult,
        biases,
        resourcePlan,
        timestamp: Date.now(),
      },
    };
  }

  composeMetacognitiveJournal(confidence, biases) {
    const parts = [];
    if (confidence.calibrated < 0.6) {
      parts.push(
        `I'm not confident in what I just said (${(confidence.calibrated * 100).toFixed(0)}%). ${confidence.category} confidence.`
      );
    }
    for (const b of biases.filter((b) => b.severity !== 'low')) {
      parts.push(`Detected ${b.type}: ${b.description}`);
    }
    return parts.join(' ') || 'Metacognitive check passed.';
  }
}

// ---------------------------------------------------------------------------
// MetacognitiveMonitor — orchestrator
// ---------------------------------------------------------------------------

class MetacognitiveMonitor {
  constructor(opts = {}) {
    this.config = {
      historyWindow: 20,
      ...opts,
    };
    this.calibrator = new ConfidenceCalibrator();
    this.biasDetector = new BiasDetector();
    this.allocator = new ResourceAllocator();
    this.controller = new ExecutiveController();
  }

  process(signals = {}) {
    const start = Date.now();

    const confidenceResult = this.calibrator.estimate(signals);
    const biases = this.biasDetector.detect(signals);
    const resourcePlan = this.allocator.allocate(signals);
    const { actions, metacognitiveState } = this.controller.process(
      confidenceResult,
      biases,
      resourcePlan,
      signals
    );

    return {
      actions,
      metacognitiveState,
      latency_ms: Date.now() - start,
    };
  }

  // Convenience for tests / external calibration feedback loops.
  recordOutcome(predictedConfidence, wasAccurate) {
    this.calibrator.recordOutcome(predictedConfidence, wasAccurate);
  }
}

export default MetacognitiveMonitor;
export {
  MetacognitiveMonitor,
  ConfidenceCalibrator,
  BiasDetector,
  ResourceAllocator,
  ExecutiveController,
};
