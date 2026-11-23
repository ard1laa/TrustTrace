import { spawn } from 'child_process';

const server = spawn('node', ['server/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || '3001' }
});

const client = spawn('npx', ['vite', '--port', '5173', '--host'], {
  stdio: 'inherit',
  env: process.env
});

const cleanup = () => {
  server.kill('SIGTERM');
  client.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
