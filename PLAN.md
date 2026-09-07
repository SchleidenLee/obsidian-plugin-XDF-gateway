# XDF Gateway 项目计划

> 最后更新：2026-09-08
> 当前阶段：P3 缺口补全

## 定位

XDF 插件管理中枢。为新东方教师 Vault 提供：
1. XDF 套件自动更新（镜像站 fallback）
2. 设置页面插件分组渲染
3. 通用插件管理（安装/更新/分组/延迟加载）

---

## 代码审查结论

### BRAT（插件更新引擎）

**已复用的模块**：
- `gitHubRequest` + `GHRateLimitError` + `GitHubResponseError` — GitHub API 通信基础设施
- `grabReleaseFromRepository` — 获取最新 Release 元数据
- `grabReleaseFileFromRepository` — 下载 Release 文件
- `writeReleaseFilesToPluginFolder` — 文件写入逻辑
- `reloadPlugin` — 插件热重载（已改为 `disablePlugin` + `loadManifests` + `enablePluginAndSave`）
- semver 版本比较模式（`semverCoerce` + `compareVersions`）

**自行实现的**：
- 镜像站 URL 重写层（3 种模板格式 + 多镜像 fallback）
- 预设插件列表（XDF_PLUGINS 数组）
- 精简 UI（Banner 导航 + 三个 Tab）

### obsidian-manager / BPM（通用管理 UI）

**已借鉴的**：
- 两级回退下载（Assets → Raw Tag）
- 代理 URL 模板（`{url}` / `{encodedUrl}` / 前缀）
- `enablePluginAndSave` / `disablePluginAndSave` 持久化状态

**未实现的**：
- 延迟加载机制
- Ribbon 排序
- 冲突诊断

### settings-sidebar-organizer（设置页分组渲染）

**已实现的**：
- monkey-patch `app.setting.onOpen/onClose`
- `MutationObserver` 监听侧边栏 DOM
- Proxy button 机制 + `<details>` 分组容器
- 关键词自动匹配

---

## 技术决策

### 1. 镜像站 URL 重写策略 ✅ 已实现

在 `gitHubRequest` 层全局拦截，支持 3 种模板格式 + 多镜像 fallback。

### 2. 设置页分组渲染 ✅ 已实现

`sidebar-organizer.ts` 类封装，预设 4 个分组（XDF 教学套件 / 编辑器与文件 / 外观与样式 / 其他插件）。

### 3. 插件管理 UI ✅ 已实现

Banner 导航 + 三个 Tab（插件管理 / 标签管理 / 高级设置），不照搬 BPM 的 5700 行。

### 4. 文件下载策略 ✅ 已实现

BRAT + BPM 混合：Release Assets → Raw Tag 回退，所有请求走镜像站 fallback。

---

## 功能模块与里程碑

### P0: 基础架构 ✅ 已完成

- [x] 项目脚手架（manifest.json、tsconfig、esbuild）
- [x] 从 BRAT 提取 `gitHubRequest` + 错误类 + `Release` 类型
- [x] 实现镜像站 URL 重写层（`gitHubRequest` 内拦截）
- [x] 从 BRAT 提取 `grabReleaseFromRepository` + `grabReleaseFileFromRepository`
- [x] 从 BRAT 提取 `writeReleaseFilesToPluginFolder` + `reloadPlugin`
- [x] 内置 XDF 6 插件预设列表

### P1: 插件更新引擎 ✅ 已完成

- [x] 版本比较逻辑（semver coerce + compare + fallback）
- [x] 启动时自动检查更新（遍历预设列表，对比本地 version）
- [x] 手动一键更新按钮（Ribbon 图标 + 命令）
- [x] 更新通知（Notice + 区分安装/更新文案）
- [x] 两级回退下载策略（Assets → Raw Tag）
- [x] 插件安装状态管理（not_installed / disabled / enabled）
- [x] 安装后热加载（loadManifests + enablePluginAndSave）
- [x] 开关状态持久化（enablePluginAndSave / disablePluginAndSave）

### P2: 设置页分组渲染 ✅ 已完成

- [x] 从 settings-sidebar-organizer 提取 DOM 操作核心逻辑
- [x] 预设分组定义（XDF 教学套件 / 编辑器与文件 / 外观与样式 / 其他插件）
- [x] 关键词自动匹配（预设关键词 → 预设分组）
- [x] Proxy button 机制（隐藏原始项 + 注入分组容器）
- [x] 紧凑模式（折叠 Core/Community 标题）
- [ ] 手动拖拽排序（Pointer Events API）— 暂缓
- [ ] 插件别名（重命名显示）— 暂缓

### P3: 通用插件管理 [~] 部分完成

- [ ] **从 GitHub 安装任意插件**（输入 `owner/repo`）— 核心缺口
- [ ] 延迟加载机制（setTimeout + enablePlugin）
- [ ] Ribbon 排序（CSS order + DOM 重排）
- [ ] 批量启用/禁用
- [x] 插件标签系统（基础框架已有：标签管理 Tab）
- [ ] 冲突诊断（可选）

#### P3 缺口详情

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 从 GitHub 链接安装插件 | P0 | 用户输入 `owner/repo`，走镜像站下载并安装 |
| 延迟加载 | P2 | 错峰启动，避免所有插件同时加载卡顿 |
| Ribbon 排序 | P3 | 桌面端 CSS order，移动端 DOM 重排 |
| 批量启用/禁用 | P2 | 一键开关多个插件 |

### P4: 集成测试 + 打包 [ ] 未开始

- [ ] 6 个 XDF 插件 + Gateway 集成测试
- [ ] 预设配置（community-plugins.json 预启用所有插件）
- [ ] 打包为可交付的 vault 文件夹
- [ ] 编写安装/使用说明

### P5: 插件商店代理 [ ] 新增

> 让无法科学上网的老师也能用 Obsidian 原生插件商店

- [ ] 预装 Market Proxy（`haierkeys/obsidian-market-proxy`）
  - 轻量代理插件，劫持 GitHub 请求转发到内置代理
  - 支持自定义备用代理地址
- [ ] 或预装 China Speedup（`notesynchelper/china-speedup`）
  - 自带加速版插件商店 UI
  - 依赖作者维护的 relay 节点
- [ ] 在 `community-plugins.json` 中预启用
- [ ] 验证代理插件与 Gateway 共存无冲突

---

## 代码重构记录

### 2026-09-08: 消除死代码和上帝文件

- 删除 `grouping.ts`（568 行死代码，与 `sidebar-organizer.ts` 功能重叠）
- 创建 `obsidian-internals.ts` 统一封装内部 API 访问（`getPluginManager` / `getSetting` / `getSettingDoc`）
- 提取三个 Tab 渲染方法到独立文件（`tabs/plugins-tab.ts` / `tabs/tags-tab.ts` / `tabs/settings-tab.ts`）
- `main.ts` 从 679 行精简到 239 行
- 消除散落的 `(app as any)` 类型断言，集中到 `obsidian-internals.ts`
- 修复 `runUpdateCheck` 缺 `refreshSettingTab()` 的 bug
- `GatewaySettingTab` 构造器 `app` 参数改用 `App` 类型替代 `any`

### 当前文件结构

```
src/
├── github.ts              # GitHub API 通信层（镜像站 fallback）
├── main.ts                # Plugin 类 + SettingTab 路由（239 行）
├── obsidian-internals.ts  # 内部 API 封装（唯一允许 as any 的地方）
├── settings.ts            # 配置管理 + 预设数据
├── sidebar-organizer.ts   # 侧边栏分组（DOM Hack）
├── styles.css             # 样式
├── types.ts               # 类型定义
├── updater.ts             # 插件更新引擎
└── tabs/
    ├── plugins-tab.ts     # 插件管理 Tab
    ├── tags-tab.ts        # 标签管理 Tab
    └── settings-tab.ts    # 高级设置 Tab
```

---

## 预估代码量（实际 vs 预估）

| 模块 | 预估行数 | 实际行数 | 状态 |
|------|----------|----------|------|
| 基础架构 + 镜像层 | ~300 | ~440 (github.ts) | ✅ 完成 |
| 更新引擎 | ~400 | ~260 (updater.ts) | ✅ 完成 |
| 设置页分组 | ~800 | ~290 (sidebar-organizer.ts) | ✅ 完成 |
| 通用管理 UI | ~1000 | ~470 (tabs/ 3 文件) | [~] 部分完成 |
| 样式 | ~500 | ~350 (styles.css) | ✅ 完成 |
| 内部 API 封装 | — | ~80 (obsidian-internals.ts) | ✅ 新增 |
| **合计** | **~3000** | **~1890** | |

---

## 风险与应对

| 风险 | 状态 | 应对 |
|------|------|------|
| Obsidian 更新导致 DOM 选择器失效 | 已知 | 设置页 DOM 相对稳定；做好版本适配层 |
| 镜像站全部不可用 | 已知 | 保留直连 GitHub 作为最后 fallback |
| 私有仓库（tookits/AIchatbot）无法走镜像 | 已知 | 改为公开仓库，或把 Release 文件放到公开位置 |
| 代理插件代理地址失效 | 新增 | 预装时填多个备用代理；关注插件更新 |
| 代理插件与 Gateway 冲突 | 新增 | 测试共存；Gateway 只管理 XDF 插件，代理插件只代理商店请求 |

---

## 命名规范

- 仓库：`obsidian-plugin-XDF-gateway`
- 插件 ID：`xdf-gateway`
- 显示名称：`XDF Gateway`
- 文件夹：`obsidian-plugin-XDF-gateway`
