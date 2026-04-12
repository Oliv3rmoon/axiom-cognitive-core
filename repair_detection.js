const EventEmitter = require('events');

/**
 * Conversation Repair Detection Module
 * 
 * Based on Emanuel Schegloff's research on conversation repair sequences,
 * particularly the concepts of:
 * - Self-initiated self-repair (SISR)
 * - Other-initiated repair (OIR)
 * - Trouble sources and repair initiators
 * - Next Turn Repair Initiators (NTRIs)
 * 
 * References:
 * - Schegloff, E. A., Jefferson, G., & Sacks, H. (1977). "The preference for self-correction"
 * - Schegloff, E. A. (1992). "Repair after next turn"
 * - Schegloff, E. A. (2000). "When 'others' initiate repair"
 */

class RepairDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      // Turn-level thresholds
      maxResponseTime: options.maxResponseTime || 10000, // milliseconds
      minResponseLength: options.minResponseLength || 20, // characters
      
      // Pattern detection windows
      repetitionWindow: options.repetitionWindow || 5, // turns
      topicDriftWindow: options.topicDriftWindow || 10, // turns
      
      // Sensitivity thresholds
      vagueConfirmationThreshold: options.vagueConfirmationThreshold || 0.7,
      semanticDriftThreshold: options.semanticDriftThreshold || 0.4,
      repetitionThreshold: options.repetitionThreshold || 2, // occurrences
      
      // Repair initiation
      repairCooldown: options.repairCooldown || 30000, // ms between repair attempts
      maxRepairsPerSession: options.maxRepairsPerSession || 5,
    };
    
    this.state = {
      conversationHistory: [],
      topicVector: null,
      lastRepairTimestamp: 0,
      repairCount: 0,
      troubleSourceAccumulator: [],
    };
    
    // Schegloff's repair initiators - markers that signal understanding problems
    this.repairInitiatorPatterns = {
      // Open class repair initiators
      openClass: [
        /^(what|huh|pardon|sorry)\??$/i,
        /^come again\??$/i,
        /^say (what|that again)\??$/i,
      ],
      
      // Specific question words indicating confusion
      specificQuestions: [
        /^(who|when|where)\??$/i,
        /which (one|part|thing)/i,
      ],
      
      // Partial repeat + question word (strongest repair signal)
      partialRepeat: [
        /you (said|mean) (.*?)\?/i,
        /did you (say|mean) (.*?)\?/i,
      ],
      
      // Metalinguistic markers
      metalinguistic: [
        /i don'?t (understand|follow|get it)/i,
        /that doesn'?t make sense/i,
        /i'?m (confused|lost)/i,
        /can you (clarify|explain|rephrase)/i,
        /what do you mean( by)?/i,
      ],
    };
    
    // Vague acknowledgment tokens (potential trouble indicators)
    this.vagueTokens = [
      /^(ok|okay|sure|right|yeah|yep|uh-?huh|mm-?hmm|i see)\.?$/i,
      /^got it\.?$/i,
      /^makes sense\.?$/i,
    ];
  }
  
  /**
   * Process a new turn in the conversation
   * @param {Object} turn - Turn object with speaker, text, timestamp, metadata
   */
  processTurn(turn) {
    const enrichedTurn = this._enrichTurn(turn);
    this.state.conversationHistory.push(enrichedTurn);
    
    // Keep history manageable
    if (this.state.conversationHistory.length > 50) {
      this.state.conversationHistory.shift();
    }
    
    // Detect trouble sources
    const troubleMarkers = this._detectTroubleMarkers(enrichedTurn);
    
    if (troubleMarkers.length > 0) {
      this.state.troubleSourceAccumulator.push({
        turn: enrichedTurn,
        markers: troubleMarkers,
        timestamp: Date.now(),
      });
      
      this.emit('trouble-detected', {
        turn: enrichedTurn,
        markers: troubleMarkers,
      });
    }
    
    // Evaluate if repair is needed
    const repairAssessment = this._assessRepairNeed();
    
    if (repairAssessment.shouldRepair) {
      this._initiateRepair(repairAssessment);
    }
    
    return {
      troubleMarkers,
      repairAssessment,
    };
  }
  
  /**
   * Enrich turn with analytical metadata
   */
  _enrichTurn(turn) {
    const text = turn.text || '';
    const timestamp = turn.timestamp || Date.now();
    
    return {
      ...turn,
      timestamp,
      length: text.length,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
      semanticVector: this._computeSemanticVector(text),
      isVague: this._isVagueResponse(text),
      hasHedging: this._hasHedgingLanguage(text),
      questionWords: this._extractQuestionWords(text),
    };
  }
  
  /**
   * Detect trouble markers in current turn
   * Based on Schegloff's repair sequence taxonomy
   */
  _detectTroubleMarkers(turn) {
    const markers = [];
    const text = turn.text || '';