import { repositoryRoot } from './cli.js';
import { generateWork } from './work-generate.js';
try {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== '--measure-confusions')) throw new Error('Chỉ nhận --measure-confusions.');
  const count = await generateWork(repositoryRoot, args.includes('--measure-confusions'));
  console.log(`Đã sinh nhãn: ${count.handwriting} trang viết tay, ${count.text} mẫu chữ.`);
} catch (error) { console.error(error instanceof Error ? error.message : 'Không sinh được dữ liệu bài làm.'); process.exitCode = 1; }
