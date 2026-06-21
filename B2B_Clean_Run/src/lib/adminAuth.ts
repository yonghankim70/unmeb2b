import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { getAuthSession } from '@/lib/auth';

const ADMIN_COOKIE_NAME = 'b2b_admin_session';
const ADMIN_SESSION_VALUE = 'admin';
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 8;
const DEFAULT_ADMIN_PASSWORD = 'u&me802';

function getAdminPassword(): string {
  return DEFAULT_ADMIN_PASSWORD;
}

function getAdminSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || getAdminPassword();
}

function sign(value: string): string {
  return createHmac('sha256', getAdminSessionSecret()).update(value).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAdminPassword(password: unknown): boolean {
  const expectedPasswords = [
    DEFAULT_ADMIN_PASSWORD,
    ...(process.env.ADMIN_PASSWORD_ALIASES || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ].filter((value, index, list) => value && list.indexOf(value) === index);
  const candidate = String(password || '').trim();
  return expectedPasswords.some((expected) => safeEqual(candidate, expected));
}

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!cookie) {
      const authSession = await getAuthSession();
      return Boolean(authSession?.isAdmin || authSession?.discountGrade === 'ADMIN');
    }

    const [value, signature] = cookie.split('.');
    if (value !== ADMIN_SESSION_VALUE || !signature) {
      const authSession = await getAuthSession();
      return Boolean(authSession?.isAdmin || authSession?.discountGrade === 'ADMIN');
    }

    if (safeEqual(signature, sign(value))) {
      return true;
    }

    const authSession = await getAuthSession();
    return Boolean(authSession?.isAdmin || authSession?.discountGrade === 'ADMIN');
  } catch (error) {
    console.error('[Admin Auth] Failed to verify admin session:', error);
    return false;
  }
}

export async function setAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const value = `${ADMIN_SESSION_VALUE}.${sign(ADMIN_SESSION_VALUE)}`;
  cookieStore.set(ADMIN_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}
