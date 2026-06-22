import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';
import { formatProduct, Product } from '@/lib/dataTypes';
import {
  deleteR2Object,
  getDetailImageKey,
  getMainImageKey,
  getR2CacheSegment,
  getR2PublicUrlForKey,
  listR2Objects,
  putR2Object,
} from '@/lib/cloudflareR2';
import { safeFileName } from '@/lib/pathSafety';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAIN_WIDTHS = [480, 960] as const;
const DETAIL_SOURCE_WIDTHS = [1200, 1600, 2200] as const;
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  Object.entries(NO_STORE_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

function isMainImageFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower === '1.jpg'
    || lower === '1.jpeg'
    || lower === '1.png'
    || lower === '1.webp'
    || lower === 'folder.jpg'
    || lower === 'folder.jpeg'
    || lower === 'folder.png'
    || lower === 'folder.webp';
}

function decodeR2KeySegment(segment: string): string {
  try {
    return decodeURIComponent(decodeURIComponent(segment));
  } catch {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }
}

function normalizeImageName(fileName: string): string {
  return safeFileName(String(fileName || '').trim());
}

function readProductImageNames(product: Product): string[] {
  const names = Array.isArray(product.상세이미지목록) ? product.상세이미지목록 : [];
  const unique: string[] = [];
  for (const name of names) {
    const cleanName = normalizeImageName(name);
    if (cleanName && !unique.includes(cleanName)) unique.push(cleanName);
  }
  return unique;
}

function mergeProductAndStoredImages(productImages: string[], storedImages: string[]): string[] {
  const productUnique: string[] = [];
  for (const name of productImages) {
    const cleanName = normalizeImageName(name);
    if (cleanName && !productUnique.includes(cleanName)) productUnique.push(cleanName);
  }

  if (productUnique.length > 0) {
    return productUnique;
  }

  const storedUnique: string[] = [];
  for (const name of storedImages) {
    const cleanName = normalizeImageName(name);
    if (cleanName && !storedUnique.includes(cleanName)) storedUnique.push(cleanName);
  }

  if (storedUnique.length === 0) {
    return [];
  }

  return storedUnique;
}

async function listCloudDetailImageNames(week: string, code: string): Promise<string[]> {
  const prefix = `image-cache/detail/${encodeURIComponent(week)}/${getR2CacheSegment(code)}/`;
  const keys = await listR2Objects(prefix);
  const names = new Set<string>();

  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const tail = key.slice(prefix.length);
    const match = tail.match(/^(.+)-(?:1200|1600|2200)\.webp$/i);
    if (!match) continue;
    const fileName = normalizeImageName(decodeR2KeySegment(match[1]));
    if (fileName) names.add(fileName);
  }

  return [...names].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

async function readCloudProductByCode(code: string): Promise<Product | null> {
  const rows = await queryD1<{ payload?: string }>('SELECT payload FROM products WHERE code = ? LIMIT 1', [code]);
  const row = rows[0];
  if (!row?.payload) return null;
  try {
    return formatProduct(JSON.parse(row.payload));
  } catch {
    return null;
  }
}

async function writeCloudProduct(product: Product): Promise<void> {
  const code = String(product.임시코드 || product.상품명 || '').trim();
  if (!code) throw new Error('상품 코드가 비어 있습니다.');
  const hasUnitPrice = Number(product.단가 || 0) > 0;

  await queryD1(
    `INSERT OR REPLACE INTO products (code, week, name, category, item, color, price, exposure, owner_cart_visible, payload, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      product.주차 || '',
      product.상품명 || code,
      product.카테고리 || '',
      product.아이템 || '',
      product.컬러 || '',
      hasUnitPrice ? Number(product.도매가 || product.단가 || 0) : 0,
      product.노출여부 || '',
      product.쥔장장바구니노출 || 'y',
      JSON.stringify(product),
      new Date().toISOString(),
    ],
  );
}

function markProductImagesChanged(product: Product): void {
  (product as Product & { 이미지버전?: string }).이미지버전 = new Date().toISOString();
}

async function fetchDetailSourceBuffer(week: string, code: string, fileName: string): Promise<Buffer> {
  for (const width of DETAIL_SOURCE_WIDTHS) {
    const key = getDetailImageKey(week, code, fileName, width);
    const url = getR2PublicUrlForKey(key);
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
  }

  throw new Error(`대표 이미지 원본 조회 실패: ${fileName}`);
}

async function updateMainImageFromDetail(week: string, code: string, fileName: string): Promise<void> {
  const sourceBuffer = await fetchDetailSourceBuffer(week, code, fileName);
  for (const width of MAIN_WIDTHS) {
    await putR2Object(getMainImageKey(week, code, width), sourceBuffer, 'image/webp');
  }
}

async function deleteDetailImageAssets(week: string, code: string, fileName: string): Promise<void> {
  await Promise.all([
    deleteR2Object(getDetailImageKey(week, code, fileName, 1200)),
    deleteR2Object(getDetailImageKey(week, code, fileName, 1600)),
    deleteR2Object(getDetailImageKey(week, code, fileName, 2200)),
  ]);
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isCloudDbEnabled()) {
      return NextResponse.json({ success: false, message: '외부 운영 모드(D1/R2)에서만 사용할 수 있습니다.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const week = String(searchParams.get('week') || '').trim();
    const code = String(searchParams.get('code') || '').trim();

    if (!week || !code) {
      return NextResponse.json({ success: false, message: 'week, code가 필요합니다.' }, { status: 400 });
    }

    const product = await readCloudProductByCode(code);
    if (!product) {
      return NextResponse.json({ success: false, message: '상품 정보를 찾지 못했습니다.' }, { status: 404 });
    }

    const productImages = readProductImageNames(product);
    const storedImages = await listCloudDetailImageNames(week, code);
    return noStoreJson({
      success: true,
      images: mergeProductAndStoredImages(productImages, storedImages),
      imageVersion: product.이미지버전 || '',
    });
  } catch (error: any) {
    console.error('[Product Images API] GET Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isCloudDbEnabled()) {
      return NextResponse.json({ success: false, message: '외부 운영 모드(D1/R2)에서만 사용할 수 있습니다.' }, { status: 400 });
    }

    const body = await request.json();
    const week = String(body?.week || '').trim();
    const code = String(body?.code || '').trim();
    const action = String(body?.action || '').trim();
    const fileName = normalizeImageName(String(body?.fileName || '').trim());
    const orderedImages = Array.isArray(body?.orderedImages)
      ? body.orderedImages.map((item: unknown) => normalizeImageName(String(item || '').trim())).filter(Boolean)
      : [];

    if (!week || !code || !action) {
      return NextResponse.json({ success: false, message: 'week, code, action이 필요합니다.' }, { status: 400 });
    }

    const product = await readCloudProductByCode(code);
    if (!product) {
      return NextResponse.json({ success: false, message: '상품 정보를 찾지 못했습니다.' }, { status: 404 });
    }

    const productImages = readProductImageNames(product);
    let storedImages: string[] = [];
    try {
      storedImages = await listCloudDetailImageNames(week, code);
    } catch (error) {
      console.warn('[Product Images API] R2 detail list failed:', error);
    }
    const images = mergeProductAndStoredImages(productImages, storedImages);

    if (action === 'reorder') {
      if (orderedImages.length === 0) {
        return NextResponse.json({ success: false, message: '정렬할 이미지 목록이 없습니다.' }, { status: 400 });
      }
      const existingSet = new Set(images);
      const nextImages = orderedImages.map(normalizeImageName).filter((name: string) => existingSet.has(name));
      const missing = images.filter((name: string) => !nextImages.includes(name));
      const previousMainImage = images[0] || '';
      product.상세이미지목록 = [...nextImages, ...missing];
      const nextMainImage = product.상세이미지목록[0] || '';
      if (nextMainImage && nextMainImage !== previousMainImage) {
        await updateMainImageFromDetail(week, code, nextMainImage);
      }
      markProductImagesChanged(product);
      await writeCloudProduct(product);
      return noStoreJson({ success: true, images: product.상세이미지목록, imageVersion: product.이미지버전 });
    }

    if (!fileName) {
      return NextResponse.json({ success: false, message: 'fileName이 필요합니다.' }, { status: 400 });
    }

    if (!images.includes(fileName)) {
      return NextResponse.json({ success: false, message: '해당 이미지가 목록에 없습니다.' }, { status: 404 });
    }

    if (action === 'set-main') {
      if (storedImages.length > 0 && !storedImages.includes(fileName)) {
        return NextResponse.json({ success: false, message: 'R2에 실제 이미지 파일이 없어 대표 지정할 수 없습니다.' }, { status: 404 });
      }
      const nextImages = [fileName, ...images.filter((name) => name !== fileName)];
      await updateMainImageFromDetail(week, code, fileName);
      product.상세이미지목록 = nextImages;
      markProductImagesChanged(product);
      await writeCloudProduct(product);
      return noStoreJson({ success: true, images: product.상세이미지목록, mainImage: fileName, imageVersion: product.이미지버전 });
    }

    if (action === 'delete') {
      const nextImages = images.filter((name) => name !== fileName);
      await deleteDetailImageAssets(week, code, fileName);
      product.상세이미지목록 = nextImages;
      markProductImagesChanged(product);
      await writeCloudProduct(product);

      let warning = '';
      if (nextImages.length > 0 && (images[0] === fileName || isMainImageFileName(fileName))) {
        try {
          await updateMainImageFromDetail(week, code, nextImages[0]);
        } catch (error: any) {
          warning = `대표 이미지 갱신은 실패했습니다: ${error.message}`;
          console.warn('[Product Images API] Main image refresh failed after delete:', error);
        }
      }

      return noStoreJson({ success: true, images: product.상세이미지목록, deleted: fileName, warning, imageVersion: product.이미지버전 });
    }

    return NextResponse.json({ success: false, message: '지원하지 않는 action입니다.' }, { status: 400 });
  } catch (error: any) {
    console.error('[Product Images API] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
