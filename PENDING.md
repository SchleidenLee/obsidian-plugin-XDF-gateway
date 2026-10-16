# PENDING — XDF Gateway

> 待办清单。分区：**⚪ 待定**（方案未定）/ **🟡 已定待做**（方案已定，等动手）/ **🟢 进行中**。
> 完成一项后：从本文件**删除**该条 → 在 [DEVLOG.md](./DEVLOG.md) 追加一行 → 现状变了就更新 [ARCHITECTURE.md](./ARCHITECTURE.md)。

> 注：下方「代码审查整改」的行号基准为 **2026-10-04** 的源码快照，动手时以实际代码为准。
> 2026-10-04 审查中已修复的项（`throw:false`、`/releases/latest` 单对象解析、404/403 处理、`getInstallState` 未安装识别、`reloadPlugin` 的 `loadManifests` 热加载、`PluginManager` 对象修正）已迁入 [DEVLOG.md](./DEVLOG.md)，不再列入本文件。

---

## 🟢 进行中

（无）

---

## 🟡 已定待做

### A. 代码审查整改（严重）

- [ ] **镜像模板 `{url}` 拼出非法 URL，且 `proxyTemplate` 从未被消费；`{prefix}` 无实现分支** — `src/github.ts`（`rewriteGithubUrl`）、`src/settings.ts`（`proxyTemplate`）、`src/tabs/settings-tab.ts`
  - 现象：`settings.proxyTemplate`（默认 `{prefix}{url}`）全仓库仅设置页与 `settings.ts` 引用，`gitHubRequest` 从不读取；镜像实际由 `mirrors` 列表经 `rewriteGithubUrl` 处理。默认把 `{url}` 直接替换为**未编码**原始 URL，`requestUrl` 会把 `https://gh-proxy.com/https://api.github.com/...` 拆成协议 + 主机 + 路径，而 `gh-proxy.com` 实为 curl 风格（期望 `/https://github.com/...`）。设置页把 `{prefix}` 描述为镜像前缀，但 `rewriteGithubUrl` 没有对应替换分支。
  - 影响：镜像 fallback 很可能整体失效或返回错误页面，与「自动 fallback」宣称不符；UI 描述的 `{prefix}` 不被支持。
  - 方案：明确并统一模板契约（只支持 `{url}` / `{encodedUrl}` / 前缀三种），移除或实现 `{prefix}`，默认模板改 `{encodedUrl}` 风格并让 `gitHubRequest` 真正消费 `proxyTemplate`；增加 URL 合法性校验与一组镜像连通性测试。

- [ ] **镜像重写后不校验最终 host（SSRF 面），Token 被带到镜像 host** — `src/github.ts`（`rewriteGithubUrl` / `gitHubRequest`）
  - 现象：镜像列表来自用户可编辑的设置文本域，重写只判断入参是否为 GitHub 域名，对产出 URL 无 host 白名单校验；最终 host 完全由镜像配置决定，而 `Authorization: token ...` 头会一并带到重写后的 host。
  - 影响：任意镜像可将请求指向任意主机（SSRF），或在非 GitHub 主机上接收用户 GitHub Token。
  - 方案：对重写后的最终 URL 做 host 白名单 / 协议校验；Token 只发给 `github.com` 官方 host，镜像请求剥离 `Authorization`。

### A. 代码审查整改（高）

- [ ] **安装流程缺 `manifest.id` 净化，可路径穿越写任意目录** — `src/updater.ts`（`installFromRepo` / `writeReleaseFilesToPluginFolder` / `getLocalVersion`）
  - 现象：`installFromRepo` 仅校验 `!manifest.id` 是否存在，随后把 `manifest.id` 直接拼进 `${configDir}/plugins/${manifest.id}`；写入侧与读取侧均无净化。若 Release 的 `manifest.json` 中 `id` 为 `../../任意路径`，写入路径会逃出 `.obsidian/plugins/`。
  - 影响：来自任意 GitHub 仓库的 Release 可向 Vault 内任意相对路径写 `main.js` / `manifest.json`。
  - 方案：对 `manifest.id` / 插件 id 做白名单净化（仅 `[A-Za-z0-9._-]`，禁止 `.`、`/`、`\`）；`normalizePath` 后校验前缀必须是 plugins 目录；拒绝非法 id。

- [ ] **下载无内容完整性校验，单文件失败写坏目录** — `src/github.ts`（`downloadReleaseFiles`）、`src/updater.ts`（`writeReleaseFilesToPluginFolder`）
  - 现象：全仓库无哈希/签名校验；写入侧直接把 `files.mainJs ?? ""`、`files.manifest ?? ""` 落盘。当 `main.js` 非空而 `manifest` 为 `null` 时，会把 `main.js` 与**空** `manifest.json` 写进已有插件目录。
  - 影响：易受中间人/镜像内容篡改；失败路径产生 `manifest.json` 为空、插件无法加载或从列表消失的损坏目录。
  - 方案：写入前对 manifest 做 `JSON.parse` 校验（含 `id`/`version`/`main`）；内容不一致时先写临时目录再原子替换；记录并校验 `sha256` / asset `digest`。

- [ ] **`reloadPlugin` 无失败回滚，disable/load 异常被静默吞掉** — `src/updater.ts`（`reloadPlugin`）
  - 现象：`loadManifests` / `loadPlugin` / `enablePluginAndSave` 无 try/catch；`disablePlugin` 与 `loadPlugin` 的异常被空 catch 吞掉。文件已写盘、`manifest.version` 已变新，但插件可能停留在 disable 态或加载失败。
  - 影响：更新"成功"后插件实际未启用，用户看不到失败提示（Notice 仍报成功）。
  - 方案：`reloadPlugin` 捕获并向上抛出/上报错误，返回成功布尔；失败时回滚到更新前状态（备份旧文件）并明确提示。

- [ ] **请求缓存不区分布局/镜像/状态** — `src/github.ts`（缓存层）
  - 现象：缓存 key 仅 `options.url`，不含 headers、镜像来源、是否 404；任何 2xx 响应（含镜像返回的 HTML 错误页）都会被缓存 5 分钟。
  - 影响：更新检查与手动更新可能拿到上一次的响应；镜像返回的伪 2xx HTML 被当作文件内容缓存并写入。
  - 方案：缓存 key 加入 GitHub Token 指纹与镜像标识；下载类请求禁用缓存或校验 `Content-Type` / 文件结构。

- [ ] **镜像 fallback 未覆盖 Raw Tag 路径的错误处理，且无并发互斥** — `src/github.ts`（`fetchRawFromTag`）、`src/updater.ts`（`updateAll` / `writeReleaseFilesToPluginFolder`）
  - 现象：`fetchRawFromTag` 循环内 catch 静默 `continue`，无法区分 404 与镜像故障；`updateAll` 串行 for-await 无去重、无互斥，同一插件可被并发触发（UI 单个「更新」与「一键更新」）；`writeReleaseFilesToPluginFolder` 为 public，重渲染后旧监听器存续可重复触发。
  - 影响：并发写同一插件目录产生竞态；重渲染泄漏的监听器导致重复请求/重复弹窗。
  - 方案：为每个 pluginId 加 in-flight 互斥（Promise map）；区分可重试错误与永久错误；`display()` 重渲染前清理旧监听器/observer（见「低」档 DOM 条目）。

### A. 代码审查整改（中）

- [ ] **版本比较忽略预发布/构建元数据，非法输入语义错误** — `src/github.ts`（`semverCoerce` / `compareVersions`）、`src/updater.ts`（`isNewerVersion`）
  - 现象：`compareVersions` 用 `split('.')` + `parseInt`，`1.2.3-beta.1` 与 `1.2.3` 比较得 0；`semverCoerce` 丢弃预发布信息；`isNewerVersion` 无法 coerce 时退化为 `local !== remote`，差一个字符即判"有更新"。
  - 影响：预发布判断错误；`latest-1` 等非标准 tag 持续误报更新。
  - 方案：实现完整 semver（含预发布优先级）或引入成熟比较库；fallback 分支改保守（无法判定时不更新）。

- [ ] **`XDF_PLUGINS` 与实际插件 id 是否一致待核对 [待确认]** — `src/settings.ts`（`XDF_PLUGINS`）
  - 现象：`checkForUpdates` / `updatePlugin` 依赖 `XDF_PLUGINS[].id` 与本地 `configDir/plugins/<id>/manifest.json` 匹配；仓库命名规则（`...XDF-tookits`、`...XDF-AIchatbot`）与 id 命名不同，id 是否与各插件 `manifest.json` 一致无法从本仓库确证。
  - 影响：若不一致，更新检查会把已装插件误判为「未安装」并重复覆盖。
  - 方案：在各插件仓库确认 `manifest.id`，或改为从远端 manifest 读取 id 后再与本地比对。

- [ ] **`installFromRepo` 恒 `forceEnable=true`，覆盖已禁用插件会意外启用** — `src/updater.ts`（`installFromRepo`）
  - 现象：`installFromRepo` 恒传 `forceEnable=true`，对已存在且被禁用的插件会强制启用，破坏用户选择（`updatePlugin` 的 `wasInstalled` 判断逻辑本身正确）。
  - 影响：通过「安装社区插件」覆盖一个已禁用插件会将其意外启用。
  - 方案：`installFromRepo` 先读 `getInstallState`，已安装则沿用其 enabled/disabled 状态，仅未安装时才 forceEnable。

- [ ] **`compactMode` 启动不生效；`showUngrouped` 完全未使用** — `src/tabs/settings-tab.ts`、`src/main.ts`（`onload`）、`src/sidebar-organizer.ts`
  - 现象：`.xdf-compact` 类只在 `onChange` 里 toggle，`onload` 从不按 `settings.compactMode` 应用，重启后失效；`showUngrouped` 只被读写设置值，`sidebar-organizer` 中「其他插件」分组无条件生成，开关无效。
  - 影响：两个设置项对用户表现为「无效」；紧凑模式状态不持久。
  - 方案：`onload` 与 `saveSettings` 中同步 body class；`showUngrouped` 接入 `organizeSidebar` 条件渲染。

- [ ] **`getPluginManager` 可能为 `undefined`，更新/安装整体失败** — `src/obsidian-internals.ts`（`getPluginManager`）、`src/updater.ts`
  - 现象：`getPluginManager` 直接返回 `(app as any).plugins`，内部 API 变更或对象未就绪时为 `undefined`，调用 `plugins.enabledPlugins.has` 抛 TypeError，且不在 `reloadPlugin` 处理范围内。
  - 影响：Obsidian 升级导致内部 API 变化时，更新/安装整体失败且错误信息不明确。
  - 方案：`getPluginManager` 增加存在性校验并抛可读错误；`reloadPlugin` / `getInstallState` 捕获并降级。

### A. 代码审查整改（低）

- [ ] **`as any` 边界被突破，绕过封装层** — `src/main.ts`（`loadData`）、`src/tabs/*`（`manifests[...] as any`）
  - 方案：统一封装 `loadData` / manifest 访问到 `obsidian-internals.ts`，tabs 只依赖封装后的类型。
- [ ] **DOM 选择器脆弱，`activeTab` 类型与内部接口不一致** — `src/sidebar-organizer.ts`、`src/obsidian-internals.ts`
  - 方案：集中维护选择器常量并加版本适配标注；属性值用 `CSS.escape`；收紧或移除 `activeTab` 类型。
- [ ] **`display()` 重渲染的 observer 未节流，console 噪声** — `src/main.ts`、`src/sidebar-organizer.ts`
  - 方案：`organizeSidebar` 用 `requestAnimationFrame` / debounce 合并；精简 `GitHubResponseError` 包装与不可达分支。
- [ ] **`updateInterval` 无上限，定时器可能重复触发** — `src/main.ts`（`startUpdateTimer`）、`src/tabs/settings-tab.ts`
  - 现象：客户端仅要求 `>0`，极大值可设超长定时器；`startUpdateTimer` 每次 `saveSettings` 都重建 interval，与 `onload` 的首次检查叠加可能重复检查。
  - 方案：对 `updateInterval` 设上限（如 1–1440）；`startUpdateTimer` 幂等化（值未变不重建）。

### B. 分组管理 UI 增强

- [ ] **插件级拖拽排序**：分组内插件支持拖拽调整顺序（Pointer Events API，不引第三方库）。
- [ ] **插件别名（重命名显示）**：允许用户为插件自定义显示名。
- 改动文件：`src/tabs/plugins-tab.ts`、`src/tabs/group-editor.ts`、`src/settings.ts`。

### C. 待做功能总览

| # | 功能 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | 内置商店代理插件 | P1 | 让老师访问 Obsidian 原生插件商店：预装 Market Proxy 或 China Speedup，`community-plugins.json` 预启用，验证与 Gateway 共存 |
| 2 | 打包交付脚本 | P2 | 预设 `community-plugins.json` + `build-vault.ps1` 输出可交付 vault 文件夹 + 安装说明（产品完成后） |
| 3 | Ribbon 排序 | P3 | 桌面端 CSS `order`，移动端 DOM 重排（老师群体优先级最低） |
| 4 | 统一设计语言（共享 CSS 库） | P1 | 根 `shared/` 下 `xdf-design-tokens.css` + `xdf-common-styles.css`，各插件构建时注入；见 [ARCHITECTURE.md](./ARCHITECTURE.md) —— Gateway 已是标准模板，无需改造 |

> 统一设计语言进度：Gateway ✅ 已达标（标准模板）｜Toolkits / ClassTracker / Feedback Assistant / Base / AI Chat 📋 待改造。

---

## ⚪ 待定

- [ ] **冲突诊断**：提示插件间潜在冲突（方案未定，可选）。
- 已取消：~~延迟加载机制~~（插件数量少，不需要）、~~批量启用/禁用~~。

---

## 风险备忘（暂不处理）

- `gitHubRequest` 会把 GitHub Token 发给镜像站（第三方可见）。BPM 同样如此。后续可考虑仅直连带 Token —— 与 A 档 SSRF 条目合并处理。
- Obsidian 更新导致设置页 DOM 选择器失效：设置页 DOM 相对稳定，做好版本适配层。
- 私有仓库（tookits / AIchatbot）无法走镜像：改为公开仓库，或把 Release 文件放到公开位置。
