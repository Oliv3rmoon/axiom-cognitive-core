/**
 * AXIOM Cognitive Core - Conversation Repair Detection Module
 * 
 * Based on Schegloff's conversation analysis framework for repair sequences:
 * - Self-initiated self-repair (SISR)
 * - Other-initiated self-repair (OISR)
 * - Self-initiated other-repair (SIOR)
 * - Other-initiated other-repair (OIOR)
 * 
 * Monitors conversation state for trouble sources and understanding breakdowns,
 * triggering explicit recalibration requests before conversational spiraling occurs.
 */

const EventEmitter = require('events');

class RepairDetectionSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      longGapThresholdMs: config.longGapThresholdMs || 120000, // 2 minutes
      repeatedQuestionWindow: config.repeatedQuestionWindow || 5,
      vagueConfirmationPatterns: config.vagueConfirmationPatterns || [
        /^(okay|ok|sure|right|yeah|yes|mhm|uh-?huh)\.?$/i,
        /^i (see|understand|get it)\.?$/i,
        /^that makes sense\.?$/i,
        /^got it\.?$/i
      ],
      topicDriftThreshold: config.topicDriftThreshold || 0.3,
      hedgingPatterns: config.hedgingPatterns || [
        /\b(maybe|perhaps|possibly|i think|i guess|kind of|sort of|probably)\b/gi,
        /\b(not sure|unclear|confused|lost)\b/gi,
        /\?\?+/g
      ],
      repairTriggerThreshold: config.repairTriggerThreshold || 3,
      minTurnsBeforeRepair: config.minTurnsBeforeRepair || 3
    };

    // Conversation state tracking
    this.conversationState = {
      turnHistory: [],
      lastUserMessageTime: null,
      lastAssistantMessageTime: null,
      topicVector: null,
      recentQuestions: [],
      breakdownMarkers: [],
      consecutiveVagueResponses: 0,
      lastRepairAttemptTurn: -1,
      currentTurnIndex: 0
    };

    // Repair strategies repository
    this.repairStrategies = {
      long_gap: this.createLongGapRepair.bind(this),
      repeated_question: this.createRepeatedQuestionRepair.bind(this),
      vague_confirmation: this.createVagueConfirmationRepair.bind(this),
      topic_drift: this.createTopicDriftRepair.bind(this),
      hedging_cluster: this.createHedgingClusterRepair.bind(this),
      comprehension_failure: this.createComprehensionFailureRepair.bind(this)
    };
  }

  /**
   * Main entry point: analyze turn and detect if repair is needed
   */
  analyzeTurn(userMessage, assistantResponse, metadata = {}) {
    const timestamp = Date.now();
    
    const turn = {
      index: this.conversationState.currentTurnIndex++,
      userMessage,
      assistantResponse,
      timestamp,
      metadata
    };

    this.conversationState.turnHistory.push(turn);
    this.conversationState.lastUserMessageTime = timestamp;

    // Run all detection heuristics
    const markers = this.detectBreakdownMarkers(turn);
    
    if (markers.length > 0) {
      this.conversationState.breakdownMarkers.push(...markers);
      this.emit('markers_detected', { markers, turn });
    }

    // Evaluate if repair threshold reached
    const repairDecision = this.evaluateRepairNeed();
    
    if (repairDecision.needed) {
      this.emit('repair_needed', repairDecision);
      return repairDecision;
    }

    return { needed: false, markers };
  }

  /**
   * Detect breakdown markers using multiple heuristics
   */
  detectBreakdownMarkers(turn) {
    const markers = [];

    // 1. Long gap detection (Schegloff: silence as trouble indicator)
    if (this.detectLongGap(turn)) {
      markers.push({
        type: 'long_gap',
        severity: 'medium',
        turn: turn.index,
        description: 'Significant time gap detected between turns'
      });
    }

    // 2. Repeated question detection (OISR: other-initiated repair)
    const repeatedQuestion = this.detectRepeatedQuestion(turn);
    if (repeatedQuestion) {
      markers.push({
        type: 'repeated_question',
        severity: 'high',
        turn: turn.index,
        description: 'User asking similar question again',
        details: repeatedQuestion
      });
    }

    // 3. Vague confirmation detection (possible fake understanding)
    if (this.detectVagueConfirmation(turn)) {
      this.conversationState.consecutiveVagueResponses++;
      markers.push({
        type: 'vague_confirmation',
        severity: this.conversationState.consecutiveVagueResponses > 2 ? 'high' : 'low',
        turn: turn.index,
        description: 'Minimal acknowledgment without substantive engagement'
      });
    } else {
      this.conversationState.consecutiveVagueResponses = 0;
    }

    // 4. Topic drift detection (loss of coherence)
    const topicDrift = this.detectTopicDrift(turn);
    if (topicDrift.isDrift) {
      markers.push({
        type: 'topic_drift',
        severity: 'medium',
        turn: turn.index,
        description: 'Conversation topic has drifted significantly',
        details: topicDrift
      });