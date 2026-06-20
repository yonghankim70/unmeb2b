import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDbPath } from '@/lib/db';
import { resolveInside } from '@/lib/pathSafety';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';

const IMAGE_LOOKUP_TTL_MS = 5 * 60 * 1000;
const IMAGE_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';
const PLACEHOLDER_CACHE_CONTROL = 'public, max-age=30';
const IMAGE_BYTE_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const IMAGE_BYTE_CACHE_MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAIN_IMAGE_HINTS = new Set(['folder.jpg', 'folder.jpeg', 'folder.png', 'folder.webp', 'product_main.jpg', 'product_main.jpeg', 'product_main.png', 'product_main.webp']);
const R2_IMAGE_BASE_URL = (process.env.NEXT_PUBLIC_R2_IMAGE_BASE_URL || process.env.CF_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

interface ImageLookup {
  targetDir: string;
  targetDirExists: boolean;
  filesInDir: string[];
  selectedBy: string;
  targetFilePath: string;
}

interface CachedImageLookup {
  value: ImageLookup;
  expiresAt: number;
}

interface CachedImageBytes {
  body: ArrayBuffer;
  bytes: number;
  lastUsed: number;
}

const imageLookupCache = new Map<string, CachedImageLookup>();
const imageByteCache = new Map<string, CachedImageBytes>();
let imageByteCacheSize = 0;

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  return 'image/jpeg';
}

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.mp4' || ext === '.webm';
}

function isSupportedImageName(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || ext === '.gif';
}

function priorityForMainImage(fileName: string): number {
  const normalized = fileName.toLowerCase();
  if (normalized === 'folder.jpg' || normalized === 'folder.jpeg' || normalized === 'folder.png' || normalized === 'folder.webp') {
    return 0;
  }
  if (normalized.startsWith('product_main.')) return 1;
  return 2;
}

function findValidImage(dirPath: string, files: string[]): string | undefined {
  return [...files]
    .filter((fileName) => !fileName.startsWith('0') && isSupportedImageName(fileName))
    .sort((left, right) => {
      const priorityDiff = priorityForMainImage(left) - priorityForMainImage(right);
      return priorityDiff || left.localeCompare(right);
    })
    .find((fileName) => {
      try {
        const filePath = path.join(dirPath, fileName);
        const stats = fs.statSync(filePath);
        return stats.isFile() && stats.size > 2048;
      } catch {
        return false;
      }
    });
}

function readDirSafe(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch (error) {
    console.error('[Image API] Error reading image dir:', error);
    return [];
  }
}

function getLookupCacheKey(dbPath: string, week: string, code: string, file: string | null, version: string | null): string {
  return [dbPath, week, code, file || '', version || ''].join('|');
}

function getImageCacheRoot(): string {
  return path.resolve(process.env.B2B_IMAGE_CACHE_DIR || path.join(process.cwd(), 'public', 'image-cache'));
}

function getCacheSegment(value: string): string {
  return encodeURIComponent(encodeURIComponent(value));
}

function getCloudImageUrl(week: string, code: string, file: string | null): string | null {
  if (!R2_IMAGE_BASE_URL) return null;

  if (file && !MAIN_IMAGE_HINTS.has(file.toLowerCase())) {
    return `${R2_IMAGE_BASE_URL}/image-cache/detail/${encodeURIComponent(week)}/${getCacheSegment(code)}/${getCacheSegment(file)}-2200.webp`;
  }

  return `${R2_IMAGE_BASE_URL}/image-cache/main/${encodeURIComponent(week)}/${getCacheSegment(code)}-960.webp`;
}

function isInside(rootDir: string, targetPath: string): boolean {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function findCachedMainImage(week: string, code: string): ImageLookup | null {
  const cacheRoot = getImageCacheRoot();
  const targetDir = resolveInside(cacheRoot, 'main', week);
  if (!targetDir || !fs.existsSync(targetDir)) return null;

  const encodedCode = encodeURIComponent(code);
  const filesInDir = readDirSafe(targetDir);
  const cachedFile = filesInDir.find((fileName) => {
    if (!fileName.startsWith(`${encodedCode}.`)) return false;
    return isSupportedImageName(fileName);
  });

  if (!cachedFile) return null;

  const targetFilePath = resolveInside(targetDir, cachedFile);
  if (!targetFilePath) return null;

  try {
    const stats = fs.statSync(targetFilePath);
    if (!stats.isFile() || stats.size <= 2048) return null;
  } catch {
    return null;
  }

  return {
    targetDir,
    targetDirExists: true,
    filesInDir,
    selectedBy: 'local_main_cache',
    targetFilePath,
  };
}

function findCachedDetailImage(week: string, code: string, file: string): ImageLookup | null {
  const cacheRoot = getImageCacheRoot();
  const targetDir = resolveInside(cacheRoot, 'detail', week, encodeURIComponent(code));
  if (!targetDir || !fs.existsSync(targetDir)) return null;

  const targetFilePath = resolveInside(targetDir, file);
  if (!targetFilePath || !fs.existsSync(targetFilePath)) return null;

  try {
    const stats = fs.statSync(targetFilePath);
    if (!stats.isFile() || stats.size <= 2048) return null;
  } catch {
    return null;
  }

  return {
    targetDir,
    targetDirExists: true,
    filesInDir: readDirSafe(targetDir),
    selectedBy: 'local_detail_cache',
    targetFilePath,
  };
}

function resolveImage(dbPath: string, week: string, code: string, file: string | null): ImageLookup | null {
  if (!file || MAIN_IMAGE_HINTS.has(file.toLowerCase())) {
    const cachedMainImage = findCachedMainImage(week, code);
    if (cachedMainImage) return cachedMainImage;
  }

  if (file) {
    const cachedDetailImage = findCachedDetailImage(week, code, file);
    if (cachedDetailImage) return cachedDetailImage;
  }

  let targetDir = resolveInside(dbPath, week, code);
  if (!targetDir) return null;

  let targetDirExists = fs.existsSync(targetDir);
  let filesInDir = targetDirExists ? readDirSafe(targetDir) : [];
  let imageFile = targetDirExists ? findValidImage(targetDir, filesInDir) : undefined;

  if (!targetDirExists || (!file && !imageFile)) {
    const fallbackDir = resolveInside(dbPath, week, code + '_temp_refresh');
    if (fallbackDir && fs.existsSync(fallbackDir)) {
      targetDir = fallbackDir;
      targetDirExists = true;
      filesInDir = readDirSafe(targetDir);
      imageFile = findValidImage(targetDir, filesInDir);
    }
  }

  let targetFilePath = '';
  let selectedBy = 'none';

  if (file) {
    const resolvedFilePath = resolveInside(targetDir, file);
    if (!resolvedFilePath) return null;

    targetFilePath = resolvedFilePath;
    selectedBy = 'explicit_param';

    if (!fs.existsSync(targetFilePath)) {
      const fallbackDir = resolveInside(dbPath, week, code + '_temp_refresh');
      const fallbackFilePath = fallbackDir ? resolveInside(fallbackDir, file) : null;
      if (fallbackDir && fallbackFilePath && fs.existsSync(fallbackFilePath)) {
        targetDir = fallbackDir;
        targetDirExists = true;
        targetFilePath = fallbackFilePath;
        filesInDir = readDirSafe(targetDir);
      }
    }
  } else if (targetDirExists && imageFile) {
    const resolvedFilePath = resolveInside(targetDir, imageFile);
    if (!resolvedFilePath) return null;

    targetFilePath = resolvedFilePath;
    selectedBy = 'auto_first_match';
  }

  return {
    targetDir,
    targetDirExists,
    filesInDir,
    selectedBy,
    targetFilePath,
  };
}

function getCachedImageLookup(dbPath: string, week: string, code: string, file: string | null, version: string | null): ImageLookup | null {
  const key = getLookupCacheKey(dbPath, week, code, file, version);
  const cached = imageLookupCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = resolveImage(dbPath, week, code, file);
  if (value) {
    imageLookupCache.set(key, {
      value,
      expiresAt: now + IMAGE_LOOKUP_TTL_MS,
    });
  } else {
    imageLookupCache.delete(key);
  }

  return value;
}

function createEtag(stats: fs.Stats): string {
  return `W/"${stats.size}-${Math.floor(stats.mtimeMs)}"`;
}

function clientHasFreshImage(request: NextRequest, etag: string, stats: fs.Stats): boolean {
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').map((value) => value.trim()).includes(etag)) {
    return true;
  }

  const ifModifiedSince = request.headers.get('if-modified-since');
  if (!ifModifiedSince) return false;

  const clientTime = Date.parse(ifModifiedSince);
  return Number.isFinite(clientTime) && clientTime >= Math.floor(stats.mtimeMs / 1000) * 1000;
}

function imageHeaders(contentType: string, stats: fs.Stats, isVideo: boolean): HeadersInit {
  return {
    'Content-Type': contentType,
    'Content-Length': stats.size.toString(),
    'Accept-Ranges': isVideo ? 'bytes' : 'none',
    'Cache-Control': IMAGE_CACHE_CONTROL,
    'ETag': createEtag(stats),
    'Last-Modified': stats.mtime.toUTCString(),
  };
}

function streamFile(filePath: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const fileStream = fs.createReadStream(filePath, start !== undefined && end !== undefined ? { start, end } : undefined);

  return new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      fileStream.on('end', () => controller.close());
      fileStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      fileStream.destroy();
    }
  });
}

function getByteCacheKey(filePath: string, stats: fs.Stats): string {
  return `${filePath}|${stats.size}|${Math.floor(stats.mtimeMs)}`;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

function evictImageByteCache(): void {
  if (imageByteCacheSize <= IMAGE_BYTE_CACHE_MAX_BYTES) return;

  const oldestEntries = [...imageByteCache.entries()].sort((left, right) => left[1].lastUsed - right[1].lastUsed);
  for (const [key, value] of oldestEntries) {
    imageByteCache.delete(key);
    imageByteCacheSize -= value.bytes;
    if (imageByteCacheSize <= IMAGE_BYTE_CACHE_MAX_BYTES) break;
  }
}

function readImageBytesCached(filePath: string, stats: fs.Stats, isVideo: boolean): ArrayBuffer | ReadableStream<Uint8Array> {
  if (isVideo || stats.size > IMAGE_BYTE_CACHE_MAX_FILE_BYTES) {
    return streamFile(filePath);
  }

  const key = getByteCacheKey(filePath, stats);
  const cached = imageByteCache.get(key);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.body;
  }

  const buffer = fs.readFileSync(filePath);
  const body = toArrayBuffer(buffer);
  imageByteCache.set(key, {
    body,
    bytes: buffer.length,
    lastUsed: Date.now(),
  });
  imageByteCacheSize += buffer.length;
  evictImageByteCache();

  return body;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get('week');
  const code = searchParams.get('code');
  const file = searchParams.get('file');
  const version = searchParams.get('t') || searchParams.get('v');
  const debug = process.env.NODE_ENV !== 'production' && searchParams.get('debug') === 'true';

  try {
    if (!week || !code) {
      if (debug) {
        return NextResponse.json({ status: 'error', message: 'Missing week or code query parameters' });
      }
      return new NextResponse('Bad Request: Missing week or code', { status: 400 });
    }

    if (isCloudDbEnabled()) {
      const cloudImageUrl = getCloudImageUrl(week, code, file);
      if (cloudImageUrl) {
        return NextResponse.redirect(cloudImageUrl, {
          status: 307,
          headers: {
            'Cache-Control': IMAGE_CACHE_CONTROL,
          },
        });
      }

      return servePlaceholder();
    }

    const dbPath = getDbPath();
    const lookup = getCachedImageLookup(dbPath, week, code, file, version);
    if (!lookup) {
      if (debug) {
        return NextResponse.json({ status: 'error', message: 'Invalid image path' });
      }
      return servePlaceholder();
    }

    const targetFilePath = lookup.targetFilePath;
    const targetFileExists = targetFilePath ? fs.existsSync(targetFilePath) : false;
    const stats = targetFileExists ? fs.statSync(targetFilePath) : null;
    const isFile = Boolean(stats?.isFile());
    const isLargeEnough = Boolean(stats && stats.size > 2048);

    // Security Checks
    const resolvedDbPath = path.resolve(dbPath);
    const resolvedCacheRoot = getImageCacheRoot();
    const securityCheck1 = isInside(resolvedDbPath, lookup.targetDir) || isInside(resolvedCacheRoot, lookup.targetDir);
    const securityCheck2 = targetFilePath ? isInside(lookup.targetDir, targetFilePath) : false;
    const passesSecurity = securityCheck1 && (file ? securityCheck2 : true);

    // If debug is requested, return JSON info instead of streaming bytes
    if (debug) {
      return NextResponse.json({
        debug: true,
        dbPath,
        resolvedTargetDir: lookup.targetDir,
        targetDirExists: lookup.targetDirExists,
        filesInDir: lookup.filesInDir,
        selectedBy: lookup.selectedBy,
        resolvedFilePath: targetFilePath,
        targetFileExists,
        isFile,
        isLargeEnough,
        cache: {
          lookupTtlMs: IMAGE_LOOKUP_TTL_MS,
          responseCacheControl: IMAGE_CACHE_CONTROL,
        },
        securityChecks: {
          passesSecurity,
          securityCheck1_DirUnderAllowedRoot: securityCheck1,
          securityCheck2_FileUnderTargetDir: securityCheck2,
        }
      });
    }

    // Normal streaming behavior
    if (!lookup.targetDirExists || !passesSecurity || !targetFilePath || !targetFileExists || !stats || !isFile || !isLargeEnough) {
      return servePlaceholder();
    }

    const contentType = getContentType(targetFilePath);
    const isVideo = isVideoFile(targetFilePath);
    const etag = createEtag(stats);

    if (!isVideo && clientHasFreshImage(request, etag, stats)) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': IMAGE_CACHE_CONTROL,
          'ETag': etag,
          'Last-Modified': stats.mtime.toUTCString(),
        }
      });
    }

    // HTTP Range Requests for video streaming (needed for Safari and smooth controls)
    const range = request.headers.get('range');
    if (isVideo && range) {
      const fileSize = stats.size;
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new Response('Requested Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` }
        });
      }

      const chunksize = (end - start) + 1;

      return new Response(streamFile(targetFilePath, start, end), {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
          'Cache-Control': IMAGE_CACHE_CONTROL,
          'ETag': etag,
          'Last-Modified': stats.mtime.toUTCString(),
        }
      });
    }

    return new Response(readImageBytesCached(targetFilePath, stats, isVideo), {
      status: 200,
      headers: imageHeaders(contentType, stats, isVideo),
    });
  } catch (error: any) {
    console.error('Image Serving API error:', error);
    if (debug) {
      return NextResponse.json({ status: 'error', message: error.message });
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Fallback nice placeholder SVG when image is not found
function servePlaceholder() {
  const placeholderSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
      <rect width="100%" height="100%" fill="#f7f7f7" />
      <g transform="translate(0, 180)">
        <text x="50%" y="0" dominant-baseline="middle" text-anchor="middle" font-family="serif" font-size="14" fill="#a0a0a0" letter-spacing="2">U &amp; M E</text>
        <text x="50%" y="25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#c0c0c0" letter-spacing="1">Preparing Image</text>
      </g>
    </svg>
  `;
  
  return new Response(placeholderSvg.trim(), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': PLACEHOLDER_CACHE_CONTROL,
    },
  });
}
