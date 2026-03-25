# AXIOM Learning Path

**A Guided Journey Through Cognitive Architecture**

This learning path takes you from basic cognitive primitives to advanced multi-agent reasoning systems. Each section builds on previous concepts and includes runnable examples.

---

## Stage 0: Prerequisites

Before starting, ensure you have:

```bash
npm install
npm run build
```

Basic understanding of:
- Async/await in JavaScript
- Event-driven architecture
- Graph data structures

---

## Stage 1: Thoughts as First-Class Citizens

**Concept**: Everything in AXIOM begins with a Thought. A Thought is an atomic unit of cognition with content, metadata, and relationships.

### Example 1.1: Creating Your First Thought

```javascript
// examples/learning/01_first_thought.js
import { Thought } from '../src/thought/Thought.js';

async function createFirstThought() {
  const thought = new Thought({
    content: "I am learning cognitive architecture",
    metadata: {
      type: 'observation',
      confidence: 0.9
    }
  });

  console.log('Thought ID:', thought.id);
  console.log('Content:', thought.content);
  console.log('Created at:', thought.timestamp);
  
  return thought;
}

createFirstThought();
```

**Run it**: `node examples/learning/01_first_thought.js`

### Example 1.2: Connecting Thoughts

```javascript
// examples/learning/02_thought_connections.js
import { Thought } from '../src/thought/Thought.js';

async function connectThoughts() {
  const observation = new Thought({
    content: "The sky is blue",
    metadata: { type: 'observation' }
  });

  const inference = new Thought({
    content: "It is daytime",
    metadata: { type: 'inference' }
  });

  // Create a causal relationship
  observation.addConnection(inference.id, 'implies');

  console.log('Observation connections:', observation.connections);
  console.log('Connection type:', observation.connections.get(inference.id));

  return { observation, inference };
}

connectThoughts();
```

**Key Insight**: Thoughts form a graph. Understanding emerges from the structure of connections.

---

## Stage 2: The Cognitive Graph

**Concept**: Individual thoughts are stored and queried in a CognitiveGraph, which maintains the knowledge structure.

### Example 2.1: Building a Knowledge Graph

```javascript
// examples/learning/03_cognitive_graph.js
import { CognitiveGraph } from '../src/graph/CognitiveGraph.js';
import { Thought } from '../src/thought/Thought.js';

async function buildKnowledgeGraph() {
  const graph = new CognitiveGraph();

  // Add a sequence of connected thoughts
  const thoughts = [
    new Thought({ content: "Coffee contains caffeine" }),
    new Thought({ content: "Caffeine increases alertness" }),
    new Thought({ content: "I need to be alert for the meeting" }),
    new Thought({ content: "I should drink coffee" })
  ];

  // Add thoughts to graph
  for (const thought of thoughts) {
    await graph.addThought(thought);
  }

  // Create reasoning chain
  thoughts[0].addConnection(thoughts[1].id, 'implies');
  thoughts[1].addConnection(thoughts[3].id, 'supports');
  thoughts[2].addConnection(thoughts[3].id, 'motivates');

  // Query the graph
  const conclusion = await graph.getThought(thoughts[3].id);
  console.log('Conclusion:', conclusion.content);
  console.log('Graph size:', graph.size);

  return graph;
}

buildKnowledgeGraph();
```

### Example 2.2: Graph Traversal and Search

```javascript
// examples/learning/04_graph_search.js
import { CognitiveGraph } from '../src/graph/CognitiveGraph.js';
import { Thought } from '../src/thought/Thought.js';

async function graphSearch() {
  const graph = new CognitiveGraph();

  // Create a small knowledge domain
  const root = new Thought({ 
    content: "Animals",
    metadata: { type: 'category' }
  });
  
  const mammal = new Thought({ 
    content: "Mammals",
    metadata: { type: 'subcategory' }
  });
  
  const dog = new Thought({ 
    content: "Dogs",
    metadata: { type: 'instance' }
  });

  await graph.addThought(root);
  await graph.addThought(mammal);
  await graph.addThought(dog);

  root.addConnection(mammal.id, 'contains');
  mammal.addConnection(dog.id, 'contains');

  // Traverse from root
  const descendants = await graph.traverse(root.id, {
    maxDepth: 3,
    direction: 'outbound'
  });

  console.log('Taxonomy structure:');
  for (const thought of descendants) {
    console.log('-', thought.content);
  }

  return graph;
}

graphSearch();
```

**Key Insight**: Knowledge isn't flat. It's a rich network where meaning comes from relationships.

---

## Stage 3: Memory Systems

**Concept**: AXIOM has both working memory (active thoughts) and long-term memory (persistent storage).

### Example 3.1: Working Memory

```javascript
// examples/learning/05_working_memory.js
import { WorkingMemory } from '../src/memory/WorkingMemory.js';
import { Thought } from '../src/thought/Thought.js';

async function useWorkingMemory() {
  const workingMemory = new WorkingMemory({ capacity: 7 }); // Miller's Law

  console.log('Adding thoughts to working memory...\n');

  // Add thoughts one by one
  for (let i = 1; i <= 9; i++) {
    const thought = new Thought({ 
      content: `Task ${i}`,
      metadata: { priority: Math