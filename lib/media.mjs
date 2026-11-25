import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { ensure, existingPath, localPath } from './workflow.mjs';

const require = createRequire(import.meta.url);
export async function processFile(bin, args, { timeout = 120000, cwd } = {}) {
  ensure(bin, '所需的制作工具还没有配置。');
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '',
      stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('工具运行超时。'));
    }, timeout);
    child.stdout.on('data', (buf) => {
      stdout += buf;
    });
    child.stderr.on('data', (buf) => {
      stderr = (stderr + buf.toString()).slice(-14000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error((stderr.trim() || '程序退出，代码 ' + code).slice(-1800)));
    });
  });
}
const ff = (bins, args, extra) =>
  processFile(bins.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args], extra);
export async function inspect(bins, file) {
  const raw = await processFile(bins.ffprobe, [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    file,
  ]);
  const value = JSON.parse(raw);
  return {
    duration: Number(value.format?.duration || 0),
    video: value.streams.find((s) => s.codec_type === 'video'),
    audio: value.streams.find((s) => s.codec_type === 'audio'),
    subtitle: value.streams.find((s) => s.codec_type === 'subtitle'),
  };
}
const concatText = (files) =>
  files.map((file) => "file '" + file.replaceAll("'", "'\\''") + "'").join('\n') + '\n';
const secs = (frames, fps) => (frames / fps).toFixed(8);
function clock(ms) {
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return h + ':' + m + ':' + s + ',' + String(ms % 1000).padStart(3, '0');
}
function subtitleText(cues, profile, web = false) {
  return (
    (web ? 'WEBVTT\n\n' : '') +
    cues
      .map((c, i) => {
        const begin = clock(Math.round((c.startFrame / profile.fps) * 1000));
        const end = clock(Math.round((c.speechEndFrame / profile.fps) * 1000));
        return (
          (web ? '' : i + 1 + '\n') +
          (begin + ' --> ' + end).replaceAll(',', web ? '.' : ',') +
          '\n' +
          c.text +
          '\n'
        );
      })
      .join('\n')
  );
}

async function externalCues(root, bins, script, run, project) {
  if (!script.audio || !script.subtitles) return null;
  const input = await existingPath(root, script.audio);
  const srt = await existingPath(root, script.subtitles);
  const blocks = (await readFile(srt, 'utf8')).trim().split(/\r?\n\s*\r?\n/);
  ensure(blocks.length === script.cues.length, '导入字幕须与批准的旁白逐段对应。');
  const { fps, seconds } = project.brief;
  const times = blocks.map((block, i) => {
    const lines = block.trim().split(/\r?\n/);
    const time = lines.findIndex((line) => line.includes('-->'));
    ensure(time >= 0, '导入字幕的时间格式无效。');
    ensure(
      lines
        .slice(time + 1)
        .join('')
        .replace(/\s/g, '') === script.cues[i].text.replace(/\s/g, ''),
      '导入字幕文字与旁白第 ' + (i + 1) + ' 段不一致。',
    );
    const parse = (value) => {
      const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
      ensure(match, '字幕时码无效。');
      return Math.round(
        (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000) *
          fps,
      );
    };
    return lines[time].split('-->').map(parse);
  });
  const { duration, audio } = await inspect(bins, input);
  ensure(audio && duration > 0 && duration <= seconds + 0.1, '导入旁白音频须在目标时长内。');
  const frames = Math.ceil(duration * fps);
  ensure(
    times.every(([a, b], i) => a < b && a >= (times[i - 1]?.[1] || 0) && b <= frames),
    '字幕时码重叠或超出旁白。',
  );
  const cues = script.cues.map((c, i) => ({
    ...c,
    startFrame: i === 0 ? 0 : times[i][0],
    subtitleStartFrame: times[i][0],
    speechEndFrame: times[i][1],
    endFrame: times[i + 1]?.[0] || frames,
  }));
  const output = run + '/narration.wav';
  await ff(bins, [
    '-i',
    input,
    '-af',
    'apad',
    '-t',
    secs(frames, fps),
    '-ac',
    '1',
    '-ar',
    '48000',
    '-c:a',
    'pcm_s16le',
    localPath(root, output),
  ]);
  return { cues, frames, audio: output, provider: script.voiceProvider || '导入旁白' };
}

export async function makeNarration(root, env, script, project, run) {
  const { bins } = env;
  const target = localPath(root, run);
  await mkdir(target, { recursive: true });
  const imported = await externalCues(root, bins, script, run, project);
  const { fps, seconds, language, voice: preferred } = project.brief;
  if (imported) return await writeSubtitles(root, run, imported, project.brief);
  const rawAudio = [];
  const existing = script.cues.every((c) => c.audio);
  const voice = preferred || (language.startsWith('zh') ? env.localVoice : '');
  ensure(
    existing || (env.desktopSpeech && (!language.startsWith('zh') || voice)) || env.espeak,
    '当前缺少对应语种的配音。请配置电脑语音，或在资料页导入旁白 WAV 与逐句 SRT。',
  );
  for (const [i, cue] of script.cues.entries()) {
    let audio;
    if (existing) audio = await existingPath(root, cue.audio);
    else if (env.desktopSpeech && (!language.startsWith('zh') || voice)) {
      const input = resolve(target, 'cue-' + i + '.txt');
      await writeFile(input, cue.text, 'utf8');
      audio = resolve(target, 'raw-' + i + '.aiff');
      await processFile(bins.say, [
        '-o',
        audio,
        ...(voice ? ['-v', voice] : []),
        '-r',
        '190',
        '-f',
        input,
      ]);
    } else {
      audio = resolve(target, 'raw-' + i + '.wav');
      await processFile(bins.espeak, [
        '-v',
        voice || (language.startsWith('zh') ? 'cmn' : 'en'),
        '-s',
        '175',
        '-w',
        audio,
        '--',
        cue.text,
      ]);
    }
    const stats = await inspect(bins, audio);
    ensure(stats.audio && stats.duration > 0, '旁白第 ' + (i + 1) + ' 段没有有效音频。');
    rawAudio.push({ audio, duration: stats.duration });
  }
  const pauseFrames = Math.ceil(fps * 0.17);
  const available = seconds - (script.cues.length * (pauseFrames + 1)) / fps;
  ensure(available > 0, '目标时长过短。');
  const tempo = Math.max(1, rawAudio.reduce((sum, a) => sum + a.duration, 0) / available);
  ensure(tempo <= 1.2, '实际旁白超过目标时长。请在旁白阶段缩短文稿，或调整项目时长。');
  let frame = 0;
  const files = [];
  const cues = [];
  for (const [i, cue] of script.cues.entries()) {
    const { audio, duration } = rawAudio[i];
    const speechFrames = Math.ceil((duration / tempo) * fps);
    const frames = speechFrames + pauseFrames;
    const output = resolve(target, 'voice-' + i + '.wav');
    await ff(bins, [
      '-i',
      audio,
      '-af',
      'atempo=' + tempo.toFixed(5) + ',apad',
      '-t',
      secs(frames, fps),
      '-ar',
      '48000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      output,
    ]);
    files.push(output);
    cues.push({
      ...cue,
      startFrame: frame,
      speechEndFrame: frame + speechFrames,
      endFrame: frame + frames,
    });
    frame += frames;
  }
  ensure(frame <= seconds * fps, '旁白超出目标时长。');
  await writeFile(resolve(target, 'audio-concat.txt'), concatText(files), 'utf8');
  await ff(bins, [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    resolve(target, 'audio-concat.txt'),
    '-c:a',
    'pcm_s16le',
    resolve(target, 'narration.wav'),
  ]);
  const provider = existing
    ? script.voiceProvider || '生成配音'
    : env.desktopSpeech
      ? 'macOS 语音 ' + (voice || '系统默认')
      : 'eSpeak';
  return writeSubtitles(
    root,
    run,
    { cues, frames: frame, audio: run + '/narration.wav', provider },
    project.brief,
  );
}
async function writeSubtitles(root, run, data, profile) {
  for (const [ext, web] of [
    ['srt', false],
    ['vtt', true],
  ]) {
    await writeFile(
      localPath(root, run + '/captions.' + ext),
      subtitleText(
        data.cues.map((c) => ({ ...c, startFrame: c.subtitleStartFrame ?? c.startFrame })),
        profile,
        web,
      ),
      'utf8',
    );
  }
  return { ...data, srt: run + '/captions.srt', vtt: run + '/captions.vtt' };
}
export function timedShots(shots, cues) {
  const map = new Map(cues.map((c) => [c.id, c]));
  return shots.map((s) => ({
    ...s,
    startFrame: map.get(s.cueIds[0]).startFrame,
    endFrame: map.get(s.cueIds.at(-1)).endFrame,
  }));
}

async function sharp() {
  try {
    return require('sharp');
  } catch {
    const path = process.env.EVIDENCE_VIDEO_NODE_MODULES;
    if (path)
      try {
        return require(resolve(path, 'sharp'));
      } catch {}
    throw new Error('处理 SVG 或烧录字幕需要 sharp。请在工作台目录执行 npm install。');
  }
}
export async function rasterizeStill(input, output, { width = 1280, height = 720 } = {}) {
  const rasterize = await sharp();
  await rasterize(input, { density: 100 })
    .resize(width, height, { fit: 'contain', background: '#111918' })
    .flatten({ background: '#111918' })
    .png()
    .toFile(output);
}
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
export async function renderShot(root, env, project, shot, render, run) {
  const profile = project.brief;
  const { width, height, fps } = profile;
  const frames = shot.endFrame - shot.startFrame;
  const { bins } = env;
  let input = await existingPath(root, render.file);
  let ext = extname(input).toLowerCase();
  if (ext === '.svg') {
    const target = localPath(root, run + '/' + shot.id + '-art.png');
    await rasterizeStill(input, target, { width, height });
    input = target;
    ext = '.png';
  }
  const base =
    'scale=' +
    width +
    ':' +
    height +
    ':force_original_aspect_ratio=decrease,pad=' +
    width +
    ':' +
    height +
    ':(ow-iw)/2:(oh-ih)/2:color=0x101716,setsar=1';
  const image = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  const style = render.motion || 'hold';
  let args;
  if (image) {
    const motion =
      style === 'push'
        ? ',zoompan=z=1+0.045*on/' +
          Math.max(1, frames - 1) +
          ':x=iw/2-iw/zoom/2:y=ih/2-ih/zoom/2:d=' +
          frames +
          ':s=' +
          width +
          'x' +
          height +
          ':fps=' +
          fps
        : ',fps=' + fps;
    args = [
      ...(style === 'push' ? [] : ['-loop', '1', '-framerate', String(fps)]),
      '-i',
      input,
      '-vf',
      base + motion + ',format=yuv420p',
    ];
  } else {
    const metadata = await inspect(bins, input);
    ensure(
      metadata.video && metadata.duration + 0.4 / fps >= frames / fps,
      shot.id + ' 的镜头文件短于计划时间。',
    );
    args = ['-i', input, '-vf', base + ',fps=' + fps + ',format=yuv420p'];
  }
  const output = run + '/rendered-' + shot.id + '.mp4';
  await ff(
    bins,
    [
      ...args,
      '-an',
      '-frames:v',
      String(frames),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '19',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      localPath(root, output),
    ],
    { timeout: 600000 },
  );
  const meta = await inspect(bins, localPath(root, output));
  ensure(
    Number(meta.video?.nb_frames) === frames &&
      meta.video.width === width &&
      meta.video.height === height,
    shot.id + ' 导出帧数或分辨率与计划不一致。',
  );
  const poster = run + '/' + shot.id + '.jpg';
  const images = new Map([[Math.floor(frames / 2), poster]]);
  for (const check of render.checks)
    if (!images.has(check.frame))
      images.set(check.frame, run + '/' + shot.id + '-' + check.frame + '.jpg');
  for (const [frame, image] of images)
    await capture(bins, localPath(root, output), frame, localPath(root, image));
  return {
    ...shot,
    file: output,
    poster,
    origin: render.file,
    referenceIds: render.referenceIds,
    checks: render.checks.map((check) => ({ ...check, image: images.get(check.frame) })),
    editable: render.editable || [],
    tools: render.tools || [],
    generation: render.generation || null,
  };
}

export async function capture(bins, file, frame, output) {
  await mkdir(dirname(output), { recursive: true });
  await ff(
    bins,
    [
      '-i',
      file,
      '-vf',
      'select=eq(n\\,' + frame + '),scale=960:-2',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      output,
    ],
    { timeout: 90000 },
  );
  await stat(output);
}
export async function clipContext(bins, file, first, last, fps, output) {
  await ff(
    bins,
    [
      '-ss',
      secs(first, fps),
      '-i',
      file,
      '-t',
      secs(last - first, fps),
      '-vf',
      'scale=640:-2',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '22',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      output,
    ],
    { timeout: 120000 },
  );
}

export function captionLines(text, limit) {
  const value = String(text).trim();
  if ([...value].length <= limit) return [value];
  const clauses = value.split(/(?<=[，。；：、！？])/u).filter(Boolean);
  if (clauses.length > 1) {
    let best = null;
    for (let k = 1; k < clauses.length; k++) {
      const left = clauses.slice(0, k).join('').trim();
      const right = clauses.slice(k).join('').trim();
      if ([...left].length > limit || [...right].length > limit) continue;
      const score = Math.abs([...left].length - [...right].length);
      if (!best || score < best.score) best = { left, right, score };
    }
    if (best) return [best.left, best.right];
  }
  const atoms = value.match(/\d+(?:[.,]\d+)?%?|[A-Za-z]+(?:['-][A-Za-z]+)*|\s+|./gu) || [];
  const lines = [];
  let line = '';
  for (const atom of atoms) {
    if (line && [...(line + atom)].length > limit) {
      lines.push(line.trim());
      line = atom.trimStart();
    } else line += atom;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
async function burnSubtitleShot(root, env, profile, shot, cues, folder) {
  const rasterize = await sharp();
  const { width, height, fps } = profile;
  const selected = cues.filter((c) => shot.cueIds.includes(c.id));
  const args = ['-i', localPath(root, shot.file)];
  const filters = [];
  const size = Math.round(height * 0.046);
  for (const [i, cue] of selected.entries()) {
    const limit = Math.max(16, Math.floor((width * 0.82) / size));
    const lines = captionLines(cue.text, limit);
    const bottom = height - Math.round(height * 0.045);
    const dy = Math.round(size * 1.18);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      width +
      '" height="' +
      height +
      '"><g font-family="PingFang SC,Noto Sans CJK SC,Heiti SC,Arial Unicode MS,sans-serif" font-size="' +
      size +
      '" text-anchor="middle" fill="white" stroke="#182122" stroke-width="3.1" stroke-linejoin="round" paint-order="stroke">' +
      lines
        .map(
          (line, j) =>
            '<text x="' +
            width / 2 +
            '" y="' +
            (bottom - (lines.length - j - 1) * dy) +
            '">' +
            xml(line) +
            '</text>',
        )
        .join('') +
      '</g></svg>';
    const img = resolve(folder, shot.id + '-cap-' + i + '.png');
    await rasterize(Buffer.from(svg)).png().toFile(img);
    args.push('-i', img);
    const start = (cue.subtitleStartFrame ?? cue.startFrame) - shot.startFrame;
    const end = cue.speechEndFrame - shot.startFrame - 1;
    filters.push(
      (i ? '[v' + (i - 1) + ']' : '[0:v]') +
        '[' +
        (i + 1) +
        ':v]overlay=enable=between(n\\,' +
        start +
        '\\,' +
        end +
        ')' +
        (i === selected.length - 1 ? '[out]' : '[v' + i + ']'),
    );
  }
  if (!filters.length) return localPath(root, shot.file);
  const output = resolve(folder, shot.id + '-captions.mp4');
  await ff(
    env.bins,
    [
      ...args,
      '-filter_complex_threads',
      '1',
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[out]',
      '-an',
      '-frames:v',
      String(shot.endFrame - shot.startFrame),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      output,
    ],
    { timeout: 600000 },
  );
  return output;
}

export async function assemble(root, env, project, shots, narration, run, { burn = false } = {}) {
  const { bins } = env;
  const outputDir = localPath(root, run);
  await mkdir(outputDir, { recursive: true });
  const video = run + '/film.mp4';
  const matched = [];
  for (let i = 0; i < shots.length; i++) {
    ensure(shots[i].startFrame === (shots[i - 1]?.endFrame || 0), '镜头切点不连续。');
    matched.push(
      burn
        ? await burnSubtitleShot(root, env, project.brief, shots[i], narration.cues, outputDir)
        : await existingPath(root, shots[i].file),
    );
  }
  await writeFile(resolve(outputDir, 'video-concat.txt'), concatText(matched), 'utf8');
  const audio = await existingPath(root, narration.audio);
  const srt = await existingPath(root, narration.srt);
  const style = project.brief;
  const frames = shots.at(-1).endFrame;
  ensure(frames === narration.frames, '合片切点与旁白时长不一致。');
  const subtitles = burn ? [] : ['-i', srt];
  await ff(
    bins,
    [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      resolve(outputDir, 'video-concat.txt'),
      '-i',
      audio,
      ...subtitles,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      ...(burn
        ? []
        : [
            '-map',
            '2:0',
            '-c:s',
            'mov_text',
            '-metadata:s:s:0',
            'language=zho',
            '-disposition:s:0',
            'default',
          ]),
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-t',
      secs(frames, style.fps),
      '-movflags',
      '+faststart',
      localPath(root, video),
    ],
    { timeout: 600000 },
  );
  const result = await inspect(bins, localPath(root, video));
  ensure(Number(result.video?.nb_frames) === frames && result.audio, '合片帧数或音轨校验未通过。');
  return {
    video,
    shots,
    frames,
    fps: style.fps,
    width: style.width,
    height: style.height,
    audio: narration.audio,
    cues: narration.cues,
    srt: narration.srt,
    vtt: narration.vtt,
    voiceProvider: narration.provider,
    burned: burn,
  };
}

export async function copyCutCaptions(root, cut, dest) {
  await copyFile(await existingPath(root, cut.srt), localPath(root, dest + '/字幕.srt'));
}
