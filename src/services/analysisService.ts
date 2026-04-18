import { GoogleGenAI, Type } from "@google/genai";
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
      
      Provide a comprehensive JSON analysis with:
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
