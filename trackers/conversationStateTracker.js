// Conversation State Tracker (ES Module)
// Tracks conversation state transitions, topic flow, and engagement patterns

class ConversationStateTracker {
  constructor() {
    this.states = [];
    this.topics = [];
    this.transitions = [];
    this.currentState = 'idle';
    this.engagementLevel = 0.5;
  }

  updateState(newState, context = {}) {
    const prev = this.currentState;
    this.currentState = newState;
    const transition = { from: prev, to: newState, context, timestamp: Date.now() };
    this.transitions.push(transition);
    if (this.transitions.length > 100) this.transitions.shift();
    this.states.push({ state: newState, timestamp: Date.now() });
    if (this.states.length > 200) this.states.shift();
    return transition;
  }

  trackTopic(topic, depth = 0) {
    const existing = this.topics.find(t => t.name === topic);
    if (existing) {
      existing.mentions++;
      existing.lastSeen = Date.now();
      existing.depth = Math.max(existing.depth, depth);
    } else {
      this.topics.push({ name: topic, mentions: 1, depth, firstSeen: Date.now(), lastSeen: Date.now() });
    }
    if (this.topics.length > 50) {
      this.topics.sort((a, b) => b.lastSeen - a.lastSeen);
      this.topics = this.topics.slice(0, 50);
    }
  }

  updateEngagement(delta) {
    this.engagementLevel = Math.max(0, Math.min(1, this.engagementLevel + delta));
    return this.engagementLevel;
  }

  getReport() {
    const topTopics = [...this.topics].sort((a, b) => b.mentions - a.mentions).slice(0, 10);
    const recentTransitions = this.transitions.slice(-10);
    const md = [
      `State: ${this.currentState}`,
      `Engagement: ${this.engagementLevel.toFixed(2)}`,
      `Topics tracked: ${this.topics.length}`,
      `Transitions: ${this.transitions.length}`,
      `Top topics: ${topTopics.map(t => `${t.name}(${t.mentions})`).join(', ')}`,
    ].join('\n');
    return md;
  }

  getState() {
    return {
      currentState: this.currentState,
      engagementLevel: this.engagementLevel,
      topicCount: this.topics.length,
      transitionCount: this.transitions.length,
      recentTopics: this.topics.slice(-5).map(t => t.name),
    };
  }

  reset() {
    this.states = [];
    this.topics = [];
    this.transitions = [];
    this.currentState = 'idle';
    this.engagementLevel = 0.5;
  }
}

export default ConversationStateTracker;
