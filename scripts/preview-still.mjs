import { resolve } from 'node:path';
import { rasterizeStill } from '../lib/media.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output || !output.toLowerCase().endsWith('.png')) {
  console.error('用法  node preview-still.mjs 输入.svg 输出.png');
  process.exitCode = 1;
} else {
  await rasterizeStill(resolve(input), resolve(output));
  console.log(resolve(output));
}
