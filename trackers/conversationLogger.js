const fs = require('fs').promises;
const path = require('path');

/**
 * AXIOM Conversation Logger
 * Tracks conversation patterns, tool usage, and exchange characteristics
 * Outputs simple markdown files for pattern analysis
 */

class ConversationLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../../logs/conversations');
    this.currentSession = null;
    this.exchanges = [];
  }

  async initialize() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  startSession(metadata = {}) {
    this.currentSession = {
      sessionId: this.generateSessionId(),
      startTime: new Date().toISOString(),
      participant: metadata.participant || 'Andrew',
      exchanges: [],
      metadata: metadata
    };
    this.exchanges = [];
  }

  logExchange(exchangeData) {
    const exchange = {
      timestamp: new Date().toISOString(),
      userMessageLength: exchangeData.userMessage?.length || 0,
      assistantMessageLength: exchangeData.assistantMessage?.length || 0,
      toolsUsed: exchangeData.toolsUsed || [],
      toolCallCount: exchangeData.toolsUsed?.length || 0,
      lengthRatio: this.calculateLengthRatio(
        exchangeData.userMessage?.length,
        exchangeData.assistantMessage?.length
      ),
      resolutionState: exchangeData.resolutionState || 'unknown',
      tags: exchangeData.tags || [],
      notes: exchangeData.notes || ''
    };

    this.exchanges.push(exchange);
    if (this.currentSession) {
      this.currentSession.exchanges.push(exchange);
    }
  }

  calculateLengthRatio(userLen, assistantLen) {
    if (!userLen || !assistantLen) return 0;
    return (assistantLen / userLen).toFixed(2);
  }

  async endSession(finalState = {}) {
    if (!this.currentSession) {
      console.warn('No active session to end');
      return;
    }

    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.finalState = finalState.state || 'completed';
    this.currentSession.resolutionNotes = finalState.notes || '';

    await this.writeMarkdownLog();
    
    const sessionData = { ...this.currentSession };
    this.currentSession = null;
    this.exchanges = [];
    
    return sessionData;
  }

  async writeMarkdownLog() {
    const session = this.currentSession;
    const stats = this.calculateSessionStats();
    
    const markdown = this.formatMarkdown(session, stats);
    
    const filename = `conversation_${session.sessionId}.md`;
    const filepath = path.join(this.logDir, filename);
    
    try {
      await fs.writeFile(filepath, markdown, 'utf8');
      console.log(`Conversation log written: ${filename}`);
      return filepath;
    } catch (error) {
      console.error('Failed to write markdown log:', error);
      throw error;
    }
  }

  formatMarkdown(session, stats) {
    const lines = [];
    
    lines.push('# AXIOM Conversation Log');
    lines.push('');
    lines.push(`**Session ID:** ${session.sessionId}`);
    lines.push(`**Participant:** ${session.participant}`);
    lines.push(`**Started:** ${this.formatTimestamp(session.startTime)}`);
    lines.push(`**Ended:** ${this.formatTimestamp(session.endTime)}`);
    lines.push(`**Duration:** ${this.calculateDuration(session.startTime, session.endTime)}`);
    lines.push(`**Final State:** ${session.finalState}`);
    lines.push('');
    
    if (session.resolutionNotes) {
      lines.push('## Resolution Notes');
      lines.push('');
      lines.push(session.resolutionNotes);
      lines.push('');
    }
    
    lines.push('## Summary Statistics');
    lines.push('');
    lines.push(`- **Total Exchanges:** ${stats.totalExchanges}`);
    lines.push(`- **Exchanges with Tools:** ${stats.exchangesWithTools} (${stats.toolUsagePercent}%)`);
    lines.push(`- **Exchanges without Tools:** ${stats.exchangesWithoutTools}`);
    lines.push(`- **Total Tool Calls:** ${stats.totalToolCalls}`);
    lines.push(`- **Average Length Ratio:** ${stats.avgLengthRatio}x`);
    lines.push(`- **Resolved Exchanges:** ${stats.resolvedCount}`);
    lines.push(`- **Truncated Exchanges:** ${stats.truncatedCount}`);
    lines.push(`- **Unclear Exchanges:** ${stats.unclearCount}`);
    lines.push('');
    
    if (stats.toolUsageBreakdown.length > 0) {
      lines.push('### Tool Usage Breakdown');
      lines.push('');
      stats.toolUsageBreakdown.forEach(tool => {
        lines.push(`- **${tool.name}:** ${tool.count} times`);
      });
      lines.push('');
    }
    
    lines.push('## Exchange Details');
    lines.push('');
    
    session.exchanges.forEach((exchange, index) => {
      lines.push(`### Exchange ${index + 1}`);
      lines.push('');
      lines.push(`**Time:** ${this.formatTimestamp(exchange.timestamp)}`);
      lines.push(`**User Message Length:** ${exchange.userMessageLength} chars`);
      lines.push(`**Assistant Message Length:** ${exchange.assistantMessageLength} chars`);
      lines.push(`