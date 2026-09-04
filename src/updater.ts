/**
 * 插件更新引擎
 * 参考 BRAT 的 BetaPlugins 类实现
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
import type { PluginUpdateInfo, ReleaseFiles } from "./types";

/**
 * 插件更新管理器
 * 负责检查更新、下载文件、写入磁盘、热重载
 */
export class PluginUpdater {
  private app: App;
  private settings: GatewaySettings;

  constructor(app: App, settings: GatewaySettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * 更新设置引用（设置变更后调用）
   */
  updateSettings(settings: GatewaySettings): void {
    this.settings = settings;
  }

  /**
   * 检查所有 XDF 插件的更新
   * @returns 有可用更新的插件列表
   */
  async checkForUpdates(): Promise<PluginUpdateInfo[]> {
    const updates: PluginUpdateInfo[] = [];

    for (const plugin of XDF_PLUGINS) {
      try {
        const info = await this.checkSinglePluginUpdate(plugin);
        if (info) {
          updates.push(info);
        }
      } catch (error) {
        if (error instanceof GHRateLimitError) {
          new Notice(
            `[XDF-Gateway] GitHub API 频率限制，${error.getMinutesToReset()} 分钟后重试。`,
            15000,
          );
          // 触发 rate limit 后停止后续检查，避免继续浪费配额
          break;
        }
        console.error(
          `[XDF-Gateway] 检查插件更新失败: ${plugin.name}`,
          error,
        );
      }
    }

    return updates;
  }

  /**
   * 检查单个插件是否有更新
   */
  private async checkSinglePluginUpdate(
    plugin: { id: string; name: string; repo: string },
  ): Promise<PluginUpdateInfo | null> {
    // 读取本地 manifest.json 获取当前版本
    const localVersion = await this.getLocalVersion(plugin.id);
    if (!localVersion) {
      // 本地未安装，跳过
      return null;
    }

    // 获取 GitHub 最新版本
    const release = await grabReleaseFromRepository(plugin.repo, this.settings);
    if (!release) {
      console.warn(`[XDF-Gateway] 未找到 Release: ${plugin.repo}`);
      return null;
    }

    const latestVersion = release.tag_name;

    // 版本比较
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
   * 更新指定插件到最新版本
   *
   * @param pluginId - 插件 ID（对应 XDF_PLUGINS 中的 id）
   * @returns 是否更新成功
   */
  async updatePlugin(pluginId: string): Promise<boolean> {
    const pluginDef = XDF_PLUGINS.find((p) => p.id === pluginId);
    if (!pluginDef) {
      new Notice(`[XDF-Gateway] 未找到插件定义: ${pluginId}`);
      return false;
    }

    try {
      // 获取最新 Release
      const release = await grabReleaseFromRepository(
        pluginDef.repo,
        this.settings,
      );
      if (!release) {
        new Notice(`[XDF-Gateway] 未找到 Release: ${pluginDef.repo}`);
        return false;
      }

      // 下载全部文件
      const files = await grabAllReleaseFiles(release, this.settings);
      if (!files.mainJs) {
        new Notice(`[XDF-Gateway] Release 文件不完整，缺少 main.js`);
        return false;
      }

      // 写入文件
      await this.writeReleaseFilesToPluginFolder(pluginId, files);

      // 热重载
      await this.reloadPlugin(pluginId);

      new Notice(
        `[XDF-Gateway] ${pluginDef.name} 已更新至 ${release.tag_name}`,
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
        new Notice(`[XDF-Gateway] 更新 ${pluginDef.name} 失败，请查看控制台。`);
      }
      return false;
    }
  }

  /**
   * 批量更新所有有更新的插件
   * @returns 成功更新的插件数量
   */
  async updateAll(updates: PluginUpdateInfo[]): Promise<number> {
    if (updates.length === 0) {
      new Notice("[XDF-Gateway] 所有插件均为最新版本。");
      return 0;
    }

    new Notice(`[XDF-Gateway] 正在更新 ${updates.length} 个插件...`);

    let successCount = 0;
    for (const update of updates) {
      const success = await this.updatePlugin(update.id);
      if (success) successCount++;
    }

    new Notice(
      `[XDF-Gateway] 更新完成: ${successCount}/${updates.length} 个插件已成功更新。`,
    );
    return successCount;
  }

  /**
   * 将 Release 文件写入插件目录
   * 使用 Obsidian 的 vault.adapter API
   */
  async writeReleaseFilesToPluginFolder(
    pluginId: string,
    files: ReleaseFiles,
  ): Promise<void> {
    const pluginFolder = normalizePath(
      `${this.app.vault.configDir}/plugins/${pluginId}`,
    );
    const { adapter } = this.app.vault;

    // 确保目录存在
    if (!(await adapter.exists(pluginFolder))) {
      await adapter.mkdir(pluginFolder);
    }

    // 写入文件
    await adapter.write(`${pluginFolder}/main.js`, files.mainJs ?? "");
    await adapter.write(`${pluginFolder}/manifest.json`, files.manifest ?? "");
    if (files.styles) {
      await adapter.write(`${pluginFolder}/styles.css`, files.styles);
    }
  }

  /**
   * 热重载插件（先禁用再启用）
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    // plugins 是 Obsidian 内部 API，不在公共类型中
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins = (this.app as any).plugins;
    try {
      await plugins.disablePlugin(pluginId);
      await plugins.enablePlugin(pluginId);
    } catch (error) {
      console.error(`[XDF-Gateway] 重载插件失败: ${pluginId}`, error);
    }
  }

  /**
   * 读取本地插件 manifest.json 中的版本号
   */
  private async getLocalVersion(pluginId: string): Promise<string | null> {
    const manifestPath = normalizePath(
      `${this.app.vault.configDir}/plugins/${pluginId}/manifest.json`,
    );

    try {
      const { adapter } = this.app.vault;
      if (!(await adapter.exists(manifestPath))) {
        return null;
      }
      const content = await adapter.read(manifestPath);
      const manifest: PluginManifest = JSON.parse(content);
      return manifest.version ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 比较两个版本字符串，判断 remote 是否比 local 更新
   * 优先使用 semver 比较，fallback 到字符串比较
   */
  private isNewerVersion(local: string, remote: string): boolean {
    const localVer = semverCoerce(local);
    const remoteVer = semverCoerce(remote);

    if (localVer && remoteVer) {
      return compareVersions(remoteVer, localVer) > 0;
    }

    // fallback: 字符串比较
    return local !== remote;
  }
}
