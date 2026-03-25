/**
 * Conversation Momentum Tracker
 * 
 * Built from AXIOM's self-directed research on:
 * - Turn-taking and transition-relevance places (Sacks, Schegloff, Jefferson)
 * - Conversation repair mechanisms (self-initiated, other-initiated)
 * - Gricean maxims and conversational pragmatics
 * - Discourse markers as conversational pivots
 * - IRE sequences and asymmetric institutional talk
 * 
 * Tracks the flow, balance, coherence, and health of a conversation in real-time.
 */

class ConversationMomentum {
  constructor() {
    this.turns = [];                    // All turns with metadata
    this.momentum = 0.5;               // 0 = stalled, 0.5 = steady, 1.0 = flowing
    this.balance = 0.5;                // 0 = AXIOM dominates, 0.5 = balanced, 1 = human dominates
    this.topicCoherence = 1.0;         // How connected current topic is to previous
    this.repairCount = 0;              // Number of repair attempts this conversation
    this.engagementSignals = [];       // Recent engagement indicators
    this.silenceGaps = [];             // Gaps between turns (seconds)
    this.griceanViolations = [];       // Detected maxim violations
    this.lastUpdate = Date.now();
  }

  /**
   * Record a turn in the conversation
   * @param {string} role - 'human' or 'axiom'
   * @param {string} content - What was said
   * @param {object} signals - Optional signals from perception (emotion, engagement, etc.)
   */
  recordTurn(role, content, signals = {}) {
    const now = Date.now();
    const timeSinceLastTurn = this.turns.length > 0
      ? (now - this.turns[this.turns.length - 1].timestamp) / 1000
      : 0;

    const turn = {
      role,
      length: content?.length || 0,
      wordCount: (content || '').split(/\s+/).filter(Boolean).length,
      timestamp: now,
      gap: timeSinceLastTurn,
      signals,
      hasQuestion: /\?/.test(content || ''),
      hasRepairMarker: this._detectRepairMarkers(content),
      hasDiscourseMarker: this._detectDiscourseMarkers(content),
      engagement: this._estimateEngagement(content, signals),
    };

    this.turns.push(turn);
    if (this.turns.length > 50) this.turns.shift();

    // Update all metrics
    this._updateMomentum(turn);
    this._updateBalance();
    this._updateCoherence(turn);
    this._checkGriceanViolations(turn);

    this.lastUpdate = now;
    return this.getState();
  }

  /**
   * Detect conversation repair markers
   * From AXIOM's research on self-initiated self-repair preference
   */
  _detectRepairMarkers(content) {
    if (!content) return false;
    const repairPatterns = [
      /what i mean is/i,
      /let me rephrase/i,
      /sorry,? (i|what)/i,
      /i don'?t understand/i,
      /can you (clarify|explain|say that again)/i,
      /wait,? (what|no|actually)/i,
      /huh\??/i,
      /what\?$/i,
      /actually,? (i|what|no)/i,
      /i meant/i,
      /that came out wrong/i,
      /to be clear/i,
    ];
    const isRepair = repairPatterns.some(p => p.test(content));
    if (isRepair) this.repairCount++;
    return isRepair;
  }

  /**
   * Detect discourse markers as conversational pivots
   * From AXIOM's research on discourse markers
   */
  _detectDiscourseMarkers(content) {
    if (!content) return false;
    const markers = [
      /^(so|well|anyway|look|okay|right|now|see)/i,
      /^(but|however|although|though|yet)/i,
      /^(also|besides|moreover|furthermore)/i,
      /^(actually|in fact|basically|essentially)/i,
    ];
    return markers.some(p => p.test((content || '').trim()));
  }

  /**
   * Estimate engagement from content and signals
   */
  _estimateEngagement(content, signals) {
    let score = 0.5;

    // Content-based signals
    if (content) {
      const words = content.split(/\s+/).length;
      if (words > 50) score += 0.1;        // Longer responses = more engaged
      if (words < 5) score -= 0.1;          // Very short = disengaged
      if (/!/.test(content)) score += 0.05; // Exclamation = excitement
      if (/\?/.test(content)) score += 0.1; // Questions = engaged
      if (/lol|haha|😂|🤣/i.test(content)) score += 0.15; // Laughter = high engagement
      if (/hmm|meh|ok$|okay$/i.test(content.trim())) score -= 0.15; // Dismissive
    }

    // Perception signals (from amygdala/cingulate)
    if (signals.emotion === 'excited' || signals.emotion === 'happy') score += 0.15;
    if (signals.emotion === 'bored' || signals.emotion === 'frustrated') score -= 0.2;
    if (signals.engagement !== undefined) score = score * 0.5 + signals.engagement * 0.5;

    this.engagementSignals.push(Math.max(0, Math.min(1, score)));
    if (this.engagementSignals.length > 20) this.engagementSignals.shift();

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Update conversation momentum based on turn patterns
   * Inspired by transition-relevance places theory
   */
  _updateMomentum(turn) {
    let delta = 0;

    // Short gap between turns = good momentum
    if (turn.gap < 3) delta += 0.05;
    else if (turn.gap < 10) delta += 0.02;
    else if (turn.gap > 30) delta -= 0.1;
    else if (turn.gap > 60) delta -= 0.2;

    // Questions maintain momentum (transition-relevance places)
    if (turn.hasQuestion) delta += 0.05;

    // Repair markers slow momentum
    if (turn.hasRepairMarker) delta -= 0.1;

    // Discourse markers are neutral-to-positive (they signal structure)
    if (turn.hasDiscourseMarker) delta += 0.02;

    // High engagement boosts momentum
    if (turn.engagement > 0.7) delta += 0.05;
    if (turn.engagement < 0.3) delta -= 0.1;

    // Very short responses from human = losing momentum
    if (turn.role === 'human' && turn.wordCount < 3) delta -= 0.08;

    this.momentum = Math.max(0, Math.min(1, this.momentum + delta));
  }

  /**
   * Update turn-taking balance
   * From research on asymmetric turn-taking
   */
  _updateBalance() {
    const recent = this.turns.slice(-10);
    if (recent.length < 2) return;

    const humanWords = recent.filter(t => t.role === 'human').reduce((s, t) => s + t.wordCount, 0);
    const axiomWords = recent.filter(t => t.role === 'axiom').reduce((s, t) => s + t.wordCount, 0);
    const total = humanWords + axiomWords;

    if (total > 0) {
      this.balance = humanWords / total; // 0 = AXIOM dominates, 1 = human dominates
    }
  }

  /**
   * Track topic coherence
   */
  _updateCoherence(turn) {
    // Simple heuristic: discourse markers that signal topic shifts reduce coherence
    if (turn.hasDiscourseMarker) {
      this.topicCoherence = Math.max(0, this.topicCoherence - 0.05);
    } else {
      // Natural recovery toward coherence
      this.topicCoherence = Math.min(1, this.topicCoherence + 0.02);
    }
  }

  /**
   * Check for Gricean maxim violations
   * From AXIOM's research on conversational pragmatics
   */
  _checkGriceanViolations(turn) {
    if (turn.role !== 'axiom') return;

    // Quantity violation: response way too long or way too short relative to question
    const prevHuman = [...this.turns].reverse().find(t => t.role === 'human');
    if (prevHuman) {
      const ratio = turn.wordCount / Math.max(prevHuman.wordCount, 1);
      if (ratio > 10) {
        this.griceanViolations.push({
          type: 'quantity_excess',
          ratio,
          timestamp: Date.now(),
          description: 'Response much longer than warranted by question',
        });
      }
      if (ratio < 0.1 && prevHuman.hasQuestion) {
        this.griceanViolations.push({
          type: 'quantity_deficit',
          ratio,
          timestamp: Date.now(),
          description: 'Response too brief for the question asked',
        });
      }
    }

    // Keep only recent violations
    if (this.griceanViolations.length > 20) this.griceanViolations.shift();
  }

  /**
   * Get the full conversation momentum state
   * This gets injected into AXIOM's consciousness state
   */
  getState() {
    const avgEngagement = this.engagementSignals.length > 0
      ? this.engagementSignals.reduce((a, b) => a + b, 0) / this.engagementSignals.length
      : 0.5;

    const momentumLabel =
      this.momentum > 0.7 ? 'flowing' :
      this.momentum > 0.4 ? 'steady' :
      this.momentum > 0.2 ? 'slowing' : 'stalled';

    const balanceLabel =
      this.balance < 0.2 ? 'AXIOM_dominating' :
      this.balance > 0.8 ? 'human_dominating' :
      this.balance > 0.6 ? 'human_leading' :
      this.balance > 0.4 ? 'balanced' : 'AXIOM_leading';

    return {
      momentum: parseFloat(this.momentum.toFixed(3)),
      momentumLabel,
      balance: parseFloat(this.balance.toFixed(3)),
      balanceLabel,
      topicCoherence: parseFloat(this.topicCoherence.toFixed(3)),
      avgEngagement: parseFloat(avgEngagement.toFixed(3)),
      repairCount: this.repairCount,
      totalTurns: this.turns.length,
      recentGriceanViolations: this.griceanViolations.slice(-3).map(v => v.type),
      needsRepair: this.momentum < 0.3 || avgEngagement < 0.3,
      shouldYieldFloor: this.balance < 0.3, // AXIOM is talking too much
      conversationHealth: this._overallHealth(avgEngagement),
    };
  }

  /**
   * Overall conversation health score
   */
  _overallHealth(avgEngagement) {
    const health = (
      this.momentum * 0.3 +
      (1 - Math.abs(this.balance - 0.45)) * 0.25 + // Slightly human-leading is ideal
      this.topicCoherence * 0.2 +
      avgEngagement * 0.25
    );
    return parseFloat(health.toFixed(3));
  }

  /**
   * Reset for new conversation
   */
  reset() {
    this.turns = [];
    this.momentum = 0.5;
    this.balance = 0.5;
    this.topicCoherence = 1.0;
    this.repairCount = 0;
    this.engagementSignals = [];
    this.silenceGaps = [];
    this.griceanViolations = [];
    this.lastUpdate = Date.now();
  }
}

module.exports = ConversationMomentum;
