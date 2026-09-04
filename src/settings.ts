/**
 * XDF Gateway 设置管理
 */

import type { GroupConfig, XdfPlugin } from "./types";

export interface GatewaySettings {
  /** 是否启用自动更新 */
  autoUpdate: boolean;
  /** 自动更新间隔（分钟） */
  updateInterval: number;
  /** 镜像站列表 */
  mirrors: string[];
  /** 代理 URL 模板 */
  proxyTemplate: string;
  /** 分组配置 */
  groups: GroupConfig[];
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
    name: "编辑器增强",
    keywords: "editor,code,format,toolbar,ace",
    collapsed: false,
    items: [],
  },
  {
    id: "calendar",
    name: "日历与排班",
    keywords: "calendar,calendar,schedule,tracker",
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

/** 默认镜像站列表 */
export const DEFAULT_MIRRORS = [
  "https://gh-proxy.com/",
  "https://ghproxy.net/",
  "https://gh.llkk.cc/",
  "https://ghfast.top/",
];

export const DEFAULT_SETTINGS: GatewaySettings = {
  autoUpdate: true,
  updateInterval: 60,
  mirrors: DEFAULT_MIRRORS,
  proxyTemplate: "{prefix}{url}",
  groups: DEFAULT_GROUPS,
  compactMode: true,
  showUngrouped: true,
  lastUpdateCheck: 0,
};
