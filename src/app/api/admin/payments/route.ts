import { NextRequest, NextResponse } from 'next/server';
import { readAllPayments, writeAllPayments, PaymentLog } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const payments = readAllPayments();
    return NextResponse.json({ success: true, payments });
  } catch (error: any) {
    console.error('[Payments API] GET Error:', error);
    return NextResponse.json({ success: false, message: '입금 내역을 불러오는데 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 입금일자, 거래처명, 입금금액, 입금방식, 입금자, 비고 } = body;

    if (!입금일자 || !거래처명 || !입금금액 || !입금방식) {
      return NextResponse.json({ success: false, message: '필수 입력 항목이 누락되었습니다.' }, { status: 400 });
    }

    const newPayment: PaymentLog = {
      입금일자,
      거래처명,
      입금금액: Number(입금금액),
      입금방식,
      입금자: 입금자 || '',
      비고: 비고 || '',
    };

    const payments = readAllPayments();
    payments.push(newPayment);
    const success = writeAllPayments(payments);

    if (success) {
      return NextResponse.json({ success: true, message: '입금이 성공적으로 기록되었습니다.' });
    } else {
      return NextResponse.json({ success: false, message: '입금 내역 저장에 실패했습니다.' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[Payments API] POST Error:', error);
    return NextResponse.json({ success: false, message: '서버 오류로 입금 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const indexStr = searchParams.get('index');

    if (indexStr === null) {
      return NextResponse.json({ success: false, message: '삭제할 인덱스가 누락되었습니다.' }, { status: 400 });
    }

    const index = parseInt(indexStr, 10);
    const payments = readAllPayments();

    if (isNaN(index) || index < 0 || index >= payments.length) {
      return NextResponse.json({ success: false, message: '올바르지 않은 인덱스 범위입니다.' }, { status: 400 });
    }

    payments.splice(index, 1);
    const success = writeAllPayments(payments);

    if (success) {
      return NextResponse.json({ success: true, message: '입금 내역이 성공적으로 삭제되었습니다.' });
    } else {
      return NextResponse.json({ success: false, message: '입금 내역 삭제 저장에 실패했습니다.' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[Payments API] DELETE Error:', error);
    return NextResponse.json({ success: false, message: '서버 오류로 삭제에 실패했습니다.' }, { status: 500 });
  }
}
