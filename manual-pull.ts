import { exec } from 'child_process';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

const repoUrl = 'https://github.com/langdexuming/cccApp.git';
const branch = 'main';

console.log('🧹 Cleaning up .git directory...');
try {
  if (existsSync('.git')) {
    rmSync('.git', { recursive: true, force: true });
    console.log('✅ .git directory removed.');
  }
} catch (e) {
  console.error('❌ Failed to remove .git:', e);
}

const commands = [
  'git init',
  `git remote add origin ${repoUrl}`,
  `git fetch origin ${branch}`,
  `git reset --hard origin/${branch}`
].join(' && ');

console.log(`🚀 Pulling from ${repoUrl} [${branch}]...`);

exec(commands, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Git error: ${error.message}`);
    console.error(`STDOUT: ${stdout}`);
    console.error(`STDERR: ${stderr}`);
    process.exit(1);
  }
  console.log('✅ Pull successful!');
  console.log(`STDOUT: ${stdout}`);
  if (stderr) console.log(`STDERR: ${stderr}`);
});
