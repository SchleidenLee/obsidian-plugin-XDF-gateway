import { Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import type XdfGatewayPlugin from "../main";
import { XDF_PLUGINS } from "../settings";
import { getPluginManager, getManifests, getEnabledPlugins } from "../obsidian-internals";

/** 插件管理 Tab */
export async function renderPluginsTab(
  app: App,
  plugin: XdfGatewayPlugin,
  containerEl: HTMLElement,
  onRefresh: () => void,
): Promise<void> {
  const manifests = getManifests(app);
  const enabledPlugins = getEnabledPlugins(app);
  const pluginManager = getPluginManager(app);

  // XDF 插件区域（置顶）
  containerEl.createEl("h3", { text: "XDF 教学套件" });

  const xdfContainer = containerEl.createDiv({ cls: "xdf-plugin-list" });
  // 置顶插件排在前面
  const sortedPlugins = [...XDF_PLUGINS].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });
  // 先并行获取安装状态，避免设置页因串行 await 卡顿
  const installStates = await Promise.all(
    sortedPlugins.map((p) => plugin.updater.getInstallState(p.id)),
  );

  for (let i = 0; i < sortedPlugins.length; i++) {
    const xdfPlugin = sortedPlugins[i];
    const installState = installStates[i];
    const m = manifests[xdfPlugin.id] as any;
    const description = m?.description || "";
    const isPinned = plugin.settings.pinnedPlugins.includes(xdfPlugin.id);

    const row = xdfContainer.createDiv({ cls: `xdf-plugin-row${isPinned ? " is-pinned" : ""}` });

    // 左侧：名称 + 描述
    const info = row.createDiv({ cls: "xdf-plugin-info" });
    info.createSpan({ text: xdfPlugin.name, cls: "xdf-plugin-name" });
    if (description) {
      info.createSpan({ text: description, cls: "xdf-plugin-desc" });
    }

    // 右侧：Toggle 开关 + 更新/安装按钮
    const actions = row.createDiv({ cls: "xdf-plugin-actions" });

    // Toggle 开关
    const toggleLabel = actions.createEl("label", { cls: "xdf-toggle-switch" });
    const toggleInput = toggleLabel.createEl("input", {
      type: "checkbox",
      cls: "xdf-toggle-input",
    });
    toggleInput.checked = installState === "enabled";
    if (installState === "not_installed") {
      toggleInput.disabled = true;
      toggleInput.checked = false;
      row.addClass("is-not-installed");
    }
    toggleLabel.createSpan({ cls: "xdf-toggle-slider" });

    toggleInput.addEventListener("change", async () => {
      const wantEnable = toggleInput.checked;
      const state = await plugin.updater.getInstallState(xdfPlugin.id);
      if (state === "not_installed") {
        toggleInput.checked = false;
        new Notice(`[XDF Gateway] ${xdfPlugin.name} 尚未安装，请先点击「安装」`);
        return;
      }
      try {
        if (wantEnable) {
          await pluginManager.enablePluginAndSave(xdfPlugin.id);
          new Notice(`[XDF Gateway] 已启用 ${xdfPlugin.name}`);
        } else {
          await pluginManager.disablePluginAndSave(xdfPlugin.id);
          new Notice(`[XDF Gateway] 已禁用 ${xdfPlugin.name}`);
        }
      } catch (error) {
        toggleInput.checked = !wantEnable;
        console.error(`[XDF Gateway] 切换插件状态失败: ${xdfPlugin.id}`, error);
        new Notice(`[XDF Gateway] 操作失败，请查看控制台`);
      }
    });

    // 更新/安装按钮（进度 Notice 在此展示，成功/失败由 updater 内部产出，不重复弹窗）
    const isInstall = installState === "not_installed";
    const updateBtn = actions.createEl("button", {
      text: isInstall ? "安装" : "更新",
      cls: "xdf-update-btn",
    });
    updateBtn.addEventListener("click", () => {
      const notice = new Notice(
        `[XDF Gateway] 正在${isInstall ? "安装" : "更新"} ${xdfPlugin.name}...`,
        0,
      );
      void plugin.updater.updatePlugin(xdfPlugin.id, (stage) => {
        notice.setMessage(`[XDF Gateway] ${xdfPlugin.name}: ${stage}`);
      }).then((ok) => {
        window.setTimeout(() => notice.hide(), 1500);
        if (ok) onRefresh();
      });
    });
  }

  // 一键更新按钮
  new Setting(containerEl)
    .setName("一键更新所有 XDF 插件")
    .addButton((btn) =>
      btn
        .setButtonText("检查并更新")
        .setCta()
        .onClick(async () => {
          await plugin.runUpdateCheck();
          onRefresh();
        }),
    );

  // 插件分组
  containerEl.createEl("h3", { text: "插件分组" });
  const allPluginsContainer = containerEl.createDiv({ cls: "xdf-all-plugins" });

  // 收集已分配到 XDF 套件的插件 ID（避免重复显示）
  const xdfPluginIds = new Set(XDF_PLUGINS.map(p => p.id));
  // 记录已显示过的插件 ID（避免跨分组重复显示）
  const displayedPluginIds = new Set<string>();

  for (const group of plugin.settings.groups) {
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
      // 跳过已在其他分组中显示过的插件
      if (displayedPluginIds.has(pluginId)) continue;

      const m = manifest as any;
      const name = m.name?.toLowerCase() || "";
      const isMatch = keywords.length === 0
        ? true
        : keywords.some((kw) => name.includes(kw));

      if (isMatch) {
        const isPinned = plugin.settings.pinnedPlugins.includes(pluginId);
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
        const wantEnable = toggleInput.checked;
        try {
          if (wantEnable) {
            await pluginManager.enablePluginAndSave(pluginId);
            new Notice(`[XDF Gateway] 已启用 ${m.name}`);
          } else {
            await pluginManager.disablePluginAndSave(pluginId);
            new Notice(`[XDF Gateway] 已禁用 ${m.name}`);
          }
        } catch (error) {
          toggleInput.checked = !wantEnable;
          console.error(`[XDF Gateway] 切换插件状态失败: ${pluginId}`, error);
          new Notice(`[XDF Gateway] 操作失败，请查看控制台`);
        }
      });
    }
    // 记录本分组已显示的插件 ID
    matchedPlugins.forEach(p => displayedPluginIds.add(p.pluginId));
  }
}
