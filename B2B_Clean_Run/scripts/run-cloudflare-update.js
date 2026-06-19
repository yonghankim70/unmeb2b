const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CWD = process.cwd();
const STATUS_DIR = path.resolve(process.env.B2B_CLOUDFLARE_SYNC_STATUS_DIR || path.join(os.tmpdir(), 'b2b-cloudflare-sync-status'));
const STATUS_PATH = path.join(STATUS_DIR, 'cloudflare-sync-status.json');
const LOG_PATH = path.join(STATUS_DIR, 'cloudflare-sync.log');

function ensureStatusDir() {
  fs.mkdirSync(STATUS_DIR, { recursive: true });
}

function writeStatus(status) {
  ensureStatusDir();
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8');
}

function runNodeScript(scriptPath, args, logFd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: CWD,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function main() {
  ensureStatusDir();
  const logFd = fs.openSync(LOG_PATH, 'a');
  const startedAt = new Date().toISOString();

  writeStatus({
    status: 'running',
    step: 'image-optimize',
    startedAt,
    logPath: LOG_PATH,
    message: 'WebP 생성부터 시작합니다.',
  });

  try {
    await runNodeScript(path.join('scripts', 'warm-image-cache.js'), [], logFd);

    writeStatus({
      status: 'running',
      step: 'cloud-sync',
      startedAt,
      logPath: LOG_PATH,
      message: 'D1/R2 서버 반영을 진행 중입니다.',
    });

    await runNodeScript(path.join('scripts', 'cloudflare-sync.js'), ['--apply', '--all'], logFd);

    writeStatus({
      status: 'completed',
      step: 'completed',
      startedAt,
      completedAt: new Date().toISOString(),
      logPath: LOG_PATH,
      message: 'WebP 생성과 D1/R2 서버 반영이 완료되었습니다.',
    });
  } catch (error) {
    writeStatus({
      status: 'failed',
      step: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      logPath: LOG_PATH,
      error: error instanceof Error ? error.message : String(error),
      message: '서버 반영 중 오류가 발생했습니다.',
    });
    process.exitCode = 1;
  } finally {
    fs.closeSync(logFd);
  }
}

main();
