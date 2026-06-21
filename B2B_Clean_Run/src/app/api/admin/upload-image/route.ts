import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDbPath } from '@/lib/db';
import type { Product } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { resolveInside, safeFileName } from '@/lib/pathSafety';
import { isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';
import { formatProduct } from '@/lib/dataTypes';
import { getR2CacheSegment, getDetailImageKey, getMainImageKey, listR2Objects, putR2Object } from '@/lib/cloudflareR2';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm']);
const CLOUD_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_CLOUD_UPLOAD_IMAGES = 10;
const MAIN_WIDTHS = [480, 960] as const;
const DETAIL_WIDTHS = [1200, 2200] as const;
const ALL_CLOUD_WIDTHS = new Set<number>([...MAIN_WIDTHS, ...DETAIL_WIDTHS]);

interface UploadVariantManifestItem {
  field: string;
  fileName: string;
  kind: 'main' | 'detail';
  width: number;
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

function mergeImageNames(existing: string[], added: string[]): string[] {
  const merged: string[] = [];
  for (const name of [...existing, ...added]) {
    const cleanName = safeFileName(String(name || '').trim());
    if (cleanName && !merged.includes(cleanName)) {
      merged.push(cleanName);
    }
  }
  const mainImages = merged.filter(isMainImageFileName);
  const detailImages = merged.filter((name) => !isMainImageFileName(name));
  return [...mainImages, ...detailImages];
}

function readProductImageNames(product: Product): string[] {
  return Array.isArray(product.상세이미지목록)
    ? product.상세이미지목록.map((name) => safeFileName(String(name || '').trim())).filter(Boolean)
    : [];
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

async function listCloudDetailImageNames(week: string, code: string): Promise<string[]> {
  const prefix = `image-cache/detail/${encodeURIComponent(week)}/${getR2CacheSegment(code)}/`;
  const keys = await listR2Objects(prefix);
  const names = new Set<string>();

  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const tail = key.slice(prefix.length);
    const match = tail.match(/^(.+)-(?:1200|1600|2200)\.webp$/);
    if (!match) continue;
    const fileName = safeFileName(decodeR2KeySegment(match[1]));
    if (fileName) names.add(fileName);
  }

  return [...names];
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
  if (!code) {
    throw new Error('상품 코드가 비어 있습니다.');
  }
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

function parseVariantManifest(value: FormDataEntryValue | null): UploadVariantManifestItem[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => ({
      field: String(item?.field || '').trim(),
      fileName: safeFileName(String(item?.fileName || '').trim()),
      kind: item?.kind === 'main' ? 'main' as const : 'detail' as const,
      width: Number(item?.width || 0),
    }))
    .filter((item) => item.field && item.fileName && ALL_CLOUD_WIDTHS.has(item.width));
}

function parseExistingImages(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return mergeImageNames(parsed.map((name) => String(name || '').trim()), []);
  } catch {
    return [];
  }
}

async function uploadCloudPreparedProductImages(
  week: string,
  code: string,
  formData: FormData,
  manifest: UploadVariantManifestItem[],
  clientImageNames: string[],
) {
  const product = await readCloudProductByCode(code);
  if (!product) {
    throw new Error(`D1에서 상품 ${code}를 찾지 못했습니다.`);
  }

  const existingImageNames = readProductImageNames(product);
  const uploadedNames = new Set<string>();
  const mainUpdated = manifest.some((item) => item.kind === 'main');

  const imageNames = new Set(manifest.filter((item) => item.kind === 'detail').map((item) => item.fileName));
  if (imageNames.size === 0) {
    throw new Error('업로드할 상세 이미지 변환 데이터가 없습니다. 새로고침 후 다시 시도해 주세요.');
  }
  if (imageNames.size > MAX_CLOUD_UPLOAD_IMAGES) {
    throw new Error(`한 번에 최대 ${MAX_CLOUD_UPLOAD_IMAGES}장까지만 업로드할 수 있습니다.`);
  }

  for (const fileName of imageNames) {
    const ext = path.extname(fileName).toLowerCase();
    if (!CLOUD_IMAGE_EXTENSIONS.has(ext)) {
      throw new Error('외부 관리자 업로드는 이미지 파일만 지원합니다. (jpg, png, webp, gif)');
    }
  }

  for (const item of manifest) {
    if (item.kind === 'main' && !MAIN_WIDTHS.includes(item.width as (typeof MAIN_WIDTHS)[number])) {
      continue;
    }
    if (item.kind === 'detail' && !DETAIL_WIDTHS.includes(item.width as (typeof DETAIL_WIDTHS)[number])) {
      continue;
    }

    const file = formData.get(item.field);
    if (!(file instanceof File)) {
      throw new Error(`업로드 변환 파일을 찾지 못했습니다: ${item.fileName} (${item.width})`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('업로드 파일은 50MB 이하만 허용됩니다.');
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (buffer.length === 0) continue;

    if (item.kind === 'main') {
      await putR2Object(getMainImageKey(week, code, item.width), buffer, 'image/webp');
    } else {
      await putR2Object(getDetailImageKey(week, code, item.fileName, item.width), buffer, 'image/webp');
      uploadedNames.add(item.fileName);
    }
  }

  const latestProduct = (await readCloudProductByCode(code)) || product;
  const latestImageNames = readProductImageNames(latestProduct);
  let baseImageNames = mergeImageNames(
    [...existingImageNames, ...latestImageNames, ...clientImageNames],
    [],
  );

  if (baseImageNames.length === 0) {
    try {
      baseImageNames = await listCloudDetailImageNames(week, code);
    } catch (error) {
      console.warn('[Upload API] R2 detail image list failed:', error);
    }
  }

  latestProduct.상세이미지목록 = mergeImageNames(
    baseImageNames,
    [...uploadedNames],
  );
  latestProduct.이미지버전 = new Date().toISOString();
  await writeCloudProduct(latestProduct);

  return {
    uploadedNames: [...uploadedNames],
    updatedMain: mainUpdated,
    totalCount: uploadedNames.size,
    images: latestProduct.상세이미지목록,
    imageVersion: latestProduct.이미지버전,
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const formData = await request.formData();
    const week = formData.get('week') as string;
    const code = formData.get('code') as string;
    const variantManifest = parseVariantManifest(formData.get('variantManifest'));
    const files = [
      ...formData.getAll('files').filter((entry): entry is File => entry instanceof File),
      ...formData.getAll('file').filter((entry): entry is File => entry instanceof File),
    ].filter((file, index, arr) => arr.findIndex((item) => item.name === file.name && item.size === file.size) === index);

    if (!week || !code || (files.length === 0 && variantManifest.length === 0)) {
      return NextResponse.json({ success: false, message: '필수 매개변수(week, code, file)가 누락되었습니다.' }, { status: 400 });
    }

    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ success: false, message: '업로드 파일은 50MB 이하만 허용됩니다.' }, { status: 400 });
      }

      const fileName = safeFileName(file.name);
      const ext = path.extname(fileName).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json({ success: false, message: '이미지 또는 영상 파일만 업로드할 수 있습니다.' }, { status: 400 });
      }
    }

    if (isCloudDbEnabled()) {
      if (variantManifest.length === 0) {
        return NextResponse.json({
          success: false,
          message: '운영 서버 업로드는 브라우저 WebP 변환 데이터가 필요합니다. Ctrl+F5 새로고침 후 다시 업로드해 주세요.',
        }, { status: 400 });
      }

      const clientImageNames = parseExistingImages(formData.get('existingImages'));
      const result = await uploadCloudPreparedProductImages(week, code, formData, variantManifest, clientImageNames);
      return NextResponse.json({
        success: true,
        message: '외부 운영용 이미지 업로드가 완료되었습니다.',
        uploadedFiles: result.uploadedNames,
        uploadedCount: result.totalCount,
        updatedMain: result.updatedMain,
        images: result.images,
        imageVersion: result.imageVersion,
      });
    }

    const dbPath = getDbPath();
    const targetDir = resolveInside(dbPath, week, code);
    if (!targetDir) {
      return NextResponse.json({ success: false, message: '허용되지 않은 상품 경로입니다.' }, { status: 400 });
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const uploadedFiles: string[] = [];
    for (const file of files) {
      const fileName = safeFileName(file.name);
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const targetFilePath = resolveInside(targetDir, fileName);
      if (!targetFilePath) {
        return NextResponse.json({ success: false, message: '허용되지 않은 파일명입니다.' }, { status: 400 });
      }
      fs.writeFileSync(targetFilePath, buffer);
      uploadedFiles.push(fileName);
    }

    console.log(`[Upload API] Images saved successfully to ${targetDir}`);
    return NextResponse.json({ success: true, message: '이미지 업로드 완료', uploadedFiles, uploadedCount: uploadedFiles.length });
  } catch (error: any) {
    console.error('[Upload API] Error saving image:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
