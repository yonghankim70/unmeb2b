import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';
import { formatProduct, Product } from '@/lib/dataTypes';
import {
  deleteR2Object,
  getDetailImageKey,
  getMainImageKey,
  getR2PublicUrlForKey,
  putR2Object,
} from '@/lib/cloudflareR2';

const MAIN_WIDTHS = [480, 720] as const;
const DETAIL_SOURCE_WIDTH = 1600;

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
      Number(product.도매가 || product.단가 || 0),
      product.노출여부 || '',
      product.쥔장장바구니노출 || 'y',
      JSON.stringify(product),
      new Date().toISOString(),
    ],
  );
}

async function fetchDetailSourceBuffer(week: string, code: string, fileName: string): Promise<Buffer> {
  const key = getDetailImageKey(week, code, fileName, DETAIL_SOURCE_WIDTH);
  const url = getR2PublicUrlForKey(key);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`대표 이미지 원본 조회 실패: ${fileName}`);
  }
  return Buffer.from(await response.arrayBuffer());
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
  ]);
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
    const fileName = String(body?.fileName || '').trim();
    const orderedImages = Array.isArray(body?.orderedImages)
      ? body.orderedImages.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];

    if (!week || !code || !action) {
      return NextResponse.json({ success: false, message: 'week, code, action이 필요합니다.' }, { status: 400 });
    }

    const product = await readCloudProductByCode(code);
    if (!product) {
      return NextResponse.json({ success: false, message: '상품 정보를 찾지 못했습니다.' }, { status: 404 });
    }

    const images = Array.isArray(product.상세이미지목록) ? [...product.상세이미지목록] : [];

    if (action === 'reorder') {
      if (orderedImages.length === 0) {
        return NextResponse.json({ success: false, message: '정렬할 이미지 목록이 없습니다.' }, { status: 400 });
      }
      const existingSet = new Set(images);
      const nextImages = orderedImages.filter((name: string) => existingSet.has(name));
      const missing = images.filter((name: string) => !nextImages.includes(name));
      product.상세이미지목록 = [...nextImages, ...missing];
      await writeCloudProduct(product);
      return NextResponse.json({ success: true, images: product.상세이미지목록 });
    }

    if (!fileName) {
      return NextResponse.json({ success: false, message: 'fileName이 필요합니다.' }, { status: 400 });
    }

    if (!images.includes(fileName)) {
      return NextResponse.json({ success: false, message: '해당 이미지가 목록에 없습니다.' }, { status: 404 });
    }

    if (action === 'set-main') {
      const nextImages = [fileName, ...images.filter((name) => name !== fileName)];
      await updateMainImageFromDetail(week, code, fileName);
      product.상세이미지목록 = nextImages;
      await writeCloudProduct(product);
      return NextResponse.json({ success: true, images: product.상세이미지목록, mainImage: fileName });
    }

    if (action === 'delete') {
      const nextImages = images.filter((name) => name !== fileName);
      await deleteDetailImageAssets(week, code, fileName);
      product.상세이미지목록 = nextImages;
      await writeCloudProduct(product);

      if (nextImages.length > 0 && (images[0] === fileName || isMainImageFileName(fileName))) {
        await updateMainImageFromDetail(week, code, nextImages[0]);
      }

      return NextResponse.json({ success: true, images: product.상세이미지목록, deleted: fileName });
    }

    return NextResponse.json({ success: false, message: '지원하지 않는 action입니다.' }, { status: 400 });
  } catch (error: any) {
    console.error('[Product Images API] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
