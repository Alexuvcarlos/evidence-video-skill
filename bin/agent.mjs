#!/usr/bin/env node
import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';

const args = process.argv.slice(2);
const command = args[0] || 'status';
const dataDir = resolve(process.env.EVIDENCE_VIDEO_DATA || 'data');
const url = process.env.EVIDENCE_VIDEO_URL || 'http://127.0.0.1:4173';

function flag(name) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : '';
}

async function projects() {
  let entries = [];
  try {
    entries = await readdir(dataDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const list = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^project-[a-f0-9-]{12}$/.test(entry.name)) continue;
    try {
      const p = JSON.parse(await readFile(join(dataDir, entry.name, 'project.json'), 'utf8'));
      list.push(p);
    } catch {}
  }
  return list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function target() {
  const id = flag('--project') || process.env.EVIDENCE_VIDEO_PROJECT || '';
  const list = await projects();
  if (id) {
    const p = list.find((item) => item.id === id);
    if (!p) fail('找不到项目 ' + id);
    return p;
  }
  if (!list.length) fail('没有项目。先在 ' + url + ' 新建，或设置 EVIDENCE_VIDEO_PROJECT。');
  return list[0];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
const nextStage = (p) =>
  ['brief', 'research', 'script', 'design', 'production', 'delivery'].find(
    (stage) => !p.stages[stage],
  );

function summary(p) {
  if (p.gate) return '等待工作台确认 · ' + p.gate.stage;
  if (p.job?.state === 'running') return '正在运行 · ' + p.job.stage;
  if (p.job?.state === 'failed') return '需要处理 · ' + p.job.message;
  if (p.stages.delivery) return '成片与资料已就绪';
  return '下一步 · ' + (nextStage(p) || '无');
}

async function nextTask(p) {
  if (p.gate) {
    console.log(summary(p));
    console.log('请在 ' + url + ' 的页面内完成确认；Agent 不代确认。');
    process.exit(2);
  }
  const stage = nextStage(p);
  if (!stage) {
    console.log('全部阶段已完成。');
    return null;
  }
  if (!p.job?.taskFile) {
    console.log('当前阶段：' + stage + '。还没有分配任务，请在 ' + url + ' 点击开始。');
    return null;
  }
  const task = JSON.parse(await readFile(p.job.taskFile, 'utf8'));
  console.log('项目：' + p.title);
  console.log('阶段：' + stage + '（' + (task.mode || '') + '）');
  console.log('任务：' + p.job.taskFile);
  console.log('结果：' + join(dirname(p.job.taskFile), 'result.json'));
  console.log(JSON.stringify(task, null, 2));
  return p.job.taskFile;
}

async function submit(p, file) {
  const taskFile = p.job?.taskFile;
  if (!taskFile) fail('当前没有任务可提交。');
  const source = resolve(file);
  const body = await readFile(source, 'utf8');
  JSON.parse(body);
  const output = join(dirname(taskFile), 'result.json');
  const temp = output + '.' + process.pid + '.tmp';
  await writeFile(temp, body, 'utf8');
  await rename(temp, output);
  console.log('已提交：' + output);
  console.log('工作台会校验并继续；用 `node bin/agent.mjs wait` 等下一阶段。');
}

async function waitFor(p, timeoutSeconds) {
  const start = Date.now();
  const before = JSON.stringify([p.gate?.revision || '', p.job?.stage || '', p.job?.state || '']);
  while (Date.now() - start < timeoutSeconds * 1000) {
    await new Promise((done) => setTimeout(done, 1000));
    let current;
    try {
      current = JSON.parse(
        await readFile(join(dataDir, p.id, 'project.json'), 'utf8'),
      );
    } catch {
      continue;
    }
    const now = JSON.stringify([
      current.gate?.revision || '',
      current.job?.stage || '',
      current.job?.state || '',
    ]);
    if (now !== before) {
      console.log(summary(current));
      if (current.gate) process.exit(2);
      await nextTask(current);
      return;
    }
  }
  console.log('等待超时。可在 ' + url + ' 查看状态。');
}

if (command === 'projects') {
  const queue = await projects();
  if (!queue.length) console.log('还没有项目。');
  for (const p of queue) console.log(p.id + '  ' + p.title + '  ' + summary(p));
} else if (command === 'status') {
  const p = await target();
  console.log(p.id + '  ' + p.title);
  console.log('项目状态：' + join(dataDir, p.id, 'project.json'));
  console.log(summary(p));
  console.log(
    '阶段：' +
      ['brief', 'research', 'script', 'design', 'production', 'delivery']
        .map((stage) => (p.stages[stage] ? '✓' : stage === nextStage(p) ? '→' : '·') + stage)
        .join(' '),
  );
  if (p.gate) console.log('待确认：' + p.gate.stage + '（' + p.gate.revision + '）');
} else if (command === 'next') {
  await nextTask(await target());
} else if (command === 'submit') {
  const file = args[1];
  if (!file || file.startsWith('--')) fail('用法：node bin/agent.mjs submit <result.json> [--project id]');
  await submit(await target(), file);
} else if (command === 'wait') {
  const p = await target();
  await waitFor(p, Number(flag('--timeout') || 1800));
} else {
  console.log('用法：node bin/agent.mjs projects|status|next|submit <file>|wait [--project id]');
}
