import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, dirname, relative, resolve, sep } from 'node:path';

export const STAGES = ['brief', 'research', 'script', 'design', 'production', 'delivery'];
export const TITLES = {
  brief: '创作简报',
  research: '证据检索',
  script: '旁白与字幕',
  design: '分镜与美术',
  production: '镜头制作',
  delivery: '交付成片',
  revisionPlan: '修改方案',
  revision: '修改预览',
};
export const MODES = {
  auto: { name: '自动成片', hint: '从查证到交付连续完成', gates: [] },
  balanced: {
    name: '关键阶段检查',
    hint: '确认简报、分镜和完整预览',
    gates: ['brief', 'design', 'production', 'revision'],
  },
  detailed: {
    name: '逐步检查',
    hint: '每个阶段完成后确认',
    gates: [...STAGES, 'revisionPlan', 'revision'],
  },
};
export const FORMS = ['原网页', '现场影像', '二维图解', '写实三维', '生成示意', '混合动画'];
export const STYLES = ['由 Agent 推荐', '科技纪实', '编辑式工程图', '写实工业', '光学弥散', '温暖人文'];
export const CURRENCIES = ['USD', 'CNY'];
export const SPEND_CATEGORIES = ['tts', 'music', 'image', 'video'];
export const CAPABILITY_KINDS = ['tts', 'music', 'image', 'video', 'screenshot', 'vision'];
export const MOTION_TYPES = ['camera', 'build', 'kinetic-type', 'mixed', '3d', 'footage'];
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
export const isImageSource = (source) =>
  Boolean(source && (source.imageUrl || source.image || (source.file && IMAGE_EXT.test(source.file))));
export const ROLES = { evidence: '事实依据', reality: '现实参考', style: '美术参考', asset: '直接入片' };
export const uniq = (values) => [...new Set(values)];
export const makeId = (prefix) => prefix + '-' + randomUUID().slice(0, 12);
export const stamp = () => new Date().toISOString();

export class Problem extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function ensure(ok, message, status = 400) {
  if (!ok) throw new Problem(message, status);
}
const list = (value, name) => {
  ensure(Array.isArray(value), name + '必须是列表。');
  return value;
};
const text = (value, name) => {
  ensure(typeof value === 'string' && value.trim(), '请填写' + name + '。');
  return value.trim();
};
const itemId = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(value);

export function localPath(root, file) {
  ensure(
    typeof file === 'string' &&
      file.length &&
      !file.includes('\\') &&
      !file.includes('\0') &&
      !isAbsolute(file),
    '需要项目内的相对文件路径。',
  );
  const path = resolve(root, file);
  const rel = relative(root, path);
  ensure(
    rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel),
    '文件必须位于当前项目内。',
  );
  return path;
}
export async function existingPath(root, file) {
  const path = await realpath(localPath(root, file));
  const rel = relative(await realpath(root), path);
  ensure(
    rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel),
    '项目文件链接指向了外部位置。',
  );
  return path;
}
export const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(tmp, path);
}
export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function projectFrom(input) {
  const mode = input.mode || 'balanced';
  const seconds = Number(input.seconds ?? 45);
  const fps = Number(input.fps ?? 30);
  ensure(Object.hasOwn(MODES, mode), '请选择有效的审阅程度。');
  ensure(
    Number.isInteger(seconds) && seconds >= 10 && seconds <= 600,
    '时长请输入 10 到 600 秒之间的整数。',
  );
  ensure([24, 25, 30].includes(fps), '请选择 24、25 或 30 帧。');
  const resolution = input.resolution === '1080p' ? [1920, 1080] : [1280, 720];
  return {
    version: 1,
    schema: 2,
    id: makeId('project'),
    title: text(input.title, '项目名称').slice(0, 100),
    brief: {
      topic: text(input.topic, '创作需求').slice(0, 8000),
      audience: String(input.audience || '普通观众').slice(0, 250),
      seconds,
      fps,
      width: resolution[0],
      height: resolution[1],
      style: String(input.style || STYLES[0]).slice(0, 120),
      form: FORMS.includes(input.form) ? input.form : '',
      palette: String(input.palette || '').slice(0, 400),
      artLimits: String(input.artLimits || '').slice(0, 1600),
      voice: String(input.voice || '').slice(0, 120),
      language: String(input.language || 'zh-CN').slice(0, 20),
      briefNotes: '',
      allowPaidGeneration: false,
      budget: { currency: 'USD', cap: 0, categories: [] },
      styleDirectionId: '',
      productionMethod: '',
    },
    mode,
    driver: ['current', 'clean'].includes(input.driver) ? input.driver : 'codex',
    createdAt: stamp(),
    updatedAt: stamp(),
    stages: {},
    versions: [],
    notes: [],
    inputs: [],
    directions: [],
    decisions: [],
    lockedShots: {},
    job: null,
    gate: null,
    revision: null,
    capabilities: {},
    spend: [],
    briefSources: [],
    rules: { motion: 1, artRefs: 1 },
  };
}
const LEGACY_BRIEF = {
  legacy: true,
  productionMethod: { form: '', reason: '项目建立于旧版流程，未单独确认制作方式。' },
  styleDirections: [],
  budget: { currency: 'USD', cap: 0, categories: [] },
  allowPaidGeneration: false,
};
export function migrate(p) {
  if (!p.schema) {
    p.schema = 1;
    if (!p.stages.brief && (p.stages.research || p.stages.script || p.versions?.length)) {
      p.stages.brief = {
        revision: 'brief-legacy',
        completedAt: p.createdAt || stamp(),
        data: LEGACY_BRIEF,
      };
    }
  }
  p.spend ??= [];
  p.capabilities ??= {};
  p.briefSources ??= [];
  p.rules ??= {};
  p.brief.allowPaidGeneration ??= false;
  p.brief.budget ??= { currency: 'USD', cap: 0, categories: [] };
  p.brief.styleDirectionId ??= '';
  p.brief.productionMethod ??= '';
  p.brief.briefNotes ??= '';
  return p;
}
export class Store {
  constructor(root) {
    this.root = resolve(root);
    this.pending = new Map();
  }
  dir(id) {
    ensure(typeof id === 'string' && /^project-[a-f0-9-]{12}$/.test(id), '项目不存在。', 404);
    return resolve(this.root, id);
  }
  async get(id) {
    try {
      return migrate(await readJson(resolve(this.dir(id), 'project.json')));
    } catch (error) {
      if (error.code === 'ENOENT') throw new Problem('项目不存在。', 404);
      throw error;
    }
  }
  async create(input) {
    const p = projectFrom(input);
    await writeJson(resolve(this.dir(p.id), 'project.json'), p);
    return p;
  }
  async list() {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    const projects = await Promise.all(
      entries
        .filter((e) => e.isDirectory() && /^project-[a-f0-9-]{12}$/.test(e.name))
        .map(async (e) => {
          try {
            const { id, title, mode, updatedAt, brief, demo, stages } = await this.get(e.name);
            return {
              id,
              title,
              mode,
              updatedAt,
              style: brief.style,
              demo: !!demo,
              complete: Boolean(stages.delivery),
            };
          } catch (error) {
            if (error.status !== 404) throw error;
            return null;
          }
        }),
    );
    return projects.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async update(id, mutator) {
    const last = this.pending.get(id) || Promise.resolve();
    const next = last
      .catch(() => {})
      .then(async () => {
        const p = await this.get(id);
        await mutator(p);
        p.updatedAt = stamp();
        await writeJson(resolve(this.dir(id), 'project.json'), p);
        return p;
      });
    this.pending.set(id, next);
    try {
      return await next;
    } finally {
      if (this.pending.get(id) === next) this.pending.delete(id);
    }
  }
}

const keySet = (items, label) => {
  const ids = items.map((item) => item?.id);
  ensure(ids.every(itemId) && new Set(ids).size === ids.length, label + '需要互不重复的有效编号。');
  return new Set(ids);
};
const hasLink = (url) => {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};
export function allSources(project, extra = []) {
  return [
    ...(project.briefSources || []),
    ...(project.stages.research?.data.sources || []),
    ...(project.addedSources || []),
    ...extra,
  ];
}
export function validateSources(sources, available = []) {
  const used = keySet(list(sources, '来源'), '来源');
  for (const source of sources) {
    ensure(!available.includes(source.id), '新增来源编号重复：' + source.id);
    text(source.title, '来源标题');
    text(source.kind, '来源类型');
    ensure(
      hasLink(source.url) || (typeof source.file === 'string' && source.file),
      source.id + ' 缺少原文链接或项目内文件。',
    );
    if (source.url) ensure(hasLink(source.url), source.id + ' 的链接需要使用 HTTP 或 HTTPS。');
    if (source.imageUrl) ensure(hasLink(source.imageUrl), source.id + ' 的图片链接无效。');
  }
  return used;
}
export function validateResearch(result) {
  const sources = validateSources(result.sources);
  const claims = list(result.claims, '事实和陈述');
  keySet(claims, '陈述');
  ensure(
    claims.some((c) => c.type === 'fact'),
    '需要至少一条有原文依据的事实。',
  );
  for (const c of claims) {
    text(c.text, '陈述内容');
    ensure(['fact', 'interpretation', 'outlook'].includes(c.type), c.id + ' 需要注明事实、推断或展望。');
    const citations = list(c.evidence || [], '原文依据');
    ensure(c.type !== 'fact' || citations.length > 0, c.id + ' 事实缺少原文依据。');
    for (const item of citations) {
      ensure(sources.has(item.sourceId), c.id + ' 找不到来源 ' + item.sourceId);
      text(item.locator, '原文位置');
      text(item.scope, '证据支持的内容');
    }
  }
  const searches = list(result.searches, '检索记录');
  ensure(searches.length, '请记录至少一次实际检索。');
  for (const s of searches) {
    text(s.query, '检索词');
    text(s.summary, '检索结果');
  }
}
export function validateBudget(budget, allowPaid = false) {
  ensure(budget && typeof budget === 'object', '请填写预算。');
  ensure(CURRENCIES.includes(budget.currency), '预算币种只能是 USD 或 CNY。');
  const cap = Number(budget.cap);
  ensure(Number.isFinite(cap) && cap >= 0 && cap <= 100000, '预算上限需在 0 到 100000 之间。');
  const categories = list(budget.categories || [], '付费类别');
  for (const item of categories) ensure(SPEND_CATEGORIES.includes(item), '付费类别无效：' + item);
  if (allowPaid) ensure(cap > 0, '允许付费生成时，预算上限需要大于 0。');
  return { currency: budget.currency, cap, categories: uniq(categories) };
}
export const spentTotal = (project) =>
  Number(((project.spend || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)).toFixed(4));
export function validateBrief(result, available = []) {
  const sources = validateSources(result.sources || [], available);
  const method = result.productionMethod;
  ensure(method && typeof method === 'object', '请给出制作方式建议。');
  ensure(FORMS.includes(method.form), '制作方式无效：' + String(method.form));
  text(method.reason, '制作方式理由');
  const directions = list(result.styleDirections, '风格方向');
  ensure(directions.length >= 1 && directions.length <= 3, '请给出 1 到 3 个风格方向。');
  keySet(directions, '风格方向');
  const byId = new Map((result.sources || []).map((source) => [source.id, source]));
  for (const direction of directions) {
    text(direction.name, '风格方向名称');
    text(direction.rationale, '风格方向理由');
    const refs = list(direction.refs, '风格方向参考');
    ensure(refs.length, direction.name + ' 需要至少一张美术参考。');
    for (const ref of refs) {
      ensure(sources.has(ref.sourceId), direction.name + ' 找不到参考来源 ' + ref.sourceId);
      text(ref.use, '参考用途');
      ensure(isImageSource(byId.get(ref.sourceId)), direction.name + ' 的美术参考需要有图片。');
    }
  }
  ensure(
    directions.some((direction) => direction.id === result.recommendedDirection),
    '请指定一个推荐方向。',
  );
  const budget = validateBudget(result.budget, Boolean(result.allowPaidGeneration));
  return {
    productionMethod: {
      form: method.form,
      reason: String(method.reason).slice(0, 1200),
      effort: String(method.effort || '').slice(0, 400),
      risk: String(method.risk || '').slice(0, 400),
    },
    styleDirections: directions,
    recommendedDirection: result.recommendedDirection,
    budget,
    allowPaidGeneration: Boolean(result.allowPaidGeneration),
    capabilities: Array.isArray(result.capabilities) ? result.capabilities : [],
  };
}
export function validateScript(result, project) {
  const cues = list(result.cues, '旁白段落');
  keySet(cues, '旁白段落');
  ensure(cues.length >= 1 && cues.length <= 80, '旁白需要 1 到 80 个段落。');
  const claims = new Set(project.stages.research.data.claims.map((c) => c.id));
  let linked = 0;
  for (const c of cues) {
    text(c.text, '旁白');
    ensure(c.text.length <= 650, c.id + ' 旁白过长，请按句拆分。');
    const ids = list(c.claimIds, '段落依据');
    for (const id of ids) ensure(claims.has(id), c.id + ' 的事实编号不存在：' + id);
    linked += ids.length;
    if (ids.length === 0)
      ensure(
        ['transition', 'question', 'title', 'opinion'].includes(c.purpose),
        c.id + ' 须标注无事实引用的段落用途。',
      );
  }
  ensure(linked > 0, '旁白至少需要一处对应已核实的陈述。');
}
export function validateReferences(refs, sourceMap, shotId) {
  for (const item of list(refs, '镜头参考')) {
    ensure(sourceMap.has(item.sourceId), shotId + ' 找不到参考来源 ' + item.sourceId);
    ensure(Object.hasOwn(ROLES, item.role), shotId + ' 的参考用途类型无效。');
    text(item.locator, '参考位置');
    text(item.use, '参考用途');
    if (item.role === 'asset') text(item.rights, '直接引用的使用依据');
  }
}
export function shotEvidenceSourceIds(shot, project) {
  const cues = (project.stages.script?.data.cues || []).filter((cue) =>
    shot.cueIds.includes(cue.id),
  );
  const claims = (project.stages.research?.data.claims || []).filter((claim) =>
    cues.some((cue) => cue.claimIds.includes(claim.id)),
  );
  return new Set(claims.flatMap((claim) => claim.evidence.map((item) => item.sourceId)));
}
export function validateDesign(result, project, newSources = true) {
  const refs = allSources(project);
  if (newSources)
    validateSources(
      result.sources || [],
      refs.map((s) => s.id),
    );
  const sourceMap = new Map([...refs, ...(result.sources || [])].map((s) => [s.id, s]));
  const shots = list(result.shots, '分镜');
  ensure(shots.length >= 1 && shots.length <= 80, '分镜数量需在 1 到 80 镜之间。');
  const cues = project.stages.script.data.cues;
  const citedCues = new Set(cues.filter((cue) => cue.claimIds.length).map((cue) => cue.id));
  const legacy = Boolean(project.stages.brief?.data?.legacy);
  const strictMotion = Boolean(project.rules?.motion) && !legacy;
  keySet(shots, '分镜');
  for (const shot of shots) {
    text(shot.title, '镜头标题');
    text(shot.visual, '镜头构思');
    text(shot.style, '美术风格');
    ensure(FORMS.includes(shot.form), shot.id + ' 的画面形式无效。');
    ensure(list(shot.cueIds, '镜头旁白关联').length, shot.id + ' 缺少旁白时轴。');
    ensure(list(shot.mustShow, '验收要点').length, shot.id + ' 缺少可观察的画面验收要点。');
    shot.mustShow.forEach((item) => text(item, '画面验收要点'));
    list(shot.onScreen || [], '上屏文字').forEach((item) => text(item, '上屏文字'));
    if (strictMotion) {
      const motion = shot.motionPlan;
      ensure(motion && typeof motion === 'object', shot.id + ' 需要动效方案。');
      ensure(MOTION_TYPES.includes(motion.type), shot.id + ' 的动效类型无效。');
      text(motion.description, '动效说明');
      const beats = list(motion.beats, '动效节拍');
      ensure(beats.length >= 2, shot.id + ' 的动效方案至少要写两个节拍。');
      beats.forEach((beat) => text(beat, '动效节拍'));
    }
    validateReferences(shot.references, sourceMap, shot.id);
    const style = shot.references.filter((ref) => ref.role === 'style');
    if (!legacy)
      ensure(
        style.length && style.some((ref) => isImageSource(sourceMap.get(ref.sourceId))),
        shot.id + ' 需要至少一张带图的美术参考。',
      );
    if (['写实三维', '现场影像'].includes(shot.form)) {
      const real = shot.references.filter((ref) => ref.role === 'reality' || ref.role === 'asset');
      ensure(real.length, shot.id + ' 的现实呈现缺少现实参考。');
      ensure(
        real.some((ref) => isImageSource(sourceMap.get(ref.sourceId))),
        shot.id + ' 的现实参考需要有图片。',
      );
      if (shot.form === '写实三维' && !legacy) {
        const evidence = shotEvidenceSourceIds(shot, project);
        const aligned = real.some((ref) => evidence.has(ref.sourceId));
        if (!aligned) {
          const match = shot.realityMatch;
          ensure(
            match && match.consistent === false && match.note?.trim() && match.closest?.trim(),
            shot.id + ' 的现实参考与旁白事实不一致，需说明原因并给出最相近的场景。',
          );
        }
      }
    }
    if (shot.form === '原网页')
      ensure(shot.references.some((ref) => ref.role === 'asset'), shot.id + ' 缺少入片原网页。');
    if (shot.cueIds.some((id) => citedCues.has(id)))
      ensure(
        shot.references.some((ref) => ref.role !== 'style'),
        shot.id + ' 的科普画面缺少内容依据。',
      );
  }
  if (strictMotion && !project.demo) {
    const animated = shots.filter((shot) => shot.motionPlan?.type !== 'camera').length;
    ensure(
      animated >= Math.ceil(shots.length / 2),
      '至少一半镜头要使用构建、动态字、三维或混合动效，不能只靠镜头推拉。',
    );
  }
  const expected = cues.map((c) => c.id);
  ensure(
    JSON.stringify(shots.flatMap((s) => s.cueIds)) === JSON.stringify(expected),
    '旁白段落须按原顺序各使用一次。',
  );
}
export function keepDesign(project) {
  const design = project.stages?.design?.data;
  if (design?.shots?.length)
    project.lastDesign = {
      at: stamp(),
      revision: project.stages.design.revision,
      shots: design.shots,
    };
}
export function validateRenders(renders, plan, wanted = plan.map((s) => s.id)) {
  const expected = plan.filter((s) => wanted.includes(s.id));
  const ids = keySet(list(renders, '镜头交付'), '镜头交付');
  ensure(
    ids.size === expected.length && expected.every((s) => ids.has(s.id)),
    '交付镜头必须与本轮制作范围一致。',
  );
  for (const shot of expected) {
    const render = renders.find((r) => r.id === shot.id);
    text(render.file, '镜头文件路径');
    const refs = list(render.referenceIds, '实际采用的参考');
    ensure(
      shot.references.every((r) => refs.includes(r.sourceId)),
      shot.id + ' 尚未交代必要参考的使用。',
    );
    ensure(
      refs.every((id) => shot.references.some((ref) => ref.sourceId === id)),
      shot.id + ' 引用了本镜计划之外的参考。',
    );
    const checks = list(render.checks, '镜头自检');
    for (const check of checks)
      ensure(
        shot.mustShow.includes(check.item) &&
          typeof check.evidence === 'string' &&
          check.evidence.trim() &&
          Number.isInteger(check.frame) &&
          check.frame >= 0 &&
          check.frame < shot.endFrame - shot.startFrame,
        shot.id + ' 的自检时间或说明无效。',
      );
    for (const item of shot.mustShow)
      ensure(
        checks.some((c) => c.item === item),
        shot.id + ' 缺少对应的自检画面：' + item,
      );
  }
}
export function setStage(p, stage, data) {
  const revision = makeId(stage);
  p.stages[stage] = { revision, completedAt: stamp(), data };
  if (MODES[p.mode].gates.includes(stage)) p.gate = { stage, revision };
  else p.decisions.push({ stage, revision, mode: p.mode, at: stamp(), decision: 'automatic' });
  return revision;
}
export function nextStage(p) {
  if (p.gate) return null;
  if (p.revision)
    return p.stages.revisionPlan ? (p.stages.revision ? 'delivery' : 'revision') : 'revisionPlan';
  return STAGES.find((stage) => !p.stages[stage]) || null;
}
export function summary(p) {
  if (p.job?.state === 'running') return '正在' + (TITLES[p.job.stage] || '检查环境');
  if (p.job?.state === 'failed') return p.job.message;
  if (p.gate) return '等待确认 · ' + TITLES[p.gate.stage];
  if (p.stages.delivery) return '成片与资料已就绪';
  return '下一步 · ' + (TITLES[nextStage(p)] || '开始制作');
}
export function modeView(p) {
  return { ...p, modeInfo: MODES[p.mode], statusLine: summary(p), next: nextStage(p) };
}
export function changeMode(p, mode) {
  ensure(Object.hasOwn(MODES, mode), '请选择有效的审阅程度。');
  p.mode = mode;
  if (p.gate && !MODES[mode].gates.includes(p.gate.stage)) {
    p.decisions.push({ ...p.gate, mode, decision: 'mode-change', at: stamp() });
    p.gate = null;
  }
}
export function decide(p, body) {
  ensure(
    p.gate?.stage === body.stage && p.gate?.revision === body.revision,
    '这一版已经更新，请刷新后审阅。',
    409,
  );
  ensure(['accept', 'revise'].includes(body.decision), '审阅决定无效。');
  ensure(body.via === 'workbench', '请在制作工作台页面内完成确认。', 403);
  const { stage, revision } = p.gate;
  const message = String(body.message || '')
    .trim()
    .slice(0, 4000);
  if (body.decision === 'revise') {
    text(message, '修改意见');
    p.directions.push({ stage, message, at: stamp() });
    keepDesign(p);
    if (STAGES.includes(stage)) {
      const index = STAGES.indexOf(stage);
      for (const item of STAGES.slice(index)) delete p.stages[item];
    } else {
      delete p.stages[stage];
      delete p.stages.delivery;
    }
    if (stage === 'production' || stage === 'revision') {
      const current = p.versions.at(-1);
      if (current?.revision === revision) current.rejected = true;
    }
  }
  p.decisions.push({ stage, revision, mode: p.mode, message, decision: body.decision, at: stamp() });
  p.gate = null;
}
export const activeCut = (p) => [...p.versions].reverse().find((version) => !version.rejected);
