const fs = require('fs');
const path = require('path');
const { createHash, createHmac } = require('crypto');

const CWD = process.cwd();
const R2_REGION = 'auto';
const R2_SERVICE = 's3';

function readEnvFile() {
  const envPath = path.join(CWD, '.env.local');
  if (!fs.existsSync(envPath)) return {};

  return fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return acc;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      acc[key] = value;
      return acc;
    }, {});
}

const ENV = { ...readEnvFile(), ...process.env };

function hmac(key, value, encoding) {
  const digest = createHmac('sha256', key).update(value, 'utf8').digest();
  return encoding ? digest.toString(encoding) : digest;
}

function sha256(value, encoding = 'hex') {
  return createHash('sha256').update(value).digest(encoding);
}

function getSigningKey(secret, dateStamp) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, R2_REGION);
  const kService = hmac(kRegion, R2_SERVICE);
  return hmac(kService, 'aws4_request');
}

function requireEnv(key) {
  const value = ENV[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

async function putR2Object(filePath, key) {
  const accountId = requireEnv('CF_ACCOUNT_ID');
  const bucket = requireEnv('CF_R2_BUCKET');
  const accessKey = requireEnv('CF_R2_ACCESS_KEY_ID');
  const secretKey = requireEnv('CF_R2_SECRET_ACCESS_KEY');
  const body = fs.readFileSync(filePath);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const pathname = `/${bucket}/${encodedKey}`;
  const payloadHash = sha256(body);

  const canonicalHeaders = [
    `cache-control:public, max-age=31536000, immutable`,
    'content-type:image/webp',
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date';
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
  const signature = hmac(getSigningKey(secretKey, dateStamp), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${pathname}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': 'image/webp',
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
    },
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed ${response.status}: ${await response.text()}`);
  }

  return { key, bytes: body.length };
}

async function main() {
  const pairs = process.argv.slice(2);
  if (pairs.length === 0) {
    throw new Error('Usage: node scripts/upload-r2-files.js <localPath=r2/key> [...]');
  }

  const results = [];
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator <= 0) throw new Error(`Invalid pair: ${pair}`);
    const filePath = path.resolve(CWD, pair.slice(0, separator));
    const key = pair.slice(separator + 1).replace(/^\/+/, '');
    results.push(await putR2Object(filePath, key));
  }

  console.log(JSON.stringify({ uploaded: results }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
