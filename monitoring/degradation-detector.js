const EventEmitter = require('events');
const natural = require('natural');
const { performance } = require('perf_hooks');

class DegradationDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      windowSize: options.windowSize || 10,
      entropyThreshold: options.entropyThreshold || 2.5,
      repetitionThreshold: options.repetitionThreshold || 0.4,
      semanticDriftThreshold: options.semanticDriftThreshold || 0.7,
      loopDetectionWindow: options.loopDetectionWindow || 5,
      stuckStateThreshold: options.stuckStateThreshold || 3,
      coherenceCheckInterval: options.coherenceCheckInterval || 1000,
      alertCooldown: options.alertCooldown || 30000
    };

    this.state = {
      toolUsageHistory: [],
      responseHistory: [],
      coherenceMetrics: [],
      detectedPatterns: [],
      lastAlertTime: 0,
      sessionStart: Date.now(),
      degradationScore: 0
    };

    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    this.monitoring = false;
  }

  start() {
    this.monitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.performCoherenceCheck();
    }, this.config.coherenceCheckInterval);
    
    this.emit('monitoring:started', { timestamp: Date.now() });
    console.log('[DegradationDetector] Monitoring started');
  }

  stop() {
    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.emit('monitoring:stopped', { timestamp: Date.now() });
    console.log('[DegradationDetector] Monitoring stopped');
  }

  logToolUsage(toolName, parameters, result) {
    const timestamp = Date.now();
    const usage = {
      timestamp,
      toolName,
      parameters: this.sanitizeParameters(parameters),
      resultSize: JSON.stringify(result).length,
      executionTime: result.executionTime || 0
    };

    this.state.toolUsageHistory.push(usage);
    
    if (this.state.toolUsageHistory.length > this.config.windowSize * 2) {
      this.state.toolUsageHistory = this.state.toolUsageHistory.slice(-this.config.windowSize * 2);
    }

    this.detectToolLoops();
    this.detectStuckState();
    
    this.emit('tool:logged', usage);
  }

  logResponse(text, metadata = {}) {
    const timestamp = Date.now();
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    
    const response = {
      timestamp,
      text,
      tokens,
      tokenCount: tokens.length,
      entropy: this.calculateEntropy(tokens),
      repetitionRatio: this.calculateRepetitionRatio(tokens),
      metadata
    };

    this.state.responseHistory.push(response);
    this.tfidf.addDocument(tokens);
    
    if (this.state.responseHistory.length > this.config.windowSize * 2) {
      this.state.responseHistory = this.state.responseHistory.slice(-this.config.windowSize * 2);
      this.rebuildTfIdf();
    }

    const coherence = this.assessResponseCoherence(response);
    this.state.coherenceMetrics.push(coherence);
    
    if (this.state.coherenceMetrics.length > this.config.windowSize) {
      this.state.coherenceMetrics = this.state.coherenceMetrics.slice(-this.config.windowSize);
    }

    this.updateDegradationScore();
    this.emit('response:logged', { response, coherence });
    
    return coherence;
  }

  calculateEntropy(tokens) {
    if (tokens.length === 0) return 0;
    
    const frequency = {};
    tokens.forEach(token => {
      frequency[token] = (frequency[token] || 0) + 1;
    });

    let entropy = 0;
    const total = tokens.length;
    
    Object.values(frequency).forEach(count => {
      const probability = count / total;
      entropy -= probability * Math.log2(probability);
    });

    return entropy;
  }

  calculateRepetitionRatio(tokens) {
    if (tokens.length === 0) return 0;
    
    const uniqueTokens = new Set(tokens);
    return 1 - (uniqueTokens.size / tokens.length);
  }

  calculateSemanticDrift() {
    if (this.state.responseHistory.length < 2) return 0;
    
    const recentResponses = this.state.responseHistory.slice(-this.config.windowSize);
    if (recentResponses.length < 2) return 0;

    let totalDrift = 0;
    let comparisons = 0;

    for (let i = 1; i < recentResponses.length; i++) {
      const similarity = this.calculateCosineSimilarity(
        recentResponses[i - 1].tokens,
        recentResponses[i].tokens
      );
      totalDrift += (1 - similarity);
      comparisons++;
    }

    return comparisons > 0 ? totalDrift / comparisons : 0;
  }

  calculateCosineSimilarity(tokens1, tokens2) {
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    if (set1.size === 0 || set2.size === 0) return 0;
    
    return