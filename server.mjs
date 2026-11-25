import { createServer } from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import {
  Store,
  MODES,
  STAGES,
  TITLES,
  FORMS,
  STYLES,
  ensure,
  modeView,
  decide,
  changeMode,
  existingPath,
  localPath,
  makeId,
  writeJson,
  stamp,
  activeCut,
  uniq,
  validateBudget,
  spentTotal,
  SPEND_CATEGORIES,
  keepDesign,
} from './lib/workflow.mjs';
import { Runner, startRevision } from './lib/runner.mjs';
import { capture, clipContext } from './lib/media.mjs';
import { exportReports, exportPdfs } from './lib/reports.mjs';
import { doctor } from './lib/doctor.mjs';
import { seedDemo } from './lib/demo.mjs';

const web = fileURLToPath(new URL('./public/', import.meta.url));
const defaultData = fileURLToPath(new URL('./data/', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
};
const uploads = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.mp4',
  '.mov',
  '.wav',
  '.aiff',
  '.mp3',
  '.m4a',
  '.srt',
  '.vtt',
  '.txt',
  '.md',
  '.json',
  '.docx',
  '.blend',
  '.csv',
]);
function json(res, data, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    ensure(size < 1024 * 1024, '提交内容过大。', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    ensure(false, '提交的数据格式无效。');
  }
}
function allowOrigin(req) {
  const origin = req.headers.origin;
  if (origin) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {}
    ensure(
      parsed && ['http:', 'https:'].includes(parsed.protocol) && parsed.host === req.headers.host,
      '请从当前本地工作台发送请求。',
      403,
    );
  }
}

async function streamFile(req, res, path, { download = false, report = false, asset = false } = {}) {
  const info = await stat(path);
  ensure(info.isFile(), '没有这个文件。', 404);
  const ext = extname(path).toLowerCase();
  const offered = mime[ext] || 'application/octet-stream';
  const type = ext === '.html' && asset && !report ? 'text/plain; charset=utf-8' : offered;
  const headers = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-cache',
  };
  if (ext === '.svg')
    headers['content-security-policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
  if (download)
    headers['content-disposition'] =
      "attachment; filename*=UTF-8''" + encodeURIComponent(basename(path));
  let start = 0,
    end = info.size - 1,
    status = 200;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(end, Number(range[2])) : end;
      if (start > end || start >= info.size) {
        res.writeHead(416, { 'content-range': 'bytes */' + info.size });
        res.end();
        return;
      }
      headers['content-range'] = 'bytes ' + start + '-' + end + '/' + info.size;
      status = 206;
    }
  }
  headers['content-length'] = Math.max(0, end - start + 1);
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || info.size === 0) res.end();
  else
    createReadStream(path, { start, end })
      .on('error', () => res.destroy())
      .pipe(res);
}
const concise = (value) =>
  String(value ?? '')
    .trim()
    .slice(0, 5000);
const mayEdit = (runner, id) => ensure(!runner.isLive(id), 'Agent 正在制作。可暂停任务后调整。', 409);

export function createWorkbench({
  data = process.env.EVIDENCE_VIDEO_DATA || defaultData,
  agent,
  env,
  defaultDriver = process.env.EVIDENCE_VIDEO_DEFAULT_DRIVER || 'codex',
} = {}) {
  const store = new Store(data);
  const runner = new Runner(store, { agent, env });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      ensure(
        !req.headers.host || /^((127\.0\.0\.1|localhost)(:\d+)?|\[::1\](:\d+)?)$/.test(req.headers.host),
        '本地工作台仅接受回环地址。',
        403,
      );
      if (!['GET', 'HEAD'].includes(req.method)) allowOrigin(req);
      if (path === '/api/config' && req.method === 'GET')
        return json(res, {
          modes: MODES,
          stages: STAGES,
          titles: TITLES,
          forms: FORMS,
          styles: STYLES,
          defaultDriver,
        });
      if (path === '/api/demo' && req.method === 'POST') {
        await body(req);
        const sample = await seedDemo(store, { env });
        return json(res, modeView(sample));
      }
      if (path === '/api/projects') {
        if (req.method === 'GET') return json(res, await store.list());
        if (req.method === 'POST') {
          const p = await store.create(await body(req));
          const checked = await runner.setup(p.id);
          return json(
            res,
            modeView(
              await store.update(p.id, (q) => {
                q.environment = { at: checked.at, services: checked.services };
              }),
            ),
            201,
          );
        }
      }
      if (path === '/api/environment' && req.method === 'GET') {
        const id = url.searchParams.get('project');
        const status = id
          ? await runner.setup(id, url.searchParams.has('refresh'))
          : await doctor({}, url.searchParams.has('refresh'));
        return json(res, status);
      }
      const project = path.match(/^\/api\/projects\/(project-[a-f0-9-]{12})(?:\/([\w-]+))?$/);
      if (project) {
        const [, id, action] = project;
        const root = store.dir(id);
        const p = await store.get(id);
        if (!action && req.method === 'GET') {
          if (p.job?.state === 'running' && !runner.isLive(id)) {
            return json(
              res,
              modeView(
                await store.update(id, (q) => {
                  q.job = {
                    ...q.job,
                    state: 'cancelled',
                    message: '上一次运行已中断。可从当前阶段继续。',
                  };
                }),
              ),
            );
          }
          return json(res, modeView(p));
        }
        if (action === 'settings' && req.method === 'POST') {
          const input = await body(req);
          const config = {};
          for (const key of ['blender', 'ffmpeg', 'ffprobe', 'codex', 'remotion'])
            if (input[key]) config[key] = concise(input[key]).slice(0, 1000);
          mayEdit(runner, id);
          if (input.driver)
            await store.update(id, (q) => {
              q.driver = ['current', 'clean'].includes(input.driver) ? input.driver : 'codex';
            });
          await writeJson(resolve(root, 'tools.json'), config);
          const checked = await runner.setup(id, true);
          await store.update(id, (q) => {
            q.environment = { at: checked.at, services: checked.services };
          });
          return json(res, checked);
        }
        if (action === 'reset' && req.method === 'POST') {
          mayEdit(runner, id);
          const input = await body(req);
          ensure(
            ['research', 'script', 'design', 'production'].includes(input.stage),
            '请选择要重新处理的阶段。',
          );
          ensure(concise(input.message), '请写下重新处理的目标。');
          const result = await store.update(id, (q) => {
            ensure(!Object.keys(q.lockedShots || {}).length, '请先解锁会被重新制作的镜头。', 409);
            keepDesign(q);
            for (const stage of STAGES.slice(STAGES.indexOf(input.stage))) delete q.stages[stage];
            if (input.stage === 'brief') q.briefSources = [];
            for (const stage of ['revisionPlan', 'revision']) delete q.stages[stage];
            q.gate = null;
            q.revision = null;
            q.directions.push({ stage: input.stage, message: concise(input.message), at: stamp() });
          });
          await runner.launch(id);
          return json(res, modeView(result));
        }
        if (action === 'lock' && req.method === 'POST') {
          mayEdit(runner, id);
          const input = await body(req);
          const result = await store.update(id, (q) => {
            const shot = activeCut(q)?.shots.find((s) => s.id === input.shotId);
            ensure(shot && q.stages.production, '当前镜头还没有可锁定的预览。');
            q.lockedShots ??= {};
            if (input.lock) q.lockedShots[shot.id] = { file: shot.file, at: stamp() };
            else delete q.lockedShots[shot.id];
          });
          return json(res, modeView(result));
        }
        if (action === 'mode' && req.method === 'POST') {
          const input = await body(req);
          const result = await store.update(id, (q) => changeMode(q, input.mode));
          return json(res, modeView(result));
        }
        if (action === 'brief' && req.method === 'POST') {
          mayEdit(runner, id);
          const input = await body(req);
          const result = await store.update(id, (q) => {
            ensure(!q.revision, '请完成当前的批注修订。');
            for (const key of ['style', 'form', 'palette', 'artLimits', 'voice', 'briefNotes'])
              if (key in input) q.brief[key] = concise(input[key]);
            if ('allowPaidGeneration' in input)
              q.brief.allowPaidGeneration = Boolean(input.allowPaidGeneration);
            if ('budget' in input) {
              ensure(
                !q.stages.research || q.gate?.stage === 'brief',
                '预算只能在简报阶段或开工前调整。',
              );
              q.brief.budget = validateBudget(input.budget, Boolean(q.brief.allowPaidGeneration));
            }
            if ('styleDirectionId' in input) {
              ensure(
                !q.stages.research || q.gate?.stage === 'brief',
                '风格方向只能在简报阶段或开工前调整。',
              );
              q.brief.styleDirectionId = concise(input.styleDirectionId).slice(0, 80);
            }
            if ('productionMethod' in input) {
              ensure(
                !q.stages.research || q.gate?.stage === 'brief',
                '制作方式只能在简报阶段或开工前调整。',
              );
              ensure(FORMS.includes(input.productionMethod), '制作方式无效。');
              q.brief.productionMethod = input.productionMethod;
            }
            if (
              'burnSubtitles' in input &&
              (q.brief.burnSubtitles !== false) !== Boolean(input.burnSubtitles)
            ) {
              q.brief.burnSubtitles = Boolean(input.burnSubtitles);
              delete q.stages.delivery;
              if (q.gate?.stage === 'delivery') q.gate = null;
            }
            if ('seconds' in input) {
              ensure(
                Number.isInteger(input.seconds) && input.seconds >= 10 && input.seconds <= 600,
                '目标时长须在 10–600 秒之间。',
              );
              if (q.brief.seconds !== input.seconds) {
                q.brief.seconds = input.seconds;
                q.narration = null;
              }
            }
            // Style/timing changes affect design onward. Research and the narrated text remain available.
            if (input.resetDesign) {
              ensure(!Object.keys(q.lockedShots || {}).length, '全片重设计前，请先解锁已锁镜头。', 409);
              keepDesign(q);
              if ('voice' in input) q.narration = null;
              for (const stage of ['design', 'production', 'delivery']) delete q.stages[stage];
              if (['design', 'production', 'delivery'].includes(q.gate?.stage)) q.gate = null;
              q.directions.push({
                stage: 'design',
                message: '按用户更新的全片风格和制作条件重新设计。',
                at: stamp(),
              });
            }
          });
          return json(res, modeView(result));
        }
        if (action === 'spend' && req.method === 'POST') {
          const input = await body(req);
          ensure(p.brief.allowPaidGeneration, '简报未允许付费生成。', 409);
          const amount = Number(input.amount);
          ensure(Number.isFinite(amount) && amount > 0, '请填写有效的花费金额。');
          ensure(SPEND_CATEGORIES.includes(input.category), '付费类别无效。');
          const budget = p.brief.budget || { cap: 0, categories: [] };
          ensure(
            !budget.categories?.length || budget.categories.includes(input.category),
            '简报未允许这个付费类别。',
          );
          const result = await store.update(id, (q) => {
            ensure(
              spentTotal(q) + amount <= Number(q.brief.budget?.cap || 0) + 1e-6,
              '这笔花费会超出简报里的预算上限。',
              409,
            );
            q.spend.push({
              at: stamp(),
              provider: concise(input.provider).slice(0, 120),
              category: input.category,
              amount: Number(amount.toFixed(4)),
              purpose: concise(input.purpose).slice(0, 300),
            });
          });
          return json(res, modeView(result), 201);
        }
        if (action === 'run' && req.method === 'POST') {
          await runner.launch(id);
          return json(res, { started: true }, 202);
        }
        if (action === 'pause' && req.method === 'POST') {
          runner.cancel(id);
          return json(res, { paused: true }, 202);
        }
        if (action === 'decision' && req.method === 'POST') {
          mayEdit(runner, id);
          const input = await body(req);
          const result = await store.update(id, (q) => decide(q, input));
          if (input.stage === 'delivery' && input.decision === 'accept') {
            const cut = activeCut(result);
            const file = result.stages.delivery.data.evidence;
            const folder = file.slice(0, file.lastIndexOf('/'));
            await exportReports(root, result, cut, folder);
            if (result.stages.delivery.data.processPdf)
              await exportPdfs(root, await runner.setup(id), folder, ['制作与人机分工']);
          }
          if (!result.gate && (!result.stages.delivery || result.revision)) await runner.launch(id);
          return json(res, modeView(result));
        }
        if (action === 'assets' && req.method === 'POST') {
          mayEdit(runner, id);
          const name = basename(concise(url.searchParams.get('name'))).slice(0, 160);
          const ext = extname(name).toLowerCase();
          ensure(uploads.has(ext), '支持图片、文档、音视频、字幕和工程文件。');
          const max = 350 * 1024 * 1024;
          ensure(
            !req.headers['content-length'] || Number(req.headers['content-length']) <= max,
            '文件超出单次上传大小。',
            413,
          );
          const bucket = 'inputs/' + makeId('file');
          await mkdir(localPath(root, bucket), { recursive: true });
          const relative = bucket + '/' + name;
          const output = localPath(root, relative);
          let size = 0;
          try {
            await pipeline(
              req,
              new Transform({
                transform(chunk, _, next) {
                  size += chunk.length;
                  if (size > max) next(new Error('文件超出单次上传大小。'));
                  else next(null, chunk);
                },
              }),
              createWriteStream(output, { flags: 'wx' }),
            );
            ensure(size > 0, '文件没有内容。');
            const result = await store.update(id, (q) => {
              q.inputs.push({
                kind: url.searchParams.get('kind') || '资料',
                title: name,
                file: relative,
                ...(['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? { image: relative } : {}),
                at: stamp(),
              });
            });
            return json(res, modeView(result), 201);
          } catch (error) {
            await rm(output, { force: true });
            throw error;
          }
        }
        if (action === 'link' && req.method === 'POST') {
          mayEdit(runner, id);
          const input = await body(req);
          let parsed;
          try {
            parsed = new URL(input.url);
          } catch {}
          ensure(parsed && ['https:', 'http:'].includes(parsed.protocol), '请填写有效的资料链接。');
          const result = await store.update(id, (q) => {
            q.inputs.push({
              kind: concise(input.kind) || '资料',
              title: concise(input.title) || parsed.hostname,
              url: parsed.href,
              purpose: concise(input.purpose),
              at: stamp(),
            });
          });
          return json(res, modeView(result), 201);
        }
        if (action === 'shot-style' && req.method === 'POST') {
          mayEdit(runner, id);
          const input = await body(req);
          ensure(STYLES.includes(input.style) || concise(input.style), '请选择镜头风格。');
          ensure(FORMS.includes(input.form), '请选择镜头形式。');
          const updated = await store.update(id, (q) => {
            ensure(!q.revision, '请完成当前的批注修订。');
            const shot = q.stages.design?.data.shots.find((s) => s.id === input.shotId);
            ensure(shot, '找不到这个镜头。');
            ensure(!q.lockedShots?.[shot.id], '这个镜头已锁定，请先解锁。', 409);
            const override = { style: concise(input.style), form: input.form };
            ensure(
              override.style !== shot.style || override.form !== shot.form,
              '当前镜头已使用这个方案。',
            );
            const cut = activeCut(q);
            if (cut && q.stages.production && !q.gate) {
              q.notes.push({
                id: makeId('note'),
                version: cut.revision,
                shotIds: [shot.id],
                first: shot.startFrame,
                last: shot.endFrame - 1,
                text: '将此镜改为' + override.style + '风格，呈现方式为' + override.form + '。',
                override,
                at: stamp(),
                status: 'open',
              });
            } else if (q.gate?.stage === 'design' || !q.stages.production) {
              ensure(
                !['写实三维', '现场影像'].includes(override.form) ||
                  shot.references.some((r) => r.role === 'asset' || r.role === 'reality'),
                '这个呈现方式需要现实参考。可补充资料后退回分镜，请 Agent 实际查找并更新。',
              );
              Object.assign(shot, override);
              q.stages.design.revision = makeId('design');
              if (q.gate?.stage === 'design') q.gate.revision = q.stages.design.revision;
            } else ensure(false, '请先处理当前预览的审阅。');
          });
          return json(res, modeView(updated));
        }
        if (action === 'note' && req.method === 'POST') {
          const input = await body(req);
          const version = p.versions.find((v) => v.revision === input.version);
          ensure(version, '找不到你正在审阅的视频版本。');
          const first = Number(input.first),
            last = Number(input.last ?? first);
          const text = concise(input.text);
          ensure(text, '请写下要修改的地方。');
          ensure(
            Number.isInteger(first) &&
              Number.isInteger(last) &&
              first >= 0 &&
              last >= first &&
              last < version.frames,
            '截帧区间超出视频。',
          );
          const shotIds = version.shots
            .filter((s) => s.startFrame <= last && s.endFrame > first)
            .map((s) => s.id);
          const idNote = makeId('note');
          const base = 'notes/' + idNote;
          await mkdir(localPath(root, base), { recursive: true });
          const image = base + '/frame.jpg';
          const endImage = last > first ? base + '/end.jpg' : null;
          const context = base + '/context.mp4';
          const environment = await runner.setup(id);
          ensure(environment.available, '截图需要配置 FFmpeg 和 FFprobe。');
          const film = await existingPath(root, version.video);
          await capture(environment.bins, film, first, localPath(root, image));
          if (endImage) await capture(environment.bins, film, last, localPath(root, endImage));
          const pad = Math.round(version.fps * 0.75);
          await clipContext(
            environment.bins,
            film,
            Math.max(0, first - pad),
            Math.min(version.frames, last + pad + 1),
            version.fps,
            localPath(root, context),
          );
          let region = null;
          if (
            Array.isArray(input.region) &&
            input.region.length === 4 &&
            input.region.every((v) => typeof v === 'number' && v >= 0 && v <= 1)
          )
            region = input.region;
          const result = await store.update(id, (q) => {
            q.notes.push({
              id: idNote,
              version: version.revision,
              shotIds,
              first,
              last,
              region,
              text,
              at: stamp(),
              image,
              endImage,
              context,
              status: 'open',
            });
          });
          return json(res, modeView(result), 201);
        }
        if (action === 'revise' && req.method === 'POST') {
          mayEdit(runner, id);
          const input = await body(req);
          await store.update(id, (q) => startRevision(q, Array.isArray(input.ids) ? input.ids : []));
          await runner.launch(id);
          return json(res, { started: true }, 202);
        }
        if (action === 'close-note' && req.method === 'POST') {
          const input = await body(req);
          const result = await store.update(id, (q) => {
            const note = q.notes.find((n) => n.id === input.id);
            ensure(note, '找不到批注。');
            ensure(!q.revision?.noteIds.includes(note.id), '该批注正在制作中。');
            note.status = 'closed';
          });
          return json(res, modeView(result));
        }
        return json(res, { error: '此项目操作未找到。' }, 404);
      }
      const projectFile = path.match(/^\/media\/(project-[a-f0-9-]{12})\/(.+)$/);
      if (projectFile && ['GET', 'HEAD'].includes(req.method)) {
        const [, id, encoded] = projectFile;
        const disk = decodeURIComponent(encoded);
        ensure(/^(runs|notes|inputs)\//.test(disk), '文件不存在。', 404);
        const report = /^runs\/run-[a-f0-9-]{12}\/(证据溯源清单|制作与人机分工)\.html$/.test(disk);
        return await streamFile(req, res, await existingPath(store.dir(id), disk), {
          download: url.searchParams.has('download'),
          report,
          asset: true,
        });
      }
      if (
        ['GET', 'HEAD'].includes(req.method) &&
        ['/', '/index.html', '/style.css', '/app.js'].includes(path)
      ) {
        return await streamFile(req, res, resolve(web, path === '/' ? 'index.html' : path.slice(1)));
      }
      json(res, { error: '未找到页面。' }, 404);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const missing = error.code === 'ENOENT';
      if (!error.status && !missing) console.error(error.message);
      json(
        res,
        { error: missing ? '文件不存在。' : String(error.message || error).slice(0, 1300) },
        error.status || (missing ? 404 : 500),
      );
    }
  });
  return { server, store, runner };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 4173);
  const { server } = createWorkbench();
  server.on('error', (error) => {
    console.error('工作台未能启动 · ' + error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log('短片制作工作台 · http://127.0.0.1:' + server.address().port),
  );
}
