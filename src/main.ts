/**
 * XDF Gateway — 插件管理中枢
 *
 * 功能：
 * 1. XDF 套件自动更新（镜像站 fallback）
 * 2. 设置页面插件分组渲染
 * 3. 通用插件管理
 */

import { Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, type GatewaySettings, XDF_PLUGINS } from "./settings";
import { PluginUpdater } from "./updater";
import { SidebarOrganizer } from "./sidebar-organizer";
import type { GroupConfig } from "./types";

export default class XdfGatewayPlugin extends Plugin {
  settings!: GatewaySettings;
  updater!: PluginUpdater;
  organizer!: SidebarOrganizer;
  private updateTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.updater = new PluginUpdater(this.app, this.settings);
    this.organizer = new SidebarOrganizer(this.app, this.settings.groups);

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
      },
    });

    this.addSettingTab(new GatewaySettingTab(this.app, this));

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

  private async runUpdateCheck(): Promise<void> {
    new Notice("[XDF Gateway] 正在检查插件更新...");
    try {
      const updates = await this.updater.checkForUpdates();
      if (updates.length === 0) {
        new Notice("[XDF Gateway] 所有 XDF 插件均为最新版本。");
      } else {
        const names = updates.map(
          (u) => `${u.name} (${u.currentVersion} → ${u.latestVersion})`,
        );
        new Notice(
          `[XDF Gateway] 发现 ${updates.length} 个更新:\n${names.join("\n")}`,
          15000,
        );
        await this.updater.updateAll(updates);
      }
      this.settings.lastUpdateCheck = Date.now();
      await this.saveSettings();
    } catch (error) {
      console.error("[XDF Gateway] 检查更新失败", error);
      new Notice("[XDF Gateway] 检查更新失败，请查看控制台。");
    }
  }

  private async runAutoUpdateCheck(): Promise<void> {
    try {
      const updates = await this.updater.checkForUpdates();
      if (updates.length > 0) {
        const names = updates.map((u) => u.name).join(", ");
        new Notice(
          `[XDF Gateway] 发现 ${updates.length} 个插件更新 (${names})，点击 Ribbon 图标一键更新。`,
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

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.updater) {
      this.updater.updateSettings(this.settings);
    }
    if (this.organizer) {
      this.organizer.updateGroups(this.settings.groups);
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
  private activeTab: "plugins" | "groups" | "settings" = "plugins";

  constructor(app: any, plugin: XdfGatewayPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Banner 导航
    const bannerEl = containerEl.createDiv({ cls: "xdf-banner-nav" });
    const tabs = [
      { id: "plugins" as const, label: "插件管理", icon: "puzzle" },
      { id: "groups" as const, label: "分组设置", icon: "folder" },
      { id: "settings" as const, label: "高级设置", icon: "settings" },
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
        this.renderPluginsTab(contentEl);
        break;
      case "groups":
        this.renderGroupsTab(contentEl);
        break;
      case "settings":
        this.renderSettingsTab(contentEl);
        break;
    }
  }

  /** 插件管理 Tab */
  private renderPluginsTab(containerEl: HTMLElement): void {
    // XDF 插件区域
    containerEl.createEl("h3", { text: "XDF 教学套件" });

    const xdfContainer = containerEl.createDiv({ cls: "xdf-plugin-list" });
    for (const xdfPlugin of XDF_PLUGINS) {
      const row = xdfContainer.createDiv({ cls: "xdf-plugin-row" });
      row.createSpan({ text: xdfPlugin.name, cls: "xdf-plugin-name" });
      row.createSpan({ text: xdfPlugin.id, cls: "xdf-plugin-id" });

      const actions = row.createDiv({ cls: "xdf-plugin-actions" });
      actions.createEl("button", {
        text: "更新",
        cls: "mod-cta",
      }).addEventListener("click", () => {
        void this.plugin.updater.updatePlugin(xdfPlugin.id);
      });
    }

    // 一键更新按钮
    new Setting(containerEl)
      .setName("一键更新所有 XDF 插件")
      .addButton((btn) =>
        btn
          .setButtonText("检查并更新")
          .setCta()
          .onClick(() => { void this.plugin.runUpdateCheck(); }),
      );

    // 全部插件列表（按分组）
    containerEl.createEl("h3", { text: "全部插件（按分组）" });
    const allPluginsContainer = containerEl.createDiv({ cls: "xdf-all-plugins" });

    const manifests = (this.app as any).plugins?.manifests || {};
    const enabledPlugins = (this.app as any).plugins?.enabledPlugins || new Set();

    for (const group of this.plugin.settings.groups) {
      const groupEl = allPluginsContainer.createDiv({ cls: "xdf-group-section" });
      const header = groupEl.createEl("details", { cls: "xdf-folder" });
      header.open = true;

      const summary = header.createEl("summary");
      summary.textContent = group.name;

      const list = header.createDiv({ cls: "xdf-plugin-list" });

      // 找到匹配该分组的插件
      const keywords = group.keywords
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      for (const [pluginId, manifest] of Object.entries(manifests)) {
        const m = manifest as any;
        const name = m.name?.toLowerCase() || "";
        const isMatch = keywords.length === 0
          ? true
          : keywords.some((kw) => name.includes(kw));

        if (isMatch) {
          const row = list.createDiv({ cls: "xdf-plugin-row" });
          row.createSpan({ text: m.name, cls: "xdf-plugin-name" });
          row.createSpan({ text: `v${m.version}`, cls: "xdf-plugin-version" });

          const isEnabled = enabledPlugins.has(pluginId);
          const status = row.createSpan({
            text: isEnabled ? "已启用" : "已禁用",
            cls: `xdf-plugin-status ${isEnabled ? "is-enabled" : "is-disabled"}`,
          });
        }
      }
    }
  }

  /** 分组设置 Tab */
  private renderGroupsTab(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "分组管理" });

    for (let i = 0; i < this.plugin.settings.groups.length; i++) {
      const group = this.plugin.settings.groups[i];
      const groupEl = containerEl.createDiv({ cls: "xdf-group-config" });

      new Setting(groupEl)
        .setName(group.name)
        .setDesc(`关键词：${group.keywords || "（无，匹配所有未分组插件）"}`)
        .addText((text) =>
          text
            .setPlaceholder("关键词，逗号分隔")
            .setValue(group.keywords)
            .onChange(async (value) => {
              this.plugin.settings.groups[i].keywords = value;
              await this.plugin.saveSettings();
              this.display();
            }),
        )
        .addButton((btn) =>
          btn
            .setIcon("trash")
            .setTooltip("删除分组")
            .onClick(async () => {
              this.plugin.settings.groups.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    }

    // 添加分组按钮
    new Setting(containerEl)
      .setName("添加新分组")
      .addButton((btn) =>
        btn
          .setButtonText("+ 添加分组")
          .onClick(async () => {
            const newGroup: GroupConfig = {
              id: `group-${Date.now()}`,
              name: "新分组",
              keywords: "",
              collapsed: false,
              items: [],
            };
            this.plugin.settings.groups.push(newGroup);
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }

  /** 高级设置 Tab */
  private renderSettingsTab(containerEl: HTMLElement): void {
    // 自动更新
    new Setting(containerEl)
      .setName("启用自动更新")
      .setDesc("启动时和定时检查 XDF 插件更新")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoUpdate)
          .onChange(async (value) => {
            this.plugin.settings.autoUpdate = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("检查间隔（分钟）")
      .setDesc("定时检查更新的间隔时间")
      .addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(String(this.plugin.settings.updateInterval))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.updateInterval = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    // 紧凑模式
    new Setting(containerEl)
      .setName("紧凑模式")
      .setDesc("折叠「核心插件」和「社区插件」标题，让界面更简洁")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.compactMode)
          .onChange(async (value) => {
            this.plugin.settings.compactMode = value;
            await this.plugin.saveSettings();
            document.body.classList.toggle("xdf-compact", value);
          }),
      );

    new Setting(containerEl)
      .setName("显示未分组插件")
      .setDesc("在设置页显示不属于任何分组的插件")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showUngrouped)
          .onChange(async (value) => {
            this.plugin.settings.showUngrouped = value;
            await this.plugin.saveSettings();
          }),
      );

    // 镜像站配置（藏在最下面）
    containerEl.createEl("h3", { text: "镜像站配置" });

    new Setting(containerEl)
      .setName("镜像站列表")
      .setDesc("GitHub 请求失败时自动尝试的镜像站（一行一个）")
      .addTextArea((text) =>
        text
          .setPlaceholder("https://gh-proxy.com/")
          .setValue(this.plugin.settings.mirrors.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.mirrors = value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("代理 URL 模板")
      .setDesc("{prefix} = 镜像前缀，{url} = 原始 URL")
      .addText((text) =>
        text
          .setPlaceholder("{prefix}{url}")
          .setValue(this.plugin.settings.proxyTemplate)
          .onChange(async (value) => {
            this.plugin.settings.proxyTemplate = value;
            await this.plugin.saveSettings();
          }),
      );

    // 关于
    containerEl.createEl("h3", { text: "关于" });
    containerEl.createEl("p", {
      text: `XDF Gateway v${this.plugin.manifest.version} — XDF 插件管理中枢`,
      cls: "mod-muted",
    });
  }
}
