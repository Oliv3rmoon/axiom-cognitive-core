// Conversation Logger (ES Module)
// Logs conversation events with structured formatting

class ConversationLogger {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 1000;
    this.entries = [];
    this.sessionId = null;
  }

  startSession(sessionId) {
    this.sessionId = sessionId || `session_${Date.now()}`;
    this.log('session_start', `Session started: ${this.sessionId}`);
    return this.sessionId;
  }

  log(type, message, metadata = {}) {
    const entry = {
      type,
      message,
      metadata,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      iso: new Date().toISOString(),
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    return entry;
  }

  logTurn(role, content, emotion) {
    return this.log('turn', `[${role}] ${(content || '').slice(0, 200)}`, { role, emotion, contentLength: (content || '').length });
  }

  logEvent(eventType, details) {
    return this.log('event', `[${eventType}] ${JSON.stringify(details).slice(0, 200)}`, { eventType, ...details });
  }

  getReport() {
    const turns = this.entries.filter(e => e.type === 'turn');
    const events = this.entries.filter(e => e.type === 'event');
    const lines = [];
    lines.push(`Session: ${this.sessionId}`);
    lines.push(`Total entries: ${this.entries.length}`);
    lines.push(`Turns: ${turns.length}`);
    lines.push(`Events: ${events.length}`);
    if (this.entries.length > 0) {
      const first = this.entries[0];
      const last = this.entries[this.entries.length - 1];
      lines.push(`Duration: ${Math.round((last.timestamp - first.timestamp) / 1000)}s`);
    }
    return lines.join('\n');
  }

  getEntries(filter = {}) {
    let result = [...this.entries];
    if (filter.type) result = result.filter(e => e.type === filter.type);
    if (filter.since) result = result.filter(e => e.timestamp > filter.since);
    if (filter.limit) result = result.slice(-filter.limit);
    return result;
  }

  clear() { this.entries = []; }
}

export default ConversationLogger;
