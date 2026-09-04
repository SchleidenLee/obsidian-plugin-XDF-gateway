/**
 * Obsidian 内部 API 封装层
 *
 * 集中管理对 (app as any).plugins 的访问，避免散落各处的类型断言。
 */

import type { App } from "obsidian";

/**
 * Obsidian 内部 PluginManager 的最小接口
 * 仅包含 Gateway 实际使用的方法
 */
export interface PluginManagerLike {
  manifests: Record<string, { name?: string; version?: string; description?: string }>;
  enabledPlugins: Set<string>;
  enablePluginAndSave(id: string): Promise<void>;
  disablePluginAndSave(id: string): Promise<void>;
  loadManifests(): Promise<void>;
  loadPlugin?(id: string): Promise<void>;
}

/**
 * 获取 PluginManager 实例（带类型安全）
 */
export function getPluginManager(app: App): PluginManagerLike {
  return (app as any).plugins;
}

/**
 * 获取所有已加载插件的 manifest
 */
export function getManifests(app: App): Record<string, { name?: string; version?: string; description?: string }> {
  return getPluginManager(app).manifests ?? {};
}

/**
 * 获取已启用插件 ID 集合
 */
export function getEnabledPlugins(app: App): Set<string> {
  return getPluginManager(app).enabledPlugins ?? new Set();
}

/**
 * Obsidian 内部 Setting 面板的最小接口
 */
export interface SettingLike {
  onOpen?: () => void;
  onClose?: () => void;
  tabHeadersEl?: HTMLElement;
  modalEl?: HTMLElement;
  containerEl?: HTMLElement;
  contentEl?: HTMLElement;
  activeTab?: unknown;
}

/**
 * 获取 Setting 面板实例（内部 API，无公开类型）
 */
export function getSetting(app: App): SettingLike | undefined {
  return (app as any).setting;
}

/**
 * 获取 Setting 面板所在的 document
 * Obsidian 1.13 会将设置页打开为独立弹出窗口
 */
export function getSettingDoc(app: App): Document {
  const setting = getSetting(app);
  if (setting) {
    const el = setting.tabHeadersEl || setting.modalEl || setting.containerEl || setting.contentEl;
    if (el?.ownerDocument) return el.ownerDocument;
  }
  return document;
}
