# XDF Gateway 插件状态管理修复 — PENDING

> 状态：待确认。确认后按本文件并行派发子 agent 执行。
> 审查范围：src/updater.ts、src/main.ts、src/github.ts、src/types.ts、src/settings.ts、src/styles.css
> 参考：references/obsidian-manager/src/github-install.ts（BPM installPluginFromGithub）

---

## 问题 1：「检查并更新」显示全部最新，但插件都没安装

### 根因（两个叠加 bug）

**Bug 1-A（致命）：`/releases/latest` 响应解析错误** — [github.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-gateway/src/github.ts) `grabReleaseFromRepository` L235-244

```ts
const releases: Release[] =
  version && version !== "latest"
    ? json && typeof json === "object" ? [json as Release] : []   // 按 tag 查：单对象 → [obj] ✓
    : Array.isArray(json) ? (json as Release[]) : [];             // latest 查：GitHub 返回单对象，不是数组 → [] ✗
```

- 不带 version 时请求 `/releases/latest`，GitHub 返回**单个 Release 对象**
- 代码却按数组解析 → `releases` 恒为 `[]` → `grabReleaseFromRepository` **永远返回 null**
- 于是 `checkSinglePluginUpdate` 全部 `return null` → `updates.length === 0` → 显示「所有 XDF 插件均为最新版本」（图 1）
- **这就是为什么"检查并更新"从来查不出任何东西**

**Bug 1-B：未安装插件被静默跳过** — [updater.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-gateway/src/updater.ts) L63-64

```ts
const localVersion = await this.getLocalVersion(plugin.id);
if (!localVersion) return null;   // 未安装 → null，和"已是最新"无法区分
```

**Bug 1-C（连带）：404 处理是死代码** — [github.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-gateway/src/github.ts) L231

- `gitHubRequest` 没给 `requestUrl` 传 `throw: false`，Obsidian 的 requestUrl 对 4xx **直接 throw**
- `if (response.status === 404) return null;` 永远走不到，404 变成 generic 异常被上层 catch 吞掉

---

## 问题 2：未安装插件开关可点、按钮写「更新」、无安装反馈

### 根因

[main.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-gateway/src/main.ts) `renderPluginsTab` L230-284 — XDF 区块渲染完全不感知安装状态：

- L249-255：toggle 无条件创建，`not_installed` 时没有 `disabled`
- L274-277：按钮文字写死 `"更新"`
- L279：点击提示写死 `"正在更新"`
- `updatePlugin` 成功/失败 Notice 文案也全是"更新"语境

期望行为：not_installed → 开关置灰禁用 / 按钮显示「安装」/ 流程提示「正在安装 → 安装成功/失败」。

---

## 问题 3：安装后不热加载，必须重启 Obsidian

### 根因

[updater.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-gateway/src/updater.ts) `reloadPlugin` L193-201

```ts
async reloadPlugin(pluginId: string): Promise<void> {
  const plugins = (this.app as any).plugins;
  try {
    await plugins.disablePlugin(pluginId);
    await plugins.enablePlugin(pluginId);
  } catch (error) { ... }   // 异常被吞，表面"成功"实际什么都没发生
}
```

1. 新装插件的文件夹**不在 `plugins.manifests` 里**（Obsidian 只在启动时扫描一次）
2. `enablePlugin` 按 manifests 找插件 → 找不到 → throw → 被 catch 吞掉
3. **缺少 `loadManifests()`** 重扫插件目录
4. 用 `enablePlugin` 而非 `enablePluginAndSave`，启用状态没有持久化

BPM 的正确做法（github-install.ts L498-510）：disable（容错）→ enablePluginAndSave → **loadManifests**。

---

## 问题 4：开关纯摆设，任何情况点击都报错（图 2）

### 根因（致命，API 对象用错）

[main.ts](file:///x:/AI/projects/XDF-obsidian-system/obsidian-plugin/obsidian-plugin-XDF-gateway/src/main.ts) L218

```ts
const plugins = (this.app as any).plugins?.plugins || {};
//                              ^^^^^^^^^^ PluginManager
//                                         ^^^^^^ 已加载插件实例 Map（id → 插件实例对象）
```

- `app.plugins` = PluginManager（有 `enablePlugin`/`disablePlugin`/`loadManifests` 等方法）
- `app.plugins.plugins` = **已加载插件实例的 Map**，实例对象上根本没有 `enablePlugin` 方法
- toggle change 回调（L257-271 XDF 区、L374-388 分组区）调 `plugins.enablePlugin(...)` → `undefined is not a function` → TypeError → catch → 「操作失败，请查看控制台」（图 2）
- **不管开关是开是关、插件装没装，点击必报错** — 因为调用的对象从头就不对

---

## 修改方案（按文件）

### 文件 A：src/github.ts

**A-1** 修 `grabReleaseFromRepository` 响应解析（L233-244），latest 单对象也包装：

```ts
const json: unknown = response.json;
const releases: Release[] =
  json && typeof json === "object"
    ? Array.isArray(json) ? (json as Release[]) : [json as Release]
    : [];
```

**A-2** `gitHubRequest` 的 `requestUrl` 调用加 `throw: false`（直连与镜像两处），让 4xx 状态可判断：

```ts
const res = await requestUrl({ ...requestOptions, throw: false });
```

**A-3** `grabReleaseFromRepository` 中状态处理（替换 L231 死代码）：

```ts
if (response.status === 404) return null;                    // 无 release / 仓库不可见
if (response.status === 403) throw new GHRateLimitError(...); // 从 headers 取 x-ratelimit-*，无则抛 GitHubResponseError
if (response.status >= 400) throw new GitHubResponseError(...);
```

> 注：`GHRateLimitError` 构造需要 limit/remaining/reset/requestUrl，可从 response.headers 的 `x-ratelimit-limit/remaining/reset` 读取，缺失时给默认值。

### 文件 B：src/types.ts

**B-1** 新增类型：

```ts
/** 插件安装状态 */
export type PluginInstallState = "not_installed" | "disabled" | "enabled";
```

**B-2** `PluginUpdateInfo.currentVersion` 改为 `string | null`（null = 未安装）。

### 文件 C：src/updater.ts

**C-1** 新增 `getInstallState`：

```ts
async getInstallState(pluginId: string): Promise<PluginInstallState> {
  const localVersion = await this.getLocalVersion(pluginId);
  if (!localVersion) return "not_installed";
  const plugins = (this.app as any).plugins;
  return plugins?.enabledPlugins?.has(pluginId) ? "enabled" : "disabled";
}
```

**C-2** 重写 `checkSinglePluginUpdate`（区分未安装/最新/有更新）：

```ts
private async checkSinglePluginUpdate(plugin): Promise<PluginUpdateInfo | null> {
  const localVersion = await this.getLocalVersion(plugin.id);
  const release = await grabReleaseFromRepository(plugin.repo, this.settings);
  if (!release) return null;                       // 查不到 release：跳过并 console.warn
  const latestVersion = release.tag_name;
  if (!localVersion) {
    return { id, name, currentVersion: null, latestVersion, repo };  // 未安装 → 需要安装
  }
  if (this.isNewerVersion(localVersion, latestVersion)) {
    return { id, name, currentVersion: localVersion, latestVersion, repo };
  }
  return null;                                     // 已是最新
}
```

**C-3** 重写 `reloadPlugin`（热加载核心，带状态保持）：

```ts
async reloadPlugin(pluginId: string, forceEnable?: boolean): Promise<void> {
  const plugins = (this.app as any).plugins;
  const wasEnabled = plugins?.enabledPlugins?.has(pluginId) ?? false;
  try { await plugins.disablePlugin(pluginId); } catch {}   // 未启用时忽略
  await plugins.loadManifests();                            // 重扫插件目录，识别新装插件
  if (forceEnable ?? wasEnabled) {
    await plugins.enablePluginAndSave(pluginId);            // 启用并持久化
  }
}
```

- 全新安装：`forceEnable = true` → 装完立即可用
- 更新已启用插件：保持启用 → disable 卸旧代码 → loadManifests → enable 加载新代码
- 更新已禁用插件：保持禁用，只刷新 manifest

**C-4** `updatePlugin` 区分安装/更新（写入前记录状态）：

```ts
const wasInstalled = !!(await this.getLocalVersion(pluginId));
// ... 获取 release → 下载 → 写入 ...
await this.reloadPlugin(pluginId, wasInstalled ? undefined : true);
new Notice(`[XDF Gateway] ${pluginDef.name} 已${wasInstalled ? "更新" : "安装"}至 ${release.tag_name}`, 8000);
// 失败分支文案：安装失败 / 更新失败
```

**C-5** `updateAll` 文案兼容安装场景：`安装/更新完成: x/y`；空列表提示改「所有插件均已安装且为最新版本」。

### 文件 D：src/main.ts

**D-1**（问题 4 核心）L218 修正 API 对象：

```ts
const pluginManager = (this.app as any).plugins;   // PluginManager 本体
```

- L216 manifests、L217 enabledPlugins 取法不变
- toggle 回调改用 `pluginManager.enablePlugin(...)` / `pluginManager.disablePlugin(...)`（XDF 区 L257-271 + 分组区 L374-388 两处）

**D-2** XDF 区块按安装状态渲染（L230-284）：

| installState | Toggle | 按钮文字 | 点击行为 |
|---|---|---|---|
| not_installed | `disabled = true`，checked=false | 安装 | updatePlugin（内部区分文案） |
| disabled | 可点，checked=false | 更新 | updatePlugin |
| enabled | 可点，checked=true | 更新 | updatePlugin |

```ts
const installState = await this.plugin.updater.getInstallState(xdfPlugin.id);
// not_installed 时：
toggleInput.disabled = true;
row.addClass("is-not-installed");
updateBtn.textContent = "安装";
```

- toggle change 前置校验（防竞态兜底）：
```ts
toggleInput.addEventListener("change", async () => {
  const state = await this.plugin.updater.getInstallState(xdfPlugin.id);
  if (state === "not_installed") {
    toggleInput.checked = false;
    new Notice(`[XDF Gateway] ${xdfPlugin.name} 尚未安装，请先点击「安装」`);
    return;
  }
  try {
    if (toggleInput.checked) await pluginManager.enablePlugin(xdfPlugin.id);
    else await pluginManager.disablePlugin(xdfPlugin.id);
    this.display();
  } catch (e) {
    toggleInput.checked = !toggleInput.checked;   // 回滚 UI
    new Notice(`[XDF Gateway] 操作失败`);
  }
});
```

- 按钮点击 → `updatePlugin`（Notice 由 updater 内部产出「正在安装/正在更新 → 成功/失败」）

**D-3** `renderPluginsTab` 改为 async（因需 await getInstallState）；`display()` 中调用处改 `void this.renderPluginsTab(contentEl)`。

**D-4** `runUpdateCheck` 文案区分安装与更新：

```ts
const toInstall = updates.filter(u => !u.currentVersion);
const toUpdate  = updates.filter(u => u.currentVersion);
// 发现 X 个插件需要安装（names）、Y 个插件需要更新（name: cur → latest）
```

### 文件 E：src/styles.css

**E-1** 新增禁用态样式：

```css
.xdf-toggle-switch input:disabled { cursor: not-allowed; }
.xdf-toggle-switch input:disabled + .xdf-toggle-slider { opacity: 0.35; cursor: not-allowed; }
.xdf-plugin-row.is-not-installed .xdf-plugin-name { opacity: 0.5; }
```

---

## 验证清单（改完后）

1. `npm run build`（WSL 路径）编译通过
2. 只装 gateway 的 vault：XDF 套件区其他 5 个插件开关置灰、按钮显示「安装」
3. 点「安装」→ Notice「正在安装」→「已安装至 vX」→ 插件立即出现在系统且启用，无需重启
4. toggle 开/关正常生效，无报错弹窗
5. 「检查并更新」：未安装 → 提示需要安装；已安装最新 → 「均已最新」；有新版 → 列出 cur → latest
6. 更新已启用插件后功能正常（热重载生效）；更新已禁用插件后保持禁用

## 已知风险（暂不处理）

- `gitHubRequest` 会把 GitHub Token 发给镜像站（第三方可见）。BPM 同样如此。后续可考虑仅直连带 Token。
