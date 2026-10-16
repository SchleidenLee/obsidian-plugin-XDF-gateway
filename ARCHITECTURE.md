# ARCHITECTURE — XDF Gateway

> 现状架构说明。定位与使用见 [README.md](./README.md)；待办见 [PENDING.md](./PENDING.md)；变更史见 [DEVLOG.md](./DEVLOG.md)。

## 1. 定位

Obsidian 插件（`isDesktopOnly: false`，id `xdf-gateway`，author Schleiden）。XDF 插件管理中枢，三件事：

1. **XDF 套件更新**：内置 6 个 XDF 插件预设（`XDF_PLUGINS`），对比本地 `manifest.version` 与远端 Release tag，支持一键检查/更新/安装。
2. **设置页分组渲染**：用 DOM hack 把 Obsidian 社区插件列表按关键词折叠成分组。
3. **通用插件管理**：从任意 GitHub 仓库安装插件（`owner/repo`）、启用/禁用、第三方来源标记、标签。

上游蓝本：BRAT（GitHub API 通信与更新引擎）、obsidian-manager / BPM（通用管理 UI 与两级回退下载）、settings-sidebar-organizer（设置页 DOM 分组）。

## 2. 目录结构

```
src/
├── main.ts                Plugin 类 + 命令/Ribbon + GatewaySettingTab 路由
├── settings.ts            配置模型 + DEFAULT_SETTINGS + XDF_PLUGINS / 分组 / 标签 / 镜像预设
├── types.ts               类型定义（GroupConfig / PluginUpdateInfo / Release / ReleaseFiles …）
├── github.ts              GitHub API 通信层（镜像站 fallback / 缓存 / semver / sanitizeRepo）
├── updater.ts             插件更新与安装引擎（检查 / 下载 / 写入 / 热重载）
├── obsidian-internals.ts  Obsidian 内部 API 封装（唯一集中 as any 的地方）
├── sidebar-organizer.ts   设置页分组渲染（monkey-patch + MutationObserver + proxy item）
├── styles.css             样式（另由 main.loadStyles() 动态注入）
└── tabs/
    ├── plugins-tab.ts     插件管理 Tab（XDF 套件 / 分组 / 安装 / 第三方）
    ├── tags-tab.ts        标签管理 Tab
    ├── settings-tab.ts    高级设置 Tab
    └── group-editor.ts    分组编辑 Modal
```

## 3. 模块职责

| 模块 | 职责 | 关键点 |
|------|------|--------|
| `main.ts` | `onload`：加载设置、构造 `PluginUpdater` / `SidebarOrganizer`、注入样式、注册 Ribbon 与两条命令、按 `autoUpdate` 起定时检查、`organizer.enable()`；`runUpdateCheck` 编排检查→更新→刷新 | 设置面板 `GatewaySettingTab` 也在此文件内，三个 Tab 由 `activeTab` 路由 |
| `settings.ts` | `GatewaySettings` 全部字段；`XDF_PLUGINS`（6 条 id/name/repo）、`DEFAULT_GROUPS`（4）、`DEFAULT_TAGS`（4）、`DEFAULT_PLUGIN_TAGS`、`DEFAULT_MIRRORS`（8 条） | `proxyTemplate` 字段当前未被消费（见 PENDING） |
| `types.ts` | `PluginInstallState`、`PluginUpdateInfo`（`currentVersion: string \| null`）、`Release`、`ReleaseFiles`、`GroupConfig` 等 | — |
| `github.ts` | `gitHubRequest`：直连 → 逐个镜像；`rewriteGithubUrl` 三种模板（`{url}` / `{encodedUrl}` / 前缀）；5 分钟响应缓存；`semverCoerce` / `compareVersions`；`grabReleaseFromRepository` / `grabAllReleaseFiles` / `downloadReleaseFiles`（Assets → Raw Tag 回退）；`sanitizeRepo` | 错误类 `GHRateLimitError` / `GitHubResponseError` |
| `updater.ts` | `checkForUpdates` / `checkSinglePluginUpdate`（未安装 → `currentVersion: null`）、`updatePlugin`（区分安装/更新）、`installFromRepo`、`updateAll`、`writeReleaseFilesToPluginFolder`、`reloadPlugin`、`getInstallState`、`getLocalVersion`、`isNewerVersion` | `reloadPlugin` = disable（容错）→ `loadManifests` → `enablePluginAndSave` |
| `obsidian-internals.ts` | `getPluginManager` / `getManifests` / `getEnabledPlugins` / `getSetting` / `getSettingDoc` + `PluginManagerLike` / `SettingLike` 最小接口 | 声明为"唯一允许 `as any` 的地方"，但 tabs 仍有突破（见 PENDING） |
| `sidebar-organizer.ts` | `enable()` monkey-patch `app.setting.onOpen/onClose` + MutationObserver；`organizeSidebar()` 按关键词把社区插件项折叠进 `<details class="xdf-folder">`，用 proxy item 承接点击 | 「其他插件」分组当前无条件生成 |
| `tabs/plugins-tab.ts` | 渲染 XDF 套件（并行取安装状态）、分组、安装社区插件、第三方插件 | 开关用 `enablePluginAndSave` / `disablePluginAndSave` |
| `tabs/settings-tab.ts` | 自动更新、间隔、Token、紧凑模式、显示未分组、镜像站列表、代理模板、关于 | — |
| `tabs/tags-tab.ts` | 标签增删改 + 插件-标签关联 | — |
| `tabs/group-editor.ts` | 分组编辑 Modal：改名/改关键词/上下移/删除（预设不可删）/新建/重置为默认 | 保存写 `settings.customGroups` |

## 4. 数据流

**更新 / 安装链路**

```
用户（Ribbon / 命令 / Tab 按钮）
   │
   ▼
PluginUpdater.checkForUpdates()
   └─ 每个 XDF_PLUGINS 项 → checkSinglePluginUpdate()
        ├─ getLocalVersion(id) 读 .obsidian/plugins/<id>/manifest.json
        └─ grabReleaseFromRepository(repo, settings)
             └─ gitHubRequest(api.github.com/repos/<repo>/releases/latest)
                  ├─ 直连（带 Token）→ 失败则逐个镜像 rewriteGithubUrl
                  └─ 命中 5 分钟缓存直接返回
   ▼
updatePlugin(id, onProgress) / installFromRepo(repo)
   ├─ grabAllReleaseFiles(release) → 并行取 main.js / manifest.json / styles.css
   ├─ writeReleaseFilesToPluginFolder(id, files)  写 .obsidian/plugins/<id>/
   └─ reloadPlugin(id, forceEnable?)
        ├─ disablePlugin  → loadManifests() 重扫目录（识别新装插件）
        └─ enablePluginAndSave() 启用并持久化
   ▼
Notice 反馈 + refreshSettingTab()
```

- **未安装插件的表达**：`checkSinglePluginUpdate` 返回 `currentVersion: null` → UI 显示 disabled 开关 + 「安装」按钮。
- **两级回退下载**：Release Assets 缺失时 `downloadReleaseFiles` 回退 `raw.githubusercontent.com/<repo>/<tag>/...`（自动尝试 `v` 前缀有无两种 tag）。注意：当前 `updatePlugin` / `installFromRepo` 直接走 `grabAllReleaseFiles`，未调用 `downloadReleaseFiles`。
- **镜像 fallback**：`gitHubRequest` 只对 GitHub 域名重写；镜像列表来自设置文本域。

**设置页分组渲染链路**

```
SidebarOrganizer.enable()
   ├─ monkey-patch app.setting.onOpen → organizeSidebar()
   └─ MutationObserver 监听 `.vertical-tab-header`
        ▼
organizeSidebar()  ← 读 DOM 中 `.vertical-tab-nav-item[data-setting-id]` + manifests
   ├─ 按 group.keywords 匹配 manifest.name（命中 → 隐藏原项、插入 proxy）
   └─ 未命中的进「其他插件」分组
```

## 5. 技术决策

1. **不照搬 BPM 的 5700 行**：只取需要的能力（两级回退下载、代理模板、状态持久化），Banner 导航 + 三 Tab 自建。
2. **镜像站重写在 `gitHubRequest` 层全局拦截**：所有 GitHub 请求（API / Release / Raw）统一走同一 fallback 链，安装第三方插件与更新 XDF 套件共用一条链路。
3. **设置页分组用 DOM hack 而非官方 API**：Obsidian 无插件列表分组公开 API，故 monkey-patch `setting.onOpen` + MutationObserver + proxy item。代价是选择器随 Obsidian 版本变化（见 PENDING）。
4. **内部 API 集中封装**：`obsidian-internals.ts` 作为唯一 `as any` 收口点，声明 `PluginManagerLike` / `SettingLike` 最小接口。

## 6. 构建与发布

- 构建：`npm run build` = `node esbuild.config.mjs production`，产物 `main.js`（`styles.css` 由 `main.loadStyles()` 运行时从插件目录读取注入）。
- 发布：`.github/workflows/release.yml`，推送 `v*` tag 触发，校验 `package.json` / `manifest.json` / tag 三者版本一致后构建发布，release notes 自动生成。**不手写 CHANGELOG**。

## 7. 约定

- 所有 GitHub 网络请求**一律**经 `github.ts` 的 `gitHubRequest`，不要在别处直连。
- 内部 API 访问经 `obsidian-internals.ts`，不要在 tabs / main 里再写 `(app as any)`。
- 版本号三处需一致：`package.json` / `manifest.json` / release tag。

## 8. 已知技术债

概览，详见 [PENDING.md](./PENDING.md)：

- `proxyTemplate` 设置项未被消费；`settings-tab` 描述的 `{prefix}` 无实现分支；默认镜像前缀模式对部分镜像（curl 风格）可能拼出非法 URL。
- 镜像重写后未校验最终 host，Token 会被带到镜像 host（SSRF 面）。
- `installFromRepo` 未净化 `manifest.id`（路径穿越面）；下载无完整性校验；单文件失败可能写坏目录。
- `reloadPlugin` 无失败回滚，disable/load 异常被静默吞掉。
- `installFromRepo` 恒 `forceEnable=true`，覆盖已禁用插件会意外启用。
- 请求缓存 key 仅 URL，不区分镜像/Token/状态。
- 无 in-flight 互斥，同一插件可被并发更新。
- `compactMode` 启动不生效；`showUngrouped` 未被 `sidebar-organizer` 读取。
- `getPluginManager` 可能为 `undefined`（内部 API 变更时整体失败）。
- 版本比较忽略预发布/构建元数据，非法 tag 误报更新。
