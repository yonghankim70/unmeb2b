import type {
  CartSnapshotItem,
  CategoryMaster,
  ColorMaster,
  Customer,
  CustomerOrder,
  GlobalSettings,
  ItemMaster,
  LoginLog,
  OrderItem,
  PaymentLog,
  Product,
} from './dataTypes';

export type {
  CartSnapshotItem,
  CategoryMaster,
  ColorMaster,
  Customer,
  CustomerOrder,
  GlobalSettings,
  ItemMaster,
  LoginLog,
  OrderItem,
  PaymentLog,
  Product,
} from './dataTypes';
export { formatProduct } from './dataTypes';

function localDb(): any {
  if (process.env.B2B_DB_MODE === 'd1') {
    throw new Error('로컬 DB 함수는 D1 클라우드 모드에서 사용할 수 없습니다.');
  }

  const requireLocal = (0, eval)('require') as NodeRequire;
  return requireLocal('./localDb');
}

export function getDbPath(): string {
  return localDb().getDbPath();
}

export function getExcelPath(): string {
  return localDb().getExcelPath();
}

export function getOrdersExcelPath(): string {
  return localDb().getOrdersExcelPath();
}

export function getProductsDbPath(): string {
  return localDb().getProductsDbPath();
}

export function getColorsDbPath(): string {
  return localDb().getColorsDbPath();
}

export function getOrdersDbPath(): string {
  return localDb().getOrdersDbPath();
}

export function getCustomersDbPath(): string {
  return localDb().getCustomersDbPath();
}

export function getPaymentsDbPath(): string {
  return localDb().getPaymentsDbPath();
}

export function readProductsDb(): Product[] {
  return localDb().readProductsDb();
}

export function readCustomersDb(): Customer[] {
  return localDb().readCustomersDb();
}

export function readCustomersFromMasterExcel(): Customer[] {
  return localDb().readCustomersFromMasterExcel();
}

export function writeProductsDb(products: Product[]): boolean {
  return localDb().writeProductsDb(products);
}

export function saveProducts(products: Product[]): boolean {
  return localDb().saveProducts(products);
}

export function writeProducts(products: Product[]): boolean {
  return localDb().writeProducts(products);
}

export function saveCategories(categories: CategoryMaster[]): boolean {
  return localDb().saveCategories(categories);
}

export function writeCustomers(customers: Customer[]): boolean {
  return localDb().writeCustomers(customers);
}

export function saveCustomersToExcel(customers: Customer[]): boolean {
  return localDb().saveCustomersToExcel(customers);
}

export function readAllLoginLogs(startDate?: string, endDate?: string): LoginLog[] {
  return localDb().readAllLoginLogs(startDate, endDate);
}

export function recordCustomerLogin(customerName: string): boolean {
  return localDb().recordCustomerLogin(customerName);
}

export function readGlobalSettings(): GlobalSettings {
  return localDb().readGlobalSettings();
}

export function writeGlobalSettings(settings: GlobalSettings): boolean {
  return localDb().writeGlobalSettings(settings);
}

export function readAllPayments(): PaymentLog[] {
  return localDb().readAllPayments();
}

export function writeAllPayments(payments: PaymentLog[]): boolean {
  return localDb().writeAllPayments(payments);
}

export function writePayment(payment: PaymentLog): boolean {
  return localDb().writePayment(payment);
}

export function readCartSnapshots(): CartSnapshotItem[] {
  return localDb().readCartSnapshots();
}

export function writeCartSnapshot(customerName: string, items: Omit<CartSnapshotItem, 'customerName' | 'updatedAt'>[]): boolean {
  return localDb().writeCartSnapshot(customerName, items);
}

export function clearOrderedCartSnapshotItems(customerName: string, items: OrderItem[]): boolean {
  return localDb().clearOrderedCartSnapshotItems(customerName, items);
}

export function readAllOrders(): CustomerOrder[] {
  return localDb().readAllOrders();
}

export function writeAllOrders(orders: CustomerOrder[]): boolean {
  return localDb().writeAllOrders(orders);
}

export function readOrdersByCustomer(customerName: string): CustomerOrder[] {
  return localDb().readOrdersByCustomer(customerName);
}

export function generateOrderNo(): string {
  return localDb().generateOrderNo();
}

export function writeOrderToExcel(customerName: string, items: OrderItem[], memo?: string, orderNo?: string): boolean {
  return localDb().writeOrderToExcel(customerName, items, memo, orderNo);
}

export function readProductsFromExcel(): Product[] {
  return localDb().readProductsFromExcel();
}

export function saveProductsToExcel(products: Product[]): boolean {
  return localDb().saveProductsToExcel(products);
}

export function saveColorsToExcel(colors: ColorMaster[]): boolean {
  return localDb().saveColorsToExcel(colors);
}

export function readExcelData(): {
  customers: Customer[];
  products: Product[];
  items: ItemMaster[];
  colors: ColorMaster[];
  categories: CategoryMaster[];
} {
  return localDb().readExcelData();
}
