# XDF Gateway 项目计划

## 定位

XDF 插件管理中枢。为新东方教师 Vault 提供：
1. XDF 套件自动更新（镜像站 fallback）
2. 设置页面插件分组渲染
3. 通用插件管理（安装/更新/分组/延迟加载）

---

## 代码审查结论

### BRAT（插件更新引擎）

**可直接复用的模块**：
- `gitHubRequest` + `GHRateLimitError` + `GitHubResponseError` — GitHub API 通信基础设施，零改造复用
- `grabReleaseFromRepository` — 获取最新 Release 元数据
- `grabReleaseFileFromRepository` — 下载 Release 文件（需改为走 `gitHubRequest` 统一错误处理）
- `writeReleaseFilesToPluginFolder` — 文件写入逻辑（`vault.adapter` API）
- `reloadPlugin` — 插件热重载（`disablePlugin` + `enablePlugin`）
- semver 版本比较模式（`semverCoerce` + `compareVersions` + fallback 到日期/字符串）

**需要自行实现的**：
- 镜像站 URL 重写层（BRAT 无此功能）
- 预设插件列表（BRAT 是用户手动添加）
- 精简 UI（BRAT 有完整的设置页和弹窗）

### obsidian-manager / BPM（通用管理 UI）

**值得借鉴的**：
- **Install Hub 两级回退**：Release Assets → Raw Tag 源码（含 v 前缀候选），比 BRAT 更健壮
- **代理支持**：`GITHUB_PROXY` 配置 + `{url}` / `{encodedUrl}` / 前缀三种模板 — 可直接用于镜像站
- **延迟加载**：`setTimeout` + `enablePlugin()` 实现错峰启动，配合自检接管机制
- **Ribbon 排序**：桌面端用 CSS `order`（非侵入式），移动端用 DOM 重排
- **冲突诊断**：二分法 + 跨分区冲突对检测，支持状态持久化

**不建议照搬的**：
- 整个 Plugin View UI（约 5700 行，太重）
- 分组作为卡片标签而非折叠文件夹（和我们的需求不同）
- Transfer Pack（库间迁移，当前不需要）

### settings-sidebar-organizer（设置页分组渲染）

**核心机制**：
- 通过 monkey-patch `app.setting.onOpen/onClose` 拦截设置页生命周期
- 用 `MutationObserver` 监听侧边栏 DOM 变化
- 隐藏原始 `.vertical-tab-nav-item`，注入 `<details>` 分组容器和 proxy 按钮
- Proxy 按钮复用原生 CSS class（`.vertical-tab-nav-item`），点击时转发到被隐藏的原始元素
- 关键词匹配：逗号分隔 + `!` 排除 + `"` 精确匹配短语

**稳定性风险（高）**：
- 深度依赖 Obsidian 内部 CSS class（`.vertical-tab-nav-item`、`.vertical-tab-header-group-items` 等）
- 依赖 `app.setting` 内部属性（`tabHeadersEl`、`modalEl` 等）
- monkey-patch `setting.onOpen/onClose`
- Obsidian 1.13 弹出窗口兼容已增加大量复杂度

**核心代码量**：约 2600 行（单文件 main.js），其中核心逻辑约 940 行

---

## 技术决策

### 1. 镜像站 URL 重写策略

**方案**：在 `gitHubRequest` 层做全局拦截，而非逐函数替换。

```ts
const MIRRORS = [
  'https://gh-proxy.com/',
  'https://ghproxy.net/',
  'https://gh.llkk.cc/',
  'https://ghfast.top/',
];

// 在 gitHubRequest 中，如果请求 URL 是 github.com 或 raw.githubusercontent.com
// 自动拼接镜像前缀，第一个失败自动试下一个
```

**理由**：BRAT 的所有 GitHub 请求都经过 `gitHubRequest`，在这里做拦截最干净，不需要改动调用方。

### 2. 设置页分组渲染

**方案**：借鉴 settings-sidebar-organizer 的 proxy button 机制，但做以下改进：
- 预设分组（XDF 教学套件 / 编辑器增强 / 日历与排班 / 其他），不需要用户配置
- 关键词自动匹配预设到分组
- 保留手动拖拽排序和别名功能
- 接受 DOM Hack 的稳定性风险（Obsidian 设置页 DOM 相对稳定）

### 3. 插件管理 UI

**方案**：不照搬 BPM 的 5700 行 Plugin View，而是：
- 复用 BPM 的 Install Hub 逻辑（从 GitHub 安装插件）
- 复用 BPM 的延迟加载机制
- 复用 BPM 的 Ribbon 排序
- 冲突诊断作为可选功能，P3 阶段再考虑

### 4. 文件下载策略

**方案**：BRAT + BPM 混合
- 优先从 Release Assets 下载（BRAT 方式）
- 失败回退到 Raw Tag 源码（BPM 方式，含 v 前缀候选）
- 所有请求走镜像站 fallback

---

## 功能模块与里程碑

### P0: 基础架构（1-2 天）

- [ ] 项目脚手架（manifest.json、tsconfig、esbuild）
- [ ] 从 BRAT 提取 `gitHubRequest` + 错误类 + `Release` 类型
- [ ] 实现镜像站 URL 重写层（`gitHubRequest` 内拦截）
- [ ] 从 BRAT 提取 `grabReleaseFromRepository` + `grabReleaseFileFromRepository`
- [ ] 从 BRAT 提取 `writeReleaseFilesToPluginFolder` + `reloadPlugin`
- [ ] 内置 XDF 5 插件预设列表

### P1: 插件更新引擎（2-3 天）

- [ ] 版本比较逻辑（semver coerce + compare + fallback）
- [ ] 启动时自动检查更新（遍历预设列表，对比本地 version）
- [ ] 手动一键更新按钮（Ribbon 图标 + 命令）
- [ ] 更新通知（Notice + 可选的更新日志展示）
- [ ] 从 BPM 借鉴两级回退下载策略（Assets → Raw Tag）

### P2: 设置页分组渲染（2-3 天）

- [ ] 从 settings-sidebar-organizer 提取 DOM 操作核心逻辑
- [ ] 预设分组定义（XDF 教学套件 / 编辑器增强 / 日历与排班 / 其他）
- [ ] 关键词自动匹配（预设关键词 → 预设分组）
- [ ] Proxy button 机制（隐藏原始项 + 注入分组容器）
- [ ] 手动拖拽排序（Pointer Events API）
- [ ] 插件别名（重命名显示）
- [ ] 紧凑模式（折叠 Core/Community 标题）

### P3: 通用插件管理（3-4 天）

- [ ] 从 BPM 提取 Install Hub（从 GitHub 安装任意插件）
- [ ] 从 BPM 提取延迟加载机制（setTimeout + enablePlugin）
- [ ] 从 BPM 提取 Ribbon 排序（CSS order + DOM 重排）
- [ ] 批量启用/禁用
- [ ] 插件标签系统（可选）
- [ ] 冲突诊断（可选，视时间决定）

### P4: 集成测试 + 打包（1-2 天）

- [ ] 5 个 XDF 插件 + Gateway 集成测试
- [ ] 预设配置（community-plugins.json 预启用所有插件）
- [ ] 打包为可交付的 vault 文件夹
- [ ] 编写安装/使用说明

---

## 预估代码量

| 模块 | 来源 | 预估行数 |
|------|------|----------|
| 基础架构 + 镜像层 | BRAT 提取 + 自写 | ~300 |
| 更新引擎 | BRAT 提取 + 改造 | ~400 |
| 设置页分组 | sidebar-organizer 提取 + 精简 | ~800 |
| 通用管理 UI | BPM 提取 + 精简 | ~1000 |
| 样式 | 自写 + 参考 | ~500 |
| **合计** | | **~3000** |

---

## 风险与应对

| 风险 | 应对 |
|------|------|
| Obsidian 更新导致 DOM 选择器失效 | 设置页 DOM 相对稳定；做好版本适配层 |
| 镜像站全部不可用 | 保留直连 GitHub 作为最后 fallback（有梯子的老师可用） |
| 私有仓库（tookits/AIchatbot）无法走镜像 | 改为公开仓库，或把 Release 文件放到公开位置 |
| BPM 代码量太大难以提取 | 只提取核心函数，不照搬整个 UI |

---

## 命名规范

- 仓库：`obsidian-plugin-XDF-gateway`
- 插件 ID：`xdf-gateway`
- 显示名称：`XDF Gateway`
- 文件夹：`obsidian-plugin-XDF-gateway`
