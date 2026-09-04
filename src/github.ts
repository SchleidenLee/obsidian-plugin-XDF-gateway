/**
 * GitHub API 通信层 - 带镜像站 fallback
 * 参考 BPM (obsidian-manager) 的 github-url.ts 实现
 */

import {
  type RequestUrlParam,
  type RequestUrlResponse,
  requestUrl,
} from "obsidian";
import type { GatewaySettings } from "./settings";
import type { Release, ReleaseFiles } from "./types";

// ─── 错误类 ────────────────────────────────────────────────────────────────

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

  getMinutesToReset(): number {
    return Math.ceil((this.reset - Math.floor(Date.now() / 1000)) / 60);
  }
}

/** GitHub API 响应错误 */
export class GitHubResponseError extends Error {
  public readonly status: number;
  public readonly headers: Record<string, string>;

  constructor(error: Error, status?: number, headers?: Record<string, string>) {
    super(`GitHub API 错误: ${error.message}`);
    this.name = "GitHubResponseError";
    const ghError = error as GitHubResponseError;
    this.status = status ?? ghError.status ?? 400;
    this.headers = headers ?? ghError.headers ?? {};
  }
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

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

function readRateLimitHeader(
  headers: Record<string, string>,
  name: string,
): number {
  const value = parseInt(headers[name] ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

function errorFromFailedResponse(
  response: RequestUrlResponse,
  requestUrlValue: string,
): Error {
  const headers = normalizeHeaders(response.headers ?? {});
  if (response.status === 403) {
    return new GHRateLimitError(
      readRateLimitHeader(headers, "x-ratelimit-limit"),
      readRateLimitHeader(headers, "x-ratelimit-remaining"),
      readRateLimitHeader(headers, "x-ratelimit-reset"),
      requestUrlValue,
    );
  }
  return new GitHubResponseError(
    new Error(`HTTP ${response.status}`),
    response.status,
    headers,
  );
}

/** 所有需要走代理的 GitHub 域名（参考 BPM） */
const GITHUB_HOSTS = new Set([
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "codeload.github.com",
]);

function isGithubUrl(url: string): boolean {
  try {
    return GITHUB_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 代理 URL 重写（参考 BPM 的 rewriteGithubUrl）
 * 支持 3 种模板格式：
 * - {url}       → 原始 URL 直接替换
 * - {encodedUrl} → URL 编码后替换
 * - 前缀模式     → proxy + "/" + url
 */
function rewriteGithubUrl(url: string, proxy: string): string {
  if (!proxy || !isGithubUrl(url)) return url;

  const encodedUrl = encodeURIComponent(url);
  if (proxy.includes("{encodedUrl}")) return proxy.replace(/\{encodedUrl\}/g, encodedUrl);
  if (proxy.includes("{url}")) return proxy.replace(/\{url\}/g, url);

  // 前缀模式
  const prefix = proxy.replace(/\/+$/g, "");
  return `${prefix}/${url}`;
}

// ─── 简易 semver ─────────────────────────────────────────────────────────────

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

export function semverCoerce(version: string): string | null {
  if (!version) return null;
  const cleaned = version.replace(/^[vV]/, "");
  const match = cleaned.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return `${match[1] ?? "0"}.${match[2] ?? "0"}.${match[3] ?? "0"}`;
}

// ─── 请求缓存 ────────────────────────────────────────────────────────────────

interface CacheEntry {
  expiresAt: number;
  response: RequestUrlResponse;
}

const requestCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

function getCached(url: string): RequestUrlResponse | null {
  const entry = requestCache.get(url);
  if (entry && entry.expiresAt > Date.now()) return entry.response;
  requestCache.delete(url);
  return null;
}

function setCache(url: string, response: RequestUrlResponse): void {
  requestCache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, response });
}

// ─── 核心请求函数 ────────────────────────────────────────────────────────────

/**
 * 带镜像站 fallback 的 GitHub 请求
 *
 * 流程：
 * 1. 先直连（如果配置了 Token，直连配额更高）
 * 2. 失败后依次尝试每个镜像站
 * 3. 全部失败才抛出错误
 */
export async function gitHubRequest(
  options: RequestUrlParam,
  settings: GatewaySettings,
): Promise<RequestUrlResponse> {
  // 构建 headers
  const headers: Record<string, string> = {
    ...options.headers,
    "User-Agent": "Obsidian/XDF-Gateway",
  };
  if (settings.githubToken) {
    headers["Authorization"] = `token ${settings.githubToken}`;
  }

  const requestOptions: RequestUrlParam = {
    ...options,
    headers,
  };

  // 检查缓存
  const cached = getCached(options.url);
  if (cached) return cached;

  // 收集所有错误
  let lastError: Error | null = null;

  const tryRequest = async (
    url: string,
  ): Promise<RequestUrlResponse | null> => {
    const res = await requestUrl({ ...requestOptions, url, throw: false });
    if (res.status >= 200 && res.status < 300) {
      setCache(options.url, res);
      return res;
    }
    lastError = errorFromFailedResponse(res, options.url);
    return null;
  };

  // 1. 先尝试直连
  try {
    const res = await tryRequest(options.url);
    if (res) return res;
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    // 直连失败，继续试镜像站
  }

  // 2. 依次尝试每个镜像站
  for (const mirror of settings.mirrors) {
    const proxyUrl = rewriteGithubUrl(options.url, mirror);
    if (proxyUrl === options.url) continue; // 该镜像站不支持此 URL

    try {
      const res = await tryRequest(proxyUrl);
      if (res) return res;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }

  // 3. 全部失败
  if (lastError instanceof GHRateLimitError) {
    throw lastError;
  }
  throw lastError ?? new Error("所有镜像站均请求失败");
}

// ─── 高层 API ────────────────────────────────────────────────────────────────

export async function grabReleaseFromRepository(
  repo: string,
  settings: GatewaySettings,
  version?: string,
): Promise<Release | null> {
  const apiUrl =
    version && version !== "latest"
      ? `https://api.github.com/repos/${repo}/releases/tags/${version}`
      : `https://api.github.com/repos/${repo}/releases/latest`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };

  let response: RequestUrlResponse;
  try {
    response = await gitHubRequest(
      { url: apiUrl, headers },
      settings,
    );
  } catch (error) {
    if (error instanceof GitHubResponseError && error.status === 404) {
      return null;
    }
    throw error;
  }

  if (response.status === 404) return null;
  if (response.status === 403) {
    throw errorFromFailedResponse(response, apiUrl);
  }
  if (response.status >= 400) {
    throw errorFromFailedResponse(response, apiUrl);
  }

  const json: unknown = response.json;
  const releases: Release[] =
    json && typeof json === "object"
      ? Array.isArray(json) ? (json as Release[]) : [json as Release]
      : [];

  if (releases.length === 0) return null;

  return (
    releases
      .sort((a, b) => {
        const aVer = semverCoerce(a.tag_name);
        const bVer = semverCoerce(b.tag_name);
        if (aVer && bVer) return compareVersions(bVer, aVer);
        if (aVer && !bVer) return -1;
        if (!aVer && bVer) return 1;
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      })
      .filter((r) => !r.prerelease)[0] ?? null
  );
}

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
        headers: { Accept: "*/*" },
      },
      settings,
    );
    return response.status === 200 ? response.text : null;
  } catch (error) {
    console.error(`[XDF-Gateway] 下载文件失败: ${fileName}`, error);
    return null;
  }
}

export async function grabLatestRelease(
  repo: string,
  settings: GatewaySettings,
): Promise<string | null> {
  const release = await grabReleaseFromRepository(repo, settings);
  return release?.tag_name ?? null;
}

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

export async function getReleaseVersions(
  repo: string,
  settings: GatewaySettings,
): Promise<{ tag_name: string; prerelease: boolean }[]> {
  const apiUrl = `https://api.github.com/repos/${repo}/releases?per_page=100`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };

  const response = await gitHubRequest({ url: apiUrl, headers }, settings);
  const json: unknown = response.json;
  if (!Array.isArray(json)) return [];

  return json.map((r: Release) => ({
    tag_name: r.tag_name,
    prerelease: r.prerelease,
  }));
}

// ─── 两级回退下载 ────────────────────────────────────────────────────────────

function buildRawTagCandidates(tag: string): string[] {
  const candidates = [tag];
  if (tag.startsWith("v") && tag.length > 1) {
    candidates.push(tag.slice(1));
  } else {
    candidates.push(`v${tag}`);
  }
  return Array.from(new Set(candidates));
}

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
      continue;
    }
  }
  return null;
}

/**
 * 下载 Release 文件（两级回退：Assets → Raw Tag）
 */
export async function downloadReleaseFiles(
  repo: string,
  version: string,
  settings: GatewaySettings,
): Promise<ReleaseFiles> {
  const release = await grabReleaseFromRepository(repo, settings, version);

  let files: ReleaseFiles;
  if (release) {
    files = await grabAllReleaseFiles(release, settings);
  } else {
    files = { mainJs: null, manifest: null, styles: null };
  }

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
