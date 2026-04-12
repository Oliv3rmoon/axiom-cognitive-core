/**
 * AXIOM Conversation State Tracker
 * 
 * Tracks conversation exchanges with metadata to analyze patterns in:
 * - Tool usage frequency and types
 * - Message length ratios (user vs assistant)
 * - Conversation resolution states
 * - Temporal patterns
 * 
 * Outputs: Simple markdown logs for pattern analysis
 */

const fs = require('fs').promises;
const path = require('path');

class ConversationStateTracker {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(process.cwd(), 'logs', 'conversation-states');
    this.currentSession = null;
    this.exchanges = [];
    this.sessionStartTime = null;
  }

  /**
   * Initialize a new conversation session
   */
  async startSession(sessionId = null) {
    this.sessionStartTime = new Date();
    this.currentSession = sessionId || this.generateSessionId();
    this.exchanges = [];
    
    await this.ensureLogDirectory();
    
    return this.currentSession;
  }

  /**
   * Log a single exchange (user message + assistant response)
   */
  async logExchange(exchangeData) {
    const {
      userMessage,
      assistantMessage,
      toolsUsed = [],
      resolutionState = 'ongoing' // resolved | truncated | ongoing
    } = exchangeData;

    const exchange = {
      timestamp: new Date().toISOString(),
      userMessageLength: this.getMessageLength(userMessage),
      assistantMessageLength: this.getMessageLength(assistantMessage),
      lengthRatio: this.calculateLengthRatio(userMessage, assistantMessage),
      toolsUsed: toolsUsed.length > 0,
      toolsList: toolsUsed,
      toolCount: toolsUsed.length,
      resolutionState,
      exchangeIndex: this.exchanges.length
    };

    this.exchanges.push(exchange);

    // Commit to markdown after each exchange
    await this.commitToMarkdown();

    return exchange;
  }

  /**
   * Calculate message length (words + characters for richer context)
   */
  getMessageLength(message) {
    if (!message || typeof message !== 'string') {
      return { characters: 0, words: 0, lines: 0 };
    }

    return {
      characters: message.length,
      words: message.split(/\s+/).filter(w => w.length > 0).length,
      lines: message.split('\n').length
    };
  }

  /**
   * Calculate user-to-assistant message length ratio
   */
  calculateLengthRatio(userMessage, assistantMessage) {
    const userLen = typeof userMessage === 'string' ? userMessage.length : 0;
    const assistantLen = typeof assistantMessage === 'string' ? assistantMessage.length : 0;

    if (assistantLen === 0) return null;

    return parseFloat((userLen / assistantLen).toFixed(2));
  }

  /**
   * Update resolution state of the last exchange
   */
  async updateLastExchangeResolution(resolutionState) {
    if (this.exchanges.length === 0) {
      throw new Error('No exchanges to update');
    }

    this.exchanges[this.exchanges.length - 1].resolutionState = resolutionState;
    await this.commitToMarkdown();
  }

  /**
   * Generate session analytics
   */
  getSessionAnalytics() {
    if (this.exchanges.length === 0) {
      return null;
    }

    const toolUsageCount = this.exchanges.filter(e => e.toolsUsed).length;
    const avgUserLength = this.calculateAverage(this.exchanges.map(e => e.userMessageLength.characters));
    const avgAssistantLength = this.calculateAverage(this.exchanges.map(e => e.assistantMessageLength.characters));
    const avgLengthRatio = this.calculateAverage(this.exchanges.map(e => e.lengthRatio).filter(r => r !== null));

    const resolutionCounts = this.exchanges.reduce((acc, e) => {
      acc[e.resolutionState] = (acc[e.resolutionState] || 0) + 1;
      return acc;
    }, {});

    const allTools = this.exchanges.flatMap(e => e.toolsList);
    const toolFrequency = allTools.reduce((acc, tool) => {
      acc[tool] = (acc[tool] || 0) + 1;
      return acc;
    }, {});

    return {
      totalExchanges: this.exchanges.length,
      toolUsageRate: (toolUsageCount / this.exchanges.length * 100).toFixed(1) + '%',
      toolUsageCount,
      avgUserMessageLength: Math.round(avgUserLength),
      avgAssistantMessageLength: Math.round(avgAssistantLength),
      avgLengthRatio: avgLengthRatio.toFixed(2),
      resolutionBreakdown: resolutionCounts,
      toolFrequency,
      sessionDuration: this.getSessionDuration()
    };
  }

  /**
   * Commit current session state to markdown file
   */
  async commitToMarkdown() {
    if (!this.currentSession) {
      throw new Error('No active session to commit');
    }

    const filename = `${this.currentSession}.md`;
    const filepath = path.join(this.logDir, filename);

    const markdown = this.generateMarkdown();
    await fs.writeFile(filepath, markdown, 'utf-8');

    return filepath;
  }

  /**
   * Generate markdown content for current session
   */
  generateMarkdown() {
    const analytics = this.getSessionAnalytics();
    
    let md = `# Conversation State Log\n\n`;
    md += `**Session ID:** ${this.currentSession}\n`;
    md