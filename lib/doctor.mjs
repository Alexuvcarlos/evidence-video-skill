import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cached = new Map();
async function executable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    const options =
      candidate.includes('/') || candidate.includes('\\')
        ? [candidate]
        : (process.env.PATH || '')
            .split(delimiter)
            .flatMap((dir) =>
              process.platform === 'win32'
                ? [resolve(dir, candidate + '.exe'), resolve(dir, candidate + '.cmd')]
                : [resolve(dir, candidate)],
            );
    for (const path of options)
      try {
        await access(path, constants.X_OK);
        return path;
      } catch {}
  }
  return null;
}
async function probe(bin, args, first = true) {
  if (!bin) return null;
  try {
    const { stdout, stderr } = await exec(bin, args, { timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    const text = (stdout || stderr).trim();
    return first ? text.split('\n')[0] : text;
  } catch {
    return null;
  }
}
export async function doctor(config = {}, refresh = false) {
  const key = JSON.stringify(config);
  if (!refresh && cached.has(key) && Date.now() - cached.get(key).at < 60000)
    return cached.get(key).result;
  const bins = Object.fromEntries(
    await Promise.all(
      Object.entries({
        codex: [config.codex, process.env.EVIDENCE_VIDEO_CODEX, 'codex'],
        ffmpeg: [config.ffmpeg, 'ffmpeg'],
        ffprobe: [config.ffprobe, 'ffprobe'],
        blender: [
          config.blender,
          process.env.BLENDER_BIN,
          'blender',
          '/Applications/Blender.app/Contents/MacOS/Blender',
        ],
        say: ['say'],
        espeak: ['espeak-ng', 'espeak'],
        remotion: [config.remotion, 'remotion'],
        chrome: [
          process.env.EVIDENCE_VIDEO_CHROME,
          'chromium',
          'google-chrome',
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ],
      }).map(async ([name, paths]) => [name, await executable(paths)]),
    ),
  );
  const [codex, ffmpeg, ffprobe, blender, login, mcpText, voices, espeak, curl] = await Promise.all([
    probe(bins.codex, ['--version']),
    probe(bins.ffmpeg, ['-version']),
    probe(bins.ffprobe, ['-version']),
    probe(bins.blender, ['--version']),
    probe(bins.codex, ['login', 'status']),
    probe(bins.codex, ['mcp', 'list', '--json'], false),
    probe(bins.say, ['-v', '?'], false),
    probe(bins.espeak, ['--version']),
    executable(['curl']),
  ]);
  let mcp = [];
  try {
    const entries = JSON.parse(mcpText || '[]');
    mcp = (Array.isArray(entries) ? entries : entries.servers || [])
      .map((x) => ({
        name: String(x.name || ''),
        enabled: x.enabled !== false,
        auth: String(x.auth_status || ''),
      }))
      .filter((x) => x.name);
  } catch {}
  const cin =
    (voices || '')
      .split('\n')
      .find((line) => line.includes('zh_CN') && line.trim().startsWith('Tingting ')) ||
    (voices || '').split('\n').find((line) => line.includes('zh_CN'));
  const localVoice = cin?.trim().split(/\s{2,}/)[0] || '';
  const services = [
    {
      id: 'codex',
      name: '制作 Agent',
      ready: !!(codex && login),
      detail: codex ? (login ? 'Codex 已登录' : '需要在 Codex 登录') : '需要安装 Codex CLI',
      url: 'https://learn.chatgpt.com/docs/codex/cli',
    },
    {
      id: 'media',
      name: '视频处理',
      ready: !!(ffmpeg && ffprobe),
      detail: ffmpeg && ffprobe ? 'FFmpeg 与 FFprobe 就绪' : '需要 FFmpeg 与 FFprobe',
      url: 'https://ffmpeg.org/download.html',
    },
    {
      id: 'blender',
      name: 'Blender 三维',
      ready: !!blender,
      detail: blender || '按三维项目需要安装',
      url: 'https://www.blender.org/download/',
    },
    {
      id: 'voice',
      name: '本地配音',
      ready: !!(voices || espeak),
      detail: localVoice
        ? 'macOS 普通话语音'
        : voices || espeak
          ? '本地语音工具可用'
          : '可导入音频或接入配音服务',
    },
    {
      id: 'mcp',
      name: '生成与检索服务',
      ready: mcp.some((s) => s.enabled),
      detail: mcp.length
        ? mcp
            .filter((s) => s.enabled)
            .map((s) => s.name)
            .join('、') || '连接尚未启用'
        : '可使用 Agent 已有工具或配置 MCP',
      url: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli',
    },
  ];
  const capabilities = {
    tts: [
      ...(voices
        ? [{ id: 'macos-say', provider: 'macOS 语音', available: true, note: localVoice || '系统语音', cost: '免费' }]
        : []),
      ...(espeak
        ? [{ id: 'espeak', provider: 'eSpeak', available: true, note: '离线合成', cost: '免费' }]
        : []),
    ],
    music: [],
    image: [],
    video: [],
    screenshot: bins.chrome
      ? [{ id: 'chrome', provider: 'Google Chrome', available: true, note: '可尝试页面截图', cost: '免费' }]
      : [],
    vision: [],
  };
  const result = {
    at: new Date().toISOString(),
    bins: { ...bins, curl },
    services,
    versions: { codex, ffmpeg, ffprobe, blender },
    mcp,
    capabilities,
    localVoice,
    desktopSpeech: !!voices,
    espeak: !!espeak,
    available: !!(ffmpeg && ffprobe),
  };
  cached.set(key, { at: Date.now(), result });
  return result;
}
