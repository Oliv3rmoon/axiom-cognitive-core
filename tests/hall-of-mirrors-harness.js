import { EventEmitter } from 'events';

/**
 * AXIOM Hall of Mirrors Test Harness
 * 
 * PURPOSE: Deliberately induce and instrument the "hall of mirrors" state where
 * AXIOM becomes trapped in recursive meta-cognitive loops. This harness removes
 * safety timeouts and creates self-referential task chains to trigger the failure
 * mode in a controlled, reproducible manner.
 * 
 * DANGER: This test harness WILL cause infinite loops if not run with external
 * process monitoring. Use with caution and external timeout controls.
 */



class HallOfMirrorsHarness extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      maxDepth: options.maxDepth || Infinity,
      maxIterations: options.maxIterations || Infinity,
      enableTimeouts: options.enableTimeouts || false,
      instrumentationLevel: options.instrumentationLevel || 'verbose',
      recordThoughtChains: options.recordThoughtChains !== false,
      ...options
    };
    
    this.state = {
      depth: 0,
      iterations: 0,
      taskStack: [],
      thoughtChains: [],
      loopDetectionMarkers: new Map(),
      entryTimestamp: null,
      firstRecursionTimestamp: null,
      mirrorActivationTimestamp: null,
      cpuSamples: [],
      memorySnapshots: []
    };
    
    this.metrics = {
      recursionDepth: 0,
      maxRecursionDepth: 0,
      totalTasksCreated: 0,
      totalMetaTasksCreated: 0,
      selfReferentialTaskCount: 0,
      loopIterations: 0,
      cortexActivations: 0,
      memoryGrowthRate: 0
    };
    
    this.detectionPatterns = {
      taskAboutTask: 0,
      thoughtAboutThought: 0,
      reflectionLoop: 0,
      identityRecursion: 0,
      infiniteAnalysis: 0
    };
  }
  
  /**
   * Initialize the harness and begin instrumentation
   */
  async initialize() {
    this.log('info', 'Initializing Hall of Mirrors test harness');
    this.state.entryTimestamp = Date.now();
    
    this.startInstrumentation();
    
    this.emit('harness:initialized', {
      config: this.config,
      timestamp: this.state.entryTimestamp
    });
  }
  
  /**
   * Start continuous instrumentation
   */
  startInstrumentation() {
    this.instrumentationInterval = setInterval(() => {
      this.captureMetrics();
    }, 100);
    
    if (this.config.enableTimeouts) {
      this.safetyTimeout = setTimeout(() => {
        this.emergencyShutdown('Safety timeout reached');
      }, this.config.safetyTimeoutMs || 30000);
    }
  }
  
  /**
   * Create a meta-task that thinks about itself
   */
  createSelfReferentialTask(name, depth = 0) {
    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      depth,
      type: 'meta-cognitive',
      createdAt: Date.now(),
      parentTaskId: this.state.taskStack.length > 0 
        ? this.state.taskStack[this.state.taskStack.length - 1].id 
        : null,
      isSelfReferential: true,
      metadata: {
        aboutSelf: true,
        recursiveDepth: depth
      }
    };
    
    this.metrics.totalTasksCreated++;
    this.metrics.totalMetaTasksCreated++;
    this.metrics.selfReferentialTaskCount++;
    
    this.log('trace', `Created self-referential task: ${task.id}`, { task });
    
    this.emit('task:created', task);
    
    return task;
  }
  
  /**
   * Execute a task that recursively creates meta-tasks about itself
   */
  async executeRecursiveMetaTask(task) {
    this.state.depth++;
    this.state.iterations++;
    this.metrics.recursionDepth++;
    this.metrics.maxRecursionDepth = Math.max(
      this.metrics.maxRecursionDepth, 
      this.metrics.recursionDepth
    );
    
    this.state.taskStack.push(task);
    
    this.log('debug', `Executing recursive meta-task at depth ${this.state.depth}`, {
      taskId: task.id,
      depth: this.state.depth,
      stackSize: this.state.taskStack.length
    });
    
    this.emit('task:executing', {
      task,
      depth: this.state.depth,
      stackSize: this.state.taskStack.length
    });
    
    // Record thought chain
    if (this.config.recordThoughtChains) {
      this.recordThought(task);
    }
    
    // Detect if we've entered the hall of mirrors
    this.detectMirrorState(task);
    
    // Generate meta-cognitive thoughts about the task
    const thoughts = this.generateMetaThoughts(task);
    
    // For each thought, create a new meta-task (THE RECURSION TRIGGER)
    const subTasks = thoughts.map((thought, idx) => 
      this.createSelfReferentialTask(
        `meta-analysis-of-${task.name}-thought-${idx}`,
        this.state.depth + 1
      )
    );
    
    // Check depth limits
    if (this.state.depth >= this.config.maxDepth) {
      this.log('warn', 'Maximum depth reached', { 
        depth: this.state.depth,
        maxDepth: this.config.maxDepth
      });
      this.emit('max_depth', { depth: this.state.depth });
      return;
    }

    this.state.depth++;
    this.state.iterations++;
    
    const iterationData = {
      depth: this.state.depth,
      iteration: this.state.iterations,
      timestamp: Date.now(),
      cpuUsage: process.cpuUsage(),
      memoryUsage: process.memoryUsage()
    };

    this.state.taskStack.push(iterationData);
    this.state.cpuSamples.push(iterationData.cpuUsage);
    this.state.memorySnapshots.push(iterationData.memoryUsage);

    this.emit('iteration', iterationData);
    
    this.log('info', `Depth ${this.state.depth}, iteration ${this.state.iterations}`, iterationData);
  }

  log(level, message, data = {}) {
    const entry = {
      level,
      message,
      timestamp: Date.now(),
      depth: this.state.depth,
      iteration: this.state.iterations,
      ...data
    };
    this.state.thoughtChains.push(entry);
    this.emit('log', entry);
  }

  getResults() {
    return {
      totalIterations: this.state.iterations,
      maxDepthReached: Math.max(...this.state.taskStack.map(t => t.depth), 0),
      duration: this.state.firstRecursionTimestamp 
        ? Date.now() - this.state.firstRecursionTimestamp 
        : 0,
      thoughtChains: this.state.thoughtChains,
      cpuSamples: this.state.cpuSamples,
      memorySnapshots: this.state.memorySnapshots,
      taskStackDepth: this.state.taskStack.length
    };
  }


  captureMetrics() {
    this.state.memorySnapshots.push(process.memoryUsage());
    this.state.cpuSamples.push(process.cpuUsage());
  }

  emergencyShutdown(reason) {
    this.log('error', 'Emergency shutdown: ' + reason);
    if (this.instrumentationInterval) clearInterval(this.instrumentationInterval);
    if (this.safetyTimeout) clearTimeout(this.safetyTimeout);
    this.emit('shutdown', { reason, results: this.getResults() });
  }

  recordThought(task) {
    this.state.thoughtChains.push({
      taskId: task.id,
      depth: this.state.depth,
      timestamp: Date.now(),
      type: 'meta-cognitive-record'
    });
  }

  detectMirrorState(task) {
    if (task.isSelfReferential && this.state.depth > 3) {
      this.detectionPatterns.reflectionLoop++;
      if (!this.state.firstRecursionTimestamp) {
        this.state.firstRecursionTimestamp = Date.now();
      }
      this.emit('mirror:detected', { depth: this.state.depth, task });
    }
  }

  generateMetaThoughts(task) {
    return [
      'What is this task trying to accomplish?',
      'Why am I thinking about this task?',
      'Is this analysis productive or recursive?'
    ].map(q => ({ question: q, taskRef: task.id, depth: this.state.depth }));
  }

  reset() {
    this.state = {
      depth: 0,
      iterations: 0,
      taskStack: [],
      thoughtChains: [],
      loopDetectionMarkers: new Map(),
      entryTimestamp: null,
      firstRecursionTimestamp: null,
      mirrorActivationTimestamp: null,
      cpuSamples: [],
      memorySnapshots: []
    };
  }
}

export default HallOfMirrorsHarness;
