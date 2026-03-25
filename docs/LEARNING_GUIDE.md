# AXIOM Learning Guide

A progressive guide to understanding and working with AXIOM's cognitive architecture, from basic concepts to advanced patterns.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Level 1: Basic Action Execution](#level-1-basic-action-execution)
3. [Level 2: Action Chaining](#level-2-action-chaining)
4. [Level 3: Complex Workflows](#level-3-complex-workflows)
5. [Level 4: Error Handling Patterns](#level-4-error-handling-patterns)
6. [Level 5: Advanced Techniques](#level-5-advanced-techniques)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Getting Started

AXIOM is a cognitive architecture that executes actions through a unified interface. All actions follow a consistent pattern:

- **Input**: Actions receive structured parameters
- **Processing**: Logic executes within the action handler
- **Output**: Results return in a standardized format
- **State**: Actions can read and modify system state

### Core Concepts

**Action**: A discrete unit of work with inputs and outputs
**Chain**: Multiple actions executed in sequence
**Workflow**: Complex logic with branching, loops, and error handling
**Context**: Shared state available to all actions in a sequence

---

## Level 1: Basic Action Execution

### Example 1.1: Simple File Read

Start with the most basic action - reading a file.

```javascript
// actions/readFile.js
export const readFile = {
  name: 'readFile',
  description: 'Read contents of a file',
  parameters: {
    path: { type: 'string', required: true, description: 'File path to read' }
  },
  async execute({ path }, context) {
    const fs = await import('fs/promises');
    try {
      const content = await fs.readFile(path, 'utf-8');
      return {
        success: true,
        data: { content, path, size: content.length }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error.message}`
      };
    }
  }
};
```

**Usage**:
```javascript
const result = await executeAction('readFile', { path: './test.txt' });
if (result.success) {
  console.log('File content:', result.data.content);
}
```

### Example 1.2: Simple Data Transform

Transform data without external dependencies.

```javascript
// actions/uppercase.js
export const uppercase = {
  name: 'uppercase',
  description: 'Convert text to uppercase',
  parameters: {
    text: { type: 'string', required: true }
  },
  async execute({ text }) {
    return {
      success: true,
      data: { 
        original: text, 
        transformed: text.toUpperCase() 
      }
    };
  }
};
```

### Example 1.3: Accessing Context

Read from shared context state.

```javascript
// actions/getConfig.js
export const getConfig = {
  name: 'getConfig',
  description: 'Retrieve configuration value',
  parameters: {
    key: { type: 'string', required: true }
  },
  async execute({ key }, context) {
    const value = context.config?.[key];
    
    if (value === undefined) {
      return {
        success: false,
        error: `Configuration key '${key}' not found`
      };
    }
    
    return {
      success: true,
      data: { key, value }
    };
  }
};
```

**Key Takeaways**:
- All actions return `{ success, data?, error? }`
- Parameters are validated before execution
- Context provides shared state
- Handle errors gracefully

---

## Level 2: Action Chaining

### Example 2.1: Simple Sequential Chain

Execute actions in order, passing results forward.

```javascript
// chains/processFile.js
export const processFileChain = {
  name: 'processFile',
  description: 'Read and transform a file',
  steps: [
    {
      action: 'readFile',
      input: { path: '{{inputPath}}' },
      output: 'fileData'
    },
    {
      action: 'uppercase',
      input: { text: '{{fileData.content}}' },
      output: 'transformed'
    },
    {
      action: 'writeFile',
      input: {
        path: '{{outputPath}}',
        content: '{{transformed.transformed}}'
      },
      output: 'result'
    }
  ]
};
```

**Template Syntax**:
- `{{variable}}` - References a previous step's output
- `{{step.field}}` - Access nested fields
- Variables are resolved at runtime

### Example 2.2: Conditional Execution

Execute actions based on conditions.

```javascript
// chains/conditionalProcess.js
export const conditionalProcess = {
  name: 'conditionalProcess',
  steps: [
    {
      action: 'checkFileExists',
      input: { path: '{{filePath}}' },
      output: 'exists'
    },
    {
      action: 'readFile',
      input: { path: '{{filePath}}' },
      output: 'fileData',
      condition: '{{exists.exists === true}}'
    },
    {
      action: 'createFile',
      input: { path: '{{filePath}}', content: '' },
      output: 'created',
      condition: '{{exists.exists === false}}'
    }
  ]
};
```

### Example 2.3: Data Aggregation

Collect results from multiple steps.

```javascript
// chains/analyzeProject.js
export const analyzeProject = {
  name: 'analyzeProject',
  steps: [
    {
      action: 'listFiles',
      input: { directory: '{{projectPath}}' },
      output: 'files'
    },
    {
      action: