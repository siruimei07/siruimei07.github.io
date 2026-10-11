// Every piece of copy on the site lives here, so text can change without
// touching layout or 3D code. The interface speaks like a Rhine Lab terminal:
// English uppercase labels carry the structure, Chinese carries the meaning.

export const identity = {
  name: "Sirui Mei",
  github: "siruimei07",
  githubUrl: "https://github.com/siruimei07",
  email: "sirui.mei07@gmail.com",
  site: "https://siruimei07.github.io/",
  affiliation: { zh: "多伦多大学", en: "University of Toronto", short: "UofT" },
  status: { zh: "本科在读", en: "Undergraduate" },
  homebase: "Toronto",
  timezone: "America/Toronto",
  focus: ["统计", "经济", "量化"],
  focusEn: ["STATISTICS", "ECONOMICS", "QUANT"],
  /** One line that says who this is, everywhere a visitor lands. */
  oneLiner: "多伦多大学本科生，用统计、经济与量化理解世界。",
  oneLinerEn: "Undergraduate at the University of Toronto — statistics, economics & quant.",
};

/** The three-line lockup in the top-left corner, after the PV's RHINE LAB / ANALYSIS OS. */
export const brand = {
  title: "SIRUI MEI",
  sub: "SYNTHESIZE INFORMATION",
  os: ["ANALYSIS", "OS"],
  /** letter-spaced line under the mark */
  mark: "SIRUI · MEI",
  powered: ["POWERED BY", "RHINE LAB"],
  database: "SIRUI MEI DATABASE",
  command: "COMMAND ENTERED",
};

export type SectionId = "profile" | "skills" | "works" | "activity" | "contact" | "system";

/** A logotype tile (the PV's CMPT CTRL / STRU / NRG): one or two words, with the ∞ mark
 *  laid over one letter. `mark` = [line, letter index, dx em, dy em, scale]. */
export type Logotype = { lines: string[]; sub: string; mark: [number, number, number, number, number] };

export type Section = {
  id: SectionId;
  no: string;
  /** Short label in the rail and pager. */
  label: string;
  zh: string;
  /** Bottom-left section line, like "STRUCTURAL SECTION". */
  section: string;
  tile: Logotype;
  /** File code shown on the screen, like STRU-001. */
  code: string;
  /** Bottom-centre caption (the PV's narrator subtitle) when the screen opens. */
  caption: string;
  /** Tiny paragraph under the database tag in the left column. */
  note: string;
};

export const sections: Section[] = [
  {
    id: "profile",
    no: "01",
    label: "PERSONNEL FILE",
    zh: "档案",
    section: "PERSONNEL SECTION",
    tile: { lines: ["PRSN", "FILE"], sub: "PERSONNEL FILE SECTION", mark: [0, 1, 0.3, 0.08, 0.48] },
    code: "PRSN-001",
    caption: "Sirui Mei，多伦多大学本科在读，研究方向为统计、经济与量化",
    note: "PERSONAL INFORMATION, AFFILIATION AND PUBLIC GITHUB PARAMETERS OF THE DIRECTOR OF THIS ARCHIVE.",
  },
  {
    id: "skills",
    no: "02",
    label: "RESEARCH",
    zh: "研究",
    section: "RESEARCH SECTION",
    tile: { lines: ["STAT"], sub: "STATISTICS SECTION", mark: [0, 1, 0.32, 0.08, 0.48] },
    code: "RSCH-001",
    caption: "下设三个研究科：统计、经济与量化",
    note: "THREE RESEARCH SECTIONS. EACH ONE STUDIES HOW NUMBERS EXPLAIN A DIFFERENT PART OF THE WORLD.",
  },
  {
    id: "works",
    no: "03",
    label: "PROJECTS",
    zh: "作品",
    section: "PROJECT ARCHIVE SECTION",
    tile: { lines: ["PRJ"], sub: "PROJECT ARCHIVE SECTION", mark: [0, 1, 0.3, 0.1, 0.46] },
    code: "PRJ-001",
    caption: "项目记录：作品与公开仓库",
    note: "CURATED WORKS AND EVERY PUBLIC REPOSITORY, SYNCED FROM GITHUB ON EACH DEPLOY.",
  },
  {
    id: "activity",
    no: "04",
    label: "ACTIVITY LOG",
    zh: "活动",
    section: "ACTIVITY LOG SECTION",
    tile: { lines: ["LOG"], sub: "ACTIVITY LOG SECTION", mark: [0, 1, 0.02, 0.04, 0.66] },
    code: "LOG-365",
    caption: "近一年的提交记录与公开动态",
    note: "CONTRIBUTION CALENDAR OF THE LAST 53 WEEKS AND THE LATEST PUBLIC EVENTS ON GITHUB.",
  },
  {
    id: "contact",
    no: "05",
    label: "CONTACT",
    zh: "联络",
    section: "CONTACT SECTION",
    tile: { lines: ["CNCT"], sub: "CONTACT SECTION", mark: [0, 2, 0.04, 0.05, 0.56] },
    code: "CNCT-001",
    caption: "联络通道已开放：邮箱与 GitHub",
    note: "OPEN CHANNELS FOR COLLABORATION, QUESTIONS, OR SIMPLY SAYING HELLO.",
  },
  {
    id: "system",
    no: "06",
    label: "SYSTEM",
    zh: "设置",
    section: "SYSTEM CONFIG SECTION",
    tile: { lines: ["SYS"], sub: "SYSTEM CONFIG SECTION", mark: [0, 1, 0.08, 0.05, 0.6] },
    code: "SYS-001",
    caption: "终端设置：配色、动效与三维显示",
    note: "DISPLAY PREFERENCES ARE STORED IN THIS BROWSER ONLY.",
  },
];

export const sectionById = Object.fromEntries(sections.map((s) => [s.id, s])) as Record<SectionId, Section>;

export const boot = {
  access: "ACCESS PERMISSION REQUIRED",
  lines: ["ID CONFIRMED : VISITOR", "REQUEST RECEIVED", "START PROCESSING..."],
  permission: "PERMISSION AUTHORIZED",
  welcome: ["WELCOME TO", "SIRUI MEI", "PERSONAL DATABASE"],
  captions: ["需要访问权限", "身份确认：访客", "读取完毕，核验通过", "欢迎访问 Sirui Mei 的个人资料档案"],
  skip: "SKIP",
};

/** The overview: the ∞ and the callouts around it (the PV's "structure of Rhine Lab"). */
export const home = {
  caption: "Sirui Mei · 多伦多大学本科在读 —— 用统计、经济与量化理解世界",
  centre: "SIRUI MEI.",
  centreSub: "UNIVERSITY OF TORONTO",
  hint: "SELECT A SECTION",
  hintZh: "选择一个区块进入",
  callouts: [
    { to: "skills", anchor: "left", tag: "SECTION 02.", title: "RESEARCH SECTION", desc: "STATISTICS · ECONOMICS · QUANTITATIVE FINANCE", zh: "统计 · 经济 · 量化" },
    { to: "works", anchor: "cross", tag: "SECTION 03.", title: "PROJECT ARCHIVE", desc: "WORKS AND PUBLIC REPOSITORIES", zh: "作品与公开仓库" },
    { to: "contact", anchor: "right-top", tag: "SECTION 05.", title: "CONTACT SECTION", desc: "MAIL AND GITHUB, OPEN FOR COLLABORATION", zh: "邮箱与 GitHub" },
    { to: "activity", anchor: "right-bottom", tag: "SECTION 04.", title: "ACTIVITY LOG", desc: "CONTRIBUTIONS OF THE LAST YEAR", zh: "近一年的提交" },
  ] as { to: SectionId; anchor: string; tag: string; title: string; desc: string; zh: string }[],
};

export const profile = {
  rank: "UNDERGRADUATE",
  loaded: "PERSONAL INFORMATION LOADED",
  intro:
    "你好，我是 Sirui Mei，在多伦多大学读本科。我着迷于用数字理解世界：统计让噪声开口说话，经济学解释人们为何如此选择，量化则把直觉变成可以被检验的策略。",
  introEn: "I study how numbers explain the world — noise, choices and strategies.",
  card: "PROFILE",
  fields: [
    { k: "NAME", v: "Sirui Mei" },
    { k: "SCHOOL", v: "University of Toronto" },
    { k: "STATUS", v: "Undergraduate · 本科在读" },
    { k: "FIELD", v: "统计 · 经济 · 量化" },
    { k: "BASE", v: "Toronto, Canada" },
  ],
  params: "GITHUB PARAMETERS",
  links: { github: "GITHUB", mail: "MAIL" },
};

export type Skill = {
  id: "stats" | "econ" | "quant";
  tile: Logotype;
  zh: string;
  en: string;
  study: string;
  motto: string;
  body: string;
  topics: { zh: string; en: string }[];
};

export const skills: Skill[] = [
  {
    id: "stats",
    tile: { lines: ["STAT"], sub: "STATISTICS SECTION", mark: [0, 1, 0.32, 0.08, 0.48] },
    zh: "统计",
    en: "STATISTICS",
    study: "STUDY / INFER",
    motto: "让噪声开口说话",
    body: "从抽样与推断出发，用模型刻画不确定性。回归、假设检验、贝叶斯方法与时间序列，是我读懂数据的基本功。",
    topics: [
      { zh: "概率论", en: "PROBABILITY" },
      { zh: "回归分析", en: "REGRESSION" },
      { zh: "贝叶斯推断", en: "BAYESIAN INFERENCE" },
      { zh: "时间序列", en: "TIME SERIES" },
    ],
  },
  {
    id: "econ",
    tile: { lines: ["ECON"], sub: "ECONOMICS SECTION", mark: [0, 1, 0.14, 0.03, 0.46] },
    zh: "经济",
    en: "ECONOMICS",
    study: "STUDY / EXPLAIN",
    motto: "理解每一次选择的代价",
    body: "关注激励、均衡与市场结构，再用计量方法把经济直觉放到数据上检验——供给与需求相交的地方，就是故事发生的地方。",
    topics: [
      { zh: "微观经济", en: "MICROECONOMICS" },
      { zh: "宏观经济", en: "MACROECONOMICS" },
      { zh: "计量经济", en: "ECONOMETRICS" },
      { zh: "博弈论", en: "GAME THEORY" },
    ],
  },
  {
    id: "quant",
    tile: { lines: ["QNT"], sub: "QUANTITATIVE SECTION", mark: [0, 1, 0.33, 0.08, 0.48] },
    zh: "量化",
    en: "QUANT",
    study: "STUDY / EXPLOIT",
    motto: "让策略经得起回测",
    body: "把统计与金融结合：因子、风险与组合。在蒙特卡洛模拟的万千条路径里，寻找最稳健的那一条。",
    topics: [
      { zh: "资产定价", en: "ASSET PRICING" },
      { zh: "因子模型", en: "FACTOR MODELS" },
      { zh: "风险管理", en: "RISK MANAGEMENT" },
      { zh: "策略回测", en: "BACKTESTING" },
    ],
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
    code: "X-001",
    title: "ANALYSIS OS",
    zh: "你正在浏览的主页",
    description:
      "莱茵生命风格的个人档案终端：白底开场与身份验证、由数百块半透明档案片组成并在 ∞ 与长链之间变形的实时三维场景、科室式的档案页与 GitHub 数据同步。构建时预渲染为静态页面，没有 JavaScript 也能完整阅读。",
    stack: ["TypeScript", "three.js", "GLSL", "Vite"],
    state: "live",
    href: "https://github.com/siruimei07/siruimei07.github.io",
  },
  {
    repo: "GUI-for-RePKG",
    code: "X-002",
    title: "GUI-for-RePKG",
    zh: "RePKG 图形前端",
    description: "为 RePKG 打造的可扩展 C# WPF 前端：丰富动效、响应式导航与后端扩展点。",
    stack: ["C#", "WPF", "Motion UI"],
    state: "archive",
    href: "https://github.com/siruimei07/GUI-for-RePKG",
  },
];

export const worksText = {
  file: "FILE NUMBER",
  confidentiality: "CONFIDENTIALITY",
  public: "PUBLIC ACCESS",
  live: "IN PROGRESS",
  archive: "COMPLETED",
  stack: "COMPONENTS",
  stars: "STARS",
  updated: "UPDATED",
  open: "ACCESS FILE",
  openZh: "在 GitHub 上查看",
  more: "MORE ON GITHUB",
  index: "ARCHIVE INDEX",
};

export const activityText = {
  heat: "CONTRIBUTION CALENDAR",
  heatZh: "近一年的提交",
  less: "LESS",
  more: "MORE",
  contributions: "次提交",
  none: "这一天没有提交记录",
  stats: [
    { id: "total", en: "TOTAL", zh: "提交" },
    { id: "active", en: "ACTIVE DAYS", zh: "活跃天数" },
    { id: "longest", en: "LONGEST STREAK", zh: "最长连续" },
    { id: "current", en: "CURRENT STREAK", zh: "当前连续" },
    { id: "best", en: "BEST DAY", zh: "最多的一天" },
  ],
  events: "RECENT PUBLIC EVENTS",
  eventsZh: "最近的公开动态",
  eventVerb: { WatchEvent: "STARRED", PushEvent: "PUSHED TO", CreateEvent: "CREATED", ForkEvent: "FORKED", PullRequestEvent: "PULL REQUEST", IssuesEvent: "ISSUE", ReleaseEvent: "RELEASED", PublicEvent: "PUBLISHED" } as Record<string, string>,
  noEvents: "NO PUBLIC EVENTS IN THE SNAPSHOT",
  synced: "SNAPSHOT",
  select: "SELECTED DAY",
};

export const contact = {
  file: "CHANNEL STATUS",
  open: "OPEN",
  lead: "合作、交流，或者只是打个招呼——写下来，从邮箱寄出。",
  channels: [
    { id: "mail", label: "MAIL", zh: "邮箱", value: "sirui.mei07@gmail.com", href: "mailto:sirui.mei07@gmail.com" },
    { id: "github", label: "GITHUB", zh: "GitHub", value: "@siruimei07", href: "https://github.com/siruimei07" },
  ],
  copy: "COPY",
  copied: "已复制邮箱地址",
  local: "LOCAL TIME",
  localZh: "多伦多当地时间",
  message: "MESSAGE",
  placeholder: "写点什么… / Write something…",
  subject: "Hello from your Rhine Lab archive",
  send: "TRANSMIT",
  sendZh: "用邮件寄出",
  thanks: "信号已发出。邮件客户端会打开一封写好的信。",
};

export const system = {
  theme: { label: "THEME", zh: "配色", options: [["auto", "AUTO", "跟随系统"], ["light", "LIGHT", "浅色"], ["dark", "DARK", "深色"]] as [string, string, string][] },
  motion: { label: "MOTION", zh: "动效", options: [["auto", "AUTO", "跟随系统"], ["full", "FULL", "完整"], ["reduced", "REDUCED", "减少"]] as [string, string, string][] },
  three: { label: "3D SCENE", zh: "三维场景", options: [["high", "HIGH", "高"], ["low", "LOW", "低"], ["off", "OFF", "关闭"]] as [string, string, string][] },
  replay: { label: "REPLAY OPENING", zh: "重播开场" },
  about: { label: "CREDITS", zh: "关于本站" },
  tech: "TypeScript + three.js + Vite。开场由 DOM / SVG 时间轴驱动；三维场景是一组实例化的半透明档案片，用自写的着色器做磨砂、边缘高光与雾化，并在 ∞、长链与阵列之间变形。整页在构建时预渲染为静态 HTML。",
  source: "SOURCE CODE",
  sourceZh: "本站源码",
  stored: "设置只保存在当前浏览器中。",
};

export const credits =
  "Fan-made tribute to Arknights · Rhine Lab. 「明日方舟」「莱茵生命」及相关名称与标志版权归上海鹰角网络科技有限公司（Hypergryph）所有，本站与官方无关。界面参考特别映像「莱茵生命：访问」与开源复刻 LBEILC/RhineLabUI（MIT）。头像为站主本人使用的头像。";
