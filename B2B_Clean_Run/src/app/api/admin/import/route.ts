import { NextRequest, NextResponse } from 'next/server';
import { readProductsDb, writeProductsDb, readProductsFromExcel, formatProduct, Product } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { readCloudProducts, writeCloudProducts } from '@/lib/cloudData';

export const dynamic = 'force-dynamic';

/**
 * Excel 파일(Master.xlsx)의 데이터를 JSON DB(products_db.json)로 불러옵니다.
 * 중복된 상품(임시코드 또는 상품명 기준)이 발견되면 force 옵션이 없는 한 경고를 반환하여 컨펌 모달을 유도합니다.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const { force } = await request.json();

    if (isCloudDbEnabled()) {
      return NextResponse.json(
        {
          success: false,
          message: '외부 운영 모드에서는 엑셀 불러오기를 사용하지 않습니다. 신규 상품 동기화 또는 이미지 관리에서 D1/R2로 직접 반영해 주세요.',
        },
        { status: 400 }
      );
    }
    
    // 1. 엑셀의 '상품 마스터' 데이터 로드
    const excelProducts = readProductsFromExcel();
    if (excelProducts.length === 0) {
      return NextResponse.json({
        success: false,
        message: '엑셀 파일의 "상품 마스터" 시트가 비어있거나 파일을 읽을 수 없습니다.'
      });
    }

    // 2. JSON DB의 기존 데이터 로드
    const dbProducts = isCloudDbEnabled() ? await readCloudProducts() : readProductsDb();
    
    // 3. 중복 식별용 키 생성 함수
    const getProductKey = (p: Product) => {
      return (p.임시코드 || p.상품명 || '').toLowerCase().trim();
    };

    // DB 상품들의 키 목록 집합(Set) 생성
    const dbProductKeys = new Set(dbProducts.map(getProductKey));

    // 4. 엑셀 상품 중 기존 DB에 이미 존재하는 상품(충돌 상품) 목록 확인
    const conflicts = excelProducts.filter(ep => {
      const epKey = getProductKey(ep);
      return epKey !== '' && dbProductKeys.has(epKey);
    });

    // 5. force가 false이고 중복 상품이 존재하는 경우, 경고 반환 및 모달 팝업 유도
    if (!force && conflicts.length > 0) {
      return NextResponse.json({
        success: true,
        hasConflicts: true,
        count: conflicts.length,
        message: '기존에 상품이 존재합니다. 덮어써서 수정하시겠습니까?'
      });
    }

    // 6. 실제 병합 처리 (force가 true이거나 충돌이 없는 경우)
    // 기존 JSON DB 상품 리스트를 맵 형태로 준비 (업데이트가 간편하도록)
    const mergedMap = new Map<string, Product>();
    for (const dp of dbProducts) {
      const key = getProductKey(dp);
      if (key) {
        mergedMap.set(key, dp);
      }
    }

    // 엑셀 상품 데이터를 돌며 맵 업데이트 (기존 존재시 덮어쓰고, 없으면 추가)
    for (const ep of excelProducts) {
      const key = getProductKey(ep);
      if (key) {
        mergedMap.set(key, ep);
      }
    }

    // 최종 병합된 상품 리스트 추출
    const finalProducts = Array.from(mergedMap.values());

    // 7. 저장
    if (isCloudDbEnabled()) {
      // 클라우드 운영에서는 엑셀에 있는 상품만 부분 반영한다.
      // 기존 D1 전체를 지우지 않고, 동일 코드만 수정/신규 코드만 추가한다.
      await writeCloudProducts(excelProducts, false);
    } else {
      const writeSuccess = writeProductsDb(finalProducts);
      if (!writeSuccess) {
        return NextResponse.json({
          success: false,
          message: 'JSON 데이터베이스 파일에 상품을 저장하는 동안 오류가 발생했습니다.'
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      hasConflicts: false,
      count: excelProducts.length,
      message: `성공적으로 엑셀 데이터를 불러와 JSON 데이터베이스를 업데이트했습니다. (총 ${excelProducts.length}개 상품 병합)`
    });
  } catch (error: any) {
    console.error('[Import API POST] 에러 발생:', error);
    return NextResponse.json({
      success: false,
      message: error.message
    }, { status: 500 });
  }
}
