import { exec } from 'child_process';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

// Mock authentication for Vertex AI (In real app, use gcp-auth or GOOGLE_APPLICATION_CREDENTIALS)
// Here we simulate the token retrieval for demo purposes as requested in the pattern.
async function getGCPToken() {
  // In a real environment, this would use the service account credentials.
  return process.env.GCP_ACCESS_TOKEN || "MOCK_TOKEN";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- KAIROS: Always-on Background Agent Simulation ---
const MEMORY_FILE = path.join(process.cwd(), 'ai_memory.json');
const INITIAL_MEMORY = { logs: [], dreams: [], lastPatrol: null };

function getMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return INITIAL_MEMORY;
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
  } catch {
    return INITIAL_MEMORY;
  }
}

function updateMemory(updater: (mem: any) => void) {
  const mem = getMemory();
  updater(mem);
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2));
}

// Background Task Simulation
setInterval(() => {
  const now = new Date().toISOString();
  updateMemory(mem => {
    const events = [
      "巡逻：未发现显著安全漏洞。",
      "代码压缩建议：检测到冗余 CSS 模块。",
      "KAIROS 梦境：正在模拟 2027 年的 WebGPU 渲染路径...",
      "自动化：已优化部分未使用的导入项 (Mock)。",
      "健康检查：API 响应时间稳定在 42ms。"
    ];
    const newLog = {
      timestamp: now,
      event: events[Math.floor(Math.random() * events.length)],
      type: 'patrol'
    };
    mem.logs = [newLog, ...(mem.logs || [])].slice(0, 50);
    mem.lastPatrol = now;
  });
}, 60000); 
// --- End KAIROS ---

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API endpoint to handle git pull
  app.post('/api/git/pull', (req: any, res: any) => {
    const { repoUrl, branch = 'main' } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    // This is a dangerous operation. In a real app, we should be very careful.
    // We will try to init/clone and then reset hard.
    console.log(`Attempting to pull from ${repoUrl} branch ${branch}`);

    // Sequence of commands:
    // 1. git init (in case it's not a repo)
    // 2. git remote add origin <url> (or update it)
    // 3. git fetch origin <branch>
    // 4. git reset --hard origin/<branch>
    
    const commands = [
      'git init',
      `git remote remove origin || true`,
      `git remote add origin ${repoUrl}`,
      `git fetch origin ${branch}`,
      `git reset --hard origin/${branch}`
    ].join(' && ');

    exec(commands, (error, stdout, stderr) => {
      if (error) {
        console.error(`git error: ${error.message}`);
        return res.status(500).json({ 
          error: error.message, 
          stdout, 
          stderr 
        });
      }
      res.json({ message: 'Git pull and reset successful', stdout, stderr });
    });
  });

  // API endpoint to handle project analysis (gather context)
  app.get('/api/project/analyze', async (req: any, res: any) => {
    try {
      const fs = await import('fs/promises');
      
      const getFileTree = async (dir: string, depth = 0): Promise<any> => {
        if (depth > 5) return null; // Safety limit
        const files = await fs.readdir(dir);
        const result: any[] = [];
        
        for (const file of files) {
          if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
          
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.isDirectory()) {
            result.push({
              name: file,
              type: 'directory',
              children: await getFileTree(filePath, depth + 1)
            });
          } else {
            result.push({ name: file, type: 'file' });
          }
        }
        return result;
      };

      const readKeyFiles = async () => {
        const keyFiles = ['package.json', 'tsconfig.json', 'vite.config.ts', 'src/App.tsx', 'src/main.tsx', 'metadata.json'];
        const contents: Record<string, string> = {};
        
        for (const file of keyFiles) {
          try {
            const data = await fs.readFile(path.join(process.cwd(), file), 'utf-8');
            contents[file] = data;
          } catch (e) {
            // Ignore missing files
          }
        }
        return contents;
      };

      const [tree, files] = await Promise.all([
        getFileTree(process.cwd()),
        readKeyFiles()
      ]);

      // Deep scan for dependencies for the "True Dependency Graph"
      const scanDependencies = async (dir: string): Promise<Record<string, string[]>> => {
        const deps: Record<string, string[]> = {};
        const files = await fs.readdir(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);
          const relPath = path.relative(process.cwd(), filePath);

          if (stats.isDirectory()) {
            if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
            Object.assign(deps, await scanDependencies(filePath));
          } else if (file.match(/\.(ts|tsx|js|jsx)$/)) {
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              const importRegex = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g;
              const matches: string[] = [];
              let match;
              while ((match = importRegex.exec(content)) !== null) {
                matches.push(match[1] || match[2] || match[3]);
              }
              deps[relPath] = matches;
            } catch (e) {}
          }
        }
        return deps;
      };

      const dependencies = await scanDependencies(process.cwd());

      res.json({ tree, files, dependencies });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // API endpoint to apply an AI-suggested fix
  app.post('/api/project/apply-fix', async (req: any, res: any) => {
    try {
      const { file, content } = req.body;
      if (!file || content === undefined) {
        return res.status(400).json({ error: 'File path and content are required' });
      }

      const fs = await import('fs/promises');
      const absolutePath = path.join(process.cwd(), file);

      // Simple security check: must be within project root
      if (!absolutePath.startsWith(process.cwd())) {
        return res.status(403).json({ error: 'Access denied: Path out of bounds' });
      }

      await fs.writeFile(absolutePath, content, 'utf-8');
      res.json({ success: true, message: `Successfully updated ${file}` });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to apply fix' });
    }
  });

  // KAIROS API: Fetch background logs
  app.get('/api/kairos/logs', (req: any, res: any) => {
    res.json(getMemory());
  });

  // Vertex AI Proxy
  app.post('/api/vertex/generate', async (req: any, res: any) => {
    try {
      const { projectId, location, model, contents, apiKey } = req.body;
      
      if (!projectId || !location || !model) {
        return res.status(400).json({ error: 'Missing Vertex AI configuration' });
      }

      // We use the provided apiKey as a fallback if process.env.GCP_ACCESS_TOKEN is missing
      // However, for the provided snippet "Bearer auth(token)", we need an actual token.
      const token = process.env.GCP_ACCESS_TOKEN || apiKey;

      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contents }),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Vertex AI request failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
