import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import OpenAI from "openai";
import { AnalysisProvider, ProjectInsight, ProviderConfig, AnalysisResult } from "../types";

interface ProjectContext {
  tree: any;
  files: Record<string, string>;
}

export async function getProjectInsights(
  providerType: AnalysisProvider,
  config: ProviderConfig
): Promise<AnalysisResult> {
  const defaultRadar = { performance: 80, security: 85, maintainability: 75, innovation: 70, robustness: 80 };
  
  try {
    // 1. Gather project context from our new API
    const contextRes = await fetch('/api/project/analyze');
    if (!contextRes.ok) throw new Error('Failed to fetch project context');
    const context: ProjectContext = await contextRes.json();

    const prompt = `
      You are an expert full-stack architect and technology trend analyst. 
      Analyze the following project structure and key file contents.
      
      File Tree:
      ${JSON.stringify(context.tree, null, 2)}
      
      Key Files:
      ${Object.entries(context.files).map(([name, content]) => `--- ${name} ---\n${content}`).join('\n\n')}
      
      Provide a comprehensive JSON analysis. IMPORTANT: All descriptions, titles, and suggestions MUST be in Chinese (Simplified).
      1. insights: 5-8 highly specific, actionable advice.
      2. radar: scores (0-100) for performance, security, maintainability, innovation, robustness.
      3. summary: a brief (1-sentence) technical summary of the project.
      
      Response JSON structure:
      {
        "insights": [
          {
            "id": "slug",
            "category": "architecture" | "performance" | "security" | "trends",
            "title": "...",
            "description": "...",
            "suggestion": "...",
            "priority": "low" | "medium" | "high",
            "hasFix": boolean
          }
        ],
        "radar": {
          "performance": number,
          "security": number,
          "maintainability": number,
          "innovation": number,
          "robustness": number
        },
        "summary": "..."
      }
    `;

    const apiKey = config.apiKey || (providerType === 'gemini' ? (process.env as any).GEMINI_API_KEY : '');

    if (providerType === 'vertex-ai') {
      const response = await fetch('/api/vertex/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: config.projectId,
          location: config.baseUrl || 'us-central1',
          model: config.models[0] || "gemini-1.5-flash",
          apiKey: config.apiKey,
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (!response.ok) throw new Error('Vertex AI request failed');
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(text || '{}');
      return {
        insights: parsed.insights || [],
        radar: parsed.radar || defaultRadar,
        context: { 
          tree: context.tree, 
          summary: parsed.summary || '已通过 Vertex AI 成功扫描项目。',
          dependencies: (context as any).dependencies 
        }
      };
    }

    if (providerType === 'gemini') {
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey, baseUrl: config.baseUrl });
      const response = await ai.models.generateContent({
        model: config.models[0] || "gemini-3-flash-preview",
        contents: prompt,
        // @ts-ignore
        tools: [{ googleSearch: {} }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    category: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    suggestion: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    hasFix: { type: Type.BOOLEAN }
                  },
                  required: ['id', 'category', 'title', 'description', 'suggestion', 'priority', 'hasFix']
                }
              },
              radar: {
                type: Type.OBJECT,
                properties: {
                  performance: { type: Type.NUMBER },
                  security: { type: Type.NUMBER },
                  maintainability: { type: Type.NUMBER },
                  innovation: { type: Type.NUMBER },
                  robustness: { type: Type.NUMBER }
                },
                required: ['performance', 'security', 'maintainability', 'innovation', 'robustness']
              },
              summary: { type: Type.STRING }
            },
            required: ['insights', 'radar', 'summary']
          }
        }
      });

      const text = response.text;
      const parsed = JSON.parse(text || '{}');
      return {
        insights: parsed.insights || [],
        radar: parsed.radar || defaultRadar,
        context: { 
          tree: context.tree, 
          summary: parsed.summary || '已进行项目扫描。',
          dependencies: (context as any).dependencies 
        }
      };
    } else {
      const openai = new OpenAI({ apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: config.models[0] || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const text = response.choices[0].message.content;
      const parsed = JSON.parse(text || '{}');
      return {
        insights: parsed.insights || [],
        radar: parsed.radar || defaultRadar,
        context: { 
          tree: context.tree, 
          summary: parsed.summary || '已通过 OpenAI 成功进行深度扫描。',
          dependencies: (context as any).dependencies
        }
      };
    }
  } catch (error) {
    console.error('Project Analysis Error:', error);
    return {
      insights: [],
      radar: defaultRadar,
      context: { tree: [], summary: '分析失败，请检查配置。' }
    };
  }
}

export async function getInsightFix(
  providerType: AnalysisProvider,
  config: ProviderConfig,
  insight: ProjectInsight
): Promise<{ file: string; patch: string; explanation: string } | null> {
  try {
    const contextRes = await fetch('/api/project/analyze');
    const context: ProjectContext = await contextRes.json();

    const prompt = `
      You are an expert full-stack engineer. 
      Insight: ${insight.title} - ${insight.suggestion}
      Category: ${insight.category}

      Provide a specific code fix for this insight based on the project context.
      IMPORTANT: The explanation MUST be in Chinese (Simplified).
      
      File Tree:
      ${JSON.stringify(context.tree, null, 2)}

      Response format (JSON):
      {
        "file": "path/to/file.ts",
        "patch": "Complete new content of the file OR a markdown code block showing the change",
        "explanation": "Briefly explain what you changed and why"
      }
    `;

    const apiKey = config.apiKey || (providerType === 'gemini' ? (process.env as any).GEMINI_API_KEY : '');

    if (providerType === 'vertex-ai') {
      const response = await fetch('/api/vertex/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: config.projectId,
          location: config.baseUrl || 'us-central1',
          model: config.models[0] || "gemini-1.5-flash",
          apiKey: config.apiKey,
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? JSON.parse(text) : null;
    }

    if (providerType === 'gemini') {
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey, baseUrl: config.baseUrl });
      const response = await ai.models.generateContent({
        model: config.models[0] || "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              file: { type: Type.STRING },
              patch: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ['file', 'patch', 'explanation']
          }
        }
      });
      const text = response.text;
      return text ? JSON.parse(text) : null;
    } else {
      const openai = new OpenAI({ apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: config.models[0] || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      const text = response.choices[0].message.content;
      return text ? JSON.parse(text) : null;
    }
  } catch (error) {
    console.error('Insight Fix Error:', error);
    return null;
  }
}

export async function generateProjectDocs(
  providerType: AnalysisProvider,
  config: ProviderConfig
): Promise<string> {
  try {
    const contextRes = await fetch('/api/project/analyze');
    const context: ProjectContext = await contextRes.json();

    const prompt = `
      You are an expert technical writer and architect.
      Based on the following project context, generate a professional ARCHITECTURE.md document.
      IMPORTANT: The entire document MUST be written in Chinese (Simplified).
      
      Include:
      1. Project Overview
      2. Key Technologies
      3. Folder Structure Explanation
      4. Main Logic Flow
      5. Future Roadmap
      
      File Tree: ${JSON.stringify(context.tree, null, 2)}
      
      Respond only with the markdown content.
    `;

    const apiKey = config.apiKey || (providerType === 'gemini' ? (process.env as any).GEMINI_API_KEY : '');

    if (providerType === 'vertex-ai') {
      const response = await fetch('/api/vertex/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: config.projectId,
          location: config.baseUrl || 'us-central1',
          model: config.models[0] || "gemini-1.5-flash",
          apiKey: config.apiKey,
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "未能生成文档。";
    }

    if (providerType === 'gemini') {
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey, baseUrl: config.baseUrl });
      const response = await ai.models.generateContent({
        model: config.models[0] || "gemini-3-flash-preview",
        contents: prompt
      });
      return response.text || "未能生成文档。";
    } else {
      const openai = new OpenAI({ apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: config.models[0] || "gpt-4o",
        messages: [{ role: "user", content: prompt }]
      });
      return response.choices[0].message.content || "未能生成文档。";
    }
  } catch (error) {
    console.error('Docs Generation Error:', error);
    return "文档生成过程中出错。";
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
  config: ProviderConfig
): Promise<PreflightCheck[]> {
  try {
    const contextRes = await fetch('/api/project/analyze');
    const context: ProjectContext = await contextRes.json();

    const prompt = `
      You are a DevSecOps expert. Perform a "Pre-flight" check on this project before it goes to production.
      IMPORTANT: All status messages and check names MUST be in Chinese (Simplified).
      
      Scan for:
      1. Missing .env.example or clear env requirements.
      2. Potential secret leaks (API keys, hardcoded secrets) in the files provided.
      3. Build script logic in package.json.
      4. Standard security headers or practices if applicable.
      
      File Tree: ${JSON.stringify(context.tree, null, 2)}
      Key Files: ${Object.keys(context.files).join(', ')}

      Respond with a JSON array of:
      {
        "id": "slug",
        "name": "Check name",
        "status": "pass" | "fail" | "warning",
        "message": "Detailed result"
      }
    `;

    const apiKey = config.apiKey || (providerType === 'gemini' ? (process.env as any).GEMINI_API_KEY : '');

    if (providerType === 'vertex-ai') {
      const response = await fetch('/api/vertex/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: config.projectId,
          location: config.baseUrl || 'us-central1',
          model: config.models[0] || "gemini-1.5-flash",
          apiKey: config.apiKey,
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
    }

    if (providerType === 'gemini') {
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey, baseUrl: config.baseUrl });
      const response = await ai.models.generateContent({
        model: config.models[0] || "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                status: { type: Type.STRING },
                message: { type: Type.STRING }
              },
              required: ['id', 'name', 'status', 'message']
            }
          }
        }
      });
      return JSON.parse(response.text || "[]");
    } else {
      const openai = new OpenAI({ apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: config.models[0] || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      const text = response.choices[0].message.content || '{"checks":[]}';
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (parsed.checks || []);
    }
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
  type: 'docker' | 'github-actions'
): Promise<DeploymentFile[]> {
  try {
    const contextRes = await fetch('/api/project/analyze');
    const context: ProjectContext = await contextRes.json();

    const prompt = `
      You are a Cloud Infrastructure Expert. 
      Generate production-ready deployment configuration files for this project.
      
      Project Overview:
      - File Tree: ${JSON.stringify(context.tree, null, 2)}
      - Technical Summary: Based on files like package.json, vite.config.ts, server.ts etc.

      Request Type: ${type === 'docker' ? 'Containerization (Dockerfile & docker-compose.yml)' : 'CI/CD (GitHub Actions workflow)'}

      Respond with a JSON array of files:
      [
        {
          "name": "filename",
          "content": "file content",
          "language": "language-slug"
        }
      ]
    `;

    const apiKey = config.apiKey || (providerType === 'gemini' ? (process.env as any).GEMINI_API_KEY : '');

    if (providerType === 'vertex-ai') {
      const response = await fetch('/api/vertex/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: config.projectId,
          location: config.baseUrl || 'us-central1',
          model: config.models[0] || "gemini-1.5-flash",
          apiKey: config.apiKey,
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
    }

    if (providerType === 'gemini') {
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey, baseUrl: config.baseUrl });
      const response = await ai.models.generateContent({
        model: config.models[0] || "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                content: { type: Type.STRING },
                language: { type: Type.STRING }
              },
              required: ['name', 'content', 'language']
            }
          }
        }
      });
      return JSON.parse(response.text || "[]");
    } else {
      const openai = new OpenAI({ apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: config.models[0] || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      const text = response.choices[0].message.content || '{"files":[]}';
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (parsed.files || []);
    }
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
  config: ProviderConfig
): Promise<RoadmapItem[]> {
  try {
    const contextRes = await fetch('/api/project/analyze');
    const context: ProjectContext = await contextRes.json();

    const prompt = `
      You are a Strategic Tech Lead. 
      Analyze the project and suggest a technical roadmap for the next 3-6 months.
      IMPORTANT: All titles and descriptions MUST be in Chinese (Simplified).
      
      File Tree: ${JSON.stringify(context.tree, null, 2)}
      
      Provide 5-7 meaningful milestones.
      Response JSON structure:
      [
        {
          "id": "slug",
          "title": "...",
          "description": "...",
          "milestone": "Q2 2024" | "Core Phase" etc,
          "priority": "low" | "medium" | "high"
        }
      ]
    `;

    const apiKey = config.apiKey || (providerType === 'gemini' ? (process.env as any).GEMINI_API_KEY : '');

    if (providerType === 'vertex-ai') {
      const response = await fetch('/api/vertex/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: config.projectId,
          location: config.baseUrl || 'us-central1',
          model: config.models[0] || "gemini-1.5-flash",
          apiKey: config.apiKey,
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
    }

    if (providerType === 'gemini') {
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey, baseUrl: config.baseUrl });
      const response = await ai.models.generateContent({
        model: config.models[0] || "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                milestone: { type: Type.STRING },
                priority: { type: Type.STRING }
              },
              required: ['id', 'title', 'description', 'milestone', 'priority']
            }
          }
        }
      });
      return JSON.parse(response.text || "[]");
    } else {
      const openai = new OpenAI({ apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: config.models[0] || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      const text = response.choices[0].message.content || '{"items":[]}';
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (parsed.items || []);
    }
  } catch (error) {
    console.error('Roadmap Error:', error);
    return [];
  }
}

export async function applyInsightFix(file: string, content: string) {
  const res = await fetch('/api/project/apply-fix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, content })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to apply fix');
  }
  return res.json();
}

export interface ProjectDream {
  id: string;
  topic: string;
  vision: string;
  impact: string;
  probability: number; // 0-100
}

export async function getProjectDreams(
  providerType: AnalysisProvider,
  config: ProviderConfig
): Promise<ProjectDream[]> {
  try {
    const contextRes = await fetch('/api/project/analyze');
    const context: ProjectContext = await contextRes.json();

    const prompt = `
      You are a Visionary Futurist in Software Engineering. 
      "Dream" about the potential of this project. Do not give standard advice.
      Imagine radical technology shifts (e.g., decentralized storage, AI-agent self-writing logic, neural interfaces).
      IMPORTANT: All topics, visions, and impacts MUST be in Chinese (Simplified).
      
      File Tree: ${JSON.stringify(context.tree, null, 2)}
      
      Provide 3-5 "Dreams".
      Response JSON structure:
      [
        {
          "id": "slug",
          "topic": "The Dream Topic",
          "vision": "A brief poetic description of the future shift",
          "impact": "How it changes everything for this app",
          "probability": 15 // Experimental low probability
        }
      ]
    `;

    const apiKey = config.apiKey || (providerType === 'gemini' ? (process.env as any).GEMINI_API_KEY : '');

    if (providerType === 'vertex-ai') {
      const response = await fetch('/api/vertex/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: config.projectId,
          location: config.baseUrl || 'us-central1',
          model: config.models[0] || "gemini-1.5-flash",
          apiKey: config.apiKey,
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
    }

    if (providerType === 'gemini') {
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey, baseUrl: config.baseUrl });
      const response = await ai.models.generateContent({
        model: config.models[0] || "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                topic: { type: Type.STRING },
                vision: { type: Type.STRING },
                impact: { type: Type.STRING },
                probability: { type: Type.NUMBER }
              },
              required: ['id', 'topic', 'vision', 'impact', 'probability']
            }
          }
        }
      });
      return JSON.parse(response.text || "[]");
    } else {
      const openai = new OpenAI({ apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: config.models[0] || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      const text = response.choices[0].message.content || '{"dreams":[]}';
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (parsed.dreams || []);
    }
  } catch (error) {
    return [];
  }
}

export interface CoordinatorPlan {
  research: { task: string; insight: string };
  synthesis: { task: string; insight: string };
  implementation: { task: string; insight: string };
  verification: { task: string; insight: string };
}

export interface KairosLog {
  timestamp: string;
  event: string;
  type: string;
}

export async function getCoordinatorPlan(provider: AnalysisProvider, config: any, userGoal: string): Promise<CoordinatorPlan> {
  const prompt = `你现在是 "Coordinator Mode" 多智能体协调员。
用户的宏伟目标是：${userGoal}

请按照以下四个阶段拆解这个复杂任务：
1. Research (研究): 探索现状、竞品与技术栈。
2. Synthesis (综合): 将研究结果转化为具体的架构决策与逻辑计划。
3. Implementation (实施): 编写核心代码、组件或服务的具体步骤。
4. Verification (验证): 定义测试用例、边缘情况检查与性能基准。

请以 JSON 格式返回，结构如下：
{
  "research": { "task": "...", "insight": "..." },
  "synthesis": { "task": "...", "insight": "..." },
  "implementation": { "task": "...", "insight": "..." },
  "verification": { "task": "...", "insight": "..." }
}
务必只返回 JSON。`;

  try {
    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      return JSON.parse(response.text);
    } else {
      const openai = new OpenAI({ apiKey: config.apiKey, dangerouslyAllowBrowser: true, baseURL: config.baseUrl });
      const response = await openai.chat.completions.create({
        model: config.modelName || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      return JSON.parse(response.choices[0].message.content || '{}');
    }
  } catch (error) {
    console.error('Coordinator Error:', error);
    return {
      research: { task: "无法分析", insight: "研究中断" },
      synthesis: { task: "无法综合", insight: "逻辑受阻" },
      implementation: { task: "无法实施", insight: "开发限制" },
      verification: { task: "无法验证", insight: "质量风险" }
    };
  }
}

export async function runUltraplan(provider: AnalysisProvider, config: any, topic: string): Promise<string> {
  const prompt = `你现在是 "Ultraplan" 云端深度规划引擎。
请针对以下主题进行深度思考演化：【${topic}】
你的思考必须包含：长期趋势、隐藏风险、指数级机会以及最终的战略蓝图。
请写一篇不少于 800 字的详细思考报告。使用专业且具有前瞻性的语气。`;

  try {
    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
      });
      return response.text;
    } else {
      const openai = new OpenAI({ apiKey: config.apiKey, dangerouslyAllowBrowser: true, baseURL: config.baseUrl });
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }]
      });
       return response.choices[0].message.content || '思考失败。';
    }
  } catch (error) {
    console.error('Ultraplan Error:', error);
    return '云端规划中继失败，请检查网络连接。';
  }
}

export async function getKairosLogs(): Promise<{ logs: KairosLog[]; lastPatrol: string }> {
  try {
    const res = await fetch('/api/kairos/logs');
    return await res.json();
  } catch {
    return { logs: [], lastPatrol: "OFFLINE" };
  }
}
