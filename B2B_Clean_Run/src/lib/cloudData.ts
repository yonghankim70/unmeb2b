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
const ORDER_INSERT_COLUMNS = ['id', 'customer_name', 'product_code', 'color', 'quantity', 'amount', 'order_at', 'payload', 'updated_at'] as const;
const PAYMENT_INSERT_COLUMNS = ['id', 'customer_name', 'payment_at', 'amount', 'payload', 'updated_at'] as const;
const CART_INSERT_COLUMNS = ['customerName', 'productCode', 'color', 'quantity', 'category', 'updatedAt'] as const;

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

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

async function runWriteBatch(queries: D1WriteQuery[], chunkSize = 20): Promise<void> {
  for (const chunk of chunkArray(queries, chunkSize)) {
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

function orderId(order: CustomerOrder, index = 0): string {
  return String(order.주문번호 || `${order.주문일시}-${order.거래처명}-${order.상품코드}-${order.컬러}-${index}`);
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
  ]);
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
    queries.push({ sql: 'DELETE FROM products' });
  }
  const now = new Date().toISOString();
  const rows = products.reduce<unknown[][]>((acc, product) => {
    const code = productCode(product);
    if (!code) return acc;
    acc.push([
        code,
        product.주차 || '',
        product.상품명 || code,
        product.카테고리 || '',
        product.아이템 || '',
        product.컬러 || '',
        Number(product.도매가 || product.단가 || 0),
        product.노출여부 || '',
        product.쥔장장바구니노출 || 'y',
        JSON.stringify(product),
        now,
    ]);
    return acc;
  }, []);

  for (const chunk of chunkArray(rows, 40)) {
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
  const rows = await queryD1<PayloadRow>('SELECT payload FROM customers ORDER BY name ASC');
  return rows.map((row) => {
    const customer = parsePayload<Customer>(row, {} as Customer);
    return {
      ...customer,
      텔레그램ID: customer.텔레그램ID || '',
      결제방식: customer.결제방식 || '당일결제',
      세금계산서발행: customer.세금계산서발행 || '미발행',
      로그인차단: customer.로그인차단 || 'n',
      쥔장장바구니허락: customer.쥔장장바구니허락 || 'n',
      최근접속일: customer.최근접속일 || '',
    };
  });
}

export async function writeCloudCustomers(customers: Customer[], replaceAll = false): Promise<void> {
  await ensureCloudSchema();
  if (replaceAll) {
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
    const name = String(customer.거래처명 || '').trim();
    if (!name) return acc;
    acc.push([
        name,
        customer.거래처등급 || '',
        customer.쥔장장바구니허락 || 'n',
        customer.로그인차단 || 'n',
        JSON.stringify(customer),
        now,
    ]);
    return acc;
  }, []);

  for (const chunk of chunkArray(rows, 80)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO customers (${CUSTOMER_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, CUSTOMER_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function readCloudOrders(): Promise<CustomerOrder[]> {
  await ensureCloudSchema();
  const rows = await queryD1<PayloadRow>('SELECT payload FROM orders ORDER BY order_at ASC, id ASC');
  return rows.map((row) => parsePayload<CustomerOrder>(row, {} as CustomerOrder));
}

export async function writeCloudOrders(orders: CustomerOrder[], replaceAll = true): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [];
  if (replaceAll) {
    queries.push({ sql: 'DELETE FROM orders' });
  }
  const now = new Date().toISOString();
  const rows = orders.map((order, index) => {
    const id = orderId(order, index);
    return [
        id,
        order.거래처명 || '',
        order.상품코드 || '',
        order.컬러 || '',
        Number(order.수량 || 0),
        Number(order.금액 || 0),
        order.주문일시 || '',
        JSON.stringify(order),
        now,
      ];
  });

  for (const chunk of chunkArray(rows, 60)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO orders (${ORDER_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, ORDER_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function readCloudOrdersByCustomer(customerName: string): Promise<CustomerOrder[]> {
  const normalized = customerName.trim().toLowerCase();
  const orders = await readCloudOrders();
  return orders.filter((order) => String(order.거래처명 || '').trim().toLowerCase() === normalized);
}

export async function readCloudPayments(): Promise<PaymentLog[]> {
  await ensureCloudSchema();
  const rows = await queryD1<PayloadRow>('SELECT payload FROM payments ORDER BY payment_at ASC, id ASC');
  return rows.map((row) => parsePayload<PaymentLog>(row, {} as PaymentLog));
}

export async function writeCloudPayments(payments: PaymentLog[]): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [{ sql: 'DELETE FROM payments' }];
  const now = new Date().toISOString();
  const rows = payments.map((payment, index) => {
    const id = `${payment.입금일자 || ''}-${payment.거래처명 || ''}-${payment.입금금액 || 0}-${index}`;
    return [
        id,
        payment.거래처명 || '',
        payment.입금일자 || '',
        Number(payment.입금금액 || 0),
        JSON.stringify(payment),
        now,
      ];
  });

  for (const chunk of chunkArray(rows, 80)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO payments (${PAYMENT_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, PAYMENT_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function readCloudCartSnapshots(): Promise<CartSnapshotItem[]> {
  await ensureCloudSchema();
  return queryD1<CartSnapshotItem>('SELECT customerName, productCode, color, quantity, category, updatedAt FROM cart_snapshots ORDER BY updatedAt DESC');
}

export async function writeCloudCartSnapshot(customerName: string, items: Omit<CartSnapshotItem, 'customerName' | 'updatedAt'>[]): Promise<void> {
  await ensureCloudSchema();
  const trimmedCustomerName = customerName.trim();
  const updatedAt = new Date().toISOString();
  const queries: D1WriteQuery[] = [{ sql: 'DELETE FROM cart_snapshots WHERE customerName = ?', params: [trimmedCustomerName] }];
  const rows = items.reduce<unknown[][]>((acc, item) => {
    const productCode = String(item.productCode || '').trim();
    const color = String(item.color || '').trim();
    const quantity = Number(item.quantity || 0);
    if (!trimmedCustomerName || !productCode || quantity <= 0) return acc;
    acc.push([trimmedCustomerName, productCode, color, Math.trunc(quantity), item.category || '', updatedAt]);
    return acc;
  }, []);

  for (const chunk of chunkArray(rows, 80)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO cart_snapshots (${CART_INSERT_COLUMNS.join(', ')}) VALUES ${valuesPlaceholders(chunk.length, CART_INSERT_COLUMNS.length)}`,
      params: chunk.flat(),
    });
  }

  await runWriteBatch(queries);
}

export async function clearCloudOrderedCartSnapshotItems(customerName: string, items: Array<{ productCode: string; color: string }>): Promise<void> {
  await ensureCloudSchema();
  const trimmedCustomerName = customerName.trim();
  const queries = items.map((item) => ({
    sql: 'DELETE FROM cart_snapshots WHERE customerName = ? AND productCode = ? AND color = ?',
    params: [
      trimmedCustomerName,
      item.productCode,
      item.color,
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
  const [products, customers, itemRows, colorRows, categoryRows] = await Promise.all([
    readCloudProducts(),
    readCloudCustomers(),
    queryD1<PayloadRow>('SELECT payload FROM items ORDER BY name ASC'),
    queryD1<PayloadRow>('SELECT payload FROM colors ORDER BY name ASC'),
    queryD1<PayloadRow>('SELECT payload FROM categories ORDER BY name ASC'),
  ]);

  return {
    products,
    customers,
    items: itemRows.map((row) => parsePayload<ItemMaster>(row, {} as ItemMaster)),
    colors: colorRows.map((row) => parsePayload<ColorMaster>(row, {} as ColorMaster)),
    categories: categoryRows.map((row) => parsePayload<CategoryMaster>(row, {} as CategoryMaster)),
  };
}

export async function writeCloudCategories(categories: CategoryMaster[]): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [{ sql: 'DELETE FROM categories' }];
  const now = new Date().toISOString();
  const rows = categories
    .filter((category) => Boolean(category.카테고리))
    .map((category) => [category.카테고리, JSON.stringify(category), now]);
  for (const chunk of chunkArray(rows, 120)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO categories (name, payload, updated_at) VALUES ${valuesPlaceholders(chunk.length, 3)}`,
      params: chunk.flat(),
    });
  }
  await runWriteBatch(queries);
}

export async function writeCloudItems(items: ItemMaster[]): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [{ sql: 'DELETE FROM items' }];
  const now = new Date().toISOString();
  const rows = items
    .filter((item) => Boolean(item.아이템))
    .map((item) => [item.아이템, JSON.stringify(item), now]);
  for (const chunk of chunkArray(rows, 120)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO items (name, payload, updated_at) VALUES ${valuesPlaceholders(chunk.length, 3)}`,
      params: chunk.flat(),
    });
  }
  await runWriteBatch(queries);
}

export async function writeCloudColors(colors: ColorMaster[]): Promise<void> {
  await ensureCloudSchema();
  const queries: D1WriteQuery[] = [{ sql: 'DELETE FROM colors' }];
  const now = new Date().toISOString();
  const rows = colors
    .filter((color) => Boolean(color.컬러))
    .map((color) => [color.컬러, JSON.stringify(color), now]);
  for (const chunk of chunkArray(rows, 120)) {
    queries.push({
      sql: `INSERT OR REPLACE INTO colors (name, payload, updated_at) VALUES ${valuesPlaceholders(chunk.length, 3)}`,
      params: chunk.flat(),
    });
  }
  await runWriteBatch(queries);
}
