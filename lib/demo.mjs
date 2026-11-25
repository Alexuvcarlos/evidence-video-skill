import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Runner } from './runner.mjs';
import { localPath, stamp } from './workflow.mjs';
import { art, research, script, design } from '../examples/mars.mjs';
const require = createRequire(import.meta.url);

export async function seedDemo(store, { mode = 'auto', env, wait = true } = {}) {
  const existing = mode === 'auto' && (await store.list()).find((p) => p.demo);
  if (existing) {
    const old = await store.get(existing.id);
    if (old.stages.delivery) return old;
    const resumed = new Runner(store, { agent: demoAgent, env });
    const job = await resumed.launch(old.id);
    if (wait) await job.done;
    return store.get(old.id);
  }
  const p = await store.create({
    title: '火星车怎样自己认路',
    topic: '用一支短片解释毅力号的自动导航',
    audience: '对科技感兴趣的普通观众',
    seconds: 45,
    mode,
    style: '编辑式工程图',
    form: '二维图解',
  });
  const root = store.dir(p.id);
  const input = localPath(root, 'inputs/demo');
  await mkdir(input, { recursive: true });
  const svg = localPath(root, 'inputs/demo/reference.svg');
  await writeFile(svg, art(0), 'utf8');
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    sharp = require(resolve(process.env.EVIDENCE_VIDEO_NODE_MODULES || 'node_modules', 'sharp'));
  }
  await sharp(svg).resize(700).png().toFile(localPath(root, 'inputs/demo/reference.png'));
  await store.update(p.id, (q) => {
    q.demo = true;
    q.seededAt = stamp();
  });
  const runner = new Runner(store, { agent: demoAgent, env });
  const job = await runner.launch(p.id);
  if (wait) await job.done;
  return store.get(p.id);
}

export async function demoAgent({ task, work }) {
  const { stage, artifactPrefix } = task;
  if (stage === 'brief')
    return {
      productionMethod: {
        form: '二维图解',
        reason: '题目是原理说明，二维工程图能在一屏内讲清相机、地形和路径的关系。',
        effort: '约半天',
        risk: '需要保持三镜的线宽与字号一致。',
      },
      styleDirections: [
        {
          id: 'A',
          name: '编辑式工程图',
          rationale: '深色底、细线框和等宽数字，适合把传感器与路径画在同一套坐标里。',
          refs: [{ sourceId: 'S00', use: '沿用工程制图的底色、线宽与标注方式' }],
        },
      ],
      recommendedDirection: 'A',
      budget: { currency: 'USD', cap: 0, categories: [] },
      allowPaidGeneration: false,
      sources: [
        {
          id: 'S00',
          title: '示例工程图参考',
          kind: '原创美术参考',
          file: 'inputs/demo/reference.svg',
          image: 'inputs/demo/reference.png',
          rights: '示例原创资产。',
        },
      ],
    };
  if (stage === 'research') return research;
  if (stage === 'script') return script;
  if (stage === 'design') return design;
  if (stage === 'revisionPlan')
    return {
      changes: task.currentCut.shots
        .filter((s) => task.notes.some((n) => n.shotIds.includes(s.id)))
        .map((s) => {
          const note = task.notes.find((n) => n.shotIds.includes(s.id));
          return {
            id: s.id,
            instruction: '根据批注重新表现绕行线与区域的相对位置。',
            ...(note.override || {}),
          };
        }),
    };
  const renders = [];
  for (const [i, shot] of task.design.entries()) {
    if (stage === 'revision' && !task.affected.includes(shot.id)) continue;
    const name = shot.id + '-art.svg';
    await writeFile(resolve(work, name), art(i, stage === 'revision'), 'utf8');
    renders.push({
      id: shot.id,
      file: artifactPrefix + name,
      referenceIds: [...new Set(shot.references.map((r) => r.sourceId))],
      checks: shot.mustShow.map((item) => ({
        item,
        frame: Math.min(15, shot.endFrame - shot.startFrame - 1),
        evidence: '原理示意中的图形对应已审分镜',
      })),
      motion: 'push',
      tools: ['原创 SVG 图解', 'FFmpeg'],
      editable: [artifactPrefix + name],
    });
  }
  return { renders, summary: '自制工程图示意。' };
}
