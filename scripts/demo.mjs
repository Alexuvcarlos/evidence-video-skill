import { fileURLToPath } from 'node:url';
import { Store } from '../lib/workflow.mjs';
import { seedDemo } from '../lib/demo.mjs';
const store = new Store(
  process.env.EVIDENCE_VIDEO_DATA || fileURLToPath(new URL('../data/', import.meta.url)),
);
const value = await seedDemo(store);
console.log(value.job?.message || value.id);
if (!value.stages.delivery) process.exitCode = 1;
