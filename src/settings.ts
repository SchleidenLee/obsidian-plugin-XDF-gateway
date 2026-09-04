/**
 * XDF Gateway 设置管理
 */

import type { GroupConfig, TagConfig, XdfPlugin } from "./types";

export interface GatewaySettings {
  /** 是否启用自动更新 */
  autoUpdate: boolean;
  /** 自动更新间隔（分钟） */
  updateInterval: number;
  /** GitHub Token（提高 API 频率限制） */
  githubToken: string;
  /** 镜像站列表 */
  mirrors: string[];
  /** 代理 URL 模板 */
  proxyTemplate: string;
  /** 分组配置 */
  groups: GroupConfig[];
  /** 标签配置 */
  tags: TagConfig[];
  /** 插件标签关联 */
  pluginTags: { [pluginId: string]: string[] };
  /** 置顶插件 ID 列表 */
  pinnedPlugins: string[];
  /** 紧凑模式（折叠 Core/Community 标题） */
  compactMode: boolean;
  /** 是否显示未分组插件 */
  showUngrouped: boolean;
  /** 上次更新时间 */
  lastUpdateCheck: number;
}

/** XDF 预设插件列表 */
export const XDF_PLUGINS: XdfPlugin[] = [
  { id: "xdf-gateway", name: "XDF Gateway", repo: "SchleidenLee/obsidian-plugin-XDF-gateway", pinned: true },
  { id: "xdf-base", name: "XDF Base", repo: "SchleidenLee/obsidian-plugin-XDF-base" },
  { id: "xdf-classtracker", name: "XDF ClassTracker", repo: "SchleidenLee/obsidian-plugin-XDF-ClassTracker" },
  { id: "xdf-feedback-assistant", name: "XDF Feedback Assistant", repo: "SchleidenLee/obsidian-plugin-XDF-Feedback-Assistant" },
  { id: "xdf-toolkits", name: "XDF Toolkits", repo: "SchleidenLee/obsidian-plugin-XDF-tookits" },
  { id: "xdf-aichatbot", name: "XDF AI Chat", repo: "SchleidenLee/obsidian-plugin-XDF-AIchatbot" },
];

/** 预设分组 */
export const DEFAULT_GROUPS: GroupConfig[] = [
  {
    id: "xdf-suite",
    name: "XDF 教学套件",
    keywords: "xdf,XDF",
    collapsed: false,
    items: [],
  },
  {
    id: "editor",
    name: "编辑器与文件",
    keywords: "editor,code,format,toolbar,ace,file,organizer",
    collapsed: false,
    items: [],
  },
  {
    id: "appearance",
    name: "外观与样式",
    keywords: "style,theme,css,appearance",
    collapsed: false,
    items: [],
  },
  {
    id: "other",
    name: "其他插件",
    keywords: "",
    collapsed: false,
    items: [],
  },
];

/** 预设标签 */
export const DEFAULT_TAGS: TagConfig[] = [
  { id: "tag-calendar", name: "日历", color: "#059669" },
  { id: "tag-ai", name: "AI", color: "#dc2626" },
  { id: "tag-editor", name: "编辑器", color: "#2563eb" },
  { id: "tag-tool", name: "工具", color: "#6b7280" },
];

/** 预设插件标签关联 */
export const DEFAULT_PLUGIN_TAGS: { [pluginId: string]: string[] } = {
  "xdf-gateway": ["tag-tool"],
  "xdf-base": ["tag-tool"],
  "xdf-classtracker": ["tag-calendar"],
  "xdf-feedback-assistant": [],
  "xdf-toolkits": ["tag-tool"],
  "xdf-aichatbot": ["tag-ai"],
};

/** 默认镜像站列表 */
export const DEFAULT_MIRRORS = [
  "https://gh-proxy.com/",
  "https://mirror.ghproxy.com/",
  "https://github.akams.cn/",
  "https://moeyy.cn/gh-proxy/",
  "https://gh.llkk.cc/",
  "https://ghfast.top/",
  "https://github.moeyy.xyz/",
  "https://gitproxy.click/",
];

export const DEFAULT_SETTINGS: GatewaySettings = {
  autoUpdate: true,
  updateInterval: 60,
  githubToken: "",
  mirrors: DEFAULT_MIRRORS,
  proxyTemplate: "{prefix}{url}",
  groups: DEFAULT_GROUPS,
  tags: DEFAULT_TAGS,
  pluginTags: DEFAULT_PLUGIN_TAGS,
  pinnedPlugins: ["xdf-gateway"],
  compactMode: true,
  showUngrouped: true,
  lastUpdateCheck: 0,
};
