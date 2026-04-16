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

function normalizeClaudeMessagesUrl(raw: string): string {
  const t = raw.trim().replace(/\/$/, '');
  if (t.endsWith('/messages')) {
    return t;
  }
  if (t.endsWith('/v1')) {
    return `${t}/messages`;
  }
  return `${t}/v1/messages`;
}

function pickClaudeEnvFromSettings(root: unknown): {
  apiKey?: string;
  baseUrl?: string;
} {
  if (!root || typeof root !== 'object') {
    return {};
  }
  const o = root as Record<string, unknown>;
  const blocks = [o.env, o.environmentVariables].filter(Boolean) as Record<string, unknown>[];
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  for (const b of blocks) {
    const k = b.ANTHROPIC_API_KEY;
    if (typeof k === 'string' && k.trim().length > 0) {
      apiKey = k.trim();
    }
    const bu = b.ANTHROPIC_BASE_URL;
    if (typeof bu === 'string' && bu.trim().length > 0) {
      baseUrl = normalizeClaudeMessagesUrl(bu);
    }
  }
  return {apiKey, baseUrl};
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
    const {apiKey, baseUrl} = pickClaudeEnvFromSettings(json);
    const keys: string[] = [];
    if (apiKey) {
      providers.claude = {...providers.claude, apiKey};
      keys.push('ANTHROPIC_API_KEY');
    }
    if (baseUrl) {
      providers.claude = {...providers.claude, baseUrl};
      keys.push('ANTHROPIC_BASE_URL');
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

  for (const fp of [codexConfigUser, codexConfigProject]) {
    const raw = readUtf8(fp);
    if (!raw) {
      continue;
    }
    const base = extractTomlValue(raw, 'openai_base_url');
    if (base) {
      const normalized = base.replace(/\/$/, '');
      const openaiBase = normalized.endsWith('/v1')
        ? normalized
        : `${normalized}/v1`;
      providers.openai = {...providers.openai, baseUrl: openaiBase};
      pushSource(sources, fp, ['openai_base_url']);
    }
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
