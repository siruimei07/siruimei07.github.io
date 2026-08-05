# Sirui Mei｜Summer Profile

Sirui Mei 的 GitHub 风格个人主页。页面采用浅色夏日海岸主题，包含固定个人资料栏、Repositories、Activity、动态贡献热力图，以及透明 GIF 装饰动画。

线上地址：<https://siruimei07.github.io/>

## 本地运行

需要 Node.js 22.13 或更高版本，以及 pnpm。

```powershell
pnpm install
pnpm dev
```

开发服务器通常位于 `http://localhost:3000/`。

完整验证：

```powershell
pnpm run lint
pnpm test
```

`pnpm test` 会生成 GitHub Pages 静态导出，并检查数据契约、贡献年份、首次揭示动画、素材完整性，以及最终 `dist/client` 产物。

## GitHub 数据

部署工作流使用仓库自带的 `GITHUB_TOKEN` 获取：

- GitHub 公开个人资料；
- 全部公开 owner repositories；
- 最近公开 Activity events；
- 从 2025 年到当前年份的 contribution calendar。

同步结果写入 `public/data/github.json`，网站完全静态，不需要把 Token 发送给浏览器，也不需要个人访问令牌。浏览器中的 Repositories 和 Activity 仍会尝试读取较新的公开 REST 数据；匿名 API 达到限额时会自动回退到部署时生成的完整快照。

本地没有 Token 时可以安全运行：

```powershell
pnpm run sync-data
```

该命令只验证并保留已提交的公开快照。设置 `GITHUB_TOKEN` 或 `GH_TOKEN` 后才会联网刷新数据。

## 贡献日历行为

- `Latest` 以浏览器当天日期作为热力图最右侧。
- 年份按钮从 2025 自动生成到当前年份；跨年后会自动出现新按钮。
- 已打开的页面每五分钟重新请求部署快照。
- `0.gif` 仅在当前标签页会话首次进入时扫过热力图，失败或加载过慢时会自动解除遮罩。
- GitHub Pages 的定时 Actions 是“尽力约每五分钟”运行，GitHub 繁忙时可能延迟；它不是严格的实时服务。

## GitHub Pages 部署

`.github/workflows/pages.yml` 已配置以下流程：

1. 推送到 `main`、手动运行或定时触发；
2. 使用 GitHub API 同步公开数据；
3. 运行 lint、静态构建和测试；
4. 上传 `dist/client`；
5. 部署到 GitHub Pages。

仓库首次推送后，只需在 GitHub 的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。以后推送到 `main` 会自动发布；定时工作流会刷新公开 GitHub 数据。

## 主要目录

- `app/`：页面组件、交互和样式。
- `public/assets/`：头像、背景与十个 GIF 素材。
- `public/data/github.json`：可离线使用的公开数据快照。
- `scripts/sync-github-data.mjs`：GitHub 数据同步与严格校验。
- `scripts/build-static.mjs`：vinext 静态构建及 Windows 收尾校验。
- `tests/static-export.test.mjs`：GitHub Pages 产物与数据测试。
- `.github/workflows/pages.yml`：自动同步、构建和部署工作流。
