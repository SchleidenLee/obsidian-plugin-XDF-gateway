/**
 * XDF Gateway — 插件管理中枢
 *
 * 功能：
 * 1. XDF 套件自动更新（镜像站 fallback）
 * 2. 设置页面插件分组渲染
 * 3. 通用插件管理
 */

import { type App, Notice, Plugin, PluginSettingTab } from "obsidian";
import { DEFAULT_SETTINGS, type GatewaySettings } from "./settings";
import { PluginUpdater } from "./updater";
import { SidebarOrganizer } from "./sidebar-organizer";
import { renderPluginsTab } from "./tabs/plugins-tab";
import { renderSettingsTab } from "./tabs/settings-tab";
import { renderTagsTab } from "./tabs/tags-tab";

export default class XdfGatewayPlugin extends Plugin {
  settings!: GatewaySettings;
  updater!: PluginUpdater;
  organizer!: SidebarOrganizer;
  settingTab: GatewaySettingTab | null = null;
  private updateTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.updater = new PluginUpdater(this.app, this.settings);
    this.organizer = new SidebarOrganizer(this.app, this.settings.groups, this.settings.pinnedPlugins);

    this.loadStyles();

    this.addRibbonIcon("refresh-cw", "XDF 一键更新", () => {
      void this.runUpdateCheck();
    });

    this.addCommand({
      id: "xdf-check-updates",
      name: "检查 XDF 插件更新",
      callback: () => { void this.runUpdateCheck(); },
    });

    this.addCommand({
      id: "xdf-update-all",
      name: "更新所有 XDF 插件",
      callback: async () => {
        new Notice("[XDF Gateway] 正在检查并更新所有插件...");
        const updates = await this.updater.checkForUpdates();
        await this.updater.updateAll(updates);
        this.settings.lastUpdateCheck = Date.now();
        await this.saveSettings();
        this.refreshSettingTab();
      },
    });

    this.settingTab = new GatewaySettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    if (this.settings.autoUpdate) {
      window.setTimeout(() => { void this.runAutoUpdateCheck(); }, 10000);
      this.startUpdateTimer();
    }

    this.organizer.enable();
  }

  onunload(): void {
    if (this.updateTimer !== null) {
      window.clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.organizer.disable();
  }

  async runUpdateCheck(): Promise<void> {
    const notice = new Notice("[XDF Gateway] 正在检查插件更新...", 0);
    try {
      const updates = await this.updater.checkForUpdates((current, total, name) => {
        notice.setMessage(`[XDF Gateway] 正在检查: ${name} (${current}/${total})`);
      });

      const toInstall = updates.filter((u) => !u.currentVersion);
      const toUpdate = updates.filter((u) => u.currentVersion);

      if (toInstall.length === 0 && toUpdate.length === 0) {
        notice.setMessage("[XDF Gateway] 所有 XDF 插件均已安装且为最新版本。");
        window.setTimeout(() => notice.hide(), 3000);
      } else {
        const parts: string[] = [];
        if (toInstall.length > 0) {
          parts.push(`需要安装: ${toInstall.map((u) => u.name).join("、")}`);
        }
        if (toUpdate.length > 0) {
          parts.push(
            `需要更新: ${toUpdate.map((u) => `${u.name} (${u.currentVersion} → ${u.latestVersion})`).join("、")}`,
          );
        }
        notice.setMessage(`[XDF Gateway] ${parts.join("\n")}\n\n正在处理...`);
        await this.updater.updateAll(updates, (current, total, name, stage) => {
          notice.setMessage(`[XDF Gateway] ${name}: ${stage} (${current}/${total})`);
        });
        notice.setMessage("[XDF Gateway] 安装/更新完成！");
        window.setTimeout(() => notice.hide(), 3000);
      }
      this.settings.lastUpdateCheck = Date.now();
      await this.saveSettings();
      this.refreshSettingTab();
    } catch (error) {
      console.error("[XDF Gateway] 检查更新失败", error);
      notice.setMessage("[XDF Gateway] 检查更新失败，请查看控制台。");
      window.setTimeout(() => notice.hide(), 5000);
    }
  }

  private async runAutoUpdateCheck(): Promise<void> {
    try {
      const updates = await this.updater.checkForUpdates();
      if (updates.length > 0) {
        const toInstall = updates.filter((u) => !u.currentVersion);
        const toUpdate = updates.filter((u) => u.currentVersion);
        const parts: string[] = [];
        if (toInstall.length > 0) parts.push(`${toInstall.length} 个待安装`);
        if (toUpdate.length > 0) parts.push(`${toUpdate.length} 个待更新`);
        const names = updates.map((u) => u.name).join(", ");
        new Notice(
          `[XDF Gateway] 发现 ${parts.join("、")} (${names})，点击 Ribbon 图标一键处理。`,
          15000,
        );
      }
      this.settings.lastUpdateCheck = Date.now();
      await this.saveSettings();
    } catch {
      console.warn("[XDF Gateway] 自动检查更新失败");
    }
  }

  private startUpdateTimer(): void {
    if (this.updateTimer !== null) {
      window.clearInterval(this.updateTimer);
    }
    const intervalMs = this.settings.updateInterval * 60 * 1000;
    this.updateTimer = window.setInterval(() => {
      void this.runAutoUpdateCheck();
    }, intervalMs);
  }

  private async loadStyles(): Promise<void> {
    try {
      const styleEl = document.createElement("style");
      styleEl.id = "xdf-gateway-styles";
      styleEl.textContent = await this.app.vault.adapter.read(
        `${this.manifest.dir}/styles.css`,
      );
      document.head.appendChild(styleEl);
      this.register(() => styleEl.remove());
    } catch {
      // styles.css 可选
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  refreshSettingTab(): void {
    if (!this.settingTab) return;
    if (this.settingTab.containerEl.isConnected) {
      this.settingTab.display();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.updater) {
      this.updater.updateSettings(this.settings);
    }
    if (this.organizer) {
      this.organizer.updateGroups(this.settings.groups);
      this.organizer.updatePinnedPlugins(this.settings.pinnedPlugins);
    }
    if (this.settings.autoUpdate) {
      this.startUpdateTimer();
    } else if (this.updateTimer !== null) {
      window.clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

/** 设置面板 — 带 banner 导航 */
class GatewaySettingTab extends PluginSettingTab {
  plugin: XdfGatewayPlugin;
  private activeTab: "plugins" | "tags" | "settings" = "plugins";

  constructor(app: App, plugin: XdfGatewayPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Banner 导航
    const bannerEl = containerEl.createDiv({ cls: "xdf-banner-nav" });
    const tabs = [
      { id: "plugins" as const, label: "插件管理" },
      { id: "tags" as const, label: "标签管理" },
      { id: "settings" as const, label: "高级设置" },
    ];

    for (const tab of tabs) {
      const btn = bannerEl.createEl("button", {
        cls: `xdf-banner-btn ${this.activeTab === tab.id ? "is-active" : ""}`,
        text: tab.label,
      });
      btn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.display();
      });
    }

    // 内容区
    const contentEl = containerEl.createDiv({ cls: "xdf-tab-content" });

    switch (this.activeTab) {
      case "plugins":
        void renderPluginsTab(this.app, this.plugin, contentEl, () => this.display());
        break;
      case "tags":
        renderTagsTab(this.app, this.plugin, contentEl, () => this.display());
        break;
      case "settings":
        renderSettingsTab(this.app, this.plugin, contentEl);
        break;
    }
  }
}
