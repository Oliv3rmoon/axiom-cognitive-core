// AXIOM Degradation Detector — ES Module
// Monitors cognitive performance and detects degradation patterns
// Note: This is a standalone utility. The 'natural' NLP library is not installed,
// so this module provides simplified implementations of entropy/similarity metrics.

import { EventEmitter } from 'events';

class DegradationDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      windowSize: options.windowSize || 10,
      entropyThreshold: options.entropyThreshold || 2.5,
      repetitionThreshold: options.repetitionThreshold || 0.4,
      loopDetectionWindow: options.loopDetectionWindow || 5,
      alertCooldown: options.alertCooldown || 30000
    };
    this.state = {
      toolUsageHistory: [],
      responseHistory: [],
      coherenceMetrics: [],
      lastAlertTime: 0,
      degradationScore: 0
    };
    this.monitoring = false;
  }

  start() {
    this.monitoring = true;
    this.emit('monitoring:started', { timestamp: Date.now() });
  }

  stop() {
    this.monitoring = false;
    this.emit('monitoring:stopped', { timestamp: Date.now() });
  }

  logToolUsage(toolName, parameters, result) {
    this.state.toolUsageHistory.push({
      timestamp: Date.now(), toolName,
      resultSize: JSON.stringify(result || '').length
    });
    if (this.state.toolUsageHistory.length > this.config.windowSize * 2) {
      this.state.toolUsageHistory = this.state.toolUsageHistory.slice(-this.config.windowSize * 2);
    }
  }

  logResponse(text) {
    const tokens = text.toLowerCase().split(/\s+/);
    const entry = {
      timestamp: Date.now(), text, tokens,
      entropy: this.calculateEntropy(tokens),
      repetitionRatio: this.calculateRepetitionRatio(tokens)
    };
    this.state.responseHistory.push(entry);
    if (this.state.responseHistory.length > this.config.windowSize * 2) {
      this.state.responseHistory = this.state.responseHistory.slice(-this.config.windowSize * 2);
    }
    return entry;
  }

  calculateEntropy(tokens) {
    if (!tokens.length) return 0;
    const freq = {};
    tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    let entropy = 0;
    const total = tokens.length;
    Object.values(freq).forEach(count => {
      const p = count / total;
      entropy -= p * Math.log2(p);
    });
    return entropy;
  }

  calculateRepetitionRatio(tokens) {
    if (!tokens.length) return 0;
    return 1 - (new Set(tokens).size / tokens.length);
  }

  getReport() {
    return {
      monitoring: this.monitoring,
      degradationScore: this.state.degradationScore,
      responsesTracked: this.state.responseHistory.length,
      toolCallsTracked: this.state.toolUsageHistory.length
    };
  }
}

export default DegradationDetector;
