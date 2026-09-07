# XDF Gateway 后续实现计划 — PENDING

> 基于 PLAN.md 中未完成项 + 新发现问题，逐项分析实现方案。
> 最后更新：2026-09-08

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

**已取消：**
- ~~延迟加载机制~~ — 插件数量少，不需要

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
