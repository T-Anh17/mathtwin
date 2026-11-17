import { repositoryRoot } from './cli.js';
import { evaluateWork } from './work-eval.js';
try {
  const report = await evaluateWork(process.argv.slice(2), repositoryRoot, new Date().toISOString().slice(0, 10));
  console.log(`Parser oracle: ${report.summary.completeCorrect}/${report.summary.total} bài trùng truth (${report.summary.completeRate * 100}%).`);
} catch (error) { console.error(error instanceof Error ? error.message : 'Không đo được bài làm.'); process.exitCode = 1; }
