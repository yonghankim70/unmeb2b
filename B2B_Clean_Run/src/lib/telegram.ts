/**
 * Telegram Bot API를 사용한 B2B 알림 메시지 발송 모듈
 */

export async function sendTelegramAlert(chatId: string, message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN이 .env.local에 설정되어 있지 않습니다.');
    return false;
  }
  
  const trimmedChatId = String(chatId || '').trim();
  if (!trimmedChatId) {
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: trimmedChatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`[Telegram] B2B 알림 메시지 전송 성공 (Chat ID: ${trimmedChatId})`);
      return true;
    } else {
      console.error(`[Telegram] B2B 알림 메시지 전송 실패:`, data);
      return false;
    }
  } catch (error) {
    console.error(`[Telegram] B2B 알림 API 호출 중 예외 발생:`, error);
    return false;
  }
}
