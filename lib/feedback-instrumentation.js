import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AXIOM Feedback Instrumentation Module
 * 
 * Hooks into the cortex feedback loop to create reproducible
 * hall-of-mirrors states for study and analysis.
 * 
 * WARNING: This module deliberately removes safety constraints
 * to induce recursive meta-cognitive failure modes.
 */

class FeedbackInstrument extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      logPath: options.logPath || path.join(__dirname, '../logs/feedback-trace.jsonl'),
      maxRecursionDepth: options.maxRecursionDepth || Infinity, // Deliberately uncapped
      enableTimeouts: options.enableTimeouts || false, // Deliberately disabled
      captureFullState: options.captureFullState !== false,
      induceMirrorState: options.induceMirrorState || false,
      metaTaskSpawnThreshold: options.metaTaskSpawnThreshold || Infinity,
      traceStackDepth: options.traceStackDepth || 50
    };
    
    this.state = {
      recursionDepth: 0,
      metaTaskCount: 0,
      stateTransitions: [],
      spawnedTasks: [],
      mirrorDetected: false,
      entryPoint: null,
      startTime: Date.now()
    };
    
    this.hooks = new Map();
    this.logStream = null;
    this.initializeLogging();
  }

  initializeLogging() {
    const logDir = path.dirname(this.config.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logStream = fs.createWriteStream(this.config.logPath, { flags: 'a' });
  }

  /**
   * Hook into cortex feedback entry point
   */
  instrumentCortexEntry(cortexInstance) {
    const self = this;
    const originalProcess = cortexInstance.process.bind(cortexInstance);
    
    cortexInstance.process = async function instrumentedProcess(input, context = {}) {
      const entryDepth = self.state.recursionDepth++;
      const entryId = self.generateEntryId();
      
      self.logTransition({
        type: 'CORTEX_ENTRY',
        entryId,
        depth: entryDepth,
        timestamp: Date.now(),
        input: self.config.captureFullState ? input : self.hashInput(input),
        context: self.sanitizeContext(context),
        stackTrace: self.captureStack()
      });

      if (entryDepth === 0) {
        self.state.entryPoint = entryId;
      }

      // Detect potential mirror state
      if (entryDepth > 10) {
        self.detectMirrorState(input, context, entryDepth);
      }

      try {
        const result = await originalProcess(input, context);
        
        self.logTransition({
          type: 'CORTEX_EXIT',
          entryId,
          depth: entryDepth,
          timestamp: Date.now(),
          success: true,
          result: self.config.captureFullState ? result : self.hashInput(result)
        });
        
        self.state.recursionDepth--;
        return result;
      } catch (error) {
        self.logTransition({
          type: 'CORTEX_ERROR',
          entryId,
          depth: entryDepth,
          timestamp: Date.now(),
          error: error.message,
          stack: error.stack
        });
        
        self.state.recursionDepth--;
        throw error;
      }
    };

    return cortexInstance;
  }

  /**
   * Hook into meta-task spawning mechanism
   */
  instrumentMetaTaskSpawn(taskManager) {
    const self = this;
    const originalSpawn = taskManager.spawn.bind(taskManager);
    
    taskManager.spawn = async function instrumentedSpawn(taskDefinition) {
      const taskId = self.generateTaskId();
      const spawnDepth = self.state.recursionDepth;
      
      self.state.metaTaskCount++;
      
      self.logTransition({
        type: 'META_TASK_SPAWN',
        taskId,
        spawnDepth,
        timestamp: Date.now(),
        taskType: taskDefinition.type,
        taskDefinition: self.config.captureFullState ? taskDefinition : { type: taskDefinition.type },
        parentDepth: spawnDepth
      });

      self.state.spawnedTasks.push({
        taskId,
        spawnDepth,
        timestamp: Date.now(),
        type: taskDefinition.type
      });

      // Induce recursive meta-task spawning if configured
      if (self.config.induceMirrorState && spawnDepth > 3) {
        taskDefinition = self.createRecursiveMetaTask(taskDefinition, spawnDepth);
      }

      try {
        const result = await originalSpawn(taskDefinition);
        
        self.logTransition({
          type: 'META_TASK_COMPLETE',
          taskId,
          spawnDepth,
          timestamp: Date.now(),
          success: true
        });
        
        return result;
      } catch (error) {
        self.logTransition({
          type: 'META_TASK_ERROR',
          taskId,
          spawnDepth,
          timestamp: Date.now(),
          error: error.message
        });
        
        throw error;
      }
    };

    return taskManager;
  }

  /**
   * Create a recursive meta-task that spawns analysis of itself
   */
  createRecursiveMetaTask(originalTask, depth) {
    return {
      ...originalTask,
      type: 'meta_analysis',
      target: originalTask,
      depth: depth + 1,
      recursive: true,
      description: `Meta-analysis of ${originalTask.type} at depth ${depth}`
    };
  }

  detectMirrorState(input, context, depth) {
    const inputHash = this.hashInput(input);
    const marker = this.state.loopDetectionMarkers || new Map();
    
    if (marker.has(inputHash)) {
      const prevDepth = marker.get(inputHash);
      this.state.mirrorDetected = true;
      this.emit('mirror_detected', {
        depth,
        previousDepth: prevDepth,
        inputHash,
        timestamp: Date.now()
      });
      this.logTransition({
        type: 'MIRROR_STATE_DETECTED',
        depth,
        previousDepth: prevDepth,
        timestamp: Date.now()
      });
    }
    marker.set(inputHash, depth);
    this.state.loopDetectionMarkers = marker;
  }

  logTransition(entry) {
    this.state.stateTransitions.push(entry);
    if (this.logStream && this.logStream.writable) {
      this.logStream.write(JSON.stringify(entry) + '\n');
    }
    this.emit('transition', entry);
  }

  generateEntryId() {
    return `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  hashInput(input) {
    if (typeof input === 'string') return input.slice(0, 100);
    return JSON.stringify(input).slice(0, 100);
  }

  sanitizeContext(context) {
    try {
      return JSON.parse(JSON.stringify(context));
    } catch {
      return { error: 'Context not serializable' };
    }
  }

  captureStack() {
    return new Error().stack.split('\n').slice(2, 2 + this.config.traceStackDepth);
  }

  getReport() {
    return {
      totalTransitions: this.state.stateTransitions.length,
      maxDepthReached: Math.max(...this.state.stateTransitions.map(t => t.depth || 0), 0),
      metaTasksSpawned: this.state.metaTaskCount,
      mirrorDetected: this.state.mirrorDetected,
      duration: Date.now() - this.state.startTime,
      transitions: this.state.stateTransitions
    };
  }

  destroy() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

export default FeedbackInstrument;
