import type { App, PluginManifest } from "obsidian";
import type { GroupConfig, GroupItem } from "./types";

export class SidebarOrganizer {
  private app: App;
  private groups: GroupConfig[];
  private observer: MutationObserver | null = null;
  private originalOnOpen: (() => void) | null = null;
  private originalOnClose: (() => void) | null = null;
  private isOrganizing: boolean = false;

  constructor(app: App, groups: GroupConfig[]) {
    this.app = app;
    this.groups = groups;
  }

  /**
   * 启动分组渲染
   * 1. monkey-patch app.setting.onOpen/onClose
   * 2. 在 onOpen 中调用 organizeSidebar
   * 3. 用 MutationObserver 监听侧边栏变化
   */
  enable(): void {
    const setting = (this.app as any).setting;
    if (!setting) return;

    // 保存原始 onOpen/onClose
    this.originalOnOpen = setting.onOpen;
    this.originalOnClose = setting.onClose;

    const self = this;

    // 覆写 onOpen → 调用 organizeSidebar
    setting.onOpen = function (...args: any[]) {
      const result = self.originalOnOpen?.apply(this, args);
      self.organizeSidebar();
      return result;
    };

    // 覆写 onClose → 清理 observer
    setting.onClose = function (...args: any[]) {
      if (self.observer) {
        self.observer.disconnect();
        self.observer = null;
      }
      return self.originalOnClose?.apply(this, args);
    };

    // 创建 MutationObserver 监听 .vertical-tab-header 变化
    this.observer = new MutationObserver(() => {
      if (!this.isOrganizing) {
        this.organizeSidebar();
      }
    });

    const sidebar = setting.tabHeadersEl || document.querySelector('.vertical-tab-header');
    if (sidebar) {
      this.observer.observe(sidebar, { childList: true, subtree: true });
    }
  }

  /**
   * 停止分组渲染，恢复原始状态
   */
  disable(): void {
    const setting = (this.app as any).setting;
    if (!setting) return;

    // 恢复原始 onOpen/onClose
    if (this.originalOnOpen) {
      setting.onOpen = this.originalOnOpen;
      this.originalOnOpen = null;
    }
    if (this.originalOnClose) {
      setting.onClose = this.originalOnClose;
      this.originalOnClose = null;
    }

    // 断开 MutationObserver
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // 移除所有注入的 DOM 元素
    const doc = this.getSettingDoc();
    doc.querySelectorAll('.xdf-folder').forEach(f => f.remove());
    doc.querySelectorAll('.xdf-hidden').forEach(h => h.classList.remove('xdf-hidden'));
  }

  /**
   * 核心：组织侧边栏
   * 1. 找到社区插件列表容器
   * 2. 隐藏原始 .vertical-tab-nav-item
   * 3. 注入 <details> 分组容器
   * 4. 在每个分组中创建 proxy button
   */
  private organizeSidebar(): void {
    this.isOrganizing = true;

    const doc = this.getSettingDoc();
    const targetContainer = doc.querySelector('.vertical-tab-header-group-items[data-section="community-plugins"]');

    if (!targetContainer) {
      this.isOrganizing = false;
      return;
    }

    // 清理之前的分组
    targetContainer.querySelectorAll('.xdf-folder').forEach(el => el.remove());
    targetContainer.querySelectorAll('.xdf-hidden').forEach(el => el.classList.remove('xdf-hidden'));

    const pluginItems = Array.from(targetContainer.querySelectorAll('.vertical-tab-nav-item'));
    const manifests = (this.app as any).plugins?.manifests || {};

    // 创建分组容器
    const groupsMap = this.groups.map((group) => {
      const details = doc.createElement('details');
      details.className = 'xdf-folder';
      details.setAttribute('data-group-id', group.id);
      details.open = !group.collapsed;

      const summary = doc.createElement('summary');
      summary.textContent = group.name;
      details.appendChild(summary);

      return {
        data: group,
        element: details,
        keywords: this.parseKeywords(group.keywords),
        items: group.items || [],
        proxies: [] as { item: GroupItem; element: HTMLElement }[]
      };
    });

    // 创建"其他插件"分组
    const ungroupedDetails = doc.createElement('details');
    ungroupedDetails.className = 'xdf-folder xdf-ungrouped';
    ungroupedDetails.open = true;
    const ungroupedSummary = doc.createElement('summary');
    ungroupedSummary.textContent = '其他插件';
    ungroupedDetails.appendChild(ungroupedSummary);

    let ungroupedCount = 0;

    // 遍历所有插件项
    pluginItems.forEach(item => {
      const settingId = item.getAttribute('data-setting-id');
      if (!settingId) return;

      const manifest = manifests[settingId];
      if (!manifest) return; // 只处理社区插件

      const uiName = item.textContent?.trim() || manifest.name;

      // 检查匹配哪个分组
      let matched = false;
      for (const group of groupsMap) {
        if (this.isPluginMatchedByGroup(settingId, manifest, group.data)) {
          // 查找别名
          const alias = this.getAlias(settingId, group.data);
          const displayName = alias || uiName;

          // 创建 proxy button
          const proxy = this.createProxy(settingId, displayName, targetContainer as HTMLElement);
          group.element.appendChild(proxy);
          group.proxies.push({ item: { pluginId: settingId, alias }, element: proxy });

          item.classList.add('xdf-hidden');
          matched = true;
          break;
        }
      }

      // 未匹配的放入"其他插件"
      if (!matched) {
        const proxy = this.createProxy(settingId, uiName, targetContainer as HTMLElement);
        ungroupedDetails.appendChild(proxy);
        item.classList.add('xdf-hidden');
        ungroupedCount++;
      }
    });

    // 插入分组到 DOM
    const referenceNode = targetContainer.firstChild;
    groupsMap.forEach(group => {
      if (group.proxies.length > 0) {
        targetContainer.insertBefore(group.element, referenceNode);
      }
    });

    if (ungroupedCount > 0) {
      ungroupedSummary.textContent = `其他插件 (${ungroupedCount})`;
      targetContainer.insertBefore(ungroupedDetails, referenceNode);
    }

    // 重置标志
    if (this.observer) {
      this.observer.takeRecords();
    }
    this.isOrganizing = false;
  }

  /**
   * 关键词匹配：检查插件是否匹配分组
   */
  private isPluginMatchedByGroup(
    pluginId: string,
    manifest: PluginManifest,
    group: GroupConfig,
  ): boolean {
    const keywords = this.parseKeywords(group.keywords);

    // 如果 keywords 为空（"其他插件"分组），匹配所有未匹配到其它分组的插件
    if (keywords.length === 0) {
      return false; // 这个分组由 ungroupedDetails 处理
    }

    // 检查 manifest.name 是否包含任一关键词（不区分大小写）
    const name = manifest.name.toLowerCase();
    return keywords.some(keyword => name.includes(keyword));
  }

  /**
   * 解析关键词（支持逗号分隔）
   */
  private parseKeywords(keywordString: string): string[] {
    if (!keywordString) return [];
    return keywordString
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * 获取插件别名
   */
  private getAlias(pluginId: string, group: GroupConfig): string | undefined {
    const item = group.items.find(i => i.pluginId === pluginId);
    return item?.alias;
  }

  /**
   * 创建 proxy button
   */
  private createProxy(
    settingId: string,
    displayName: string,
    container: HTMLElement,
  ): HTMLElement {
    const doc = container.ownerDocument || document;
    const proxy = doc.createElement('div');
    proxy.className = 'vertical-tab-nav-item xdf-proxy';
    proxy.textContent = displayName;
    proxy.setAttribute('data-setting-id', settingId);

    // 点击时找到原始 item 并 click()
    proxy.onclick = (e) => {
      e.stopPropagation();

      // 更新 active 状态
      container.querySelectorAll('.xdf-proxy').forEach(p => p.classList.remove('is-active'));
      proxy.classList.add('is-active');

      // 找到原始 item 并点击
      const originalItem = container.querySelector(
        `.vertical-tab-nav-item[data-setting-id="${settingId}"]:not(.xdf-proxy)`
      );
      if (originalItem) {
        (originalItem as HTMLElement).click();
      }
    };

    return proxy;
  }

  /**
   * 获取设置页 document（兼容弹出窗口）
   */
  private getSettingDoc(): Document {
    const setting = (this.app as any).setting;
    if (setting) {
      const el = setting.tabHeadersEl || setting.modalEl || setting.containerEl;
      if (el?.ownerDocument) return el.ownerDocument;
    }
    return document;
  }

  /**
   * 更新分组配置（用户修改设置后调用）
   */
  updateGroups(groups: GroupConfig[]): void {
    this.groups = groups;
    this.organizeSidebar();
  }
}
