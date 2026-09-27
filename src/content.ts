// Every piece of copy on the site lives here, so text can change without
// touching layout or 3D code. Chinese is the primary line; English carries
// the P3R-style menu labels; Japanese is the echo of Tsukuyomi.

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

export const boot = {
  loading: "NOW LOADING",
  quote: "今は昔、竹取の翁といふもの有りけり。",
  quoteSrc: "『竹取物語』",
};

export const title = {
  logo: "月読",
  logoRoman: "TSUKUYOMI",
  press: ["PRESS", "ANY", "KEY"],
  pressTouch: ["TAP", "TO", "START"],
  pressZh: "按任意键开始",
  pressJa: "なにかキーを押してね",
  tagline: "在数据的潮汐里，寻找月亮的规律。",
  taglineJa: "データの潮汐に、月の法則を探して。",
  focus: ["统计", "经济", "量化"],
  skip: "直接进入菜单",
};

export type MenuId = "profile" | "skills" | "works" | "calendar" | "contact" | "system";

export type MenuItem = {
  id: MenuId;
  label: string;
  zh: string;
  ja: string;
  /** Bottom-right description (P3R: "View/Change Personas" + "Command"). */
  desc: string;
  descEn: string;
  /** What the fish school draws while this entry is selected. */
  emblem: string;
};

export const menu: MenuItem[] = [
  { id: "profile", label: "PROFILE", zh: "档案", ja: "プロフィール", desc: "查看个人档案", descEn: "View Status", emblem: "leaf" },
  { id: "skills", label: "SKILL", zh: "擅长", ja: "スキル", desc: "统计 · 经济 · 量化", descEn: "Expertise", emblem: "σ" },
  { id: "works", label: "WORKS", zh: "作品", ja: "クエスト", desc: "作品与公开仓库", descEn: "Requests", emblem: "</>" },
  { id: "calendar", label: "CALENDAR", zh: "日历", ja: "カレンダー", desc: "月相与提交记录", descEn: "Moon & Activity", emblem: "moon" },
  { id: "contact", label: "SOCIAL LINK", zh: "联络", ja: "コミュ", desc: "写给月亮的信", descEn: "Contact", emblem: "✉" },
  { id: "system", label: "SYSTEM", zh: "设置", ja: "システム", desc: "画质 · 动效 · 关于本站", descEn: "Config", emblem: "gear" },
];

export const profile = {
  arcana: { num: "XVIII", name: "THE MOON", zh: "月" },
  intro:
    "你好，这里是酒寄彩葉——现实里的 Sirui Mei，在多伦多大学读本科。我着迷于用数字理解世界：统计让噪声开口说话，经济学解释人们为何如此选择，量化则把直觉变成可以被检验的策略。",
  introJa: "見つけてくれて、ありがとう。月が満ちるまで、ゆっくりしていってね。",
  fields: [
    { k: "ID", v: "酒寄 彩葉" },
    { k: "真名", v: "Sirui Mei" },
    { k: "所属", v: "University of Toronto" },
    { k: "身份", v: "本科在读 · Undergraduate" },
    { k: "擅长", v: "统计 · 经济 · 量化" },
    { k: "坐标", v: "Toronto" },
  ],
  params: "PARAMETERS",
};

export type Skill = {
  id: "stats" | "econ" | "quant";
  index: string;
  zh: string;
  en: string;
  ja: string;
  glyph: string; // the character on its emblem
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
    glyph: "統",
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
    glyph: "経",
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
    glyph: "量",
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
    code: "月",
    title: "TSUKUYOMI",
    zh: "你正在浏览的主页",
    description:
      "三渲二的月下坡道：程序化建模的街区、七色的游戏电线杆与满月，自研 toon 管线（MSAA G-buffer、屏幕空间描线与边缘光），P3R 风格的菜单与转场。目标 2K 稳定 60 帧。",
    stack: ["TypeScript", "three.js", "GLSL"],
    state: "live",
    href: "https://github.com/siruimei07/siruimei07.github.io",
  },
  {
    repo: "GUI-for-RePKG",
    code: "WPF",
    title: "GUI-for-RePKG",
    zh: "RePKG 图形前端",
    description: "为 RePKG 打造的可扩展 C# WPF 前端：丰富动效、响应式导航与后端扩展点。",
    stack: ["C#", "WPF", "Motion UI"],
    state: "archive",
    href: "https://github.com/siruimei07/GUI-for-RePKG",
  },
];

export const worksText = {
  tabs: [
    { id: "all", label: "ALL", zh: "全部" },
    { id: "live", label: "LIVE", zh: "进行中" },
    { id: "archive", label: "ARCHIVE", zh: "已归档" },
  ],
  live: "In Progress",
  archive: "Completed",
  open: "在 GitHub 上查看",
  more: "更多在 GitHub",
};

export const calendarText = {
  title: "CALENDAR",
  today: "TODAY",
  full: "满月",
  fullTonight: "今夜满月",
  toFull: "距满月",
  days: "天",
  contributions: "次提交",
  none: "这一天没有提交记录。",
  legend: "贡献",
  kaguya: "辉夜姬在八月十五的满月之夜回到了月亮上。",
};

export type Link = { id: "mail" | "github"; arcana: string; num: string; zh: string; label: string; value: string; href: string; rank: string };

export const contact = {
  title: "写给月亮的信",
  titleJa: "月まで届け、この想い。",
  lead: "合作、交流，或者只是打个招呼——写下来，从邮箱寄往月亮。",
  placeholder: "写点什么… / 何か書いてね",
  subject: "来自月読的信",
  send: "用邮件寄出",
  thanks: "信已经交给月亮了。谢谢你来到月読。",
  links: [
    { id: "mail", arcana: "THE MOON", num: "XVIII", zh: "月", label: "Mail", value: "sirui.mei07@gmail.com", href: "mailto:sirui.mei07@gmail.com", rank: "MAX" },
    { id: "github", arcana: "THE MAGICIAN", num: "I", zh: "魔术师", label: "GitHub", value: "@siruimei07", href: "https://github.com/siruimei07", rank: "MAX" },
  ] as Link[],
};

export const system = {
  quality: { label: "GRAPHICS", zh: "画质", options: [["auto", "AUTO", "自动"], ["high", "HIGH", "高"], ["medium", "MEDIUM", "中"], ["low", "LOW", "低"]] as [string, string, string][] },
  motion: { label: "MOTION", zh: "动效", options: [["full", "FULL", "完整"], ["reduced", "REDUCED", "减弱"]] as [string, string, string][] },
  fps: { label: "FPS", zh: "帧率显示", options: [["off", "OFF", "关"], ["on", "ON", "开"]] as [string, string, string][] },
  toTitle: { label: "RETURN TO TITLE", zh: "返回标题画面" },
  about: { label: "CREDITS", zh: "关于本站" },
  tech: "three.js 自研三渲二管线：MSAA 多目标 G-buffer → 屏幕空间描线与边缘光 → 泛光 → P3R 水下调色合成；场景全部程序化生成，GPU 计时驱动自适应画质。",
  source: "本站源码",
};

export const credits =
  "Fan-made tribute to Netflix『超かぐや姫！』, styled after ATLUS『ペルソナ3 リロード』. 角色「酒寄彩葉」及相关形象、作品名称版权归原作方所有，本站与官方无关。";
