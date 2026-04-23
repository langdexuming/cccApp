import type {AppSettings} from '../types';
import type {LocalToolConfigResponse} from '../../localToolConfig.types';
import {readLocalToolConfig} from './desktop';
import {normalizeSettings} from './providerCatalog';

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
 * 将本机工具目录解析结果合并进应用设置。
 * 本地实际读取到的 provider 配置应优先于应用之前缓存的旧值，
 * 这样用户修改 ~/.claude / ~/.codex / ~/.gemini 后，桌面版重启即可生效。
 */
export function mergeLocalToolConfigIntoSettings(
  prev: AppSettings,
  data: LocalToolConfigResponse,
): AppSettings {
  if (!data.ok) {
    return normalizeSettings(prev);
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
    const apiKey = patch.apiKey?.trim() ? patch.apiKey : cur.apiKey;
    const authToken = patch.authToken?.trim() ? patch.authToken : cur.authToken;
    const baseUrl = patch.baseUrl?.trim() ? patch.baseUrl : cur.baseUrl;
    const mergedModels = patch.models?.length
      ? Array.from(new Set([...patch.models, ...cur.models]))
      : cur.models;
    next.providers[id] = {
      ...cur,
      apiKey,
      authToken,
      baseUrl,
      models: mergedModels,
      wireApi: patch.wireApi ?? cur.wireApi,
    };
  }
  return normalizeSettings(next);
}
