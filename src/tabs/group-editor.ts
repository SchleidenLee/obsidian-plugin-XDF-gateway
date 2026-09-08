import { App, Modal, Setting } from "obsidian";
import type XdfGatewayPlugin from "../main";
import type { GroupConfig } from "../types";
import { DEFAULT_GROUPS } from "../settings";

export class GroupEditorModal extends Modal {
  private groups: GroupConfig[];
  private plugin: XdfGatewayPlugin;
  private onRefresh: () => void;

  constructor(app: App, plugin: XdfGatewayPlugin, onRefresh: () => void) {
    super(app);
    this.plugin = plugin;
    this.onRefresh = onRefresh;
    // 使用自定义分组或默认分组
    this.groups = JSON.parse(JSON.stringify(
      plugin.settings.customGroups ?? plugin.settings.groups
    ));
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("xdf-group-editor");

    contentEl.createEl("h2", { text: "管理分组" });

    // 分组列表
    const listEl = contentEl.createDiv({ cls: "xdf-group-list" });
    this.renderGroupList(listEl);

    // 新建分组按钮
    new Setting(contentEl)
      .setName("新建分组")
      .addButton((btn) =>
        btn.setButtonText("+ 新建分组").onClick(() => {
          this.groups.push({
            id: `group-${Date.now()}`,
            name: "新分组",
            keywords: "",
            collapsed: false,
            items: [],
          });
          this.renderGroupList(listEl);
        })
      );

    // 底部按钮
    const footerEl = contentEl.createDiv({ cls: "xdf-group-editor-footer" });
    footerEl.createEl("button", {
      text: "重置为默认",
      cls: "mod-warning",
    }).addEventListener("click", () => {
      this.groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
      this.renderGroupList(listEl);
    });

    footerEl.createEl("button", {
      text: "保存",
      cls: "mod-cta",
    }).addEventListener("click", async () => {
      this.plugin.settings.customGroups = this.groups;
      await this.plugin.saveSettings();
      this.close();
      this.onRefresh();
    });
  }

  private renderGroupList(containerEl: HTMLElement): void {
    containerEl.empty();
    for (let i = 0; i < this.groups.length; i++) {
      const group = this.groups[i];
      const row = containerEl.createDiv({ cls: "xdf-group-editor-row" });

      // 拖拽手柄
      row.createSpan({ cls: "xdf-drag-handle", text: "⠿" });

      // 分组名称输入
      const nameInput = row.createEl("input", {
        type: "text",
        cls: "xdf-group-name-input",
        value: group.name,
      });
      nameInput.addEventListener("change", () => {
        group.name = nameInput.value.trim() || group.name;
      });

      // 关键词输入
      const kwInput = row.createEl("input", {
        type: "text",
        cls: "xdf-group-kw-input",
        value: group.keywords,
        placeholder: "关键词（逗号分隔）",
      });
      kwInput.addEventListener("change", () => {
        group.keywords = kwInput.value;
      });

      // 上移按钮
      if (i > 0) {
        row.createEl("button", { text: "↑" }).addEventListener("click", () => {
          [this.groups[i - 1], this.groups[i]] = [this.groups[i], this.groups[i - 1]];
          this.renderGroupList(containerEl);
        });
      }

      // 下移按钮
      if (i < this.groups.length - 1) {
        row.createEl("button", { text: "↓" }).addEventListener("click", () => {
          [this.groups[i], this.groups[i + 1]] = [this.groups[i + 1], this.groups[i]];
          this.renderGroupList(containerEl);
        });
      }

      // 删除按钮（预设分组不可删，只能重置）
      const isDefault = DEFAULT_GROUPS.some((g) => g.id === group.id);
      if (!isDefault) {
        row.createEl("button", { text: "✕", cls: "xdf-group-delete-btn" }).addEventListener("click", () => {
          this.groups.splice(i, 1);
          this.renderGroupList(containerEl);
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function openGroupEditor(app: App, plugin: XdfGatewayPlugin, onRefresh: () => void): void {
  new GroupEditorModal(app, plugin, onRefresh).open();
}
