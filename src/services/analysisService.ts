import {
  applyProjectFixDesktop,
  fetchKairosLogsDesktop,
  generateProjectText,
  isTauriRuntime,
  readProjectContext,
} from '../lib/desktop';
import type {AnalysisProvider, AnalysisResult, ProjectInsight, ProviderConfig} from '../types';

interface ProjectTreeNode {
  name: string;
  children?: ProjectTreeNode[];
}

interface ProjectContext {
  rootPath: string;
  outline: string;
  tree: ProjectTreeNode[];
  dependencies: Record<string, string[]>;
}

const DEFAULT_RADAR = {
  performance: 80,
  security: 85,
  maintainability: 75,
  innovation: 70,
  robustness: 80,
};

function ensureDesktopSupport() {
  if (!isTauriRuntime()) {
    throw new Error('项目分析当前仅支持桌面版。');
  }
}

function normalizeProviderId(providerType: AnalysisProvider): string {
  return providerType === 'vertex_ai' ? 'vertex_ai' : providerType;
}

function defaultModelForProvider(providerType: AnalysisProvider): string {
  switch (providerType) {
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'openai':
      return 'gpt-5.4';
    case 'vertex_ai':
      return 'gemini-2.5-flash';
    default:
      return 'default';
  }
}

function activeModelForProvider(providerType: AnalysisProvider, config: ProviderConfig): string {
  return config.models[0] || defaultModelForProvider(providerType);
}

function normalizeProviderConfig(providerType: AnalysisProvider, config: ProviderConfig): ProviderConfig {
  return {
    ...config,
    id: normalizeProviderId(providerType) as ProviderConfig['id'],
    models: config.models?.length ? [...config.models] : [defaultModelForProvider(providerType)],
  };
}

async function getProjectContext(): Promise<ProjectContext> {
  ensureDesktopSupport();
  const payload = await readProjectContext({});
  if (!payload) {
    throw new Error('无法读取桌面端项目上下文。');
  }
  return {
    rootPath: payload.rootPath,
    outline: payload.outline,
    tree: buildTreeFromOutline(payload.outline),
    dependencies: {},
  };
}

async function requestProjectText(
  providerType: AnalysisProvider,
  config: ProviderConfig,
  prompt: string,
): Promise<string> {
  ensureDesktopSupport();
  const text = await generateProjectText({
    providerId: normalizeProviderId(providerType),
    provider: normalizeProviderConfig(providerType, config),
    activeModel: activeModelForProvider(providerType, config),
    prompt,
  });
  if (text === null) {
    throw new Error('桌面端项目分析请求未返回结果。');
  }
  return text;
}

function buildTreeFromOutline(outline: string): ProjectTreeNode[] {
  const roots: ProjectTreeNode[] = [];
  const directoryMap = new Map<string, ProjectTreeNode>();

  const ensureDir = (parts: string[]): ProjectTreeNode[] => {
    let currentChildren = roots;
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = directoryMap.get(currentPath);
      if (!node) {
        node = {name: part, children: []};
        directoryMap.set(currentPath, node);
        currentChildren.push(node);
      }
      currentChildren = node.children!;
    }
    return currentChildren;
  };

  for (const rawLine of outline.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const dirMatch = line.match(/^\[dir\]\s+(.+?)\/$/);
    if (dirMatch) {
      const path = dirMatch[1].trim();
      if (path && path !== '.') {
        ensureDir(path.split('/').filter(Boolean));
      }
      continue;
    }

    const fileMatch = line.match(/^\[file\]\s+(.+?)\s+\(\d+\s+bytes\)$/);
    if (!fileMatch) continue;

    const path = fileMatch[1].trim();
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) continue;
    const siblings = ensureDir(parts);
    if (!siblings.some((item) => item.name === name && !item.children)) {
      siblings.push({name});
    }
  }

  return roots;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }
  const withoutStart = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, '');
  return withoutStart.replace(/\s*```$/, '').trim();
}

function extractJsonCandidate(raw: string): string {
  const stripped = stripCodeFence(raw);
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    return stripped;
  }

  const objectStart = stripped.indexOf('{');
  const objectEnd = stripped.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return stripped.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = stripped.indexOf('[');
  const arrayEnd = stripped.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return stripped.slice(arrayStart, arrayEnd + 1);
  }

  return stripped;
}

function parseJsonResponse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(extractJsonCandidate(raw)) as T;
  } catch {
    return fallback;
  }
}

function normalizeInsightArray(items: unknown): ProjectInsight[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const category: ProjectInsight['category'] =
        row.category === 'architecture' ||
        row.category === 'performance' ||
        row.category === 'security' ||
        row.category === 'trends'
          ? row.category
          : 'architecture';
      const priority: ProjectInsight['priority'] =
        row.priority === 'low' || row.priority === 'medium' || row.priority === 'high'
          ? row.priority
          : 'medium';
      return {
        id: typeof row.id === 'string' && row.id.trim() ? row.id : `insight-${index + 1}`,
        category,
        title: typeof row.title === 'string' ? row.title : '未命名建议',
        description: typeof row.description === 'string' ? row.description : '',
        suggestion: typeof row.suggestion === 'string' ? row.suggestion : '',
        priority,
        hasFix: Boolean(row.hasFix),
      };
    })
    .filter((item) => item.title.trim());
}

export async function getProjectInsights(
  providerType: AnalysisProvider,
  config: ProviderConfig,
): Promise<AnalysisResult> {
  try {
    const context = await getProjectContext();
    const prompt = `
你是一名资深全栈架构师和技术趋势分析师。请基于下面的项目扫描摘要，输出严格 JSON。

要求：
1. 所有 title、description、suggestion、summary 都必须使用简体中文。
2. insights 提供 5-8 条具体、可执行的建议。
3. radar 为 0-100 分。
4. 不要输出任何 JSON 之外的解释。

返回结构：
{
  "insights": [
    {
      "id": "slug",
      "category": "architecture" | "performance" | "security" | "trends",
      "title": "建议标题",
      "description": "问题描述",
      "suggestion": "改进建议",
      "priority": "low" | "medium" | "high",
      "hasFix": true
    }
  ],
  "radar": {
    "performance": 0,
    "security": 0,
    "maintainability": 0,
    "innovation": 0,
    "robustness": 0
  },
  "summary": "一句话摘要"
}

项目根目录：${context.rootPath}
项目扫描摘要：
${context.outline}
`;

    const raw = await requestProjectText(providerType, config, prompt);
    const parsed = parseJsonResponse<{
      insights?: unknown;
      radar?: Partial<typeof DEFAULT_RADAR>;
      summary?: string;
    }>(raw, {});

    return {
      insights: normalizeInsightArray(parsed.insights),
      radar: {...DEFAULT_RADAR, ...(parsed.radar || {})},
      context: {
        tree: context.tree,
        summary: parsed.summary?.trim() || '已完成项目结构扫描。',
        dependencies: context.dependencies,
      },
    };
  } catch (error) {
    console.error('Project Analysis Error:', error);
    return {
      insights: [],
      radar: DEFAULT_RADAR,
      context: {tree: [], summary: '分析失败，请检查桌面端模型配置。'},
    };
  }
}

export async function getInsightFix(
  providerType: AnalysisProvider,
  config: ProviderConfig,
  insight: ProjectInsight,
): Promise<{file: string; patch: string; explanation: string} | null> {
  try {
    const context = await getProjectContext();
    const prompt = `
你是一名资深全栈工程师。请根据下面这条分析建议，给出一个可直接落地的修复方案，并严格返回 JSON。

要求：
1. explanation 必须使用简体中文。
2. file 返回相对于项目根目录的路径。
3. patch 返回文件完整内容，优先返回完整文件而不是 diff。
4. 不要输出任何 JSON 之外的解释。

建议标题：${insight.title}
问题描述：${insight.description}
修复建议：${insight.suggestion}
项目扫描摘要：
${context.outline}

返回结构：
{
  "file": "src/example.ts",
  "patch": "完整文件内容",
  "explanation": "修改说明"
}
`;
    const raw = await requestProjectText(providerType, config, prompt);
    const parsed = parseJsonResponse<{file?: string; patch?: string; explanation?: string}>(raw, {});
    if (!parsed.file || !parsed.patch) {
      return null;
    }
    return {
      file: parsed.file,
      patch: parsed.patch,
      explanation: parsed.explanation || '已生成修复建议。',
    };
  } catch (error) {
    console.error('Insight Fix Error:', error);
    return null;
  }
}

export async function generateProjectDocs(
  providerType: AnalysisProvider,
  config: ProviderConfig,
): Promise<string> {
  try {
    const context = await getProjectContext();
    const prompt = `
你是一名资深技术作者和系统架构师。请根据项目扫描摘要，生成一份完整的 ARCHITECTURE.md 内容。

要求：
1. 全文使用简体中文。
2. 使用 Markdown。
3. 包含：项目概览、关键技术、目录结构说明、主要逻辑流、未来路线图。
4. 只返回 Markdown 正文，不要附加解释。

项目根目录：${context.rootPath}
项目扫描摘要：
${context.outline}
`;
    return (await requestProjectText(providerType, config, prompt)).trim();
  } catch (error) {
    console.error('Docs Generation Error:', error);
    return '文档生成过程中出错。';
  }
}

export interface PreflightCheck {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
}

export async function runPreflightChecks(
  providerType: AnalysisProvider,
  config: ProviderConfig,
): Promise<PreflightCheck[]> {
  try {
    const context = await getProjectContext();
    const prompt = `
你是一名 DevSecOps 专家。请基于项目扫描摘要，做一次上线前预检，并严格返回 JSON 数组。

要求：
1. 所有 message 使用简体中文。
2. 检查项至少覆盖：环境变量说明、潜在密钥泄露、构建脚本、上线安全实践。
3. 不要输出任何数组之外的解释。

返回结构：
[
  {
    "id": "env-example",
    "name": "检查名称",
    "status": "pass" | "fail" | "warning",
    "message": "详细结果"
  }
]

项目扫描摘要：
${context.outline}
`;
    const raw = await requestProjectText(providerType, config, prompt);
    return parseJsonResponse<PreflightCheck[]>(raw, []).filter(Boolean);
  } catch (error) {
    console.error('Preflight Error:', error);
    return [];
  }
}

export interface DeploymentFile {
  name: string;
  content: string;
  language: string;
}

export async function generateDeploymentConfig(
  providerType: AnalysisProvider,
  config: ProviderConfig,
  type: 'docker' | 'github-actions',
): Promise<DeploymentFile[]> {
  try {
    const context = await getProjectContext();
    const requestLabel =
      type === 'docker'
        ? '容器化部署（Dockerfile 与 docker-compose.yml）'
        : 'CI/CD 流水线（GitHub Actions 工作流）';
    const prompt = `
你是一名云基础设施专家。请基于项目扫描摘要，为当前项目生成生产可用的部署配置，并严格返回 JSON 数组。

要求：
1. content 为完整文件内容。
2. language 返回合适的代码语言标识，如 dockerfile、yaml、bash。
3. 不要输出数组之外的解释。

请求类型：${requestLabel}
项目扫描摘要：
${context.outline}

返回结构：
[
  {
    "name": "filename",
    "content": "完整文件内容",
    "language": "language-slug"
  }
]
`;
    const raw = await requestProjectText(providerType, config, prompt);
    return parseJsonResponse<DeploymentFile[]>(raw, []).filter(
      (item) => !!item?.name && !!item?.content,
    );
  } catch (error) {
    console.error('Deployment Generation Error:', error);
    return [];
  }
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  milestone: string;
  priority: 'low' | 'medium' | 'high';
}

export async function getProjectRoadmap(
  providerType: AnalysisProvider,
  config: ProviderConfig,
): Promise<RoadmapItem[]> {
  try {
    const context = await getProjectContext();
    const prompt = `
你是一名战略技术负责人。请基于项目扫描摘要，给出未来 3-6 个月的技术路线图，并严格返回 JSON 数组。

要求：
1. 所有字段内容使用简体中文。
2. 输出 5-7 个里程碑。
3. 不要输出数组之外的解释。

返回结构：
[
  {
    "id": "slug",
    "title": "里程碑标题",
    "description": "说明",
    "milestone": "阶段或季度",
    "priority": "low" | "medium" | "high"
  }
]

项目扫描摘要：
${context.outline}
`;
    const raw = await requestProjectText(providerType, config, prompt);
    return parseJsonResponse<RoadmapItem[]>(raw, []).filter((item) => !!item?.title);
  } catch (error) {
    console.error('Roadmap Error:', error);
    return [];
  }
}

export async function applyInsightFix(file: string, content: string) {
  ensureDesktopSupport();
  const result = await applyProjectFixDesktop({file, content});
  if (!result) {
    throw new Error('桌面端未返回修复落地结果。');
  }
  return result;
}

export interface ProjectDream {
  id: string;
  topic: string;
  vision: string;
  impact: string;
  probability: number;
}

export async function getProjectDreams(
  providerType: AnalysisProvider,
  config: ProviderConfig,
): Promise<ProjectDream[]> {
  try {
    const context = await getProjectContext();
    const prompt = `
你是一名面向未来的软件技术思想家。请基于项目扫描摘要，提出 3-5 个非常规但有启发性的“技术梦想”，并严格返回 JSON 数组。

要求：
1. topic、vision、impact 使用简体中文。
2. probability 为 0-100 的整数。
3. 不要输出数组之外的解释。

返回结构：
[
  {
    "id": "slug",
    "topic": "梦想主题",
    "vision": "未来愿景",
    "impact": "对项目的颠覆性影响",
    "probability": 15
  }
]

项目扫描摘要：
${context.outline}
`;
    const raw = await requestProjectText(providerType, config, prompt);
    return parseJsonResponse<ProjectDream[]>(raw, []).filter((item) => !!item?.topic);
  } catch {
    return [];
  }
}

export interface CoordinatorPlan {
  research: {task: string; insight: string};
  synthesis: {task: string; insight: string};
  implementation: {task: string; insight: string};
  verification: {task: string; insight: string};
}

export interface KairosLog {
  timestamp: string;
  event: string;
  type: string;
}

export async function getCoordinatorPlan(
  provider: AnalysisProvider,
  config: ProviderConfig,
  userGoal: string,
): Promise<CoordinatorPlan> {
  const fallback: CoordinatorPlan = {
    research: {task: '无法分析', insight: '研究阶段未能完成'},
    synthesis: {task: '无法综合', insight: '综合阶段未能完成'},
    implementation: {task: '无法实施', insight: '实施阶段未能完成'},
    verification: {task: '无法验证', insight: '验证阶段未能完成'},
  };

  try {
    const context = await getProjectContext();
    const prompt = `
你现在处于 Coordinator Mode。请围绕用户目标，结合项目扫描摘要，输出严格 JSON。

用户目标：${userGoal}
项目扫描摘要：
${context.outline}

返回结构：
{
  "research": { "task": "研究任务", "insight": "关键洞察" },
  "synthesis": { "task": "综合任务", "insight": "关键洞察" },
  "implementation": { "task": "实施任务", "insight": "关键洞察" },
  "verification": { "task": "验证任务", "insight": "关键洞察" }
}
`;
    const raw = await requestProjectText(provider, config, prompt);
    return parseJsonResponse<CoordinatorPlan>(raw, fallback);
  } catch (error) {
    console.error('Coordinator Error:', error);
    return fallback;
  }
}

export async function runUltraplan(
  provider: AnalysisProvider,
  config: ProviderConfig,
  topic: string,
): Promise<string> {
  try {
    const context = await getProjectContext();
    const prompt = `
你现在处于 Ultraplan 深度规划模式。请围绕下面的主题，结合项目扫描摘要，输出一篇不少于 800 字的中文战略规划报告。

主题：${topic}
项目扫描摘要：
${context.outline}
`;
    return await requestProjectText(provider, config, prompt);
  } catch (error) {
    console.error('Ultraplan Error:', error);
    return '云端规划中继失败，请检查桌面端模型配置。';
  }
}

export async function getKairosLogs(): Promise<{logs: KairosLog[]; lastPatrol: string}> {
  try {
    ensureDesktopSupport();
    const response = await fetchKairosLogsDesktop({});
    if (!response) {
      return {logs: [], lastPatrol: 'OFFLINE'};
    }
    return response;
  } catch {
    return {logs: [], lastPatrol: 'OFFLINE'};
  }
}
