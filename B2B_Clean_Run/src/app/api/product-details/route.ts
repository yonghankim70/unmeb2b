import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getDbPath } from '@/lib/db';
import { formatProduct } from '@/lib/dataTypes';
import { isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';
import { getR2CacheSegment, listR2Objects } from '@/lib/cloudflareR2';
import { resolveInside } from '@/lib/pathSafety';

export const dynamic = 'force-dynamic';

const DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAILS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

interface ProductDetailsResult {
  images: string[];
  targetDir: string;
  targetDirExists: boolean;
  etag: string;
}

interface CachedProductDetails {
  value: ProductDetailsResult;
  expiresAt: number;
}

const productDetailsCache = new Map<string, CachedProductDetails>();

function isDetailAsset(fileName: string): boolean {
  const normalized = fileName.toLowerCase();
  if (normalized === 'folder.jpg' || normalized === 'folder.jpeg' || normalized === 'folder.png' || normalized === 'folder.webp') {
    return false;
  }
  const ext = path.extname(fileName).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || ext === '.gif' || ext === '.mp4' || ext === '.webm';
}

function createDetailsEtag(dbPath: string, week: string, code: string, images: string[]): string {
  const hash = createHash('sha1')
    .update(dbPath)
    .update('|')
    .update(week)
    .update('|')
    .update(code)
    .update('|')
    .update(images.join('|'))
    .digest('base64url');
  return `W/"details-${hash}"`;
}

function readAssetNames(dirPath: string): string[] {
  return fs.readdirSync(dirPath).filter(isDetailAsset).sort();
}

function decodeTwice(value: string): string {
  try {
    return decodeURIComponent(decodeURIComponent(value));
  } catch {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}

function sortImageNames(images: string[]): string[] {
  return [...images].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

async function readCloudDetailImageNames(week: string, code: string): Promise<string[]> {
  const prefix = `image-cache/detail/${encodeURIComponent(week)}/${getR2CacheSegment(code)}/`;
  const keys = await listR2Objects(prefix);
  const unique = new Set<string>();

  for (const key of keys) {
    const tail = key.slice(prefix.length);
    if (!tail) continue;
    const match = tail.match(/^(.*)-(?:1200|1600)\.webp$/i);
    if (!match) continue;
    const decoded = decodeTwice(match[1]).trim();
    if (!decoded || !isDetailAsset(decoded)) continue;
    unique.add(decoded);
  }

  return sortImageNames([...unique]);
}

function resolveProductDetails(dbPath: string, week: string, code: string): ProductDetailsResult | null {
  let targetDir = resolveInside(dbPath, week, code);
  if (!targetDir) return null;

  let targetDirExists = fs.existsSync(targetDir);

  if (!targetDirExists) {
    const fallbackDir = resolveInside(dbPath, week, code + '_temp_refresh');
    if (fallbackDir && fs.existsSync(fallbackDir)) {
      targetDir = fallbackDir;
      targetDirExists = true;
    }
  }

  if (!targetDirExists) {
    const images: string[] = [];
    return {
      images,
      targetDir,
      targetDirExists: false,
      etag: createDetailsEtag(dbPath, week, code, images),
    };
  }

  let images = readAssetNames(targetDir);

  if (images.length === 0) {
    const fallbackDir = resolveInside(dbPath, week, code + '_temp_refresh');
    if (fallbackDir && fs.existsSync(fallbackDir)) {
      try {
        const fallbackImages = readAssetNames(fallbackDir);
        if (fallbackImages.length > 0) {
          targetDir = fallbackDir;
          images = fallbackImages;
        }
      } catch (err) {
        console.error('[ProductDetails API] Failed to read fallbackDir:', err);
      }
    }
  }

  return {
    images,
    targetDir,
    targetDirExists: true,
    etag: createDetailsEtag(dbPath, week, code, images),
  };
}

function getCachedProductDetails(dbPath: string, week: string, code: string): ProductDetailsResult | null {
  const key = [dbPath, week, code].join('|');
  const cached = productDetailsCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = resolveProductDetails(dbPath, week, code);
  if (value) {
    productDetailsCache.set(key, {
      value,
      expiresAt: now + DETAILS_CACHE_TTL_MS,
    });
  } else {
    productDetailsCache.delete(key);
  }

  return value;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const week = searchParams.get('week');
    const code = searchParams.get('code');

    if (!week || !code) {
      return NextResponse.json({ success: false, message: 'Missing week or code' }, { status: 400 });
    }

    if (isCloudDbEnabled()) {
      const rows = await queryD1<{ payload?: string }>('SELECT payload FROM products WHERE code = ? LIMIT 1', [code]);
      const row = rows[0];
      if (!row?.payload) {
        return NextResponse.json({ success: true, images: [] }, {
          headers: {
            'Cache-Control': DETAILS_CACHE_CONTROL,
          }
        });
      }

      const product = formatProduct(JSON.parse(row.payload));
      const embeddedImages = Array.isArray(product.상세이미지목록)
        ? product.상세이미지목록.map((imageName) => String(imageName || '').trim()).filter(Boolean)
        : [];
      const images = embeddedImages.length > 0 ? sortImageNames(embeddedImages) : await readCloudDetailImageNames(week, code);

      return NextResponse.json(
        {
          success: true,
          images,
        },
        {
          headers: {
            'Cache-Control': DETAILS_CACHE_CONTROL,
          }
        }
      );
    }

    const dbPath = getDbPath();
    const details = getCachedProductDetails(dbPath, week, code);
    if (!details) {
      return NextResponse.json({ success: false, message: 'Access Denied' }, { status: 403 });
    }

    if (request.headers.get('if-none-match') === details.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': DETAILS_CACHE_CONTROL,
          'ETag': details.etag,
        }
      });
    }

    // Security: Do NOT scan or return buyerInfo (사입처) to the client-side API
    return NextResponse.json(
      {
        success: true,
        images: details.images
      },
      {
        headers: {
          'Cache-Control': DETAILS_CACHE_CONTROL,
          'ETag': details.etag,
        }
      }
    );

  } catch (error: any) {
    console.error('Product details API error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
