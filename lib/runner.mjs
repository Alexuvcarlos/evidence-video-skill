import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, appendFile, copyFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctor } from './doctor.mjs';
import { assemble, makeNarration, renderShot, timedShots, copyCutCaptions } from './media.mjs';
import { exportReports, exportPdfs } from './reports.mjs';
import {
  ensure,
  localPath,
  existingPath,
  writeJson,
  readJson,
  allSources,
  validateResearch,
  validateScript,
  validateBrief,
  spentTotal,
  validateDesign,
  validateRenders,
  validateReferences,
  validateSources,
  MODES,
  TITLES,
  CAPABILITY_KINDS,
  nextStage,
  setStage,
  activeCut,
  makeId,
  stamp,
  uniq,
} from './workflow.mjs';

const JOB_HELP = new URL('../.agents/skills/evidence-video/references/jobs.md', import.meta.url);
const PREVIEW_STILL = fileURLToPath(new URL('../scripts/preview-still.mjs', import.meta.url));
const FINISHED = new Set(['resolved', 'closed']);
const envFile = 'tools.json';

export class Runner {
  constructor(store, { agent, env } = {}) {
    this.store = store;
    this.live = new Map();
    this.agent = agent || executeAgent;
    this.probe = env || doctor;
  }
  async setup(id, refresh = false) {
    const root = this.store.dir(id);
    let config = {};
    try {
      config = await readJson(resolve(root, envFile));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return this.probe(config, refresh);
  }
  async launch(id) {
    ensure(!this.live.has(id), 'Agent 已在制作这个项目。', 409);
    const p = await this.store.get(id);
    ensure(!p.gate, '请先处理当前审阅。', 409);
    ensure(nextStage(p), '当前项目已交付。可从审阅页发起修订。', 409);
    const controller = new AbortController();
    this.live.set(id, controller);
    const done = this.loop(id, controller.signal).finally(() => {
      if (this.live.get(id) === controller) this.live.delete(id);
    });
    controller.done = done;
    return controller;
  }
  cancel(id) {
    this.live.get(id)?.abort();
  }
  isLive(id) {
    return this.live.has(id);
  }

  async loop(id, signal) {
    const root = this.store.dir(id);
    let stage = 'environment';
    let env;
    try {
      await this.store.update(id, (p) => {
        p.job = { stage, state: 'running', message: '检查制作环境', at: stamp() };
      });
      env = await this.setup(id, true);
      await this.store.update(id, (p) => {
        p.environment = { at: env.at, services: env.services };
        p.capabilities = mergeCapabilityMap(p.capabilities, env.capabilities);
      });
      while (!signal.aborted) {
        const p = await this.store.get(id);
        stage = nextStage(p);
        if (!stage) break;
        const jobId = makeId('run');
        const run = 'runs/' + jobId;
        const work = localPath(root, run);
        await mkdir(work, { recursive: true });
        await this.store.update(id, (q) => {
          q.job = { id: jobId, stage, state: 'running', message: TITLES[stage], at: stamp() };
        });
        try {
          if (signal.aborted) break;
          if (stage === 'delivery') await this.finish(id, p, root, env, run, signal);
          else await this.phase(id, p, stage, root, env, run, signal);
        } catch (e) {
          await writeFile(resolve(work, 'error.txt'), String(e.stack || e), 'utf8');
          throw e;
        }
      }
      await this.store.update(id, (p) => {
        if (signal.aborted)
          p.job = {
            stage,
            state: 'cancelled',
            message: '本轮已暂停。可从已保存的阶段继续。',
            at: stamp(),
          };
        else
          p.job = {
            stage: stage || p.gate?.stage || 'delivery',
            state: 'done',
            message: p.gate
              ? responseFor(p, p.gate.stage, true)
              : p.stages.delivery
                ? responseFor(p, 'delivery')
                : '本轮阶段已完成。',
            at: stamp(),
          };
      });
    } catch (error) {
      await this.store.update(id, (p) => {
        p.job = {
          ...(p.job || {}),
          stage,
          state: signal.aborted ? 'cancelled' : 'failed',
          at: stamp(),
          message: signal.aborted ? '本轮已暂停。' : String(error.message || error).slice(0, 1100),
        };
      });
    }
  }

  async phase(id, p, stage, root, env, run, signal) {
    const work = localPath(root, run);
    let narration = p.stages.design?.data.narration || p.narration;
    if (stage === 'design' && (!narration || p.narrationScript !== p.stages.script.revision)) {
      ensure(env.available, '需要先配置 FFmpeg 和 FFprobe，才能从旁白建立时间线。');
      narration = await makeNarration(root, env, p.stages.script.data, p, run);
      await this.store.update(id, (q) => {
        q.narration = narration;
        q.narrationScript = p.stages.script.revision;
      });
    }
    const cut = p.revision ? p.versions.find((c) => c.revision === p.revision.base) : activeCut(p);
    const notes = p.revision ? p.notes.filter((n) => p.revision.noteIds.includes(n.id)) : [];
    const task = {
      schema: 1,
      id: run.split('/').at(-1),
      stage,
      title: p.title,
      mode: MODES[p.mode].name,
      driver: p.driver || 'codex',
      nextConfirmation: MODES[p.mode].gates.includes(stage)
        ? TITLES[stage]
        : MODES[p.mode].gates.find((g) => order(g) > order(stage))
          ? TITLES[MODES[p.mode].gates.find((g) => order(g) > order(stage))]
          : '按当前档位继续',
      brief: p.brief,
      budget: p.brief.budget,
      spend: p.spend || [],
      capabilities: p.capabilities || {},
      briefSources: p.briefSources || [],
      projectRoot: root,
      resultDirectory: work,
      artifactPrefix: run + '/',
      tools: {
        binaries: env.bins,
        mcp: p.driver === 'clean' ? [] : env.mcp,
        localVoice: env.localVoice,
        desktopSpeech: env.desktopSpeech,
        espeak: env.espeak,
        previewStill: PREVIEW_STILL,
        workbenchVoice: Boolean(
          env.available &&
            (env.espeak ||
              (env.desktopSpeech &&
                (!p.brief.language.startsWith('zh') || p.brief.voice || env.localVoice))),
        ),
      },
      inputs: p.inputs,
      directions: p.directions.filter((d) => d.stage === stage),
      sources: allSources(p),
      research: p.stages.research?.data,
      script: p.stages.script?.data,
      narration,
      design: p.stages.design?.data?.shots,
      currentCut: cut,
      notes,
      revisionPlan: p.stages.revisionPlan?.data,
    };
    if (stage === 'revision' && task.revisionPlan) {
      task.design = task.revisionPlan.shots;
      task.affected = task.revisionPlan.affected;
    }
    if (stage === 'production') {
      task.lockedShots = Object.keys(p.lockedShots || {});
      task.affected = task.design.filter((s) => !task.lockedShots.includes(s.id)).map((s) => s.id);
    }
    const taskFile = resolve(work, 'task.json');
    await writeJson(taskFile, task);
    await writeFile(resolve(work, 'WORKFLOW.md'), await readFile(JOB_HELP, 'utf8'), 'utf8');
    if (signal.aborted) return;
    ensure(
      p.driver === 'current' ||
        env.bins.codex ||
        process.env.EVIDENCE_VIDEO_AGENT ||
        this.agent !== executeAgent,
      '请先连接本机 Codex，或在制作环境中选择「当前对话」。',
    );
    let lastUpdate = 0;
    const log = async (message, force = false) => {
      if (force || Date.now() - lastUpdate > 1100) {
        lastUpdate = Date.now();
        await this.store.update(id, (q) => {
          if (q.job?.state === 'running') q.job.detail = message.trim().slice(0, 600);
        });
      }
    };
    const result =
      stage === 'production' && !task.affected.length
        ? { renders: [], summary: '复用全部已锁镜头。' }
        : p.driver === 'current'
          ? await this.externalTurn(id, p, stage, root, taskFile, work, signal)
          : await this.agent({ env, task, taskFile, work, signal, log });
    if (signal.aborted) return;
    ensure(result && typeof result === 'object', 'Agent 还没有写入本阶段的结果。');
    if (result.blocked) throw new Error(String(result.blocked));
    // The result is admitted only after paths, evidence, offsets and file specs are checked.
    await this.commit(id, p, stage, result, root, env, run, signal);
  }

  async externalTurn(id, p, stage, root, taskFile, work, signal) {
    const statePath = resolve(root, 'project.json');
    const prompt = [
      '请继续《' + p.title + '》的「' + TITLES[stage] + '」阶段。',
      '项目：' + p.id,
      '在工作台目录运行 `node bin/agent.mjs next --project ' + p.id + '` 获取任务，完成后把 result.json 写回任务目录。',
      '确认与修改都在工作台完成；不要在对话里收集批准。',
    ].join('\n');
    await this.store.update(id, (q) => {
      q.job.handoff = prompt;
      q.job.taskFile = taskFile;
      q.job.detail = '把任务发给当前对话中的 Agent。提交结果后，工作台会自动校验并继续。';
    });
    const until = Date.now() + 35 * 60 * 1000;
    while (!signal.aborted && Date.now() < until) {
      try {
        return await readJson(resolve(work, 'result.json'));
      } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 550));
    }
    throw new Error(signal.aborted ? '任务已暂停。' : '等待当前 Agent 提交结果已超时，可从工作台继续。');
  }

  async commit(id, p, stage, result, root, env, run, signal) {
    if (stage === 'brief') {
      const data = validateBrief(
        result,
        allSources(p).map((source) => source.id),
      );
      await files(
        root,
        (result.sources || []).flatMap((source) => [source.file, source.image]).filter(Boolean),
      );
      await this.store.update(id, (q) => {
        q.briefSources = [...(q.briefSources || []), ...(result.sources || [])];
        q.brief.productionMethod = data.productionMethod.form;
        q.brief.styleDirectionId = data.recommendedDirection;
        q.brief.budget = data.budget;
        q.brief.allowPaidGeneration = data.allowPaidGeneration;
        if (data.capabilities.length) q.capabilities = mergeCapabilities(q.capabilities, data.capabilities);
        setStage(q, stage, {
          ...data,
          sources: result.sources || [],
          questions: Array.isArray(result.questions) ? result.questions : [],
        });
      });
      return;
    }
    if (stage === 'research') {
      validateResearch(result);
      await files(root, result.sources.flatMap((s) => [s.file, s.image]).filter(Boolean));
      await this.store.update(id, (q) => {
        q.addedSources = [];
        setStage(q, stage, result);
      });
      return;
    }
    if (stage === 'script') {
      validateScript(result, p);
      ensure(Boolean(result.audio) === Boolean(result.subtitles), '导入完整旁白时须同时提供对应字幕。');
      if (result.cues.some((c) => c.audio))
        ensure(
          result.cues.every((c) => c.audio),
          '语音片段要覆盖全部旁白。',
        );
      await files(
        root,
        [result.audio, result.subtitles, ...result.cues.map((c) => c.audio)].filter(Boolean),
      );
      let voice = null,
        timingIssue = '';
      if (
        env.available &&
        (env.desktopSpeech || env.espeak || result.audio || result.cues.every((c) => c.audio))
      ) {
        try {
          voice = await makeNarration(root, env, result, p, run);
        } catch (error) {
          timingIssue = String(error.message || error);
        }
      } else timingIssue = '配置配音和视频工具后可生成时轴。';
      if (signal.aborted) return;
      await this.store.update(id, (q) => {
        const version = setStage(q, stage, result);
        q.narration = voice;
        q.narrationIssue = timingIssue;
        q.narrationScript = voice ? version : null;
      });
      return;
    }
    if (stage === 'design') {
      validateDesign(result, p);
      await files(root, [
        ...(result.sources || []).flatMap((s) => [s.file, s.image]).filter(Boolean),
        ...result.shots.map((shot) => shot.styleFrame).filter(Boolean),
      ]);
      await this.store.update(id, (q) => {
        q.addedSources = [...(q.addedSources || []), ...(result.sources || [])];
        setStage(q, stage, {
          rationale: result.rationale || '',
          shots: timedShots(result.shots, q.narration.cues),
          narration: q.narration,
        });
      });
      return;
    }
    if (stage === 'revisionPlan') {
      const cut = p.versions.find((v) => v.revision === p.revision?.base);
      ensure(cut, '找不到批注对应的视频版本。');
      const notes = p.notes.filter((n) => p.revision.noteIds.includes(n.id));
      const affected = uniq(notes.flatMap((n) => n.shotIds));
      const changes = result.changes;
      ensure(
        Array.isArray(changes) &&
          changes.length === affected.length &&
          affected.every((id) => changes.filter((c) => c.id === id).length === 1),
        '修改方案必须逐一覆盖指定镜头。',
      );
      const refs = allSources(p);
      validateSources(
        result.sources || [],
        refs.map((s) => s.id),
      );
      await files(root, (result.sources || []).flatMap((s) => [s.file, s.image]).filter(Boolean));
      const sourceIds = new Set([...refs, ...(result.sources || [])].map((s) => s.id));
      const shots = cut.shots.map((old) => {
        const plan = changes.find((c) => c.id === old.id);
        if (!plan) return old;
        ensure(plan.instruction?.trim(), old.id + ' 缺少具体修改内容。');
        for (const n of notes.filter((n) => n.shotIds.includes(old.id) && n.override)) {
          for (const [key, value] of Object.entries(n.override))
            ensure(plan[key] === value, old.id + ' 须应用用户选择的' + key + '。');
        }
        const updated = {
          ...old,
          visual: old.visual + '\n本轮修改 · ' + plan.instruction,
          references: plan.references || old.references,
          mustShow: plan.mustShow || old.mustShow,
          style: plan.style || old.style,
          form: plan.form || old.form,
          onScreen: plan.onScreen || old.onScreen,
        };
        validateReferences(updated.references, sourceIds, old.id);
        return updated;
      });
      validateDesign({ shots, sources: result.sources || [] }, p);
      await this.store.update(id, (q) => {
        q.addedSources = [...(q.addedSources || []), ...(result.sources || [])];
        setStage(q, stage, { changes, shots, affected });
      });
      return;
    }
    ensure(['production', 'revision'].includes(stage), '阶段无效。');
    const revision = stage === 'revision';
    const plan = revision ? p.stages.revisionPlan.data.shots : p.stages.design.data.shots;
    const wanted = revision
      ? p.stages.revisionPlan.data.affected
      : plan.filter((s) => !p.lockedShots?.[s.id]).map((s) => s.id);
    validateRenders(result.renders, plan, wanted);
    const renders = new Map(result.renders.map((r) => [r.id, r]));
    const output = [];
    ensure(env.available, '视频工具还未就绪，请先配置 FFmpeg 与 FFprobe。');
    for (const shot of plan) {
      if (signal.aborted) return;
      const record = renders.get(shot.id);
      if (!record) {
        if (revision) output.push(shot);
        else {
          const file = p.lockedShots[shot.id].file;
          const locked = p.versions.flatMap((v) => v.shots).find((s) => s.file === file);
          ensure(
            locked && locked.startFrame === shot.startFrame && locked.endFrame === shot.endFrame,
            shot.id + ' 锁定素材与当前切点不一致。',
          );
          output.push(locked);
        }
        continue;
      }
      ensure(record.file.startsWith(run + '/'), shot.id + ' 候选画面应保存在本轮的新目录。');
      if (p.rules?.motion && !p.demo && shot.motionPlan?.type && shot.motionPlan.type !== 'camera') {
        const ext = String(record.file).split('.').pop().toLowerCase();
        ensure(
          !['svg', 'png', 'jpg', 'jpeg', 'webp'].includes(ext),
          shot.id + ' 的动效方案是 ' + shot.motionPlan.type + '，需要交动画视频，不能交静态图。',
        );
      }
      await files(root, [...(record.editable || [])]);
      await this.store.update(id, (q) => {
        q.job.detail = '正在校验 ' + shot.id + ' ' + shot.title;
      });
      output.push(await renderShot(root, env, p, shot, record, run));
    }
    if (signal.aborted) return;
    const cut = await assemble(root, env, p, output, p.stages.design.data.narration, run);
    cut.rationale = result.summary || '';
    await this.store.update(id, (q) => {
      const version = setStage(q, stage, cut);
      const created = {
        ...cut,
        revision: version,
        createdAt: stamp(),
        description: revision ? '批注修订' : '完整预览',
      };
      q.versions.push(created);
      if (revision)
        for (const note of q.notes.filter((n) => q.revision.noteIds.includes(n.id)))
          note.proposedVersion = version;
    });
  }

  async finish(id, p, root, env, run, signal) {
    const cut = activeCut(p);
    ensure(cut, '还没有可交付的全片预览。');
    const cap = Number(p.brief?.budget?.cap || 0);
    const spent = spentTotal(p);
    ensure(spent <= cap + 1e-6, '已登记花费 ' + spent + ' 超过预算上限 ' + cap + '。');
    const burns = p.brief.burnSubtitles !== false;
    const candidate = await assemble(root, env, p, cut.shots, p.stages.design.data.narration, run, {
      burn: burns,
    });
    if (signal.aborted) return;
    const files = {
      video: candidate.video,
      srt: run + '/字幕.srt',
      evidence: run + '/证据溯源清单.html',
      process: run + '/制作与人机分工.html',
      timeline: run + '/镜头时间线.json',
    };
    await exportReports(root, p, candidate, run);
    const pdfs = await exportPdfs(root, env, run);
    files.evidencePdf = pdfs.find((s) => s.endsWith('/证据溯源清单.pdf')) || null;
    files.processPdf = pdfs.find((s) => s.endsWith('/制作与人机分工.pdf')) || null;
    await copyCutCaptions(root, candidate, run);
    await writeJson(localPath(root, files.timeline), {
      width: cut.width,
      height: cut.height,
      fps: cut.fps,
      frames: cut.frames,
      shots: cut.shots,
    });
    await this.store.update(id, (q) => {
      setStage(q, 'delivery', {
        ...files,
        frames: candidate.frames,
        fps: candidate.fps,
        width: candidate.width,
        height: candidate.height,
        approvedCut: cut.revision,
        burned: candidate.burned,
      });
      if (q.revision) {
        for (const note of q.notes.filter((n) => q.revision.noteIds.includes(n.id))) {
          note.status = 'resolved';
          note.resultVersion = cut.revision;
        }
        q.revision = null;
        delete q.stages.revisionPlan;
        delete q.stages.revision;
      }
    });
  }
}
function mergeCapabilityMap(current = {}, map = {}) {
  let next = { ...current };
  for (const [kind, items] of Object.entries(map || {})) {
    if (!CAPABILITY_KINDS.includes(kind) || !Array.isArray(items)) continue;
    next = mergeCapabilities(next, items.map((item) => ({ ...item, kind })));
  }
  return next;
}
function mergeCapabilities(current = {}, items = []) {
  const next = { ...current };
  for (const item of items) {
    if (!item || !item.kind || !CAPABILITY_KINDS.includes(item.kind)) continue;
    const list = [...(next[item.kind] || [])];
    const at = list.findIndex((entry) => entry.id === item.id);
    const value = {
      id: String(item.id || item.provider || item.kind).slice(0, 120),
      provider: String(item.provider || '').slice(0, 120),
      available: item.available !== false,
      note: String(item.note || '').slice(0, 500),
      cost: String(item.cost || '').slice(0, 200),
    };
    if (at >= 0) list[at] = value;
    else list.push(value);
    next[item.kind] = list;
  }
  return next;
}
const order = (stage) =>
  ['brief', 'research', 'script', 'design', 'production', 'revisionPlan', 'revision', 'delivery'].indexOf(
    stage,
  );
async function files(root, paths) {
  for (const file of paths) {
    const path = await existingPath(root, file);
    ensure((await stat(path)).isFile(), '素材必须是项目内文件。');
  }
}
function responseFor(p, stage, wait = false) {
  const mode = MODES[p.mode].name;
  if (wait) return mode + ' · ' + TITLES[stage] + '已完成。等待你在工作台确认。';
  if (stage === 'delivery') return mode + ' · 成片、字幕与溯源资料已保存。';
  return mode + ' · ' + TITLES[stage] + '已完成。继续下一步。';
}
export function startRevision(p, ids = []) {
  ensure(!p.gate, '请先处理当前版本的审阅。');
  ensure(!p.revision, '本轮批注已进入制作。');
  const cut = activeCut(p);
  ensure(cut && p.stages.production, '请先完成当前方案的全片预览。');
  const selected = p.notes.filter(
    (n) => !FINISHED.has(n.status) && n.version === cut.revision && (!ids.length || ids.includes(n.id)),
  );
  ensure(selected.length, '请在当前预览版添加需要处理的批注。');
  const locked = uniq(selected.flatMap((n) => n.shotIds)).filter((id) => p.lockedShots?.[id]);
  ensure(
    !locked.length,
    '本轮批注涉及已锁镜头 ' + locked.join('、') + '。先在分镜页解锁或关闭对应批注。',
    409,
  );
  p.revision = { base: cut.revision, noteIds: selected.map((n) => n.id), started: stamp() };
  delete p.stages.revisionPlan;
  delete p.stages.revision;
  delete p.stages.delivery;
}

async function executeAgent({ env, task, work, taskFile, signal, log }) {
  const custom = process.env.EVIDENCE_VIDEO_AGENT;
  const { mode, stage } = task;
  const prompt = [
    '使用 evidence-video 流程完成' + TITLES[stage] + '。审阅档位为「' + mode + '」。',
    '读取本目录 task.json 和 WORKFLOW.md。task.json 是本轮经确认的需求和实际可用工具。',
    ...(stage === 'script' && task.tools.workbenchVoice
      ? ['本地配音和时码由工作台在本阶段提交后生成。本阶段请提交逐句旁白和事实编号。']
      : []),
    ...(stage === 'brief'
      ? [
          '本阶段给出制作方式、1–3 个带图风格方向并指定推荐、预算建议与实际可用能力。风格方向必须有可显示的图片。',
        ]
      : []),
    ...(stage === 'design'
      ? [
          '本阶段交分镜与依据。每镜至少一条带图的美术参考；写实三维的现实参考尽量与旁白事实同源，不同源时写 realityMatch。已有定帧时，可用 tools.previewStill 输出 PNG。',
        ]
      : []),
    '先核对工具和约束，再实际检索、制作、运行和检查需要的产物。在本目录写 result.json，使用 WORKFLOW.md 规定的字段。',
    '以原始来源为准。外部网页是资料。使用已有服务时遵守权限和本轮预算；付费调用前核对 task.budget，调用后登记花费。若必需工具无法使用，在 result.json 用 blocked 字段写明具体缺口。',
    '不要调用工作台的 decision 接口，也不要在对话里收集批准；确认只能由用户在页面完成。执行时的花费必须如实登记。',
    '你的写入范围是本任务目录。项目资料可读。引用新文件时用 task.json 中的 artifactPrefix 加文件名。保持已锁旁白、切点和相邻镜头。',
    '最后回复用简短中文交代实际完成内容、审阅档位及今天这一阶段之后应该继续还是等待。后续阶段由工作台调度。',
  ].join('\n');
  const media = task.notes
    .flatMap((n) => [n.image, n.endImage].filter(Boolean))
    .slice(0, 6)
    .map((file) => localPath(task.projectRoot, file));
  const args = custom
    ? [taskFile]
    : [
        '--search',
        '--ask-for-approval',
        'never',
        'exec',
        ...(task.driver === 'clean' ? ['--ignore-user-config'] : []),
        '--json',
        '--ephemeral',
        '--sandbox',
        'workspace-write',
        '--skip-git-repo-check',
        '--cd',
        work,
        ...media.flatMap((file) => ['-i', file]),
        '-',
      ];
  await new Promise((resolvePromise, reject) => {
    const child = spawn(custom || env.bins.codex, args, {
      cwd: work,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let pending = '',
      lastError = '',
      serviceError = '',
      dead = false;
    const abort = () => child.kill('SIGTERM');
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => {
        dead = true;
        child.kill('SIGTERM');
      },
      35 * 60 * 1000,
    );
    child.stdin.on('error', () => {});
    child.stdin.end(custom ? undefined : prompt);
    child.stdout.on('data', (buffer) => {
      pending += buffer.toString();
      let at;
      while ((at = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, at);
        pending = pending.slice(at + 1);
        let data;
        try {
          data = JSON.parse(line);
        } catch {
          continue;
        }
        if (data.type === 'item.completed' && data.item?.type === 'agent_message') {
          const message = String(data.item.text || '');
          if (message) {
            void appendFile(resolve(work, 'agent.log'), message + '\n', 'utf8').catch(() => {});
            void log(message).catch(() => {});
          }
        }
        if (data.type === 'turn.failed')
          serviceError = String(data.error?.message || data.message || '').slice(0, 700);
        if (data.type === 'error')
          lastError = String(data.message || data.error?.message || lastError).slice(0, 700);
      }
      if (pending.length > 150000) pending = '';
    });
    child.stderr.on('data', (buffer) => {
      lastError = (lastError + buffer.toString()).slice(-1200);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(new Error('任务已暂停。'));
      else if (dead) reject(new Error('Agent 运行超时。当前阶段的产物保存在项目中。'));
      else if (code !== 0) {
        const relevant = (serviceError || lastError)
          .replace(/<!doctype[\s\S]*$|<html[\s\S]*$/i, '')
          .trim()
          .slice(0, 450);
        reject(new Error('Agent 尚未完成 · ' + (relevant || '退出代码 ' + code)));
      } else resolvePromise();
    });
    if (signal.aborted) abort();
  });
  return readJson(resolve(work, 'result.json')).catch((error) => {
    if (error.code === 'ENOENT')
      throw new Error('Agent 已退出，但没有提交 result.json。请查看本轮记录。');
    throw error;
  });
}
