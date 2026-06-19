import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function getStatusDir(): string {
  return path.resolve(process.env.B2B_CLOUDFLARE_SYNC_STATUS_DIR || path.join(os.tmpdir(), 'b2b-cloudflare-sync-status'));
}

function getStatusPath(): string {
  return path.join(getStatusDir(), 'cloudflare-sync-status.json');
}

function getLogPath(): string {
  return path.join(getStatusDir(), 'cloudflare-sync.log');
}

function readStatus() {
  const statusPath = getStatusPath();
  if (!fs.existsSync(statusPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch {
    return null;
  }
}

function isLocalAdminRequest(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.toLowerCase();
  return host.includes('localhost:') || host.includes('127.0.0.1:');
}

export async function GET(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      localOnly: true,
      available: isLocalAdminRequest(request.headers.get('host')),
      status: readStatus(),
      statusPath: getStatusPath(),
      logPath: getLogPath(),
    });
  } catch (error: any) {
    console.error('[Cloudflare Sync API GET] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isLocalAdminRequest(request.headers.get('host'))) {
      return NextResponse.json({
        success: false,
        message: '이전 로컬 반영 기능은 운영 서버에서 사용하지 않습니다. 운영 데이터는 D1/R2 관리자 기능으로 직접 반영됩니다.',
      }, { status: 400 });
    }

    const currentStatus = readStatus();
    if (currentStatus?.status === 'running') {
      return NextResponse.json({
        success: false,
        message: '서버 반영 작업이 이미 진행 중입니다. 잠시 후 상태를 다시 확인해 주세요.',
      }, { status: 409 });
    }

    const statusDir = getStatusDir();
    fs.mkdirSync(statusDir, { recursive: true });

    const child = spawn(process.execPath, ['scripts/run-cloudflare-update.js'], {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      env: {
        ...process.env,
        B2B_CLOUDFLARE_SYNC_STATUS_DIR: statusDir,
      },
      stdio: 'ignore',
    });

    child.unref();

    fs.writeFileSync(getStatusPath(), JSON.stringify({
      status: 'starting',
      step: 'starting',
      startedAt: new Date().toISOString(),
      pid: child.pid,
      logPath: getLogPath(),
      message: '서버 반영 작업을 시작했습니다.',
    }, null, 2), 'utf8');

    return NextResponse.json({
      success: true,
      message: 'WebP 생성과 서버 반영을 백그라운드에서 시작했습니다.',
      pid: child.pid,
      logPath: getLogPath(),
    });
  } catch (error: any) {
    console.error('[Cloudflare Sync API POST] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
