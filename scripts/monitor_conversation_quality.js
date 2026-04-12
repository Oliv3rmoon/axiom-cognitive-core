// Conversation Quality Monitor Script (ES Module)
// Monitors and reports on conversation quality metrics

import ConversationQualityMonitor from '../src/monitors/conversationQualityMonitor.js';

async function main() {
  const monitor = new ConversationQualityMonitor();
  
  const coreUrl = process.env.CORE_URL || 'https://axiom-cognitive-core-production.up.railway.app';
  
  try {
    const healthRes = await fetch(`${coreUrl}/health`);
    const health = await healthRes.json();
    
    const journalRes = await fetch(`${coreUrl}/journal`);
    const journal = await journalRes.json();
    
    const entries = journal.entries || [];
    for (const entry of entries) {
      monitor.processEntry(entry);
    }
    
    const report = monitor.generateReport();
    console.log('=== Conversation Quality Report ===');
    console.log(JSON.stringify(report, null, 2));
    
    const conversationEntries = entries.filter(e => e.trigger_type === 'conversation');
    let contextRetentionScore = 0;
    if (conversationEntries.length > 1) {
      const retained = conversationEntries.filter((conv, i) => {
        if (i === 0) return false;
        return conv.contextRetained || (conv.thought && conv.thought.length > 100);
      }).length;
      contextRetentionScore = retained / (conversationEntries.length - 1);
    }
    
    console.log(`\nContext Retention: ${(contextRetentionScore * 100).toFixed(1)}%`);
    console.log(`Total Entries Analyzed: ${entries.length}`);
    console.log(`Brain Status: ${health.status}`);
  } catch (e) {
    console.error('Monitor error:', e.message);
  }
}

main();
