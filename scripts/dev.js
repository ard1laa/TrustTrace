// `npm run dev`: starts the API server (port 3001) and the website (port 5173)
// together. If either one stops, the other is stopped too and the reason is
// printed, so a crashed server is never hidden behind a running website.
import { spawn } from 'child_process';
import net from 'net';

const API_PORT = Number(process.env.PORT || 3001);
const WEB_PORT = 5173;

const portInUse = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, '0.0.0.0');
  });

for (const [port, what] of [
  [API_PORT, 'API server'],
  [WEB_PORT, 'website']
]) {
  if (await portInUse(port)) {
    console.error(`\n✖ Port ${port} (${what}) is already in use. TrustTrace is probably already running in another terminal.`);
    console.error(`  Stop that one with Ctrl+C, or free the port:  lsof -ti tcp:${port} | xargs kill\n`);
    process.exit(1);
  }
}

const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}

function start(name, cmd, args, env) {
  const child = spawn(cmd, args, { stdio: 'inherit', env });
  child.on('error', (err) => {
    console.error(`\n✖ Could not start the ${name}: ${err.message}`);
    stopAll(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`\n✖ The ${name} stopped (${signal || `exit code ${code}`}). Read the lines above for the reason. Stopping everything.`);
    stopAll(code || 1);
  });
  children.push(child);
}

start('API server', process.execPath, ['server/index.js'], { ...process.env, PORT: String(API_PORT) });
start('website', 'npx', ['vite', '--port', String(WEB_PORT), '--strictPort', '--host'], process.env);

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
