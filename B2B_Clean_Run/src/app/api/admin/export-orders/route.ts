import { NextRequest, NextResponse } from 'next/server';
import * as xlsx from 'xlsx';
import { readAllOrders } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { readCloudOrders } from '@/lib/cloudData';

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const orders = isCloudDbEnabled() ? await readCloudOrders() : readAllOrders();

    // Create rows for Excel
    const rows = orders.map((o, idx) => ({
      번호: idx + 1,
      주문번호: o.주문번호 || '',
      주문일시: o.주문일시 || '',
      거래처명: o.거래처명 || '',
      상품코드: o.상품코드 || '',
      컬러: o.컬러 || '',
      수량: Number(o.수량 || 0),
      단가: Number(o.단가 || 0),
      금액: Number(o.금액 || 0),
      요청사항: o.요청사항 || '',
      출고상황: o.출고상황 || '출고 대기',
      송장번호: o.운송장번호 || ''
    }));

    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, sheet, '발주내역');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `Orders_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('[Export Orders API] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
