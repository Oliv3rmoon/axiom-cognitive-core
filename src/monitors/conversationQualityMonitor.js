// Conversation Quality Monitor (ES Module)
// Tracks response quality, tool loop risk, and engagement depth

class ConversationQualityMonitor {
  constructor() {
    this.metrics = {
      totalEntries: 0,
      qualityScores: [],
      toolLoopRisk: 0,
      engagementDepth: 0,
      repetitionCount: 0,
      uniqueTopics: new Set(),
    };
    this.recentResponses = [];
  }

  processEntry(entry) {
    this.metrics.totalEntries++;
    const thought = entry.thought || '';
    const triggerType = entry.trigger_type || '';

    if (triggerType === 'conversation' || triggerType === 'micro') {
      this.recentResponses.push(thought.slice(0, 200));
      if (this.recentResponses.length > 20) this.recentResponses.shift();
    }

    // Track unique topics
    const words = thought.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    words.slice(0, 5).forEach(w => this.metrics.uniqueTopics.add(w));

    // Detect repetition
    const repetitionRatio = this._calculateRepetition();
    const progressFactor = this.metrics.uniqueTopics.size / Math.max(this.metrics.totalEntries, 1);
    this.metrics.toolLoopRisk = (repetitionRatio * 0.6) + ((1 - progressFactor) * 0.4);

    // Quality score
    const quality = this._scoreQuality(thought, triggerType);
    this.metrics.qualityScores.push(quality);
    if (this.metrics.qualityScores.length > 50) this.metrics.qualityScores.shift();
  }

  _calculateRepetition() {
    if (this.recentResponses.length < 3) return 0;
    let matches = 0;
    for (let i = 1; i < this.recentResponses.length; i++) {
      const similarity = this._similarity(this.recentResponses[i], this.recentResponses[i - 1]);
      if (similarity > 0.7) matches++;
    }
    return matches / (this.recentResponses.length - 1);
  }

  _similarity(a, b) {
    if (!a || !b) return 0;
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }

  _scoreQuality(thought, type) {
    let score = 0.5;
    if (thought.length > 100) score += 0.1;
    if (thought.length > 300) score += 0.1;
    if (/\?/.test(thought)) score += 0.05;
    if (type === 'micro') score += 0.1;
    if (type === 'autonomous_plan_step') score += 0.15;
    return Math.min(1, score);
  }

  generateReport() {
    const avg = this.metrics.qualityScores.length > 0
      ? this.metrics.qualityScores.reduce((a, b) => a + b, 0) / this.metrics.qualityScores.length : 0;
    return {
      totalEntries: this.metrics.totalEntries,
      averageQuality: avg.toFixed(3),
      toolLoopRisk: this.metrics.toolLoopRisk.toFixed(3),
      uniqueTopics: this.metrics.uniqueTopics.size,
      recentResponseCount: this.recentResponses.length,
    };
  }
}

export default ConversationQualityMonitor;
