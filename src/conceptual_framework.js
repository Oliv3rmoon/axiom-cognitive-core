// AXIOM Conceptual Framework — ES Module
// First-class concept objects with properties, relationships, and visual representations

import { EventEmitter } from 'events';
import crypto from 'crypto';

class Concept {
  constructor(id, properties = {}) {
    this.id = id || crypto.randomBytes(16).toString('hex');
    this.name = properties.name || id;
    this.properties = new Map();
    this.relationships = new Map();
    this.visual = properties.visual || {};
    this.metadata = {
      created: Date.now(), modified: Date.now(),
      accessCount: 0, strength: properties.strength || 1.0
    };
    if (properties.attributes) {
      Object.entries(properties.attributes).forEach(([k, v]) => this.setProperty(k, v));
    }
  }

  setProperty(key, value) {
    this.properties.set(key, { value, timestamp: Date.now(), confidence: 1.0 });
    this.metadata.modified = Date.now();
    return this;
  }

  getProperty(key) {
    const p = this.properties.get(key);
    return p ? p.value : undefined;
  }

  addRelationship(type, targetId, weight = 1.0) {
    if (!this.relationships.has(type)) this.relationships.set(type, []);
    this.relationships.get(type).push({ target: targetId, weight, created: Date.now() });
    this.metadata.modified = Date.now();
    return this;
  }

  getRelationships(type = null) {
    if (type) return this.relationships.get(type) || [];
    return Array.from(this.relationships.entries());
  }

  access() { this.metadata.accessCount++; this.metadata.lastAccess = Date.now(); }
  decay(factor = 0.99) { this.metadata.strength *= factor; return this.metadata.strength; }
  strengthen(amount = 0.1) { this.metadata.strength = Math.min(1.0, this.metadata.strength + amount); return this.metadata.strength; }

  toJSON() {
    return {
      id: this.id, name: this.name,
      properties: Array.from(this.properties.entries()),
      relationships: Array.from(this.relationships.entries()),
      visual: this.visual, metadata: this.metadata
    };
  }
}

class ConceptualSpace extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concepts = new Map();
    this.config = {
      decayRate: options.decayRate || 0.001,
      activationThreshold: options.activationThreshold || 0.3,
      maxConcepts: options.maxConcepts || 100000
    };
    this.activeSet = new Set();
  }

  createConcept(id, properties = {}) {
    if (this.concepts.has(id)) return this.concepts.get(id);
    const concept = new Concept(id, properties);
    this.concepts.set(id, concept);
    this.emit('conceptCreated', { concept });
    return concept;
  }

  getConcept(id) {
    const concept = this.concepts.get(id);
    if (concept) { concept.access(); this.activeSet.add(id); }
    return concept;
  }

  findConcepts(criteria = {}) {
    const results = [];
    for (const [id, concept] of this.concepts) {
      let matches = true;
      if (criteria.name && !concept.name.includes(criteria.name)) matches = false;
      if (criteria.minStrength && concept.metadata.strength < criteria.minStrength) matches = false;
      if (matches) results.push(concept);
    }
    return results;
  }

  getReport() {
    return { totalConcepts: this.concepts.size, activeConcepts: this.activeSet.size };
  }
}

export { Concept, ConceptualSpace };
export default ConceptualSpace;
