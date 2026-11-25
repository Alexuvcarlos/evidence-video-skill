export const sources = [
  {
    id: 'S01',
    title: 'How Perseverance Drives on Mars',
    kind: '官方任务资料',
    creator: 'NASA Science',
    url: 'https://science.nasa.gov/resource/how-perseverance-drives-on-mars/',
  },
  {
    id: 'S02',
    title: 'Perseverance’s First Autonav Drive',
    kind: '任务原始影像',
    creator: 'NASA Jet Propulsion Laboratory',
    date: '2021-07-01',
    url: 'https://www.jpl.nasa.gov/images/pia24722-perseverances-first-autonav-drive/',
  },
  {
    id: 'S03',
    title: '本案例工程图设计',
    kind: '原创美术参考',
    file: 'inputs/demo/reference.svg',
    image: 'inputs/demo/reference.png',
    rights: '示例原创资产。',
  },
];
export const research = {
  sources,
  claims: [
    {
      id: 'F01',
      type: 'fact',
      text: '毅力号的导航相机为车载系统提供地形图像。',
      evidence: [{ sourceId: 'S02', locator: '图文说明首段', scope: '标明画面来自左右导航相机。' }],
    },
    {
      id: 'F02',
      type: 'fact',
      text: 'AutoNav 建立前方地形的三维地图、识别危险并规划绕行。',
      evidence: [
        {
          sourceId: 'S01',
          locator: '开头对 AutoNav 的说明与随附动画',
          scope: '支持制图、识别和绕行三个环节。',
        },
      ],
    },
    {
      id: 'F03',
      type: 'fact',
      text: '地面团队设置途经点，车载系统选择点与点之间的路径。',
      evidence: [
        {
          sourceId: 'S01',
          locator: '讲解中说明运营人员指定停靠点的段落',
          scope: '支持目标点与局部路径选择的分工。',
        },
      ],
    },
  ],
  searches: [
    {
      query: 'NASA Perseverance AutoNav 如何规划路线',
      summary: '找到 NASA Science 任务讲解，核对三维制图、识别障碍和绕行。',
    },
    {
      query: 'JPL Perseverance first AutoNav drive left right navigation cameras',
      summary: '核对首次 AutoNav 行驶的左右导航相机资料。',
    },
  ],
};
export const script = {
  cues: [
    {
      id: 'N01',
      text: '在火星上，毅力号怎样知道前面哪里能走？它的左右导航相机，先为车上的计算机提供地形图像。',
      claimIds: ['F01'],
    },
    {
      id: 'N02',
      text: '自动导航系统用这些图像建立三维地形图。它找出前方的障碍，再规划一条绕过去的路径。',
      claimIds: ['F02'],
    },
    {
      id: 'N03',
      text: '地面团队指定要到达的地点，火星车负责选择怎样走过去。一个决定去哪里，一个负责找到路。',
      claimIds: ['F03'],
    },
  ],
};
export const design = {
  rationale: '用统一的地形等高线和路线标记连接三个镜头。图形呈现原理示意。',
  shots: [
    {
      id: 'SHOT01',
      title: '先看见地形',
      cueIds: ['N01'],
      style: '编辑式工程图',
      form: '二维图解',
      visual: '两路相机信息汇入前方区域。',
      mustShow: ['两路相机示意', '火星地形图解'],
      onScreen: ['火星车怎样自己认路', '左右导航相机'],
      motionPlan: {
        type: 'build',
        description: '两路相机画面先并排入场，再叠成一张地形图，最后标出火星车位置。',
        beats: ['0.0–1.0s 左右相机两幅画面推入', '1.0–2.4s 两幅画面合成地形图', '2.4–结尾 火星车标记落下'],
      },
      references: [
        { sourceId: 'S02', role: 'evidence', locator: '原图说明', use: '核对左右相机' },
        { sourceId: 'S03', role: 'style', locator: '原设计第一屏', use: '沿用工程制图配色' },
      ],
    },
    {
      id: 'SHOT02',
      title: '绕过障碍',
      cueIds: ['N02'],
      style: '编辑式工程图',
      form: '二维图解',
      visual: '从地图辨认障碍，用路径弧线表示绕行。',
      mustShow: ['画面中的障碍区', '可读的绕行路线'],
      onScreen: ['识别障碍', '规划绕行'],
      motionPlan: {
        type: 'build',
        description: '地形图上先浮出障碍区，再用描边动画画出绕行路线。',
        beats: ['0.0–1.2s 障碍区由中心向外浮现', '1.2–2.6s 绕行路线逐段描边', '2.6–结尾 路径与障碍同时轻微呼吸'],
      },
      references: [
        {
          sourceId: 'S01',
          role: 'evidence',
          locator: 'AutoNav 开头说明',
          use: '核对地形建图与路径规划',
        },
        { sourceId: 'S03', role: 'style', locator: '原设计第二屏', use: '路线与障碍使用不同颜色' },
      ],
    },
    {
      id: 'SHOT03',
      title: '谁决定去哪里',
      cueIds: ['N03'],
      style: '编辑式工程图',
      form: '二维图解',
      visual: '显示地面设置的途经点与车载选择的局部路径。',
      mustShow: ['起点和目标点', '两侧任务分工'],
      onScreen: ['地面定目标', '车载选路径'],
      motionPlan: {
        type: 'camera',
        description: '从全景缓慢推近到目标点与局部路径，保持全图可读。',
        beats: ['0.0–1.4s 全景定帧', '1.4–结尾 缓慢推近目标点'],
      },
      references: [
        {
          sourceId: 'S01',
          role: 'evidence',
          locator: '设置停靠点的原文',
          use: '核对目标和路线的任务分工',
        },
        { sourceId: 'S03', role: 'style', locator: '原设计第三屏', use: '保持统一的路线和字号' },
      ],
    },
  ],
};

const lines = Array.from({ length: 18 }, (_, i) => {
  const l = i * 15;
  return (
    '<path d="M ' +
    (595 + l * 1.2) +
    ' ' +
    (680 - i * 9) +
    ' C ' +
    (550 + l) +
    ' ' +
    (490 - i * 11) +
    ' ' +
    (669 + l) +
    ' ' +
    (368 - i * 16) +
    ' ' +
    (875 + l) +
    ' ' +
    (300 - i * 10) +
    ' S ' +
    (1220 + l) +
    ' ' +
    (265 + i * 3) +
    ' ' +
    (1440 + l) +
    ' ' +
    (70 + i * 12) +
    '" />'
  );
}).join('');
const titles = [
  ['火星车怎样', '自己认路', '左右导航相机', '先获取地形图像'],
  ['看清障碍', '规划绕行', '障碍与路线', '车载系统生成路径'],
  ['地面定目标', '车载选路径', '途经点 → 局部路径', '逐段完成行驶任务'],
];
export function art(index, after = false) {
  const title = titles[index];
  const goal = after ? '#ffad8a' : '#e78764';
  const routes = [
    '<path d="M730 495Q806 374 1001 337M730 495Q906 515 1001 337" stroke="#b2e9bf" stroke-width="2.4" fill="none"/><circle cx="730" cy="495" r="12" fill="#b2e9bf"/><circle cx="1001" cy="337" r="19" fill="none" stroke="#a0d4ad" stroke-width="3"/><circle cx="1001" cy="337" r="6" fill="#d3f1d2"/>',
    '<ellipse cx="959" cy="377" rx="91" ry="79" transform="rotate(22 959 377)" fill="#a66752" fill-opacity=".47" stroke="#efa385" stroke-width="2" stroke-dasharray="7 5"/><path d="' +
      (after
        ? 'M714 519C824 488 824 296 982 263S1138 301 1156 204'
        : 'M714 519C823 498 912 494 996 472S1103 363 1156 204') +
      '" stroke="#cbf2c8" stroke-width="4" fill="none"/><circle cx="714" cy="519" r="9" fill="#cbf2c8"/><circle cx="1156" cy="204" r="13" fill="' +
      goal +
      '"/>',
    '<path d="M701 510H820L952 358L1106 228" stroke="#d3f1ce" stroke-width="3" fill="none"/><circle cx="701" cy="510" r="10" fill="#bbf0b4"/><circle cx="952" cy="358" r="15" fill="#143c36" stroke="#a5d9a1" stroke-width="2"/><circle cx="1106" cy="228" r="13" fill="' +
      goal +
      '"/>',
  ][index];
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">' +
    '<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0d2726"/><stop offset="1" stop-color="#21504a"/></linearGradient><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#b3e2bb" stroke-opacity=".10"/></pattern></defs>' +
    '<rect width="1280" height="720" fill="url(#bg)"/><rect width="1280" height="720" fill="url(#grid)"/>' +
    '<g fill="none" stroke="#a5c5a3" stroke-opacity=".26" stroke-width="1.4">' +
    lines +
    '</g>' +
    '<path d="M648 132v478 M648 132h552 M648 610h552" fill="none" stroke="#a6c5a0" opacity=".48" stroke-width="1"/>' +
    routes +
    '<g fill="#def1d9" font-family="PingFang SC,Heiti SC,Noto Sans CJK SC,Arial Unicode MS,sans-serif">' +
    '<text x="86" y="103" font-size="24" letter-spacing="4" fill="#b6d6ae">毅力号 · 导航原理</text>' +
    '<text x="83" y="274" font-size="69" font-weight="700">' +
    title[0] +
    '</text>' +
    '<text x="83" y="364" font-size="69" font-weight="700">' +
    title[1] +
    '</text>' +
    '<path d="M85 433h82" stroke="#d48a6e" stroke-width="4"/>' +
    '<text x="86" y="482" font-size="32">' +
    title[2] +
    '</text>' +
    '<text x="86" y="536" font-size="25" fill="#b8d8b9">' +
    title[3] +
    '</text>' +
    '<text x="1015" y="584" font-size="19" fill="#c7e3bf">原理示意</text></g></svg>'
  );
}
