/**
 * XDF Gateway — 插件管理中枢
 *
 * 功能：
 * 1. XDF 套件自动更新（镜像站 fallback）
 * 2. 设置页面插件分组渲染
 * 3. 通用插件管理
 */

import { Notice, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";
import { DEFAULT_SETTINGS, type GatewaySettings, XDF_PLUGINS } from "./settings";
import { PluginUpdater } from "./updater";
import { SidebarOrganizer } from "./sidebar-organizer";
import type { GroupConfig, TagConfig } from "./types";

export default class XdfGatewayPlugin extends Plugin {
  settings!: GatewaySettings;
  updater!: PluginUpdater;
  organizer!: SidebarOrganizer;
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

  async runUpdateCheck(): Promise<void> {
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
        this.renderPluginsTab(contentEl);
        break;
      case "tags":
        this.renderTagsTab(contentEl);
        break;
      case "settings":
        this.renderSettingsTab(contentEl);
        break;
    }
  }

  /** 插件管理 Tab */
  private renderPluginsTab(containerEl: HTMLElement): void {
    const manifests = (this.app as any).plugins?.manifests || {};
    const enabledPlugins = (this.app as any).plugins?.enabledPlugins || new Set();
    const plugins = (this.app as any).plugins?.plugins || {};

    // XDF 插件区域（置顶）
    containerEl.createEl("h3", { text: "XDF 教学套件" });

    const xdfContainer = containerEl.createDiv({ cls: "xdf-plugin-list" });
    // 置顶插件排在前面
    const sortedPlugins = [...XDF_PLUGINS].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    for (const xdfPlugin of sortedPlugins) {
      const m = manifests[xdfPlugin.id] as any;
      const isEnabled = enabledPlugins.has(xdfPlugin.id);
      const description = m?.description || "";
      const isPinned = this.plugin.settings.pinnedPlugins.includes(xdfPlugin.id);

      const row = xdfContainer.createDiv({ cls: `xdf-plugin-row${isPinned ? " is-pinned" : ""}` });

      // 左侧：名称 + 描述
      const info = row.createDiv({ cls: "xdf-plugin-info" });
      info.createSpan({ text: xdfPlugin.name, cls: "xdf-plugin-name" });
      if (description) {
        info.createSpan({ text: description, cls: "xdf-plugin-desc" });
      }

      // 右侧：Toggle 开关 + 更新按钮
      const actions = row.createDiv({ cls: "xdf-plugin-actions" });

      // Toggle 开关
      const toggleLabel = actions.createEl("label", { cls: "xdf-toggle-switch" });
      const toggleInput = toggleLabel.createEl("input", {
        type: "checkbox",
        cls: "xdf-toggle-input",
      });
      toggleInput.checked = isEnabled;
      toggleLabel.createSpan({ cls: "xdf-toggle-slider" });

      toggleInput.addEventListener("change", async () => {
        try {
          if (toggleInput.checked) {
            await plugins.enablePlugin(xdfPlugin.id);
            new Notice(`[XDF Gateway] 已启用 ${xdfPlugin.name}`);
          } else {
            await plugins.disablePlugin(xdfPlugin.id);
            new Notice(`[XDF Gateway] 已禁用 ${xdfPlugin.name}`);
          }
          this.display();
        } catch (error) {
          console.error(`[XDF Gateway] 切换插件状态失败: ${xdfPlugin.id}`, error);
          new Notice(`[XDF Gateway] 操作失败，请查看控制台`);
        }
      });

      // 更新按钮
      const updateBtn = actions.createEl("button", {
        text: "更新",
        cls: "xdf-update-btn",
      });
      updateBtn.addEventListener("click", () => {
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

    // 插件分组
    containerEl.createEl("h3", { text: "插件分组" });
    const allPluginsContainer = containerEl.createDiv({ cls: "xdf-all-plugins" });

    // 收集已分配到 XDF 套件的插件 ID（避免重复显示）
    const xdfPluginIds = new Set(XDF_PLUGINS.map(p => p.id));

    for (const group of this.plugin.settings.groups) {
      // 跳过 XDF 教学套件分组（已在上方单独显示）
      if (group.id === "xdf-suite") continue;

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

      // 收集匹配项并按置顶排序
      const matchedPlugins: Array<{ pluginId: string; manifest: any; isPinned: boolean }> = [];
      for (const [pluginId, manifest] of Object.entries(manifests)) {
        // 跳过已在 XDF 套件中显示的插件
        if (xdfPluginIds.has(pluginId)) continue;

        const m = manifest as any;
        const name = m.name?.toLowerCase() || "";
        const isMatch = keywords.length === 0
          ? true
          : keywords.some((kw) => name.includes(kw));

        if (isMatch) {
          const isPinned = this.plugin.settings.pinnedPlugins.includes(pluginId);
          matchedPlugins.push({ pluginId, manifest: m, isPinned });
        }
      }
      // 置顶排前面
      matchedPlugins.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      });

      for (const { pluginId, manifest: m, isPinned } of matchedPlugins) {
        const isEnabled = enabledPlugins.has(pluginId);
        const description = m?.description || "";

        const row = list.createDiv({ cls: `xdf-plugin-row${isPinned ? " is-pinned" : ""}` });

        // 左侧：名称 + 版本 + 描述
        const info = row.createDiv({ cls: "xdf-plugin-info" });
        info.createSpan({ text: m.name, cls: "xdf-plugin-name" });
        info.createSpan({ text: `v${m.version}`, cls: "xdf-plugin-version" });
        if (description) {
          info.createSpan({ text: description, cls: "xdf-plugin-desc" });
        }

        // 右侧：Toggle 开关
        const actions = row.createDiv({ cls: "xdf-plugin-actions" });
        const toggleLabel = actions.createEl("label", { cls: "xdf-toggle-switch" });
        const toggleInput = toggleLabel.createEl("input", {
          type: "checkbox",
          cls: "xdf-toggle-input",
        });
        toggleInput.checked = isEnabled;
        toggleLabel.createSpan({ cls: "xdf-toggle-slider" });

        toggleInput.addEventListener("change", async () => {
          try {
            if (toggleInput.checked) {
              await plugins.enablePlugin(pluginId);
              new Notice(`[XDF Gateway] 已启用 ${m.name}`);
            } else {
              await plugins.disablePlugin(pluginId);
              new Notice(`[XDF Gateway] 已禁用 ${m.name}`);
            }
            this.display();
          } catch (error) {
            console.error(`[XDF Gateway] 切换插件状态失败: ${pluginId}`, error);
            new Notice(`[XDF Gateway] 操作失败，请查看控制台`);
          }
        });
      }
    }
  }

  /** 标签管理 Tab */
  private renderTagsTab(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "标签管理" });
    containerEl.createEl("p", {
      text: "为插件添加标签，方便分类和筛选。",
      cls: "mod-muted",
    });

    // 标签列表
    const tagsContainer = containerEl.createDiv({ cls: "xdf-tags-list" });
    for (const tag of this.plugin.settings.tags) {
      const tagRow = tagsContainer.createDiv({ cls: "xdf-tag-row" });

      // 标签预览
      const preview = tagRow.createSpan({ cls: "xdf-tag-preview" });
      preview.textContent = tag.name;
      preview.style.backgroundColor = tag.color + "22";
      preview.style.color = tag.color;
      preview.style.borderColor = tag.color;

      // 编辑名称
      const nameInput = tagRow.createEl("input", {
        cls: "xdf-tag-name-input",
        type: "text",
        value: tag.name,
      });
      nameInput.addEventListener("change", async () => {
        tag.name = nameInput.value.trim() || tag.name;
        await this.plugin.saveSettings();
      });

      // 颜色选择
      const colorInput = tagRow.createEl("input", {
        cls: "xdf-tag-color-input",
        type: "color",
        value: tag.color,
      });
      colorInput.addEventListener("change", async () => {
        tag.color = colorInput.value;
        preview.style.backgroundColor = tag.color + "22";
        preview.style.color = tag.color;
        preview.style.borderColor = tag.color;
        await this.plugin.saveSettings();
      });

      // 删除按钮
      const deleteBtn = tagRow.createEl("button", {
        cls: "xdf-tag-delete-btn",
        text: "删除",
      });
      deleteBtn.addEventListener("click", async () => {
        this.plugin.settings.tags = this.plugin.settings.tags.filter(t => t.id !== tag.id);
        // 清理插件标签关联
        for (const pluginId of Object.keys(this.plugin.settings.pluginTags)) {
          this.plugin.settings.pluginTags[pluginId] = this.plugin.settings.pluginTags[pluginId].filter(tid => tid !== tag.id);
        }
        await this.plugin.saveSettings();
        this.display();
      });
    }

    // 添加标签按钮
    new Setting(containerEl)
      .setName("添加新标签")
      .addButton((btn) =>
        btn
          .setButtonText("+ 添加标签")
          .onClick(async () => {
            const newTag: TagConfig = {
              id: `tag-${Date.now()}`,
              name: "新标签",
              color: "#6b7280",
            };
            this.plugin.settings.tags.push(newTag);
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    // 插件标签关联
    containerEl.createEl("h3", { text: "插件标签" });
    const manifests = (this.app as any).plugins?.manifests || {};

    for (const [pluginId, manifest] of Object.entries(manifests)) {
      const m = manifest as any;
      const pluginTags = this.plugin.settings.pluginTags[pluginId] || [];

      const row = containerEl.createDiv({ cls: "xdf-plugin-tag-row" });
      row.createSpan({ text: m.name, cls: "xdf-plugin-tag-name" });

      const tagsEl = row.createDiv({ cls: "xdf-plugin-tags" });
      for (const tagId of pluginTags) {
        const tag = this.plugin.settings.tags.find(t => t.id === tagId);
        if (tag) {
          const tagBadge = tagsEl.createSpan({ cls: "xdf-tag-badge", text: tag.name });
          tagBadge.style.backgroundColor = tag.color + "22";
          tagBadge.style.color = tag.color;
          tagBadge.style.borderColor = tag.color;
        }
      }

      // 添加标签下拉
      const addTagSelect = tagsEl.createEl("select", { cls: "xdf-add-tag-select" });
      addTagSelect.createEl("option", { text: "+ 添加标签", value: "" });
      for (const tag of this.plugin.settings.tags) {
        if (!pluginTags.includes(tag.id)) {
          addTagSelect.createEl("option", { text: tag.name, value: tag.id });
        }
      }
      addTagSelect.addEventListener("change", async () => {
        const tagId = addTagSelect.value;
        if (tagId) {
          if (!this.plugin.settings.pluginTags[pluginId]) {
            this.plugin.settings.pluginTags[pluginId] = [];
          }
          this.plugin.settings.pluginTags[pluginId].push(tagId);
          await this.plugin.saveSettings();
          this.display();
        }
      });
    }
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

    // GitHub Token
    new Setting(containerEl)
      .setName("GitHub Token")
      .setDesc("可选，提高 API 频率限制（60 次/小时 → 5000 次/小时）。从 https://github.com/settings/tokens 获取")
      .addText((text) =>
        text
          .setPlaceholder("ghp_xxxxxxxxxxxx")
          .setValue(this.plugin.settings.githubToken)
          .onChange(async (value) => {
            this.plugin.settings.githubToken = value.trim();
            await this.plugin.saveSettings();
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
