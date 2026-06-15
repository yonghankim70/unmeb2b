import { cookies } from 'next/headers';

export interface AuthSession {
  customerName: string;
  discountGrade: string;
}

export async function getAuthSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('b2b_session');
    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }
    
    const decodedStr = Buffer.from(sessionCookie.value, 'base64').toString('utf-8');
    const session = JSON.parse(decodedStr) as AuthSession;
    return session;
  } catch (error) {
    console.error('Failed to get auth session:', error);
    return null;
  }
}

export async function setAuthSession(session: AuthSession) {
  try {
    const cookieStore = await cookies();
    const base64Value = Buffer.from(JSON.stringify(session)).toString('base64');
    cookieStore.set('b2b_session', base64Value, {
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
    cookieStore.delete('b2b_session');
    return true;
  } catch (error) {
    console.error('Failed to delete auth session:', error);
    return false;
  }
}
