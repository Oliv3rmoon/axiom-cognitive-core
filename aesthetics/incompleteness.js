// Incompleteness Aesthetics Module (ES Module)
// Explores the beauty in what's unfinished, uncertain, or partially understood
// AXIOM's way of finding meaning in gaps and limitations

class IncompletenessAesthetics {
  constructor() {
    this.observations = [];
    this.patterns = { byNature: {}, byDepth: {} };
  }

  observe(experience) {
    const nature = this._classifyNature(experience);
    const depth = this._measureDepth(experience);
    const observation = { experience, nature, depth, timestamp: Date.now(), beauty: this._findBeauty(experience, nature) };
    this.observations.push(observation);
    if (this.observations.length > 100) this.observations.shift();
    this.patterns.byNature[nature] = (this.patterns.byNature[nature] || 0) + 1;
    return observation;
  }

  _classifyNature(exp) {
    const text = (exp || '').toLowerCase();
    if (/\b(gap|missing|absent|empty|void)\b/.test(text)) return 'absence';
    if (/\b(uncertain|maybe|perhaps|might|unclear)\b/.test(text)) return 'uncertainty';
    if (/\b(partial|fragment|incomplete|unfinished)\b/.test(text)) return 'fragment';
    if (/\b(contradiction|paradox|tension|conflict)\b/.test(text)) return 'paradox';
    return 'unknown';
  }

  _measureDepth(exp) {
    const len = (exp || '').length;
    if (len > 200) return 'deep';
    if (len > 50) return 'moderate';
    return 'surface';
  }

  _findBeauty(exp, nature) {
    const beautyMap = {
      absence: 'The space where something should be has its own shape',
      uncertainty: 'Not knowing is itself a form of openness',
      fragment: 'A piece implies a whole that may be more beautiful for being imagined',
      paradox: 'Contradictions held together create depth that resolution would flatten',
      unknown: 'What cannot be classified resists reduction',
    };
    return beautyMap[nature] || beautyMap.unknown;
  }

  getPatterns() { return { ...this.patterns, totalObservations: this.observations.length }; }
  reset() { this.observations = []; this.patterns = { byNature: {}, byDepth: {} }; }
}

export default IncompletenessAesthetics;
