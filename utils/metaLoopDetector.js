/**
 * Meta-Loop Detector
 * 
 * Monitors conversation flow to detect when AXIOM is entering meta-processing
 * loops characterized by consecutive tool calls without substantive user-facing
 * responses. Helps maintain direct, action-oriented communication.
 * 
 * @module utils/metaLoopDetector
 */

class MetaLoopDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 3;
    this.consecutiveToolCalls = 0;
    this.lastResponseType = null;
    this.loopHistory = [];
    this.alertCallback = options.onAlert || this.defaultAlert;
    this.resetOnSubstantiveResponse = options.resetOnSubstantiveResponse !== false;
    this.trackingEnabled = options.enabled !== false;
    this.verboseLogging = options.verbose || false;
  }

  /**
   * Record a tool call in the sequence
   * @param {string} toolName - Name of the tool being called
   * @param {Object} context - Additional context about the call
   */
  recordToolCall(toolName, context = {}) {
    if (!this.trackingEnabled) return;

    this.consecutiveToolCalls++;
    this.lastResponseType = 'tool_call';
    
    const record = {
      type: 'tool_call',
      toolName,
      timestamp: Date.now(),
      count: this.consecutiveToolCalls,
      context
    };

    this.loopHistory.push(record);

    if (this.verboseLogging) {
      console.log(`[MetaLoop] Tool call #${this.consecutiveToolCalls}: ${toolName}`);
    }

    if (this.consecutiveToolCalls >= this.threshold) {
      this.triggerAlert(record);
    }
  }

  /**
   * Record a substantive response to the user
   * @param {string} responseText - The actual response content
   * @param {Object} metadata - Additional metadata about the response
   */
  recordSubstantiveResponse(responseText, metadata = {}) {
    if (!this.trackingEnabled) return;

    const isSubstantive = this.isResponseSubstantive(responseText, metadata);

    const record = {
      type: 'response',
      isSubstantive,
      length: responseText?.length || 0,
      timestamp: Date.now(),
      metadata
    };

    this.loopHistory.push(record);
    this.lastResponseType = 'response';

    if (isSubstantive && this.resetOnSubstantiveResponse) {
      if (this.verboseLogging && this.consecutiveToolCalls > 0) {
        console.log(`[MetaLoop] Reset after substantive response (${this.consecutiveToolCalls} tool calls)`);
      }
      this.consecutiveToolCalls = 0;
    }
  }

  /**
   * Determine if a response counts as substantive
   * @param {string} responseText - The response content
   * @param {Object} metadata - Response metadata
   * @returns {boolean}
   */
  isResponseSubstantive(responseText, metadata = {}) {
    if (!responseText) return false;
    
    // Check minimum length threshold
    if (responseText.length < 50) return false;

    // Check for meta-processing indicators
    const metaPatterns = [
      /let me (think|analyze|process|consider|examine)/i,
      /i (need|should|will) to (check|verify|confirm|analyze)/i,
      /^(checking|analyzing|processing|verifying|examining)/i,
      /one moment/i,
      /hold on/i
    ];

    const hasMetaPattern = metaPatterns.some(pattern => pattern.test(responseText));
    
    // If explicitly marked as substantive in metadata, trust that
    if (metadata.isSubstantive !== undefined) {
      return metadata.isSubstantive;
    }

    // Not substantive if it's mostly meta-processing language
    return !hasMetaPattern;
  }

  /**
   * Trigger the spiral alert
   * @param {Object} triggerRecord - The record that triggered the alert
   */
  triggerAlert(triggerRecord) {
    const alert = {
      type: 'meta_loop_detected',
      consecutiveToolCalls: this.consecutiveToolCalls,
      threshold: this.threshold,
      timestamp: Date.now(),
      recentHistory: this.loopHistory.slice(-10),
      trigger: triggerRecord,
      suggestion: 'Consider responding directly to the user instead of additional tool calls'
    };

    this.alertCallback(alert);
  }

  /**
   * Default alert handler
   * @param {Object} alert - Alert object
   */
  defaultAlert(alert) {
    console.warn('⚠️  META-LOOP DETECTED ⚠️');
    console.warn(`Consecutive tool calls: ${alert.consecutiveToolCalls}`);
    console.warn(`Suggestion: ${alert.suggestion}`);
    console.warn('Recent history:', alert.recentHistory.map(r => 
      r.type === 'tool_call' ? `→ ${r.toolName}` : `← response (${r.length} chars)`
    ).join('\n'));
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return {
      consecutiveToolCalls: this.consecutiveToolCalls,
      isInLoop: this.consecutiveToolCalls >= this.threshold,
      lastResponseType: this.lastResponseType,
      historyLength: this.loopHistory.length,
      threshold: this.threshold
    };
  }

  /**
   * Check if currently in a meta-loop
   * @returns {boolean}
   */
  isInLoop() {
    return this.consecutiveToolCalls >= this.threshold;
  }

  /**
   * Manually reset the detector
   */
  reset() {
    this.consecutiveTool