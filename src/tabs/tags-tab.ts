import { Setting } from "obsidian";
import type { App } from "obsidian";
import type XdfGatewayPlugin from "../main";
import type { TagConfig } from "../types";
import { getManifests } from "../obsidian-internals";

/** 标签管理 Tab */
export function renderTagsTab(
  app: App,
  plugin: XdfGatewayPlugin,
  containerEl: HTMLElement,
  onRefresh: () => void,
): void {
  containerEl.createEl("h3", { text: "标签管理" });
  containerEl.createEl("p", {
    text: "为插件添加标签，方便分类和筛选。",
    cls: "mod-muted",
  });

  // 标签列表
  const tagsContainer = containerEl.createDiv({ cls: "xdf-tags-list" });
  for (const tag of plugin.settings.tags) {
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
      await plugin.saveSettings();
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
      await plugin.saveSettings();
    });

    // 删除按钮
    const deleteBtn = tagRow.createEl("button", {
      cls: "xdf-tag-delete-btn",
      text: "删除",
    });
    deleteBtn.addEventListener("click", async () => {
      plugin.settings.tags = plugin.settings.tags.filter(t => t.id !== tag.id);
      // 清理插件标签关联
      for (const pluginId of Object.keys(plugin.settings.pluginTags)) {
        plugin.settings.pluginTags[pluginId] = plugin.settings.pluginTags[pluginId].filter(tid => tid !== tag.id);
      }
      await plugin.saveSettings();
      onRefresh();
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
          plugin.settings.tags.push(newTag);
          await plugin.saveSettings();
          onRefresh();
        }),
    );

  // 插件标签关联
  containerEl.createEl("h3", { text: "插件标签" });
  const manifests = getManifests(app);

  for (const [pluginId, manifest] of Object.entries(manifests)) {
    const m = manifest as any;
    const pluginTags = plugin.settings.pluginTags[pluginId] || [];

    const row = containerEl.createDiv({ cls: "xdf-plugin-tag-row" });
    row.createSpan({ text: m.name, cls: "xdf-plugin-tag-name" });

    const tagsEl = row.createDiv({ cls: "xdf-plugin-tags" });
    for (const tagId of pluginTags) {
      const tag = plugin.settings.tags.find(t => t.id === tagId);
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
    for (const tag of plugin.settings.tags) {
      if (!pluginTags.includes(tag.id)) {
        addTagSelect.createEl("option", { text: tag.name, value: tag.id });
      }
    }
    addTagSelect.addEventListener("change", async () => {
      const tagId = addTagSelect.value;
      if (tagId) {
        if (!plugin.settings.pluginTags[pluginId]) {
          plugin.settings.pluginTags[pluginId] = [];
        }
        plugin.settings.pluginTags[pluginId].push(tagId);
        await plugin.saveSettings();
        onRefresh();
      }
    });
  }
}
