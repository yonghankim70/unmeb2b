import { NextRequest, NextResponse } from 'next/server';
import { readCustomersDb, readAllOrders, readAllPayments } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { readCloudCustomers, readCloudOrders, readCloudPayments } from '@/lib/cloudData';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const [customers, orders, payments] = isCloudDbEnabled()
      ? await Promise.all([readCloudCustomers(), readCloudOrders(), readCloudPayments()])
      : [readCustomersDb(), readAllOrders(), readAllPayments()];

    return NextResponse.json({
      success: true,
      customers,
      orders,
      payments
    });
  } catch (error: any) {
    console.error('[Admin Ledger API GET] Error:', error);
    return NextResponse.json(
      { success: false, message: '정산 데이터를 읽어오는 도중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
