/**
 * XDF Gateway 类型定义
 */

/** XDF 预设插件 */
export interface XdfPlugin {
  id: string;
  name: string;
  repo: string;
  pinned?: boolean; // 是否置顶
}

/** 分组配置 */
export interface GroupConfig {
  id: string;
  name: string;
  keywords: string;
  collapsed: boolean;
  items: GroupItem[];
}

/** 分组内的插件项 */
export interface GroupItem {
  pluginId: string;
  alias?: string;
  order?: number;
}

/** 插件更新信息 */
export interface PluginUpdateInfo {
  id: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
  repo: string;
}

/** GitHub Release 信息 */
export interface Release {
  url: string;
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  assets: {
    name: string;
    url: string;
    browser_download_url: string;
  }[];
}

/** Release 文件内容 */
export interface ReleaseFiles {
  mainJs: string | null;
  manifest: string | null;
  styles: string | null;
}

/** 镜像站配置 */
export interface MirrorConfig {
  mirrors: string[];
  proxyTemplate: string;
}
