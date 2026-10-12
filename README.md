# Sirui Mei · Analysis OS

Sirui Mei 的个人主页，做成一台莱茵生命风格的个人档案终端。视觉语言取自《明日方舟》特别映像「莱茵生命：访问」：浅灰白的底色、黑色粗体标签与 ∞± 标志、带颗粒感的黑色科室字块、向内倾斜的磨砂玻璃档案板、橙色页签与青柠色标记，以及由数百块半透明档案片组成、在 ∞ 与长链之间变形的立体结构。版式以 PV 的 1920×1080 画面为坐标系逐帧对照（CSS 里的 `--u` 就是 PV 画面里的一个像素），另有一套深色主题。实现时参考了开源复刻 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI)（MIT）。

线上地址：<https://siruimei07.github.io/>

## 一眼看懂我是谁

- **总览左侧的名字块**：`UNDERGRADUATE / UNIVERSITY OF TORONTO`、大字 `SIRUI MEI`、`STATISTICS · ECONOMICS · QUANT` 和一句话介绍（多伦多大学本科生，用统计、经济与量化理解世界），下面就是 GitHub 与邮箱按钮。
- **∞ 周围的四条标注**：RESEARCH SECTION（统计 · 经济 · 量化）、PROJECT ARCHIVE（作品与公开仓库）、CONTACT SECTION（邮箱与 GitHub）、ACTIVITY LOG（近一年的提交数），点一下就进入对应区块；中心的 `SIRUI MEI. / UNIVERSITY OF TORONTO` 名牌通往个人档案。
- **底部字幕**：每个画面打开时逐字打出一句中文，说明这里是什么。

## 体验流程

1. **白底开场（约 19 秒）**：沿用 RhineLabUI 对 PV 第 6.76–26.92 秒逐帧测得的时间轴，以其 1.1 倍速播放；白屏先停 0.4–0.8 秒、等页面载入平稳后才打出第一个字，主线程一时卡住时时钟随之停住、不跳过任何一帧闪切，三维场景也等到 `VISITOR` 打完后的静止片刻才开始加载——ACCESS PERMISSION REQUIRED 不规则地逐字打出 → ∞± 标志沿一条连续轮廓画出、加减号弹出、`SIRUI · MEI` 逐字出现，随后标志左移，左上标志三行错开滑入 → `ID CONFIRMED : VISITOR` / `REQUEST RECEIVED` / `START PROCESSING...`（标志上的缺口随之移动，末尾短暂缺字）→ PERMISSION AUTHORIZED 黑白圆环从画面外收拢、字距收紧，中心图形接替文字 → 黑白闪切后 `WELCOME TO / SIRUI MEI / PERSONAL DATABASE`，名称上扫过黑条 → 缩小失焦，进入总览。按任意键、点击或 SKIP 即可跳过（0.3 秒内退出）；同一浏览器会话里再次打开时只播欢迎卡片这一段的短版（约 4 秒）；直接打开深链接（如 `/#works`）或系统开启「减少动态效果」时不播放。设置页可以重播。
2. **总览**：档案片在画面中央聚成 ∞，四条标注的引线落在 ∞ 上。
3. **区块档案**：∞ 拉成一条长链退到背景；左侧是跨在竖线上的黑色科室字块（PRSN FILE、STAT、PRJ、LOG、CNCT、SYS），右侧是倾斜的玻璃档案板，内容在一道道黑条退去后依次显现。

常驻界面：左上 `SIRUI MEI / SYNTHESIZE INFORMATION / ANALYSIS OS` 标志，右上橙色页签；进入区块后左侧出现导航、竖线上的青柠色标记与 `COMMAND ENTERED` 命令记录，左下是当前科室名，右下是多伦多时间与 POWERED BY RHINE LAB。手机或竖屏上，左侧导航变成底部标签栏，玻璃板不再倾斜，各页改为纵向滚动。

| 区块 | 内容 |
| --- | --- |
| `PERSONNEL FILE` 档案 | 玻璃里的头像、UNDERGRADUATE 标签与名牌、`PRSN-001` 编号、中英文简介、GitHub / 邮箱；白色 PROFILE 资料卡（姓名、学校、身份、方向、所在地）与 GITHUB PARAMETERS 计量条（近一年提交、活跃天数、公开仓库、星标、关注者） |
| `RESEARCH` 研究 | STAT / ECON / QNT 三个研究科，左侧字块随之切换；每科一张标本图（抽样分布与 95% 置信区间、供需曲线与均衡点、蒙特卡洛价格路径）、`STUDY / INFER` 式标题、格言、说明与四个课题 |
| `PROJECTS` 作品 | ARCHIVE INDEX 档案列表（精选作品，加上自动追加的公开仓库）；选中的档案显示 FILE NUMBER、档案卡匣、CONFIDENTIALITY、简介、技术栈、星标、更新时间与状态，并链接到 GitHub |
| `ACTIVITY LOG` 活动 | 总提交、活跃天数、最长 / 当前连续、最多的一天；近 53 周的提交热力图（悬停显示当天）；最近的公开动态与数据快照时间 |
| `CONTACT` 联络 | `FILE NUMBER: CNCT-001` / `CHANNEL STATUS: OPEN` 档案框；邮箱（一键复制）与 GitHub；多伦多当地时间；写一段话，用自己的邮件客户端寄出 |
| `SYSTEM` 设置 | 配色（跟随系统 / 浅色 / 深色）、动效（跟随系统 / 完整 / 减少）、三维场景（高 / 低 / 关闭）、重播开场；关于本站、源码与 RhineLabUI 链接 |

## 操作

| 操作 | 效果 |
| --- | --- |
| 任意键 / 点击 / 轻触 | 跳过开场 |
| ←→、`Q` / `E`、`[` / `]` | 按顺序切换区块（在总览按 → 进入第一个，← 进入最后一个） |
| 数字 `1`–`6` | 直接打开对应区块 |
| `0` / `H`、Esc / Backspace | 回到总览 |
| ↑↓ | 研究页切换研究科，作品页在档案列表中选择 |
| ←→（焦点在研究科标签或设置选项上时） | 在标签 / 选项之间移动 |
| 点击标注、名牌、页签或导航 | 打开对应区块 |

深链接：`#profile`、`#skills`、`#works`、`#activity`、`#contact`、`#system`，总览就是 `/`；旧链接 `#calendar`（→ 活动）与 `#menu`（→ 总览）仍然有效。浏览器前进后退可用；在输入框里按 Esc 只会离开输入框。

## 渲染

1. **开场**：纯 DOM / SVG（`src/boot/`），由一条时间轴驱动描线、打字与圆环；不依赖 WebGL。时间按 PV 计：离散的闪切落在原片 25 fps 的帧号上，位移、半径与弧长沿测得的关键帧做单调三次插值，任意帧率下节奏一致，也可以随时跳过或定位。
2. **档案片**：three.js 场景（`src/three/`）。首屏不加载 three.js，页面显示后才按需导入，单独打成一个 chunk。数百块半透明档案片用实例化渲染，自写着色器负责磨砂、边缘高光与雾化，并在三种队形之间变形：总览的 ∞、区块页的长链、开场时的隐藏；每次切换页面都有一道波穿过档案片。总览标注的引线端点来自 ∞ 上几个点的实时投影。场景跟随深浅主题，画质分高 / 低两档。
3. **回退**：浏览器不支持 WebGL2，或在设置里关掉三维场景时，总览改用构建时生成的 SVG ∞（细长档案片排成的双纽线），引线落在 PV 中的固定位置，其余页面完全不受影响。
4. **动效偏好**：系统开启「减少动态效果」时跳过开场，页面直接切换，数字不滚动，字幕不逐字打出。设置页的动效、配色与三维场景三项都可以覆盖系统默认值，只保存在当前浏览器里。

## 本地运行

需要 Node.js 22.13+ 与 pnpm（版本见 `package.json` 的 `packageManager`）。

```powershell
pnpm install
pnpm dev
```

完整校验：

```powershell
pnpm run lint
pnpm test
```

开发模式下，在控制台里 `__app.navigate("works")` 可直接跳转到任一区块。

## 修改内容

所有文案在 `src/content.ts`：身份与一句话介绍、左上标志、六个区块（标签、科室字块、编号、字幕、左侧说明）、开场文字、总览标注、档案、研究、作品（精选列表；`public/data/github.json` 里的其余公开仓库会自动追加）、活动、联络、设置与声明。构建时由 `src/render.ts` 与 `src/views/*` 预渲染为静态 HTML（含提交热力图与标本图，经 `vite.config.ts` 的 `static-sections` 插件写进 `index.html`）——没有 JavaScript 时也是一张完整可读的页面。

### 中文字体子集

中文用的 Noto Sans SC 不走 npm 包（那会带来 300 多条 `@font-face` 与几十个分片），而是只保留本站用到的字：`src/fonts/` 里是 400 / 500 / 700 三个字重的 WOFF2、字符清单 `noto-sans-sc.chars.txt` 与字体许可 `OFL.txt`，由 `src/fonts/fonts.css` 声明。改动文案后如果出现了新的汉字，`pnpm test` 会列出缺少的字并失败；这时重新生成子集（需要 Python 与 Noto Sans SC 可变字体，[google/fonts](https://github.com/google/fonts/tree/main/ofl/notosanssc) 的 `NotoSansSC[wght].ttf`，或 Windows 自带的 `C:\Windows\Fonts\NotoSansSC-VF.ttf`）：

```powershell
pip install fonttools brotli
python scripts/subset-noto.py path\to\NotoSansSC[wght].ttf
```

脚本扫描 `index.html`、`src/` 下的 `.ts` / `.css` 与 `public/data/github.json`，外加常用标点与全角符号。定时同步进来的 GitHub 数据里若有新字，不会让测试失败，只会退回系统字体显示，下次重新生成时补上。

## 目录

- `src/main.ts`：入口，载入字体与样式并启动终端；出错时退回纯文档。
- `src/app/`：`app.ts`（开场 → 总览 ⇄ 区块的路由与历史、切换动效、常驻界面、键盘、偏好与按需加载三维），`settings.ts`（只存在当前浏览器的偏好），`fx.ts`（打字、解码乱码、数字滚动）。
- `src/boot/`：开场的标记 `markup.ts`、播放与绘制 `boot.ts`、时间轴 `motion.ts`（速度 `SPEED` 在这里），以及改写自 RhineLabUI 的测量轨迹 `tracks.ts`、`logo-track.ts`、`orbit-track.ts`。
- `src/three/`：`plates.ts`（档案片的接口与按需加载），`scene.ts`（three.js 场景、实例化档案片与着色器）。
- `src/views/`：构建时运行的标记——常驻界面 `chrome.ts`、区块共用框架 `section.ts`、总览 `home.ts`（含 SVG ∞ 回退）、六个区块，以及研究页的标本图 `viz.ts`。
- `src/screens/`：每个画面的交互模块，`types.ts` 是它们与 `app.ts` 的约定。
- `src/styles/`：`tokens.css`（颜色、字体、`--u` 单位与深色主题）、`base.css`、`components.css`（标签、字块、玻璃板、名牌、资料卡等组件）、`app.css`（常驻界面与区块框架）、`motion.css`、`boot.css`、`home.css`、`screens/*.css`。
- `src/markup.ts`：构建时与浏览器共用的字符串工具与 ∞± 标志的路径。
- `src/github.ts`：把 `public/data/github.json` 整理成作品列表、计量与热力图。
- `src/fonts/`：Noto Sans SC 子集与其 `@font-face`；`scripts/subset-noto.py` 负责重新生成。

## GitHub 数据与部署

`.github/workflows/pages.yml`：推送到 `main`、手动运行或定时触发 → 同步公开 GitHub 数据（`pnpm sync-data`）→ lint、构建与测试 → 部署 `dist` 到 GitHub Pages。

## 声明

Fan-made tribute to Arknights · Rhine Lab。「明日方舟」「莱茵生命」及相关名称与标志版权归上海鹰角网络科技有限公司（Hypergryph）所有，本站与官方无关。界面参考特别映像「莱茵生命：访问」与开源复刻 LBEILC/RhineLabUI（MIT），∞± 标志的轮廓改写自其 `src/brand.ts`，开场的时间轴与测量轨迹改写自其 `src/boot-motion.ts`、`src/boot-tracks.ts`、`src/boot-logo-tracks.ts` 与 `src/boot-orbit-tracks.ts`。头像为站主本人使用的头像。字体 Montserrat、JetBrains Mono 与 Noto Sans SC 均以 SIL Open Font License 1.1 授权（Noto Sans SC 子集的许可见 `src/fonts/OFL.txt`）。
