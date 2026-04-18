/**
 * 从用户主目录下的 .gemini、.claude、.codex 读取模型相关配置（仅开发/预览服务器端）
 * @author make java
 * @since 2026-04-16
 */
import {parse} from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {LocalToolConfigSource, LocalToolConfigResponse} from '../localToolConfig.types';

function pushSource(sources: LocalToolConfigSource[], filePath: string, keys: string[]) {
  if (keys.length === 0) {
    return;
  }
  sources.push({path: filePath, keys: [...new Set(keys)]});
}

function readUtf8(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function parseEnvFile(filePath: string): Record<string, string> {
  const raw = readUtf8(filePath);
  if (!raw) {
    return {};
  }
  return parse(raw) as Record<string, string>;
}

function readJsonFile(filePath: string): unknown | undefined {
  const raw = readUtf8(filePath);
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function extractTomlValue(content: string, key: string): string | undefined {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const noComment = line.replace(/#.*/, '').trim();
    if (!noComment || noComment.startsWith('[')) {
      continue;
    }
    const m = noComment.match(new RegExp(`^${key}\\s*=\\s*(.+)$`));
    if (!m) {
      continue;
    }
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v || undefined;
  }
  return undefined;
}

function parseTomlSectionName(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return undefined;
  }
  const section = trimmed.slice(1, -1).trim();
  return section || undefined;
}

function quotedTomlTableKey(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function pickCodexProviderValue(content: string, key: 'base_url' | 'wire_api'): {value?: string; keys: string[]} {
  if (key === 'base_url') {
    const openaiBaseUrl = extractTomlValue(content, 'openai_base_url');
    if (openaiBaseUrl) {
      return {value: openaiBaseUrl, keys: ['openai_base_url']};
    }
  }

  const selectedProvider = extractTomlValue(content, 'model_provider');
  if (!selectedProvider) {
    return {keys: []};
  }

  const providerSection = `model_providers.${selectedProvider}`;
  const quotedProviderSection = `model_providers.${quotedTomlTableKey(selectedProvider)}`;
  let currentSection = '';

  for (const line of content.split(/\r?\n/)) {
    const noComment = line.replace(/#.*/, '').trim();
    if (!noComment) {
      continue;
    }

    const section = parseTomlSectionName(noComment);
    if (section) {
      currentSection = section;
      continue;
    }

    if (currentSection !== providerSection && currentSection !== quotedProviderSection) {
      continue;
    }

    const match = noComment.match(/^([^=]+)=(.+)$/);
    if (!match || match[1].trim() !== key) {
      continue;
    }

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    return {
      value: value || undefined,
      keys: ['model_provider', `${currentSection}.${key}`],
    };
  }

  return {keys: []};
}

function pickCodexCachedModels(root: unknown): string[] {
  if (!root || typeof root !== 'object' || !Array.isArray((root as any).models)) {
    return [];
  }

  return (root as any).models
    .filter((item: any) => item?.visibility === 'list')
    .filter((item: any) => item?.supported_in_api !== false)
    .map((item: any) => String(item?.slug ?? '').trim())
    .filter(Boolean);
}

function normalizeClaudeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (trimmed.endsWith('/messages')) {
    return trimmed.slice(0, -'/messages'.length);
  }
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed.slice(0, -'/chat/completions'.length);
  }
  return trimmed;
}

function normalizeClaudeModel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const value = raw.trim();
  if (!value || !value.toLowerCase().startsWith('claude-')) {
    return undefined;
  }
  return value;
}

function pickClaudeEnvFromSettings(root: unknown): {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
} {
  if (!root || typeof root !== 'object') {
    return {};
  }
  const o = root as Record<string, unknown>;
  const blocks = [o.env, o.environmentVariables].filter(Boolean) as Record<string, unknown>[];
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  const model = normalizeClaudeModel(o.model);
  for (const b of blocks) {
    const k = b.ANTHROPIC_API_KEY;
    if (typeof k === 'string' && k.trim().length > 0) {
      apiKey = k.trim();
    }
    const authToken = b.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey && typeof authToken === 'string' && authToken.trim().length > 0) {
      apiKey = authToken.trim();
    }
    const bu = b.ANTHROPIC_BASE_URL;
    if (typeof bu === 'string' && bu.trim().length > 0) {
      baseUrl = normalizeClaudeBaseUrl(bu);
    }
  }
  return {apiKey, baseUrl, model};
}

function findSkLikeKey(obj: unknown, depth: number): string | undefined {
  if (depth > 5 || obj == null) {
    return undefined;
  }
  if (typeof obj === 'string') {
    const s = obj.trim();
    if (/^sk-[a-zA-Z0-9_-]{20,}$/.test(s)) {
      return s;
    }
    return undefined;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const f = findSkLikeKey(x, depth + 1);
      if (f) {
        return f;
      }
    }
    return undefined;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const f = findSkLikeKey(v, depth + 1);
      if (f) {
        return f;
      }
    }
  }
  return undefined;
}

/**
 * 读取本机工具目录中的 API Key / Base URL 线索
 * @param cwd 当前工作目录，用于读取项目内 .codex/config.toml
 * @returns 合并后的本地配置与来源说明
 */
export function readLocalToolConfigs(cwd: string): LocalToolConfigResponse {
  const sources: LocalToolConfigSource[] = [];
  const providers: LocalToolConfigResponse['providers'] = {};

  const home = os.homedir();
  if (!home) {
    return {
      ok: false,
      error: '无法解析用户主目录',
      providers: {},
      sources: [],
    };
  }

  const geminiDir = path.join(home, '.gemini');
  const geminiEnv = path.join(geminiDir, '.env');
  if (fs.existsSync(geminiEnv)) {
    const env = parseEnvFile(geminiEnv);
    const keys: string[] = [];
    const key =
      env.GEMINI_API_KEY?.trim() ||
      env.GOOGLE_API_KEY?.trim() ||
      env.GOOGLE_GENAI_API_KEY?.trim();
    if (env.GEMINI_API_KEY?.trim()) {
      keys.push('GEMINI_API_KEY');
    }
    if (env.GOOGLE_API_KEY?.trim()) {
      keys.push('GOOGLE_API_KEY');
    }
    if (env.GOOGLE_GENAI_API_KEY?.trim()) {
      keys.push('GOOGLE_GENAI_API_KEY');
    }
    if (key) {
      providers.gemini = {...providers.gemini, apiKey: key};
      pushSource(sources, geminiEnv, keys);
    }
  }

  const claudeDir = path.join(home, '.claude');
  const claudeFiles = [
    path.join(claudeDir, 'settings.json'),
    path.join(claudeDir, 'settings.local.json'),
  ];
  for (const fp of claudeFiles) {
    if (!fs.existsSync(fp)) {
      continue;
    }
    const json = readJsonFile(fp);
    const {apiKey, baseUrl, model} = pickClaudeEnvFromSettings(json);
    const keys: string[] = [];
    if (apiKey) {
      providers.claude = {...providers.claude, apiKey};
      keys.push('ANTHROPIC_API_KEY');
    }
    if (baseUrl) {
      providers.claude = {...providers.claude, baseUrl};
      keys.push('ANTHROPIC_BASE_URL');
    }
    if (model) {
      providers.claude = {
        ...providers.claude,
        models: [...new Set([model, ...(providers.claude?.models ?? [])])],
      };
      keys.push('model');
    }
    if (keys.length) {
      pushSource(sources, fp, keys);
    }
  }

  const codexHome = process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(home, '.codex');
  const codexConfigUser = path.join(codexHome, 'config.toml');
  const codexConfigProject = path.join(cwd, '.codex', 'config.toml');
  let codexModels: string[] = [];

  for (const fp of [codexConfigUser, codexConfigProject]) {
    const raw = readUtf8(fp);
    if (!raw) {
      continue;
    }
    const {value: base, keys: baseKeys} = pickCodexProviderValue(raw, 'base_url');
    const {value: wireApi, keys: wireKeys} = pickCodexProviderValue(raw, 'wire_api');
    const sourceKeys = [...baseKeys, ...wireKeys];

    if (base) {
      const normalized = base.replace(/\/$/, '');
      const openaiBase = normalized.endsWith('/v1')
        ? normalized
        : `${normalized}/v1`;
      providers.openai = {...providers.openai, baseUrl: openaiBase};
    }
    if (wireApi === 'responses' || wireApi === 'chat_completions') {
      providers.openai = {...providers.openai, wireApi};
    }
    if (sourceKeys.length) {
      pushSource(sources, fp, sourceKeys);
    }
  }

  const currentModel = extractTomlValue(readUtf8(codexConfigProject) || readUtf8(codexConfigUser) || '', 'model');
  if (currentModel?.trim()) {
    codexModels.push(currentModel.trim());
  }

  const modelsCachePath = path.join(codexHome, 'models_cache.json');
  if (fs.existsSync(modelsCachePath)) {
    const modelsJson = readJsonFile(modelsCachePath);
    const cachedModels = pickCodexCachedModels(modelsJson);
    if (cachedModels.length) {
      codexModels = [...new Set([...codexModels, ...cachedModels])];
      pushSource(sources, modelsCachePath, ['models[].slug']);
    }
  }

  if (codexModels.length) {
    providers.openai = {...providers.openai, models: codexModels};
  }

  const authPath = path.join(codexHome, 'auth.json');
  if (fs.existsSync(authPath)) {
    const authJson = readJsonFile(authPath);
    const sk = findSkLikeKey(authJson, 0);
    if (sk) {
      providers.openai = {...providers.openai, apiKey: sk};
      pushSource(sources, authPath, ['api_key_pattern']);
    }
  }

  return {
    ok: true,
    homeDir: home,
    providers,
    sources,
  };
}
