import { NextRequest, NextResponse } from 'next/server';
import { clearOrderedCartSnapshotItems, CustomerOrder, writeOrderToExcel } from '@/lib/db';
import { getAuthSession } from '@/lib/auth';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import {
  clearCloudOrderedCartSnapshotItems,
  readCloudCustomers,
  readCloudProducts,
  writeCloudOrders,
} from '@/lib/cloudData';

interface SubmittedOrderItem {
  productCode: string;
  color: string;
  size?: string;
  quantity: number;
}

function normalizeOrderItems(items: unknown): SubmittedOrderItem[] | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const normalized = items.map((item) => {
    if (!item || typeof item !== 'object') return null;

    const raw = item as {
      productCode?: unknown;
      color?: unknown;
      size?: unknown;
      quantity?: unknown;
    };

    const productCode = String(raw.productCode || '').trim();
    const color = String(raw.color || '').trim();
    const size = String(raw.size || '').trim();
    const quantity = Number(raw.quantity);

    if (!productCode || !Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }

    return {
      productCode,
      color,
      size,
      quantity: Math.trunc(quantity),
    };
  });

  if (normalized.some((item) => item === null)) {
    return null;
  }

  return normalized as SubmittedOrderItem[];
}

function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generateOrderNo(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `O${yy}${mm}${dd}${random}`;
}

function resolveDefaultPaymentStatus(value: unknown): string {
  const text = String(value || '').trim().replace(/\s+/g, '').toLowerCase();
  if (text.includes('주결제')) return '주결제';
  if (text.includes('15')) return '15일결제';
  if (text.includes('월결제') || text.includes('1달') || text.includes('한달')) return '월결제';
  return '미입금';
}

function buildOrderRows(
  customerName: string,
  orderItems: SubmittedOrderItem[],
  orderNo: string,
  memo: string,
  products: Awaited<ReturnType<typeof readCloudProducts>>,
  customers: Awaited<ReturnType<typeof readCloudCustomers>>,
): CustomerOrder[] {
  const orderTimestamp = new Date().toLocaleString('ko-KR');
  const productMap = new Map(products.map((product) => [
    String(product.상품명 || product.임시코드 || '').trim().toLowerCase(),
    product,
  ]));
  const customer = customers.find(
    (item) => String(item.거래처명 || '').trim().toLowerCase() === customerName.trim().toLowerCase(),
  );
  const grade = String(customer?.거래처등급 || 'C').trim().toUpperCase();
  const defaultPaymentStatus = resolveDefaultPaymentStatus(customer?.결제방식);

  return orderItems.map((item) => {
    const product = productMap.get(item.productCode.trim().toLowerCase());
    let unitPrice = 0;
    if (product && Number(product.단가 || 0) > 0) {
      if (grade === 'S') unitPrice = product.S등급가;
      else if (grade === 'A') unitPrice = product.A등급;
      else if (grade === 'B') unitPrice = product.B등급;
      else if (grade === 'C') unitPrice = product.C등급;
      else if (grade === 'W') unitPrice = product.W등급가 || 0;
      else if (grade === '일반등급' || grade === '일반') unitPrice = product.도매가;
      if (!unitPrice) unitPrice = product.도매가 || 0;
    }

    return {
      주문번호: orderNo,
      종결여부: 'n',
      주문일시: orderTimestamp,
      거래처명: customerName,
      상품코드: item.productCode,
      컬러: item.color,
      사이즈: item.size || '',
      수량: item.quantity,
      단가: unitPrice,
      금액: unitPrice * item.quantity,
      요청사항: memo,
      발송날짜: '',
      전표번호: '',
      주문확인: 'n',
      입금확인: defaultPaymentStatus,
      입금방식: '',
      입금금액: 0,
      입금자: '',
      출고상황: '출고 대기',
      발송처리: '',
      택배사: '',
      운송장번호: '',
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: '로그인이 필요한 서비스입니다.' },
        { status: 401 }
      );
    }

    const { items, memo } = await request.json();
    const orderItems = normalizeOrderItems(items);
    const customerName = session.customerName;
    const orderMemo = typeof memo === 'string' ? memo.trim() : '';

    console.log('[Order API] Received order submission from:', customerName, 'Memo:', orderMemo);

    if (!customerName || !orderItems) {
      return NextResponse.json(
        { success: false, message: '올바르지 않은 주문 데이터입니다.' },
        { status: 400 }
      );
    }

    // Generate Order No
    const orderNo = generateOrderNo();

    if (isCloudDbEnabled()) {
      const [products, customers] = await Promise.all([
        readCloudProducts(),
        readCloudCustomers(),
      ]);
      const newOrderRows = buildOrderRows(customerName, orderItems, orderNo, orderMemo, products, customers);
      await writeCloudOrders(newOrderRows, false);
    } else {
      const saveSuccess = writeOrderToExcel(customerName, orderItems, orderMemo, orderNo);
      if (!saveSuccess) {
        return NextResponse.json(
          { success: false, message: '주문 파일(Orders.xlsx) 저장 중 오류가 발생했습니다. 파일이 켜져 있는지 확인하세요.' },
          { status: 500 }
        );
      }
    }

    if (isCloudDbEnabled()) {
      await clearCloudOrderedCartSnapshotItems(customerName, orderItems);
    } else {
      clearOrderedCartSnapshotItems(customerName, orderItems);
    }

    // 2. Send instant push notifications (Slack, Discord, Telegram support)
    // Put your Slack/Discord/Telegram Webhook URL in the environment or paste directly here
    const webhookUrl = process.env.ORDER_WEBHOOK_URL || ''; 
    
    if (webhookUrl) {
      const orderTimestamp = new Date().toLocaleString('ko-KR');
      let notifyText = `🔔 **[신규 주문 접수 알림]**\n`;
      notifyText += `• **주문번호:** \`${orderNo}\`\n`;
      notifyText += `• **거래처명:** ${customerName}\n`;
      notifyText += `• **접수일시:** ${orderTimestamp}\n`;
      if (orderMemo) {
        notifyText += `• **요청사항:** ${orderMemo}\n`;
      }
      notifyText += `• **주문 목록:**\n`;
      
      orderItems.forEach((item, idx) => {
        const sizeText = item.size ? ` / 사이즈: \`${item.size}\`` : '';
        notifyText += `  ${idx + 1}. 품번: \`${item.productCode}\` / 컬러: \`${item.color}\`${sizeText} / 수량: \`${item.quantity}개\`\n`;
      });
      
      notifyText += `\n* 운영 서버 주문 데이터베이스에 자동 저장되었습니다.`;

      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: notifyText, // Discord syntax
            text: notifyText     // Slack syntax
          })
        });
        console.log('[Order API] Discord/Slack notification dispatched.');
      } catch (err) {
        console.error('[Order API] Failed to send webhook push:', err);
      }
    }

    // 3. Send Telegram Bot notification
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const telegramChatId = process.env.TELEGRAM_CHAT_ID || '';

    if (telegramBotToken && telegramChatId) {
      const orderTimestamp = new Date().toLocaleString('ko-KR');
      const telegramCustomerName = escapeTelegramHtml(customerName);
      const telegramMemo = escapeTelegramHtml(orderMemo);
      let telegramText = `🔔 <b>[신규 주문 접수 알림]</b>\n\n`;
      telegramText += `• <b>주문번호:</b> <code>${orderNo}</code>\n`;
      telegramText += `• <b>거래처명:</b> ${telegramCustomerName}\n`;
      telegramText += `• <b>접수일시:</b> ${orderTimestamp}\n`;
      if (telegramMemo) {
        telegramText += `• <b>요청사항:</b> ${telegramMemo}\n`;
      }
      telegramText += `\n• <b>주문 품목 목록:</b>\n`;
      orderItems.forEach((item, idx) => {
        const productCode = escapeTelegramHtml(item.productCode);
        const color = escapeTelegramHtml(item.color);
        const sizeText = item.size ? ` / 사이즈: <code>${escapeTelegramHtml(item.size)}</code>` : '';
        telegramText += `${idx + 1}. 품번: <code>${productCode}</code> / 컬러: <code>${color}</code>${sizeText} / 수량: <code>${item.quantity}개</code>\n`;
      });
      telegramText += `\n* 운영 서버 주문 데이터베이스에 자동 저장되었습니다.`;

      try {
        const teleUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
        const teleRes = await fetch(teleUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: telegramText,
            parse_mode: 'HTML'
          })
        });
        const teleData = await teleRes.json();
        if (teleRes.ok && teleData.ok) {
          console.log('[Order API] Telegram notification sent successfully.');
        } else {
          console.error('[Order API] Telegram Bot API error:', teleData);
        }
      } catch (err) {
        console.error('[Order API] Failed to send Telegram notification:', err);
      }
    }

    /* 
      4. [KakaoTalk API Integration Placeholder]
      만약 향후 카카오톡 알림톡(Alimtalk) 혹은 나에게보내기 API 사용...
    */

    return NextResponse.json({
      success: true,
      message: '주문이 성공적으로 접수되어 운영 서버에 저장되었습니다.',
      orderNo: orderNo,
      itemCount: orderItems.length
    });

  } catch (error: any) {
    console.error('[Order API] Critical error during order submission:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류로 주문 접수에 실패했습니다.' },
      { status: 500 }
    );
  }
}
