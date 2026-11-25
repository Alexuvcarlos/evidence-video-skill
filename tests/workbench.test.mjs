import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  Store,
  STAGES,
  MODES,
  projectFrom,
  setStage,
  nextStage,
  decide,
  changeMode,
  validateDesign,
  validateResearch,
  validateBrief,
  validateRenders,
  localPath,
  activeCut,
  writeJson,
} from '../lib/workflow.mjs';
import { Runner, startRevision } from '../lib/runner.mjs';
import { doctor } from '../lib/doctor.mjs';
import { demoAgent } from '../lib/demo.mjs';
import { research, script, design, art } from '../examples/mars.mjs';
import { inspect, capture, captionLines } from '../lib/media.mjs';

const input = (mode) => ({ title: '流程测试', topic: '用渲染样片验证逐步复核', seconds: 30, mode });

test('三种审阅模式停在对应版本，并拒绝旧版批准', () => {
  for (const config of Object.keys(MODES)) {
    const p = projectFrom(input(config));
    assert.equal(nextStage(p), 'brief');
    for (const stage of STAGES) {
      const revision = setStage(p, stage, {});
      if (MODES[config].gates.includes(stage)) {
        assert.equal(nextStage(p), null);
        assert.throws(() => decide(p, { stage, revision: 'stale', decision: 'accept' }), /更新/);
        decide(p, { stage, revision, decision: 'accept', via: 'workbench' });
      } else assert.equal(p.gate, null);
    }
    assert.equal(nextStage(p), null);
    assert.deepEqual(
      p.decisions.filter((d) => d.decision === 'accept').map((d) => d.stage),
      MODES[config].gates.filter((g) => STAGES.includes(g)),
    );
  }
});
test('从逐步改成自动后放行，人工退回只重做后续阶段', () => {
  const p = projectFrom(input('detailed'));
  setStage(p, 'brief', {});
  setStage(p, 'research', {});
  changeMode(p, 'auto');
  assert.equal(nextStage(p), 'script');
  setStage(p, 'script', {});
  changeMode(p, 'balanced');
  const revision = setStage(p, 'design', {});
  decide(p, {
    stage: 'design',
    revision,
    decision: 'revise',
    message: '布局按真实来源重新安排',
    via: 'workbench',
  });
  assert.equal(nextStage(p), 'design');
  assert.ok(p.stages.research && p.stages.script && !p.stages.design);
  assert.equal(p.directions.at(-1).message, '布局按真实来源重新安排');
});
test('证明不足、真实场景无参考、失实稿位均会被拦截', () => {
  const invalid = structuredClone(research);
  invalid.claims[0].evidence = [];
  assert.throws(() => validateResearch(invalid), /缺少原文/);
  const p = projectFrom(input('auto'));
  setStage(p, 'research', research);
  setStage(p, 'script', script);
  const shots = structuredClone(design.shots);
  shots[0].form = '写实三维';
  assert.throws(() => validateDesign({ shots }, p), /缺少现实参考/);
  shots[0].form = '原网页';
  assert.throws(() => validateDesign({ shots }, p), /缺少入片原网页/);
  shots[0].form = '二维图解';
  shots[0].references = shots[0].references.filter((ref) => ref.role === 'style');
  assert.throws(() => validateDesign({ shots }, p), /缺少内容依据/);
  assert.throws(
    () => validateRenders([{ id: shots[0].id, file: 'shot.mp4', referenceIds: [] }], [shots[0]]),
    /必要参考/,
  );
  assert.throws(() => validateRenders([], shots), /范围一致/);
  assert.throws(() => localPath('/tmp/test', '../out'), /项目内/);
});

test('当前对话写回阶段产物后，仍按所选档位停在审核点', { timeout: 10000 }, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'evidence-video-handoff-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const store = new Store(temp);
  const p = await store.create({ ...input('detailed'), driver: 'current' });
  await store.update(p.id, (q) => {
    q.stages.brief = {
      revision: 'brief-seed',
      completedAt: 'now',
      data: {
        productionMethod: { form: '二维图解' },
        styleDirections: [],
        budget: { currency: 'USD', cap: 0, categories: [] },
        allowPaidGeneration: false,
      },
    };
  });
  const runner = new Runner(store, {
    env: async () => ({ at: 'test', bins: {}, services: [], mcp: [] }),
  });
  const control = await runner.launch(p.id);
  t.after(() => runner.cancel(p.id));
  let q;
  const deadline = Date.now() + 5000;
  do {
    q = await store.get(p.id);
    assert.notEqual(q.job?.state, 'failed', q.job?.message);
    if (q.job?.handoff) break;
    if (Date.now() > deadline) throw new Error('未分配对话任务');
    await new Promise((resolve) => setTimeout(resolve, 30));
  } while (true);
  assert.match(q.job.handoff, /证据检索/);
  await writeJson(join(q.job.taskFile, '..', 'result.json'), {
    ...research,
    sources: research.sources.slice(0, 2),
  });
  await control.done;
  q = await store.get(p.id);
  assert.equal(q.gate.stage, 'research');
  assert.match(q.job.message, /等待你在工作台确认/);
});


test('简报要求带图的美术参考，预算与付费授权自洽', () => {
  const brief = {
    productionMethod: { form: '二维图解', reason: '原理说明用二维工程图。' },
    styleDirections: [
      {
        id: 'A',
        name: '编辑式工程图',
        rationale: '深色底与细线框。',
        refs: [{ sourceId: 'S00', use: '沿用版式与线宽' }],
      },
    ],
    recommendedDirection: 'A',
    budget: { currency: 'USD', cap: 0, categories: [] },
    allowPaidGeneration: false,
    sources: [
      {
        id: 'S00',
        title: '版式参考',
        kind: '美术参考',
        url: 'https://example.com/ref',
        imageUrl: 'https://example.com/ref.jpg',
      },
    ],
  };
  assert.doesNotThrow(() => validateBrief(brief));
  const noImage = structuredClone(brief);
  noImage.sources[0].imageUrl = '';
  assert.throws(() => validateBrief(noImage), /需要有图片/);
  const paid = structuredClone(brief);
  paid.allowPaidGeneration = true;
  paid.budget.cap = 0;
  assert.throws(() => validateBrief(paid), /大于 0/);
});
test('分镜必须有带图美术参考，三维现实参考要与事实一致或说明', () => {
  const p = projectFrom(input('auto'));
  p.stages.brief = {
    revision: 'brief-test',
    completedAt: 'now',
    data: {
      productionMethod: { form: '二维图解' },
      styleDirections: [],
      budget: { currency: 'USD', cap: 0, categories: [] },
      allowPaidGeneration: false,
    },
  };
  setStage(p, 'research', research);
  setStage(p, 'script', script);
  const noStyleImage = structuredClone(design);
  noStyleImage.shots[0].references = noStyleImage.shots[0].references.filter(
    (ref) => ref.sourceId !== 'S03',
  );
  assert.throws(() => validateDesign(noStyleImage, p), /带图的美术参考/);
  const three = structuredClone(design);
  three.shots[0].form = '写实三维';
  three.shots[0].references = [
    { sourceId: 'S02', role: 'evidence', locator: '原图说明', use: '核对左右相机' },
    { sourceId: 'S03', role: 'style', locator: '原设计', use: '沿用配色' },
    { sourceId: 'S03', role: 'reality', locator: '最接近的场景', use: '参考光照与地貌' },
  ];
  assert.throws(() => validateDesign(three, p), /与旁白事实不一致/);
  three.shots[0].realityMatch = {
    consistent: false,
    note: '公开资料没有同一角度的现场照片。',
    closest: '同一台火星车的导航相机地形图',
  };
  assert.doesNotThrow(() => validateDesign(three, p));
});
test('确认只能由工作台页面发起', () => {
  const p = projectFrom(input('balanced'));
  const revision = setStage(p, 'brief', {});
  assert.throws(() => decide(p, { stage: 'brief', revision, decision: 'accept' }), /工作台/);
  decide(p, { stage: 'brief', revision, decision: 'accept', via: 'workbench' });
  assert.equal(p.gate, null);
});
test('字幕断行不拆数字与百分比', () => {
  const text = '第一层是需求脉冲：十月最后一周，Flash 调用量环比涨 801%。';
  const lines = captionLines(text, 31);
  assert.equal(lines.join(''), text);
  assert.ok(lines.every((line) => !/\d$/.test(line.trim()) || !/^\d/.test(lines[lines.indexOf(line) + 1] || '')));
  assert.ok(lines.some((line) => line.includes('801%')));
});

test('分镜必须写动效方案，不能只靠镜头推拉', () => {
  const p = projectFrom(input('auto'));
  p.stages.brief = {
    revision: 'brief-test',
    completedAt: 'now',
    data: {
      productionMethod: { form: '二维图解' },
      styleDirections: [],
      budget: { currency: 'USD', cap: 0, categories: [] },
      allowPaidGeneration: false,
    },
  };
  setStage(p, 'research', research);
  setStage(p, 'script', script);
  const none = structuredClone(design);
  none.shots.forEach((shot) => delete shot.motionPlan);
  assert.throws(() => validateDesign(none, p), /动效方案/);
  const allCamera = structuredClone(design);
  allCamera.shots.forEach((shot) => {
    shot.motionPlan = { type: 'camera', description: '缓慢推近', beats: ['起', '止'] };
  });
  assert.throws(() => validateDesign(allCamera, p), /至少一半镜头/);
  allCamera.shots[0].motionPlan.type = 'build';
  allCamera.shots[1].motionPlan.type = 'kinetic-type';
  assert.doesNotThrow(() => validateDesign(allCamera, p));
});
test('退回分镜修改时保留上一版供查看', () => {
  const p = projectFrom(input('balanced'));
  p.stages.brief = {
    revision: 'brief-test',
    completedAt: 'now',
    data: {
      productionMethod: { form: '二维图解' },
      styleDirections: [],
      budget: { currency: 'USD', cap: 0, categories: [] },
      allowPaidGeneration: false,
    },
  };
  setStage(p, 'research', research);
  setStage(p, 'script', script);
  const revision = setStage(p, 'design', { shots: design.shots });
  decide(p, {
    stage: 'design',
    revision,
    decision: 'revise',
    message: '字号再大一点',
    via: 'workbench',
  });
  assert.equal(p.stages.design, undefined);
  assert.equal(p.lastDesign.shots.length, design.shots.length);
});

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  if (process.env.EVIDENCE_VIDEO_NODE_MODULES)
    sharp = require(join(process.env.EVIDENCE_VIDEO_NODE_MODULES, 'sharp'));
}
function wav(sec, hz) {
  const n = 48000 * sec;
  const data = Buffer.alloc(44 + n * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(48000, 24);
  data.writeUInt32LE(96000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * hz) / 48000) * 2400), 44 + i * 2);
  return data;
}
test('实际生成短片、按批注重做一个镜头、保留其余镜头并更新交付', { timeout: 120000 }, async (t) => {
  const env = await doctor({});
  if (!env.available || !sharp) return t.skip('集成测试需要 FFmpeg、FFprobe 和 sharp');
  const temp = await mkdtemp(join(tmpdir(), 'evidence-video-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const store = new Store(temp);
  const p = await store.create(input('balanced'));
  await store.update(p.id, (q) => {
    q.demo = true;
  });
  const root = store.dir(p.id);
  const stageCalls = [];
  const runner = new Runner(store, {
    env: async () => env,
    agent: async (args) => {
      const { task, work } = args;
      stageCalls.push(task.stage);
      if (task.stage === 'brief')
        return {
          productionMethod: { form: '二维图解', reason: '原理示意，用二维工程图。' },
          styleDirections: [
            {
              id: 'A',
              name: '编辑式工程图',
              rationale: '深色底与细线框，便于把路线和地形画在同一屏。',
              refs: [{ sourceId: 'S00', use: '沿用底色、线宽与标注' }],
            },
          ],
          recommendedDirection: 'A',
          budget: { currency: 'USD', cap: 0, categories: [] },
          allowPaidGeneration: false,
          sources: [
            {
              id: 'S00',
              title: '示例美术参考',
              kind: '原创美术参考',
              url: 'https://science.nasa.gov/missions/mars-2020-perseverance/',
              imageUrl: 'https://science.nasa.gov/example.jpg',
            },
          ],
        };
      if (task.stage === 'research')
        return {
          ...research,
          sources: research.sources.map((source) =>
            source.id === 'S03'
              ? {
                  ...source,
                  file: undefined,
                  image: undefined,
                  url: 'https://science.nasa.gov/missions/mars-2020-perseverance/',
                  imageUrl: 'https://science.nasa.gov/example.png',
                }
              : source,
          ),
        };
      if (task.stage === 'script') {
        const cues = [];
        for (const [i, cue] of script.cues.entries()) {
          const name = 'voice-' + i + '.wav';
          await writeFile(join(work, name), wav(2, 350 + i * 45));
          cues.push({ ...cue, audio: task.artifactPrefix + name });
        }
        return { cues, voiceProvider: '测试音轨' };
      }
      if (task.stage === 'design') return design;
      return demoAgent(args);
    },
  });
  async function run() {
    const job = await runner.launch(p.id);
    await job.done;
    const q = await store.get(p.id);
    assert.notEqual(q.job?.state, 'failed', q.job?.message);
    return q;
  }
  let q = await run();
  assert.deepEqual(stageCalls, ['brief']);
  assert.equal(q.gate.stage, 'brief');
  await store.update(p.id, (v) =>
    decide(v, { ...q.gate, decision: 'accept', via: 'workbench' }),
  );
  q = await run();
  assert.deepEqual(stageCalls, ['brief', 'research', 'script', 'design']);
  assert.equal(q.gate.stage, 'design');
  await store.update(p.id, (v) =>
    decide(v, { ...q.gate, decision: 'accept', via: 'workbench' }),
  );
  q = await run();
  assert.equal(q.gate.stage, 'production');
  const first = activeCut(q);
  assert.equal(first.shots.length, 3);
  for (const { checks } of first.shots)
    for (const check of checks) assert.ok((await stat(localPath(root, check.image))).size > 200);
  const data = await inspect(env.bins, localPath(root, first.video));
  assert.equal(Number(data.video.nb_frames), first.frames);
  assert.ok(data.audio && data.subtitle);
  await capture(
    env.bins,
    localPath(root, first.video),
    first.shots[1].startFrame + 15,
    join(root, 'proof.jpg'),
  );
  assert.ok((await stat(join(root, 'proof.jpg'))).size > 200);
  await store.update(p.id, (v) =>
    decide(v, { ...q.gate, decision: 'accept', via: 'workbench' }),
  );
  q = await run();
  assert.ok(q.stages.delivery);
  assert.ok(
    (await readFile(localPath(root, q.stages.delivery.data.evidence), 'utf8')).includes(
      'https://science.nasa.gov/',
    ),
  );

  await store.update(p.id, (v) => {
    v.lockedShots = { SHOT01: { file: first.shots[0].file } };
    v.notes.push({
      id: 'note-1',
      version: first.revision,
      shotIds: ['SHOT02'],
      at: 'now',
      status: 'open',
      text: '调整路线',
      first: first.shots[1].startFrame,
      last: first.shots[1].startFrame,
    });
    startRevision(v);
  });
  q = await run();
  assert.equal(q.gate.stage, 'revision');
  const revised = activeCut(q);
  assert.notEqual(revised.shots[1].file, first.shots[1].file);
  assert.equal(revised.shots[0].file, first.shots[0].file);
  assert.equal(revised.shots[2].file, first.shots[2].file);
  assert.equal(revised.frames, first.frames);
  assert.equal(revised.audio, first.audio);
  await store.update(p.id, (v) =>
    decide(v, { ...q.gate, decision: 'accept', via: 'workbench' }),
  );
  q = await run();
  assert.equal(q.stages.delivery.data.approvedCut, revised.revision);
  assert.equal(q.notes[0].status, 'resolved');
  assert.equal(q.notes[0].resultVersion, revised.revision);
  const delivery = await inspect(env.bins, localPath(root, q.stages.delivery.data.video));
  assert.equal(Number(delivery.video.nb_frames), first.frames);
  assert.ok(delivery.audio);
});
