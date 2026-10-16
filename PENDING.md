# XDF Gateway 后续实现计划 — PENDING

> 基于 PLAN.md 中未完成项 + 新发现问题，逐项分析实现方案。
> 最后更新：2026-10-04

---

## 问题修复记录

### 2026-09-08: 安装社区插件位置调整

**问题**：「安装社区插件」输入框夹在 XDF 教学套件和「一键更新」之间，看起来像 XDF 套件的一部分。

**修复**：将安装区域移到「插件分组」区域下方，与 XDF 套件明确分开。

**安装走代理确认**：`installFromRepo` 调用 `grabReleaseFromRepository`，和 XDF 插件更新走同一个 `gitHubRequest`，镜像站 fallback 自动生效。

### 2026-09-08: 插件来源字段 + 第三方插件分组

**新增**：
- `GatewaySettings.pluginSources` 字段：`{ [pluginId: string]: "store" | "github" }`
- `installFromRepo` 安装后自动标记 `pluginSources[id] = "github"`
- 分组列表中 GitHub 来源插件显示「GitHub」小标签
- 「第三方插件」固定分组：展示所有 GitHub 来源插件，不受去重限制

**BRAT 参考**：BRAT 的 Beta 插件列表显示 repo 链接 + 版本号 + 操作按钮，但没有来源概念。我们的设计更简单：来源标记 + 独立分组。

---

### 2026-09-08: BRAT 第三方插件管理参考

**BRAT 的 Beta 插件列表模式**（SettingsTab.ts L230-310）：
- 每个插件显示：repo 链接（可点击）+ 版本号 + 描述
- 操作按钮：复制 repo ID / 更新 / 编辑版本 / 删除
- 列表顶部有「+」按钮添加新插件
- 支持冻结版本（frozen version）

**我们的差异**：
- BRAT 只管理 beta 插件，我们管理所有第三方 GitHub 安装插件
- BRAT 没有「来源」概念，我们需要区分「官方商店」vs「GitHub 安装」

### 待定事项

- **内置商店代理插件**（P5）— 待做，让老师能访问 Obsidian 原生插件商店
- **插件拖拽分组**（P3 缺口）— 待做，插件在不同分组之间拖拽移动

---

## 待做事项总览

| # | 功能 | 优先级 | 状态 | 说明 |
|---|------|--------|------|------|
| 1 | 从 GitHub 安装任意插件 | P0 | 待做 | 核心功能缺口 |
| 2 | XDF 插件显示版本号 | P1 | 待做 | 新发现问题 |
| 3 | 分组管理 UI（拖拽 + 自定义） | P1 | 待做 | 新发现问题 |
| 4 | 内置商店代理插件 | P1 | 待做 | 老师交付必需 |
| 5 | 打包交付脚本 | P2 | 暂缓 | 产品未完成 |
| 6 | Ribbon 排序 | P3 | 暂缓 | 锦上添花 |
| 7 | 统一设计语言（CSS） | P1 | 待做 | 视觉统一 |

**已取消：**
- ~~延迟加载机制~~ — 插件数量少，不需要

---

## 7. 统一设计语言（P1）

### 需求
所有 XDF 插件的设置页视觉风格统一（颜色、字体、间距、圆角、按钮样式），但保留各插件自己的结构（Tab 导航/线性滚动/声明式分组）。

### 实现方案

**7.1 创建共享 CSS 库**

根目录 `shared/` 下创建两个文件：
- `xdf-design-tokens.css` — 设计变量（颜色、间距、圆角、字体）
- `xdf-common-styles.css` — 通用样式类（Banner、Footer、高级设置折叠区、按钮、输入框）

**7.2 各插件构建时注入**

各插件的 `esbuild.config.mjs` 构建时：
1. 尝试从根目录 `../../shared/` 复制 CSS 到本地 `src/shared/`
2. 如果根目录不存在（项目独立时），用本地副本
3. 拼接 `tokens + common + 插件特有样式` → `dist/styles.css`

**7.3 各插件 UI 改造**

每个插件根目录已创建 `UI-REFACTOR.md` 记录改造方案：

| 插件 | 状态 | 改动点 |
|------|------|--------|
| Gateway | ✅ 已完成（标准模板） | 不需要改 |
| Toolkits | 📋 待改造 | 加 Banner/Footer，模型配置移到高级设置 |
| ClassTracker | 📋 待改造 | 加 Banner/Footer，低频设置移到高级设置 |
| Feedback Assistant | 📋 待改造 | 加 Banner/Footer，翻译为中文 |
| Base | 📋 待改造 | 加 Banner/Footer，AI/数据库/打包移到高级设置 |
| AI Chat | 📋 待改造（最复杂） | 加 Banner/Footer，13 个子模块移到高级设置 |

**7.4 通用组件**

```html
<!-- Banner -->
<div class="xdf-banner">
  <div class="xdf-banner-icon">📅</div>
  <div>
    <h1 class="xdf-banner-title">XDF ClassTracker</h1>
    <p class="xdf-banner-desc">课程追踪日历插件</p>
  </div>
</div>

<!-- Footer -->
<div class="xdf-footer">
  <span class="xdf-version">v1.0.3</span>
  <span class="xdf-author">· Schleiden</span>
</div>

<!-- 高级设置折叠区 -->
<details class="xdf-advanced-settings">
  <summary>高级设置</summary>
  <div class="xdf-advanced-settings-content">
    <!-- 各插件自己的高级设置内容 -->
  </div>
</details>
```

### 实施顺序

1. **Gateway** — 已经是标准，不动
2. **Toolkits** — 最简单，先改（设置项少）
3. **ClassTracker** — 中等复杂度
4. **Feedback Assistant** — 最简单（只有一个设置项）
5. **Base** — 声明式架构，改动小
6. **AI Chat** — 最复杂，最后改

**预估工作量：** 每个插件 ~50 行 HTML + CSS 调整

---

## 1. 从 GitHub 链接安装任意插件（P0）

### 需求
用户在设置页输入 `owner/repo`（如 `obsidianmd/obsidian-sample-plugin`），Gateway 走镜像站下载并安装该插件。

### 现有基础
- `updater.ts` 已有 `updatePlugin(pluginId)` — 但依赖 `XDF_PLUGINS` 预设列表，不能处理任意 repo
- `github.ts` 已有 `grabReleaseFromRepository(repo, settings)` — 可直接复用
- `updater.ts` 已有 `writeReleaseFilesToPluginFolder` + `reloadPlugin` — 安装流程完整

### 实现方案

**1.1 新增 `installFromRepo(repo: string)` 方法（updater.ts）**

```ts
async installFromRepo(repo: string): Promise<boolean> {
  // 1. 解析 repo（支持 owner/repo、完整 URL、git@ 格式）
  const normalized = sanitizeRepo(repo);
  
  // 2. 获取 release
  const release = await grabReleaseFromRepository(normalized, this.settings);
  
  // 3. 读取 manifest 获取 pluginId
  const files = await grabAllReleaseFiles(release, this.settings);
  const manifest = JSON.parse(files.manifest);
  const pluginId = manifest.id;
  
  // 4. 写入文件
  await this.writeReleaseFilesToPluginFolder(pluginId, files);
  
  // 5. 热加载 + 启用
  await this.reloadPlugin(pluginId, true);
  
  return true;
}
```

**1.2 新增 `sanitizeRepo(input: string): string` 工具函数（github.ts 或单独文件）**

参考 BPM 的 `sanitizeRepo`：
- 去掉 `https://github.com/` 前缀
- 去掉 `.git` 后缀
- 去掉 trailing `/`
- 取前两段作为 `owner/repo`

**1.3 UI：在「插件管理」Tab 添加安装入口**

位置：XDF 教学套件列表下方、「一键更新」按钮上方。

```
─────────────────────────────────────────────┐
│ 安装社区插件                                  │
│ [输入 owner/repo 或 GitHub 链接____] [安装]  │
└─────────────────────────────────────────────┘
```

点击「安装」后：
- 显示进度 Notice（获取 Release → 下载 → 写入 → 启用）
- 成功后 `this.display()` 刷新页面
- 失败显示错误原因（404 = 仓库不存在 / 无 release，403 = 频率限制）

**1.4 复用现有代码量**

| 组件 | 来源 | 改动 |
|------|------|------|
| `grabReleaseFromRepository` | github.ts 已有 | 零改动 |
| `grabAllReleaseFiles` | github.ts 已有 | 零改动 |
| `writeReleaseFilesToPluginFolder` | updater.ts 已有 | 零改动 |
| `reloadPlugin` | updater.ts 已有 | 零改动 |
| `sanitizeRepo` | 新增 | ~15 行 |
| `installFromRepo` | 新增 | ~30 行 |
| UI 输入框 + 按钮 | 新增 | ~40 行 |

**预估新增代码量：~85 行**

---

## 2. XDF 插件显示版本号（P1）

### 问题
XDF 教学套件列表中的插件不显示版本号，但下方「插件分组」里的社区插件显示版本号。

### 根因
[plugins-tab.ts L42-47](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-gateway/src/tabs/plugins-tab.ts#L42-L47)：

```ts
info.createSpan({ text: xdfPlugin.name, cls: "xdf-plugin-name" });
if (description) {
  info.createSpan({ text: description, cls: "xdf-plugin-desc" });
}
// ← 缺少版本号渲染
```

对比 L182-188 社区插件：
```ts
info.createSpan({ text: m.name, cls: "xdf-plugin-name" });
info.createSpan({ text: `v${m.version}`, cls: "xdf-plugin-version" });  // ← 有版本号
```

### 修复方案

在 XDF 插件渲染处加版本号：

```ts
info.createSpan({ text: xdfPlugin.name, cls: "xdf-plugin-name" });
if (m?.version) {
  info.createSpan({ text: `v${m.version}`, cls: "xdf-plugin-version" });
}
if (description) {
  info.createSpan({ text: description, cls: "xdf-plugin-desc" });
}
```

注意：`m` 可能为 `undefined`（插件未安装时 `manifests[xdfPlugin.id]` 不存在），需要加 `m?.version` 判断。

**预估新增代码量：~3 行**

---

## 3. 分组管理 UI（P1）

### 问题
当前分组是硬编码在 `settings.ts` 的 `DEFAULT_GROUPS` 里，设置页只展示不编辑。用户无法：
- 拖拽调整分组内插件顺序
- 新建自定义分组
- 删除/重命名分组
- 自定义分组覆盖关键词自动匹配

### 当前逻辑
- `settings.ts` 里 `DEFAULT_GROUPS` 硬编码 4 个分组 + 关键词
- `plugins-tab.ts` L131-174 遍历 `plugin.settings.groups`，用关键词自动匹配插件到分组
- 没有 UI 让用户编辑分组

### 实现方案

**3.1 设置项新增**

```ts
// GatewaySettings 新增
customGroups?: GroupConfig[];  // 用户自定义分组（覆盖 DEFAULT_GROUPS）
```

**3.2 UI：在「插件分组」区域加「编辑分组」按钮**

位置：「插件分组」标题右侧。

```
插件分组                          [编辑分组]
 XDF 教学套件
├ 编辑器与文件
├ 外观与样式
 其他插件
```

**3.3 编辑模式（Modal 或 Inline）**

点击「编辑分组」后：
- 显示所有分组列表
- 每个分组可：
  - 拖拽排序（上下移动）
  - 编辑名称
  - 编辑关键词（逗号分隔）
  - 删除（预设分组不可删，只能改关键词）
- 支持「新建分组」按钮
- 分组内插件支持拖拽排序（调整 `items` 数组的 `order` 字段）

**3.4 渲染逻辑改为优先用 customGroups**

```ts
const groups = plugin.settings.customGroups ?? plugin.settings.groups;
```

如果用户自定义了分组，用 `customGroups`；否则用默认的关键词匹配。

**3.5 拖拽实现**

用 Pointer Events API（`pointerdown` / `pointermove` / `pointerup`）实现拖拽，不依赖第三方库。

**预估新增代码量：~300 行**（UI + 拖拽逻辑 + 设置项）

---

## 4. 内置商店代理插件（P1）

### 需求
让无法科学上网的老师也能用 Obsidian 原生插件商店。

### 方案选择

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| Market Proxy | 轻量，只代理，不改 UI | 代理地址可能失效 | ⭐ 首选 |
| China Speedup | 自带商店 UI，功能完整 | 依赖作者 relay 节点 | 备选 |

### 实现步骤

1. 用 `gh cli` 拉取 Market Proxy 的 release 文件到 `references/`
2. 审查代码（确认代理地址、无恶意代码）
3. 预装到 vault 的 `.obsidian/plugins/` 目录
4. 在 `community-plugins.json` 中预启用
5. 验证与 Gateway 共存无冲突

**预估工作量：~1 小时**（拉取 + 审查 + 预装）

---

## 5. 打包交付脚本（P2）— 暂缓

> 产品未完成，暂不打包。

### 未来实现方案

**5.1 预设配置**

创建 `community-plugins.json` 预启用所有 XDF 插件 + 代理插件：

```json
{
  "community-plugins": [
    "xdf-gateway",
    "xdf-base",
    "xdf-classtracker",
    "xdf-feedback-assistant",
    "xdf-toolkits",
    "xdf-aichatbot",
    "obsidian-market-proxy"
  ]
}
```

**5.2 打包脚本**

写一个 `build-vault.ps1`：
1. 编译 Gateway
2. 复制所有 XDF 插件的 dist 文件到 vault 的 `.obsidian/plugins/` 目录
3. 复制代理插件
4. 复制预设 `community-plugins.json`
5. 复制 `.obsidian/app.json`（基础配置）
6. 输出为 `XDF-Obsidian-Vault/` 文件夹

**5.3 安装说明**

写一份 `SETUP.md`：
- 文件夹结构说明
- 首次打开步骤
- 常见问题（镜像站失效、插件不显示等）

---

## 6. Ribbon 排序（P3）— 暂缓

> 老师群体大概率不关心这个，优先级最低。

### 未来实现方案

**6.1 设置项**

```ts
ribbonOrder: string[];  // Ribbon 插件 ID 排序列表
```

**6.2 排序逻辑**

桌面端：CSS `order` 属性（非侵入式，不改 DOM）。
移动端：DOM 重排（移动端不支持 CSS order）。

**6.3 UI**

在「高级设置」Tab 添加 Ribbon 排序列表，支持拖拽。

**预估新增代码量：~100 行**

---

## 建议执行顺序

1. **XDF 插件显示版本号**（P1，~3 行，5 分钟搞定）
2. **从 GitHub 安装任意插件**（P0，核心功能缺口，~85 行）
3. **分组管理 UI**（P1，体验提升大，~300 行）
4. **内置商店代理插件**（P1，老师交付必需，~1 小时）
5. ~~延迟加载~~ — 已取消
6. ~~批量启用/禁用~~ — 已取消
7. **打包交付**（P2，产品完成后）
8. **Ribbon 排序**（P3，锦上添花）

---

## 代码审查整改计划（2026-10-04）

### 来源说明

本次为只读代码审查（不修改任何源码），逐行核对以下文件的磁盘内容，文中行号均以当前磁盘源码为准：

- `src/main.ts`（插件入口 / SettingTab 路由 / 更新检查 / Ribbon 命令）
- `src/github.ts`（GitHub API 通信 / 镜像站 URL 重写与 fallback / 错误类 / sanitizeRepo / semver）
- `src/updater.ts`（插件更新与安装引擎 / 文件写入 / reloadPlugin）
- `src/settings.ts`（配置管理 / XDF_PLUGINS / DEFAULT_GROUPS）
- `src/sidebar-organizer.ts`（设置页 DOM hack / MutationObserver / monkey-patch）
- `src/obsidian-internals.ts`（内部 API 封装）
- `src/tabs/plugins-tab.ts`、`src/tabs/tags-tab.ts`、`src/tabs/settings-tab.ts`、`src/tabs/group-editor.ts`
- `src/types.ts`、`src/styles.css`

注明 `[待确认]` 的条目表示无法仅凭当前源码确证，需要运行时或跨仓库验证。

### 严重

- [ ] **curl 语义的 `{url}` 模板导致镜像请求 URL 非法** — `src/tabs/settings-tab.ts:99-109`，`src/settings.ts:115`
  - 现象：设置页把 `{prefix}` 描述为镜像前缀，但 `gitHubRequest` 从不读取 `settings.proxyTemplate`（全仓库仅设置页与 settings.ts 引用该字段，见 `settings.ts:17`、`settings.ts:115`、`settings-tab.ts:104-106`）；`rewriteGithubUrl`（`src/github.ts:115-125`）只把 `{url}` 直接替换为**未编码**原始 URL 并返回，随后 `requestUrl` 会把 `"https://gh-proxy.com/https://api.github.com/..."` 拆成协议 `https:`、主机 `gh-proxy.com`、路径 `/https://api.github.com/...`，而 `gh-proxy.com` 实际是 curl 风格（期望 `/https://github.com/...` 作为 `:url` 参数）。
  - 影响：默认镜像模板未经过 `{encodedUrl}` 分支，镜像 fallback 很可能整体失效或返回错误页面，与「镜像站自动 fallback」的宣称不符。
  - 修复方向：默认模板改为 `{encodedUrl}` 风格并让 `gitHubRequest` 真正消费 `proxyTemplate`；或按镜像站类型区分 curl 风格与前缀风格；补一组镜像连通性测试。

- [ ] **镜像重写后不校验最终 host，存在 SSRF 面** — `src/github.ts:115-125`，`src/github.ts:228-239`
  - 现象：镜像列表来自用户可编辑的设置文本域（`settings-tab.ts:82-96`），`rewriteGithubUrl` 只判断入参是否为 GitHub 域名，对 `proxy` 无任何 host 白名单校验；`{url}` 模板返回 `proxy.replace(...)`、前缀模式返回 `${prefix}/${url}`，最终 URL 的 host 完全由镜像配置决定。搭配 `Authorization: token ...` 头（`github.ts:190-192`）被带到重写后的 host。
  - 影响：任意镜像可将请求指向任意主机（SSRF），或在非 GitHub 主机上接收用户 GitHub Token。
  - 修复方向：对重写后的最终 URL 做 host 白名单/协议校验；Token 只发送给 github.com 官方 host，镜像请求剥离 Authorization。

### 高

- [ ] **安装流程无 manifest.id 校验，可路径穿越写任意目录** — `src/updater.ts:165-209`，`src/updater.ts:240-258`
  - 现象：`installFromRepo` 只校验 `!manifest.id` 是否存在（`updater.ts:185-189`），随后把 `manifest.id` 直接拼进路径：`${configDir}/plugins/${manifest.id}`（`updater.ts:244-246`）。`writeReleaseFilesToPluginFolder` 与 `getLocalVersion`（`updater.ts:281-284`）均无净化。若 Release 中 `manifest.json` 的 `id` 为 `../../任意路径`，写入路径会逃出 `.obsidian/plugins/`。
  - 影响：来自任意 GitHub 仓库的 Release 可向 Vault 内任意相对路径写入 `main.js`/`manifest.json`，构成路径穿越。
  - 修复方向：对 `manifest.id`/插件 id 做白名单净化（仅 `[A-Za-z0-9._-]`，禁止 `.`、`/`、`\`），写入前 `normalizePath` 后校验前缀必须是 plugins 目录；拒绝非法 id。

- [ ] **下载缺少内容完整性校验，且单文件失败导致半损坏目录** — `src/github.ts:169-171, 405-437`，`src/updater.ts:240-258`
  - 现象：全仓库无任何哈希/签名校验；写入侧直接把 `files.mainJs ?? ""`、`files.manifest ?? ""` 落盘（`updater.ts:253-254`）。当 `main.js` 非空但 `manifest` 为 `null` 时（`downloadReleaseFiles` 的 `files = {mainJs, manifest: null, ...}` 场景，`github.ts:429-433`），会把 `main.js` 与**空** `manifest.json` 写进已有插件目录。
  - 影响：无完整性校验易受中间人/镜像内容篡改；失败路径会产生 `manifest.json` 为空、插件无法加载或从列表消失的损坏目录。
  - 修复方向：写入前对 manifest 做 `JSON.parse` 校验（含 `id`/`version`/`main`）；内容不一致时先写临时目录再原子替换；记录并校验 `sha256`/`digest`（Release asset 的 `digest` 字段）。

- [ ] **`reloadPlugin` 无失败回滚，disable 失败被静默吞掉** — `src/updater.ts:260-273`
  - 现象：`loadManifests`、`loadPlugin`、`enablePluginAndSave` 均无 try/catch；`disablePlugin` 的异常被空 catch 吞掉（`updater.ts:263-265`），`loadPlugin?.` 的异常也被空 catch 吞掉（`updater.ts:269-271`）。文件已写盘、`manifest.version` 已变新，但插件可能停留在 disable 态或加载失败。
  - 影响：更新「成功」后插件实际未启用，用户看不到失败提示（Notice 仍报成功）。
  - 修复方向：`reloadPlugin` 捕获并向上抛出/上报错误，返回成功布尔；失败时回滚到更新前状态（备份旧文件）并明确提示。

- [ ] **请求缓存不区分布局/镜像/状态，可能返回过期或错误内容** — `src/github.ts:157-169, 200-201`
  - 现象：缓存 key 仅为 `options.url`，不包含 headers、镜像来源、是否虽 404 也缓存；任何 2xx 响应（含镜像返回的 HTML 错误页）都会被 `setCache` 缓存 5 分钟（`github.ts:210-212`）。
  - 影响：更新检查与手动更新可能拿到上一次的响应；镜像返回的伪 2xx HTML 被当作文件内容缓存并写入。
  - 修复方向：缓存 key 加入 GitHub Token 指纹与镜像标识；下载类请求禁用缓存或校验 `Content-Type`/文件结构。

- [ ] **镜像 fallback 不覆盖 Raw Tag 回退路径的错误处理与并发** — `src/github.ts:381-399`，`src/updater.ts:225-232`
  - 现象：`fetchRawFromTag` 的循环内 catch 静默 `continue`（`github.ts:396-397`），无法区分 404 与镜像故障；`updateAll` 为串行 for-await 无去重、无互斥，同一插件可被并发触发（如 UI 单个「更新」按钮 `plugins-tab.ts:99-110` 与「一键更新」`plugins-tab.ts:114-124` 同时触发）。另外 `writeReleaseFilesToPluginFolder` 是 public（`updater.ts:240`），多处入口（`plugins-tab.ts` 的 Toggle/安装）都能在监听器存续期内于重渲染后重复触发，`display()` 重渲染（`main.ts:200-237`）不会移除旧监听器。
  - 影响：并发写同一插件目录产生竞态；重渲染泄漏的监听器导致重复请求/重复弹窗。
  - 修复方向：为每个 pluginId 加 in-flight 互斥（Promise map）；区分可重试错误与永久错误；`display()` 重渲染前清理旧监听器/observer（见「低」档 DOM 条目）。

### 中

- [ ] **版本比较忽略预发布/构建元数据，且非法输入语义错误** — `src/github.ts:129-148`，`src/updater.ts:297-306`
  - 现象：`compareVersions` 用 `a.split('.')` 后 `parseInt`，`1.2.3-beta.1` → `[1,2,3,NaN→0,1]`，`1.2.3` → `[1,2,3]`，二者比较得 0，无法区分；`semverCoerce('1.2.3-beta.1')` 返回 `"1.2.3"`（`github.ts:145-147` 只抓前三段数字），预发布信息被丢弃。`isNewerVersion` 在两侧都能 coerce 时用数值比较，无法 coerce 时退化为 `local !== remote`（`updater.ts:305`），即版本号只差一个字符也会被判定为「有更新」。
  - 影响：预发布版本判断错误；`v1.2.3` 与 `1.2.3` 被 coerce 后相同尚可，但 `latest-1` 等非标准 tag 会持续误报更新。
  - 修复方向：实现完整 semver（含预发布优先级）或引入成熟比较库；`isNewerVersion` 的 fallback 分支改为保守（无法判定时不更新）。

- [ ] **镜像 URL 模板边界：对 `{prefix}`/`{encodedUrl}` 前缀模式解析不一致** — `src/github.ts:115-125`
  - 现象：前缀模式用 `proxy.replace(/\/+$/g, "")` 去掉尾部斜杠后直接拼接，若 `proxy` 本身已是完整 URL 模板（如以 `?url=` 结尾），会拼出非法 URL；`encodeURIComponent`（`github.ts:118`）不会编码 `.`/`-`/`_`/`~`，对 `api.github.com` 这类 URL 无影响，但对查询串类模板无保护；未处理镜像模板中同时含 `{url}` 与 `{encodedUrl}` 时 `{url}` 分支优先的歧义。另 `{prefix}` 占位符（`settings-tab.ts:100` 描述）在 `rewriteGithubUrl` 中根本没有对应替换分支。
  - 影响：部分镜像模板格式解析边界不正确；文档/UI 描述的 `{prefix}` 实际不被支持。
  - 修复方向：明确并统一模板契约（只支持 `{url}`/`{encodedUrl}`/前缀 3 种），移除或实现 `{prefix}`；增加 URL 合法性校验。

- [ ] **`XDF_PLUGINS` 与实际插件 id 是否一致需核对** — `src/settings.ts:39-46`，`src/main.ts:33-34`
  - 现象：`checkForUpdates`/`updatePlugin` 依赖 `XDF_PLUGINS[].id` 与本地 `configDir/plugins/<id>/manifest.json` 匹配（`updater.ts:281-284`）。`xdf-toolkits`/`xdf-aichatbot` 的仓库名（`...XDF-tookits`、`...XDF-AIchatbot`）与 id 命名规则不同，且表中 `xdf-base` 等 id 是否与各插件 `manifest.json` 的 `id` 一致无法从本仓库确证。
  - 影响：若 id 与各插件实际 manifest id 不一致，更新检查会把已安装插件误判为「未安装」并重复安装/覆盖。
  - 修复方向：在各插件仓库确认 `manifest.id`，或改为从远端 manifest 读取 id 后再与本地比对。[待确认]

- [ ] **更新后已启用状态保留存在缺口（未安装→安装路径）** — `src/updater.ts:114, 138, 260-268`
  - 现象：`updatePlugin` 在安装前用 `wasInstalled` 记录是否已装（`updater.ts:114`），对未安装的插件调用 `reloadPlugin(pluginId, true)`（`updater.ts:138`）强制启用。这意味着覆盖安装一个**用户主动禁用**的插件时，`forceEnable` 只在 `!wasInstalled` 时为真，禁用状态可保留，逻辑正确；但 `installFromRepo` 恒传 `forceEnable=true`（`updater.ts:196`），对已存在且被禁用的插件会强制启用，破坏用户选择。
  - 影响：通过「安装社区插件」覆盖一个已禁用插件会将其意外启用。
  - 修复方向：`installFromRepo` 先读取 `getInstallState`，已安装则沿用其 enabled/disabled 状态，仅未安装时才 forceEnable。

- [ ] **`compactMode` 仅在切换时生效，启动不应用；`showUngrouped` 完全未使用** — `src/tabs/settings-tab.ts:54-77`，`src/styles.css:319`，`src/sidebar-organizer.ts`
  - 现象：`.xdf-compact` 类只在 `onChange` 里 `document.body.classList.toggle`（`settings-tab.ts:63`），`onload`（`main.ts:25-65`）从不按 `settings.compactMode` 应用，因此重启后紧凑模式失效；`showUngrouped` 仅被写入与读取设置值（`settings.ts:29,121`、`settings-tab.ts:72-76`），`sidebar-organizer.ts` 中「其他插件」分组无条件生成（`sidebar-organizer.ts:117-122, 191-194`），开关无效。
  - 影响：两个设置项对用户表现为「无效」；紧凑模式状态不持久。
  - 修复方向：`onload` 与 `saveSettings` 中同步 body class；`showUngrouped` 接入 `organizeSidebar` 条件渲染。

- [ ] **`reloadPlugin` 与安装流程可能整体不可用（getPluginManager 可能为 undefined）** — `src/obsidian-internals.ts:25-27`，`src/updater.ts:261`
  - 现象：`getPluginManager` 直接返回 `(app as any).plugins`，若内部 API 变更或对象尚未就绪则为 `undefined`，调用 `plugins.enabledPlugins.has`（`updater.ts:262`）会抛 TypeError，而该异常不在 `reloadPlugin` 的处理范围内。
  - 影响：Obsidian 版本升级导致内部 API 变化时，更新/安装整体失败且错误信息不明确。
  - 修复方向：`getPluginManager` 增加存在性校验并抛出可读错误；`reloadPlugin`/`getInstallState` 捕获并降级。

### 低

- [ ] **`App` 的 `as any` 边界已被突破，绕过封装层** — `src/main.ts:162`，`src/obsidian-internals.ts:25-27`
  - 现象：`obsidian-internals.ts` 声称「唯一允许 `as any` 的地方」（PLAN.md L164），但 `main.ts:162` 直接用 `await this.loadData()`（未走封装）且各处 tabs 仍在用 `manifests[...] as any`（`plugins-tab.ts:37,171,283`、`tags-tab.ts:96`）访问内部 manifest。
  - 影响：类型安全边界被反复绕过，后续 API 变更难以集中修复。
  - 修复方向：统一封装 `loadData`/manifest 访问到 `obsidian-internals.ts`；tabs 只依赖封装后的类型。

- [ ] **DOM 选择器与接口脆弱，`activeTab` 类型与内部接口不一致** — `src/sidebar-organizer.ts:49,82,93,259-261`，`src/obsidian-internals.ts:46-54`
  - 现象：`.vertical-tab-header-group-items[data-section="community-plugins"]`、`.vertical-tab-nav-item`、`[data-setting-id]` 等选择器无版本适配；`createProxy` 的 `querySelector` 用 `data-setting-id="${settingId}"` 插值（`sidebar-organizer.ts:259-261`），若 id 含引号会破坏选择器。`SettingLike.activeTab?: unknown` 与内部实际类型不符。
  - 影响：Obsidian 更新时分组注入静默失效（`organizeSidebar` 找不到容器即 return，`sidebar-organizer.ts:84-87`）；偶发选择器注入问题。
  - 修复方向：集中维护选择器常量并加 `[待确认]` 版本适配；用 `CSS.escape` 处理属性值；收紧 `activeTab` 类型或移除。

- [ ] **`display()` 重渲染的监听器/observer 未清理，console 噪声** — `src/main.ts:200-237`，`src/sidebar-organizer.ts:43-53, 196-198`
  - 现象：`display()` 每次 `containerEl.empty()` 后重建，旧 DOM 上的 `addEventListener` 随之移除（内存本身不泄漏），但 `SidebarOrganizer` 的 MutationObserver 在 `enable()` 时 observe（`sidebar-organizer.ts:43-53`）并在回调里调用 `organizeSidebar`，而 `organizeSidebar` 自身写 DOM 又会触发 observer——虽有 `isOrganizing` 守卫与 `takeRecords`（`sidebar-organizer.ts:44,196-198`），频繁重渲染仍可能引起重复组织；`GitHubResponseError` 双层包装（`github.ts:39-45`）在 404 分支会产生嵌套错误信息，`grabReleaseFromRepository` 的 `catch` 与后续 `response.status === 404` 判断（`github.ts:271-277`）存在死分支。
  - 影响：轻微性能/日志噪声；错误信息可读性差。
  - 修复方向：`organizeSidebar` 用 `requestAnimationFrame`/debounce 合并；精简 `GitHubResponseError` 包装与不可达分支。

- [ ] **`updateInterval` 无限定时器与文档不一致** — `src/main.ts:137-145, 181-186`，`src/tabs/settings-tab.ts:23-37`
  - 现象：`updateInterval` 单位为分钟但客户端无上限校验（`settings-tab.ts:31-35` 仅要求 `>0`），极大值可设置超长定时器；`startUpdateTimer` 在 `saveSettings` 中每次都会重建 interval（`main.ts:181-186`），与 `onload` 中的 `setTimeout(10000)` 首次检查叠加，可能造成重复检查。
  - 影响：定时任务重复触发或行为与设置描述不符。
  - 修复方向：对 `updateInterval` 设上限（如 1–1440）；`startUpdateTimer` 幂等化（值未变则不重建）。

- [ ] **文档/实现细节需更正** — `PLAN.md:153`，`src/main.ts:200-237`
  - 现象：PLAN.md 称 `main.ts` 为 239 行，当前磁盘为 238 行（`GatewaySettingTab` 在此定义）；本次审查发现多处「已完成」项实为存疑（见 PLAN.md 追加小节）。
  - 影响：文档与代码漂移，误导后续维护。
  - 修复方向：同步文档行号与状态标注。
