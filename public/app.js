const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const S = {
  config: null,
  projects: [],
  p: null,
  page: 'home',
  version: null,
  shot: null,
  scope: 'full',
  frame: 0,
  note: null,
  region: null,
  filter: 'all',
  env: null,
};
const E = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const paths = {
  logo: 'M3 7h18v13H3z M3 11h18 M8 7l3 4 M15 7l3 4 M8 16h8',
  home: 'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
  evidence: 'M5 3h11l3 3v15H5z M15 3v5h4 M8 12h8 M8 16h8',
  shots: 'M3 5h18v15H3z M3 10h18 M8 5v5 M16 5v5 M8 15h8',
  review: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
  export: 'M12 3v13 m-4-4 4 4 4-4 M5 16v4h14v-4',
  plus: 'M12 5v14 M5 12h14',
  tools: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  play: 'm9 5 11 7-11 7z',
  pause: 'M9 5v14 M15 5v14',
  prev: 'M14 7l-5 5 5 5',
  next: 'M10 7l5 5-5 5',
  close: 'm6 6 12 12 M18 6 6 18',
  search: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M14 14l6 6',
  photo: 'M3 7h4l2-3h6l2 3h4v13H3z M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  check: 'm5 12 4 4L19 6',
  edit: 'm4 16 12-12 4 4L8 20H4z M13 7l4 4',
  link: 'M9 15l6-6 M7 17l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0 M17 7l1-1a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0',
};
const icon = (name) =>
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + paths[name] + '"/></svg>';
const pages = [
  ['home', '工作台', 'home'],
  ['brief', '创作简报', 'check'],
  ['evidence', '证据与参考', 'evidence'],
  ['shots', '分镜与美术', 'shots'],
  ['review', '视频审阅', 'review'],
  ['export', '成片交付', 'export'],
];
const movie = () => S.p?.versions.find((c) => c.revision === S.version) || latest();
const latest = () => [...(S.p?.versions || [])].reverse().find((c) => !c.rejected);
const currentShot = () => movie()?.shots.find((s) => s.id === S.shot) || movie()?.shots[0];
const shots = () =>
  S.p?.stages.revisionPlan?.data.shots ||
  (S.p?.stages.production && latest()?.shots) ||
  S.p?.stages.design?.data.shots ||
  S.p?.lastDesign?.shots ||
  [];
const sources = () => [
  ...(S.p?.briefSources || []),
  ...(S.p?.stages.research?.data.sources || []),
  ...(S.p?.addedSources || []),
];
const sourceOf = (id) => sources().find((s) => s.id === id);
const active = () => S.p?.job?.state === 'running';
const artifact = (file) =>
  file ? '/media/' + S.p.id + '/' + file.split('/').map(encodeURIComponent).join('/') : '';
function url(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}
const link = (target, label, attrs = '') =>
  target ? '<a href="' + E(target) + '" ' + attrs + '>' + E(label) + '</a>' : '';
const button = (
  label,
  action,
  { i = '', primary = false, small = false, disabled = false, attrs = '' } = {},
) =>
  '<button type="button" class="button' +
  (primary ? ' primary' : '') +
  (small ? ' small-button' : '') +
  '" data-action="' +
  action +
  '" ' +
  (disabled ? 'disabled ' : '') +
  attrs +
  '>' +
  (i ? icon(i) : '') +
  E(label) +
  '</button>';
const tag = (label, variant = '') => '<span class="tag ' + variant + '">' + E(label) + '</span>';
function time(n, fps = 30, digits = 1) {
  const sec = Math.max(0, n) / fps;
  return (
    String(Math.floor(sec / 60)).padStart(2, '0') +
    ':' +
    (sec % 60).toFixed(digits).padStart(digits ? digits + 3 : 2, '0')
  );
}
function flash(message, error = false) {
  toast.textContent = message;
  toast.className = 'show' + (error ? ' error' : '');
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => (toast.className = ''), 3800);
}
async function api(path, method = 'GET', body) {
  const headers =
    body instanceof File
      ? { 'content-type': 'application/octet-stream' }
      : body
        ? { 'content-type': 'application/json' }
        : {};
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body instanceof File ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '操作暂时没有完成。');
  return data;
}
const endpoint = (action = '') => '/projects/' + S.p.id + (action ? '/' + action : '');
const projectApi = (action, body = {}) => api(endpoint(action), 'POST', body);
function setProject(p) {
  S.p = p;
  if (!p.versions.some((v) => v.revision === S.version)) {
    S.version = latest()?.revision || null;
    S.frame = 0;
  }
  if (S.page === 'shots' && !shots().some((s) => s.id === S.shot)) S.shot = shots()[0]?.id;
}
async function load(id) {
  S.version = null;
  S.scope = 'full';
  S.frame = 0;
  S.shot = null;
  S.note = null;
  S.region = null;
  S.page = 'home';
  setProject(await api('/projects/' + id));
  history.replaceState(null, '', '/?project=' + id);
  render();
}
function render() {
  app.innerHTML =
    '<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">' +
    icon('logo') +
    '</span>可信短片工作台</div>' +
    '<div class="project-switch"><select id="project-switch" aria-label="切换项目"><option value="">选择项目</option>' +
    S.projects
      .map(
        (p) =>
          '<option value="' +
          p.id +
          '"' +
          (S.p?.id === p.id ? ' selected' : '') +
          '>' +
          E(p.title) +
          '</option>',
      )
      .join('') +
    '</select>' +
    button('新建项目', 'new', { i: 'plus', small: true }) +
    '</div>' +
    '<nav class="nav" aria-label="制作导航">' +
    pages
      .map(
        ([id, label, glyph]) =>
          '<button data-action="nav" data-page="' +
          id +
          '" class="' +
          (S.page === id ? 'current' : '') +
          '">' +
          icon(glyph) +
          E(label) +
          '</button>',
      )
      .join('') +
    '</nav>' +
    '<div class="side-end">' +
    button('检查工具', 'env', { i: 'tools', small: true }) +
    button('体验示例', 'demo', { i: 'play', small: true }) +
    '</div></aside>' +
    '<main class="content"><div class="top"><div class="breadcrumb">制作空间 <span aria-hidden="true">/</span> <strong>' +
    E(pages.find((x) => x[0] === S.page)[1]) +
    '</strong></div>' +
    button('制作环境', 'env', { i: 'tools', small: true }) +
    '</div><div id="view">' +
    view() +
    '</div></main></div>';
  if (S.p) {
    bindPlayer();
  }
}
function view() {
  if (!S.p)
    return (
      '<div class="panel hero-empty"><div class="decor"></div><div class="message"><h1>从找到证据<br>到做出短片</h1><p>告诉 Agent 你想做什么。选择检查的细致程度，再一起完成短片。</p><div class="row">' +
      button('新建项目', 'new', { primary: true, i: 'plus' }) +
      button('体验示例', 'demo', { i: 'play' }) +
      '</div></div></div>'
    );
  const body = {
    home,
    brief,
    evidence,
    shots: shotView,
    review: () => home(true),
    export: delivery,
  }[S.page]();
  const tab = S.page === 'home' ? S.p.title : pages.find((entry) => entry[0] === S.page)[1];
  const jobs = S.p.gate
    ? button('查看待确认内容', 'go-gate', { primary: true, i: 'check' })
    : active()
      ? button('暂停', 'pause', { i: 'pause' })
      : S.p.next
        ? button(
            S.p.job?.state === 'failed' ? '继续制作' : S.p.stages.research ? '继续制作' : '开始制作',
            'run',
            { primary: true, i: 'play' },
          )
        : '';
  return (
    '<header class="header"><div class="heading-block"><div class="row">' +
    tag(S.p.modeInfo.name) +
    (S.p.demo ? tag('演示项目', 'neutral') : '') +
    '</div><h1>' +
    E(tab) +
    '</h1><p class="muted">' +
    E(S.page === 'home' ? S.p.brief.topic : S.p.title) +
    '</p></div>' +
    '<div class="row header-controls">' +
    button('项目设置', 'brief', { i: 'tools' }) +
    jobs +
    '</div></header>' +
    progress() +
    body
  );
}
function progress() {
  const current = S.p.gate?.stage || S.p.job?.stage || S.p.next;
  const page = {
    brief: 'brief',
    research: 'evidence',
    script: 'shots',
    design: 'shots',
    production: 'review',
    delivery: 'export',
  };
  return (
    '<div class="progress-strip">' +
    S.config.stages
      .map(
        (id, i) =>
          '<button class="progress-item ' +
          (S.p.stages[id] ? 'complete ' : '') +
          (current === id ? 'current' : '') +
          '" data-action="nav" data-page="' +
          page[id] +
          '"><span class="step">' +
          (S.p.stages[id] ? '✓' : String(i + 1).padStart(2, '0')) +
          '</span>' +
          E(S.config.titles[id]) +
          '</button>',
      )
      .join('') +
    '</div>'
  );
}
function notice() {
  const { p } = S;
  if (p.gate)
    return (
      '<div class="notice"><strong>等待确认 · ' +
      E(S.config.titles[p.gate.stage]) +
      '</strong><p>' +
      E(p.modeInfo.name) +
      '。确认后继续。</p><div class="row">' +
      button('确认并继续', 'approve', { primary: true, small: true }) +
      button('提出修改', 'reject', { small: true }) +
      '</div></div>'
    );
  if (active())
    return (
      '<div class="notice"><div class="row"><span class="spinner"></span><strong id="job-status">' +
      E(p.job.handoff ? '等待 Agent 继续 · ' + S.config.titles[p.job.stage] : p.statusLine) +
      '</strong></div><p id="job-detail" class="small">' +
      E(
        p.job.handoff
          ? '在工作台确认或修改后，回到对话说「继续」「我已确认」或「我已修改」。'
          : p.job.detail || p.job.message || 'Agent 正在处理',
      ) +
      '</p>' +
      (p.job.handoff ? button('复制继续指令', 'copy-task', { small: true, primary: true }) : '') +
      '</div>'
    );
  if (p.job?.state === 'failed')
    return (
      '<div class="notice warn"><strong>需要处理</strong><p>' +
      E(p.job.message) +
      '</p>' +
      button('检查工具', 'env', { small: true, i: 'tools' }) +
      '</div>'
    );
  if (p.stages.delivery)
    return (
      '<div class="notice"><strong>成片已就绪</strong><p>可以下载成片，或继续批注。</p>' +
      button('查看交付', 'nav', { small: true, i: 'export', attrs: 'data-page="export"' }) +
      '</div>'
    );
  return (
    '<div class="notice"><strong>' + E(p.statusLine) + '</strong><p>' + E(p.modeInfo.hint) + '</p></div>'
  );
}
function home(review = false) {
  return (
    '<div class="layout ' +
    (review ? 'review-layout' : '') +
    '"><div class="stack">' +
    (review
      ? '<div class="notice"><strong>在页面内审阅</strong><p>暂停画面后用「截帧批注」或「区间批注」圈出问题；确认与退回只在这里完成，聊天里的意见不算修改。</p></div>'
      : '') +
    player() +
    '</div><aside class="stack">' +
    notice() +
    notesPanel() +
    '</aside></div>'
  );
}
function player() {
  const cut = movie();
  if (!cut)
    return (
      '<section class="panel player-panel"><div class="panel-top"><h2>画面预览</h2></div><div class="screen empty-screen">' +
      icon('shots') +
      '<strong>完成镜头制作后在这里看片</strong></div></section>'
    );
  const viewOptions =
    '<div class="tabs" aria-label="播放范围"><button data-action="scope" data-scope="full" aria-pressed="' +
    (S.scope === 'full') +
    '">全片</button><button data-action="scope" data-scope="shot" aria-pressed="' +
    (S.scope === 'shot') +
    '">单镜</button></div>';
  const vSel =
    '<select id="version-switch" aria-label="视频版本">' +
    S.p.versions
      .map(
        (v, i) =>
          '<option value="' +
          v.revision +
          '" ' +
          (cut.revision === v.revision ? 'selected' : '') +
          '>V' +
          (i + 1) +
          ' · ' +
          E(v.description) +
          (v.rejected ? ' · 退回' : '') +
          '</option>',
      )
      .join('') +
    '</select>';
  const range = S.note?.range
    ? S.note.first === null
      ? '在播放条定位区间起点'
      : '起点 ' + time(S.note.first, cut.fps, 3) + '，拖动进度条选终点'
    : '';
  const compose = S.note
    ? '<form id="note-form" class="art-editor"><p id="range-status" class="small">' +
      E(range || '截帧 ' + time(S.note.first, cut.fps, 3) + ' · 可以在画面上拖出标记') +
      '</p>' +
      (S.note.range
        ? '<div class="row">' +
          button('记为起点', 'range-start', { small: true }) +
          button('记为终点', 'range-end', { small: true }) +
          '</div>'
        : '') +
      '<label>修改意见<textarea required name="text" placeholder="例如：这条引导线应指向右侧的仪表"></textarea></label><div class="row">' +
      '<button class="button primary small-button" type="submit">保存批注</button>' +
      button('取消', 'cancel-note', { small: true }) +
      '</div></form>'
    : '';
  return (
    '<section class="panel player-panel"><div class="panel-top"><h2>画面预览</h2><div class="row">' +
    viewOptions +
    vSel +
    '</div></div>' +
    '<div class="screen" id="screen"><video id="film" preload="metadata" playsinline src="' +
    artifact(cut.video) +
    '" poster="' +
    artifact(currentShot()?.poster) +
    '"></video><p class="caption" id="caption"></p>' +
    (S.note
      ? '<div class="crosshair" id="crosshair"><div class="rectangle" id="rect" hidden></div></div>'
      : '') +
    '</div>' +
    '<div class="player-foot"><div class="transport">' +
    '<button class="icon-button" data-action="prev-frame" title="上一帧" aria-label="上一帧">' +
    icon('prev') +
    '</button>' +
    '<button class="icon-button" data-action="play" title="播放或暂停" aria-label="播放或暂停">' +
    icon('play') +
    '</button>' +
    '<button class="icon-button" data-action="next-frame" title="下一帧" aria-label="下一帧">' +
    icon('next') +
    '</button>' +
    '<input type="range" id="scrub" aria-label="视频时间线" value="0" min="0" max="' +
    (cut.frames - 1) +
    '" step="1"><span class="time" id="time">00:00.0 / ' +
    time(cut.frames, cut.fps) +
    '</span></div>' +
    '<div class="shots-bar">' +
    cut.shots
      .map(
        (s) =>
          '<button class="shot-pill" data-action="seek" data-shot="' +
          s.id +
          '" title="' +
          E(s.title) +
          '">' +
          E(s.id + ' ' + s.title) +
          '</button>',
      )
      .join('') +
    '</div>' +
    '<div class="action-strip"><span id="shot-caption" class="small"></span><div class="row">' +
    button('截帧批注', 'new-note', { small: true, primary: true, i: 'photo' }) +
    button('区间批注', 'new-range', { small: true }) +
    '</div></div>' +
    compose +
    '</div></section>'
  );
}
function notesPanel() {
  const cut = movie();
  const notes = cut
    ? S.p.notes.filter(
        (n) =>
          n.version === cut.revision ||
          n.resultVersion === cut.revision ||
          n.proposedVersion === cut.revision,
      )
    : [];
  const open = cut ? notes.filter((n) => n.version === cut.revision && n.status === 'open').length : 0;
  return (
    '<section class="panel"><div class="panel-top"><h2>本轮批注</h2>' +
    tag(notes.length + ' 条', 'neutral') +
    '</div><div class="panel-body"><div class="notes-stack">' +
    (notes.length
      ? notes
          .map(
            (n) =>
              '<article class="note-card"><div class="row spread"><span class="small">' +
              E(n.shotIds.join(' · ')) +
              '　' +
              time(n.first, cut.fps, 3) +
              '</span>' +
              tag(
                n.status === 'resolved'
                  ? '已修改'
                  : n.status === 'closed'
                    ? '已关闭'
                    : n.proposedVersion
                      ? '已有候选版'
                      : '待处理',
                n.status === 'resolved' ? 'done' : 'neutral',
              ) +
              '</div>' +
              '<div class="' +
              (n.image ? 'note-attachment' : '') +
              '">' +
              (n.image ? '<img src="' + artifact(n.image) + '" alt="批注的原画面">' : '') +
              '<p>' +
              E(n.text) +
              '</p></div><div class="row">' +
              '<button class="button small-button" data-action="goto-note" data-note="' +
              n.id +
              '">定位</button>' +
              (n.proposedVersion || n.resultVersion
                ? '<button class="button small-button" data-action="compare" data-note="' +
                  n.id +
                  '">前后对照</button>'
                : '') +
              (n.status === 'open' && !S.p.revision
                ? '<button class="button flat small-button" data-action="close-note" data-note="' +
                  n.id +
                  '">关闭</button>'
                : '') +
              '</div></article>',
          )
          .join('')
      : '<p class="muted">暂停画面即可截帧，也可以批注一段动作。</p>') +
    '</div>' +
    (open && cut?.revision === latest()?.revision
      ? '<div class="row" style="margin-top:12px">' +
        button('按批注修改', 'revise', {
          primary: true,
          i: 'edit',
          disabled: active() || !!S.p.gate || !!S.p.revision,
        }) +
        '</div>'
      : '') +
    '</div></section>'
  );
}
const kindNames = {
  tts: '配音',
  music: '音乐',
  image: '图像',
  video: '视频',
  screenshot: '截图',
  vision: '视觉理解',
};
function refImage(ref) {
  const source = sourceOf(ref.sourceId);
  const img = source?.image ? artifact(source.image) : url(source?.imageUrl);
  return img
    ? '<img class="reference" loading="lazy" src="' + E(img) + '" alt="' + E(source.title) + '">'
    : '';
}
function brief() {
  const d = S.p.stages.brief?.data;
  const b = S.p.brief;
  const editable = !S.p.stages.research && !active();
  if (!d)
    return (
      '<div class="layout"><section class="panel panel-body"><h2>创作简报</h2>' +
      '<p class="muted">Agent 正在准备制作方式、风格方向与预算建议。完成后在这里确认。</p>' +
      '</section>' +
      notice() +
      '</div>'
    );
  const directions = d.styleDirections || [];
  const selected = b.styleDirectionId || d.recommendedDirection || directions[0]?.id || '';
  const method = b.productionMethod || d.productionMethod?.form || '';
  const budget = b.budget || { currency: 'USD', cap: 0, categories: [] };
  const caps = S.p.capabilities || {};
  const spent = (S.p.spend || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const choices = directions
    .map((dir) => {
      const refs = (dir.refs || []).map(refImage).join('');
      return (
        '<label class="doc-card"><div class="row"><input type="radio" name="styleDirectionId" value="' +
        E(dir.id) +
        '" ' +
        (dir.id === selected ? 'checked' : '') +
        (editable ? '' : ' disabled') +
        '><strong>' +
        E(dir.name) +
        '</strong>' +
        (dir.id === d.recommendedDirection ? tag('Agent 推荐', 'neutral') : '') +
        '</div><p class="small">' +
        E(dir.rationale) +
        '</p><div class="gallery">' +
        refs +
        '</div></label>'
      );
    })
    .join('');
  const methodOptions = options(S.config.forms, method, '请选择制作方式');
  const categories = ['tts', 'music', 'image', 'video']
    .map(
      (kind) =>
        '<label class="small"><input type="checkbox" name="categories" value="' +
        kind +
        '" ' +
        ((budget.categories || []).includes(kind) ? 'checked' : '') +
        (editable ? '' : ' disabled') +
        '> ' +
        kindNames[kind] +
        '</label>',
    )
    .join('');
  const capabilityRows = Object.entries(kindNames)
    .map(([kind, name]) => {
      const list = caps[kind] || [];
      return (
        '<tr><td>' +
        name +
        '</td><td>' +
        (list.length
          ? list
              .map(
                (item) =>
                  E(item.provider || item.id) +
                  (item.available === false ? '（不可用）' : '') +
                  (item.note ? ' · ' + E(item.note) : '') +
                  (item.cost ? ' · ' + E(item.cost) : ''),
              )
              .join('<br>')
          : '<span class="muted">未探测到</span>') +
        '</td></tr>'
      );
    })
    .join('');
  const spendRows = (S.p.spend || [])
    .map(
      (item) =>
        '<p class="small">' +
        E(item.category) +
        ' · ' +
        E(item.provider || '') +
        ' · ' +
        E(String(item.amount)) +
        ' · ' +
        E(item.purpose || '') +
        '</p>',
    )
    .join('');
  return (
    '<div class="layout"><div class="stack"><section class="panel panel-body stack"><div class="row spread"><h2>创作简报</h2>' +
    tag(`${b.seconds} 秒 · ${b.width}×${b.height} · ${b.fps}fps`) +
    '</div><p class="muted">' +
    E(b.topic) +
    '</p>' +
    (d.questions?.length
      ? '<details class="doc-card"><summary>Agent 想确认的问题</summary>' +
        d.questions.map((q) => '<p>' + E(q) + '</p>').join('') +
        '</details>'
      : '') +
    '<h3>人工检查</h3>' +
    (editable
      ? modeOptions(S.p.mode)
      : '<p class="small">' + E(S.p.modeInfo?.name || '') + '</p>') +
    '<h3>制作方式</h3><p class="small">' +
    E(d.productionMethod?.reason || '') +
    '</p>' +
    (d.productionMethod?.effort ? '<p class="small muted">工期：' + E(d.productionMethod.effort) + '</p>' : '') +
    (d.productionMethod?.risk ? '<p class="small muted">风险：' + E(d.productionMethod.risk) + '</p>' : '') +
    '<form id="brief-form"><div class="two-columns"><label>制作方式<select name="productionMethod" ' +
    (editable ? '' : 'disabled') +
    '>' +
    methodOptions +
    '</select></label><label>备注<input name="briefNotes" value="' +
    E(b.briefNotes || '') +
    '" ' +
    (editable ? '' : 'disabled') +
    '></label></div><h3>风格方向</h3><div class="stack">' +
    (choices || '<p class="muted">Agent 还没有提交风格方向。</p>') +
    '</div><h3>付费生成</h3><div class="two-columns">' +
    '<label class="small"><input type="checkbox" name="allowPaidGeneration" ' +
    (b.allowPaidGeneration ? 'checked' : '') +
    (editable ? '' : ' disabled') +
    '> 允许付费生成（按预算上限记账）</label>' +
    '<label>预算上限<input type="number" name="budgetCap" min="0" step="0.01" value="' +
    E(String(budget.cap)) +
    '" ' +
    (editable ? '' : 'disabled') +
    '></label></div><div class="row"><label>币种<select name="budgetCurrency" ' +
    (editable ? '' : 'disabled') +
    '>' +
    options(['USD', 'CNY'], budget.currency) +
    '</select></label><div class="row">' +
    categories +
    '</div></div>' +
    (editable
      ? '<div class="row"><button type="submit" class="button primary small-button">保存简报</button></div>'
      : '') +
    '</form></section></div><aside class="stack">' +
    notice() +
    '<section class="panel panel-body"><h2 class="panel-title">可用能力</h2><table class="small">' +
    capabilityRows +
    '</table><p class="small muted">付费调用前先在这里确认预算；每次调用都要登记花费。</p></section>' +
    '<section class="panel panel-body"><h2 class="panel-title">花费</h2>' +
    '<p class="small">已登记 ' +
    spent.toFixed(2) +
    ' ' +
    E(budget.currency) +
    ' / 上限 ' +
    Number(budget.cap || 0).toFixed(2) +
    '</p>' +
    (spendRows || '<p class="muted small">还没有付费调用。</p>') +
    '</section></aside></div>'
  );
}
const roleNames = { evidence: '事实依据', reality: '现实参考', style: '美术参考', asset: '直接入片' };
function sourceCard(source, ref) {
  const img = source.image ? artifact(source.image) : url(source.imageUrl);
  const destination = url(source.url) || artifact(source.file);
  if (img)
    return (
      '<article class="reference"><img loading="lazy" src="' +
      E(img) +
      '" alt="' +
      E(source.title) +
      '"><p>' +
      link(destination, source.title, 'target="_blank" rel="noopener noreferrer"') +
      (ref ? '<br><span class="small">' + E(ref.use) + ' · ' + E(ref.locator) + '</span>' : '') +
      '</p></article>'
    );
  return (
    '<article class="doc-card"><strong>' +
    (link(destination, source.title, 'target="_blank" rel="noopener noreferrer"') || E(source.title)) +
    '</strong>' +
    '<span class="small">' +
    E([source.kind, source.creator, source.date, source.doi].filter(Boolean).join(' · ')) +
    '</span>' +
    (ref ? '<p>' + E(ref.use) + ' · ' + E(ref.locator) + '</p>' : '') +
    '</article>'
  );
}
function evidence() {
  const r = S.p.stages.research?.data;
  const refs = shots().flatMap((s) => s.references || []);
  const used = new Set(refs.filter((x) => x.role === S.filter).map((x) => x.sourceId));
  const rows = sources().filter(
    (s) =>
      S.filter === 'all' ||
      used.has(s.id) ||
      (S.filter === 'evidence' && r?.claims.some((c) => c.evidence.some((e) => e.sourceId === s.id))),
  );
  return (
    '<div class="layout"><section class="panel panel-body"><div class="section-row"><h2>结论与原文</h2>' +
    button('添加资料', 'add', { i: 'plus', small: true }) +
    '</div>' +
    (r
      ? '<div class="list">' +
        r.claims
          .map(
            (c) =>
              '<article class="doc-card"><strong>' +
              E(c.text) +
              '</strong>' +
              c.evidence
                .map((item) => {
                  const source = sources().find((s) => s.id === item.sourceId);
                  return (
                    '<p>' +
                    link(
                      url(source?.url) || artifact(source?.file),
                      source?.title || item.sourceId,
                      'target="_blank" rel="noopener noreferrer"',
                    ) +
                    ' · ' +
                    E(item.locator) +
                    '</p><p class="small">' +
                    E(item.scope) +
                    '</p>'
                  );
                })
                .join('') +
              '</article>',
          )
          .join('') +
        '</div>'
      : '<div class="empty-text">Agent 检索并核对的原文会出现在这里。</div>') +
    (r?.gaps?.length
      ? '<details class="doc-card"><summary>资料缺口</summary>' +
        r.gaps.map((g) => '<p>' + E(g) + '</p>').join('') +
        '</details>'
      : '') +
    (r?.searches?.length
      ? '<details class="doc-card"><summary>检索记录</summary>' +
        r.searches.map((s) => '<p>' + E(s.query + ' · ' + s.summary) + '</p>').join('') +
        '</details>'
      : '') +
    '</section>' +
    '<aside class="stack">' +
    notice() +
    '<section class="panel panel-body"><div class="section-row"><h2>参考库</h2></div><div class="source-roles">' +
    [['all', '全部'], ...Object.entries(roleNames)]
      .map(([id, name]) =>
        button(name, 'filter', {
          small: true,
          attrs: 'data-filter="' + id + '" aria-pressed="' + (S.filter === id) + '"',
        }),
      )
      .join('') +
    '</div>' +
    '<div class="gallery">' +
    (rows.map((s) => sourceCard(s)).join('') || '<p class="muted">这个分类的参考会随分镜补齐。</p>') +
    '</div></section>' +
    '<section class="panel panel-body"><div class="section-row"><h2>你提供的资料</h2></div><div class="list">' +
    (S.p.inputs.map((s) => sourceCard(s)).join('') ||
      '<p class="muted">可添加原始链接、现实照片或美术参考。</p>') +
    '</div></section></aside></div>'
  );
}
function options(values, selected, placeholder = '') {
  const all = selected && !values.includes(selected) ? [...values, selected] : values;
  return (
    (placeholder ? '<option value="">' + E(placeholder) + '</option>' : '') +
    all
      .map(
        (v) =>
          '<option value="' +
          E(v) +
          '" ' +
          (v === selected ? 'selected' : '') +
          '>' +
          E(v) +
          '</option>',
      )
      .join('')
  );
}
function shotView() {
  const data = shots();
  const shot = data.find((s) => s.id === S.shot) || data[0];
  const narration = S.p.stages.design?.data.narration || S.p.narration;
  const cues = S.p.stages.script?.data.cues || [];
  if (!shot)
    return (
      '<div class="layout"><div class="panel panel-body"><h2 class="panel-title">旁白</h2>' +
      (narration
        ? '<audio controls style="width:100%;margin:8px 0" src="' +
          artifact(narration.audio) +
          '"></audio>'
        : '') +
      (S.p.narrationIssue ? '<p class="muted">' + E(S.p.narrationIssue) + '</p>' : '') +
      (cues.length
        ? cues.map((c) => '<p class="doc-card">' + E(c.text) + '</p>').join('')
        : '<div class="empty-text">旁白和分镜将在证据检索后出现。</div>') +
      '</div>' +
      notice() +
      '</div>'
    );
  const shotCues = cues.filter((c) => shot.cueIds.includes(c.id));
  const claimIds = [...new Set(shotCues.flatMap((c) => c.claimIds || []))];
  const typeNames = { fact: '事实', interpretation: '推断', outlook: '展望' };
  const claims = (S.p.stages.research?.data.claims || []).filter((c) => claimIds.includes(c.id));
  const claimsBlock = claims.length
    ? '<section class="doc-card"><strong>这段旁白的依据</strong>' +
      claims
        .map(
          (c) =>
            '<p>' +
            tag(typeNames[c.type] || c.type, 'neutral') +
            ' ' +
            E(c.text) +
            '</p>' +
            c.evidence
              .map((item) => {
                const src = sourceOf(item.sourceId);
                return (
                  '<p class="small">' +
                  link(
                    url(src?.url) || artifact(src?.file),
                    src?.title || item.sourceId,
                    'target="_blank" rel="noopener noreferrer"',
                  ) +
                  ' · ' +
                  E(item.locator) +
                  '<br>' +
                  E(item.scope) +
                  '</p>'
                );
              })
              .join(''),
        )
        .join('') +
      '</section>'
    : '<section class="doc-card"><strong>这段旁白的依据</strong><p class="muted small">这段旁白没有关联事实陈述。</p></section>';
  return (
    '<div class="layout"><div class="panel panel-body stack"><div class="row spread"><h2>' +
    E(shot.id + ' · ' + shot.title) +
    '</h2>' +
    '<div class="row">' +
    (latest()
      ? button('播放此镜', 'view-shot', { small: true, i: 'play', attrs: 'data-shot="' + shot.id + '"' })
      : '') +
    (S.p.stages.production
      ? button(S.p.lockedShots?.[shot.id] ? '解除镜头锁定' : '锁定镜头', 'lock-shot', {
          small: true,
          attrs: 'data-shot="' + shot.id + '"',
          disabled: active(),
        })
      : '') +
    '</div></div>' +
    (!S.p.stages.design?.data?.shots?.length &&
    !S.p.stages.production &&
    S.p.lastDesign?.shots?.length
      ? '<div class="notice"><strong>分镜正在重做</strong><p>下面是上一版分镜，可以继续查看；Agent 提交新分镜后会自动替换。</p></div>'
      : '') +
    '<div class="row">' +
    tag(shot.style) +
    tag(shot.form, 'neutral') +
    tag(
      time(shot.startFrame, narration?.fps || S.p.brief.fps, 3) +
        '—' +
        time(shot.endFrame, S.p.brief.fps, 3),
      'neutral',
    ) +
    '</div>' +
    (shot.poster || shot.styleFrame
      ? '<img class="reference" style="width:100%" src="' +
        artifact(shot.poster || shot.styleFrame) +
        '" alt="镜头预览定帧">'
      : '') +
    '<section class="doc-card"><strong>旁白</strong>' +
    shotCues.map((c) => '<p>' + E(c.text) + '</p>').join('') +
    '</section>' +
    claimsBlock +
    '<p>' +
    E(shot.visual) +
    '</p>' +
    (shot.motionPlan
      ? '<details class="doc-card"><summary>动效方案 · ' +
        E(shot.motionPlan.type) +
        '</summary><p>' +
        E(shot.motionPlan.description) +
        '</p><ul>' +
        (shot.motionPlan.beats || []).map((beat) => '<li>' + E(beat) + '</li>').join('') +
        '</ul></details>'
      : '') +
    '<form class="art-editor" id="art-form"><input type="hidden" name="shotId" value="' +
    shot.id +
    '"><div class="two-columns">' +
    '<label>镜头风格<select name="style">' +
    options(S.config.styles, shot.style) +
    '</select></label><label>呈现方式<select name="form">' +
    options(S.config.forms, shot.form) +
    '</select></label></div>' +
    '<div class="row"><button type="submit" class="button small-button" ' +
    (active() ? 'disabled' : '') +
    '>保存镜头选择</button></div></form>' +
    '<details><summary>验收要点</summary><ul class="approved-list">' +
    shot.mustShow
      .map((item) => {
        const check = shot.checks?.find((value) => value.item === item);
        return (
          '<li>' +
          E(item) +
          (check ? '<p>' + E(check.evidence) + '</p>' : '') +
          (check?.image
            ? link(
                artifact(check.image),
                '查看验收帧 · ' + time(shot.startFrame + check.frame, S.p.brief.fps, 3),
                'target="_blank" rel="noopener noreferrer" class="button small-button"',
              )
            : '') +
          '</li>'
        );
      })
      .join('') +
    '</ul></details>' +
    (shot.onScreen?.length
      ? '<details><summary>上屏文字</summary><p>' + E(shot.onScreen.join(' · ')) + '</p></details>'
      : '') +
    (shot.realityMatch
      ? '<details class="doc-card"><summary>现实参考说明</summary><p>' +
        E(shot.realityMatch.note || '') +
        '</p><p class="small">最相近场景：' +
        E(shot.realityMatch.closest || '') +
        '</p></details>'
      : '') +
    '<h2>本镜参考</h2><div class="reference-grid">' +
    shot.references
      .map((ref) => {
        const src = sources().find((s) => s.id === ref.sourceId);
        return src
          ? '<div class="stack">' + tag(roleNames[ref.role], 'neutral') + sourceCard(src, ref) + '</div>'
          : '';
      })
      .join('') +
    '</div></div><aside class="stack">' +
    notice() +
    '<section class="panel panel-body shot-panel"><h2 class="panel-title">镜头列表</h2><div class="shot-list">' +
    data
      .map(
        (s) =>
          '<button class="button ' +
          (s.id === shot.id ? 'active' : '') +
          '" data-action="select-shot" data-shot="' +
          s.id +
          '"><strong>' +
          E(s.id + ' · ' + s.title) +
          '</strong><span class="small">' +
          E(s.form) +
          '</span></button>',
      )
      .join('') +
    '</div></section></aside></div>'
  );
}
function delivery() {
  const d = S.p.stages.delivery?.data;
  if (!d)
    return (
      '<div class="layout"><div class="empty-text">完成预览后，成片、字幕和证据清单会在这里一起交付。</div>' +
      notice() +
      '</div>'
    );
  const out = [
    ['成片 MP4', d.video, 'download'],
    ['字幕 SRT', d.srt, 'download'],
    ['证据溯源清单', d.evidence, 'view', d.evidencePdf],
    ['制作与人机分工', d.process, 'view', d.processPdf],
    ['镜头时间线', d.timeline, 'download'],
  ];
  return (
    '<div class="layout"><section class="panel panel-body stack"><div class="row spread"><h2>交付文件</h2>' +
    tag(d.width + ' × ' + d.height + ' · ' + d.fps + ' fps') +
    '</div>' +
    out
      .map(
        ([label, file, action, pdf]) =>
          '<div class="doc-card"><div class="row spread"><strong>' +
          E(label) +
          '</strong><div class="row">' +
          link(
            artifact(file) + (action === 'download' ? '?download=1' : ''),
            action === 'download' ? '下载' : pdf ? '打开' : '打开 / 打印为 PDF',
            'class="button small-button" ' +
              (action === 'view' ? 'target="_blank" rel="noopener noreferrer"' : ''),
          ) +
          (pdf ? link(artifact(pdf) + '?download=1', '下载 PDF', 'class="button small-button"') : '') +
          '</div></div></div>',
      )
      .join('') +
    '<p class="small">预算：' +
    Number(S.p.brief?.budget?.cap || 0).toFixed(2) +
    ' ' +
    E(S.p.brief?.budget?.currency || 'USD') +
    ' · 已登记 ' +
    (S.p.spend || []).reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2) +
    '</p>' +
    (d.evidencePdf && d.processPdf
      ? ''
      : '<p class="small muted">PDF 未生成：当前环境没有可用的无头浏览器。报告页可以直接在浏览器里打印或存为 PDF。</p>') +
    '<details><summary>镜头源文件</summary><div class="list">' +
    (latest()
      ?.shots.map(
        (s) =>
          '<div class="doc-card"><strong>' +
          E(s.id + ' ' + s.title) +
          '</strong><div class="row">' +
          [s.origin, ...(s.editable || [])]
            .filter(Boolean)
            .filter((x, i, a) => a.indexOf(x) === i)
            .map((f) => link(artifact(f) + '?download=1', f.split('/').at(-1)))
            .join('') +
          '</div></div>',
      )
      .join('') || '') +
    '</div></details></section>' +
    notice() +
    '</div>'
  );
}
function bindPlayer() {
  const video = document.querySelector('#film');
  const scrub = document.querySelector('#scrub');
  const cut = movie();
  if (!video || !cut) return;
  const bounds = () =>
    S.scope === 'shot' && currentShot()
      ? [currentShot().startFrame, currentShot().endFrame - 1]
      : [0, cut.frames - 1];
  const sync = (frame) => {
    const [first, last] = bounds();
    const at = Math.max(first, Math.min(last, frame));
    video.currentTime = (at + 0.05) / cut.fps;
    S.frame = at;
    paintTime(at);
  };
  const update = () => {
    const [first, last] = bounds();
    const frame = Math.min(cut.frames - 1, Math.round(video.currentTime * cut.fps));
    if (S.scope === 'shot' && frame > last && !video.paused) {
      video.pause();
      sync(last);
    } else {
      if (!video.requestVideoFrameCallback) S.frame = frame;
      paintTime(frame);
    }
    scrub.min = first;
    scrub.max = last;
  };
  video.addEventListener(
    'loadedmetadata',
    () => {
      sync(S.frame || bounds()[0]);
      update();
    },
    { once: true },
  );
  video.addEventListener('timeupdate', update);
  video.addEventListener('seeked', update);
  video.addEventListener(
    'play',
    () => (document.querySelector('[data-action=play]').innerHTML = icon('pause')),
  );
  video.addEventListener('pause', () =>
    document.querySelector('[data-action=play]')?.replaceChildren(iconNode('play')),
  );
  if (video.requestVideoFrameCallback) {
    const f = (_, meta) => {
      if (!video.isConnected) return;
      if (!video.seeking) {
        S.frame = Math.min(cut.frames - 1, Math.round(meta.mediaTime * cut.fps));
        paintTime(S.frame);
      }
      video.requestVideoFrameCallback(f);
    };
    video.requestVideoFrameCallback(f);
  }
  scrub.addEventListener('input', () => sync(Number(scrub.value)));
  const area = document.querySelector('#crosshair');
  if (area && !S.note.range) {
    let start;
    const point = (event) => {
      const rect = area.getBoundingClientRect();
      const cap = (x) => Math.max(0, Math.min(1, x));
      return [cap((event.clientX - rect.x) / rect.width), cap((event.clientY - rect.y) / rect.height)];
    };
    area.addEventListener('pointerdown', (e) => {
      start = point(e);
      area.setPointerCapture(e.pointerId);
    });
    area.addEventListener('pointermove', (e) => {
      if (!start) return;
      const [x, y] = point(e);
      S.region = [
        Math.min(start[0], x),
        Math.min(start[1], y),
        Math.abs(start[0] - x),
        Math.abs(start[1] - y),
      ];
      paintRect();
    });
    area.addEventListener('pointerup', () => {
      start = null;
    });
    paintRect();
  }
}
function iconNode(name) {
  const elem = document.createElement('span');
  elem.innerHTML = icon(name);
  return elem.firstElementChild;
}
function paintRect() {
  const box = document.querySelector('#rect');
  if (!box || !S.region) return;
  box.hidden = false;
  [box.style.left, box.style.top, box.style.width, box.style.height] = S.region.map(
    (v) => v * 100 + '%',
  );
}
function paintTime(frame) {
  const cut = movie();
  if (!cut) return;
  const shot = cut.shots.find((a) => a.startFrame <= frame && a.endFrame > frame);
  const timeEl = document.querySelector('#time');
  if (!timeEl) return;
  const range = document.querySelector('#scrub');
  range.value = frame;
  timeEl.textContent = time(frame, cut.fps) + ' / ' + time(cut.frames, cut.fps);
  document.querySelector('#shot-caption').textContent = shot ? shot.id + ' · ' + shot.title : '';
  const cue = (cut.cues || S.p.narration?.cues)?.find(
    (c) => (c.subtitleStartFrame ?? c.startFrame) <= frame && c.speechEndFrame > frame,
  );
  document.querySelector('#caption').textContent = cue?.text || '';
  for (const b of document.querySelectorAll('.shot-pill'))
    b.classList.toggle('is-current', b.dataset.shot === shot?.id);
}

function show(title, contents) {
  dialog.innerHTML =
    '<div class="dialog-head"><h2>' +
    E(title) +
    '</h2><button class="icon-button" aria-label="关闭" data-action="dialog-close">' +
    icon('close') +
    '</button></div><div class="dialog-body">' +
    contents +
    '</div>';
  if (!dialog.open) dialog.showModal();
}
const fields = (form) => Object.fromEntries(new FormData(form));
function modeOptions(mode) {
  return (
    '<fieldset><legend>人工检查</legend><div class="mode-select">' +
    Object.entries(S.config.modes)
      .map(
        ([id, v]) =>
          '<label><input type="radio" name="mode" value="' +
          id +
          '" ' +
          (mode === id ? 'checked' : '') +
          '><span><strong>' +
          E(v.name) +
          '</strong><span class="small">' +
          E(v.hint) +
          '</span></span></label>',
      )
      .join('') +
    '</div></fieldset>'
  );
}
function driverOptions(driver = 'codex') {
  return [
    ['codex', '本机 Codex · 使用已有配置'],
    ['clean', '本机 Codex · 内置工具'],
    ['current', '交给当前对话'],
  ]
    .map(
      ([id, label]) =>
        '<option value="' + id + '" ' + (driver === id ? 'selected' : '') + '>' + label + '</option>',
    )
    .join('');
}
function newProject() {
  show(
    '新建短片',
    '<form id="new-form"><label>项目名称<input required name="title" maxlength="100" placeholder="例如：火星车怎样自己认路"></label>' +
      '<label>你想做什么<textarea required name="topic" rows="3" placeholder="介绍主题，以及你希望保留的内容"></textarea></label>' +
      '<div class="two-columns"><label>面向谁<input name="audience" placeholder="普通观众"></label><label>最长时长（秒）<input name="seconds" type="number" min="10" max="600" value="45" required></label></div>' +
      modeOptions('balanced') +
      '<details><summary>美术设置与初始参考</summary><div class="stack" style="margin-top:10px"><div class="two-columns">' +
      '<label>全片风格<select name="style">' +
      options(S.config.styles, '由 Agent 推荐') +
      '</select></label><label>优先呈现方式<select name="form">' +
      options(S.config.forms, '', '由 Agent 按镜头选择') +
      '</select></label></div>' +
      '<label>美术限制<textarea name="artLimits" placeholder="例如：写实工位，亮度自然，避免大面积玻璃效果"></textarea></label>' +
      '<label>上传参考<input type="file" name="initial" accept="image/*,.pdf,.mp4,.wav,.srt" multiple></label></div></details>' +
      '<details><summary>Agent 连接方式</summary><label style="margin-top:8px"><select name="driver" aria-label="Agent 连接方式">' +
      driverOptions(S.config.defaultDriver) +
      '</select></label></details>' +
      '<div class="dialog-actions">' +
      button('取消', 'dialog-close') +
      '<button class="button primary" type="submit">创建并开始制作</button></div></form>',
  );
}
function projectSettings() {
  const b = S.p.brief;
  show(
    '项目设置',
    '<form id="settings-form">' +
      modeOptions(S.p.mode) +
      '<details ' +
      (active() ? '' : 'open') +
      '><summary>全片美术与交付</summary><div class="stack" style="margin-top:10px"><div class="two-columns">' +
      '<label>全片风格<select name="style">' +
      options(S.config.styles, b.style) +
      '</select></label><label>优先呈现方式<select name="form">' +
      options(S.config.forms, b.form, '按镜头选择') +
      '</select></label></div>' +
      '<div class="two-columns"><label>配色或材质<input name="palette" value="' +
      E(b.palette) +
      '"></label><label>最长时长（秒）<input name="seconds" type="number" min="10" max="600" value="' +
      b.seconds +
      '"></label></div>' +
      '<label>美术限制<textarea name="artLimits">' +
      E(b.artLimits) +
      '</textarea></label>' +
      '<label><input name="burn" type="checkbox" ' +
      (b.burnSubtitles !== false ? 'checked' : '') +
      '> 导出时将字幕显示在成片中</label>' +
      '</div></details>' +
      (S.p.stages.research
        ? '<div class="row">' +
          button('调整已完成阶段', 'reset-stage', { small: true, disabled: active() }) +
          '</div>'
        : '') +
      '<div class="dialog-actions">' +
      button('取消', 'dialog-close') +
      '<button class="button primary" type="submit">保存设置</button></div></form>',
  );
}
async function environment(refresh = false) {
  show('制作环境', '<p class="muted">正在检查工具…</p>');
  const data = await api(
    '/environment?' + (S.p ? 'project=' + S.p.id : '') + (refresh ? '&refresh=1' : ''),
  );
  S.env = data;
  if (!dialog.open) return;
  show(
    '制作环境',
    data.services
      .map(
        (x) =>
          '<div class="service"><div><strong>' +
          E(x.name) +
          '</strong><p class="small">' +
          E(x.detail) +
          '</p></div>' +
          (x.ready
            ? tag('已就绪', 'done')
            : x.url
              ? link(
                  x.url,
                  '配置指南',
                  'target="_blank" rel="noopener noreferrer" class="button small-button"',
                )
              : tag('可接入', 'neutral')) +
          '</div>',
      )
      .join('') +
      (S.p
        ? '<details style="margin-top:14px"><summary>Agent 连接与工具路径</summary><form id="tools-form" style="margin-top:12px"><label>Agent 连接方式<select name="driver">' +
          driverOptions(S.p.driver) +
          '</select></label><div class="two-columns">' +
          [
            ['blender', 'Blender'],
            ['ffmpeg', 'FFmpeg'],
            ['ffprobe', 'FFprobe'],
            ['codex', 'Codex'],
            ['remotion', 'Remotion'],
          ]
            .map(
              ([id, name]) =>
                '<label>' +
                name +
                '<input name="' +
                id +
                '" placeholder="自动检测" value="' +
                E(data.bins[id] || '') +
                '"></label>',
            )
            .join('') +
          '</div><div class="row"><button class="button primary small-button" type="submit" ' +
          (active() ? 'disabled' : '') +
          '>保存并检查</button></div></form></details>'
        : '') +
      '<div class="dialog-actions">' +
      button('重新检查', 'env-refresh', { small: true }) +
      '</div>',
  );
}
function addSource() {
  show(
    '添加资料',
    '<form id="source-form"><label>用途<select name="kind">' +
      options(['事实依据', '现实参考', '美术参考', '直接入片', '旁白或字幕'], '事实依据') +
      '</select></label>' +
      '<label>名称<input name="title" placeholder="资料名称"></label><label>原始链接<input name="url" type="url" placeholder="https://"></label>' +
      '<label>文件<input name="asset" type="file" multiple></label><label>用于什么<input name="purpose" placeholder="例如：核对柜面仪表的位置"></label>' +
      '<div class="dialog-actions">' +
      button('取消', 'dialog-close') +
      '<button class="button primary" type="submit">添加到项目</button></div></form>',
  );
}
function decisionDialog() {
  show(
    '退回' + S.config.titles[S.p.gate.stage],
    '<form id="decision-form"><label>想改哪里<textarea name="message" required rows="4"></textarea></label>' +
      '<div class="dialog-actions">' +
      button('取消', 'dialog-close') +
      '<button class="button primary" type="submit">交给 Agent 修改</button></div></form>',
  );
}
function compare(note) {
  const before = S.p.versions.find((v) => v.revision === note.version);
  const after = S.p.versions.find((v) => v.revision === (note.resultVersion || note.proposedVersion));
  if (!before || !after) return;
  const display = (shot, label) =>
    '<div class="stack"><strong>' +
    label +
    '</strong>' +
    (shot
      ? '<video style="width:100%;border-radius:8px;background:#17211d" controls playsinline preload="metadata" src="' +
        artifact(shot.file) +
        '"></video>'
      : '') +
    '</div>';
  show(
    '修改前后对照',
    '<div class="stack"><p>' +
      E(note.text) +
      '</p>' +
      note.shotIds
        .map((id) => {
          const old = before.shots.find((s) => s.id === id);
          const shot = after.shots.find((s) => s.id === id);
          return (
            '<h3>' +
            E(id + ' · ' + (shot?.title || old?.title || '')) +
            '</h3><div class="two-columns">' +
            display(old, '修改前') +
            display(shot, '修改后') +
            '</div>' +
            '<p class="small">' +
            E(shot?.visual.split('\n').at(-1) || '') +
            '</p><div class="row">' +
            (shot?.references || [])
              .map((r) => {
                const source = sources().find((s) => s.id === r.sourceId);
                return source
                  ? link(
                      url(source.url) || artifact(source.file),
                      source.title,
                      'target="_blank" rel="noopener noreferrer"',
                    )
                  : '';
              })
              .join('') +
            '</div>'
          );
        })
        .join('') +
      '</div>',
  );
}
function seekFrame(frame) {
  const vid = document.querySelector('#film');
  const cut = movie();
  S.frame = Math.max(0, Math.min(cut.frames - 1, frame));
  if (vid) {
    vid.pause();
    vid.currentTime = (S.frame + 0.05) / cut.fps;
  }
  paintTime(S.frame);
}
function gotoGate() {
  S.page =
    {
      brief: 'brief',
      research: 'evidence',
      script: 'shots',
      design: 'shots',
      production: 'review',
      revisionPlan: 'shots',
      revision: 'review',
      delivery: 'export',
    }[S.p.gate?.stage] || 'home';
  render();
}
async function after(p, preserve = false) {
  const before = latest()?.revision;
  setProject(p);
  const next = latest()?.revision;
  if (!preserve && before !== next && next) {
    S.version = next;
    S.scope = 'full';
    S.frame = 0;
  }
  render();
}
async function startRun(action, body = {}) {
  await projectApi(action, body);
  await after(await api(endpoint()), true);
}
async function runDecision(decision, message = '') {
  const gate = S.p.gate;
  if (!gate) return;
  const p = await projectApi('decision', { ...gate, decision, message, via: 'workbench' });
  dialog.close();
  await after(p);
  flash(decision === 'accept' ? '已确认' : '已交给 Agent 修改');
}

async function handle(button) {
  const { action } = button.dataset;
  const cut = movie();
  if (action === 'new') return newProject();
  if (action === 'demo') {
    button.disabled = true;
    flash('正在准备示例视频…');
    const demo = await api('/demo', 'POST', {});
    S.projects = await api('/projects');
    await load(demo.id);
    return;
  }
  if (action === 'env' || action === 'env-refresh') return environment(action === 'env-refresh');
  if (action === 'dialog-close') {
    dialog.close();
    return;
  }
  if (action === 'nav') {
    S.note = null;
    S.region = null;
    S.page = button.dataset.page;
    return render();
  }
  if (!S.p) return newProject();
  if (action === 'brief') return projectSettings();
  if (action === 'go-gate') return gotoGate();
  if (action === 'copy-task') {
    const task =
      S.p.job?.handoff ||
      '继续《' + S.p.title + '》的「' + S.config.titles[S.p.job?.stage] + '」阶段。';
    try {
      await navigator.clipboard.writeText(task);
      flash('继续指令已复制');
    } catch {
      show(
        '交给当前 Agent',
        '<p class="small">把这句话发到对话里即可。</p><textarea rows="3" readonly>' +
          E(task) +
          '</textarea>',
      );
    }
    return;
  }
  if (action === 'lock-shot')
    return after(
      await projectApi('lock', {
        shotId: button.dataset.shot,
        lock: !S.p.lockedShots?.[button.dataset.shot],
      }),
      true,
    );
  if (action === 'reset-stage')
    return show(
      '调整已完成阶段',
      '<form id="reset-form"><label>从这一步继续<select name="stage">' +
        ['research', 'script', 'design', 'production']
          .map((stage) => '<option value="' + stage + '">' + E(S.config.titles[stage]) + '</option>')
          .join('') +
        '</select></label><label>修改目标<textarea name="message" required></textarea></label><div class="dialog-actions"><button type="submit" class="button primary">重新制作此阶段及后续</button></div></form>',
    );
  if (action === 'run' || action === 'pause' || action === 'revise') return startRun(action);
  if (action === 'approve') return runDecision('accept');
  if (action === 'reject') return decisionDialog();
  if (action === 'add') return addSource();
  if (action === 'filter') {
    S.filter = button.dataset.filter;
    return render();
  }
  if (action === 'select-shot' || action === 'view-shot') {
    S.shot = button.dataset.shot;
    if (action === 'view-shot') {
      S.page = 'review';
      S.scope = 'shot';
      S.frame = currentShot()?.startFrame || 0;
    }
    return render();
  }
  if (action === 'scope') {
    S.scope = button.dataset.scope;
    S.note = null;
    S.region = null;
    if (S.scope === 'shot') {
      const s = cut.shots.find((v) => v.startFrame <= S.frame && v.endFrame > S.frame) || cut.shots[0];
      S.shot = s.id;
    }
    return render();
  }
  if (action === 'seek') {
    S.shot = button.dataset.shot;
    seekFrame(currentShot().startFrame);
    return;
  }
  if (action === 'play') {
    const vid = document.querySelector('#film');
    if (vid.paused) await vid.play();
    else vid.pause();
    return;
  }
  if (action === 'prev-frame' || action === 'next-frame') {
    const n = S.frame + (action === 'prev-frame' ? -1 : 1);
    if (S.scope === 'shot' && (n < currentShot().startFrame || n >= currentShot().endFrame)) return;
    seekFrame(n);
    return;
  }
  if (action === 'new-note' || action === 'new-range') {
    document.querySelector('#film')?.pause();
    S.note = { range: action === 'new-range', first: S.frame, last: S.frame, version: cut.revision };
    S.region = null;
    render();
    document.querySelector('#note-form textarea')?.focus();
    return;
  }
  if (action === 'cancel-note') {
    S.note = null;
    S.region = null;
    return render();
  }
  if (action === 'range-start' || action === 'range-end') {
    const key = action === 'range-start' ? 'first' : 'last';
    S.note[key] = S.frame;
    document.querySelector('#range-status').textContent =
      '区间 ' + time(S.note.first, cut.fps, 3) + '–' + time(S.note.last, cut.fps, 3);
    return;
  }
  const note = S.p.notes.find((n) => n.id === button.dataset.note);
  if (action === 'goto-note' && note) {
    S.version = note.version;
    S.page = 'review';
    S.scope = 'full';
    S.frame = note.first;
    return render();
  }
  if (action === 'compare' && note) return compare(note);
  if (action === 'close-note' && note)
    return after(await projectApi('close-note', { id: note.id }), true);
}
document.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;
  void handle(btn).catch((error) => {
    btn.disabled = false;
    flash(error.message, true);
  });
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'project-switch' && event.target.value)
    void load(event.target.value).catch((error) => flash(error.message, true));
  if (event.target.id === 'version-switch') {
    S.version = event.target.value;
    S.note = null;
    S.region = null;
    S.scope = 'full';
    S.frame = 0;
    render();
  }
});
document.addEventListener('submit', async (event) => {
  if (!event.target.id) return;
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button[type=submit]');
  const data = fields(form);
  if (submit) {
    submit.disabled = true;
    submit.dataset.label = submit.textContent;
    submit.textContent = '处理中…';
  }
  try {
    switch (form.id) {
      case 'new-form': {
        const files = [...form.querySelector('[name=initial]').files];
        delete data.initial;
        const created = await api('/projects', 'POST', { ...data, seconds: Number(data.seconds) });
        S.p = created;
        for (const file of files)
          await projectApi(
            'assets?kind=' + encodeURIComponent('初始参考') + '&name=' + encodeURIComponent(file.name),
            file,
          );
        dialog.close();
        S.projects = await api('/projects');
        await load(created.id);
        await startRun('run');
        break;
      }
      case 'settings-form': {
        const updated = await projectApi('mode', { mode: data.mode });
        const fields = ['style', 'form', 'palette', 'artLimits', 'seconds'];
        const change = fields.some((key) => String(data[key] ?? '') !== String(S.p.brief[key] ?? ''));
        const burn = Boolean(data.burn);
        let p = updated;
        if (change || burn !== (S.p.brief.burnSubtitles !== false)) {
          const brief = Object.fromEntries(
            fields.map((k) => [k, k === 'seconds' ? Number(data[k]) : data[k]]),
          );
          p = await projectApi('brief', { ...brief, burnSubtitles: burn, resetDesign: change });
        }
        dialog.close();
        await after(p, true);
        if (
          updated.next &&
          !p.gate &&
          !active() &&
          S.p.job?.state === 'done' &&
          !change &&
          !p.stages.delivery
        )
          await startRun('run');
        flash('设置已保存');
        break;
      }
      case 'brief-form': {
        const categories = [...form.querySelectorAll('input[name=categories]:checked')].map(
          (input) => input.value,
        );
        let updated = await projectApi('brief', {
          allowPaidGeneration: Boolean(form.querySelector('[name=allowPaidGeneration]')?.checked),
          budget: {
            currency: data.budgetCurrency,
            cap: Number(data.budgetCap),
            categories,
          },
          styleDirectionId: data.styleDirectionId || '',
          productionMethod: data.productionMethod || '',
          briefNotes: data.briefNotes || '',
        });
        if (data.mode && data.mode !== S.p.mode)
          updated = await projectApi('mode', { mode: data.mode });
        await after(updated, true);
        flash('简报已保存');
        break;
      }
      case 'reset-form':
        await projectApi('reset', data);
        dialog.close();
        await after(await api(endpoint()), true);
        break;
      case 'tools-form':
        await projectApi('settings', data);
        S.p = await api(endpoint());
        await environment(true);
        break;
      case 'source-form': {
        const files = [...form.querySelector('[name=asset]').files];
        if (!data.url && !files.length) throw new Error('请选择文件或填写原始链接。');
        if (data.url) await projectApi('link', data);
        for (const file of files)
          await projectApi(
            'assets?kind=' + encodeURIComponent(data.kind) + '&name=' + encodeURIComponent(file.name),
            file,
          );
        dialog.close();
        await after(await api(endpoint()), true);
        flash('资料已添加');
        break;
      }
      case 'art-form':
        await after(await projectApi('shot-style', data), true);
        flash(latest() ? '镜头选择已记录到批注' : '镜头选择已更新');
        break;
      case 'decision-form':
        await runDecision('revise', data.message);
        break;
      case 'note-form': {
        const n = S.note;
        if (n.last < n.first) throw new Error('区间终点需要晚于起点。');
        const p = await projectApi('note', { ...n, text: data.text, region: S.region });
        S.note = null;
        S.region = null;
        await after(p, true);
        flash('批注已保存');
        break;
      }
    }
  } catch (error) {
    flash(error.message, true);
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = submit.dataset.label;
    }
  }
});
document.addEventListener('keydown', (event) => {
  if (
    dialog.open ||
    /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName) ||
    !document.querySelector('#film')
  )
    return;
  const controls = { ArrowLeft: 'prev-frame', ArrowRight: 'next-frame', ' ': 'play' };
  if (controls[event.key]) {
    event.preventDefault();
    document.querySelector('[data-action=' + controls[event.key] + ']')?.click();
  }
});
async function poll() {
  if (!S.p) return;
  try {
    const old = S.p;
    const fresh = await api(endpoint());
    if (old.updatedAt === fresh.updatedAt || S.p.id !== fresh.id) return;
    const display = (x) =>
      JSON.stringify([
        x.gate,
        x.job?.state,
        x.job?.stage,
        Boolean(x.job?.handoff),
        x.mode,
        x.versions.length,
        x.stages.delivery?.revision,
        x.stages.design?.revision,
        x.stages.research?.revision,
        x.notes.length,
      ]);
    if (display(old) !== display(fresh) && !S.note) await after(fresh);
    else {
      S.p = fresh;
      const status = document.querySelector('#job-status');
      const detail = document.querySelector('#job-detail');
      if (status) status.textContent = fresh.statusLine;
      if (detail) detail.textContent = fresh.job?.detail || fresh.job?.message || '';
    }
  } catch {}
}
async function main() {
  [S.config, S.projects] = await Promise.all([api('/config'), api('/projects')]);
  const id = new URLSearchParams(location.search).get('project') || S.projects[0]?.id;
  if (id && S.projects.some((p) => p.id === id)) await load(id);
  else render();
  setInterval(poll, 1650);
}
main().catch((error) => {
  app.textContent = error.message;
  flash(error.message, true);
});
