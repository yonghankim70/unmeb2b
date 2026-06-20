import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function getImageCacheRoot(): string {
  return path.resolve(process.env.B2B_IMAGE_CACHE_DIR || path.join(process.cwd(), 'public', 'image-cache'));
}

function getStatusPath(): string {
  const statusDir = path.resolve(process.env.B2B_IMAGE_OPTIMIZE_STATUS_DIR || path.join(os.tmpdir(), 'b2b-image-optimize-status'));
  return path.join(statusDir, 'image-optimize-status.json');
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

export async function GET() {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      status: readStatus(),
      cacheRoot: getImageCacheRoot(),
    });
  } catch (error: any) {
    console.error('[Image Optimize API GET] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const cacheRoot = getImageCacheRoot();
    fs.mkdirSync(cacheRoot, { recursive: true });

    const statusDir = path.dirname(getStatusPath());
    fs.mkdirSync(statusDir, { recursive: true });
    const logPath = path.join(statusDir, 'image-optimize.log');
    const logFd = fs.openSync(logPath, 'a');
    const child = spawn(process.execPath, ['scripts/warm-image-cache.js'], {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      env: {
        ...process.env,
        B2B_MAIN_IMAGE_WARM_LIMIT: process.env.B2B_MAIN_IMAGE_WARM_LIMIT || '1000',
        B2B_DETAIL_IMAGE_WARM_COUNT: process.env.B2B_DETAIL_IMAGE_WARM_COUNT || '999',
        B2B_MAIN_IMAGE_WIDTHS: process.env.B2B_MAIN_IMAGE_WIDTHS || '480,960',
        B2B_DETAIL_IMAGE_WIDTHS: process.env.B2B_DETAIL_IMAGE_WIDTHS || '1200,2200',
        B2B_MAIN_IMAGE_QUALITY: process.env.B2B_MAIN_IMAGE_QUALITY || '92',
        B2B_DETAIL_IMAGE_QUALITY: process.env.B2B_DETAIL_IMAGE_QUALITY || '92',
      },
      stdio: ['ignore', logFd, logFd],
    });

    child.unref();

    fs.writeFileSync(getStatusPath(), JSON.stringify({
      status: 'starting',
      startedAt: new Date().toISOString(),
      cacheRoot,
      logPath,
      pid: child.pid,
      detailImageWarmCount: Number(process.env.B2B_DETAIL_IMAGE_WARM_COUNT || '999'),
    }, null, 2), 'utf8');

    return NextResponse.json({
      success: true,
      message: 'WebP 최적화를 백그라운드에서 시작했습니다.',
      pid: child.pid,
      cacheRoot,
      logPath,
    });
  } catch (error: any) {
    console.error('[Image Optimize API POST] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
