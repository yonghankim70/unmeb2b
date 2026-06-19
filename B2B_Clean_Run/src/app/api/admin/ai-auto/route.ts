import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: 'AI 자동입력은 현재 사용하지 않습니다. 신규 상품 동기화로 상품을 불러온 뒤 직접 확인해 주세요.',
    },
    { status: 410 },
  );
}
