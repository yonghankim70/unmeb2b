import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

const SESSION_COOKIE_NAME = 'b2b_session';

export interface AuthSession {
  customerName: string;
  discountGrade: string;
  쥔장장바구니허락?: string;
  isAdmin?: boolean;
}

function getSessionSecret(): string {
  return process.env.AUTH_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || 'b2b-clean-session-secret';
}

function sign(value: string): string {
  return createHmac('sha256', getSessionSecret()).update(value).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeSession(session: AuthSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value: string): AuthSession | null {
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return null;
  }

  const decodedStr = Buffer.from(payload, 'base64url').toString('utf-8');
  return JSON.parse(decodedStr) as AuthSession;
}

export async function getAuthSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }
    
    return decodeSession(sessionCookie.value);
  } catch (error) {
    console.error('Failed to get auth session:', error);
    return null;
  }
}

export async function setAuthSession(session: AuthSession) {
  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    return true;
  } catch (error) {
    console.error('Failed to set auth session:', error);
    return false;
  }
}

export async function clearAuthSession() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    return true;
  } catch (error) {
    console.error('Failed to delete auth session:', error);
    return false;
  }
}
