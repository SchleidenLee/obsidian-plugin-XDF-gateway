/**
 * 插件更新引擎
 * 参考 BRAT 的 BetaPlugins 类 + BPM 的 installPluginFromGithub 实现
 */

import type { App, PluginManifest } from "obsidian";
import { Notice, normalizePath } from "obsidian";
import type { GatewaySettings } from "./settings";
import { XDF_PLUGINS } from "./settings";
import {
  compareVersions,
  semverCoerce,
  grabReleaseFromRepository,
  grabAllReleaseFiles,
  GHRateLimitError,
} from "./github";
import { getPluginManager } from "./obsidian-internals";
import type { PluginInstallState, PluginUpdateInfo, ReleaseFiles } from "./types";

export class PluginUpdater {
  private app: App;
  private settings: GatewaySettings;

  constructor(app: App, settings: GatewaySettings) {
    this.app = app;
    this.settings = settings;
  }

  updateSettings(settings: GatewaySettings): void {
    this.settings = settings;
  }

  /**
   * 检查所有 XDF 插件的更新
   * @param onProgress - 进度回调 (current, total, name)
   */
  async checkForUpdates(
    onProgress?: (current: number, total: number, name: string) => void,
  ): Promise<PluginUpdateInfo[]> {
    const updates: PluginUpdateInfo[] = [];
    const total = XDF_PLUGINS.length;

    for (let i = 0; i < total; i++) {
      const plugin = XDF_PLUGINS[i];
      onProgress?.(i + 1, total, plugin.name);

      try {
        const info = await this.checkSinglePluginUpdate(plugin);
        if (info) updates.push(info);
      } catch (error) {
        if (error instanceof GHRateLimitError) {
          throw error;
        }
        console.error(`[XDF-Gateway] 检查插件更新失败: ${plugin.name}`, error);
      }
    }

    return updates;
  }

  private async checkSinglePluginUpdate(
    plugin: { id: string; name: string; repo: string },
  ): Promise<PluginUpdateInfo | null> {
    const localVersion = await this.getLocalVersion(plugin.id);

    const release = await grabReleaseFromRepository(plugin.repo, this.settings);
    if (!release) {
      console.warn(`[XDF-Gateway] 未找到 Release: ${plugin.repo}`);
      return null;
    }

    const latestVersion = release.tag_name;

    // 未安装 → 视为需要安装（currentVersion 为 null）
    if (!localVersion) {
      return {
        id: plugin.id,
        name: plugin.name,
        currentVersion: null,
        latestVersion: latestVersion,
        repo: plugin.repo,
      };
    }

    if (this.isNewerVersion(localVersion, latestVersion)) {
      return {
        id: plugin.id,
        name: plugin.name,
        currentVersion: localVersion,
        latestVersion: latestVersion,
        repo: plugin.repo,
      };
    }

    return null;
  }

  /**
   * 更新单个插件
   * @param onProgress - 进度回调 (stage: string)
   */
  async updatePlugin(
    pluginId: string,
    onProgress?: (stage: string) => void,
  ): Promise<boolean> {
    const pluginDef = XDF_PLUGINS.find((p) => p.id === pluginId);
    if (!pluginDef) {
      new Notice(`[XDF-Gateway] 未找到插件定义: ${pluginId}`);
      return false;
    }

    // 记录安装前状态，用于区分安装/更新文案
    const wasInstalled = !!(await this.getLocalVersion(pluginId));

    try {
      onProgress?.("获取 Release 信息...");
      const release = await grabReleaseFromRepository(
        pluginDef.repo,
        this.settings,
      );
      if (!release) {
        new Notice(`[XDF-Gateway] 未找到 Release: ${pluginDef.repo}`);
        return false;
      }

      onProgress?.("下载文件...");
      const files = await grabAllReleaseFiles(release, this.settings);
      if (!files.mainJs) {
        new Notice(`[XDF-Gateway] Release 文件不完整，缺少 main.js`);
        return false;
      }

      onProgress?.("写入文件...");
      await this.writeReleaseFilesToPluginFolder(pluginId, files);

      onProgress?.("重载插件...");
      await this.reloadPlugin(pluginId, wasInstalled ? undefined : true);

      new Notice(
        `[XDF-Gateway] ${pluginDef.name} 已${wasInstalled ? "更新" : "安装"}至 ${release.tag_name}`,
        8000,
      );
      return true;
    } catch (error) {
      if (error instanceof GHRateLimitError) {
        new Notice(
          `[XDF-Gateway] GitHub API 频率限制，${error.getMinutesToReset()} 分钟后重试。`,
          15000,
        );
      } else {
        console.error(`[XDF-Gateway] 更新插件失败: ${pluginId}`, error);
        new Notice(
          `[XDF-Gateway] ${pluginDef.name} ${wasInstalled ? "更新失败" : "安装失败"}，请查看控制台。`,
        );
      }
      return false;
    }
  }

  /**
   * 批量更新
   * @param onProgress - 进度回调 (current, total, name, stage)
   */
  async updateAll(
    updates: PluginUpdateInfo[],
    onProgress?: (current: number, total: number, name: string, stage: string) => void,
  ): Promise<number> {
    if (updates.length === 0) {
      new Notice("[XDF-Gateway] 所有插件均已安装且为最新版本。");
      return 0;
    }

    let successCount = 0;
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      onProgress?.(i + 1, updates.length, update.name, "开始更新");
      const success = await this.updatePlugin(update.id, (stage) => {
        onProgress?.(i + 1, updates.length, update.name, stage);
      });
      if (success) successCount++;
    }

    new Notice(
      `[XDF-Gateway] 安装/更新完成: ${successCount}/${updates.length} 个插件已成功处理。`,
    );
    return successCount;
  }

  async writeReleaseFilesToPluginFolder(
    pluginId: string,
    files: ReleaseFiles,
  ): Promise<void> {
    const pluginFolder = normalizePath(
      `${this.app.vault.configDir}/plugins/${pluginId}`,
    );
    const { adapter } = this.app.vault;

    if (!(await adapter.exists(pluginFolder))) {
      await adapter.mkdir(pluginFolder);
    }

    await adapter.write(`${pluginFolder}/main.js`, files.mainJs ?? "");
    await adapter.write(`${pluginFolder}/manifest.json`, files.manifest ?? "");
    if (files.styles) {
      await adapter.write(`${pluginFolder}/styles.css`, files.styles);
    }
  }

  async reloadPlugin(pluginId: string, forceEnable?: boolean): Promise<void> {
    const plugins = getPluginManager(this.app);
    const wasEnabled = plugins.enabledPlugins.has(pluginId);
    try {
      await plugins.disablePlugin(pluginId);
    } catch {}
    await plugins.loadManifests();
    const shouldEnable = forceEnable ?? wasEnabled;
    if (!shouldEnable) return;
    try {
      await plugins.loadPlugin?.(pluginId);
    } catch {}
    await plugins.enablePluginAndSave(pluginId);
  }

  async getInstallState(pluginId: string): Promise<PluginInstallState> {
    const localVersion = await this.getLocalVersion(pluginId);
    if (!localVersion) return "not_installed";
    return getPluginManager(this.app).enabledPlugins.has(pluginId) ? "enabled" : "disabled";
  }

  private async getLocalVersion(pluginId: string): Promise<string | null> {
    const manifestPath = normalizePath(
      `${this.app.vault.configDir}/plugins/${pluginId}/manifest.json`,
    );

    try {
      const { adapter } = this.app.vault;
      if (!(await adapter.exists(manifestPath))) return null;
      const content = await adapter.read(manifestPath);
      const manifest: PluginManifest = JSON.parse(content);
      return manifest.version ?? null;
    } catch {
      return null;
    }
  }

  private isNewerVersion(local: string, remote: string): boolean {
    const localVer = semverCoerce(local);
    const remoteVer = semverCoerce(remote);

    if (localVer && remoteVer) {
      return compareVersions(remoteVer, localVer) > 0;
    }

    return local !== remote;
  }
}
