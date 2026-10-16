# DEVLOG — XDF Gateway

> 变更时间线，**只追加不回改**。每条：日期 + 改了什么 + **为什么**。
> 面向"人肉可读的历史决策"；面向用户的 Release 说明由流水线自动生成，此处不重复。

---

## 2026-10-16 · 统一发布流水线 + 插件来源标记

- 新增 `.github/workflows/release.yml`：推送 `v*` tag 触发，校验 `package.json` / `manifest.json` / tag 三者版本一致后构建并发布，release notes 自动生成。新增 `versions.json` 记录版本兼容信息。对齐版本号并发布 v0.4.0。
- 新增 `GatewaySettings.pluginSources` 字段（`store` / `github`）：`installFromRepo` 安装后自动标记来源；分组列表对 GitHub 来源插件显示「GitHub」小标签；新增「第三方插件」固定分组，不受跨分组去重限制。
- `PENDING` 补充「代码审查整改计划（2026-10-04）」。
- **为什么**：统一发布口径，避免手搓 Release 与版本不一致；区分「官方商店」与「GitHub 安装」两种来源，补齐第三方插件管理闭环。

## 2026-09-09 · v0.3.0 安装任意插件 + 分组管理

- **从 GitHub 安装任意插件**：`installFromRepo(repo)` 支持 `owner/repo` / 完整 URL / `.git` 后缀，走与 XDF 套件相同的镜像 fallback 链路。
- **分组管理 UI**：新增 `group-editor.ts` Modal —— 分组改名 / 关键词 / 上下移 / 删除（预设不可删）/ 新建 / 重置默认；`settings.customGroups` 覆盖 `DEFAULT_GROUPS`。
- **插件版本号显示**：XDF 套件列表补版本号渲染（`m?.version` 兜底未安装）。
- **FIX-PLUGINS：插件状态管理修复**（4 个问题，均已并入本节）：
  - ①「检查更新」永远提示"所有插件均为最新"：`/releases/latest` 返回单对象却被按数组解析 → `releases` 恒为 `[]`；改为单对象也包装成数组。
  - ② 未安装插件被静默跳过：`checkSinglePluginUpdate` 未安装返回 `null`，与"已是最新"无法区分；新增 `PluginInstallState`，未安装返回 `currentVersion: null`，UI 置灰开关 + 「安装」按钮。
  - ③ 安装后不热加载、必须重启：`reloadPlugin` 缺 `loadManifests()` 且用 `enablePlugin`（不持久化）；改为 disable（容错）→ `loadManifests()` → `enablePluginAndSave()`。
  - ④ 开关点击必报错：`(app as any).plugins?.plugins` 取到了插件实例 Map（无 `enablePlugin` 方法）而非 `PluginManager` 本体；改用 `PluginManager` 并调用 `enablePluginAndSave` / `disablePluginAndSave`。
- **为什么**：v0.2.0 的更新/安装链路 4 个致命 bug 导致核心功能整体不工作；本版修复后成为可用版本。

## 2026-09-08 · v0.2.0 + 后续计划

- 版本升至 v0.2.0，补充 `PENDING.md` 后续实现计划。
- 安装社区插件位置调整：输入框从「XDF 套件」与「一键更新」之间移到「插件分组」下方，避免被误认为 XDF 套件的一部分。
- 确认安装走代理：`installFromRepo` 复用 `grabReleaseFromRepository`，与 XDF 更新共用 `gitHubRequest`，镜像 fallback 自动生效。
- **为什么**：功能边界在 UI 上更清晰；确认第三方安装与套件更新走同一条网络链路。

## 2026-09-08 · 代码重构：消除死代码和上帝文件

- 删除 `grouping.ts`（568 行死代码，与 `sidebar-organizer.ts` 功能重叠）。
- 新建 `obsidian-internals.ts`，统一封装内部 API（`getPluginManager` / `getSetting` / `getSettingDoc`），集中 `as any`。
- 提取三个 Tab 到 `tabs/plugins-tab.ts` / `tabs/tags-tab.ts` / `tabs/settings-tab.ts`；`main.ts` 从 679 行精简到 238 行。
- 修复 `runUpdateCheck` 缺 `refreshSettingTab()`；`GatewaySettingTab` 构造器 `app` 参数改用 `App` 类型。
- **为什么**：上帝文件 + 死代码使维护困难；内部 API 断言散落各处，Obsidian 升级时难以集中修复。

## 2026-09-05 · 修复与重构（v0.1.x）

- 重写 GitHub 代理逻辑 + 添加进度通知。
- 修复镜像站 fallback 逻辑 + 增加 GitHub Token 配置。
- 修复插件跨分组重复显示问题；修复插件安装状态管理和开关逻辑。
- 抽取 Tab 渲染、消除死代码和上帝文件的前置重构。
- **为什么**：首发版本存在镜像降级失效、跨分组重复、状态管理混乱等问题。

## 2026-09-04 · v0.1.0 首发

- **核心功能**：XDF 套件插件一键检查/更新；镜像站 fallback（内置 4 个镜像）；设置页分组渲染（DOM 折叠）；插件启用/禁用（iOS 风格 Toggle）；标签系统（预设 4 个功能标签）。
- **UI**：Banner 导航（插件管理 / 标签管理 / 高级设置）；置顶插件左侧指示条；分组折叠动画；XDF 教学套件分组特殊高亮。
- **预设**：分组（XDF 教学套件 / 编辑器与文件 / 外观与样式 / 其他插件）；标签（日历 / AI / 编辑器 / 工具）；镜像站（gh-proxy.com / ghproxy.net / gh.llkk.cc / ghfast.top）。
- **技术**：基于 BRAT 的 GitHub API 通信层改造；借鉴 obsidian-manager 的 Install Hub 两级回退下载；借鉴 settings-sidebar-organizer 的 proxy button 机制；使用 Obsidian 内部 API 实现插件启用/禁用。
- **为什么**：为新东方教师 Vault 提供统一的插件管理中枢。

---

## 设计决策备忘

- **上游蓝本**：BRAT（通信/更新引擎）、obsidian-manager / BPM（通用管理 UI、两级回退下载、代理模板）、settings-sidebar-organizer（设置页 DOM 分组）。
- **不照搬 BPM 5700 行**：只取所需能力，自建 Banner 导航 + 三 Tab。
- **设置页分组用 DOM hack**：Obsidian 无插件列表分组公开 API，故 monkey-patch `setting.onOpen` + MutationObserver + proxy item；代价是选择器随版本变化。
- **安装社区插件走与套件更新同一链路**：所有 GitHub 请求经 `gitHubRequest`，镜像 fallback 自动生效。
- **UI 标准模板**：Gateway 的设置页（Banner / Footer / 高级设置折叠区 / 通用按钮输入框）是各 XDF 插件 UI 改造的参考基准。
