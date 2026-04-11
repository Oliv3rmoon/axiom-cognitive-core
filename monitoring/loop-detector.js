// Loop Detection Monitoring Module (ES Module)
// Detects repetitive patterns and circular reasoning in token streams

class LoopDetector {
  constructor(options = {}) {
    this.bufferSize = options.bufferSize || 50;
    this.similarityThreshold = options.similarityThreshold || 0.85;
    this.minLoopLength = options.minLoopLength || 5;
    this.tokenBuffer = [];
    this.loopDetectedCount = 0;
    this.metrics = { totalTokens: 0, loopsDetected: 0, circuitBreaksTriggered: 0 };
  }

  processToken(token) {
    this.metrics.totalTokens++;
    this.tokenBuffer.push(token);
    if (this.tokenBuffer.length > this.bufferSize) this.tokenBuffer.shift();
    const loopDetected = this.detectPatternLoop();
    if (loopDetected) { this.loopDetectedCount++; this.metrics.loopsDetected++; }
    return { loopDetected, bufferSize: this.tokenBuffer.length };
  }

  processChunk(text) {
    const tokens = text.split(/\s+/).filter(Boolean);
    let loopFound = false;
    for (const t of tokens) { if (this.processToken(t).loopDetected) loopFound = true; }
    return { loopDetected: loopFound, tokenCount: tokens.length, metrics: this.metrics };
  }

  detectPatternLoop() {
    if (this.tokenBuffer.length < this.minLoopLength * 2) return false;
    const recent = this.tokenBuffer.slice(-this.minLoopLength).join(' ');
    const earlier = this.tokenBuffer.slice(0, -this.minLoopLength);
    for (let i = 0; i <= earlier.length - this.minLoopLength; i++) {
      const segment = earlier.slice(i, i + this.minLoopLength).join(' ');
      if (segment === recent) return true;
    }
    return false;
  }

  reset() { this.tokenBuffer = []; this.loopDetectedCount = 0; }
  getMetrics() { return { ...this.metrics }; }
}

export default LoopDetector;
