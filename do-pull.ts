import { exec } from 'child_process';

const repoUrl = 'https://github.com/langdexuming/cccApp.git';
const branch = 'main';

console.log(`🚀 Starting force pull and overwrite from ${repoUrl} [${branch}]...`);

const commands = [
  'git init',
  'git remote remove origin || true',
  `git remote add origin ${repoUrl}`,
  `git fetch origin ${branch}`,
  `git reset --hard origin/${branch}`,
  'git submodule update --init --recursive || true'
].join(' && ');

exec(commands, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Git error: ${error.message}`);
    console.error(`STDOUT: ${stdout}`);
    console.error(`STDERR: ${stderr}`);
    process.exit(1);
  }
  console.log('✅ Git pull and overwrite successful!');
  console.log(`STDOUT: ${stdout}`);
  if (stderr) console.log(`STDERR: ${stderr}`);
});
