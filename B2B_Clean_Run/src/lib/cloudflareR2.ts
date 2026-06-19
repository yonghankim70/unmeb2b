import { createHash, createHmac } from 'crypto';

const R2_REGION = 'auto';
const R2_SERVICE = 's3';

function requiredR2Env(): void {
  const missing = ['CF_ACCOUNT_ID', 'CF_R2_BUCKET', 'CF_R2_ACCESS_KEY_ID', 'CF_R2_SECRET_ACCESS_KEY'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Cloudflare R2 설정값이 없습니다: ${missing.join(', ')}`);
  }
}

function hmac(key: string | Buffer, value: string, encoding?: 'hex' | 'base64' | 'base64url'): Buffer | string {
  const digest = createHmac('sha256', key).update(value, 'utf8').digest();
  return encoding ? digest.toString(encoding) : digest;
}

function sha256(value: string | Buffer, encoding: 'hex' | 'base64' | 'base64url' = 'hex'): string {
  return createHash('sha256').update(value).digest(encoding);
}

function getSigningKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp) as Buffer;
  const kRegion = hmac(kDate, region) as Buffer;
  const kService = hmac(kRegion, service) as Buffer;
  return hmac(kService, 'aws4_request') as Buffer;
}

export function getR2CacheSegment(value: string): string {
  return encodeURIComponent(value);
}

export function getMainImageKey(week: string, code: string, width: number): string {
  return `image-cache/main/${encodeURIComponent(week)}/${getR2CacheSegment(code)}-${width}.webp`;
}

export function getDetailImageKey(week: string, code: string, fileName: string, width: number): string {
  return `image-cache/detail/${encodeURIComponent(week)}/${getR2CacheSegment(code)}/${getR2CacheSegment(fileName)}-${width}.webp`;
}

export function getR2PublicUrlForKey(key: string): string {
  const base = (process.env.NEXT_PUBLIC_R2_IMAGE_BASE_URL || process.env.CF_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    throw new Error('R2 공개 URL이 설정되지 않았습니다.');
  }
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function signedR2Request(target: string, method: 'GET' | 'PUT' | 'DELETE', body?: Uint8Array): Promise<Response> {
  requiredR2Env();

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const accessKey = process.env.CF_R2_ACCESS_KEY_ID as string;
  const secretKey = process.env.CF_R2_SECRET_ACCESS_KEY as string;
  const payloadHash = sha256(body ? Buffer.from(body) : '');
  const [pathname, rawQuery = ''] = target.split('?', 2);
  const canonicalQueryString = rawQuery
    .split('&')
    .filter(Boolean)
    .map((part) => {
      const [key, value = ''] = part.split('=', 2);
      return [key, value] as const;
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) return leftValue.localeCompare(rightValue);
      return leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signingKey = getSigningKey(secretKey, dateStamp, R2_REGION, R2_SERVICE);
  const signature = hmac(signingKey, stringToSign, 'hex') as string;
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(`https://${host}${target}`, {
    method,
    headers: {
      Authorization: authorization,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
      ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    body: body ? Buffer.from(body) : undefined,
    cache: 'no-store',
  });
}

export async function listR2Objects(prefix: string): Promise<string[]> {
  requiredR2Env();

  const bucket = process.env.CF_R2_BUCKET as string;
  const query = `list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const pathname = `/${bucket}?${query}`;
  const response = await signedR2Request(pathname, 'GET');

  if (!response.ok) {
    throw new Error(`R2 목록 조회 실패 (${response.status}): ${await response.text()}`);
  }

  const xml = await response.text();
  const matches = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)];
  return matches.map((match) => match[1]);
}

export async function putR2Object(key: string, body: Buffer, contentType: string): Promise<void> {
  requiredR2Env();

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bucket = process.env.CF_R2_BUCKET as string;
  const accessKey = process.env.CF_R2_ACCESS_KEY_ID as string;
  const secretKey = process.env.CF_R2_SECRET_ACCESS_KEY as string;
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const pathname = `/${bucket}/${encodedKey}`;
  const payloadHash = sha256(body);

  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signingKey = getSigningKey(secretKey, dateStamp, R2_REGION, R2_SERVICE);
  const signature = hmac(signingKey, stringToSign, 'hex') as string;
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${pathname}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
    },
    body: new Uint8Array(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`R2 업로드 실패 (${response.status}): ${await response.text()}`);
  }
}

export async function deleteR2Object(key: string): Promise<void> {
  requiredR2Env();

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bucket = process.env.CF_R2_BUCKET as string;
  const accessKey = process.env.CF_R2_ACCESS_KEY_ID as string;
  const secretKey = process.env.CF_R2_SECRET_ACCESS_KEY as string;
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const pathname = `/${bucket}/${encodedKey}`;
  const payloadHash = sha256('');

  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'DELETE',
    pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signingKey = getSigningKey(secretKey, dateStamp, R2_REGION, R2_SERVICE);
  const signature = hmac(signingKey, stringToSign, 'hex') as string;
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${pathname}`, {
    method: 'DELETE',
    headers: {
      Authorization: authorization,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
    },
    cache: 'no-store',
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 삭제 실패 (${response.status}): ${await response.text()}`);
  }
}
