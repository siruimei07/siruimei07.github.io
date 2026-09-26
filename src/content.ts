// Every piece of copy on the site lives here, so text can change without
// touching layout or 3D code. Chinese is the primary line; Japanese and
// English are the echoes that give the Tsukuyomi flavour.

export const identity = {
  // The persona ID shown everywhere except where the real name is called for.
  handle: { family: "酒寄", familyKana: "さかより", given: "彩葉", givenKana: "いろは" },
  handleRoman: "SAKAYORI IROHA",
  realName: "Sirui Mei",
  github: "siruimei07",
  githubUrl: "https://github.com/siruimei07",
  email: "sirui.mei07@gmail.com",
  site: "https://siruimei07.github.io/",
  affiliation: { zh: "多伦多大学", en: "University of Toronto" },
  status: { zh: "本科在读", en: "Undergraduate" },
  homebase: "Toronto",
};

export const hero = {
  kicker: "月読",
  kickerJa: "鳥居の向こう、月の都へ",
  tagline: ["在数据的潮汐里，", "寻找月亮的规律。"],
  taglineJa: "データの潮汐に、月の法則を探して。",
  focus: ["统计", "经济", "量化"],
  hints: [
    { key: "滚动", text: "穿过鸟居" },
    { key: "点击夜空", text: "放一朵烟花" },
    { key: "点击水面", text: "泛起涟漪" },
  ],
};

export type SectionMeta = { id: string; index: string; zh: string; en: string; ja: string };

// index: traditional numerals — 序 is the prologue before the gate.
export const sections: SectionMeta[] = [
  { id: "login", index: "序", zh: "入口", en: "Prologue", ja: "鳥居" },
  { id: "profile", index: "壱", zh: "档案", en: "Profile", ja: "プロフィール" },
  { id: "skills", index: "弐", zh: "擅长", en: "Expertise", ja: "得意分野" },
  { id: "works", index: "参", zh: "作品", en: "Works", ja: "作品集" },
  { id: "contact", index: "肆", zh: "联络", en: "Letters", ja: "月への手紙" },
];

export const profile = {
  intro:
    "你好，这里是酒寄彩葉——现实里的 Sirui Mei，在多伦多大学读本科。我着迷于用数字理解世界：统计让噪声开口说话，经济学解释人们为何如此选择，量化则把直觉变成可以被检验的策略。",
  introJa: "鳥居をくぐってくれて、ありがとう。月の下で、ゆっくりしていってね。",
  fields: [
    { k: "ID", v: "酒寄 彩葉" },
    { k: "真名", v: "Sirui Mei" },
    { k: "所属", v: "University of Toronto" },
    { k: "身份", v: "本科在读 · Undergraduate" },
    { k: "擅长", v: "统计 · 经济 · 量化" },
    { k: "坐标", v: "Toronto" },
  ],
};

export type Skill = {
  id: "stats" | "econ" | "quant";
  index: string;
  zh: string;
  en: string;
  ja: string;
  lantern: string; // the character brushed on its great lantern
  motto: string;
  body: string;
  topics: string[];
};

export const skills: Skill[] = [
  {
    id: "stats",
    index: "I",
    zh: "统计",
    en: "STATISTICS",
    ja: "統計",
    lantern: "統",
    motto: "让噪声开口说话",
    body: "从抽样与推断出发，用模型刻画不确定性。回归、假设检验、贝叶斯方法与时间序列，是我读懂数据的基本功。",
    topics: ["概率论", "回归分析", "贝叶斯推断", "时间序列"],
  },
  {
    id: "econ",
    index: "II",
    zh: "经济",
    en: "ECONOMICS",
    ja: "経済",
    lantern: "経",
    motto: "理解每一次选择的代价",
    body: "关注激励、均衡与市场结构，再用计量方法把经济直觉放到数据上检验——供给与需求相交的地方，就是故事发生的地方。",
    topics: ["微观经济", "宏观经济", "计量经济", "博弈论"],
  },
  {
    id: "quant",
    index: "III",
    zh: "量化",
    en: "QUANT",
    ja: "クオンツ",
    lantern: "量",
    motto: "让策略经得起回测",
    body: "把统计与金融结合：因子、风险与组合。在蒙特卡洛模拟的万千条路径里，寻找最稳健的那一条。",
    topics: ["资产定价", "因子模型", "风险管理", "策略回测"],
  },
];

export type Work = {
  repo: string;
  code: string;
  title: string;
  zh: string;
  description: string;
  stack: string[];
  state: "live" | "archive";
  href: string;
};

// Curated works. Public repositories in public/data/github.json that are not
// listed here are appended automatically.
export const works: Work[] = [
  {
    repo: "siruimei07.github.io",
    code: "3D",
    title: "TSUKUYOMI",
    zh: "你正在浏览的主页",
    description:
      "穿过鸟居进入月读的 3D 主页：镜面水、月光、星光鲸鱼与灯笼，three.js 自研 HDR 渲染管线与自适应画质，2K 稳定 60 帧。",
    stack: ["TypeScript", "three.js", "GLSL"],
    state: "live",
    href: "https://github.com/siruimei07/siruimei07.github.io",
  },
  {
    repo: "GUI-for-RePKG",
    code: "WPF",
    title: "GUI-for-RePKG",
    zh: "RePKG 图形前端",
    description:
      "为 RePKG 打造的可扩展 C# WPF 前端：终末地风格的极繁界面、丰富动效、响应式导航与后端扩展点。",
    stack: ["C#", "WPF", "Motion UI"],
    state: "archive",
    href: "https://github.com/siruimei07/GUI-for-RePKG",
  },
];

export const contact = {
  title: "写给月亮的信",
  titleJa: "月まで届け、この想い。",
  lead: "合作、交流，或者只是打个招呼——写下来，让灯笼替你送到月亮上。",
  placeholder: "写点什么… / 何か書いてね",
  subject: "来自ツクヨミ的信",
};

// Lines the avatar hologram says when clicked.
export const avatarLines = [
  "ようこそ、月読へ。",
  "今夜は月が綺麗ですね。",
  "鸟居的那一边，就是月读。",
  "点一点夜空，会有烟花哦。",
];

export const moonLines = ["月が綺麗ですね。", "8000 年后，也会看着同一轮月亮。"];

export const credits =
  "Fan-made tribute to Netflix『超かぐや姫！』. 角色「酒寄彩葉」及相关形象版权归原作方所有，本站与官方无关。";
