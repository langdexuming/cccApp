import { exec } from 'child_process';
exec('git --version', (err, stdout, stderr) => {
  if (err) {
    console.error('Git not found:', err);
    process.exit(1);
  }
  console.log('Git version:', stdout);
});
