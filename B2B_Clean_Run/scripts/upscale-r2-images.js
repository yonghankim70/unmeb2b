const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const CWD = process.cwd();
const VALID_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAIN_WIDTHS = [480, 960];
const DETAIL_WIDTHS = [1200, 2200];
const MAIN_480_QUALITY = Number(process.env.B2B_UPSCALE_MAIN_480_QUALITY || '92');
const MAIN_960_QUALITY = Number(process.env.B2B_UPSCALE_MAIN_960_QUALITY || process.env.B2B_UPSCALE_MAIN_QUALITY || '94');
const DETAIL_1200_QUALITY = Number(process.env.B2B_UPSCALE_DETAIL_1200_QUALITY || '96');
const DETAIL_2200_QUALITY = Number(process.env.B2B_UPSCALE_DETAIL_2200_QUALITY || process.env.B2B_UPSCALE_DETAIL_QUALITY || '98');
const MAX_UPSCALE_FACTOR = Number(process.env.B2B_UPSCALE_MAX_FACTOR || '2');
const CONCURRENCY = Number(process.env.B2B_UPSCALE_CONCURRENCY || '3');
const MODE = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const ONLY_NEEDED = process.argv.includes('--needed');
const FRESH_RUN = process.argv.includes('--fresh');
const STATE_FILE = process.env.B2B_UPSCALE_STATE_FILE || path.join(CWD, 'reports', 'r2-image-upscale-progress-current.jsonl');

function readEnvFile(fileName) {
  const envPath = path.join(CWD, fileName);
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

const ENV = {
  ...readEnvFile('.env.deploy.local'),
  ...readEnvFile('.env.local'),
  ...process.env,
};

function requireEnv(key) {
  const value = ENV[key];
  if (!value) throw new Error(`Missing environment value: ${key}`);
  return value;
}

function getApiToken() {
  return ENV.CF_API_TOKEN || ENV.CLOUDFLARE_API_TOKEN || '';
}

function getDataDir() {
  return path.resolve(ENV.B2B_DATA_DIR || path.join(CWD, 'data', 'pddb_dev'));
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getR2CacheSegment(value) {
  return encodeURIComponent(value);
}

function getMainImageKey(week, code, width) {
  return `image-cache/main/${encodeURIComponent(week)}/${getR2CacheSegment(code)}-${width}.webp`;
}

function getDetailImageKey(week, code, fileName, width) {
  return `image-cache/detail/${encodeURIComponent(week)}/${getR2CacheSegment(code)}/${getR2CacheSegment(fileName)}-${width}.webp`;
}

function getMainQuality(width) {
  return width >= 960 ? MAIN_960_QUALITY : MAIN_480_QUALITY;
}

function getDetailQuality(width) {
  return width >= 2200 ? DETAIL_2200_QUALITY : DETAIL_1200_QUALITY;
}

function imagePriority(fileName) {
  const lower = fileName.toLowerCase();
  if (lower === 'folder.jpg' || lower === 'folder.jpeg' || lower === 'folder.png' || lower === 'folder.webp') return 0;
  if (lower.startsWith('product_main.')) return 1;
  return 2;
}

function isFolderPreviewImage(fileName) {
  const lower = fileName.toLowerCase();
  return lower === 'folder.jpg' || lower === 'folder.jpeg' || lower === 'folder.png' || lower === 'folder.webp';
}

function isSupportedImage(fileName) {
  return VALID_IMAGE_EXTS.has(path.extname(fileName).toLowerCase());
}

function findProductDir(dataDir, week, code) {
  const exact = path.join(dataDir, week, code);
  if (fs.existsSync(exact)) return exact;
  const weekPath = path.join(dataDir, week);
  if (!fs.existsSync(weekPath)) return exact;
  const lowerCode = code.toLowerCase();
  const match = fs.readdirSync(weekPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .find((name) => name.toLowerCase() === lowerCode || name.toLowerCase().replace(/_temp_refresh$/, '') === lowerCode);
  return match ? path.join(weekPath, match) : exact;
}

function readLocalImages(productDir) {
  if (!fs.existsSync(productDir)) return [];
  return fs.readdirSync(productDir)
    .filter((fileName) => !fileName.startsWith('0') && isSupportedImage(fileName))
    .sort((left, right) => imagePriority(left) - imagePriority(right) || left.localeCompare(right, 'ko-KR', { numeric: true }))
    .filter((fileName) => {
      try {
        const stats = fs.statSync(path.join(productDir, fileName));
        return stats.isFile() && stats.size > 2048;
      } catch {
        return false;
      }
    });
}

async function queryD1(sql, params = []) {
  const accountId = requireEnv('CF_ACCOUNT_ID');
  const databaseId = requireEnv('CF_D1_DATABASE_ID');
  const apiToken = getApiToken();
  if (!apiToken) throw new Error('Missing environment value: CF_API_TOKEN');

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const rawText = await response.text();
  const data = safeJsonParse(rawText, {});
  if (!response.ok || data.success === false) {
    const message = data.errors?.map((error) => error.message).filter(Boolean).join(', ') || rawText.slice(0, 200);
    throw new Error(`D1 query failed: ${message}`);
  }
  return data.result?.[0]?.results || [];
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding);
}

function encodeAwsUriComponent(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function getSigningKey(secret, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

async function putR2Object(key, body, contentType) {
  requireEnv('CF_ACCOUNT_ID');
  requireEnv('CF_R2_BUCKET');
  requireEnv('CF_R2_ACCESS_KEY_ID');
  requireEnv('CF_R2_SECRET_ACCESS_KEY');

  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${ENV.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const encodedKey = key.split('/').map(encodeAwsUriComponent).join('/');
  const pathname = `/${ENV.CF_R2_BUCKET}/${encodedKey}`;
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
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signingKey = getSigningKey(ENV.CF_R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${ENV.CF_R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`https://${host}${pathname}`, {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'Content-Type': contentType,
        'X-Amz-Content-Sha256': payloadHash,
        'X-Amz-Date': amzDate,
      },
      body,
    });
    if (response.ok) return;
    const message = await response.text();
    if (attempt === 3) {
      throw new Error(`R2 upload failed ${response.status}: ${message.slice(0, 300)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
}

async function buildWebp(sourcePath, requestedWidth, quality) {
  const metadata = await sharp(sourcePath, { failOn: 'none', limitInputPixels: false }).metadata();
  const sourceWidth = metadata.width || requestedWidth;
  const targetWidth = sourceWidth >= requestedWidth
    ? requestedWidth
    : Math.min(requestedWidth, Math.max(1, Math.round(sourceWidth * MAX_UPSCALE_FACTOR)));
  const upscaled = targetWidth > sourceWidth;

  let pipeline = sharp(sourcePath, { failOn: 'none', limitInputPixels: false })
    .rotate()
    .resize({
      width: targetWidth,
      fit: 'inside',
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    });

  pipeline = upscaled
    ? pipeline.sharpen({ sigma: 0.55, m1: 0.7, m2: 1.45 }).modulate({ brightness: 1.01, saturation: 1.02 })
    : pipeline.sharpen({ sigma: 0.35, m1: 0.45, m2: 1.1 });

  const buffer = await pipeline
    .webp({
      quality,
      effort: 5,
      smartSubsample: true,
    })
    .toBuffer();

  return {
    buffer,
    sourceWidth,
    sourceHeight: metadata.height || 0,
    targetWidth,
    upscaled,
  };
}

async function readImageMetadata(sourcePath) {
  try {
    const metadata = await sharp(sourcePath, { failOn: 'none', limitInputPixels: false }).metadata();
    return {
      ok: true,
      width: metadata.width || 0,
      height: metadata.height || 0,
    };
  } catch {
    return {
      ok: false,
      width: 0,
      height: 0,
    };
  }
}

function readCompletedKeys() {
  if (FRESH_RUN && fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
  if (!fs.existsSync(STATE_FILE)) return new Set();
  const keys = new Set();
  for (const line of fs.readFileSync(STATE_FILE, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = safeJsonParse(line, null);
    if (parsed?.key) keys.add(parsed.key);
  }
  return keys;
}

function appendCompletedKey(item) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.appendFileSync(STATE_FILE, `${JSON.stringify({ ...item, completedAt: new Date().toISOString() })}\n`, 'utf8');
}

async function runWithConcurrency(items, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const dataDir = getDataDir();
  console.log(`[Upscale] mode=${MODE}`);
  console.log(`[Upscale] onlyNeeded=${ONLY_NEEDED ? 'yes' : 'no'}`);
  console.log(`[Upscale] dataDir=${dataDir}`);
  console.log(`[Upscale] detailWidths=${DETAIL_WIDTHS.join(',')}, detailQuality=${DETAIL_1200_QUALITY}/${DETAIL_2200_QUALITY}, maxFactor=${MAX_UPSCALE_FACTOR}`);
  const products = await queryD1('SELECT code, week, name, payload FROM products ORDER BY week DESC, code ASC');
  console.log(`[Upscale] products=${products.length}`);

  const tasks = [];
  const skipped = [];
  const productPayloads = new Map();
  const touchedProducts = new Map();

  for (const row of products) {
    const payload = row.payload ? safeJsonParse(row.payload, {}) : {};
    const code = String(payload?.임시코드 || row.code || payload?.상품명 || '').trim();
    const week = String(payload?.주차 || row.week || '').trim();
    if (!code || !week) continue;
    productPayloads.set(code, payload);

    const productDir = findProductDir(dataDir, week, code);
    const localImages = readLocalImages(productDir);
    const payloadImages = Array.isArray(payload?.상세이미지목록)
      ? payload.상세이미지목록.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    const detailImages = (payloadImages.length > 0 ? payloadImages : localImages)
      .filter((name) => name && !isFolderPreviewImage(name) && isSupportedImage(name));

    const mainImage = localImages[0] || detailImages[0] || '';
    if (mainImage) {
      const sourcePath = path.join(productDir, mainImage);
      if (fs.existsSync(sourcePath)) {
        const metadata = await readImageMetadata(sourcePath);
        if (!metadata.ok) {
          skipped.push({ code, week, fileName: mainImage, reason: 'main metadata failed' });
        } else if (!ONLY_NEEDED || metadata.width < 960) {
          for (const width of MAIN_WIDTHS) {
            tasks.push({
              kind: 'main',
              week,
              code,
              fileName: mainImage,
              sourcePath,
              sourceWidth: metadata.width,
              sourceHeight: metadata.height,
              width,
              quality: getMainQuality(width),
              key: getMainImageKey(week, code, width),
            });
          }
        }
      }
    }

    for (const fileName of detailImages) {
      const sourcePath = path.join(productDir, fileName);
      if (!fs.existsSync(sourcePath)) {
        skipped.push({ code, week, fileName, reason: 'local source missing' });
        continue;
      }
      const metadata = await readImageMetadata(sourcePath);
      if (!metadata.ok) {
        skipped.push({ code, week, fileName, reason: 'detail metadata failed' });
        continue;
      }
      if (ONLY_NEEDED && metadata.width >= 1600) {
        continue;
      }
      for (const width of DETAIL_WIDTHS) {
        tasks.push({
          kind: 'detail',
          week,
          code,
          fileName,
          sourcePath,
          sourceWidth: metadata.width,
          sourceHeight: metadata.height,
          width,
          quality: getDetailQuality(width),
          key: getDetailImageKey(week, code, fileName, width),
        });
      }
    }
  }

  const stats = {
    planned: tasks.length,
    uploaded: 0,
    generated: 0,
    upscaled: 0,
    failed: 0,
    skipped: skipped.length,
    skippedCompleted: 0,
    outputBytes: 0,
  };
  const failures = [];
  const upscaledExamples = [];

  console.log(`[Upscale] plannedVariants=${tasks.length}, skippedSources=${skipped.length}`);
  if (MODE !== 'apply') {
    console.log('[Upscale] dry-run only. Add --apply to generate and upload WebP files to R2.');
    const report = {
      completedAt: new Date().toISOString(),
      mode: MODE,
      onlyNeeded: ONLY_NEEDED,
      dataDir,
      productCount: products.length,
      mainWidths: MAIN_WIDTHS,
      detailWidths: DETAIL_WIDTHS,
      mainQuality: {
        480: MAIN_480_QUALITY,
        960: MAIN_960_QUALITY,
      },
      detailQuality: {
        1200: DETAIL_1200_QUALITY,
        2200: DETAIL_2200_QUALITY,
      },
      maxUpscaleFactor: MAX_UPSCALE_FACTOR,
      plannedVariants: tasks.length,
      skipped,
      examples: tasks.slice(0, 20).map((task) => ({
        code: task.code,
        week: task.week,
        fileName: task.fileName,
        kind: task.kind,
        width: task.width,
        source: `${task.sourceWidth}x${task.sourceHeight}`,
      })),
    };
    const reportDir = path.join(CWD, 'reports');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `r2-image-upscale-plan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    console.log(`[Upscale] plan=${reportPath}`);
    return;
  }

  const completedKeys = readCompletedKeys();

  await runWithConcurrency(tasks, async (task) => {
    try {
      if (completedKeys.has(task.key)) {
        stats.skippedCompleted += 1;
        return;
      }
      const result = await buildWebp(task.sourcePath, task.width, task.quality);
      stats.generated += 1;
      stats.outputBytes += result.buffer.length;
      if (result.upscaled) {
        stats.upscaled += 1;
        if (upscaledExamples.length < 20) {
          upscaledExamples.push({
            code: task.code,
            week: task.week,
            fileName: task.fileName,
            width: task.width,
            source: `${result.sourceWidth}x${result.sourceHeight}`,
            outputWidth: result.targetWidth,
          });
        }
      }
      if (MODE === 'apply') {
        await putR2Object(task.key, result.buffer, 'image/webp');
        stats.uploaded += 1;
        touchedProducts.set(task.code, { code: task.code, week: task.week });
        appendCompletedKey({
          key: task.key,
          code: task.code,
          week: task.week,
          fileName: task.fileName,
          width: task.width,
          outputWidth: result.targetWidth,
          upscaled: result.upscaled,
          bytes: result.buffer.length,
        });
      }
      if (stats.generated % 50 === 0) {
        console.log(`[Upscale] generated=${stats.generated}/${tasks.length}, uploaded=${stats.uploaded}, upscaled=${stats.upscaled}`);
      }
    } catch (error) {
      stats.failed += 1;
      failures.push({
        code: task.code,
        week: task.week,
        fileName: task.fileName,
        width: task.width,
        error: error.message,
      });
      console.log(`[Upscale] failed ${task.code} ${task.fileName} ${task.width}: ${error.message}`);
    }
  });

  let versionUpdated = 0;
  if (MODE === 'apply' && touchedProducts.size > 0) {
    const imageVersion = new Date().toISOString();
    for (const { code } of touchedProducts.values()) {
      const payload = productPayloads.get(code);
      if (!payload || typeof payload !== 'object') continue;
      payload.이미지버전 = imageVersion;
      await queryD1(
        'UPDATE products SET payload = ?, updated_at = ? WHERE code = ?',
        [JSON.stringify(payload), imageVersion, code],
      );
      versionUpdated += 1;
    }
  }

  const report = {
    completedAt: new Date().toISOString(),
    mode: MODE,
    dataDir,
    productCount: products.length,
    mainWidths: MAIN_WIDTHS,
    detailWidths: DETAIL_WIDTHS,
    mainQuality: {
      480: MAIN_480_QUALITY,
      960: MAIN_960_QUALITY,
    },
    detailQuality: {
      1200: DETAIL_1200_QUALITY,
      2200: DETAIL_2200_QUALITY,
    },
    maxUpscaleFactor: MAX_UPSCALE_FACTOR,
    versionUpdated,
    stats: {
      ...stats,
      outputMb: Math.round(stats.outputBytes / 1024 / 1024),
    },
    upscaledExamples,
    skipped,
    failures,
  };

  const reportDir = path.join(CWD, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `r2-image-upscale-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`[Upscale] report=${reportPath}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[Upscale] failed: ${error.message}`);
  process.exitCode = 1;
});
