const crypto = require('crypto');

/**
 * Loop Detection Monitoring Module
 * Detects repetitive patterns, high perplexity, and circular reasoning in token streams
 * Automatically triggers circuit-breaker responses when loops are detected
 */

class LoopDetector {
  constructor(options = {}) {
    this.bufferSize = options.bufferSize || 50;
    this.perplexityThreshold = options.perplexityThreshold || 0.75;
    this.similarityThreshold = options.similarityThreshold || 0.85;
    this.minLoopLength = options.minLoopLength || 5;
    this.windowSize = options.windowSize || 10;
    this.circuitBreakerMessages = options.circuitBreakerMessages || [
      "I'm stuck — let me restart this thought",
      "I notice I'm repeating myself. Let me approach this differently.",
      "I'm caught in a loop. Taking a step back to reframe.",
      "I'm circling. Let me break out and try a new angle."
    ];
    
    this.tokenBuffer = [];
    this.hashBuffer = [];
    this.perplexityWindow = [];
    this.processingDepth = 0;
    this.maxProcessingDepth = options.maxProcessingDepth || 15;
    this.loopDetectedCount = 0;
    this.lastCircuitBreak = 0;
    this.circuitBreakerCooldown = options.circuitBreakerCooldown || 5000;
    
    this.metrics = {
      totalTokens: 0,
      loopsDetected: 0,
      circuitBreaksTriggered: 0,
      avgPerplexity: 0,
      maxSimilarity: 0
    };
  }

  /**
   * Process a new token and check for loops
   * @param {string} token - The token to process
   * @param {number} logProb - Log probability of the token (optional)
   * @returns {Object} Detection result with loop status and recommendations
   */
  processToken(token, logProb = null) {
    this.metrics.totalTokens++;
    
    // Add token to buffer
    this.tokenBuffer.push(token);
    if (this.tokenBuffer.length > this.bufferSize) {
      this.tokenBuffer.shift();
    }

    // Calculate hash for sequence matching
    const sequenceHash = this.hashSequence(this.tokenBuffer.slice(-this.minLoopLength));
    this.hashBuffer.push(sequenceHash);
    if (this.hashBuffer.length > this.bufferSize) {
      this.hashBuffer.shift();
    }

    // Update perplexity if log probability provided
    if (logProb !== null) {
      this.updatePerplexity(logProb);
    }

    // Run detection checks
    const patternLoop = this.detectPatternLoop();
    const perplexityAnomaly = this.detectPerplexityAnomaly();
    const similarityLoop = this.detectSimilarityLoop();
    const depthExceeded = this.processingDepth >= this.maxProcessingDepth;

    const loopDetected = patternLoop || perplexityAnomaly || similarityLoop || depthExceeded;

    if (loopDetected) {
      this.loopDetectedCount++;
      this.metrics.loopsDetected++;
    }

    return {
      loopDetected,
      details: {
        patternLoop,
        perplexityAnomaly,
        similarityLoop,
        depthExceeded,
        currentDepth: this.processingDepth,
        avgPerplexity: this.getAveragePerplexity(),
        bufferUtilization: this.tokenBuffer.length / this.bufferSize
      },
      shouldTriggerCircuitBreaker: this.shouldTriggerCircuitBreaker(loopDetected),
      circuitBreakerMessage: this.getCircuitBreakerMessage()
    };
  }

  /**
   * Process a complete text chunk and analyze for loops
   * @param {string} text - Text chunk to analyze
   * @returns {Object} Comprehensive analysis result
   */
  processChunk(text) {
    const tokens = this.tokenize(text);
    const results = [];
    
    for (const token of tokens) {
      results.push(this.processToken(token));
    }

    const loopDetectedInChunk = results.some(r => r.loopDetected);
    
    return {
      chunkAnalysis: {
        loopDetected: loopDetectedInChunk,
        tokenCount: tokens.length,
        loopOccurrences: results.filter(r => r.loopDetected).length
      },
      finalState: results[results.length - 1] || null,
      metrics: this.getMetrics()
    };
  }

  /**
   * Detect repeating token patterns using hash matching
   * @returns {boolean} True if pattern loop detected
   */
  detectPatternLoop() {
    if (this.hashBuffer.length < this.minLoopLength * 2) {
      return false;
    }

    const recentHash = this.hashBuffer[this.hashBuffer.length - 1];
    const searchSpace = this.hashBuffer.slice(0, -this.minLoopLength);
    
    // Count occurrences of the recent pattern
    const occurrences = searchSpace.filter(h => h === recentHash).length;
    
    return occurrences >= 2;
  }

  /**
   * Detect perplexity anomalies indicating model uncertainty
   * @returns {boolean} True if perplexity anomaly detected
   */
  detectPerplexityAnomaly() {
    if (this.perplexityWindow.length < this.windowSize) {
      return false;
    }

    const avgPerplexity = this.getAveragePerplexity();
    const recentPerplexity = this.perpl