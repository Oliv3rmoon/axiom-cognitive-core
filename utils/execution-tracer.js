// AXIOM Execution Tracer — ES Module
// Instruments function calls, state transitions, and timing for debugging

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ExecutionTracer {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.traces = [];
    this.callStack = [];
    this.startTime = Date.now();
    this.maxDepth = options.maxDepth || 50;
    this.logToConsole = options.logToConsole || false;
    this.performance = { functionTimings: new Map(), totalCalls: 0 };
  }

  trace(namespace, functionName, args = [], metadata = {}) {
    if (!this.enabled) return null;
    const depth = this.callStack.length;
    if (depth >= this.maxDepth) return null;

    const entry = {
      id: `${this.traceId}_${this.traces.length}`,
      namespace, functionName, fullPath: `${namespace}.${functionName}`,
      depth, timestamp: Date.now() - this.startTime,
      argCount: args.length, metadata,
      parentId: this.callStack.length > 0 ? this.callStack[this.callStack.length - 1] : null
    };

    this.traces.push(entry);
    this.callStack.push(entry.id);
    this.performance.totalCalls++;

    if (this.logToConsole) {
      console.log(`${'  '.repeat(depth)}→ [${namespace}] ${functionName}()`);
    }
    return entry.id;
  }

  traceEnd(traceId, result, error = null) {
    if (!this.enabled || !traceId) return;
    const endTime = Date.now() - this.startTime;
    const entry = this.traces.find(t => t.id === traceId);
    if (!entry) return;

    entry.duration = endTime - entry.timestamp;
    entry.error = error ? { message: error.message, stack: error.stack } : null;
    entry.success = !error;

    const idx = this.callStack.indexOf(traceId);
    if (idx !== -1) this.callStack.splice(idx, 1);

    // Track timing per function
    const key = entry.fullPath;
    if (!this.performance.functionTimings.has(key)) {
      this.performance.functionTimings.set(key, { calls: 0, totalMs: 0, maxMs: 0 });
    }
    const timing = this.performance.functionTimings.get(key);
    timing.calls++;
    timing.totalMs += entry.duration;
    timing.maxMs = Math.max(timing.maxMs, entry.duration);

    if (this.logToConsole) {
      const status = error ? '✗' : '✓';
      console.log(`${'  '.repeat(entry.depth)}← ${status} [${entry.namespace}] ${entry.functionName}() ${entry.duration.toFixed(1)}ms`);
    }
  }

  captureState(label, stateData) {
    if (!this.enabled) return;
    this.traces.push({
      id: `${this.traceId}_state_${this.traces.length}`,
      type: 'state_snapshot', label,
      timestamp: Date.now() - this.startTime,
      data: JSON.parse(JSON.stringify(stateData))
    });
  }

  getReport() {
    const timings = Array.from(this.performance.functionTimings.entries())
      .map(([name, t]) => ({ name, ...t, avgMs: t.totalMs / t.calls }))
      .sort((a, b) => b.totalMs - a.totalMs);

    return {
      traceId: this.traceId,
      totalCalls: this.performance.totalCalls,
      traceCount: this.traces.length,
      topFunctions: timings.slice(0, 10),
      errors: this.traces.filter(t => t.error).length
    };
  }

  reset() {
    this.traces = [];
    this.callStack = [];
    this.startTime = Date.now();
    this.performance = { functionTimings: new Map(), totalCalls: 0 };
    this.traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default ExecutionTracer;
