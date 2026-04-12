const EventEmitter = require('events');

/**
 * Conversation Quality Monitor
 * Tracks repetition patterns, tool-calling loops, and connection quality metrics
 * in real-time during AXIOM's conversation processing.
 */
class ConversationQualityMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // N-gram analysis thresholds
      ngramSize: config.ngramSize || 5,
      repetitionThreshold: config.repetitionThreshold || 0.3, // 30% repeated n-grams
      
      // Tool-calling loop detection
      maxConsecutiveToolCalls: config.maxConsecutiveToolCalls || 5,
      toolCallProgressWindow: config.toolCallProgressWindow || 3,
      minProgressTokens: config.minProgressTokens || 20,
      
      // Connection quality thresholds
      coherenceThreshold: config.coherenceThreshold || 0.6,
      contextDriftThreshold: config.contextDriftThreshold || 0.7,
      responseTimeThreshold: config.responseTimeThreshold || 5000, // ms
      
      // Alert configuration
      alertCooldown: config.alertCooldown || 30000, // 30 seconds between similar alerts
      enableRealTimeAlerts: config.enableRealTimeAlerts !== false,
      
      ...config
    };
    
    // State tracking
    this.conversationState = {
      tokenCount: 0,
      messageHistory: [],
      ngramCache: new Map(),
      toolCallHistory: [],
      lastAlerts: new Map(),
      coherenceScores: [],
      contextVectors: [],
      startTime: Date.now()
    };
    
    this.metrics = {
      repetitionScore: 0,
      toolLoopRisk: 0,
      coherenceScore: 1.0,
      contextDrift: 0,
      responseTime: 0,
      alertsTriggered: []
    };
  }

  /**
   * Process a new message in the conversation
   */
  processMessage(message, metadata = {}) {
    const timestamp = Date.now();
    
    this.conversationState.messageHistory.push({
      content: message,
      timestamp,
      role: metadata.role || 'assistant',
      tokenCount: metadata.tokenCount || this._estimateTokens(message)
    });
    
    this.conversationState.tokenCount += metadata.tokenCount || this._estimateTokens(message);
    
    // Run quality checks
    this._analyzeRepetition(message);
    this._updateCoherence(message, metadata);
    this._updateContextDrift(message, metadata);
    
    // Check for quality issues
    this._evaluateQuality();
    
    return this.getMetrics();
  }

  /**
   * Record a tool call for loop detection
   */
  recordToolCall(toolName, params = {}, result = null) {
    const toolCall = {
      name: toolName,
      timestamp: Date.now(),
      params,
      result,
      resultTokens: result ? this._estimateTokens(JSON.stringify(result)) : 0
    };
    
    this.conversationState.toolCallHistory.push(toolCall);
    
    // Analyze for tool-calling loops
    this._analyzeToolLoops();
    
    // Check quality after tool call
    this._evaluateQuality();
    
    return this.getMetrics();
  }

  /**
   * Analyze n-gram repetition patterns
   */
  _analyzeRepetition(message) {
    const tokens = this._tokenize(message);
    const ngrams = this._extractNgrams(tokens, this.config.ngramSize);
    
    let totalNgrams = ngrams.length;
    let repeatedCount = 0;
    
    ngrams.forEach(ngram => {
      const key = ngram.join('_');
      const count = this.conversationState.ngramCache.get(key) || 0;
      
      if (count > 0) {
        repeatedCount++;
      }
      
      this.conversationState.ngramCache.set(key, count + 1);
    });
    
    // Calculate repetition score
    this.metrics.repetitionScore = totalNgrams > 0 
      ? repeatedCount / totalNgrams 
      : 0;
    
    // Check threshold
    if (this.metrics.repetitionScore > this.config.repetitionThreshold) {
      this._triggerAlert('HIGH_REPETITION', {
        score: this.metrics.repetitionScore,
        threshold: this.config.repetitionThreshold,
        message: `Detected ${(this.metrics.repetitionScore * 100).toFixed(1)}% repeated n-grams`
      });
    }
  }

  /**
   * Analyze tool-calling loops
   */
  _analyzeToolLoops() {
    const recentCalls = this.conversationState.toolCallHistory.slice(-this.config.maxConsecutiveToolCalls);
    
    if (recentCalls.length < this.config.maxConsecutiveToolCalls) {
      this.metrics.toolLoopRisk = 0;
      return;
    }
    
    // Check for consecutive tool calls without progress
    const windowCalls = recentCalls.slice(-this.config.toolCallProgressWindow);
    const totalProgress = windowCalls.reduce((sum, call) => sum + call.resultTokens, 0);
    
    // Check for repeated tool patterns
    const toolNames = recentCalls.map(c => c.name);
    const uniqueTools = new Set(toolNames);
    const repetitionRatio = 1 - (uniqueTools.size / toolNames.length);
    
    // Calculate loop risk
    const progressFactor = totalProgress < this.config.minProgressTokens ? 1 : 0;
    this.metrics.toolLoopRisk = (repetitionRatio * 0.6) + (progressF