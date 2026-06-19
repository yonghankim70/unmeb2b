import { NextRequest, NextResponse } from 'next/server';
import { readExcelData, saveProducts, Product, readGlobalSettings, writeGlobalSettings, saveCategories } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';
import {
  deleteCloudCategories,
  deleteCloudProducts,
  readCloudCategories,
  readCloudGlobalSettings,
  readCloudMasterData,
  writeCloudCategories,
  writeCloudGlobalSettings,
  writeCloudProducts,
} from '@/lib/cloudData';

export const dynamic = 'force-dynamic';

function productKey(product: Product): string {
  return String(product.임시코드 || product.상품명 || '').trim();
}

function normalizeCodes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function findDuplicateProductCodes(products: Product[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const product of products) {
    const code = productKey(product);
    if (!code) continue;
    if (seen.has(code)) {
      duplicates.add(code);
    } else {
      seen.add(code);
    }
  }
  return [...duplicates];
}

function categoryKey(category: any): string {
  return String(category?.카테고리 || '').trim();
}

function findDuplicateCategoryNames(categories: any[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const category of categories) {
    const key = categoryKey(category);
    if (!key) continue;
    const normalized = key.toLowerCase();
    if (seen.has(normalized)) {
      duplicates.add(key);
    } else {
      seen.add(normalized);
    }
  }

  return [...duplicates];
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const data = isCloudDbEnabled() ? await readCloudMasterData() : readExcelData();
    const globalSettings = isCloudDbEnabled() ? await readCloudGlobalSettings() : readGlobalSettings();
    return NextResponse.json({
      success: true,
      products: data.products,
      categories: data.categories,
      items: data.items,
      colors: data.colors,
      customers: data.customers, // 거래처 마스터 목록 추가
      globalSettings, // 글로벌 설정 추가
    });
  } catch (error: any) {
    console.error('[Admin API GET] 에러 발생:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const { products, globalSettings, categories, deletedProductCodes, replaceAllProducts, confirmLargeDelete } = await request.json();
    const normalizedDeletedProductCodes = normalizeCodes(deletedProductCodes);
    
    if ((!products || !Array.isArray(products)) && !globalSettings && !categories && normalizedDeletedProductCodes.length === 0) {
      return NextResponse.json({ success: false, message: '올바르지 않은 데이터 형식입니다.' }, { status: 400 });
    }

    const isCloudMode = isCloudDbEnabled();
    let savedProductCount = 0;
    let deletedProductCount = 0;
    let settingsSaved = false;
    let categoriesSaved = false;

    if (products && Array.isArray(products)) {
      const duplicateCodes = findDuplicateProductCodes(products);
      if (duplicateCodes.length > 0) {
        return NextResponse.json({
          success: false,
          message: `중복 상품 코드가 있어 저장을 중단했습니다: ${duplicateCodes.slice(0, 8).join(', ')}`,
        }, { status: 400 });
      }

      if (isCloudMode) {
        if (replaceAllProducts !== false) {
          const countRows = await queryD1<{ count: number }>('SELECT COUNT(*) as count FROM products');
          const existingCount = Number(countRows[0]?.count || 0);
          return NextResponse.json(
            {
              success: false,
              message: `상품 데이터 전체 덮어쓰기는 금지되어 있습니다. 현재 DB ${existingCount}개 기준으로 수정/추가/삭제된 데이터만 반영하도록 변경되었습니다.`,
            },
            { status: 409 }
          );
        }
        await writeCloudProducts(products, false);
        savedProductCount = products.filter((product: Product) => productKey(product)).length;
      } else {
        const nextProducts = replaceAllProducts === false
          ? (() => {
              const current = readExcelData().products;
              const incomingMap = new Map(products.map((product: Product) => [productKey(product), product]));
              const deletedSet = new Set(
                normalizedDeletedProductCodes
              );

              const merged = current
                .filter((product: Product) => !deletedSet.has(productKey(product)))
                .map((product: Product) => incomingMap.get(productKey(product)) || product);

              for (const product of products) {
                const key = productKey(product);
                if (!key || merged.some((existing: Product) => productKey(existing) === key)) continue;
                merged.push(product);
              }

              return merged;
            })()
          : products;

        const success = saveProducts(nextProducts);
        if (!success) {
          return NextResponse.json({ success: false, message: 'JSON 데이터베이스 파일 저장 중 오류가 발생했습니다.' }, { status: 500 });
        }
        savedProductCount = products.filter((product: Product) => productKey(product)).length;
        if (normalizedDeletedProductCodes.length > 0) {
          deletedProductCount = normalizedDeletedProductCodes.length;
        }
      }
    }

    if (normalizedDeletedProductCodes.length > 0) {
      if (isCloudMode) {
        const countRows = await queryD1<{ count: number }>('SELECT COUNT(*) as count FROM products');
        const existingCount = Number(countRows[0]?.count || 0);
        const largeDeleteLimit = Math.max(30, Math.floor(existingCount * 0.5));
        if (!confirmLargeDelete && existingCount > 0 && normalizedDeletedProductCodes.length > largeDeleteLimit) {
          return NextResponse.json(
            {
              success: false,
              message: `상품 삭제가 차단되었습니다. 현재 ${existingCount}개 중 ${normalizedDeletedProductCodes.length}개 삭제 요청입니다. 대량 삭제는 별도 확인 절차가 필요합니다.`,
            },
            { status: 409 }
          );
        }
        await deleteCloudProducts(normalizedDeletedProductCodes);
        deletedProductCount = normalizedDeletedProductCodes.length;
      } else if ((!products || !Array.isArray(products)) && normalizedDeletedProductCodes.length > 0) {
        const deletedSet = new Set(normalizedDeletedProductCodes);
        const remaining = readExcelData().products.filter((product: Product) => !deletedSet.has(productKey(product)));
        const success = saveProducts(remaining);
        if (!success) {
          return NextResponse.json({ success: false, message: '상품 삭제 저장 중 오류가 발생했습니다.' }, { status: 500 });
        }
        deletedProductCount = normalizedDeletedProductCodes.length;
      }
    }

    if (globalSettings) {
      if (isCloudMode) {
        await writeCloudGlobalSettings(globalSettings);
      } else {
        const success = writeGlobalSettings(globalSettings);
        if (!success) {
          return NextResponse.json({ success: false, message: '글로벌 설정 저장 중 오류가 발생했습니다.' }, { status: 500 });
        }
      }
      settingsSaved = true;
    }

    if (categories && Array.isArray(categories)) {
      const duplicateCategoryNames = findDuplicateCategoryNames(categories);
      if (duplicateCategoryNames.length > 0) {
        return NextResponse.json({
          success: false,
          message: `중복 카테고리명이 있어 저장을 중단했습니다: ${duplicateCategoryNames.join(', ')}`,
        }, { status: 400 });
      }

      if (isCloudMode) {
        const currentCategories = await readCloudCategories();
        const incomingNames = new Set(categories.map(categoryKey).filter(Boolean).map((name: string) => name.toLowerCase()));
        const deletedCategoryNames = currentCategories
          .map(categoryKey)
          .filter((name) => name && !incomingNames.has(name.toLowerCase()));

        if (currentCategories.length > 0 && incomingNames.size === 0) {
          return NextResponse.json({
            success: false,
            message: `카테고리 저장이 차단되었습니다. 기존 ${currentCategories.length}개 카테고리를 빈 목록으로 만들 수 없습니다.`,
          }, { status: 409 });
        }

        const largeDeleteLimit = Math.max(2, Math.floor(currentCategories.length * 0.4));
        if (deletedCategoryNames.length > largeDeleteLimit) {
          return NextResponse.json({
            success: false,
            message: `카테고리 삭제가 차단되었습니다. 현재 ${currentCategories.length}개 중 ${deletedCategoryNames.length}개 삭제 요청입니다.`,
          }, { status: 409 });
        }

        await writeCloudCategories(categories, false);
        if (deletedCategoryNames.length > 0) {
          await deleteCloudCategories(deletedCategoryNames);
        }
      } else {
        const success = saveCategories(categories);
        if (!success) {
          return NextResponse.json({ success: false, message: '카테고리 저장 중 오류가 발생했습니다.' }, { status: 500 });
        }
      }
      categoriesSaved = true;
    }

    return NextResponse.json({
      success: true,
      message: '성공적으로 저장되었습니다.',
      savedProductCount,
      deletedProductCount,
      settingsSaved,
      categoriesSaved,
    });
  } catch (error: any) {
    console.error('[Admin API POST] 에러 발생:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
