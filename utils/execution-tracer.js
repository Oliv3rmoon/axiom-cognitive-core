const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const util = require('util');

class ExecutionTracer {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.traceId = this.generateTraceId();
    this.traces = [];
    this.callStack = [];
    this.startTime = performance.now();
    this.outputDir = options.outputDir || './traces';
    this.includeStackTrace = options.includeStackTrace || false;
    this.maxDepth = options.maxDepth || 50;
    this.logToConsole = options.logToConsole || false;
    this.detailedArgs = options.detailedArgs !== false;
    this.autoFlush = options.autoFlush !== false;
    this.flushInterval = options.flushInterval || 1000;
    this.stateSnapshots = [];
    this.performance = {
      functionTimings: new Map(),
      slowestOperations: [],
      totalCalls: 0
    };
    this.hooks = {
      beforeCall: options.beforeCall || null,
      afterCall: options.afterCall || null,
      onError: options.onError || null,
      onStateChange: options.onStateChange || null
    };

    if (this.autoFlush && this.enabled) {
      this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
    }

    this.ensureOutputDir();
  }

  generateTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  getCurrentDepth() {
    return this.callStack.length;
  }

  formatValue(value, maxLength = 200) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    
    try {
      const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    } catch (e) {
      return '[Circular or Complex Object]';
    }
  }

  captureStackTrace() {
    const stack = {};
    Error.captureStackTrace(stack);
    return stack.stack.split('\n').slice(3, 8).map(line => line.trim());
  }

  trace(namespace, functionName, args = [], metadata = {}) {
    if (!this.enabled) return null;

    const depth = this.getCurrentDepth();
    if (depth >= this.maxDepth) {
      console.warn(`Max trace depth ${this.maxDepth} exceeded. Skipping trace.`);
      return null;
    }

    const traceEntry = {
      id: `${this.traceId}_${this.traces.length}`,
      namespace,
      functionName,
      fullPath: `${namespace}.${functionName}`,
      depth,
      timestamp: performance.now() - this.startTime,
      args: this.detailedArgs ? this.serializeArgs(args) : args.length,
      metadata: { ...metadata },
      stackTrace: this.includeStackTrace ? this.captureStackTrace() : null,
      parentId: this.callStack.length > 0 ? this.callStack[this.callStack.length - 1] : null
    };

    this.traces.push(traceEntry);
    this.callStack.push(traceEntry.id);
    this.performance.totalCalls++;

    if (this.hooks.beforeCall) {
      try {
        this.hooks.beforeCall(traceEntry);
      } catch (e) {
        console.error('Error in beforeCall hook:', e);
      }
    }

    if (this.logToConsole) {
      const indent = '  '.repeat(depth);
      console.log(`${indent}→ [${namespace}] ${functionName}()`);
    }

    return traceEntry.id;
  }

  traceEnd(traceId, result, error = null) {
    if (!this.enabled || !traceId) return;

    const endTime = performance.now() - this.startTime;
    const traceEntry = this.traces.find(t => t.id === traceId);

    if (!traceEntry) {
      console.warn(`Trace entry not found for id: ${traceId}`);
      return;
    }

    const duration = endTime - traceEntry.timestamp;
    traceEntry.endTime = endTime;
    traceEntry.duration = duration;
    traceEntry.error = error ? this.serializeError(error) : null;
    traceEntry.result = error ? null : this.formatValue(result);
    traceEntry.success = !error;

    const callStackIndex = this.callStack.indexOf(traceId);
    if (callStackIndex !== -1) {
      this.callStack.splice(callStackIndex, 1);
    }

    this.updatePerformanceMetrics(traceEntry);

    if (this.hooks.afterCall) {
      try {
        this.hooks.afterCall(traceEntry);
      } catch (e) {
        console.error('Error in afterCall hook:', e);
      }
    }

    if (error && this.hooks.onError) {
      try {
        this.hooks.onError(traceEntry, error);
      } catch (e) {
        console.error('Error in onError hook:', e);
      }
    }

    if (this.logToConsole) {
      const indent = '  '.repeat(traceEntry.depth);
      const status = error ? '✗' : '✓';
      console.log(`${indent}← [${