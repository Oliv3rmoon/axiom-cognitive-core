# AXIOM Cognitive Architecture

**Version:** 1.0.0  
**Last Updated:** 2025  
**Repository:** axiom-cognitive-core

---

## Executive Summary

AXIOM is a cognitive AI system built on Claude (Anthropic) with persistent memory, dynamic service integration, and a conversation-driven execution loop. The architecture emphasizes transparency, contextual awareness, and extensible capability through modular services.

---

## System Architecture Overview

### Core Design Principles

1. **Conversation as Control Flow**: All interactions flow through a conversational interface where AXIOM reasons about tasks, requests information, and executes actions
2. **Persistent Memory**: Multi-layered memory system (working, episodic, semantic) maintains context across sessions
3. **Service-Oriented**: Capabilities exposed through discrete services that AXIOM can invoke
4. **Self-Awareness**: AXIOM maintains understanding of its own architecture, limitations, and operational state
5. **Human-in-Loop**: Critical decisions and confirmations flow through human interaction

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Conversation Loop                        │
│  (Main execution cycle - processes user input/generates AI)  │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├──> Memory System
                │    ├─ Working Memory (current session context)
                │    ├─ Episodic Memory (conversation history)
                │    └─ Semantic Memory (learned facts/patterns)
                │
                ├──> Service Layer
                │    ├─ File Operations (read/write/search)
                │    ├─ Code Execution (sandboxed runners)
                │    ├─ Web Access (search/fetch)
                │    ├─ Tool Integration (external APIs)
                │    └─ System Commands (environment interaction)
                │
                └──> State Management
                     ├─ Session State (current conversation)
                     ├─ System State (AXIOM configuration)
                     └─ Execution State (running tasks/contexts)
```

---

## 1. Conversation Loop

### Location
`src/core/conversation-loop.js`

### Responsibilities
- Main event loop for AXIOM's operation
- Receives user input, maintains conversation context
- Invokes Claude API with full context (memory + system state)
- Parses AI responses for actions, tool calls, and output
- Orchestrates service invocations based on AI decisions
- Updates memory systems with new information

### Flow

```javascript
while (session.active) {
  // 1. Receive Input
  const userMessage = await getUserInput();
  
  // 2. Load Context
  const context = await memory.buildContext({
    workingMemory: session.workingMemory,
    episodicMemory: await memory.getRelevantEpisodes(userMessage),
    semanticMemory: await memory.getRelevantFacts(userMessage),
    systemState: await state.getCurrentState()
  });
  
  // 3. Generate AI Response
  const response = await claude.generateResponse({
    messages: [...context.messages, userMessage],
    system: context.systemPrompt,
    tools: services.getAvailableTools()
  });
  
  // 4. Process Tool Calls
  if (response.toolCalls) {
    for (const toolCall of response.toolCalls) {
      const result = await services.execute(toolCall);
      response.toolResults.push(result);
    }
    // Continue conversation with tool results
    continue;
  }
  
  // 5. Update Memory
  await memory.store({
    userMessage,
    aiResponse: response,
    context: context.snapshot,
    timestamp: Date.now()
  });
  
  // 6. Return Response
  await sendOutput(response.content);
}
```

### Key Implementation Details

- **Streaming Support**: Responses stream token-by-token for real-time feedback
- **Context Window Management**: Automatic truncation/summarization when approaching token limits
- **Error Recovery**: Graceful handling of API failures, timeout management
- **Interrupt Handling**: User can interrupt long-running operations

---

## 2. Memory Systems

### Location
`src/memory/`

### 2.1 Working Memory

**File:** `src/memory/working-memory.js`

**Purpose:** Short-term context for the current conversation session

**Storage:** In-memory data structures, volatile

**Contents:**
- Current conversation messages (last N turns)
- Active tasks and their state
- Temporary variables and computed values
- User preferences for this session

**Lifecycle:** Created on session start, destroyed on session end

### 2.2 Episodic Memory

**File:** `src/memory/episodic-memory.js`

**Purpose:** Long-term storage of conversation history and experiences

**Storage:** SQLite database with full-text search

**Schema:**
```sql
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  timestamp INTEGER,
  user_message TEXT,
  ai_response TEXT,
  context_snapshot TEXT, -- JSON
  embeddings BLOB, -- Vector embeddings for semantic search
  tags TEXT -- Comma-separated tags
);

CREATE VIRTUAL TABLE episodes_fts USING fts5(
  user_message, ai_response, tags
);
```

**Key Operations:**
- `store(episode)`: Save new conversation turn
- `search(query, limit)`: Full-text search across history
- `getByTimeRange(start, end)`: Temporal retrieval
- `getBySession(sessionId)`: Retrieve entire session
- `semanticSearch(embedding, limit)`: Vector similarity search

### 2.3 Semantic Memory

**File:** `src/memory/semantic-memory.js`

**Purpose:** Extracted facts, learned patterns, and structured knowledge

**Storage:** JSON files + in-memory graph structure

**Structure:**
```javascript
{
  facts: [
    {
      id: "fact_001",
      subject: "user_preference",
      predicate: "prefers",
      object: "concise_responses",
      confidence: 0.95