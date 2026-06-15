import { NextRequest, NextResponse } from 'next/server';
import { writeOrderToExcel, generateOrderNo } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { customerName, items, memo } = await request.json();

    console.log('[Order API] Received order submission from:', customerName, 'Memo:', memo);

    if (!customerName || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, message: '올바르지 않은 주문 데이터입니다.' },
        { status: 400 }
      );
    }

    // Generate Order No
    const orderNo = generateOrderNo();

    // 1. Save to local Orders.xlsx file on PC
    const saveSuccess = writeOrderToExcel(customerName, items, memo, orderNo);
    
    if (!saveSuccess) {
      return NextResponse.json(
        { success: false, message: '주문 파일(Orders.xlsx) 저장 중 오류가 발생했습니다. 파일이 켜져 있는지 확인하세요.' },
        { status: 500 }
      );
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
      if (memo) {
        notifyText += `• **요청사항:** ${memo}\n`;
      }
      notifyText += `• **주문 목록:**\n`;
      
      items.forEach((item: any, idx: number) => {
        notifyText += `  ${idx + 1}. 품번: \`${item.productCode}\` / 컬러: \`${item.color}\` / 수량: \`${item.quantity}개\`\n`;
      });
      
      notifyText += `\n* 엑셀 주문 파일(Orders.xlsx)에 자동 저장되었습니다.`;

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
      let telegramText = `🔔 <b>[신규 주문 접수 알림]</b>\n\n`;
      telegramText += `• <b>주문번호:</b> <code>${orderNo}</code>\n`;
      telegramText += `• <b>거래처명:</b> ${customerName}\n`;
      telegramText += `• <b>접수일시:</b> ${orderTimestamp}\n`;
      if (memo) {
        telegramText += `• <b>요청사항:</b> ${memo}\n`;
      }
      telegramText += `\n• <b>주문 품목 목록:</b>\n`;
      items.forEach((item: any, idx: number) => {
        telegramText += `${idx + 1}. 품번: <code>${item.productCode}</code> / 컬러: <code>${item.color}</code> / 수량: <code>${item.quantity}개</code>\n`;
      });
      telegramText += `\n* 엑셀 주문 파일(Orders.xlsx)에 자동 저장되었습니다.`;

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
      message: '주문이 성공적으로 접수되어 파일에 저장되었습니다.',
      orderNo: orderNo,
      itemCount: items.length
    });

  } catch (error: any) {
    console.error('[Order API] Critical error during order submission:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류로 주문 접수에 실패했습니다.' },
      { status: 500 }
    );
  }
}
