const ADMIN_AUTH_KEY = 'admin_authenticated';
const ADMIN_AUTH_TIME_KEY = 'admin_authenticated_at';
const ADMIN_AUTH_TTL_MS = 8 * 60 * 60 * 1000;

export const ADMIN_ROUTES = [
  '/admin/products',
  '/admin/orders',
  '/admin/analysis',
  '/admin/ledger',
  '/admin/customers',
];

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function markAdminAuthenticated() {
  if (!canUseSessionStorage()) return;
  sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
  sessionStorage.setItem(ADMIN_AUTH_TIME_KEY, String(Date.now()));
}

export function clearAdminAuthCache() {
  if (!canUseSessionStorage()) return;
  sessionStorage.removeItem(ADMIN_AUTH_KEY);
  sessionStorage.removeItem(ADMIN_AUTH_TIME_KEY);
}

export function hasFreshAdminAuthCache() {
  if (!canUseSessionStorage()) return false;
  if (sessionStorage.getItem(ADMIN_AUTH_KEY) !== 'true') return false;

  const cachedAt = Number(sessionStorage.getItem(ADMIN_AUTH_TIME_KEY));
  if (!cachedAt) {
    sessionStorage.setItem(ADMIN_AUTH_TIME_KEY, String(Date.now()));
    return true;
  }

  if (Date.now() - cachedAt > ADMIN_AUTH_TTL_MS) {
    clearAdminAuthCache();
    return false;
  }

  return true;
}

export async function verifyAdminStatus() {
  try {
    const res = await fetch('/api/admin/status', { cache: 'no-store' });
    const data = await res.json();
    const authenticated = res.ok && Boolean(data.authenticated);

    if (authenticated) {
      markAdminAuthenticated();
    } else {
      clearAdminAuthCache();
    }

    return authenticated;
  } catch (error) {
    console.error('[Admin] Status check failed:', error);
    clearAdminAuthCache();
    return false;
  }
}

export function prefetchAdminRoutes(router: { prefetch?: (href: string) => void }) {
  if (!router.prefetch) return;
  ADMIN_ROUTES.forEach(route => {
    try {
      router.prefetch?.(route);
    } catch {
      // Prefetch is a speed hint only.
    }
  });
}
