import {
  CartSnapshotItem,
  CategoryMaster,
  ColorMaster,
  Customer,
  CustomerOrder,
  formatProduct,
  GlobalSettings,
  ItemMaster,
  PaymentLog,
  Product,
  readGlobalSettings,
} from '@/lib/db';
import { batchD1, isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';

export interface CloudMasterData {
  customers: Customer[];
  products: Product[];
  items: ItemMaster[];
  colors: ColorMaster[];
  categories: CategoryMaster[];
}

const DEFAULT_SETTINGS: GlobalSettings = {
  exchange: 230,
  logistics: 1200,
  margin: 1.3,
  sRatio: 0.85,
  aRatio: 0.89,
  bRatio: 0.93,
  cRatio: 0.97,
  wRatio: 0.89,
  showCategoriesOnMain: true,
  visibleColumns: [],
  columnWidths: {},
  pointOptions: ['오더만', '공동구매', '세일', '품절'],
  seasonOptions: ['26SM', '26FA', '26WT'],
  defaultSeason: '26SM',
  customerGradeOptions: ['S', 'A', 'B', 'C', 'W', '일반등급'],
  migratedGradeExclude: false,
  migratedGradeExcludeABC: false,
  migratedOwnerCartVisible: false,
  columnOrder: [],
};

type PayloadRow = { payload?: string };
type CustomerPayloadRow = PayloadRow & {
  name?: string;
  grade?: string;
  owner_cart_allowed?: string;
  login_blocked?: string;
};
type PaymentPayloadRow = PayloadRow & {
  id?: string;
  customer_name?: string;
  payment_at?: string;
  amount?: number;
};
type OrderPayloadRow = PayloadRow & {
  customer_name?: string;
  product_code?: string;
  color?: string;
  size?: string;
  quantity?: number;
  amount?: number;
  order_at?: string;
};
type NamedPayloadRow = PayloadRow & { name?: string };
type SettingRow = { key: string; value: string };
type D1WriteQuery = { sql: string; params?: unknown[] };

const PRODUCT_INSERT_COLUMNS = [
  'code',
  'week',
  'name',
  'category',
  'item',
  'color',
  'price',
  'exposure',
  'owner_cart_visible',
  'payload',
  'updated_at',
] as const;

const CUSTOMER_INSERT_COLUMNS = ['name', 'grade', 'owner_cart_allowed', 'login_blocked', 'payload', 'updated_at'] as const;
const ORDER_INSERT_COLUMNS = ['id', 'customer_name', 'product_code', 'color', 'size', 'quantity', 'amount', 'order_at', 'payload', 'updated_at'] as const;
const PAYMENT_INSERT_COLUMNS = ['id', 'customer_name', 'payment_at', 'amount', 'payload', 'updated_at'] as const;
const CART_INSERT_COLUMNS = ['customerName', 'productCode', 'color', 'size', 'quantity', 'category', 'updatedAt'] as const;
const MAX_D1_SQL_VARIABLES_PER_STATEMENT = 90;
const MAX_D1_SQL_VARIABLES_PER_BATCH = 360;
const MAX_D1_STATEMENTS_PER_BATCH = 8;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function valuesPlaceholders(rowCount: number, columnCount: number): string {
  const row = `(${Array.from({ length: columnCount }, () => '?').join(', ')})`;
  return Array.from({ length: rowCount }, () => row).join(', ');
}

function maxRowsPerInsert(columnCount: number): number {
  return Math.max(1, Math.floor(MAX_D1_SQL_VARIABLES_PER_STATEMENT / columnCount));
}

function chunkRowsForInsert<T>(rows: T[], columnCount: number): T[][] {
  return chunkArray(rows, maxRowsPerInsert(columnCount));
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function countQueryParams(query: D1WriteQuery): number {
  return Array.isArray(query.params) ? query.params.length : 0;
}

function chunkD1WriteQueries(queries: D1WriteQuery[]): D1WriteQuery[][] {
  const chunks: D1WriteQuery[][] = [];
  let current: D1WriteQuery[] = [];
  let currentParamCount = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current);
    current = [];
    currentParamCount = 0;
  };

  for (const query of queries) {
    const paramCount = countQueryParams(query);
    const wouldExceedParams = current.length > 0 && currentParamCount + paramCount > MAX_D1_SQL_VARIABLES_PER_BATCH;
    const wouldExceedStatements = current.length >= MAX_D1_STATEMENTS_PER_BATCH;

    if (wouldExceedParams || wouldExceedStatements) {
      flush();
    }

    current.push(query);
    currentParamCount += paramCount;
  }

  flush();
  return chunks;
}

async function runWriteBatch(queries: D1WriteQuery[]): Promise<void> {
  for (const chunk of chunkD1WriteQueries(queries)) {
    await batchD1(chunk);
  }
}

function parsePayload<T>(row: PayloadRow, fallback: T): T {
  if (!row.payload) return fallback;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return fallback;
  }
}

function productCode(product: Product): string {
  return String(product.임시코드 || product.상품명 || '').trim();
}

function customerName(customer: Customer): string {
  return String(customer.거래처명 || '').trim();
}

function normalizeCustomer(customer: Customer, row?: CustomerPayloadRow): Customer {
  return {
    ...customer,
    거래처명: customerName(customer) || String(row?.name || '').trim(),
    접속코드: customer.접속코드 || '',
    거래처등급: customer.거래처등급 || row?.grade || 'C',
    텔레그램ID: customer.텔레그램ID || '',
    결제방식: customer.결제방식 || '당일결제',
    세금계산서발행: customer.세금계산서발행 || '미발행',
    로그인차단: customer.로그인차단 || row?.login_blocked || 'n',
    쥔장장바구니허락: customer.쥔장장바구니허락 || row?.owner_cart_allowed || 'n',
    최근접속일: customer.최근접속일 || '',
  };
}

function orderKeyParts(order: CustomerOrder): string[] {
  return [
    order.주문일시 || '',
    order.거래처명 || '',
    order.상품코드 || '',
    order.컬러 || '',
    order.사이즈 || '',
  ].map((value) => String(value).trim());
}

function orderId(order: CustomerOrder, index = 0): string {
  const stableParts = [
    order.주문번호 || '',
    ...orderKeyParts(order),
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return stableParts.length > 0 ? stableParts.join('|') : `order-${index}`;
}

function normalizeOrder(order: CustomerOrder, row?: OrderPayloadRow): CustomerOrder {
  return {
    ...order,
    주문일시: order.주문일시 || row?.order_at || '',
    거래처명: order.거래처명 || row?.customer_name || '',
    상품코드: order.상품코드 || row?.product_code || '',
    컬러: order.컬러 || row?.color || '',
    사이즈: order.사이즈 || row?.size || '',
    수량: Number(order.수량 || row?.quantity || 0),
    금액: order.금액 === undefined ? Number(row?.amount || 0) : Number(order.금액 || 0),
  };
}

function paymentId(payment: PaymentLog, index = 0): string {
  if (payment.id) return String(payment.id).trim();
  return [
    payment.입금일자 || '',
    payment.거래처명 || '',
    payment.입금금액 || 0,
    payment.입금방식 || '',
    payment.입금자 || '',
    payment.비고 || '',
    index,
  ].map((value) => String(value).trim()).join('|');
}

function normalizePayment(payment: PaymentLog, row?: PaymentPayloadRow): PaymentLog {
  return {
    ...payment,
    id: payment.id || row?.id || paymentId(payment),
    입금일자: payment.입금일자 || row?.payment_at || '',
    거래처명: payment.거래처명 || row?.customer_name || '',
    입금금액: Number(payment.입금금액 || row?.amount || 0),
    입금방식: payment.입금방식 || '',
    입금자: payment.입금자 || '',
    비고: payment.비고 || '',
  };
}

function normalizeCategory(category: CategoryMaster, row?: NamedPayloadRow): CategoryMaster {
  return {
    ...category,
    카테고리: String(category.카테고리 || row?.name || '').trim(),
    등급: category.등급 || 'C',
    환율: Number(category.환율 || 0),
    물류비: Number(category.물류비 || 0),
    마진율: category.마진율,
    S등급비율: category.S등급비율,
    A등급비율: category.A등급비율,
    B등급비율: category.B등급비율,
    C등급비율: category.C등급비율,
    W등급비율: category.W등급비율,
  };
}

function normalizeItem(item: ItemMaster, row?: NamedPayloadRow): ItemMaster {
  return {
    ...item,
    아이템: String(item.아이템 || row?.name || '').trim(),
    표기: item.표기 || '',
  };
}

function normalizeColor(color: ColorMaster, row?: NamedPayloadRow): ColorMaster {
  return {
    ...color,
    컬러: String(color.컬러 || row?.name || '').trim(),
    표기컬러: color.표기컬러 || '',
  };
}

let ensureCloudSchemaPromise: Promise<void> | null = null;

async function runEnsureCloudSchema(): Promise<void> {
  await batchD1([
    {
      sql: `CREATE TABLE IF NOT EXISTS products (
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
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS customers (
        name TEXT PRIMARY KEY,
        grade TEXT,
        owner_cart_allowed TEXT,
        login_blocked TEXT,
        payload TEXT,
        updated_at TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_name TEXT,
        product_code TEXT,
        color TEXT,
        size TEXT,
        quantity INTEGER,
        amount REAL,
        order_at TEXT,
        payload TEXT,
        updated_at TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS categories (
        name TEXT PRIMARY KEY,
        payload TEXT,
        updated_at TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS items (
        name TEXT PRIMARY KEY,
        payload TEXT,
        updated_at TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS colors (
        name TEXT PRIMARY KEY,
        payload TEXT,
        updated_at TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS global_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        customer_name TEXT,
        payment_at TEXT,
        amount REAL,
        payload TEXT,
        updated_at TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS cart_snapshots (
        customerName TEXT,
        productCode TEXT,
        color TEXT,
        quantity INTEGER,
        category TEXT,
        updatedAt TEXT,
        PRIMARY KEY (customerName, productCode, color)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS cart_snapshots_v2 (
        customerName TEXT,
        productCode TEXT,
        color TEXT,
        size TEXT,
        quantity INTEGER,
        category TEXT,
        updatedAt TEXT,
        PRIMARY KEY (customerName, productCode, color, size)
      )`,
    },
  ]);

  const orderColumns = await queryD1<{ name?: string }>('PRAGMA table_info(orders)');
  if (!orderColumns.some((column) => String(column.name || '').toLowerCase() === 'size')) {
    await queryD1('ALTER TABLE orders ADD COLUMN size TEXT');
  }

  await queryD1(`
    INSERT OR IGNORE INTO cart_snapshots_v2 (customerName, productCode, color, size, quantity, category, updatedAt)
    SELECT customerName, productCode, color, '', quantity, category, updatedAt FROM cart_snapshots
  `);
}

export async function ensureCloudSchema(): Promise<void> {
  if (!ensureCloudSchemaPromise) {
    ensureCloudSchemaPromise = runEnsureCloudSchema().catch((error) => {
      ensureCloudSchemaPromise = null;
      throw error;
    });
  }

  await ensureCloudSchemaPromise;
}

export async function readCloudProducts(): Promise<Product[]> {
  await ensureCloudSchema();
  const rows = await queryD1<PayloadRow>('SELECT payload FROM products ORDER BY week DESC, code ASC');
  return rows.map((row) => formatProduct(parsePayload(row, {})));
}

export async function writeCloudProducts(products: Product[], replaceAll = false): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [];
  if (replaceAll) {
    if (process.env.ALLOW_CLOUD_REPLACE_ALL_PRODUCTS !== 'true') {
      throw new Error('운영 D1 상품 전체 덮어쓰기는 차단되어 있습니다. 수정/추가 상품만 부분 반영해야 합니다.');
    }

    const existingCountRows = await queryD1<{ count: number }>('SELECT COUNT(*) as count FROM products');
    const existingCount = Number(existingCountRows[0]?.count || 0);
    if (existingCount > 0 && products.length < Math.ceil(existingCount * 0.8)) {
      throw new Error(`상품 전체 덮어쓰기가 차단되었습니다. 기존 ${existingCount}개에서 ${products.length}개로 줄어드는 저장입니다.`);
    }

    queries.push({ sql: 'DELETE FROM products' });
  }
  const now = new Date().toISOString();
  const rows = products.reduce<unknown[][]>((acc, product) => {
    const code = productCode(product);
    if (!code) return acc;
    const hasUnitPrice = Number(product.단가 || 0) > 0;
    acc.push([
        code,
        product.주차 || '',
        product.상품명 || code,
        product.카테고리 || '',
        product.아이템 || '',
        product.컬러 || '',
        hasUnitPrice ? Number(product.도매가 || product.단가 || 0) : 0,
        product.노출여부 || '',
        product.쥔장장바구니노출 || 'y',
        JSON.stringify(product),
        now,
    ]);
    return acc;
  }, []);

  for (const chunk of chunkRowsForInsert(rows, PRODUCT_INSERT_COLUMNS.length)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO products (${PRODUCT_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, PRODUCT_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function deleteCloudProducts(productCodes: string[]): Promise<void> {
  await ensureCloudSchema();

  const codes = uniqueNonEmpty(productCodes);
  const queries: D1WriteQuery[] = [];
  for (const chunk of chunkArray(codes, 80)) {
    queries.push({
      sql: `DELETE FROM products WHERE code IN (${chunk.map(() => '?').join(', ')})`,
      params: chunk,
    });
  }
  await runWriteBatch(queries);
}

export async function readCloudCustomers(): Promise<Customer[]> {
  await ensureCloudSchema();
  const rows = await queryD1<CustomerPayloadRow>(
    'SELECT name, grade, owner_cart_allowed, login_blocked, payload FROM customers ORDER BY name ASC'
  );
  return rows.map((row) => {
    const customer = parsePayload<Customer>(row, {} as Customer);
    return normalizeCustomer(customer, row);
  }).filter((customer) => customerName(customer));
}

export async function writeCloudCustomers(customers: Customer[], replaceAll = false): Promise<void> {
  await ensureCloudSchema();
  if (replaceAll) {
    if (process.env.ALLOW_CLOUD_REPLACE_ALL_CUSTOMERS !== 'true') {
      throw new Error('운영 D1 거래처 전체 덮어쓰기는 차단되어 있습니다. 수정/추가 거래처만 부분 반영해야 합니다.');
    }

    const existingCountRows = await queryD1<{ count: number }>('SELECT COUNT(*) as count FROM customers');
    const existingCount = Number(existingCountRows[0]?.count || 0);
    if (existingCount >= 8 && customers.length <= Math.floor(existingCount * 0.6) && existingCount - customers.length >= 5) {
      throw new Error(`거래처 저장이 차단되었습니다. 기존 ${existingCount}개에서 ${customers.length}개로 급감하는 전체 덮어쓰기입니다.`);
    }
  }
  const queries: D1WriteQuery[] = [];
  if (replaceAll) {
    queries.push({ sql: 'DELETE FROM customers' });
  }
  const now = new Date().toISOString();
  const rows = customers.reduce<unknown[][]>((acc, customer) => {
    const normalized = normalizeCustomer(customer);
    const name = customerName(normalized);
    if (!name) return acc;
    acc.push([
        name,
        normalized.거래처등급 || '',
        normalized.쥔장장바구니허락 || 'n',
        normalized.로그인차단 || 'n',
        JSON.stringify(normalized),
        now,
    ]);
    return acc;
  }, []);

  for (const chunk of chunkRowsForInsert(rows, CUSTOMER_INSERT_COLUMNS.length)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO customers (${CUSTOMER_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, CUSTOMER_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function deleteCloudCustomers(customerNames: string[]): Promise<void> {
  await ensureCloudSchema();

  const names = uniqueNonEmpty(customerNames);
  const queries: D1WriteQuery[] = [];
  for (const chunk of chunkArray(names, 80)) {
    queries.push({
      sql: `DELETE FROM customers WHERE name IN (${chunk.map(() => '?').join(', ')})`,
      params: chunk,
    });
  }

  await runWriteBatch(queries);
}

export async function readCloudOrders(): Promise<CustomerOrder[]> {
  await ensureCloudSchema();
  const rows = await queryD1<OrderPayloadRow>(
    'SELECT customer_name, product_code, color, size, quantity, amount, order_at, payload FROM orders ORDER BY order_at ASC, id ASC'
  );
  return rows
    .map((row) => normalizeOrder(parsePayload<CustomerOrder>(row, {} as CustomerOrder), row))
    .filter((order) => order.주문일시 || order.거래처명 || order.상품코드);
}

export async function writeCloudOrders(orders: CustomerOrder[], replaceAll = false): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [];
  if (replaceAll) {
    if (process.env.ALLOW_CLOUD_REPLACE_ALL_ORDERS !== 'true') {
      throw new Error('운영 D1 주문 전체 덮어쓰기는 차단되어 있습니다. 주문 수정/삭제는 변경분으로 반영해야 합니다.');
    }
    queries.push({ sql: 'DELETE FROM orders' });
  } else {
    const touchedKeys = new Set<string>();
    orders.forEach((order) => {
      const [orderAt, customerNameValue, productCode, color, size] = orderKeyParts(order);
      const key = [orderAt, customerNameValue, productCode, color, size].join('|');
      if (!orderAt || !customerNameValue || !productCode || touchedKeys.has(key)) return;
      touchedKeys.add(key);
      queries.push({
        sql: 'DELETE FROM orders WHERE order_at = ? AND customer_name = ? AND product_code = ? AND color = ? AND COALESCE(size, ?) = ?',
        params: [orderAt, customerNameValue, productCode, color, size, size],
      });
    });
  }
  const now = new Date().toISOString();
  const rows = orders.map((order, index) => {
    const id = orderId(order, index);
    return [
        id,
        order.거래처명 || '',
        order.상품코드 || '',
        order.컬러 || '',
        order.사이즈 || '',
        Number(order.수량 || 0),
        Number(order.금액 || 0),
        order.주문일시 || '',
        JSON.stringify(order),
        now,
      ];
  });

  for (const chunk of chunkRowsForInsert(rows, ORDER_INSERT_COLUMNS.length)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO orders (${ORDER_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, ORDER_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function deleteCloudOrdersByKeys(orderKeys: string[]): Promise<void> {
  await ensureCloudSchema();
  const keys = uniqueNonEmpty(orderKeys);
  const queries = keys.reduce<D1WriteQuery[]>((acc, key) => {
    const [orderAt, customerNameValue, productCode, color, size = ''] = key.split('|');
    if (!orderAt || !customerNameValue || !productCode) return acc;
    acc.push({
      sql: 'DELETE FROM orders WHERE order_at = ? AND customer_name = ? AND product_code = ? AND color = ? AND COALESCE(size, ?) = ?',
      params: [orderAt, customerNameValue, productCode, color || '', size, size],
    });
    return acc;
  }, []);

  await runWriteBatch(queries);
}

export async function readCloudOrdersByCustomer(customerName: string): Promise<CustomerOrder[]> {
  const normalized = customerName.trim().toLowerCase();
  const orders = await readCloudOrders();
  return orders.filter((order) => String(order.거래처명 || '').trim().toLowerCase() === normalized);
}

export async function readCloudPayments(): Promise<PaymentLog[]> {
  await ensureCloudSchema();
  const rows = await queryD1<PaymentPayloadRow>(
    'SELECT id, customer_name, payment_at, amount, payload FROM payments ORDER BY payment_at ASC, id ASC'
  );
  return rows.map((row) => normalizePayment(parsePayload<PaymentLog>(row, {} as PaymentLog), row));
}

export async function writeCloudPayments(payments: PaymentLog[], replaceAll = false): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [];
  if (replaceAll) {
    if (process.env.ALLOW_CLOUD_REPLACE_ALL_PAYMENTS !== 'true') {
      throw new Error('운영 D1 입금 내역 전체 덮어쓰기는 차단되어 있습니다. 입금 추가/삭제는 단건으로 반영해야 합니다.');
    }
    queries.push({ sql: 'DELETE FROM payments' });
  }

  const now = new Date().toISOString();
  const rows = payments.map((payment, index) => {
    const normalized = normalizePayment(payment);
    const id = paymentId(normalized, index);
    return [
        id,
        normalized.거래처명 || '',
        normalized.입금일자 || '',
        Number(normalized.입금금액 || 0),
        JSON.stringify({ ...normalized, id }),
        now,
      ];
  });

  for (const chunk of chunkRowsForInsert(rows, PAYMENT_INSERT_COLUMNS.length)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO payments (${PAYMENT_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, PAYMENT_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function writeCloudPayment(payment: PaymentLog): Promise<PaymentLog> {
  await ensureCloudSchema();
  const now = new Date().toISOString();
  const normalized = normalizePayment({
    ...payment,
    id: payment.id || `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  });

  await queryD1(
    `INSERT OR REPLACE INTO payments (${PAYMENT_INSERT_COLUMNS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      normalized.id || paymentId(normalized),
      normalized.거래처명 || '',
      normalized.입금일자 || '',
      Number(normalized.입금금액 || 0),
      JSON.stringify(normalized),
      now,
    ],
  );

  return normalized;
}

export async function deleteCloudPayment(paymentIdValue: string): Promise<void> {
  await ensureCloudSchema();
  const id = String(paymentIdValue || '').trim();
  if (!id) return;
  await queryD1('DELETE FROM payments WHERE id = ?', [id]);
}

export async function readCloudCartSnapshots(): Promise<CartSnapshotItem[]> {
  await ensureCloudSchema();
  return queryD1<CartSnapshotItem>('SELECT customerName, productCode, color, size, quantity, category, updatedAt FROM cart_snapshots_v2 ORDER BY updatedAt DESC');
}

export async function writeCloudCartSnapshot(customerName: string, items: Omit<CartSnapshotItem, 'customerName' | 'updatedAt'>[]): Promise<void> {
  await ensureCloudSchema();
  const trimmedCustomerName = customerName.trim();
  const updatedAt = new Date().toISOString();
  const queries: D1WriteQuery[] = [{ sql: 'DELETE FROM cart_snapshots_v2 WHERE customerName = ?', params: [trimmedCustomerName] }];
  const rows = items.reduce<unknown[][]>((acc, item) => {
    const productCode = String(item.productCode || '').trim();
    const color = String(item.color || '').trim();
    const size = String(item.size || '').trim();
    const quantity = Number(item.quantity || 0);
    if (!trimmedCustomerName || !productCode || quantity <= 0) return acc;
    acc.push([trimmedCustomerName, productCode, color, size, Math.trunc(quantity), item.category || '', updatedAt]);
    return acc;
  }, []);

  for (const chunk of chunkRowsForInsert(rows, CART_INSERT_COLUMNS.length)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO cart_snapshots_v2 (${CART_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, CART_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function clearCloudOrderedCartSnapshotItems(customerName: string, items: Array<{ productCode: string; color: string; size?: string }>): Promise<void> {
  await ensureCloudSchema();
  const trimmedCustomerName = customerName.trim();
  const queries = items.map((item) => ({
    sql: 'DELETE FROM cart_snapshots_v2 WHERE customerName = ? AND productCode = ? AND color = ? AND size = ?',
    params: [
      trimmedCustomerName,
      item.productCode,
      item.color,
      item.size || '',
    ],
  }));
  await runWriteBatch(queries);
}

export async function readCloudGlobalSettings(): Promise<GlobalSettings> {
  await ensureCloudSchema();
  const rows = await queryD1<SettingRow>("SELECT key, value FROM global_settings WHERE key = 'config'");
  if (!rows[0]?.value) {
    return isCloudDbEnabled() ? DEFAULT_SETTINGS : readGlobalSettings();
  }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].value) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeCloudGlobalSettings(settings: GlobalSettings): Promise<void> {
  await ensureCloudSchema();
  await queryD1(
    `INSERT OR REPLACE INTO global_settings (key, value, updated_at) VALUES ('config', ?, ?)`,
    [JSON.stringify(settings), new Date().toISOString()],
  );
}

export async function readCloudMasterData(): Promise<CloudMasterData> {
  await ensureCloudSchema();
  const [products, customers, items, colors, categories] = await Promise.all([
    readCloudProducts(),
    readCloudCustomers(),
    readCloudItems(),
    readCloudColors(),
    readCloudCategories(),
  ]);

  return {
    products,
    customers,
    items,
    colors,
    categories,
  };
}

export async function readCloudCategories(): Promise<CategoryMaster[]> {
  await ensureCloudSchema();
  const rows = await queryD1<NamedPayloadRow>('SELECT name, payload FROM categories ORDER BY name ASC');
  return rows
    .map((row) => normalizeCategory(parsePayload<CategoryMaster>(row, {} as CategoryMaster), row))
    .filter((category) => Boolean(category.카테고리));
}

export async function writeCloudCategories(categories: CategoryMaster[], replaceAll = false): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [];
  if (replaceAll) {
    if (process.env.ALLOW_CLOUD_REPLACE_ALL_MASTER_TABLES !== 'true') {
      throw new Error('운영 D1 카테고리 전체 덮어쓰기는 차단되어 있습니다. 수정/추가/삭제분만 반영해야 합니다.');
    }
    queries.push({ sql: 'DELETE FROM categories' });
  }

  const now = new Date().toISOString();
  const rows = categories
    .map((category) => normalizeCategory(category))
    .filter((category) => Boolean(category.카테고리))
    .map((category) => [category.카테고리, JSON.stringify(category), now]);
  for (const chunk of chunkRowsForInsert(rows, 3)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO categories (name, payload, updated_at) VALUES ${valuesPlaceholders(chunk.length, 3)}`,
      params: chunk.flat(),
    });
  }
  await runWriteBatch(queries);
}

export async function deleteCloudCategories(categoryNames: string[]): Promise<void> {
  await ensureCloudSchema();
  const names = uniqueNonEmpty(categoryNames);
  const queries: D1WriteQuery[] = [];
  for (const chunk of chunkArray(names, 80)) {
    queries.push({
      sql: `DELETE FROM categories WHERE name IN (${chunk.map(() => '?').join(', ')})`,
      params: chunk,
    });
  }
  await runWriteBatch(queries);
}

export async function readCloudItems(): Promise<ItemMaster[]> {
  await ensureCloudSchema();
  const rows = await queryD1<NamedPayloadRow>('SELECT name, payload FROM items ORDER BY name ASC');
  return rows
    .map((row) => normalizeItem(parsePayload<ItemMaster>(row, {} as ItemMaster), row))
    .filter((item) => Boolean(item.아이템));
}

export async function writeCloudItems(items: ItemMaster[], replaceAll = false): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [];
  if (replaceAll) {
    if (process.env.ALLOW_CLOUD_REPLACE_ALL_MASTER_TABLES !== 'true') {
      throw new Error('운영 D1 아이템 전체 덮어쓰기는 차단되어 있습니다. 수정/추가분만 반영해야 합니다.');
    }
    queries.push({ sql: 'DELETE FROM items' });
  }

  const now = new Date().toISOString();
  const rows = items
    .map((item) => normalizeItem(item))
    .filter((item) => Boolean(item.아이템))
    .map((item) => [item.아이템, JSON.stringify(item), now]);
  for (const chunk of chunkRowsForInsert(rows, 3)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO items (name, payload, updated_at) VALUES ${valuesPlaceholders(chunk.length, 3)}`,
      params: chunk.flat(),
    });
  }
  await runWriteBatch(queries);
}

export async function readCloudColors(): Promise<ColorMaster[]> {
  await ensureCloudSchema();
  const rows = await queryD1<NamedPayloadRow>('SELECT name, payload FROM colors ORDER BY name ASC');
  return rows
    .map((row) => normalizeColor(parsePayload<ColorMaster>(row, {} as ColorMaster), row))
    .filter((color) => Boolean(color.컬러));
}

export async function writeCloudColors(colors: ColorMaster[], replaceAll = false): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [];
  if (replaceAll) {
    if (process.env.ALLOW_CLOUD_REPLACE_ALL_MASTER_TABLES !== 'true') {
      throw new Error('운영 D1 컬러 전체 덮어쓰기는 차단되어 있습니다. 수정/추가분만 반영해야 합니다.');
    }
    queries.push({ sql: 'DELETE FROM colors' });
  }

  const now = new Date().toISOString();
  const rows = colors
    .map((color) => normalizeColor(color))
    .filter((color) => Boolean(color.컬러))
    .map((color) => [color.컬러, JSON.stringify(color), now]);
  for (const chunk of chunkRowsForInsert(rows, 3)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO colors (name, payload, updated_at) VALUES ${valuesPlaceholders(chunk.length, 3)}`,
      params: chunk.flat(),
    });
  }
  await runWriteBatch(queries);
}
