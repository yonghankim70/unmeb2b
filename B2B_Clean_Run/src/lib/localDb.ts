import * as xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

export interface Customer {
  거래처명: string;
  접속코드: string;
  거래처등급: string; // S, A, B, C etc.
  텔레그램ID?: string;
  결제방식?: string;
  세금계산서발행?: string;
  로그인차단?: string;
  쥔장장바구니허락?: string;
  최근접속일?: string;
}

export interface Product {
  업로드일자: string;
  노출여부: string;
  노출제외?: string;
  쥔장장바구니노출?: string;
  카테고리: string;
  주차: string;
  상품명: string;
  임시코드: string;
  아이템: string;
  컬러: string;
  사이즈: string;
  단가: number;
  환율: number;
  물류비: number;
  원가: number;
  도매가: number;
  S등급가: number;
  A등급: number;
  B등급: number;
  C등급: number;
  W등급가?: number;
  사입처: string;
  중국코드: string;
  신규등록대기?: boolean;
  포인트?: string;
  추천?: number;
  시즌?: string;
  등급할인제외?: string;
  동기화시간?: string;
  상세이미지목록?: string[];
}

export interface ItemMaster {
  아이템: string;
  표기: string;
}

export interface ColorMaster {
  컬러: string;
  표기컬러: string;
}

export interface CategoryMaster {
  카테고리: string;
  등급: string;
  환율: number;
  물류비: number;
  마진율?: number;      // e.g. 1.25
  S등급비율?: number;   // e.g. 0.80
  A등급비율?: number;   // e.g. 0.85
  B등급비율?: number;   // e.g. 0.90
  C등급비율?: number;   // e.g. 0.95
  W등급비율?: number;   // e.g. 0.8
}

export interface OrderItem {
  productCode: string; // matches 상품명 or 임시코드
  color: string;
  quantity: number;
}

export interface CartSnapshotItem {
  customerName: string;
  productCode: string;
  color: string;
  quantity: number;
  category?: string;
  updatedAt: string;
}

export function getDbPath(): string {
  const configuredPath = process.env.B2B_DATA_DIR?.trim();
  const dataPath = configuredPath
    ? path.resolve(configuredPath)
    : path.join(process.cwd(), 'data', 'pddb_dev');

  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  return dataPath;
}

// ----------------------------------------------------
// SQLite DB Instance 관리 및 자동 초기화
// ----------------------------------------------------
let _dbInstance: any | null = null;

export function backupDbToZDrive(): void {
  if (process.env.B2B_BACKUP_TO_Z !== 'true') {
    return;
  }

  try {
    const localSqlitePath = path.join(getDbPath(), 'pddb.sqlite');
    const zDir = process.env.B2B_Z_BACKUP_DIR || 'Z:\\HDD1\\PDDB';
    if (fs.existsSync(zDir) && fs.existsSync(localSqlitePath)) {
      const zSqlitePath = path.join(zDir, 'pddb.sqlite');
      const dbBuffer = fs.readFileSync(localSqlitePath);
      fs.writeFileSync(zSqlitePath, dbBuffer);
      console.log('[DB Backup] SQLite DB backup to Z drive successful.');
    }
  } catch (err) {
    console.error('[DB Backup] Failed to backup SQLite DB to Z drive:', err);
  }
}

export function getSqliteDb(): any {
  if (_dbInstance) return _dbInstance;

  const localDbDir = getDbPath();
  if (!fs.existsSync(localDbDir)) {
    fs.mkdirSync(localDbDir, { recursive: true });
  }
  const localSqlitePath = path.join(localDbDir, 'pddb.sqlite');

  const sqlitePackageName = 'better-sqlite3';
  // Cloudflare 배포에서는 이 파일의 타입/보조 함수만 참조될 수 있으므로
  // native SQLite 모듈은 로컬 DB를 실제로 열 때만 지연 로딩한다.
  const Database = require(sqlitePackageName);
  const db = new Database(localSqlitePath);
  
  // 자동 스키마 초기화 로직 (테이블이 없을 때만 생성)
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      임시코드 TEXT PRIMARY KEY,
      상품명 TEXT,
      업로드일자 TEXT,
      노출여부 TEXT,
      노출제외 TEXT,
      쥔장장바구니노출 TEXT,
      카테고리 TEXT,
      주차 TEXT,
      아이템 TEXT,
      컬러 TEXT,
      사이즈 TEXT,
      단가 REAL,
      환율 REAL,
      물류비 REAL,
      원가 REAL,
      도매가 REAL,
      S등급가 REAL,
      A등급 REAL,
      B등급 REAL,
      C등급 REAL,
      W등급가 REAL,
      사입처 TEXT,
      중국코드 TEXT,
      신규등록대기 INTEGER,
      포인트 TEXT,
      추천 INTEGER,
      시즌 TEXT,
      등급할인제외 TEXT,
      동기화시간 TEXT
    );
    CREATE TABLE IF NOT EXISTS categories (
      카테고리 TEXT PRIMARY KEY,
      등급 TEXT,
      환율 REAL,
      물류비 REAL,
      마진율 REAL,
      S등급비율 REAL,
      A등급비율 REAL,
      B등급비율 REAL,
      C등급비율 REAL,
      W등급비율 REAL
    );
    CREATE TABLE IF NOT EXISTS customers (
      거래처명 TEXT PRIMARY KEY,
      접속코드 TEXT,
      거래처등급 TEXT,
      텔레그램ID TEXT,
      쥔장장바구니허락 TEXT
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      주문번호 TEXT,
      종결여부 TEXT,
      주문일시 TEXT,
      거래처명 TEXT,
      상품코드 TEXT,
      컬러 TEXT,
      수량 INTEGER,
      단가 REAL,
      금액 REAL,
      요청사항 TEXT,
      발송날짜 TEXT,
      전표번호 TEXT,
      주문확인 TEXT,
      입금확인 TEXT,
      입금방식 TEXT,
      입금금액 REAL,
      입금자 TEXT,
      출고상황 TEXT,
      발송처리 TEXT,
      택배사 TEXT,
      운송장번호 TEXT
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      입금일자 TEXT,
      거래처명 TEXT,
      입금금액 REAL,
      입금방식 TEXT,
      입금자 TEXT,
      비고 TEXT
    );
    CREATE TABLE IF NOT EXISTS cart_snapshots (
      customerName TEXT,
      productCode TEXT,
      color TEXT,
      quantity INTEGER,
      category TEXT,
      updatedAt TEXT,
      PRIMARY KEY (customerName, productCode, color)
    );
    CREATE TABLE IF NOT EXISTS items (
      아이템 TEXT PRIMARY KEY,
      표기 TEXT
    );
    CREATE TABLE IF NOT EXISTS colors (
      컬러 TEXT PRIMARY KEY,
      표기컬러 TEXT
    );
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Alter table migrations for new columns
  try {
    db.prepare("SELECT 등급할인제외 FROM products LIMIT 1").get();
  } catch (err) {
    try {
      db.exec("ALTER TABLE products ADD COLUMN 등급할인제외 TEXT DEFAULT ''");
      console.log("[DB Migration] Added '등급할인제외' column to 'products' table.");
    } catch (alterErr) {
      console.error("[DB Migration] Failed to add '등급할인제외' column:", alterErr);
    }
  }

  try {
    db.prepare("SELECT 동기화시간 FROM products LIMIT 1").get();
  } catch (err) {
    try {
      db.exec("ALTER TABLE products ADD COLUMN 동기화시간 TEXT DEFAULT ''");
      console.log("[DB Migration] Added '동기화시간' column to 'products' table.");
    } catch (alterErr) {
      console.error("[DB Migration] Failed to add '동기화시간' column:", alterErr);
    }
  }

  try {
    db.prepare("SELECT W등급가 FROM products LIMIT 1").get();
  } catch (err) {
    try {
      db.exec("ALTER TABLE products ADD COLUMN W등급가 REAL DEFAULT 0");
      console.log("[DB Migration] Added 'W등급가' column to 'products' table.");
    } catch (alterErr) {
      console.error("[DB Migration] Failed to add 'W등급가' column:", alterErr);
    }
  }

  try {
    db.prepare("SELECT 쥔장장바구니노출 FROM products LIMIT 1").get();
  } catch (err) {
    try {
      db.exec("ALTER TABLE products ADD COLUMN 쥔장장바구니노출 TEXT DEFAULT 'y'");
      console.log("[DB Migration] Added '쥔장장바구니노출' column to 'products' table.");
    } catch (alterErr) {
      console.error("[DB Migration] Failed to add '쥔장장바구니노출' column:", alterErr);
    }
  }

  try {
    db.prepare("SELECT W등급비율 FROM categories LIMIT 1").get();
  } catch (err) {
    try {
      db.exec("ALTER TABLE categories ADD COLUMN W등급비율 REAL DEFAULT null");
      console.log("[DB Migration] Added 'W등급비율' column to 'categories' table.");
    } catch (alterErr) {
      console.error("[DB Migration] Failed to add 'W등급비율' column:", alterErr);
    }
  }

  // Migrate global_settings config to include '등급할인제외' in visibleColumns if not already done
  try {
    const row = db.prepare("SELECT value FROM global_settings WHERE key = 'config'").get() as any;
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      let changed = false;

      if (parsed) {
        if (!parsed.migratedGradeExclude) {
          if (Array.isArray(parsed.visibleColumns) && !parsed.visibleColumns.includes('등급할인제외')) {
            const idx = parsed.visibleColumns.indexOf('노출제외');
            if (idx !== -1) {
              parsed.visibleColumns.splice(idx + 1, 0, '등급할인제외');
            } else {
              parsed.visibleColumns.push('등급할인제외');
            }
          }
          if (parsed.columnWidths && typeof parsed.columnWidths === 'object') {
            if (parsed.columnWidths['등급할인제외'] === undefined) {
              parsed.columnWidths['등급할인제외'] = 160;
            }
          }
          parsed.migratedGradeExclude = true;
          changed = true;
          console.log("[DB Migration] Added '등급할인제외' to global_settings config visibleColumns.");
        }

        if (!parsed.migratedWGrade) {
          if (Array.isArray(parsed.visibleColumns) && !parsed.visibleColumns.includes('W등급가')) {
            const idx = parsed.visibleColumns.indexOf('C등급');
            if (idx !== -1) {
              parsed.visibleColumns.splice(idx + 1, 0, 'W등급가');
            } else {
              parsed.visibleColumns.push('W등급가');
            }
          }
          if (parsed.columnWidths && typeof parsed.columnWidths === 'object') {
            if (parsed.columnWidths['W등급가'] === undefined) {
              parsed.columnWidths['W등급가'] = 140;
            }
          }
          parsed.migratedWGrade = true;
          changed = true;
          console.log("[DB Migration] Added 'W등급가' to global_settings config visibleColumns.");
        }

        if (!parsed.migratedGradeExcludeABC) {
          db.prepare("UPDATE products SET 등급할인제외 = 'A, B, C', W등급가 = A등급").run();
          console.log("[DB Migration] Excluded A, B, C grade discount and initialized W등급가 with A등급 price for all existing products.");
          parsed.migratedGradeExcludeABC = true;
          changed = true;
        }

        if (!parsed.migratedOwnerCartVisible) {
          if (Array.isArray(parsed.visibleColumns) && !parsed.visibleColumns.includes('쥔장장바구니노출')) {
            const idx = parsed.visibleColumns.indexOf('노출여부');
            if (idx !== -1) {
              parsed.visibleColumns.splice(idx + 1, 0, '쥔장장바구니노출');
            } else {
              parsed.visibleColumns.push('쥔장장바구니노출');
            }
          }
          if (Array.isArray(parsed.columnOrder) && !parsed.columnOrder.includes('쥔장장바구니노출')) {
            const idx = parsed.columnOrder.indexOf('노출여부');
            if (idx !== -1) {
              parsed.columnOrder.splice(idx + 1, 0, '쥔장장바구니노출');
            } else {
              parsed.columnOrder.push('쥔장장바구니노출');
            }
          }
          if (parsed.columnWidths && typeof parsed.columnWidths === 'object') {
            if (parsed.columnWidths['쥔장장바구니노출'] === undefined) {
              parsed.columnWidths['쥔장장바구니노출'] = 120;
            }
          }
          parsed.migratedOwnerCartVisible = true;
          changed = true;
          console.log("[DB Migration] Added '쥔장장바구니노출' to global_settings config visibleColumns.");
        }

        if (changed) {
          db.prepare("INSERT OR REPLACE INTO global_settings (key, value) VALUES ('config', ?)")
            .run(JSON.stringify(parsed));
          console.log("[DB Migration] Saved migrated flags to global_settings.");
        }
      }
    }
  } catch (configErr) {
    console.error("[DB Migration] Failed to migrate global_settings config:", configErr);
  }
  
  // Customers migrations for 결제방식, 세금계산서발행, 로그인차단, 최근접속일
  try {
    const columns = db.prepare("PRAGMA table_info(customers)").all() as any[];
    const colNames = columns.map(c => c.name);
    if (!colNames.includes('결제방식')) {
      db.prepare("ALTER TABLE customers ADD COLUMN 결제방식 TEXT DEFAULT '당일결제'").run();
      console.log("[DB Migration] Added '결제방식' column to 'customers' table.");
    }
    if (!colNames.includes('세금계산서발행')) {
      db.prepare("ALTER TABLE customers ADD COLUMN 세금계산서발행 TEXT DEFAULT '미발행'").run();
      console.log("[DB Migration] Added '세금계산서발행' column to 'customers' table.");
    }
    if (!colNames.includes('로그인차단')) {
      db.prepare("ALTER TABLE customers ADD COLUMN 로그인차단 TEXT DEFAULT 'n'").run();
      console.log("[DB Migration] Added '로그인차단' column to 'customers' table.");
    }
    if (!colNames.includes('쥔장장바구니허락')) {
      db.prepare("ALTER TABLE customers ADD COLUMN 쥔장장바구니허락 TEXT DEFAULT 'n'").run();
      console.log("[DB Migration] Added '쥔장장바구니허락' column to 'customers' table.");
    }
    if (!colNames.includes('최근접속일')) {
      db.prepare("ALTER TABLE customers ADD COLUMN 최근접속일 TEXT DEFAULT ''").run();
      console.log("[DB Migration] Added '최근접속일' column to 'customers' table.");
    }
  } catch (customersMigrationErr) {
    console.error("[DB Migration] Failed to migrate 'customers' table:", customersMigrationErr);
  }

  // CREATE login_logs TABLE IF NOT EXISTS
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        거래처명 TEXT,
        접속일시 TEXT
      )
    `).run();
    console.log("[DB Migration] Verified 'login_logs' table exists.");
  } catch (loginLogsErr) {
    console.error("[DB Migration] Failed to create 'login_logs' table:", loginLogsErr);
  }

  // items 마스터에 CT(코트) 아이템 자동 등록 및 기존 CT(코드) 수정
  try {
    db.prepare("DELETE FROM items WHERE 아이템 = 'CT(코드)'").run();
    db.prepare("INSERT OR IGNORE INTO items (아이템, 표기) VALUES ('CT(코트)', '코트')").run();
    db.prepare("UPDATE products SET 아이템 = 'CT(코트)' WHERE 아이템 = 'CT(코드)'").run();
    console.log("[DB Migration] Inserted or verified 'CT(코트)' in items master.");
  } catch (itemMasterErr) {
    console.error("[DB Migration] Failed to register 'CT(코트)' item:", itemMasterErr);
  }
  
  _dbInstance = db;
  return _dbInstance;
}

export function getExcelPath(): string {
  return path.join(getDbPath(), 'Master.xlsx');
}

export function getOrdersExcelPath(): string {
  return path.join(getDbPath(), 'Orders.xlsx');
}

export function getProductsDbPath(): string {
  return path.join(getDbPath(), 'products_db.json');
}

export function getColorsDbPath(): string {
  return path.join(getDbPath(), 'colors_db.json');
}

export function getOrdersDbPath(): string {
  return path.join(getDbPath(), 'orders_db.json');
}

export function getCustomersDbPath(): string {
  return path.join(getDbPath(), 'customers_db.json');
}

export function getPaymentsDbPath(): string {
  return path.join(getDbPath(), 'payments_db.json');
}

// Helper to sanitize object keys by trimming them
function sheetToSanitizedJson<T>(sheet: xlsx.WorkSheet): T[] {
  if (!sheet || !sheet['!ref']) return [];
  const rawRows = xlsx.utils.sheet_to_json<any>(sheet);
  return rawRows.map(row => {
    const sanitizedRow: any = {};
    for (const key of Object.keys(row)) {
      const sanitizedKey = key.trim();
      sanitizedRow[sanitizedKey] = row[key];
    }
    return sanitizedRow as T;
  });
}

function asString(val: any): string {
  return val === undefined || val === null ? '' : String(val).trim();
}

function asNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

function normalizeCustomer(value: Partial<Customer>): Customer {
  return {
    거래처명: asString(value.거래처명),
    접속코드: asString(value.접속코드),
    거래처등급: asString(value.거래처등급 || 'C'),
    텔레그램ID: asString(value.텔레그램ID || ''),
    결제방식: asString(value.결제방식 || '당일결제'),
    세금계산서발행: asString(value.세금계산서발행 || '미발행'),
    로그인차단: asString(value.로그인차단 || 'n'),
    쥔장장바구니허락: asString(value.쥔장장바구니허락 || 'n'),
    최근접속일: asString(value.최근접속일 || ''),
  };
}

function shouldBlockCustomerShrink(existingCount: number, nextCount: number): boolean {
  if (existingCount < 8) return false;
  if (nextCount >= existingCount) return false;
  return nextCount <= Math.floor(existingCount * 0.6) && existingCount - nextCount >= 5;
}

export function readCustomersFromMasterExcel(): Customer[] {
  const excelPath = getExcelPath();
  if (!fs.existsSync(excelPath)) return [];

  try {
    const workbook = xlsx.read(fs.readFileSync(excelPath), { type: 'buffer' });
    const sheet = workbook.Sheets['거래처 마스터'];
    if (!sheet) return [];
    return sheetToSanitizedJson<any>(sheet)
      .map((row) => normalizeCustomer({
        거래처명: row['거래처명'],
        접속코드: row['접속코드'],
        거래처등급: row['거래처등급'],
        텔레그램ID: row['텔레그램ID'],
        결제방식: row['결제방식'],
        세금계산서발행: row['세금계산서발행'],
        로그인차단: row['로그인차단'],
        쥔장장바구니허락: row['쥔장장바구니허락'],
        최근접속일: row['최근접속일'],
      }))
      .filter((customer) => customer.거래처명);
  } catch (error) {
    console.error('[DB] readCustomersFromMasterExcel 에러:', error);
    return [];
  }
}

export function saveCustomersToExcel(customers: Customer[]): boolean {
  const excelPath = getExcelPath();
  try {
    let workbook: xlsx.WorkBook;
    if (fs.existsSync(excelPath)) {
      workbook = xlsx.read(fs.readFileSync(excelPath), { type: 'buffer' });
    } else {
      workbook = xlsx.utils.book_new();
    }

    const rows = customers.map((customer) => ({
      거래처명: customer.거래처명,
      접속코드: customer.접속코드,
      거래처등급: customer.거래처등급,
      텔레그램ID: customer.텔레그램ID || '',
      결제방식: customer.결제방식 || '당일결제',
      세금계산서발행: customer.세금계산서발행 || '미발행',
      로그인차단: customer.로그인차단 || 'n',
      쥔장장바구니허락: customer.쥔장장바구니허락 || 'n',
      최근접속일: customer.최근접속일 || '',
    }));

    workbook.Sheets['거래처 마스터'] = xlsx.utils.json_to_sheet(rows);
    if (!workbook.SheetNames.includes('거래처 마스터')) {
      workbook.SheetNames.push('거래처 마스터');
    }

    fs.writeFileSync(excelPath, xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    return true;
  } catch (error) {
    console.error('[DB] saveCustomersToExcel 에러:', error);
    return false;
  }
}

export function formatProduct(p: any): Product {
  return {
    업로드일자: asString(p['업로드일자']),
    노출여부: asString(p['노출여부']),
    노출제외: asString(p['노출제외'] || ''),
    쥔장장바구니노출: asString(p['쥔장장바구니노출'] || 'y'),
    카테고리: asString(p['카테고리']),
    주차: asString(p['주차']),
    상품명: asString(p['상품명']),
    임시코드: asString(p['임시코드']),
    아이템: asString(p['아이템']),
    컬러: asString(p['컬러']),
    사이즈: asString(p['사이즈'] || 'free'),
    단가: asNumber(p['단가']),
    환율: asNumber(p['환율']),
    물류비: asNumber(p['물류비']),
    원가: asNumber(p['원가']),
    도매가: asNumber(p['도매가']),
    S등급가: asNumber(p['S등급가']),
    A등급: asNumber(p['A등급']),
    B등급: asNumber(p['B등급']),
    C등급: asNumber(p['C등급']),
    W등급가: asNumber(p['W등급가']),
    사입처: asString(p['사입처']),
    중국코드: asString(p['중국코드']),
    신규등록대기: p['신규등록대기'] === undefined ? false : Boolean(p['신규등록대기']),
    포인트: asString(p['포인트'] || p['태그'] || ''),
    추천: p['추천'] === undefined ? 0 : (typeof p['추천'] === 'number' ? p['추천'] : (p['추천'] === 'true' || p['추천'] === true ? 1 : (isNaN(Number(p['추천'])) ? 0 : Number(p['추천'])))),
    시즌: asString(p['시즌'] || ''),
    등급할인제외: asString(p['등급할인제외'] || ''),
    동기화시간: asString(p['동기화시간'] || ''),
  };
}

// ----------------------------------------------------
// Products CRUD
// ----------------------------------------------------
export function readProductsDb(): Product[] {
  try {
    const db = getSqliteDb();
    const rows = db.prepare('SELECT * FROM products').all();
    return rows.map((p: any) => formatProduct({
      ...p,
      신규등록대기: Boolean(p.신규등록대기)
    }));
  } catch (error) {
    console.error('[DB] readProductsDb 에러:', error);
    return [];
  }
}

export function readCustomersDb(): Customer[] {
  try {
    const db = getSqliteDb();
    return db.prepare('SELECT * FROM customers').all().map((c: any) => ({
      거래처명: c.거래처명,
      접속코드: c.접속코드,
      거래처등급: c.거래처등급,
      텔레그램ID: c.텔레그램ID || '',
      결제방식: c.결제방식 || '당일결제',
      세금계산서발행: c.세금계산서발행 || '미발행',
      로그인차단: c.로그인차단 || 'n',
      쥔장장바구니허락: c.쥔장장바구니허락 || 'n',
      최근접속일: c.최근접속일 || ''
    }));
  } catch (error) {
    console.error('[DB] readCustomersDb 에러:', error);
    return [];
  }
}

export function writeProductsDb(products: Product[]): boolean {
  const db = getSqliteDb();
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM products').run();
      const stmt = db.prepare(`
        INSERT INTO products (
          임시코드, 상품명, 업로드일자, 노출여부, 노출제외, 쥔장장바구니노출, 카테고리, 주차, 아이템, 컬러, 사이즈,
          단가, 환율, 물류비, 원가, 도매가, S등급가, A등급, B등급, C등급, W등급가, 사입처, 중국코드, 
          신규등록대기, 포인트, 추천, 시즌, 등급할인제외, 동기화시간
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of products) {
        stmt.run(
          p.임시코드 || p.상품명 || '',
          p.상품명 || '',
          p.업로드일자 || '',
          p.노출여부 || '',
          p.노출제외 || '',
          p.쥔장장바구니노출 || 'y',
          p.카테고리 || '',
          p.주차 || '',
          p.아이템 || '',
          p.컬러 || '',
          p.사이즈 || 'free',
          Number(p.단가) || 0,
          Number(p.환율) || 0,
          Number(p.물류비) || 0,
          Number(p.원가) || 0,
          Number(p.도매가) || 0,
          Number(p.S등급가) || 0,
          Number(p.A등급) || 0,
          Number(p.B등급) || 0,
          Number(p.C등급) || 0,
          Number(p.W등급가) || 0,
          p.사입처 || '',
          p.중국코드 || '',
          p.신규등록대기 ? 1 : 0,
          p.포인트 || '',
          Number(p.추천) || 0,
          p.시즌 || '',
          p.등급할인제외 || '',
          p.동기화시간 || ''
        );
      }
    })();
    backupDbToZDrive();
    return true;
  } catch (error) {
    console.error('[DB] writeProductsDb 에러:', error);
    return false;
  }
}

export function saveProducts(products: Product[]): boolean {
  return writeProductsDb(products);
}

export function writeProducts(newProducts: Product[]): boolean {
  const db = getSqliteDb();
  try {
    db.transaction(() => {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO products (
          임시코드, 상품명, 업로드일자, 노출여부, 노출제외, 쥔장장바구니노출, 카테고리, 주차, 아이템, 컬러, 사이즈,
          단가, 환율, 물류비, 원가, 도매가, S등급가, A등급, B등급, C등급, W등급가, 사입처, 중국코드, 
          신규등록대기, 포인트, 추천, 시즌, 등급할인제외, 동기화시간
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of newProducts) {
        stmt.run(
          p.임시코드 || p.상품명 || '',
          p.상품명 || '',
          p.업로드일자 || '',
          p.노출여부 || '',
          p.노출제외 || '',
          p.쥔장장바구니노출 || 'y',
          p.카테고리 || '',
          p.주차 || '',
          p.아이템 || '',
          p.컬러 || '',
          p.사이즈 || 'free',
          Number(p.단가) || 0,
          Number(p.환율) || 0,
          Number(p.물류비) || 0,
          Number(p.원가) || 0,
          Number(p.도매가) || 0,
          Number(p.S등급가) || 0,
          Number(p.A등급) || 0,
          Number(p.B등급) || 0,
          Number(p.C등급) || 0,
          Number(p.W등급가) || 0,
          p.사입처 || '',
          p.중국코드 || '',
          p.신규등록대기 ? 1 : 0,
          p.포인트 || '',
          Number(p.추천) || 0,
          p.시즌 || '',
          p.등급할인제외 || '',
          p.동기화시간 || ''
        );
      }
    })();
    backupDbToZDrive();
    return true;
  } catch (error) {
    console.error('[DB] writeProducts 에러:', error);
    return false;
  }
}

// ----------------------------------------------------
// Categories CRUD
// ----------------------------------------------------
export function saveCategories(categories: CategoryMaster[]): boolean {
  const db = getSqliteDb();
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM categories').run();
      const stmt = db.prepare(`
        INSERT INTO categories (
          카테고리, 등급, 환율, 물류비, 마진율, S등급비율, A등급비율, B등급비율, C등급비율, W등급비율
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of categories) {
        stmt.run(
          c.카테고리,
          c.등급 || '',
          Number(c.환율 || 0),
          Number(c.물류비 || 0),
          c.마진율 !== undefined ? Number(c.마진율) : null,
          c.S등급비율 !== undefined ? Number(c.S등급비율) : null,
          c.A등급비율 !== undefined ? Number(c.A등급비율) : null,
          c.B등급비율 !== undefined ? Number(c.B등급비율) : null,
          c.C등급비율 !== undefined ? Number(c.C등급비율) : null,
          c.W등급비율 !== undefined ? Number(c.W등급비율) : null
        );
      }
    })();
    backupDbToZDrive();
    return true;
  } catch (error) {
    console.error('[DB] saveCategories 에러:', error);
    return false;
  }
}

// ----------------------------------------------------
// Customers CRUD
// ----------------------------------------------------
export function writeCustomers(customers: Customer[]): boolean {
  const db = getSqliteDb();
  try {
    const existingCount = readCustomersDb().length;
    if (shouldBlockCustomerShrink(existingCount, customers.length)) {
      throw new Error(`거래처 저장이 차단되었습니다. 기존 ${existingCount}개에서 ${customers.length}개로 급감하는 전체 덮어쓰기입니다.`);
    }

    db.transaction(() => {
      db.prepare('DELETE FROM customers').run();
      const stmt = db.prepare(`
        INSERT INTO customers (거래처명, 접속코드, 거래처등급, 텔레그램ID, 결제방식, 세금계산서발행, 로그인차단, 쥔장장바구니허락, 최근접속일) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of customers) {
        stmt.run(
          c.거래처명, 
          c.접속코드, 
          c.거래처등급, 
          c.텔레그램ID || '',
          c.결제방식 || '당일결제',
          c.세금계산서발행 || '미발행',
          c.로그인차단 || 'n',
          c.쥔장장바구니허락 || 'n',
          c.최근접속일 || ''
        );
      }
    })();
    if (!saveCustomersToExcel(customers)) {
      throw new Error('Master.xlsx 거래처 시트 저장에 실패했습니다.');
    }
    backupDbToZDrive();
    return true;
  } catch (error) {
    console.error('[DB] writeCustomers 에러:', error);
    return false;
  }
}

export interface LoginLog {
  id: number;
  거래처명: string;
  접속일시: string;
}

export function readAllLoginLogs(startDate?: string, endDate?: string): LoginLog[] {
  try {
    const db = getSqliteDb();
    let query = "SELECT * FROM login_logs";
    const params: string[] = [];
    
    if (startDate && endDate) {
      query += " WHERE 접속일시 >= ? AND 접속일시 <= ?";
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } else if (startDate) {
      query += " WHERE 접속일시 >= ?";
      params.push(`${startDate} 00:00:00`);
    } else if (endDate) {
      query += " WHERE 접속일시 <= ?";
      params.push(`${endDate} 23:59:59`);
    }
    
    query += " ORDER BY 접속일시 DESC";
    return db.prepare(query).all(...params) as LoginLog[];
  } catch (e) {
    console.error('[DB] readAllLoginLogs 에러:', e);
    return [];
  }
}

export function recordCustomerLogin(customerName: string): boolean {
  try {
    const db = getSqliteDb();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

    db.prepare("UPDATE customers SET 최근접속일 = ? WHERE 거래처명 = ?")
      .run(timestamp, customerName);
    
    db.prepare("INSERT INTO login_logs (거래처명, 접속일시) VALUES (?, ?)")
      .run(customerName, timestamp);

    backupDbToZDrive();
    return true;
  } catch (e) {
    console.error('[DB] recordCustomerLogin 에러:', e);
    return false;
  }
}

// ----------------------------------------------------
// Global Settings CRUD
// ----------------------------------------------------
export interface GlobalSettings {
  exchange: number;
  logistics: number;
  margin: number;
  sRatio: number;
  aRatio: number;
  bRatio: number;
  cRatio: number;
  wRatio: number;
  showCategoriesOnMain?: boolean;
  visibleColumns?: string[];
  columnWidths?: { [key: string]: number };
  pointOptions?: string[];
  seasonOptions?: string[];
  defaultSeason?: string;
  customerGradeOptions?: string[];
  migratedGradeExclude?: boolean;
  migratedGradeExcludeABC?: boolean;
  migratedOwnerCartVisible?: boolean;
  columnOrder?: string[];
}

export function readGlobalSettings(): GlobalSettings {
  const defaultSettings: GlobalSettings = {
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
    columnOrder: []
  };

  try {
    const db = getSqliteDb();
    const row = db.prepare("SELECT value FROM global_settings WHERE key = 'config'").get() as any;
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        exchange: parsed.exchange !== undefined ? Number(parsed.exchange) : defaultSettings.exchange,
        logistics: parsed.logistics !== undefined ? Number(parsed.logistics) : defaultSettings.logistics,
        margin: parsed.margin !== undefined ? Number(parsed.margin) : defaultSettings.margin,
        sRatio: parsed.sRatio !== undefined ? Number(parsed.sRatio) : defaultSettings.sRatio,
        aRatio: parsed.aRatio !== undefined ? Number(parsed.aRatio) : defaultSettings.aRatio,
        bRatio: parsed.bRatio !== undefined ? Number(parsed.bRatio) : defaultSettings.bRatio,
        cRatio: parsed.cRatio !== undefined ? Number(parsed.cRatio) : defaultSettings.cRatio,
        wRatio: parsed.wRatio !== undefined ? Number(parsed.wRatio) : defaultSettings.wRatio,
        showCategoriesOnMain: parsed.showCategoriesOnMain !== undefined ? Boolean(parsed.showCategoriesOnMain) : defaultSettings.showCategoriesOnMain,
        visibleColumns: Array.isArray(parsed.visibleColumns) ? parsed.visibleColumns : defaultSettings.visibleColumns,
        columnWidths: (parsed.columnWidths && typeof parsed.columnWidths === 'object') ? parsed.columnWidths : defaultSettings.columnWidths,
        pointOptions: Array.isArray(parsed.pointOptions) ? parsed.pointOptions : defaultSettings.pointOptions,
        seasonOptions: Array.isArray(parsed.seasonOptions) ? parsed.seasonOptions : defaultSettings.seasonOptions,
        defaultSeason: parsed.defaultSeason !== undefined ? String(parsed.defaultSeason) : defaultSettings.defaultSeason,
        migratedGradeExclude: parsed.migratedGradeExclude !== undefined ? Boolean(parsed.migratedGradeExclude) : defaultSettings.migratedGradeExclude,
        migratedGradeExcludeABC: parsed.migratedGradeExcludeABC !== undefined ? Boolean(parsed.migratedGradeExcludeABC) : defaultSettings.migratedGradeExcludeABC,
        migratedOwnerCartVisible: parsed.migratedOwnerCartVisible !== undefined ? Boolean(parsed.migratedOwnerCartVisible) : defaultSettings.migratedOwnerCartVisible,
        columnOrder: Array.isArray(parsed.columnOrder) ? parsed.columnOrder : defaultSettings.columnOrder
      };
    }
  } catch (e) {
    console.error('[DB] readGlobalSettings 에러:', e);
  }
  return defaultSettings;
}

export function writeGlobalSettings(settings: GlobalSettings): boolean {
  try {
    const db = getSqliteDb();
    db.prepare("INSERT OR REPLACE INTO global_settings (key, value) VALUES ('config', ?)")
      .run(JSON.stringify(settings));
    backupDbToZDrive();
    return true;
  } catch (e) {
    console.error('[DB] writeGlobalSettings 에러:', e);
    return false;
  }
}

// ----------------------------------------------------
// Orders / Payments CRUD
// ----------------------------------------------------
export interface CustomerOrder {
  주문번호?: string;
  종결여부?: string; // 'y' | 'n'
  주문일시: string;
  거래처명: string;
  상품코드: string;
  컬러: string;
  수량: number;
  단가?: number;
  금액?: number;
  요청사항?: string;
  발송날짜?: string;
  전표번호?: string;
  주문확인?: string; // 'y' | 'n'
  출고상황?: string; // '출고 대기' | '오더 진행' | '발송완료'
  발송처리?: string; // '택배' | '퀵' | '직접'
  택배사?: string;
  운송장번호?: string;
  입금확인?: string;
  입금방식?: string;
  입금금액?: number;
  입금자?: string;
}

export interface PaymentLog {
  입금일자: string;  // YYYY-MM-DD
  거래처명: string;
  입금금액: number;
  입금방식: string;
  입금자: string;
  비고?: string;
}

export function readAllPayments(): PaymentLog[] {
  try {
    const db = getSqliteDb();
    const rows = db.prepare('SELECT * FROM payments ORDER BY id ASC').all();
    return rows.map((p: any) => ({
      입금일자: p.입금일자,
      거래처명: p.거래처명,
      입금금액: Number(p.입금금액),
      입금방식: p.입금방식,
      입금자: p.입금자,
      비고: p.비고 || ''
    }));
  } catch (e) {
    console.error('[DB] readAllPayments 에러:', e);
    return [];
  }
}

export function writeAllPayments(payments: PaymentLog[]): boolean {
  try {
    const db = getSqliteDb();
    db.transaction(() => {
      db.prepare('DELETE FROM payments').run();
      const stmt = db.prepare(`
        INSERT INTO payments (입금일자, 거래처명, 입금금액, 입금방식, 입금자, 비고) VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const p of payments) {
        stmt.run(p.입금일자, p.거래처명, Number(p.입금금액), p.입금방식, p.입금자, p.비고 || '');
      }
    })();
    backupDbToZDrive();
    return true;
  } catch (e) {
    console.error('[DB] writeAllPayments 에러:', e);
    return false;
  }
}

export function writePayment(payment: PaymentLog): boolean {
  try {
    const db = getSqliteDb();
    db.prepare(`
      INSERT INTO payments (입금일자, 거래처명, 입금금액, 입금방식, 입금자, 비고) VALUES (?, ?, ?, ?, ?, ?)
    `).run(payment.입금일자, payment.거래처명, Number(payment.입금금액), payment.입금방식, payment.입금자, payment.비고 || '');
    backupDbToZDrive();
    return true;
  } catch (e) {
    console.error('[DB] writePayment 에러:', e);
    return false;
  }
}

export function readCartSnapshots(): CartSnapshotItem[] {
  try {
    const db = getSqliteDb();
    const rows = db.prepare('SELECT * FROM cart_snapshots ORDER BY updatedAt DESC').all();
    return rows.map((row: any) => ({
      customerName: row.customerName || '',
      productCode: row.productCode || '',
      color: row.color || '',
      quantity: Number(row.quantity) || 0,
      category: row.category || '',
      updatedAt: row.updatedAt || '',
    }));
  } catch (e) {
    console.error('[DB] readCartSnapshots 에러:', e);
    return [];
  }
}

export function writeCartSnapshot(customerName: string, items: Omit<CartSnapshotItem, 'customerName' | 'updatedAt'>[]): boolean {
  const trimmedCustomerName = customerName.trim();
  if (!trimmedCustomerName) return false;

  try {
    const db = getSqliteDb();
    const updatedAt = new Date().toISOString();
    db.transaction(() => {
      db.prepare('DELETE FROM cart_snapshots WHERE customerName = ?').run(trimmedCustomerName);

      const stmt = db.prepare(`
        INSERT INTO cart_snapshots (customerName, productCode, color, quantity, category, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        const productCode = String(item.productCode || '').trim();
        const color = String(item.color || '').trim();
        const quantity = Number(item.quantity) || 0;
        if (!productCode || quantity <= 0) continue;

        stmt.run(
          trimmedCustomerName,
          productCode,
          color,
          Math.trunc(quantity),
          item.category || '',
          updatedAt,
        );
      }
    })();
    return true;
  } catch (e) {
    console.error('[DB] writeCartSnapshot 에러:', e);
    return false;
  }
}

export function clearOrderedCartSnapshotItems(customerName: string, items: OrderItem[]): boolean {
  const trimmedCustomerName = customerName.trim();
  if (!trimmedCustomerName) return false;

  try {
    const db = getSqliteDb();
    const stmt = db.prepare('DELETE FROM cart_snapshots WHERE customerName = ? AND productCode = ? AND color = ?');
    db.transaction(() => {
      for (const item of items) {
        stmt.run(trimmedCustomerName, item.productCode, item.color);
      }
    })();
    return true;
  } catch (e) {
    console.error('[DB] clearOrderedCartSnapshotItems 에러:', e);
    return false;
  }
}

export function readAllOrders(): CustomerOrder[] {
  try {
    const db = getSqliteDb();
    const rows = db.prepare('SELECT * FROM orders ORDER BY id ASC').all();
    return rows.map((o: any) => ({
      주문번호: o.주문번호,
      종결여부: o.종결여부,
      주문일시: o.주문일시,
      거래처명: o.거래처명,
      상품코드: o.상품코드,
      컬러: o.컬러,
      수량: Number(o.수량),
      단가: Number(o.단가),
      금액: Number(o.금액),
      요청사항: o.요청사항 || '',
      발송날짜: o.발송날짜 || '',
      전표번호: o.전표번호 || '',
      주문확인: o.주문확인 || '',
      입금확인: o.입금확인 || '',
      입금방식: o.입금방식 || '',
      입금금액: Number(o.입금금액 || 0),
      입금자: o.입금자 || '',
      출고상황: o.출고상황 || '',
      발송처리: o.발송처리 || '',
      택배사: o.택배사 || '',
      운송장번호: o.운송장번호 || ''
    }));
  } catch (e) {
    console.error('[DB] readAllOrders 에러:', e);
    return [];
  }
}

export function writeAllOrders(orders: CustomerOrder[]): boolean {
  try {
    const db = getSqliteDb();
    db.transaction(() => {
      db.prepare('DELETE FROM orders').run();
      const stmt = db.prepare(`
        INSERT INTO orders (
          주문번호, 종결여부, 주문일시, 거래처명, 상품코드, 컬러, 수량, 단가, 금액, 요청사항,
          발송날짜, 전표번호, 주문확인, 입금확인, 입금방식, 입금금액, 입금자, 출고상황, 발송처리,
          택배사, 운송장번호
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const o of orders) {
        stmt.run(
          o.주문번호 || '',
          o.종결여부 || 'n',
          o.주문일시 || '',
          o.거래처명 || '',
          o.상품코드 || '',
          o.컬러 || '',
          Number(o.수량) || 1,
          Number(o.단가) || 0,
          Number(o.금액) || 0,
          o.요청사항 || '',
          o.발송날짜 || '',
          o.전표번호 || '',
          o.주문확인 || 'n',
          o.입금확인 || '미입금',
          o.입금방식 || '',
          Number(o.입금금액) || 0,
          o.입금자 || '',
          o.출고상황 || '출고 대기',
          o.발송처리 || '',
          o.택배사 || '',
          o.운송장번호 || ''
        );
      }
    })();
    backupDbToZDrive();
    return true;
  } catch (e) {
    console.error('[DB] writeAllOrders 에러:', e);
    return false;
  }
}

export function readOrdersByCustomer(customerName: string): CustomerOrder[] {
  const allOrders = readAllOrders();
  return allOrders.filter(o => o.거래처명.toLowerCase().trim() === customerName.toLowerCase().trim());
}

export function generateOrderNo(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000); // 4자리 난수
  return `O${yy}${mm}${dd}${random}`;
}

export function writeOrderToExcel(customerName: string, items: OrderItem[], memo?: string, orderNo?: string): boolean {
  const existingOrders = readAllOrders();
  const orderNoToUse = orderNo || generateOrderNo();
  const orderTimestamp = new Date().toLocaleString('ko-KR');

  const products = readProductsDb();
  const productMap = new Map<string, Product>();
  products.forEach(p => {
    if (p.상품명) {
      productMap.set(p.상품명.toLowerCase().trim(), p);
    }
  });

  const { customers } = readExcelData();
  const customerGradeMap = new Map<string, string>();
  customers.forEach(c => {
    customerGradeMap.set(c.거래처명.toLowerCase().trim(), c.거래처등급);
  });

  const grade = customerGradeMap.get(customerName.toLowerCase().trim()) || 'C';

  const newOrderRows: CustomerOrder[] = items.map(item => {
    const prodName = item.productCode.toLowerCase().trim();
    const product = productMap.get(prodName);
    
    let unitPrice = 0;
      if (product) {
        const trimmedGrade = grade.trim().toUpperCase();
        if (trimmedGrade === 'S') unitPrice = product.S등급가;
        else if (trimmedGrade === 'A') unitPrice = product.A등급;
        else if (trimmedGrade === 'B') unitPrice = product.B등급;
        else if (trimmedGrade === 'C') unitPrice = product.C등급;
        else if (trimmedGrade === 'W') unitPrice = product.W등급가 || 0;
        else if (trimmedGrade === '일반등급' || trimmedGrade === '일반') unitPrice = product.도매가;
        
        if (!unitPrice || unitPrice === 0) {
          unitPrice = product.도매가 || 0;
        }
      }

    return {
      주문번호: orderNoToUse,
      종결여부: 'n',
      주문일시: orderTimestamp,
      거래처명: customerName,
      상품코드: item.productCode,
      컬러: item.color,
      수량: Number(item.quantity || 1),
      단가: unitPrice,
      금액: unitPrice * Number(item.quantity || 1),
      요청사항: memo || '',
      발송날짜: '',
      전표번호: '',
      주문확인: 'n',
      입금확인: '미입금',
      입금방식: '',
      입금금액: 0,
      입금자: '',
      출고상황: '출고 대기',
      발송처리: '',
      택배사: '',
      운송장번호: ''
    };
  });

  const mergedOrders = [...existingOrders, ...newOrderRows];
  return writeAllOrders(mergedOrders);
}

// ----------------------------------------------------
// Excel Import/Export Fallback & Sync
// ----------------------------------------------------
export function readProductsFromExcel(): Product[] {
  const excelPath = getExcelPath();
  if (!fs.existsSync(excelPath)) {
    console.warn('[DB] Master.xlsx 파일이 존재하지 않아 상품 마스터를 읽을 수 없습니다.');
    return [];
  }

  try {
    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    
    if (workbook.Sheets['상품 마스터']) {
      const rawProducts = sheetToSanitizedJson<any>(workbook.Sheets['상품 마스터']);
      return rawProducts.map(p => formatProduct(p));
    }
  } catch (error) {
    console.error('[DB] Master.xlsx 파일의 상품 마스터 시트 파싱 중 오류 발생:', error);
  }
  return [];
}

export function saveProductsToExcel(products: Product[]): boolean {
  const excelPath = getExcelPath();
  try {
    let workbook: xlsx.WorkBook;
    if (fs.existsSync(excelPath)) {
      const fileBuffer = fs.readFileSync(excelPath);
      workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    } else {
      workbook = xlsx.utils.book_new();
    }

    const formatted = products.map(p => formatProduct(p));
    const productSheet = xlsx.utils.json_to_sheet(formatted);

    workbook.Sheets['상품 마스터'] = productSheet;
    if (!workbook.SheetNames.includes('상품 마스터')) {
      workbook.SheetNames.push('상품 마스터');
    }

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(excelPath, buffer);
    return true;
  } catch (error) {
    console.error('[DB] Master.xlsx 상품 마스터 시트 저장 중 오류 발생:', error);
    return false;
  }
}

export function saveColorsToExcel(colors: ColorMaster[]): boolean {
  const excelPath = getExcelPath();
  try {
    let workbook: xlsx.WorkBook;
    if (fs.existsSync(excelPath)) {
      const fileBuffer = fs.readFileSync(excelPath);
      workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    } else {
      workbook = xlsx.utils.book_new();
    }
    const rows = colors.map(c => ({
      컬러: c.컬러,
      표기컬러: c.표기컬러
    }));
    const colorSheet = xlsx.utils.json_to_sheet(rows);
    workbook.Sheets['컬러마스터'] = colorSheet;
    if (!workbook.SheetNames.includes('컬러마스터')) {
      workbook.SheetNames.push('컬러마스터');
    }
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(excelPath, buffer);
    return true;
  } catch (e) {
    console.error('[DB] Failed to save colors to excel:', e);
    return false;
  }
}

export function readExcelData(): { 
  customers: Customer[]; 
  products: Product[];
  items: ItemMaster[];
  colors: ColorMaster[];
  categories: CategoryMaster[];
} {
  const db = getSqliteDb();
  try {
    const products = readProductsDb();
    const customers = readCustomersDb();

    const items = db.prepare('SELECT * FROM items').all().map((i: any) => ({
      아이템: i.아이템,
      표기: i.표기
    }));

    const colors = db.prepare('SELECT * FROM colors').all().map((c: any) => ({
      컬러: c.컬러,
      표기컬러: c.표기컬러
    }));

    const categories = db.prepare('SELECT * FROM categories').all().map((c: any) => ({
      카테고리: c.카테고리,
      등급: c.등급,
      환율: Number(c.환율),
      물류비: Number(c.물류비),
      마진율: c.마진율 !== null ? Number(c.마진율) : undefined,
      S등급비율: c.S등급비율 !== null ? Number(c.S등급비율) : undefined,
      A등급비율: c.A등급비율 !== null ? Number(c.A등급비율) : undefined,
      B등급비율: c.B등급비율 !== null ? Number(c.B등급비율) : undefined,
      C등급비율: c.C등급비율 !== null ? Number(c.C등급비율) : undefined,
      W등급비율: c.W등급비율 !== null ? Number(c.W등급비율) : undefined,
    }));

    return { customers, products, items, colors, categories };
  } catch (error) {
    console.error('[DB] readExcelData 에러:', error);
    return { customers: [], products: [], items: [], colors: [], categories: [] };
  }
}
