import { join } from 'node:path';
import { createNodeOcrReader } from '@mathtwin/reader-ocr';
import { repositoryRoot } from './cli.js';
import { evaluateWork, readWorkOptions } from './work-eval.js';
let reader: Awaited<ReturnType<typeof createNodeOcrReader>> | undefined;
try {
  const args = process.argv.slice(2);
  const options = readWorkOptions(args);
  if (options.source === 'engine' && options.engine === 'offline:vietocr-onnx') {
    console.log('C: adapter Node, model cục bộ .models/c; tải 0 byte.');
    reader = await createNodeOcrReader({ modelRoot: join(repositoryRoot, '.models/c') });
  }
  const report = await evaluateWork(args, repositoryRoot, new Date().toISOString().slice(0, 10), reader ? { 'offline:vietocr-onnx': reader } : {});
  console.log(`Parser ${report.parser}: ${report.summary.completeCorrect}/${report.summary.total} bài trùng truth (${report.summary.completeRate * 100}%).`);
} catch (error) { console.error(error instanceof Error ? error.message : 'Không đo được bài làm.'); process.exitCode = 1; }
finally { await reader?.close(); }
