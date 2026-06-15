import { NextRequest, NextResponse } from 'next/server';
import { saveProductsToExcel, Product } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * 어드민 그리드에서 선택된 상품 리스트를 엑셀 파일(Master.xlsx)의 '상품 마스터' 시트에 덮어쓰기 형태로 내보냅니다.
 */
export async function POST(request: NextRequest) {
  try {
    const { products } = await request.json();
    
    // 1. 요청으로 들어온 데이터 유효성 검사
    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ 
        success: false, 
        message: '올바르지 않은 상품 데이터 형식입니다.' 
      }, { status: 400 });
    }

    console.log(`[Export API] ${products.length}개의 상품을 Master.xlsx로 내보내기 진행합니다.`);

    // 2. 엑셀 파일의 '상품 마스터' 시트에 저장
    const success = saveProductsToExcel(products);
    if (!success) {
      return NextResponse.json({ 
        success: false, 
        message: '엑셀 파일(Master.xlsx)에 저장하는 동안 오류가 발생했습니다. (엑셀 파일이 열려있는지 확인해 주세요)' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: '성공적으로 엑셀 파일에 내보냈습니다.' 
    });
  } catch (error: any) {
    console.error('[Export API POST] 에러 발생:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message 
    }, { status: 500 });
  }
}
