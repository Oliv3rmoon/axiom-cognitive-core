/**
 * @fileoverview Conceptual Framework - First-class concept objects with properties,
 * relationships, and visual representations
 * @module axiom-cognitive-core/conceptual_framework
 */

const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Core concept class representing a first-class cognitive object
 */
class Concept {
  constructor(id, properties = {}) {
    this.id = id || this._generateId();
    this.name = properties.name || id;
    this.properties = new Map();
    this.relationships = new Map();
    this.visual = properties.visual || {};
    this.metadata = {
      created: Date.now(),
      modified: Date.now(),
      accessCount: 0,
      strength: properties.strength || 1.0,
      coherence: properties.coherence || 1.0
    };
    
    // Initialize with provided properties
    if (properties.attributes) {
      Object.entries(properties.attributes).forEach(([key, value]) => {
        this.setProperty(key, value);
      });
    }
  }

  _generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  setProperty(key, value) {
    this.properties.set(key, {
      value,
      timestamp: Date.now(),
      confidence: 1.0
    });
    this.metadata.modified = Date.now();
    return this;
  }

  getProperty(key) {
    const prop = this.properties.get(key);
    return prop ? prop.value : undefined;
  }

  hasProperty(key) {
    return this.properties.has(key);
  }

  addRelationship(type, targetConceptId, weight = 1.0, bidirectional = false) {
    if (!this.relationships.has(type)) {
      this.relationships.set(type, []);
    }
    
    this.relationships.get(type).push({
      target: targetConceptId,
      weight,
      created: Date.now(),
      bidirectional
    });
    
    this.metadata.modified = Date.now();
    return this;
  }

  getRelationships(type = null) {
    if (type) {
      return this.relationships.get(type) || [];
    }
    return Array.from(this.relationships.entries());
  }

  setVisual(visualData) {
    this.visual = {
      ...this.visual,
      ...visualData,
      updated: Date.now()
    };
    return this;
  }

  access() {
    this.metadata.accessCount++;
    this.metadata.lastAccess = Date.now();
  }

  decay(factor = 0.99) {
    this.metadata.strength *= factor;
    return this.metadata.strength;
  }

  strengthen(amount = 0.1) {
    this.metadata.strength = Math.min(1.0, this.metadata.strength + amount);
    return this.metadata.strength;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      properties: Array.from(this.properties.entries()),
      relationships: Array.from(this.relationships.entries()),
      visual: this.visual,
      metadata: this.metadata
    };
  }

  static fromJSON(data) {
    const concept = new Concept(data.id, { name: data.name });
    concept.properties = new Map(data.properties);
    concept.relationships = new Map(data.relationships);
    concept.visual = data.visual;
    concept.metadata = data.metadata;
    return concept;
  }
}

/**
 * Conceptual Space - manages the network of concepts and their interactions
 */
class ConceptualSpace extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concepts = new Map();
    this.conceptIndex = new Map(); // For fast property-based lookup
    this.visualManifold = new Map(); // Maps visual patterns to concepts
    this.config = {
      decayRate: options.decayRate || 0.001,
      activationThreshold: options.activationThreshold || 0.3,
      maxConcepts: options.maxConcepts || 100000,
      coherenceWeight: options.coherenceWeight || 0.7
    };
    this.activeSet = new Set();
    this.lastDecay = Date.now();
  }

  /**
   * Create a new concept in the space
   */
  createConcept(id, properties = {}) {
    if (this.concepts.has(id)) {
      this.emit('warning', `Concept ${id} already exists`);
      return this.concepts.get(id);
    }

    const concept = new Concept(id, properties);
    this.concepts.set(id, concept);
    this._indexConcept(concept);
    
    this.emit('conceptCreated', { concept });
    return concept;
  }

  /**
   * Retrieve a concept by ID
   */
  getConcept(id) {
    const concept = this.concepts.get(id);
    if (concept) {
      concept.access();
      this.activeSet.add(id);
    }
    return concept;
  }

  /**
   * Find concepts matching specific criteria
   */
  findConcepts(criteria = {}) {
    const results = [];
    
    for (const [id, concept] of this.concepts) {
      let matches = true;
      
      if (criteria.name && !concept.name.includes(criteria.name)) {
        matches = false;
      }
      
      if (criteria.properties) {
        for (const [key, value] of Object.entries(criteria.properties)) {
          if (concept.getProperty(key) !== value) {
            matches = false;
            break;
          }
        }
      }
      
      if (criteria.minStrength && concept.metadata.strength < criteria.minStrength) {
        matches = false;