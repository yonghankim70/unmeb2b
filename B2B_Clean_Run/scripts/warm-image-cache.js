const fs = require('fs');
const os = require('os');
const path = require('path');
const xlsx = require('xlsx');
const sharp = require('sharp');
const { spawnSync } = require('child_process');

const CWD = process.cwd();
const VALID_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const DEFAULT_MAIN_WIDTHS = [480, 960];
const DEFAULT_DETAIL_WIDTHS = [1200, 2200];

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

const ENV = readEnvFile();
const MAIN_CACHE_LIMIT = Number(ENV.B2B_MAIN_IMAGE_WARM_LIMIT || process.env.B2B_MAIN_IMAGE_WARM_LIMIT || '1000');
const DETAIL_IMAGE_WARM_COUNT = Number(ENV.B2B_DETAIL_IMAGE_WARM_COUNT || process.env.B2B_DETAIL_IMAGE_WARM_COUNT || '999');
const WORKER_COUNT = Math.max(1, Number(ENV.B2B_IMAGE_WARM_WORKERS || process.env.B2B_IMAGE_WARM_WORKERS || '3'));
const MAIN_QUALITY = Number(ENV.B2B_MAIN_IMAGE_QUALITY || process.env.B2B_MAIN_IMAGE_QUALITY || '92');
const DETAIL_QUALITY = Number(ENV.B2B_DETAIL_IMAGE_QUALITY || process.env.B2B_DETAIL_IMAGE_QUALITY || '94');
const MAIN_WIDTHS = parseWidths(ENV.B2B_MAIN_IMAGE_WIDTHS || process.env.B2B_MAIN_IMAGE_WIDTHS, DEFAULT_MAIN_WIDTHS);
const DETAIL_WIDTHS = parseWidths(ENV.B2B_DETAIL_IMAGE_WIDTHS || process.env.B2B_DETAIL_IMAGE_WIDTHS, DEFAULT_DETAIL_WIDTHS);
const IMAGE_UPSCALE_ENABLED = (ENV.B2B_IMAGE_UPSCALE || process.env.B2B_IMAGE_UPSCALE || 'YES') !== 'NO';
const IMAGE_UPSCALE_MAX_FACTOR = Math.max(1, Number(ENV.B2B_IMAGE_UPSCALE_MAX_FACTOR || process.env.B2B_IMAGE_UPSCALE_MAX_FACTOR || '2'));
const TEMP_OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-image-cache-'));
const PENDING_COPY_MANIFEST = path.join(TEMP_OUTPUT_DIR, 'pending-copy.jsonl');
let usePowerShellCopy = false;
let powerShellSpawnBlocked = false;

function parseWidths(value, fallback) {
  if (!value) return fallback;
  const widths = String(value)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 240 && item <= 2400);
  return widths.length > 0 ? [...new Set(widths)].sort((a, b) => a - b) : fallback;
}

function sanitizeValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function getDataDir() {
  return path.resolve(ENV.B2B_DATA_DIR || process.env.B2B_DATA_DIR || path.join(CWD, 'data', 'pddb_dev'));
}

function getCacheRoot() {
  return path.resolve(ENV.B2B_IMAGE_CACHE_DIR || process.env.B2B_IMAGE_CACHE_DIR || path.join(CWD, 'public', 'image-cache'));
}

function getStatusPath(cacheRoot) {
  const statusDir = path.resolve(ENV.B2B_IMAGE_OPTIMIZE_STATUS_DIR || process.env.B2B_IMAGE_OPTIMIZE_STATUS_DIR || path.join(os.tmpdir(), 'b2b-image-optimize-status'));
  return path.join(statusDir, 'image-optimize-status.json');
}

function writeStatus(cacheRoot, status) {
  try {
    const statusPath = getStatusPath(cacheRoot);
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
  } catch (error) {
    console.log(`[Image Warm] Failed to write status (${error.message})`);
  }
}

function readProducts(dataDir) {
  const masterPath = path.join(dataDir, 'Master.xlsx');
  if (!fs.existsSync(masterPath)) {
    console.log(`[Image Warm] Master.xlsx not found: ${masterPath}`);
    return [];
  }

  const workbook = xlsx.read(fs.readFileSync(masterPath), { type: 'buffer' });
  const sheet = workbook.Sheets['상품 마스터'];
  if (!sheet) {
    console.log('[Image Warm] Sheet not found: 상품 마스터');
    return [];
  }

  return xlsx.utils.sheet_to_json(sheet).map((row) => {
    const normalized = {};
    Object.keys(row).forEach((key) => {
      normalized[key.trim()] = row[key];
    });
    return {
      week: sanitizeValue(normalized['주차']),
      code: sanitizeValue(normalized['임시코드'] || normalized['상품명']),
      sourceDir: '',
      exposure: sanitizeValue(normalized['노출여부']).toLowerCase(),
    };
  }).filter((product) => product.week && product.code && product.exposure !== 'n');
}

function readProductFolders(dataDir) {
  if (!fs.existsSync(dataDir)) return [];

  const products = [];
  const weekDirs = fs.readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^\d{2}[a-zA-Z]+/.test(name))
    .sort((left, right) => right.localeCompare(left));

  for (const week of weekDirs) {
    const weekPath = path.join(dataDir, week);
    const productDirs = fs.readdirSync(weekPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));

    for (const dirName of productDirs) {
      const code = dirName.endsWith('_temp_refresh') ? dirName.slice(0, -'_temp_refresh'.length) : dirName;
      if (!code) continue;
      products.push({
        week,
        code,
        sourceDir: path.join(weekPath, dirName),
        exposure: 'y',
      });
    }
  }

  return products;
}

function mergeProducts(...productLists) {
  const merged = new Map();

  productLists.flat().forEach((product) => {
    const key = `${product.week}|${product.code}`;
    const previous = merged.get(key);
    if (!previous || (!previous.sourceDir && product.sourceDir)) {
      merged.set(key, product);
    }
  });

  return Array.from(merged.values()).sort((left, right) => {
    const weekDiff = right.week.localeCompare(left.week);
    if (weekDiff !== 0) return weekDiff;
    return right.code.localeCompare(left.code);
  });
}

function imagePriority(fileName) {
  const lower = fileName.toLowerCase();
  if (lower === 'folder.jpg' || lower === 'folder.jpeg' || lower === 'folder.png' || lower === 'folder.webp') return 0;
  if (lower.startsWith('product_main.')) return 1;
  return 2;
}

function readImageSources(productDir) {
  if (!fs.existsSync(productDir)) return [];

  return fs.readdirSync(productDir)
    .filter((fileName) => !fileName.startsWith('0') && VALID_EXTS.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => imagePriority(left) - imagePriority(right) || left.localeCompare(right))
    .map((fileName) => path.join(productDir, fileName))
    .filter((sourcePath) => {
      try {
        const stats = fs.statSync(sourcePath);
        return stats.isFile() && stats.size > 2048;
      } catch {
        return false;
      }
    });
}

function isFolderPreviewImage(sourcePath) {
  const lower = path.basename(sourcePath).toLowerCase();
  return lower === 'folder.jpg' || lower === 'folder.jpeg' || lower === 'folder.png' || lower === 'folder.webp';
}

function encodedSegment(value) {
  return encodeURIComponent(value);
}

function mainCachePath(cacheRoot, week, code, width) {
  return path.join(cacheRoot, 'main', week, `${encodedSegment(code)}-${width}.webp`);
}

function detailCachePath(cacheRoot, week, code, sourcePath, width) {
  return path.join(cacheRoot, 'detail', week, encodedSegment(code), `${encodedSegment(path.basename(sourcePath))}-${width}.webp`);
}

function isFreshOptimized(sourcePath, targetPath) {
  if (!fs.existsSync(targetPath)) return false;

  try {
    const sourceStats = fs.statSync(sourcePath);
    const targetStats = fs.statSync(targetPath);
    return targetStats.isFile() && targetStats.size > 2048 && targetStats.mtimeMs >= sourceStats.mtimeMs;
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (error) {
    const result = runPowerShell(`New-Item -ItemType Directory -Force -LiteralPath ${quotePowerShell(dirPath)} | Out-Null`);
    if (result.status === 0) return true;
    console.log(`[Image Warm] Skip cache dir: ${dirPath} (${error.message})`);
    return false;
  }
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShell(command) {
  return spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `$ErrorActionPreference='Stop'; ${command}`,
  ], {
    windowsHide: true,
    encoding: 'utf8',
  });
}

function canWriteDirectly(cacheRoot) {
  const testPath = path.join(cacheRoot, `.node-write-test-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(testPath, 'ok');
    fs.unlinkSync(testPath);
    return true;
  } catch {
    return false;
  }
}

function copyTempToTarget(tempPath, targetPath) {
  if (powerShellSpawnBlocked) {
    fs.appendFileSync(PENDING_COPY_MANIFEST, `${JSON.stringify({ tempPath, targetPath })}\n`);
    return false;
  }

  const result = runPowerShell(`Copy-Item -Force -LiteralPath ${quotePowerShell(tempPath)} -Destination ${quotePowerShell(targetPath)}`);
  if (result.status !== 0) {
    if (result.error?.code === 'EPERM') {
      powerShellSpawnBlocked = true;
      fs.appendFileSync(PENDING_COPY_MANIFEST, `${JSON.stringify({ tempPath, targetPath })}\n`);
      console.log(`[Image Warm] PowerShell spawn is blocked; pending copies are listed in ${PENDING_COPY_MANIFEST}`);
      return false;
    }
    console.log(`[Image Warm] Copy fallback failed: ${targetPath} (${result.stderr || result.error?.message || 'unknown error'})`);
  }
  return result.status === 0;
}

async function buildSharpPipeline(sourcePath, width, quality) {
  let targetWidth = width;
  let upscaled = false;
  if (IMAGE_UPSCALE_ENABLED) {
    try {
      const metadata = await sharp(sourcePath, { failOn: 'none', limitInputPixels: false }).metadata();
      const sourceWidth = metadata.width || width;
      if (sourceWidth < width) {
        targetWidth = Math.min(width, Math.max(1, Math.round(sourceWidth * IMAGE_UPSCALE_MAX_FACTOR)));
        upscaled = targetWidth > sourceWidth;
      }
    } catch {
      targetWidth = width;
    }
  }

  return sharp(sourcePath, { failOn: 'none', limitInputPixels: false })
    .rotate()
    .resize({
      width: targetWidth,
      fit: 'inside',
      withoutEnlargement: !IMAGE_UPSCALE_ENABLED,
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen(upscaled ? { sigma: 0.55, m1: 0.7, m2: 1.45 } : { sigma: 0.35, m1: 0.45, m2: 1.1 })
    .webp({
      quality,
      effort: 5,
      smartSubsample: true,
    });
}

async function optimizeImage(sourcePath, targetPath, width, quality) {
  if (isFreshOptimized(sourcePath, targetPath)) return 'fresh';
  if (!ensureDir(path.dirname(targetPath))) return 'skipped';

  try {
    const sourceStats = fs.statSync(sourcePath);
    if (usePowerShellCopy) {
      const tempPath = path.join(TEMP_OUTPUT_DIR, `${Date.now()}-${Math.random().toString(16).slice(2)}.webp`);
      const pipeline = await buildSharpPipeline(sourcePath, width, quality);
      await pipeline.toFile(tempPath);
      if (!copyTempToTarget(tempPath, targetPath)) return 'skipped';
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Temp cleanup is best-effort.
      }
      return 'created';
    }

    const pipeline = await buildSharpPipeline(sourcePath, width, quality);
    await pipeline.toFile(targetPath);
    try {
      fs.utimesSync(targetPath, sourceStats.atime, sourceStats.mtime);
    } catch {
      // Freshness still works because the generated file is newer than the source.
    }
    return 'created';
  } catch (error) {
    if (!usePowerShellCopy && error && String(error.message || '').toLowerCase().includes('permission denied')) {
      usePowerShellCopy = true;
      return optimizeImage(sourcePath, targetPath, width, quality);
    }
    console.log(`[Image Warm] Skip image: ${sourcePath} (${error.message})`);
    return 'skipped';
  }
}

async function warmProduct(product, dataDir, cacheRoot, stats) {
  const productDir = product.sourceDir || path.join(dataDir, product.week, product.code);
  const sources = readImageSources(productDir);

  if (sources.length === 0) {
    stats.missing += 1;
    return;
  }

  for (const width of MAIN_WIDTHS) {
    const result = await optimizeImage(sources[0], mainCachePath(cacheRoot, product.week, product.code, width), width, MAIN_QUALITY);
    if (result === 'created') stats.mainCreated += 1;
    if (result === 'fresh') stats.mainFresh += 1;
    if (result === 'skipped') stats.skipped += 1;
  }

  const detailSources = sources.filter((sourcePath) => !isFolderPreviewImage(sourcePath)).slice(0, DETAIL_IMAGE_WARM_COUNT);
  for (const detailSource of detailSources) {
    for (const width of DETAIL_WIDTHS) {
      const result = await optimizeImage(detailSource, detailCachePath(cacheRoot, product.week, product.code, detailSource, width), width, DETAIL_QUALITY);
      if (result === 'created') stats.detailCreated += 1;
      if (result === 'fresh') stats.detailFresh += 1;
      if (result === 'skipped') stats.skipped += 1;
    }
  }
}

async function runWithWorkers(items, workerCount, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(workerCount, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function warmImageCache() {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const dataDir = getDataDir();
  const cacheRoot = getCacheRoot();
  const products = mergeProducts(readProducts(dataDir), readProductFolders(dataDir)).slice(0, MAIN_CACHE_LIMIT);
  const stats = {
    mainCreated: 0,
    mainFresh: 0,
    detailCreated: 0,
    detailFresh: 0,
    missing: 0,
    skipped: 0,
  };

  if (!ensureDir(path.join(cacheRoot, 'main')) || !ensureDir(path.join(cacheRoot, 'detail'))) {
    return;
  }

  writeStatus(cacheRoot, {
    status: 'running',
    startedAt: startedAtIso,
    dataDir,
    cacheRoot,
    productCount: products.length,
    mainWidths: MAIN_WIDTHS,
    detailWidths: DETAIL_WIDTHS,
    mainQuality: MAIN_QUALITY,
    detailQuality: DETAIL_QUALITY,
    imageUpscale: IMAGE_UPSCALE_ENABLED,
    imageUpscaleMaxFactor: IMAGE_UPSCALE_MAX_FACTOR,
    detailImageWarmCount: DETAIL_IMAGE_WARM_COUNT,
    workerCount: WORKER_COUNT,
    stats,
  });

  usePowerShellCopy = !canWriteDirectly(cacheRoot);
  if (usePowerShellCopy) {
    console.log('[Image Warm] Node direct writes are blocked; using PowerShell copy fallback.');
  }

  await runWithWorkers(products, WORKER_COUNT, (product) => warmProduct(product, dataDir, cacheRoot, stats));

  const elapsed = Date.now() - startedAt;
  console.log(`[Image Warm] data=${dataDir}`);
  console.log(`[Image Warm] cache=${cacheRoot}`);
  console.log(`[Image Warm] products=${products.length}, mainCreated=${stats.mainCreated}, mainFresh=${stats.mainFresh}, detailCreated=${stats.detailCreated}, detailFresh=${stats.detailFresh}, missing=${stats.missing}, skipped=${stats.skipped}, elapsed=${elapsed}ms`);
  console.log(`[Image Warm] mainWidths=${MAIN_WIDTHS.join(',')}, detailWidths=${DETAIL_WIDTHS.join(',')}, mainQuality=${MAIN_QUALITY}, detailQuality=${DETAIL_QUALITY}`);
  console.log(`[Image Warm] imageUpscale=${IMAGE_UPSCALE_ENABLED ? 'YES' : 'NO'}, maxFactor=${IMAGE_UPSCALE_MAX_FACTOR}`);
  if (fs.existsSync(PENDING_COPY_MANIFEST)) {
    console.log(`[Image Warm] pendingCopyManifest=${PENDING_COPY_MANIFEST}`);
  }

  writeStatus(cacheRoot, {
    status: 'completed',
    startedAt: startedAtIso,
    completedAt: new Date().toISOString(),
    elapsedMs: elapsed,
    dataDir,
    cacheRoot,
    productCount: products.length,
    mainWidths: MAIN_WIDTHS,
    detailWidths: DETAIL_WIDTHS,
    mainQuality: MAIN_QUALITY,
    detailQuality: DETAIL_QUALITY,
    imageUpscale: IMAGE_UPSCALE_ENABLED,
    imageUpscaleMaxFactor: IMAGE_UPSCALE_MAX_FACTOR,
    detailImageWarmCount: DETAIL_IMAGE_WARM_COUNT,
    workerCount: WORKER_COUNT,
    stats,
    pendingCopyManifest: fs.existsSync(PENDING_COPY_MANIFEST) ? PENDING_COPY_MANIFEST : '',
  });
}

warmImageCache().catch((error) => {
  console.error('[Image Warm] Failed:', error.message);
  try {
    const cacheRoot = getCacheRoot();
    writeStatus(cacheRoot, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      dataDir: getDataDir(),
      cacheRoot,
      error: error.message,
    });
  } catch {
    // Status write failure should not hide the original error.
  }
  process.exitCode = 1;
});
