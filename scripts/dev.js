import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
let ending = false;
function stop() {
  if (ending) return;
  ending = true;
  for (const child of children) child.kill();
}
for (const child of children) child.on('exit', stop);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
