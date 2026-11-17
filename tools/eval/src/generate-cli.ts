import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { repositoryRoot } from './cli.js';
import { checkedTruth, readJson } from './dataset.js';
import type { ImageMeta } from './dataset.js';
import { buildSyntheticCase, syntheticFixtures, variants } from './synthetic.js';
import { generateHandwriting } from './handwriting.js';
import { generateFigures } from './figures.js';

export async function generateSynthetic(root = repositoryRoot): Promise<number> {
  let count = 0;
  for (const fixture of syntheticFixtures) {
    const input = checkedTruth(await readJson(join(root, 'testdata/core', fixture, 'spec.json')), fixture);
    for (const variant of variants) {
      const { truth, svg, lines } = buildSyntheticCase(input, variant);
      const directory = join(root, 'testdata/images-synthetic', `${fixture}-${variant}`);
      await mkdir(directory, { recursive: true });
      let image = sharp(Buffer.from(svg));
      if (variant === 'tilted') image = image.rotate(-4, { background: 'white' });
      if (variant === 'blurred') image = image.blur(1.6);
      if (variant === 'low-resolution') image = image.resize({ width: 360 });
      const png = await image.png().toBuffer();
      await writeFile(join(directory, '1.png'), png);
      await writeFile(join(directory, 'source.svg'), svg);
      await writeFile(join(directory, 'truth.json'), `${JSON.stringify(truth, null, 2)}\n`);
      await writeFile(join(directory, 'lines.json'), `${JSON.stringify(lines, null, 2)}\n`);
      const meta: ImageMeta = { source: variant === 'handwritten' ? 'handwritten' : 'printed',
        capture: variant === 'tilted' ? 'tilted' : 'straight', blurred: variant === 'blurred',
        questionFormat: truth.questionFormat, synthetic: true, variant, coreFixture: fixture,
        artifactHashes: { svgSha256: createHash('sha256').update(svg).digest('hex'), pngSha256: createHash('sha256').update(png).digest('hex') },
        notes: `Ảnh tổng hợp (${variant}), không phải ảnh chụp thật. Nét bút giả bằng đường cong và font, không đại diện chữ viết tay thật.` };
      await writeFile(join(directory, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
      count++;
    }
  }
  return count;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { set: { type: 'string', default: 'synthetic' } } });
  const generate = values.set === 'synthetic' ? () => generateSynthetic() : values.set === 'synthetic-hw'
    ? () => generateHandwriting(repositoryRoot) : values.set === 'synthetic-fig' ? () => generateFigures(repositoryRoot) : () => Promise.reject(new Error('Chọn synthetic, synthetic-hw hoặc synthetic-fig.'));
  generate().then((count) => { console.log(`Đã sinh ${count} ảnh tổng hợp qua sharp (${values.set}).`); })
    .catch((error: unknown) => { console.error('Không sinh được bộ ảnh tổng hợp.', error); process.exitCode = 1; });
}
