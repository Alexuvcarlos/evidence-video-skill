import { writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { processFile } from './media.mjs';
import { allSources, localPath, ROLES, MODES } from './workflow.mjs';

export const escapeHtml = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const E = escapeHtml;
const sourceList = (source, cite) => {
  if (!source) return '';
  const name = E(source.title);
  const link = source.url ? '<a href="' + E(source.url) + '">' + name + '</a>' : name;
  return (
    link +
    (cite ? ' · ' + E(cite.locator) : '') +
    '<br><span>' +
    E([source.creator, source.date, source.doi].filter(Boolean).join(' · ')) +
    '</span>'
  );
};
function time(frame, fps) {
  const s = frame / fps;
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + (s % 60).toFixed(3).padStart(6, '0');
}
function page(title, project, markup) {
  return (
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    E(title) +
    '</title><style>@page{margin:15mm}body{max-width:850px;margin:40px auto;padding:0 22px;background:#fff;color:#212925;font:16px/1.62 "Songti SC",SimSun,serif}h1,h2,h3{font-family:"Heiti SC",SimHei,sans-serif}h1{margin:0}h2{margin-top:28px;border-bottom:1px solid #ced8d0;padding-bottom:5px}h3{margin:0 0 4px}section{padding:12px 0;border-bottom:1px solid #e3eae6;break-inside:avoid}p{margin:5px 0}a{color:#155949;overflow-wrap:anywhere}span{color:#4b6057}button{padding:8px 13px;border:1px solid #869b91;border-radius:7px;background:white;cursor:pointer}@media print{button{display:none}body{margin:0;padding:0;max-width:none}a{color:#111}}</style><button onclick="print()">打印 / 存为 PDF</button><h1>' +
    E(title) +
    '</h1><p>' +
    E(project.title) +
    '</p>' +
    markup +
    '</html>'
  );
}

export async function exportReports(root, p, cut, folder) {
  const research = p.stages.research.data;
  const bySource = new Map(allSources(p).map((s) => [s.id, s]));
  const byClaim = new Map(research.claims.map((c) => [c.id, c]));
  const byCue = new Map(p.stages.script.data.cues.map((c) => [c.id, c]));
  const rows = cut.shots
    .map((shot) => {
      const info = shot.cueIds.map((id) => byCue.get(id)).filter(Boolean);
      return (
        '<section><h3>' +
        E(shot.id + ' · ' + shot.title) +
        '</h3><p>' +
        time(shot.startFrame, cut.fps) +
        '–' +
        time(shot.endFrame, cut.fps) +
        ' · ' +
        E(shot.form) +
        '</p>' +
        info
          .map(
            (c) =>
              '<p>' +
              E(c.text) +
              '</p>' +
              c.claimIds
                .map((id) => byClaim.get(id))
                .filter(Boolean)
                .map(
                  (cl) =>
                    '<p>' +
                    E(cl.id + ' · ' + cl.text) +
                    '<br>' +
                    cl.evidence
                      .map((e) => sourceList(bySource.get(e.sourceId), e) + ' · ' + E(e.scope))
                      .join('<br>') +
                    '</p>',
                )
                .join(''),
          )
          .join('') +
        shot.references
          .map(
            (r) =>
              '<p><strong>' +
              ROLES[r.role] +
              '</strong> · ' +
              sourceList(bySource.get(r.sourceId), r) +
              ' · ' +
              E(r.use) +
              (r.rights ? ' · ' + E(r.rights) : '') +
              '</p>',
          )
          .join('') +
        (shot.generation ? '<p>生成说明 · ' + E(shot.generation) + '</p>' : '') +
        '</section>'
      );
    })
    .join('');
  const material = research.sources
    .filter((s) => s.rights)
    .map((s) => '<p>' + sourceList(s) + ' · ' + E(s.rights) + '</p>')
    .join('');
  const disclosure = cut.shots.flatMap((s) => s.tools || []).filter((t, i, x) => x.indexOf(t) === i);
  const processRows = research.searches
    .map((s) => '<p><strong>' + E(s.query) + '</strong>　' + E(s.summary) + '</p>')
    .join('');
  const rationale = p.stages.design.data.rationale || '';
  await mkdir(localPath(root, folder), { recursive: true });
  await writeFile(
    localPath(root, folder + '/证据溯源清单.html'),
    page(
      '证据溯源清单',
      p,
      '<h2>逐镜核验</h2>' + rows + (material ? '<h2>素材使用</h2>' + material : ''),
    ),
  );
  await writeFile(
    localPath(root, folder + '/制作与人机分工.html'),
    page(
      '制作与人机分工',
      p,
      '<h2>创作需求</h2><p>' +
        E(p.brief.topic) +
        '</p><p>受众 · ' +
        E(p.brief.audience) +
        '</p><p>美术 · ' +
        E(p.brief.style) +
        ' ' +
        E(rationale) +
        '</p>' +
        '<h2>证据检索</h2>' +
        processRows +
        '<h2>制作与审核</h2><p>审阅方式 · ' +
        MODES[p.mode].name +
        '</p><p>配音 · ' +
        E(cut.voiceProvider) +
        '</p><p>画面工具 · ' +
        E(disclosure.join('、')) +
        '</p>' +
        p.decisions
          .map(
            (d) =>
              '<p>' +
              E(
                d.stage +
                  ' · ' +
                  d.revision +
                  ' · ' +
                  (d.decision === 'accept'
                    ? '人工确认'
                    : d.decision === 'revise'
                      ? '人工退回'
                      : d.decision === 'mode-change'
                        ? '用户变更审阅档位'
                        : '按所选档位继续'),
              ) +
              (d.message ? ' · ' + E(d.message) : '') +
              '</p>',
          )
          .join('') +
        '<h2>成片规格</h2><p>' +
        cut.width +
        ' × ' +
        cut.height +
        ' · ' +
        cut.fps +
        ' fps · ' +
        cut.frames +
        ' 帧</p>',
    ),
  );
}

export async function exportPdfs(root, env, folder, names = ['证据溯源清单', '制作与人机分工']) {
  if (!env.bins.chrome || process.env.EVIDENCE_VIDEO_SKIP_PDF === '1') return [];
  const profile = await mkdtemp(join(tmpdir(), 'evidence-video-pdf-'));
  const files = [];
  try {
    for (const name of names) {
      const input = localPath(root, folder + '/' + name + '.html');
      const file = folder + '/' + name + '.pdf';
      const output = localPath(root, file);
      try {
        await processFile(
          env.bins.chrome,
          [
            '--headless',
            '--disable-background-networking',
            '--no-pdf-header-footer',
            '--user-data-dir=' + profile,
            '--print-to-pdf=' + output,
            pathToFileURL(input).href,
          ],
          { timeout: 22000 },
        );
        if ((await stat(output)).size > 1000) files.push(file);
      } catch {
        await rm(output, { force: true });
      }
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
  return files;
}
