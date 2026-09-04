import type { App, PluginManifest } from "obsidian";
import { getSetting, getSettingDoc, getManifests } from "./obsidian-internals";
import type { GroupConfig, GroupItem } from "./types";

export class SidebarOrganizer {
  private app: App;
  private groups: GroupConfig[];
  private pinnedPlugins: string[];
  private observer: MutationObserver | null = null;
  private originalOnOpen: (() => void) | null = null;
  private originalOnClose: (() => void) | null = null;
  private isOrganizing: boolean = false;

  constructor(app: App, groups: GroupConfig[], pinnedPlugins: string[] = []) {
    this.app = app;
    this.groups = groups;
    this.pinnedPlugins = pinnedPlugins;
  }

  enable(): void {
    const setting = getSetting(this.app);
    if (!setting) return;

    this.originalOnOpen = setting.onOpen;
    this.originalOnClose = setting.onClose;

    const self = this;

    setting.onOpen = function (...args: any[]) {
      const result = self.originalOnOpen?.apply(this, args);
      self.organizeSidebar();
      return result;
    };

    setting.onClose = function (...args: any[]) {
      if (self.observer) {
        self.observer.disconnect();
        self.observer = null;
      }
      return self.originalOnClose?.apply(this, args);
    };

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

  disable(): void {
    const setting = getSetting(this.app);
    if (!setting) return;

    if (this.originalOnOpen) {
      setting.onOpen = this.originalOnOpen;
      this.originalOnOpen = null;
    }
    if (this.originalOnClose) {
      setting.onClose = this.originalOnClose;
      this.originalOnClose = null;
    }

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    const doc = this.getSettingDoc();
    doc.querySelectorAll('.xdf-folder').forEach(f => f.remove());
    doc.querySelectorAll('.xdf-hidden').forEach(h => h.classList.remove('xdf-hidden'));
  }

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
    const manifests = getManifests(this.app);

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

    // 收集每个分组匹配的插件（含置顶信息）
    const groupMatches = new Map<number, Array<{ pluginId: string; displayName: string; isPinned: boolean; originalItem: Element }>>();

    // 遍历所有插件项
    pluginItems.forEach(item => {
      const settingId = item.getAttribute('data-setting-id');
      if (!settingId) return;

      const manifest = manifests[settingId];
      if (!manifest) return;

      const uiName = item.textContent?.trim() || manifest.name;
      const isPinned = this.pinnedPlugins.includes(settingId);

      // 检查匹配哪个分组
      let matched = false;
      for (let gi = 0; gi < groupsMap.length; gi++) {
        const group = groupsMap[gi];
        if (this.isPluginMatchedByGroup(settingId, manifest, group.data)) {
          const alias = this.getAlias(settingId, group.data);
          const displayName = alias || uiName;

          if (!groupMatches.has(gi)) groupMatches.set(gi, []);
          groupMatches.get(gi)!.push({ pluginId: settingId, displayName, isPinned, originalItem: item });

          item.classList.add('xdf-hidden');
          matched = true;
          break;
        }
      }

      // 未匹配的放入"其他插件"
      if (!matched) {
        const proxy = this.createProxy(settingId, uiName, targetContainer as HTMLElement, isPinned);
        ungroupedDetails.appendChild(proxy);
        item.classList.add('xdf-hidden');
        ungroupedCount++;
      }
    });

    // 按置顶排序后插入 proxy
    groupsMap.forEach((group, gi) => {
      const matches = groupMatches.get(gi) || [];
      // 置顶的排前面
      matches.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return a.displayName.localeCompare(b.displayName);
      });

      for (const m of matches) {
        const proxy = this.createProxy(m.pluginId, m.displayName, targetContainer as HTMLElement, m.isPinned);
        group.element.appendChild(proxy);
        group.proxies.push({ item: { pluginId: m.pluginId }, element: proxy });
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

    if (this.observer) {
      this.observer.takeRecords();
    }
    this.isOrganizing = false;
  }

  private isPluginMatchedByGroup(
    pluginId: string,
    manifest: PluginManifest,
    group: GroupConfig,
  ): boolean {
    const keywords = this.parseKeywords(group.keywords);

    if (keywords.length === 0) {
      return false;
    }

    const name = manifest.name.toLowerCase();
    return keywords.some(keyword => name.includes(keyword));
  }

  private parseKeywords(keywordString: string): string[] {
    if (!keywordString) return [];
    return keywordString
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
  }

  private getAlias(pluginId: string, group: GroupConfig): string | undefined {
    const item = group.items.find(i => i.pluginId === pluginId);
    return item?.alias;
  }

  private createProxy(
    settingId: string,
    displayName: string,
    container: HTMLElement,
    isPinned: boolean = false,
  ): HTMLElement {
    const doc = container.ownerDocument || document;
    const proxy = doc.createElement('div');
    proxy.className = `vertical-tab-nav-item xdf-proxy${isPinned ? ' xdf-pinned' : ''}`;
    proxy.setAttribute('data-setting-id', settingId);

    // 置顶图标
    if (isPinned) {
      const pinIcon = doc.createElement('span');
      pinIcon.className = 'xdf-pin-icon';
      pinIcon.textContent = '📌';
      proxy.appendChild(pinIcon);
    }

    const nameSpan = doc.createElement('span');
    nameSpan.textContent = displayName;
    proxy.appendChild(nameSpan);

    proxy.onclick = (e) => {
      e.stopPropagation();

      container.querySelectorAll('.xdf-proxy').forEach(p => p.classList.remove('is-active'));
      proxy.classList.add('is-active');

      const originalItem = container.querySelector(
        `.vertical-tab-nav-item[data-setting-id="${settingId}"]:not(.xdf-proxy)`
      );
      if (originalItem) {
        (originalItem as HTMLElement).click();
      }
    };

    return proxy;
  }

  private getSettingDoc(): Document {
    return getSettingDoc(this.app);
  }

  updateGroups(groups: GroupConfig[]): void {
    this.groups = groups;
    this.organizeSidebar();
  }

  updatePinnedPlugins(pinned: string[]): void {
    this.pinnedPlugins = pinned;
    this.organizeSidebar();
  }
}
