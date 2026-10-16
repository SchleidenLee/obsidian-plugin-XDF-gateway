# XDF Gateway

XDF **插件管理中枢**。给新东方教师 Vault 一个统一入口：管理 XDF 教学套件的安装/更新、把 Obsidian 设置页的插件按分组渲染、并提供通用插件管理（从 GitHub 安装任意插件）。

## 需要

- Obsidian（桌面端与移动端均可，`isDesktopOnly: false`）

## 安装

BRAT 填仓库：`SchleidenLee/obsidian-plugin-XDF-gateway`
或从 [Releases](https://github.com/SchleidenLee/obsidian-plugin-XDF-gateway/releases) 下载 `main.js` / `manifest.json` / `styles.css` 放到 `.obsidian/plugins/xdf-gateway/`。

## 使用

启用后 Ribbon 出现刷新图标，命令面板有「检查 XDF 插件更新」「更新所有 XDF 插件」。设置页分三个 Tab：

- **插件管理** — 顶部是 XDF 教学套件（6 个插件，显示版本号、启用开关、"安装"/"更新"按钮）；中间是「插件分组」按关键词自动归类社区插件（可「管理分组」）；下方是「安装社区插件」（输入 `owner/repo` 或 GitHub 链接直接装）；末尾是「第三方插件」（GitHub 来源插件独立分组）。
- **标签管理** — 维护标签（名称/颜色）与插件-标签关联。
- **高级设置** — 自动更新开关与间隔、GitHub Token、紧凑模式、显示未分组插件、镜像站列表、代理 URL 模板。

**镜像站 fallback**：所有 GitHub 请求先直连，失败后依次尝试镜像站列表。

## 开发

```bash
npm install
npm run build
```

产物：`main.js`。版本号三处需一致：`package.json` / `manifest.json` / release tag。
