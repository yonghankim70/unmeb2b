const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const CWD = process.cwd();

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

const ENV = { ...process.env, ...readEnvFile() };
const MODE = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const SYNC_IMAGES = process.argv.includes('--images') || process.argv.includes('--all');
const SYNC_D1 = process.argv.includes('--d1') || process.argv.includes('--all');
const IMAGE_LIMIT = Number.parseInt(ENV.CF_SYNC_IMAGE_LIMIT || '', 10);
const ALLOW_FULL_D1_SYNC = ENV.ALLOW_CLOUDFLARE_FULL_SYNC === 'YES';

function required(keys) {
  const missing = keys.filter((key) => !ENV[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment values: ${missing.join(', ')}`);
  }
}

function getDataDir() {
  return path.resolve(ENV.B2B_DATA_DIR || path.join(CWD, 'data', 'pddb_dev'));
}

function getSqlitePath() {
  return path.join(getDataDir(), 'pddb.sqlite');
}

function getCacheRoot() {
  return path.resolve(ENV.B2B_IMAGE_CACHE_DIR || path.join(CWD, 'public', 'image-cache'));
}

function assertFullD1SyncAllowed() {
  if (MODE === 'apply' && SYNC_D1 && !ALLOW_FULL_D1_SYNC) {
    throw new Error(
      'D1 전체 덮어쓰기 동기화는 기본 차단되어 있습니다. 정말 필요한 경우에만 ALLOW_CLOUDFLARE_FULL_SYNC=YES 를 지정하고 다시 실행하세요.'
    );
  }
}

function listWebpFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.webp')) {
        files.push(fullPath);
      }
    }
  };
  walk(dir);
  return files;
}

function listDetailImageNames(week, code) {
  const productDir = path.join(getDataDir(), String(week || ''), String(code || ''));
  if (!fs.existsSync(productDir)) return [];
  return fs.readdirSync(productDir)
    .filter((fileName) => {
      const normalized = fileName.toLowerCase();
      if (normalized === 'folder.jpg' || normalized === 'folder.jpeg' || normalized === 'folder.png' || normalized === 'folder.webp') return false;
      return /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i.test(fileName);
    })
    .sort((a, b) => a.localeCompare(b, 'ko-KR', { numeric: true }));
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
  required(['CF_ACCOUNT_ID', 'CF_R2_BUCKET', 'CF_R2_ACCESS_KEY_ID', 'CF_R2_SECRET_ACCESS_KEY']);

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

  if (!response.ok) {
    throw new Error(`R2 upload failed ${response.status}: ${await response.text()}`);
  }
}

async function runD1(sql, params = []) {
  required(['CF_ACCOUNT_ID', 'CF_API_TOKEN', 'CF_D1_DATABASE_ID']);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ENV.CF_ACCOUNT_ID}/d1/database/${ENV.CF_D1_DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(`D1 query failed: ${JSON.stringify(data)}`);
  }
  return data;
}

function readSqliteData() {
  const sqlitePath = getSqlitePath();
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite DB not found: ${sqlitePath}`);
  }

  const db = new Database(sqlitePath, { readonly: true });
  try {
    return {
      products: db.prepare('SELECT * FROM products').all(),
      customers: db.prepare('SELECT * FROM customers').all(),
      orders: db.prepare('SELECT * FROM orders').all(),
      payments: db.prepare('SELECT * FROM payments').all(),
      cartSnapshots: db.prepare('SELECT * FROM cart_snapshots').all(),
      categories: db.prepare('SELECT * FROM categories').all(),
      items: db.prepare('SELECT * FROM items').all(),
      colors: db.prepare('SELECT * FROM colors').all(),
      globalSettings: db.prepare('SELECT * FROM global_settings').all(),
    };
  } finally {
    db.close();
  }
}

async function syncD1(data) {
  assertFullD1SyncAllowed();

  await runD1(`
    CREATE TABLE IF NOT EXISTS products (
      code TEXT PRIMARY KEY,
      week TEXT,
      name TEXT,
      category TEXT,
      item TEXT,
      color TEXT,
      price REAL,
      exposure TEXT,
      owner_cart_visible TEXT,
      payload TEXT,
      updated_at TEXT
    )
  `);
  await runD1(`
    CREATE TABLE IF NOT EXISTS customers (
      name TEXT PRIMARY KEY,
      grade TEXT,
      owner_cart_allowed TEXT,
      login_blocked TEXT,
      payload TEXT,
      updated_at TEXT
    )
  `);
  await runD1(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT,
      product_code TEXT,
      color TEXT,
      quantity REAL,
      amount REAL,
      order_at TEXT,
      payload TEXT,
      updated_at TEXT
    )
  `);
  await runD1('CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, customer_name TEXT, payment_at TEXT, amount REAL, payload TEXT, updated_at TEXT)');
  await runD1('CREATE TABLE IF NOT EXISTS cart_snapshots (customerName TEXT, productCode TEXT, color TEXT, quantity INTEGER, category TEXT, updatedAt TEXT, PRIMARY KEY (customerName, productCode, color))');
  await runD1('CREATE TABLE IF NOT EXISTS categories (name TEXT PRIMARY KEY, payload TEXT, updated_at TEXT)');
  await runD1('CREATE TABLE IF NOT EXISTS items (name TEXT PRIMARY KEY, payload TEXT, updated_at TEXT)');
  await runD1('CREATE TABLE IF NOT EXISTS colors (name TEXT PRIMARY KEY, payload TEXT, updated_at TEXT)');
  await runD1('CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');

  const now = new Date().toISOString();
  await runD1('DELETE FROM products');
  await runD1('DELETE FROM customers');
  await runD1('DELETE FROM orders');
  await runD1('DELETE FROM payments');
  await runD1('DELETE FROM cart_snapshots');
  await runD1('DELETE FROM categories');
  await runD1('DELETE FROM items');
  await runD1('DELETE FROM colors');
  await runD1('DELETE FROM global_settings');

  for (const product of data.products) {
    const productPayload = {
      ...product,
      상세이미지목록: listDetailImageNames(product.주차, product.임시코드 || product.상품명 || ''),
    };
    await runD1(
      `INSERT OR REPLACE INTO products (code, week, name, category, item, color, price, exposure, owner_cart_visible, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.임시코드 || product.상품명 || '',
        product.주차 || '',
        product.상품명 || '',
        product.카테고리 || '',
        product.아이템 || '',
        product.컬러 || '',
        Number(product.도매가 || 0),
        product.노출여부 || '',
        product.쥔장장바구니노출 || 'y',
        JSON.stringify(productPayload),
        now,
      ]
    );
  }

  for (const customer of data.customers) {
    await runD1(
      `INSERT OR REPLACE INTO customers (name, grade, owner_cart_allowed, login_blocked, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        customer.거래처명 || '',
        customer.거래처등급 || '',
        customer.쥔장장바구니허락 || 'n',
        customer.로그인차단 || 'n',
        JSON.stringify(customer),
        now,
      ]
    );
  }

  for (const order of data.orders) {
    await runD1(
      `INSERT OR REPLACE INTO orders (id, customer_name, product_code, color, quantity, amount, order_at, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(order.id || `${order.주문일시}-${order.거래처명}-${order.상품코드}-${order.컬러}`),
        order.거래처명 || '',
        order.상품코드 || '',
        order.컬러 || '',
        Number(order.수량 || 0),
        Number(order.금액 || 0),
        order.주문일시 || '',
        JSON.stringify(order),
        now,
      ]
    );
  }

  for (const [index, payment] of data.payments.entries()) {
    await runD1(
      `INSERT OR REPLACE INTO payments (id, customer_name, payment_at, amount, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `${payment.입금일자 || ''}-${payment.거래처명 || ''}-${payment.입금금액 || 0}-${index}`,
        payment.거래처명 || '',
        payment.입금일자 || '',
        Number(payment.입금금액 || 0),
        JSON.stringify(payment),
        now,
      ]
    );
  }

  for (const snapshot of data.cartSnapshots) {
    await runD1(
      `INSERT OR REPLACE INTO cart_snapshots (customerName, productCode, color, quantity, category, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        snapshot.customerName || '',
        snapshot.productCode || '',
        snapshot.color || '',
        Number(snapshot.quantity || 0),
        snapshot.category || '',
        snapshot.updatedAt || now,
      ]
    );
  }

  for (const category of data.categories) {
    await runD1('INSERT OR REPLACE INTO categories (name, payload, updated_at) VALUES (?, ?, ?)', [
      category.카테고리 || '',
      JSON.stringify(category),
      now,
    ]);
  }

  for (const item of data.items) {
    await runD1('INSERT OR REPLACE INTO items (name, payload, updated_at) VALUES (?, ?, ?)', [
      item.아이템 || '',
      JSON.stringify(item),
      now,
    ]);
  }

  for (const color of data.colors) {
    await runD1('INSERT OR REPLACE INTO colors (name, payload, updated_at) VALUES (?, ?, ?)', [
      color.컬러 || '',
      JSON.stringify(color),
      now,
    ]);
  }

  for (const setting of data.globalSettings) {
    await runD1('INSERT OR REPLACE INTO global_settings (key, value, updated_at) VALUES (?, ?, ?)', [
      setting.key || '',
      setting.value || '',
      now,
    ]);
  }
}

async function syncImages(webpFiles) {
  const cacheRoot = getCacheRoot();
  const targetFiles = Number.isFinite(IMAGE_LIMIT) && IMAGE_LIMIT > 0
    ? webpFiles.slice(0, IMAGE_LIMIT)
    : webpFiles;
  for (const filePath of targetFiles) {
    const relative = path.relative(cacheRoot, filePath).replace(/\\/g, '/');
    const key = `image-cache/${relative}`;
    await putR2Object(key, fs.readFileSync(filePath), 'image/webp');
  }
  return targetFiles.length;
}

async function main() {
  const data = readSqliteData();
  const webpFiles = listWebpFiles(getCacheRoot());

  console.log(`[Cloudflare Sync] mode=${MODE}`);
  console.log(`[Cloudflare Sync] sqlite=${getSqlitePath()}`);
  console.log(`[Cloudflare Sync] products=${data.products.length}, customers=${data.customers.length}, orders=${data.orders.length}`);
  console.log(`[Cloudflare Sync] categories=${data.categories.length}, items=${data.items.length}, colors=${data.colors.length}, payments=${data.payments.length}, carts=${data.cartSnapshots.length}`);
  console.log(`[Cloudflare Sync] webpFiles=${webpFiles.length}`);
  if (Number.isFinite(IMAGE_LIMIT) && IMAGE_LIMIT > 0) {
    console.log(`[Cloudflare Sync] image upload limit=${IMAGE_LIMIT}`);
  }

  if (MODE !== 'apply') {
    console.log('[Cloudflare Sync] Dry run only. Use --apply --images, --apply --d1, or --apply --all to upload.');
    return;
  }

  if (SYNC_IMAGES) {
    const uploadedCount = await syncImages(webpFiles);
    console.log(`[Cloudflare Sync] R2 images uploaded: ${uploadedCount}`);
  }

  if (SYNC_D1) {
    await syncD1(data);
    console.log('[Cloudflare Sync] D1 data synced.');
  }

  if (!SYNC_IMAGES && !SYNC_D1) {
    console.log('[Cloudflare Sync] Nothing selected. Add --images, --d1, or --all.');
  }
}

main().catch((error) => {
  console.error('[Cloudflare Sync] Failed:', error.message);
  process.exitCode = 1;
});
