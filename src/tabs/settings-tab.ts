import { Setting } from "obsidian";
import type { App } from "obsidian";
import type XdfGatewayPlugin from "../main";

export function renderSettingsTab(
  app: App,
  plugin: XdfGatewayPlugin,
  containerEl: HTMLElement,
): void {
  // 自动更新
  new Setting(containerEl)
    .setName("启用自动更新")
    .setDesc("启动时和定时检查 XDF 插件更新")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.autoUpdate)
        .onChange(async (value) => {
          plugin.settings.autoUpdate = value;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("检查间隔（分钟）")
    .setDesc("定时检查更新的间隔时间")
    .addText((text) =>
      text
        .setPlaceholder("60")
        .setValue(String(plugin.settings.updateInterval))
        .onChange(async (value) => {
          const n = parseInt(value, 10);
          if (!isNaN(n) && n > 0) {
            plugin.settings.updateInterval = n;
            await plugin.saveSettings();
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
        .setValue(plugin.settings.githubToken)
        .onChange(async (value) => {
          plugin.settings.githubToken = value.trim();
          await plugin.saveSettings();
        }),
    );

  // 紧凑模式
  new Setting(containerEl)
    .setName("紧凑模式")
    .setDesc("折叠「核心插件」和「社区插件」标题，让界面更简洁")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.compactMode)
        .onChange(async (value) => {
          plugin.settings.compactMode = value;
          await plugin.saveSettings();
          document.body.classList.toggle("xdf-compact", value);
        }),
    );

  new Setting(containerEl)
    .setName("显示未分组插件")
    .setDesc("在设置页显示不属于任何分组的插件")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.showUngrouped)
        .onChange(async (value) => {
          plugin.settings.showUngrouped = value;
          await plugin.saveSettings();
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
        .setValue(plugin.settings.mirrors.join("\n"))
        .onChange(async (value) => {
          plugin.settings.mirrors = value
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("代理 URL 模板")
    .setDesc("{prefix} = 镜像前缀，{url} = 原始 URL")
    .addText((text) =>
      text
        .setPlaceholder("{prefix}{url}")
        .setValue(plugin.settings.proxyTemplate)
        .onChange(async (value) => {
          plugin.settings.proxyTemplate = value;
          await plugin.saveSettings();
        }),
    );

  // 关于
  containerEl.createEl("h3", { text: "关于" });
  containerEl.createEl("p", {
    text: `XDF Gateway v${plugin.manifest.version} — XDF 插件管理中枢`,
    cls: "mod-muted",
  });
}
