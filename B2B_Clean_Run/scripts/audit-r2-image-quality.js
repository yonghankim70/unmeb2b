const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const CWD = process.cwd();
const VALID_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const DETAIL_AUDIT_WIDTH = 2200;
const MAIN_AUDIT_WIDTH = 960;
const DETAIL_UPSCALE_TARGET_WIDTH = 1600;
const MAIN_UPSCALE_TARGET_WIDTH = 960;
const CONCURRENCY = Number(process.env.B2B_AUDIT_CONCURRENCY || '8');
const FETCH_TIMEOUT_MS = Number(process.env.B2B_AUDIT_FETCH_TIMEOUT_MS || '15000');

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
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function getApiToken() {
  return ENV.CF_API_TOKEN || ENV.CLOUDFLARE_API_TOKEN || '';
}

function getDataDir() {
  return path.resolve(ENV.B2B_DATA_DIR || path.join(CWD, 'data', 'pddb_dev'));
}

function getR2BaseUrl() {
  return (ENV.NEXT_PUBLIC_R2_IMAGE_BASE_URL || ENV.CF_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
}

function getCacheSegment(value) {
  return encodeURIComponent(value);
}

function getPublicUrlForKey(key) {
  const baseUrl = getR2BaseUrl();
  if (!baseUrl) throw new Error('R2 public base URL is required');
  return `${baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function getMainImageKey(week, code, width = MAIN_AUDIT_WIDTH) {
  return `image-cache/main/${encodeURIComponent(week)}/${getCacheSegment(code)}-${width}.webp`;
}

function getDetailImageKey(week, code, fileName, width = DETAIL_AUDIT_WIDTH) {
  return `image-cache/detail/${encodeURIComponent(week)}/${getCacheSegment(code)}/${getCacheSegment(fileName)}-${width}.webp`;
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

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    .filter((fileName) => !fileName.startsWith('0') && VALID_EXTS.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => imagePriority(left) - imagePriority(right) || left.localeCompare(right))
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
  if (!apiToken) throw new Error('CF_API_TOKEN or CLOUDFLARE_API_TOKEN is required');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      signal: controller.signal,
    },
  );
  clearTimeout(timeout);
  const rawText = await response.text();
  const data = safeJsonParse(rawText, {});
  if (!response.ok || data.success === false) {
    const message = data.errors?.map((error) => error.message).filter(Boolean).join(', ') || rawText.slice(0, 200);
    throw new Error(`D1 query failed: ${message}`);
  }
  return data.result?.[0]?.results || [];
}

async function getRemoteMetadata(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
  clearTimeout(timeout);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      bytes: 0,
      width: 0,
      height: 0,
    };
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const metadata = await sharp(buffer, { failOn: 'none', limitInputPixels: false }).metadata();
  return {
    ok: true,
    status: response.status,
    bytes: buffer.length,
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
}

async function getLocalMetadata(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const metadata = await sharp(filePath, { failOn: 'none', limitInputPixels: false }).metadata();
    return {
      ok: true,
      bytes: stats.size,
      width: metadata.width || 0,
      height: metadata.height || 0,
    };
  } catch {
    return {
      ok: false,
      bytes: 0,
      width: 0,
      height: 0,
    };
  }
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

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

async function main() {
  const dataDir = getDataDir();
  console.log('[Audit] querying D1 products...');
  const products = await queryD1('SELECT code, week, name, payload FROM products ORDER BY week DESC, code ASC');
  console.log(`[Audit] products=${products.length}, dataDir=${dataDir}`);
  const imageTasks = [];
  const mainTasks = [];
  let productsMissingLocalDir = 0;
  let productsWithoutImages = 0;

  for (const row of products) {
    const payload = row.payload ? safeJsonParse(row.payload, {}) : {};
    const code = String(payload?.임시코드 || row.code || payload?.상품명 || '').trim();
    const week = String(payload?.주차 || row.week || '').trim();
    if (!code || !week) continue;

    const productDir = findProductDir(dataDir, week, code);
    if (!fs.existsSync(productDir)) productsMissingLocalDir += 1;

    const localImageNames = readLocalImages(productDir);
    const payloadImages = Array.isArray(payload?.상세이미지목록)
      ? payload.상세이미지목록.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    const detailImageNames = (payloadImages.length > 0 ? payloadImages : localImageNames)
      .filter((name) => name && !isFolderPreviewImage(name));

    if (detailImageNames.length === 0) productsWithoutImages += 1;

    const mainImageName = localImageNames[0] || detailImageNames[0] || '';
    if (mainImageName) {
      mainTasks.push({
        code,
        week,
        fileName: mainImageName,
        localPath: path.join(productDir, mainImageName),
        remoteUrl: getPublicUrlForKey(getMainImageKey(week, code)),
      });
    }

    for (const fileName of detailImageNames) {
      imageTasks.push({
        code,
        week,
        fileName,
        localPath: path.join(productDir, fileName),
        remoteUrl: getPublicUrlForKey(getDetailImageKey(week, code, fileName)),
      });
    }
  }

  const details = [];
  const mains = [];

  console.log(`[Audit] checking main images=${mainTasks.length}`);
  await runWithConcurrency(mainTasks, async (task) => {
    const [local, remote] = await Promise.all([
      getLocalMetadata(task.localPath),
      getRemoteMetadata(task.remoteUrl),
    ]);
    mains.push({ ...task, local, remote });
    if (mains.length % 25 === 0) console.log(`[Audit] main ${mains.length}/${mainTasks.length}`);
  });

  console.log(`[Audit] checking detail images=${imageTasks.length}`);
  await runWithConcurrency(imageTasks, async (task) => {
    const [local, remote] = await Promise.all([
      getLocalMetadata(task.localPath),
      getRemoteMetadata(task.remoteUrl),
    ]);
    details.push({ ...task, local, remote });
    if (details.length % 50 === 0) console.log(`[Audit] detail ${details.length}/${imageTasks.length}`);
  });

  const detailWithLocal = details.filter((item) => item.local.ok);
  const detailWithRemote = details.filter((item) => item.remote.ok);
  const detailMissingRemote = details.filter((item) => !item.remote.ok);
  const detailMissingLocal = details.filter((item) => !item.local.ok);
  const detailUpscaled = details.filter((item) => item.local.ok && item.remote.ok && item.remote.width > item.local.width);
  const detailSameOrDown = details.filter((item) => item.local.ok && item.remote.ok && item.remote.width <= item.local.width);
  const detailNeedsUpscale = details.filter((item) => item.local.ok && item.remote.ok && item.remote.width < DETAIL_UPSCALE_TARGET_WIDTH);

  const mainWithLocal = mains.filter((item) => item.local.ok);
  const mainWithRemote = mains.filter((item) => item.remote.ok);
  const mainNeedsUpscale = mains.filter((item) => item.local.ok && item.remote.ok && item.remote.width < MAIN_UPSCALE_TARGET_WIDTH);

  const detailLocalWidths = detailWithLocal.map((item) => item.local.width).filter(Boolean);
  const detailRemoteWidths = detailWithRemote.map((item) => item.remote.width).filter(Boolean);
  const detailRemoteBytes = detailWithRemote.map((item) => item.remote.bytes).filter(Boolean);

  const summary = {
    checkedAt: new Date().toISOString(),
    dataDir,
    productCount: products.length,
    productsMissingLocalDir,
    productsWithoutImages,
    main: {
      expected: mainTasks.length,
      checked: mains.length,
      localFound: mainWithLocal.length,
      r2Found: mainWithRemote.length,
      needsUpscale: mainNeedsUpscale.length,
    },
    detail: {
      expected: imageTasks.length,
      checked: details.length,
      localFound: detailWithLocal.length,
      r2Found: detailWithRemote.length,
      missingLocal: detailMissingLocal.length,
      missingR2: detailMissingRemote.length,
      serverUpscaled: detailUpscaled.length,
      sameOrDownscaled: detailSameOrDown.length,
      needsUpscaleUnder1600: detailNeedsUpscale.length,
      localWidth: {
        min: Math.min(...detailLocalWidths),
        p25: percentile(detailLocalWidths, 0.25),
        median: percentile(detailLocalWidths, 0.5),
        p75: percentile(detailLocalWidths, 0.75),
        max: Math.max(...detailLocalWidths),
      },
      r2Width: {
        min: Math.min(...detailRemoteWidths),
        p25: percentile(detailRemoteWidths, 0.25),
        median: percentile(detailRemoteWidths, 0.5),
        p75: percentile(detailRemoteWidths, 0.75),
        max: Math.max(...detailRemoteWidths),
      },
      r2Bytes: {
        avgKb: Math.round(detailRemoteBytes.reduce((sum, value) => sum + value, 0) / Math.max(1, detailRemoteBytes.length) / 1024),
        totalMb: Math.round(detailRemoteBytes.reduce((sum, value) => sum + value, 0) / 1024 / 1024),
      },
    },
    examples: {
      needsUpscale: detailNeedsUpscale.slice(0, 20).map((item) => ({
        code: item.code,
        week: item.week,
        fileName: item.fileName,
        local: `${item.local.width}x${item.local.height}`,
        r2: `${item.remote.width}x${item.remote.height}`,
        r2Kb: Math.round(item.remote.bytes / 1024),
      })),
      missingR2: detailMissingRemote.slice(0, 20).map((item) => ({
        code: item.code,
        week: item.week,
        fileName: item.fileName,
        local: item.local.ok ? `${item.local.width}x${item.local.height}` : 'missing',
        status: item.remote.status,
      })),
      serverUpscaled: detailUpscaled.slice(0, 20).map((item) => ({
        code: item.code,
        week: item.week,
        fileName: item.fileName,
        local: `${item.local.width}x${item.local.height}`,
        r2: `${item.remote.width}x${item.remote.height}`,
      })),
    },
  };

  const reportDir = path.join(CWD, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `r2-image-quality-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ summary, mains, details }, null, 2), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`[Audit] report=${reportPath}`);
}

main().catch((error) => {
  console.error(`[Audit] failed: ${error.message}`);
  process.exitCode = 1;
});
