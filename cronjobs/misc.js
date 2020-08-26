const spawn = require('child_process').spawn;
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');

const RED_COLOR = '\x1b[31m';
const GREEN_COLOR = '\x1b[32m';
const YELLOW_COLOR = '\x1b[33m';
const RESET_COLOR = '\x1b[0m';

async function spawnAsync(command, ...args) {
  let options = {};
  if (args.length && args[args.length - 1].constructor.name !== 'String')
    options = args.pop();
  const cmd = spawn(command, args, options);
  let stdout = '';
  let stderr = '';
  cmd.stdout.on('data', data => stdout += data);
  cmd.stderr.on('data', data => stderr += data);
  const code = await new Promise(x => cmd.once('close', x));
  return {code, stdout, stderr};
}

async function makeTempDir(prefix, cleanupHooks = []) {
  const TMP_FOLDER = path.join(os.tmpdir(), prefix);
  const tmp = await fs.promises.mkdtemp(TMP_FOLDER);
  cleanupHooks.push(() => fs.rmdirSync(tmp, {recursive: true}));
  return tmp;
}

async function spawnAsyncOrDie(command, ...args) {
  const {code, stdout, stderr} = await spawnAsync(command, ...args);
  if (code !== 0)
    throw new Error(`Failed to executed: "${command} ${args.join(' ')}".\n\n=== STDOUT ===\n${stdout}\n\n\n=== STDERR ===\n${stderr}`);
  return {stdout, stderr};
}

async function headRequest(url) {
  return new Promise(resolve => {
    let options = new URL(url);
    options.method = 'HEAD';
    const request = https.request(options, res => resolve(res.statusCode === 200));
    request.on('error', error => resolve(false));
    request.end();
  });
}

// Process hooks are important so that github workflow actually crashes
// if there's an error in node.js process.
function setupProcessHooks() {
  const cleanupHooks = [];
  process.on('exit', () => {
    for (const cleanup of cleanupHooks) {
      try {
        cleanup();
      } catch (e) {
        console.error(e);
      }
    }
  });
  process.on('SIGINT', () => process.exit(2));
  process.on('SIGHUP', () => process.exit(3));
  process.on('SIGTERM', () => process.exit(4));
  process.on('uncaughtException', error => {
    console.error(error);
    process.exit(5);
  });
  process.on('unhandledRejection', error => {
    console.error(error);
    process.exit(6);
  });
  return cleanupHooks;
}

module.exports = { setupProcessHooks, spawnAsync, spawnAsyncOrDie, headRequest, makeTempDir};