import type {AppSettings, ProviderType} from '../types';
import type {LocalToolConfigResponse} from '../../localToolConfig.types';
import {readLocalToolConfig} from './desktop';

/**
 * 与 App.tsx 中 DEFAULT_SETTINGS 保持一致，用于判断 baseUrl 是否仍为内置默认
 */
const BUILTIN_DEFAULT_BASE_URL: Partial<Record<ProviderType, string>> = {
  gemini: 'https://generativelanguage.googleapis.com',
  claude: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1',
};

/**
 * 请求 Vite 开发/预览服务器上的本机工具配置接口
 * @returns 解析结果；静态部署或接口不可用时为 null
 */
export async function fetchLocalToolConfig(): Promise<LocalToolConfigResponse | null> {
  try {
    const desktopData = await readLocalToolConfig();
    if (desktopData) {
      return desktopData;
    }
  } catch {
    // Fall back to the Vite dev/preview endpoint when desktop IPC is unavailable.
  }
  try {
    const res = await fetch('/__ccc/local-provider-config');
    const raw = await res.text();
    try {
      return JSON.parse(raw) as LocalToolConfigResponse;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * 将本机工具目录解析结果合并进应用设置（默认仅写入当前为空的字段）
 * @param prev 当前设置
 * @param data 服务端返回的本机配置
 * @returns 合并后的设置
 */
export function mergeLocalToolConfigIntoSettings(
  prev: AppSettings,
  data: LocalToolConfigResponse,
): AppSettings {
  if (!data.ok) {
    return prev;
  }
  const next: AppSettings = {
    ...prev,
    providers: {...prev.providers},
  };
  const ids = ['gemini', 'claude', 'openai'] as const;
  for (const id of ids) {
    const patch = data.providers[id];
    if (!patch) {
      continue;
    }
    const cur = next.providers[id];
    const apiKey =
      patch.apiKey && !cur.apiKey ? patch.apiKey : cur.apiKey;
    const curBu = cur.baseUrl?.trim();
    const builtIn = BUILTIN_DEFAULT_BASE_URL[id];
    const baseUrlStillDefault =
      !curBu || (builtIn !== undefined && curBu === builtIn);
    const baseUrl =
      patch.baseUrl && baseUrlStillDefault ? patch.baseUrl : cur.baseUrl;
    const mergedModels = patch.models?.length
      ? Array.from(new Set([...patch.models, ...cur.models]))
      : cur.models;
    next.providers[id] = {...cur, apiKey, baseUrl, models: mergedModels};
  }
  return next;
}
