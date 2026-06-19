import { NextRequest, NextResponse } from 'next/server';
import { readExcelData, saveProducts, Product, readGlobalSettings, writeGlobalSettings, saveCategories } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';
import {
  deleteCloudProducts,
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

    const { products, globalSettings, categories, deletedProductCodes, replaceAllProducts } = await request.json();
    
    if ((!products || !Array.isArray(products)) && !globalSettings && !categories && (!deletedProductCodes || !Array.isArray(deletedProductCodes))) {
      return NextResponse.json({ success: false, message: '올바르지 않은 데이터 형식입니다.' }, { status: 400 });
    }

    const isCloudMode = isCloudDbEnabled();

    if (products && Array.isArray(products)) {
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
        await writeCloudProducts(products, replaceAllProducts !== false);
      } else {
        const nextProducts = replaceAllProducts === false
          ? (() => {
              const current = readExcelData().products;
              const incomingMap = new Map(products.map((product: Product) => [productKey(product), product]));
              const deletedSet = new Set(
                Array.isArray(deletedProductCodes)
                  ? deletedProductCodes.map((code: string) => String(code || '').trim()).filter(Boolean)
                  : []
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
      }
    }

    if (deletedProductCodes && Array.isArray(deletedProductCodes)) {
      if (isCloudMode) {
        await deleteCloudProducts(deletedProductCodes);
      } else if ((!products || !Array.isArray(products)) && deletedProductCodes.length > 0) {
        const deletedSet = new Set(deletedProductCodes.map((code: string) => String(code || '').trim()).filter(Boolean));
        const remaining = readExcelData().products.filter((product: Product) => !deletedSet.has(productKey(product)));
        const success = saveProducts(remaining);
        if (!success) {
          return NextResponse.json({ success: false, message: '상품 삭제 저장 중 오류가 발생했습니다.' }, { status: 500 });
        }
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
    }

    if (categories && Array.isArray(categories)) {
      if (isCloudMode) {
        await writeCloudCategories(categories);
      } else {
        const success = saveCategories(categories);
        if (!success) {
          return NextResponse.json({ success: false, message: '카테고리 저장 중 오류가 발생했습니다.' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, message: '성공적으로 저장되었습니다.' });
  } catch (error: any) {
    console.error('[Admin API POST] 에러 발생:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
