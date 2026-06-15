import { NextRequest, NextResponse } from 'next/server';
import { readExcelData, saveProducts, Product, readGlobalSettings, writeGlobalSettings, saveCategories } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const data = readExcelData();
    const globalSettings = readGlobalSettings();
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
    const { products, globalSettings, categories } = await request.json();
    
    if ((!products || !Array.isArray(products)) && !globalSettings && !categories) {
      return NextResponse.json({ success: false, message: '올바르지 않은 데이터 형식입니다.' }, { status: 400 });
    }

    if (products && Array.isArray(products)) {
      const success = saveProducts(products);
      if (!success) {
        return NextResponse.json({ success: false, message: 'JSON 데이터베이스 파일 저장 중 오류가 발생했습니다.' }, { status: 500 });
      }
    }

    if (globalSettings) {
      const success = writeGlobalSettings(globalSettings);
      if (!success) {
        return NextResponse.json({ success: false, message: '글로벌 설정 저장 중 오류가 발생했습니다.' }, { status: 500 });
      }
    }

    if (categories && Array.isArray(categories)) {
      const success = saveCategories(categories);
      if (!success) {
        return NextResponse.json({ success: false, message: '카테고리 저장 중 오류가 발생했습니다.' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: '성공적으로 저장되었습니다.' });
  } catch (error: any) {
    console.error('[Admin API POST] 에러 발생:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
