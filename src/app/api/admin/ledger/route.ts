import { NextRequest, NextResponse } from 'next/server';
import { readExcelData, readAllOrders, readAllPayments } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const masterData = readExcelData();
    const orders = readAllOrders();
    const payments = readAllPayments();

    return NextResponse.json({
      success: true,
      customers: masterData.customers,
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
