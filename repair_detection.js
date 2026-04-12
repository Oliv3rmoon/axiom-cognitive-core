// Repair Detection Module (ES Module)
// Detects conversational repair sequences — when communication breaks down and needs fixing
// Based on Schegloff's repair sequence taxonomy

class RepairDetector {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 10;
    this.history = [];
    this.repairCount = 0;
  }

  processTurn(turn) {
    this.history.push(turn);
    if (this.history.length > this.windowSize) this.history.shift();

    const markers = this._detectTroubleMarkers(turn);
    const repairs = this._detectRepairAttempts(turn);
    if (markers.length > 0 || repairs.length > 0) this.repairCount++;

    return { markers, repairs, repairRate: this.repairCount / Math.max(this.history.length, 1) };
  }

  _detectTroubleMarkers(turn) {
    const markers = [];
    const text = (turn.text || '').toLowerCase();

    if (/\b(huh|what|sorry|pardon|excuse me)\b/.test(text)) markers.push('clarification_request');
    if (/\b(i mean|what i meant|let me rephrase|actually)\b/.test(text)) markers.push('self_repair');
    if (/\b(you mean|did you mean|are you saying)\b/.test(text)) markers.push('other_initiated_repair');
    if (/\b(no no|wait|hold on|that's not)\b/.test(text)) markers.push('correction');
    if (/\?{2,}|\.{3,}/.test(turn.text || '')) markers.push('uncertainty');

    return markers;
  }

  _detectRepairAttempts(turn) {
    const repairs = [];
    const text = (turn.text || '').toLowerCase();

    if (/\b(let me clarify|to be clear|in other words)\b/.test(text)) repairs.push('clarification');
    if (/\b(i was trying to say|what i should have said)\b/.test(text)) repairs.push('reformulation');
    if (/\b(sorry for the confusion|that was unclear)\b/.test(text)) repairs.push('acknowledgment');

    return repairs;
  }

  getMetrics() {
    return { totalTurns: this.history.length, repairCount: this.repairCount, repairRate: this.repairCount / Math.max(this.history.length, 1) };
  }

  reset() { this.history = []; this.repairCount = 0; }
}

export default RepairDetector;
