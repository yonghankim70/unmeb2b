import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { readAllOrders, readCartSnapshots, readCustomersDb, readProductsDb } from '@/lib/db';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { readCloudCartSnapshots, readCloudCustomers, readCloudOrders, readCloudProducts } from '@/lib/cloudData';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const [orders, cartSnapshots, products, customers] = isCloudDbEnabled()
      ? await Promise.all([readCloudOrders(), readCloudCartSnapshots(), readCloudProducts(), readCloudCustomers()])
      : [readAllOrders(), readCartSnapshots(), readProductsDb(), readCustomersDb()];

    return NextResponse.json({
      success: true,
      orders,
      cartSnapshots,
      products,
      customers,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Admin Analysis API] error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || '분석 데이터를 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
