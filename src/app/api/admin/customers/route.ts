import { NextRequest, NextResponse } from 'next/server';
import { readExcelData, writeCustomers, readAllLoginLogs } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const data = readExcelData();
    const loginLogs = readAllLoginLogs(startDate, endDate);

    // Map logs to customers
    const customersWithLogs = (data.customers || []).map(c => {
      const customerLogs = loginLogs.filter(log => log.거래처명 === c.거래처명);
      return {
        ...c,
        접속횟수: customerLogs.length,
        접속기록: customerLogs.map(log => log.접속일시)
      };
    });

    return NextResponse.json({
      success: true,
      customers: customersWithLogs
    });
  } catch (error: any) {
    console.error('[Admin Customers API GET] Error:', error);
    return NextResponse.json(
      { success: false, message: '거래처 데이터를 읽어오는 도중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { customers } = await request.json();
    if (!customers || !Array.isArray(customers)) {
      return NextResponse.json(
        { success: false, message: '올바르지 않은 거래처 데이터 목록입니다.' },
        { status: 400 }
      );
    }

    const success = writeCustomers(customers);
    if (!success) {
      return NextResponse.json(
        { success: false, message: '거래처 데이터베이스 저장 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '거래처 마스터 정보가 성공적으로 데이터베이스에 저장되었습니다.'
    });
  } catch (error: any) {
    console.error('[Admin Customers API POST] Error:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류로 거래처 저장을 실패했습니다.' },
      { status: 500 }
    );
  }
}
