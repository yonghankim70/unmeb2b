import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { writeCartSnapshot } from '@/lib/db';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { writeCloudCartSnapshot } from '@/lib/cloudData';

export const dynamic = 'force-dynamic';

type IncomingCartItem = {
  productCode?: unknown;
  color?: unknown;
  size?: unknown;
  quantity?: unknown;
  category?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const rawItems = Array.isArray(body?.items) ? body.items as IncomingCartItem[] : [];
    const items = rawItems.map(item => ({
      productCode: String(item.productCode || '').trim(),
      color: String(item.color || '').trim(),
      size: String(item.size || '').trim(),
      quantity: Number(item.quantity) || 0,
      category: String(item.category || '').trim(),
    })).filter(item => item.productCode && item.quantity > 0);

    if (isCloudDbEnabled()) {
      await writeCloudCartSnapshot(session.customerName, items);
      return NextResponse.json({ success: true, count: items.length });
    }

    const success = writeCartSnapshot(session.customerName, items);
    if (!success) {
      return NextResponse.json({ success: false, message: '장바구니 분석 데이터를 저장하지 못했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: items.length });
  } catch (error) {
    console.error('[Cart Snapshot API] error:', error);
    return NextResponse.json({ success: false, message: '장바구니 분석 데이터 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
