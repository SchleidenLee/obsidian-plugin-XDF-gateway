/**
 * XDF Gateway — 插件管理中枢
 *
 * 功能：
 * 1. XDF 套件自动更新（镜像站 fallback）
 * 2. 设置页面插件分组渲染
 * 3. 通用插件管理
 */

import { Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, type GatewaySettings } from "./settings";
import { PluginUpdater } from "./updater";
import { SidebarOrganizer } from "./sidebar-organizer";

export default class XdfGatewayPlugin extends Plugin {
  settings!: GatewaySettings;
  updater!: PluginUpdater;
  organizer!: SidebarOrganizer;
  private updateTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // 初始化更新器
    this.updater = new PluginUpdater(this.app, this.settings);

    // 初始化侧边栏分组
    this.organizer = new SidebarOrganizer(this.app, this.settings.groups);

    // 加载自定义样式
    this.loadStyles();

    // Ribbon 图标 — 一键更新
    this.addRibbonIcon("refresh-cw", "XDF 一键更新", () => {
      void this.runUpdateCheck();
    });

    // 命令
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

    // 设置面板
    this.addSettingTab(new GatewaySettingTab(this.app, this));

    // 启动时自动检查更新（延迟 10 秒）
    if (this.settings.autoUpdate) {
      window.setTimeout(() => { void this.runAutoUpdateCheck(); }, 10000);
      this.startUpdateTimer();
    }

    // 启用设置页分组
    this.organizer.enable();
  }

  onunload(): void {
    if (this.updateTimer !== null) {
      window.clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.organizer.disable();
  }

  /** 手动检查更新 */
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

  /** 静默自动检查更新 */
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

  /** 启动定时检查 */
  private startUpdateTimer(): void {
    if (this.updateTimer !== null) {
      window.clearInterval(this.updateTimer);
    }
    const intervalMs = this.settings.updateInterval * 60 * 1000;
    this.updateTimer = window.setInterval(() => {
      void this.runAutoUpdateCheck();
    }, intervalMs);
  }

  /** 加载自定义 CSS */
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

/** 设置面板 */
class GatewaySettingTab extends PluginSettingTab {
  plugin: XdfGatewayPlugin;

  constructor(app: any, plugin: XdfGatewayPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 标题
    containerEl.createEl("h1", { text: "XDF Gateway 设置" });

    // ── 自动更新 ──
    containerEl.createEl("h2", { text: "自动更新" });

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

    // ── 一键操作 ──
    containerEl.createEl("h2", { text: "操作" });

    new Setting(containerEl)
      .setName("立即检查更新")
      .setDesc("检查所有 XDF 插件是否有新版本")
      .addButton((button) =>
        button
          .setButtonText("检查更新")
          .setCta()
          .onClick(() => { void this.plugin.runUpdateCheck(); }),
      );

    // ── 设置页分组 ──
    containerEl.createEl("h2", { text: "设置页分组" });

    new Setting(containerEl)
      .setName("紧凑模式")
      .setDesc("折叠「核心插件」和「社区插件」标题，让界面更简洁")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.compactMode)
          .onChange(async (value) => {
            this.plugin.settings.compactMode = value;
            await this.plugin.saveSettings();
            // 切换 body class
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

    // ── 镜像站（藏在最下面） ──
    containerEl.createEl("h2", { text: "高级设置" });

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
      .setDesc("{prefix} = 镜像前缀, {url} = 原始 URL")
      .addText((text) =>
        text
          .setPlaceholder("{prefix}{url}")
          .setValue(this.plugin.settings.proxyTemplate)
          .onChange(async (value) => {
            this.plugin.settings.proxyTemplate = value;
            await this.plugin.saveSettings();
          }),
      );

    // ── 关于 ──
    containerEl.createEl("h2", { text: "关于" });
    containerEl.createEl("p", {
      text: `XDF Gateway v${this.plugin.manifest.version} — XDF 插件管理中枢`,
      cls: "mod-muted",
    });
  }
}
