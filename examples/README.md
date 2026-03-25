# AXIOM Cognitive Core - Examples

This directory contains progressive examples demonstrating AXIOM's capabilities, from basic actions to advanced cognitive patterns. Each example is fully functional and can be run independently.

## Directory Structure

```
examples/
├── 01-basic-actions/          # Simple single-action examples
├── 02-sequential-flows/       # Multi-step sequential operations
├── 03-conditional-logic/      # Branching and decision-making
├── 04-error-handling/         # Resilience and recovery patterns
├── 05-advanced-patterns/      # Complex multi-agent coordination
└── shared/                    # Shared utilities and mock services
```

## Quick Start

```bash
# Install dependencies (from repo root)
npm install

# Run any example
node examples/01-basic-actions/hello-world.js
node examples/02-sequential-flows/data-pipeline.js
node examples/03-conditional-logic/dynamic-routing.js
```

## Learning Path

### 1. Basic Actions (Start Here)

**Purpose**: Understand fundamental AXIOM concepts - agents, actions, and execution.

- `hello-world.js` - Minimal working example
- `simple-math.js` - Action with inputs and outputs
- `file-operations.js` - Real-world I/O operations
- `api-call.js` - External service integration

**Key Concepts**: Agent creation, action definition, state management, result handling

### 2. Sequential Flows

**Purpose**: Chain multiple actions together in predictable order.

- `data-pipeline.js` - Transform data through multiple stages
- `report-generator.js` - Fetch, process, format, save
- `deployment-workflow.js` - Multi-step deployment simulation
- `onboarding-sequence.js` - User onboarding flow

**Key Concepts**: Action composition, state passing, flow control, data transformation

### 3. Conditional Logic

**Purpose**: Make decisions based on state and context.

- `dynamic-routing.js` - Route actions based on conditions
- `approval-workflow.js` - Multi-stage approval process
- `content-moderation.js` - Classify and route content
- `adaptive-response.js` - Change behavior based on user type

**Key Concepts**: Conditional execution, branching, state inspection, dynamic action selection

### 4. Error Handling

**Purpose**: Build resilient systems that handle failures gracefully.

- `retry-pattern.js` - Automatic retry with backoff
- `fallback-strategy.js` - Graceful degradation
- `circuit-breaker.js` - Prevent cascade failures
- `error-recovery.js` - Self-healing workflows

**Key Concepts**: Error detection, recovery strategies, resilience patterns, fault isolation

### 5. Advanced Patterns

**Purpose**: Sophisticated multi-agent coordination and cognitive behaviors.

- `multi-agent-coordination.js` - Multiple agents working together
- `parallel-execution.js` - Concurrent action processing
- `event-driven-system.js` - React to events and triggers
- `learning-agent.js` - Agent that adapts based on history
- `hierarchical-planning.js` - Break complex goals into sub-tasks

**Key Concepts**: Agent communication, parallelism, event handling, adaptation, planning

## Example Template

Each example follows this structure:

```javascript
/**
 * Example: [Name]
 * 
 * Description: What this example demonstrates
 * 
 * Key Concepts:
 * - Concept 1
 * - Concept 2
 * 
 * Prerequisites: What you should understand first
 */

// Import required modules
const { Agent } = require('../../src/core/agent');
const { Action } = require('../../src/core/action');

// Define actions
const myAction = new Action({
  name: 'myAction',
  execute: async (context) => {
    // Implementation
  }
});

// Configure and run agent
async function main() {
  const agent = new Agent({
    name: 'ExampleAgent',
    actions: [myAction]
  });

  const result = await agent.execute('myAction', { /* params */ });
  console.log('Result:', result);
}

// Run with error handling
main().catch(console.error);
```

## Running Examples

### Individual Example
```bash
node examples/01-basic-actions/hello-world.js
```

### All Examples in a Category
```bash
for file in examples/01-basic-actions/*.js; do
  echo "Running $file"
  node "$file"
done
```

### With Custom Configuration
```bash
AXIOM_LOG_LEVEL=debug node examples/03-conditional-logic/dynamic-routing.js
```

## Debugging Examples

Enable verbose logging to see internal execution:

```bash
# Debug level logging
DEBUG=axiom:* node examples/05-advanced-patterns/multi-agent-coordination.js

# Trace all action executions
AXIOM_TRACE=true node examples/02-sequential-flows/data-pipeline.js
```

## Modifying Examples

All examples are designed to be modified and experimented with:

1. **Copy an example**: Start with the closest match to your use case
2. **Modify actions**: Change behavior, add logging, experiment
3. **Combine patterns**: Mix concepts from multiple examples
4. **Build your own**: Use as templates for production code

## Common Patterns

### Action Definition
```javascript
const action = new Action({
  name: 'actionName',
  description: 'What this action does',
  schema: {
    input: { /* input validation */ },
    output: { /* output structure */ }
  },
  execute: async (context) => {
    // Access inputs
    const { param1, param2 } = context.input;
    
    // Perform work
    const result = await doSomething(param1, param2);
    
    // Return output
    return { success: true, data: result };
  }
});
```

### Error Handling
```javascript
execute: async (context) => {
  try {
    return await riskyOperation();
  } catch (error) {
    context.log('error', 'Operation failed:', error);
    return { success: false, error: error.message };
  }
}
```

### State Access
```javascript