/**
 * XDF Gateway - 设置页插件列表分组渲染
 *
 * 通过 DOM Hack 将 Obsidian 设置页的社区插件列表按关键词分组，
 * 使用 <details> 元素实现折叠/展开，proxy button 转发点击到原始隐藏元素。
 *
 * 参考：obsidian-settings-sidebar-organizer
 */

import type { App, Plugin } from "obsidian";
import type { GroupConfig } from "./types";
import { DEFAULT_GROUPS } from "./settings";

// ─── 类型 ────────────────────────────────────────────────────────────────────

/** 关键词解析结果 */
interface ParsedKeywords {
  positive: string[];
  negative: string[];
}

/** 分组运行时数据（包含 DOM 元素和匹配结果） */
interface GroupRuntime {
  config: GroupConfig;
  element: HTMLDetailsElement;
  keywords: ParsedKeywords;
  proxies: { name: string; element: HTMLElement }[];
}

// ─── 模块级状态 ──────────────────────────────────────────────────────────────

/** 防止 MutationObserver 在 DOM 操作期间重复触发 */
let isOrganizing = false;

/** 当前活跃的 MutationObserver */
let observer: MutationObserver | null = null;

/** monkey-patch 标记，防止重复安装 */
let settingPatched = false;

/** 保存原始的 onOpen / onClose 引用 */
let origSettingOnOpen: (() => void) | null = null;
let origSettingOnClose: (() => void) | null = null;
let onOpenWrapper: (() => void) | null = null;
let onCloseWrapper: (() => void) | null = null;

/** 用于延迟重排的定时器 */
let clickTimer: ReturnType<typeof setTimeout> | null = null;

/** 初始化重试定时器 */
let initTimer: ReturnType<typeof setTimeout> | null = null;

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/**
 * 获取设置窗口当前所在的 document
 * Obsidian 1.13 会将设置页打开为独立弹出窗口，需要通过 ownerDocument 获取
 */
function settingDoc(app: App): Document {
  const setting = (app as any).setting;
  if (setting) {
    const el =
      setting.tabHeadersEl || setting.modalEl || setting.containerEl || setting.contentEl;
    if (el?.ownerDocument) return el.ownerDocument;
  }
  return document;
}

/**
 * 判断设置面板是否处于打开状态
 */
function isSettingOpen(app: App): boolean {
  const setting = (app as any).setting;
  const el = setting && (setting.modalEl || setting.containerEl);
  return !!(el && el.isConnected);
}

/**
 * 获取侧边栏容器元素
 */
function getSidebarEl(app: App): HTMLElement | null {
  const setting = (app as any).setting;
  if (setting?.tabHeadersEl) return setting.tabHeadersEl;
  return settingDoc(app).querySelector(".vertical-tab-header") as HTMLElement | null;
}

// ─── 关键词解析 ──────────────────────────────────────────────────────────────

/**
 * 解析关键词字符串
 * - 逗号分隔多个关键词
 * - `!` 前缀表示排除
 * - `"` 包裹表示精确匹配短语（去除引号后作为整体匹配）
 *
 * @example
 * parseKeywords('editor,code,"Ace Editor', '!calendar')
 * // => { positive: ['editor', 'code', 'ace editor'], negative: ['calendar'] }
 */
export function parseKeywords(keywordString: string): ParsedKeywords {
  if (!keywordString) return { positive: [], negative: [] };

  const parts = keywordString
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const positive: string[] = [];
  const negative: string[] = [];

  for (let p of parts) {
    let isNegative = false;
    if (p.startsWith("!")) {
      isNegative = true;
      p = p.substring(1).trim();
    }
    // 去除引号，支持精确短语匹配
    if (p.startsWith('"') && p.endsWith('"')) {
      p = p.substring(1, p.length - 1).trim();
    }
    if (p) {
      if (isNegative) negative.push(p.toLowerCase());
      else positive.push(p.toLowerCase());
    }
  }

  return { positive, negative };
}

// ─── 插件匹配 ────────────────────────────────────────────────────────────────

/**
 * 判断插件是否匹配指定分组
 * 使用 manifest.name 和 pluginId 与分组的关键词进行匹配
 *
 * @param pluginId - 插件 ID（如 "obsidian-ace"）
 * @param manifest - 插件 manifest 对象（含 name 字段）
 * @param groupConfig - 分组配置
 * @returns 是否匹配
 */
export function isPluginMatchedByGroup(
  pluginId: string,
  manifest: { name: string },
  groupConfig: GroupConfig
): boolean {
  const { positive, negative } = parseKeywords(groupConfig.keywords);

  // 没有正向关键词则不匹配
  if (positive.length === 0) return false;

  const texts = [manifest.name.toLowerCase(), pluginId.toLowerCase()];

  // 至少一个正向关键词命中
  const posMatch = positive.some((k) => texts.some((t) => t.includes(k)));
  if (!posMatch) return false;

  // 排除关键词命中则不匹配
  const isExcluded = negative.some((k) => texts.some((t) => t.includes(k)));
  if (isExcluded) return false;

  return true;
}

// ─── Proxy 创建 ──────────────────────────────────────────────────────────────

/**
 * 创建代理按钮
 * 复用 Obsidian 原生 `.vertical-tab-nav-item` 样式，
 * 点击时转发到被隐藏的原始元素
 *
 * @param settingId - 插件的 data-setting-id
 * @param displayName - 显示名称（alias 优先于原始名称）
 * @param groupEl - 所属分组容器（用于获取正确的 document）
 * @param container - 社区插件列表容器（用于查找原始元素）
 * @param doc - 目标 document
 */
function createProxy(
  settingId: string,
  displayName: string,
  groupEl: HTMLElement,
  container: HTMLElement,
  doc: Document
): HTMLElement {
  const proxy = doc.createElement("div");
  proxy.className = "vertical-tab-nav-item my-gw-proxy";
  proxy.innerText = displayName;
  proxy.setAttribute("data-setting-id", settingId);

  // 如果原始元素当前处于激活状态，同步样式
  const originalItem = container.querySelector(
    `.vertical-tab-nav-item[data-setting-id="${settingId}"]:not(.my-gw-proxy)`
  );
  if (originalItem?.classList.contains("is-active")) {
    proxy.classList.add("is-active");
  }

  // 点击时转发到原始元素
  proxy.onclick = (e: MouseEvent) => {
    e.stopPropagation();

    // 立即提供视觉反馈
    container.querySelectorAll(".my-gw-proxy").forEach((p) => p.classList.remove("is-active"));
    container
      .querySelectorAll(`.my-gw-proxy[data-setting-id="${settingId}"]`)
      .forEach((p) => p.classList.add("is-active"));

    // 查找当前存活的原始元素（可能已被 Obsidian 重建）
    const freshTarget = container.querySelector(
      `.vertical-tab-nav-item[data-setting-id="${settingId}"]:not(.my-gw-proxy)`
    );

    if (freshTarget) {
      (freshTarget as HTMLElement).click();
    } else if (originalItem) {
      (originalItem as HTMLElement).click();
    }
  };

  return proxy;
}

// ─── 主渲染逻辑 ──────────────────────────────────────────────────────────────

/**
 * 清理已注入的分组 DOM，恢复原始元素可见性
 */
function clearOrganizedDom(doc: Document): void {
  doc.querySelectorAll(".my-gw-folder").forEach((f) => f.remove());
  doc.querySelectorAll(".my-gw-hidden").forEach((h) => h.classList.remove("my-gw-hidden"));
}

/**
 * 主函数：组织设置页侧边栏
 * 在设置页打开时调用，将社区插件列表按分组配置进行分组渲染
 *
 * 流程：
 * 1. 找到社区插件列表容器
 * 2. 隐藏原始 `.vertical-tab-nav-item` 元素
 * 3. 注入 `<details>` 分组容器
 * 4. 在每个分组内创建 proxy button
 * 5. 未匹配的插件放入"其他插件"分组
 */
function organizeSidebar(app: App, groups: GroupConfig[]): void {
  isOrganizing = true;

  const doc = settingDoc(app);
  const manifests = (app as any).plugins?.manifests;
  if (!manifests) {
    isOrganizing = false;
    return;
  }

  // 找到社区插件列表容器
  let targetContainer = doc.querySelector(
    '.vertical-tab-header-group-items[data-section="community-plugins"]'
  ) as HTMLElement | null;

  // 回退：如果找不到 data-section，尝试通过第一个插件元素定位
  if (!targetContainer) {
    const firstPlugin = doc.querySelector(".vertical-tab-nav-item[data-setting-id]");
    if (firstPlugin) {
      targetContainer = firstPlugin.parentElement as HTMLElement;
    }
  }

  if (!targetContainer) {
    isOrganizing = false;
    return;
  }

  // 清理旧的分组 DOM
  clearOrganizedDom(doc);

  // 收集所有原始插件导航项
  const pluginItems = Array.from(
    targetContainer.querySelectorAll(".vertical-tab-nav-item")
  ) as HTMLElement[];

  // 为每个分组创建 <details> 运行时对象
  const groupsRuntime: GroupRuntime[] = groups.map((config) => {
    const details = doc.createElement("details") as HTMLDetailsElement;
    details.className = "my-gw-folder";
    details.open = !config.collapsed;

    details.createEl("summary", { cls: "my-gw-summary", text: config.name });

    // 保存折叠状态
    details.addEventListener("toggle", () => {
      config.collapsed = !details.open;
    });

    return {
      config,
      element: details,
      keywords: parseKeywords(config.keywords),
      proxies: [],
    };
  });

  // 分离出"其他插件"分组（keywords 为空的分组作为 catch-all）
  const catchAllGroup = groupsRuntime.find((g) => g.config.keywords.trim() === "");
  const normalGroups = groupsRuntime.filter((g) => g.config.keywords.trim() !== "");

  // 先插入分组容器到目标位置
  const insertGroups = (referenceNode: Node | null) => {
    for (const g of normalGroups) {
      targetContainer!.insertBefore(g.element, referenceNode);
    }
    if (catchAllGroup) {
      targetContainer!.insertBefore(catchAllGroup.element, referenceNode);
    }
  };

  let foldersInserted = false;

  // 遍历每个原始插件项，分配到对应分组
  pluginItems.forEach((item) => {
    const uiName = item.innerText.trim();
    const settingId = item.getAttribute("data-setting-id");
    const manifest = settingId ? manifests[settingId] : null;

    // 只处理有 manifest 的社区插件
    if (!manifest) return;

    // 延迟插入分组容器（在第一个有效插件处插入）
    if (!foldersInserted) {
      insertGroups(item);
      foldersInserted = true;
    }

    // 查找 alias（从分组的 items 配置中）
    const findAlias = (id: string): string => {
      for (const g of groupsRuntime) {
        const found = g.config.items.find((i) => i.pluginId === id);
        if (found?.alias) return found.alias;
      }
      return "";
    };

    let matched = false;

    // 尝试匹配每个正常分组
    for (const group of normalGroups) {
      if (isPluginMatchedByGroup(settingId!, manifest, group.config)) {
        const alias = findAlias(settingId!);
        const displayName = alias || uiName;
        const proxy = createProxy(settingId!, displayName, group.element, targetContainer!, doc);
        group.element.appendChild(proxy);
        group.proxies.push({ name: manifest.name, element: proxy });
        matched = true;
        break; // 插件只归入第一个匹配的分组
      }
    }

    // 未匹配的插件放入 catch-all 分组
    if (!matched && catchAllGroup) {
      const alias = findAlias(settingId!);
      const displayName = alias || uiName;
      const proxy = createProxy(settingId!, displayName, catchAllGroup.element, targetContainer!, doc);
      catchAllGroup.element.appendChild(proxy);
      catchAllGroup.proxies.push({ name: manifest.name, element: proxy });
      matched = true;
    }

    // 隐藏原始元素
    if (matched) {
      item.classList.add("my-gw-hidden");
    }
  });

  // 如果没有任何插件触发插入，仍然插入分组容器
  if (!foldersInserted) {
    insertGroups(null);
  }

  // 移除空的分组（除了 catch-all）
  for (const group of normalGroups) {
    if (group.proxies.length === 0) {
      group.element.remove();
    }
  }

  // catch-all 分组为空时也隐藏
  if (catchAllGroup && catchAllGroup.proxies.length === 0) {
    catchAllGroup.element.remove();
  }

  // 清理 observer 队列，防止循环触发
  if (observer) observer.takeRecords();
  isOrganizing = false;
}

// ─── 设置生命周期 Hook ──────────────────────────────────────────────────────

/**
 * 设置打开时的回调
 */
function onSettingsOpened(app: App, groups: GroupConfig[]): void {
  const sidebar = getSidebarEl(app);
  if (sidebar) attachObserver(app, sidebar, groups);

  // 首次渲染
  try {
    organizeSidebar(app, groups);
  } catch {
    // 静默处理：分组失败不影响正常使用
  }
}

/**
 * 设置关闭时的回调
 */
function onSettingsClosed(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

/**
 * 创建并挂载 MutationObserver
 * 监听侧边栏 DOM 变化，自动重新组织
 */
function attachObserver(app: App, sidebar: HTMLElement, groups: GroupConfig[]): void {
  if (observer) observer.disconnect();

  const win = (sidebar.ownerDocument?.defaultView) || window;
  const MO = (win as any).MutationObserver || MutationObserver;

  observer = new MO((mutations) => {
    if (isOrganizing) return;
    if (mutations.some((m) => m.type === "childList")) {
      try {
        organizeSidebar(app, groups);
      } catch {
        // 静默处理
      }
    }
  });

  observer.observe(sidebar, { childList: true, subtree: true });
}

/**
 * Monkey-patch app.setting.onOpen / onClose
 * 在设置打开后自动调用 organizeSidebar，关闭时清理 observer
 */
function patchSettingLifecycle(app: App, groups: GroupConfig[]): void {
  const setting = (app as any).setting;
  if (!setting || settingPatched) return;

  settingPatched = true;
  origSettingOnOpen = setting.onOpen;
  origSettingOnClose = setting.onClose;

  onOpenWrapper = function (this: any, ...args: any[]) {
    const result = origSettingOnOpen!.apply(this, args);
    if (settingPatched) onSettingsOpened(app, groups);
    return result;
  };

  onCloseWrapper = function (this: any, ...args: any[]) {
    if (settingPatched) onSettingsClosed();
    return origSettingOnClose!.apply(this, args);
  };

  setting.onOpen = onOpenWrapper;
  setting.onClose = onCloseWrapper;
}

/**
 * 恢复原始的 onOpen / onClose
 */
function unpatchSettingLifecycle(app: App): void {
  const setting = (app as any).setting;
  if (!setting || !settingPatched) return;

  settingPatched = false;

  if (setting.onOpen === onOpenWrapper && origSettingOnOpen) {
    setting.onOpen = origSettingOnOpen;
    origSettingOnOpen = null;
    onOpenWrapper = null;
  }
  if (setting.onClose === onCloseWrapper && origSettingOnClose) {
    setting.onClose = origSettingOnClose;
    origSettingOnClose = null;
    onCloseWrapper = null;
  }
}

// ─── 公共 API ────────────────────────────────────────────────────────────────

/**
 * 初始化分组功能
 * 在插件 onload 时调用，monkey-patch 设置面板生命周期
 *
 * @param plugin - Obsidian 插件实例
 * @param groups - 分组配置数组（默认使用 DEFAULT_GROUPS）
 */
export function setupGrouping(
  plugin: Plugin,
  groups: GroupConfig[] = DEFAULT_GROUPS
): void {
  const app = plugin.app;

  // 等待 workspace 就绪后初始化
  app.workspace.onLayoutReady(() => {
    initSettingHook(app, groups);
  });

  // 注册卸载清理
  plugin.register(() => {
    teardownGrouping(app);
  });
}

/**
 * 初始化设置 Hook（带重试逻辑）
 */
function initSettingHook(app: App, groups: GroupConfig[], attempt = 0): void {
  if ((app as any).setting) {
    patchSettingLifecycle(app, groups);
    // 如果设置已经打开，立即执行一次
    if (isSettingOpen(app)) {
      try {
        onSettingsOpened(app, groups);
      } catch {
        // 静默处理
      }
    }
    return;
  }

  if (attempt < 20) {
    initTimer = window.setTimeout(() => initSettingHook(app, groups, attempt + 1), 100);
  }
}

/**
 * 卸载分组功能
 * 清理所有注入的 DOM 和 monkey-patch
 */
export function teardownGrouping(app: App): void {
  // 断开 observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // 清理定时器
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }

  // 恢复原始生命周期
  unpatchSettingLifecycle(app);

  // 清理 DOM
  const setting = (app as any).setting;
  const root = (setting && (setting.modalEl || setting.containerEl)) || settingDoc(app);
  root.querySelectorAll(".my-gw-folder").forEach((f: Element) => f.remove());
  root.querySelectorAll(".my-gw-hidden").forEach((h: Element) => h.classList.remove("my-gw-hidden"));
}
