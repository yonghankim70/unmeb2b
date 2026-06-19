interface D1QueryResult<T> {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{
    results?: T[];
    meta?: {
      rows_read?: number;
      rows_written?: number;
      duration?: number;
    };
  }>;
}

function requireCloudflareD1Env(): void {
  const missing = ['CF_ACCOUNT_ID', 'CF_D1_DATABASE_ID'].filter((key) => !process.env[key]);
  const apiToken = getCloudflareApiToken();
  if (!apiToken) {
    missing.push('CF_API_TOKEN');
  }
  if (missing.length > 0) {
    throw new Error(`Cloudflare D1 설정값이 없습니다: ${missing.join(', ')}`);
  }
}

function getCloudflareApiToken(): string {
  return process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
}

export async function queryD1<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  requireCloudflareD1Env();
  const apiToken = getCloudflareApiToken();

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.CF_D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      cache: 'no-store',
    }
  );
  const data = await response.json() as D1QueryResult<T>;

  if (!response.ok || data.success === false) {
    const message = data.errors?.map((error) => error.message).filter(Boolean).join(', ') || response.statusText;
    throw new Error(`Cloudflare D1 조회 실패: ${message}`);
  }

  return data.result?.[0]?.results || [];
}

export function isCloudD1Configured(): boolean {
  return Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_D1_DATABASE_ID && getCloudflareApiToken());
}

export function isCloudDbEnabled(): boolean {
  return process.env.B2B_DB_MODE === 'd1';
}
