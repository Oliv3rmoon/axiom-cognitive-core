#!/usr/bin/env node

/**
 * AXIOM Conversation Quality Monitor
 * 
 * Analyzes conversation logs to track:
 * - Response time metrics
 * - Tool-use efficiency (success rate, appropriateness)
 * - Conversation continuity (context retention, coherence)
 * 
 * Generates daily markdown reports for objective quality tracking.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  logsDir: path.join(__dirname, '../logs/conversations'),
  reportsDir: path.join(__dirname, '../reports/quality'),
  metricsFile: path.join(__dirname, '../data/conversation_metrics.json'),
  thresholds: {
    responseTime: {
      excellent: 2000,
      good: 5000,
      acceptable: 10000
    },
    toolSuccessRate: {
      excellent: 0.95,
      good: 0.85,
      acceptable: 0.75
    },
    contextRetention: {
      excellent: 0.90,
      good: 0.75,
      acceptable: 0.60
    }
  }
};

// Ensure directories exist
[CONFIG.logsDir, CONFIG.reportsDir, path.dirname(CONFIG.metricsFile)].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Parse conversation logs from the last 24 hours
 */
function parseRecentLogs() {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const conversations = [];

  if (!fs.existsSync(CONFIG.logsDir)) {
    console.log('No conversation logs directory found');
    return conversations;
  }

  const logFiles = fs.readdirSync(CONFIG.logsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(CONFIG.logsDir, f));

  for (const logFile of logFiles) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const log = JSON.parse(content);
      
      const timestamp = new Date(log.timestamp || log.startTime).getTime();
      if (timestamp >= oneDayAgo) {
        conversations.push(log);
      }
    } catch (error) {
      console.error(`Error parsing log file ${logFile}:`, error.message);
    }
  }

  return conversations;
}

/**
 * Calculate response time metrics
 */
function analyzeResponseTimes(conversations) {
  const responseTimes = [];

  for (const conv of conversations) {
    if (conv.exchanges && Array.isArray(conv.exchanges)) {
      for (const exchange of conv.exchanges) {
        if (exchange.responseTime) {
          responseTimes.push(exchange.responseTime);
        } else if (exchange.startTime && exchange.endTime) {
          const duration = new Date(exchange.endTime) - new Date(exchange.startTime);
          responseTimes.push(duration);
        }
      }
    }
  }

  if (responseTimes.length === 0) {
    return { avg: 0, median: 0, p95: 0, p99: 0, count: 0 };
  }

  const sorted = responseTimes.sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = sum / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  return { avg, median, p95, p99, count: sorted.length };
}

/**
 * Analyze tool usage efficiency
 */
function analyzeToolUsage(conversations) {
  let totalToolCalls = 0;
  let successfulCalls = 0;
  let appropriateCalls = 0;
  const toolDistribution = {};

  for (const conv of conversations) {
    if (conv.exchanges && Array.isArray(conv.exchanges)) {
      for (const exchange of conv.exchanges) {
        if (exchange.toolsUsed && Array.isArray(exchange.toolsUsed)) {
          for (const tool of exchange.toolsUsed) {
            totalToolCalls++;
            
            // Track tool distribution
            toolDistribution[tool.name] = (toolDistribution[tool.name] || 0) + 1;
            
            // Success tracking
            if (tool.success !== false && tool.error === undefined) {
              successfulCalls++;
            }
            
            // Appropriateness heuristic: tool was used and not immediately followed by error
            if (tool.appropriate !== false && !tool.redundant) {
              appropriateCalls++;
            }
          }
        }
      }
    }
  }

  const successRate = totalToolCalls > 0 ? successfulCalls / totalToolCalls : 0;
  const appropriatenessRate = totalToolCalls > 0 ? appropriateCalls / totalToolCalls : 0;

  return {
    totalCalls: totalToolCalls,
    successRate,
    appropriatenessRate,
    distribution: toolDistribution
  };
}

/**
 * Analyze conversation continuity
 */
function analyzeContinuity(conversations) {
  let totalConversations = conversations.length;
  let conversationsWithContext = 0;
  let totalCoherenceScore = 0;
  let contextBreaks = 0;

  for (const conv of conversations) {
    // Check for context retention markers
    if (conv.contextRetained || (conv.exchanges && conv.exchanges.length >