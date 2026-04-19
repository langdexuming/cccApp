/**
 * 在调用 Tauri CLI 前把默认 Cargo 安装目录加入 PATH，避免 Windows 上
 * 「cargo metadata: program not found」（终端/IDE 未继承 PATH）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cargoBin = join(homedir(), '.cargo', 'bin');
const cargoExe = join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo');

if (existsSync(cargoExe)) {
  process.env.PATH = `${cargoBin}${delimiter}${process.env.PATH ?? ''}`;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('用法: node scripts/tauri-with-path.mjs build | dev | …');
  process.exit(1);
}

const probe = spawnSync('cargo', ['--version'], {
  cwd: root,
  shell: true,
  env: process.env,
  encoding: 'utf8',
});
if (probe.status !== 0) {
  console.error(
    '未找到可用的 cargo。请安装 Rust（https://rustup.rs/），或将 cargo 所在目录加入系统 PATH。',
  );
  console.error(`若已用 rustup 安装，常见路径为: ${cargoBin}`);
  process.exit(1);
}

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(cmd, ['tauri', ...args], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(typeof r.status === 'number' ? r.status : 1);
