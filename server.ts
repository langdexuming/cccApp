import { exec } from 'child_process';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
