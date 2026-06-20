import { NextRequest, NextResponse } from 'next/server';
import { readAllOrders, writeAllOrders, readExcelData } from '@/lib/db';
import { sendTelegramAlert } from '@/lib/telegram';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { deleteCloudOrdersByKeys, readCloudMasterData, readCloudOrders, writeCloudOrders } from '@/lib/cloudData';

export const dynamic = 'force-dynamic';

function orderKey(order: any): string {
  return [
    order.주문일시 || '',
    order.거래처명 || '',
    order.상품코드 || '',
    order.컬러 || '',
    order.사이즈 || '',
  ].map((value) => String(value).trim()).join('|');
}

function orderOptionLabel(order: any): string {
  const color = String(order.컬러 || '').trim();
  const size = String(order.사이즈 || '').trim();
  return size ? `${color}/${size}` : color;
}

function uniqueOrderKeys(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function mergeOrdersByKey(baseOrders: any[], incomingOrders: any[], deletedOrderKeys: string[]): any[] {
  const deletedSet = new Set(deletedOrderKeys);
  const incomingMap = new Map<string, any>();

  incomingOrders.forEach((order) => {
    const key = orderKey(order);
    if (!key || deletedSet.has(key)) return;
    incomingMap.set(key, order);
  });

  const merged = baseOrders
    .filter((order) => !deletedSet.has(orderKey(order)))
    .map((order) => incomingMap.get(orderKey(order)) || order);

  const existingKeys = new Set(merged.map(orderKey));
  incomingMap.forEach((order, key) => {
    if (!existingKeys.has(key)) {
      merged.push(order);
    }
  });

  return merged;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const orders = isCloudDbEnabled() ? await readCloudOrders() : readAllOrders();
    return NextResponse.json({
      success: true,
      orders
    });
  } catch (error: any) {
    console.error('[Admin Orders API GET] Error:', error);
    return NextResponse.json(
      { success: false, message: '주문 내역을 읽어오는 도중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { orders } = body;
    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json(
        { success: false, message: '올바르지 않은 주문 데이터 목록입니다.' },
        { status: 400 }
      );
    }
    const deletedOrderKeys = uniqueOrderKeys(body.deletedOrderKeys);
    const replaceAllOrders = body.replaceAllOrders === true;

    const cloudMode = isCloudDbEnabled();

    // 1. 상태 변화 감지를 위해 기존 주문 데이터 로드
    const oldOrders = cloudMode ? await readCloudOrders() : readAllOrders();
    const oldOrdersMap = new Map<string, any>();
    oldOrders.forEach(o => {
      const key = orderKey(o);
      oldOrdersMap.set(key, o);
    });

    // 2. 거래처의 텔레그램 ID를 얻기 위해 거래처 마스터 정보 로드
    const excelData = cloudMode ? await readCloudMasterData() : readExcelData();
    const customerTelegramMap = new Map<string, string>();
    excelData.customers.forEach(c => {
      if (c.거래처명 && c.텔레그램ID) {
        customerTelegramMap.set(c.거래처명.toLowerCase().trim(), c.텔레그램ID);
      }
    });

    // 3. 상태 변화 분류를 위한 맵 생성
    const confirmAlerts = new Map<string, any[]>();
    const processAlerts = new Map<string, any[]>();

    orders.forEach(o => {
      const key = orderKey(o);
      const old = oldOrdersMap.get(key);
      if (!old) return; // 기존 매칭 건이 없는 경우(새로운 추가 등)는 알림 패스

      // 주문 확인 완료 감지 (n -> y)
      const wasConfirmed = old.주문확인 === 'y';
      const isConfirmed = o.주문확인 === 'y';
      if (isConfirmed && !wasConfirmed) {
        const alreadyProcessing = old.출고상황 === '오더진행' || old.출고상황 === '오더 진행' || old.출고상황 === '발송완료';
        if (!alreadyProcessing) {
          if (!confirmAlerts.has(o.거래처명)) {
            confirmAlerts.set(o.거래처명, []);
          }
          confirmAlerts.get(o.거래처명)!.push(o);
        }
      }

      // 오더 진행 전환 감지
      const oldStatus = String(old.출고상황 || '').trim();
      const newStatus = String(o.출고상황 || '').trim();
      const wasProcessing = oldStatus === '오더진행' || oldStatus === '오더 진행';
      const isProcessing = newStatus === '오더진행' || newStatus === '오더 진행';
      if (isProcessing && !wasProcessing) {
        if (!processAlerts.has(o.거래처명)) {
          processAlerts.set(o.거래처명, []);
        }
        processAlerts.get(o.거래처명)!.push(o);
      }
    });

    // 4. 운영 서버에서는 D1만 갱신한다. 전체 삭제 후 재작성 대신 변경분 upsert + 명시 삭제만 처리한다.
    if (cloudMode) {
      const existingKeys = new Set(oldOrders.map(orderKey));
      const deleteKeys = deletedOrderKeys.filter((key) => existingKeys.has(key));
      const maxSafeDelete = Math.max(50, Math.floor(oldOrders.length * 0.5));
      if (deleteKeys.length > maxSafeDelete && body.confirmLargeDelete !== true) {
        return NextResponse.json(
          {
            success: false,
            message: `주문 ${deleteKeys.length}건 삭제 요청이 감지되어 차단했습니다. 대량 삭제가 맞으면 별도 확인 절차가 필요합니다.`,
          },
          { status: 409 }
        );
      }

      if (deleteKeys.length > 0) {
        await deleteCloudOrdersByKeys(deleteKeys);
      }

      const deleteSet = new Set(deleteKeys);
      await writeCloudOrders(orders.filter((order) => !deleteSet.has(orderKey(order))), false);
    } else {
      const nextOrders = replaceAllOrders
        ? orders
        : mergeOrdersByKey(oldOrders, orders, deletedOrderKeys);
      const success = writeAllOrders(nextOrders);
      if (!success) {
        return NextResponse.json(
          { success: false, message: '주문 엑셀(Orders.xlsx) 파일 저장 중 오류가 발생했습니다. 파일이 다른 프로그램에 의해 열려 있는지 확인하세요.' },
          { status: 500 }
        );
      }
    }

    // 5. 텔레그램 알림 비차단(비동기) 발송
    const runTelegramNotification = async () => {
      // 5-1. 주문 확인 알림
      for (const [custName, items] of confirmAlerts.entries()) {
        const chatId = customerTelegramMap.get(custName.toLowerCase().trim());
        if (!chatId) continue;

        const orderNo = items[0].주문번호 || '미발급';
        const itemDetails = items.map(item => `• ${item.상품코드} (${orderOptionLabel(item)}) / ${item.수량}개`).join('\n');

        const message = `<b>[U&ME B2B 주문 확인 안내]</b>\n\n` +
                        `안녕하세요, <b>${custName}</b> 파트너님.\n` +
                        `요청하신 주문서가 확인되어 안내해 드립니다.\n\n` +
                        `■ 주문번호: <code>${orderNo}</code>\n` +
                        `■ 확인 품목:\n${itemDetails}\n\n` +
                        `<b>입금 확인 후 오더 진행(출고 준비)이 즉시 시작됩니다.</b>\n` +
                        `신속하게 준비해 드리겠습니다. 감사합니다.`;

        await sendTelegramAlert(chatId, message);
      }

      // 5-2. 오더 진행 알림
      for (const [custName, items] of processAlerts.entries()) {
        const chatId = customerTelegramMap.get(custName.toLowerCase().trim());
        if (!chatId) continue;

        const orderNo = items[0].주문번호 || '미발급';
        const itemDetails = items.map(item => `• ${item.상품코드} (${orderOptionLabel(item)}) / ${item.수량}개`).join('\n');

        const message = `<b>[U&ME B2B 오더 진행 안내]</b>\n\n` +
                        `안녕하세요, <b>${custName}</b> 파트너님.\n` +
                        `주문 건의 결제(또는 결제 조건)가 확인되어 <b>'오더진행'</b> 상태로 전환되었습니다.\n\n` +
                        `■ 주문번호: <code>${orderNo}</code>\n` +
                        `■ 진행 품목:\n${itemDetails}\n\n` +
                        `<b>현재 신속하게 실물 사입 및 출고 준비를 시작하고 있습니다.</b>\n` +
                        `발송 완료 시 다시 안내 드리겠습니다. 감사합니다.`;

        await sendTelegramAlert(chatId, message);
      }
    };

    runTelegramNotification().catch(err => {
      console.error('[Telegram Notification Background Error]', err);
    });

    return NextResponse.json({
      success: true,
      message: '주문 변경 사항이 운영 서버 데이터베이스에 저장되었으며, 알림 대상 파트너사에 텔레그램 메시지가 전송되었습니다.'
    });
  } catch (error: any) {
    console.error('[Admin Orders API POST] Error:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류로 주문 저장을 실패했습니다.' },
      { status: 500 }
    );
  }
}
