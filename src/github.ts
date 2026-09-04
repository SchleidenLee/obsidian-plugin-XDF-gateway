/**
 * GitHub API 通信层 - 带镜像站 fallback
 * 参考 BRAT 的 githubUtils.ts 实现
 */

import {
  type RequestUrlParam,
  type RequestUrlResponse,
  requestUrl,
} from "obsidian";
import type { GatewaySettings } from "./settings";
import type { Release, ReleaseFiles } from "./types";

// ─── 错误类 ─────────────────────────────────────────────────────────────────

/** GitHub API 频率限制错误 */
export class GHRateLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly remaining: number,
    public readonly reset: number,
    public readonly requestUrl: string,
  ) {
    const minutesToReset = Math.ceil((reset - Math.floor(Date.now() / 1000)) / 60);
    super(`GitHub API 频率限制已用尽，${minutesToReset} 分钟后重置。`);
    this.name = "GHRateLimitError";
  }

  /** 距离重置的分钟数 */
  getMinutesToReset(): number {
    return Math.ceil((this.reset - Math.floor(Date.now() / 1000)) / 60);
  }
}

/** GitHub API 响应错误 */
export class GitHubResponseError extends Error {
  public readonly status: number;
  public readonly headers: Record<string, string>;

  constructor(error: Error) {
    super(`GitHub API 错误: ${error.message}`);
    this.name = "GitHubResponseError";
    const ghError = error as GitHubResponseError;
    this.status = ghError.status ?? 400;
    this.headers = ghError.headers ?? {};
  }
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** 将 headers 的 key 全部转为小写，方便统一读取 */
function normalizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.keys(headers).reduce(
    (acc, key) => {
      acc[key.toLowerCase()] = headers[key];
      return acc;
    },
    {} as Record<string, string>,
  );
}

/**
 * 判断 URL 是否需要走镜像站
 * 仅 github.com 和 raw.githubusercontent.com 的请求需要代理
 */
function needsProxy(url: string): boolean {
  return (
    url.includes("github.com") ||
    url.includes("raw.githubusercontent.com") ||
    url.includes("api.github.com")
  );
}

/**
 * 使用镜像模板生成代理 URL
 * 模板格式: "{prefix}{url}" — prefix 是镜像前缀，url 是原始 URL
 */
function buildProxyUrl(url: string, prefix: string, template: string): string {
  return template.replace("{prefix}", prefix).replace("{url}", url);
}

/**
 * 简易 semver 版本比较
 * 将版本字符串拆分为数字数组，逐段比较
 * 返回: 1 (a > b), -1 (a < b), 0 (相等)
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * 简易 semver coerce — 从任意版本字符串中提取 x.y.z 格式
 * 例如 "v1.2.3-beta" → "1.2.3"，"2.0" → "2.0.0"
 */
export function semverCoerce(version: string): string | null {
  if (!version) return null;
  // 去掉前缀 v/V
  const cleaned = version.replace(/^[vV]/, "");
  // 尝试匹配 x.y.z（可能带后缀）
  const match = cleaned.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  const major = match[1] ?? "0";
  const minor = match[2] ?? "0";
  const patch = match[3] ?? "0";
  return `${major}.${minor}.${patch}`;
}

// ─── 核心请求函数 ────────────────────────────────────────────────────────────

/**
 * 带镜像站 fallback 的 GitHub 请求
 *
 * 流程:
 * 1. 如果 URL 需要代理，先尝试原始 URL
 * 2. 失败后依次尝试每个镜像站
 * 3. 全部失败才抛出错误
 *
 * @param options - Obsidian requestUrl 参数
 * @param settings - 网关设置（包含镜像配置）
 * @returns RequestUrlResponse
 */
export async function gitHubRequest(
  options: RequestUrlParam,
  settings: GatewaySettings,
): Promise<RequestUrlResponse> {
  // 注入 User-Agent header 和可选的 Token
  options.headers = {
    ...options.headers,
    "User-Agent": "Obsidian/XDF-Gateway",
  };
  if (settings.githubToken) {
    options.headers["Authorization"] = `token ${settings.githubToken}`;
  }

  // 如果不需要代理，直接请求
  if (!needsProxy(options.url)) {
    return await doRequest(options);
  }

  // 收集所有错误，全部失败时抛出最后一个
  let lastError: Error | null = null;
  let rateLimitHit = false;

  // 先尝试原始 URL（有时直连也能通）
  try {
    return await doRequest(options);
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    if (error instanceof GHRateLimitError) {
      rateLimitHit = true;
    }
    // rate limit 也继续试镜像站，不同镜像站有独立配额
  }

  // 依次尝试每个镜像站
  const { mirrors, proxyTemplate } = settings;
  for (const mirror of mirrors) {
    try {
      const proxyUrl = buildProxyUrl(options.url, mirror, proxyTemplate);
      const proxyOptions: RequestUrlParam = {
        ...options,
        url: proxyUrl,
      };
      return await doRequest(proxyOptions);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // rate limit 也继续试下一个镜像站
      continue;
    }
  }

  // 全部失败，如果是 rate limit 给出更明确的提示
  if (rateLimitHit) {
    throw new Error("GitHub API 频率限制已用尽，所有镜像站均无法访问。请稍后重试或配置 GitHub Token。");
  }
  throw lastError ?? new Error("所有镜像站均请求失败");
}

/**
 * 执行单次 HTTP 请求，解析 rate limit 错误
 */
async function doRequest(
  options: RequestUrlParam,
): Promise<RequestUrlResponse> {
  try {
    return await requestUrl(options);
  } catch (error) {
    // 解析 rate limit
    const ghError = new GitHubResponseError(error as Error);
    const headers = normalizeHeaders(ghError.headers);

    const limit = parseInt(headers["x-ratelimit-limit"] ?? "0", 10);
    const remaining = parseInt(headers["x-ratelimit-remaining"] ?? "0", 10);
    const reset = parseInt(headers["x-ratelimit-reset"] ?? "0", 10);

    // 403 + remaining=0 表示触发了频率限制
    if (ghError.status === 403 && remaining === 0) {
      throw new GHRateLimitError(limit, remaining, reset, options.url);
    }

    throw ghError;
  }
}

// ─── 高层 API ────────────────────────────────────────────────────────────────

/**
 * 获取仓库的 Release 信息
 *
 * @param repo - 仓库路径，格式: USERNAME/repository
 * @param version - 可选，指定版本/tag。不传则获取最新 Release
 * @param settings - 网关设置
 * @returns Release 信息，未找到返回 null
 */
export async function grabReleaseFromRepository(
  repo: string,
  settings: GatewaySettings,
  version?: string,
): Promise<Release | null> {
  const apiUrl =
    version && version !== "latest"
      ? `https://api.github.com/repos/${repo}/releases/tags/${version}`
      : `https://api.github.com/repos/${repo}/releases`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };

  const response = await gitHubRequest(
    { url: apiUrl, headers },
    settings,
  );

  if (response.status === 404) return null;

  const json: unknown = response.json;

  // 指定版本时返回单个 release，否则返回列表
  const releases: Release[] =
    version && version !== "latest"
      ? json && typeof json === "object"
        ? [json as Release]
        : []
      : Array.isArray(json)
        ? (json as Release[])
        : [];

  if (releases.length === 0) return null;

  // 按版本号降序排列，取最新的非 prerelease
  return (
    releases
      .sort((a, b) => {
        const aVer = semverCoerce(a.tag_name);
        const bVer = semverCoerce(b.tag_name);
        if (aVer && bVer) {
          return compareVersions(bVer, aVer);
        }
        if (aVer && !bVer) return -1;
        if (!aVer && bVer) return 1;
        // fallback: 按发布时间排序
        const aDate = new Date(a.published_at).getTime();
        const bDate = new Date(b.published_at).getTime();
        return bDate - aDate;
      })
      .filter((r) => !r.prerelease)[0] ?? null
  );
}

/**
 * 从 Release 中下载指定文件
 *
 * @param release - Release 信息
 * @param fileName - 要下载的文件名（如 main.js, manifest.json, styles.css）
 * @param settings - 网关设置
 * @returns 文件内容字符串，失败返回 null
 */
export async function grabReleaseFileFromRepository(
  release: Release,
  fileName: string,
  settings: GatewaySettings,
): Promise<string | null> {
  const asset = release.assets.find((a) => a.name === fileName);
  if (!asset) return null;

  try {
    const response = await gitHubRequest(
      {
        url: asset.browser_download_url,
        headers: { Accept: "application/octet-stream" },
      },
      settings,
    );
    return response.status === 200 ? response.text : null;
  } catch (error) {
    console.error(`[XDF-Gateway] 下载文件失败: ${fileName}`, error);
    return null;
  }
}

/**
 * 获取仓库最新版本号（便捷方法）
 *
 * @param repo - 仓库路径，格式: USERNAME/repository
 * @param settings - 网关设置
 * @returns 最新版本号字符串，失败返回 null
 */
export async function grabLatestRelease(
  repo: string,
  settings: GatewaySettings,
): Promise<string | null> {
  const release = await grabReleaseFromRepository(repo, settings);
  return release?.tag_name ?? null;
}

/**
 * 下载插件的全部 Release 文件
 *
 * @param release - Release 信息
 * @param settings - 网关设置
 * @returns ReleaseFiles 对象
 */
export async function grabAllReleaseFiles(
  release: Release,
  settings: GatewaySettings,
): Promise<ReleaseFiles> {
  const [mainJs, manifest, styles] = await Promise.all([
    grabReleaseFileFromRepository(release, "main.js", settings),
    grabReleaseFileFromRepository(release, "manifest.json", settings),
    grabReleaseFileFromRepository(release, "styles.css", settings),
  ]);
  return { mainJs, manifest, styles };
}

// ─── 版本列表 API ─────────────────────────────────────────────────────────────

/**
 * 获取仓库所有 Release 版本列表
 *
 * @param repo - 仓库路径，格式: USERNAME/repository
 * @param settings - 网关设置
 * @returns 版本列表，每项包含 tag_name 和 prerelease 标记
 */
export async function getReleaseVersions(
  repo: string,
  settings: GatewaySettings,
): Promise<{ tag_name: string; prerelease: boolean }[]> {
  const apiUrl = `https://api.github.com/repos/${repo}/releases?per_page=100`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };

  const response = await gitHubRequest({ url: apiUrl, headers }, settings);
  const json: unknown = response.json;
  if (!Array.isArray(json)) return [];

  return json.map((r: Release) => ({
    tag_name: r.tag_name,
    prerelease: r.prerelease,
  }));
}

// ─── 两级回退下载 ─────────────────────────────────────────────────────────────

/**
 * 生成 raw tag 的候选 tag 名
 * 例如 "v1.2.3" → ["v1.2.3", "1.2.3"]，"1.2.3" → ["1.2.3", "v1.2.3"]
 */
function buildRawTagCandidates(tag: string): string[] {
  const candidates = [tag];
  if (tag.startsWith("v") && tag.length > 1) {
    candidates.push(tag.slice(1));
  } else {
    candidates.push(`v${tag}`);
  }
  return Array.from(new Set(candidates));
}

/**
 * 从 raw.githubusercontent.com 按 tag 下载单个文件
 * 尝试 tag 及其变体（v 前缀 / 无前缀）
 */
async function fetchRawFromTag(
  repo: string,
  tag: string,
  fileName: string,
  settings: GatewaySettings,
): Promise<string | null> {
  for (const candidateTag of buildRawTagCandidates(tag)) {
    try {
      const url = `https://raw.githubusercontent.com/${repo}/${candidateTag}/${fileName}`;
      const response = await gitHubRequest(
        { url, headers: { Accept: "*/*" } },
        settings,
      );
      return response.status === 200 ? response.text : null;
    } catch {
      // 尝试下一个 tag 变体
      continue;
    }
  }
  return null;
}

/**
 * 下载 Release 文件（两级回退：Assets → Raw Tag）
 *
 * 流程:
 * 1. 先获取 Release 对象
 * 2. 尝试从 assets 下载 main.js, manifest.json, styles.css
 * 3. 如果 assets 不完整，回退到 raw.githubusercontent.com/{repo}/{tag}/filename
 *    tag 尝试 v{version} 和 {version} 两种前缀
 *
 * @param repo - 仓库路径，格式: USERNAME/repository
 * @param version - 版本号（tag_name），如 "1.2.3" 或 "v1.2.3"
 * @param settings - 网关设置
 * @returns ReleaseFiles 对象
 */
export async function downloadReleaseFiles(
  repo: string,
  version: string,
  settings: GatewaySettings,
): Promise<ReleaseFiles> {
  // 第一级：获取 Release 对象，尝试从 assets 下载
  const release = await grabReleaseFromRepository(repo, settings, version);

  let files: ReleaseFiles;
  if (release) {
    files = await grabAllReleaseFiles(release, settings);
  } else {
    files = { mainJs: null, manifest: null, styles: null };
  }

  // 第二级：如果 assets 不完整，回退到 raw tag
  const tag = release?.tag_name ?? version;
  const needsFallback = !files.mainJs || !files.manifest;

  if (needsFallback) {
    const [rawMainJs, rawManifest, rawStyles] = await Promise.all([
      files.mainJs ?? fetchRawFromTag(repo, tag, "main.js", settings),
      files.manifest ?? fetchRawFromTag(repo, tag, "manifest.json", settings),
      files.styles ?? fetchRawFromTag(repo, tag, "styles.css", settings),
    ]);

    files = {
      mainJs: files.mainJs ?? rawMainJs,
      manifest: files.manifest ?? rawManifest,
      styles: files.styles ?? rawStyles,
    };
  }

  return files;
}
