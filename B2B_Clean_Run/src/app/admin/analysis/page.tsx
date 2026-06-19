'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3, RefreshCw, Search } from 'lucide-react';
import { clearAdminAuthCache, hasFreshAdminAuthCache, markAdminAuthenticated, prefetchAdminRoutes, verifyAdminStatus } from '@/lib/adminClient';
import { CartSnapshotItem, Customer, CustomerOrder, Product } from '@/lib/db';

type AnalysisMode = 'sales' | 'cart';
type GroupMode = 'product' | 'color' | 'customer' | 'week';

type AnalysisRecord = {
  source: AnalysisMode;
  date: string;
  customerName: string;
  productCode: string;
  color: string;
  quantity: number;
  amount: number;
  week: string;
  season: string;
  item: string;
  category: string;
  productName: string;
  updatedAt?: string;
};

type GroupedRow = {
  key: string;
  label: string;
  productCode: string;
  productName: string;
  color: string;
  week: string;
  season: string;
  item: string;
  category: string;
  quantity: number;
  amount: number;
  customerCount: number;
  productCount: number;
  colorCount: number;
  lastDate: string;
};

const today = new Date().toISOString().slice(0, 10);

function normalizeKey(value: string) {
  return String(value || '').trim().toLowerCase();
}

function parseDatePart(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';

  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const dotted = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (dotted) return `${dotted[1]}-${dotted[2].padStart(2, '0')}-${dotted[3].padStart(2, '0')}`;

  const slash = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;

  return '';
}

function resolveProductPrice(product: Product | undefined) {
  if (!product) return 0;
  return Number(product.도매가 || product.C등급 || product.B등급 || product.A등급 || product.S등급가 || 0);
}

function makeProductMap(products: Product[]) {
  const map = new Map<string, Product>();
  products.forEach(product => {
    if (product.임시코드) map.set(normalizeKey(product.임시코드), product);
    if (product.상품명) map.set(normalizeKey(product.상품명), product);
  });
  return map;
}

function formatMoney(value: number) {
  return `${Math.round(value || 0).toLocaleString('ko-KR')}원`;
}

function matchesTextFilter(value: string, filter: string) {
  const normalizedFilter = normalizeKey(filter);
  if (!normalizedFilter) return true;
  return normalizeKey(value).includes(normalizedFilter);
}

function SearchableFilterInput({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-1.5">{label}</label>
      <div className="relative">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          list={id}
          placeholder={placeholder}
          className="w-full border border-neutral-200 px-2 py-1.5 pr-7 text-xs font-mono bg-white focus:outline-none focus:border-black"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-800 text-sm leading-none"
            aria-label={`${label} 초기화`}
          >
            x
          </button>
        )}
        <datalist id={id}>
          {options.map(option => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

export default function AdminAnalysisPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [cartSnapshots, setCartSnapshots] = useState<CartSnapshotItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('sales');
  const [groupMode, setGroupMode] = useState<GroupMode>('product');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [customerFilter, setCustomerFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [weekFrom, setWeekFrom] = useState('');
  const [weekTo, setWeekTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    prefetchAdminRoutes(router);

    async function verifyAdmin() {
      if (hasFreshAdminAuthCache()) {
        setIsAuthenticated(true);
        setLoadingAuth(false);
        verifyAdminStatus().then(authenticated => {
          if (!cancelled && !authenticated) {
            clearAdminAuthCache();
            router.push('/admin');
          }
        });
        return;
      }

      const authenticated = await verifyAdminStatus();
      if (cancelled) return;
      if (authenticated) {
        markAdminAuthenticated();
        setIsAuthenticated(true);
      } else {
        clearAdminAuthCache();
        router.push('/admin');
      }
      setLoadingAuth(false);
    }

    verifyAdmin();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/analysis', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || '분석 데이터를 불러오지 못했습니다.');
        return;
      }
      setOrders(data.orders || []);
      setCartSnapshots(data.cartSnapshots || []);
      setProducts(data.products || []);
      setCustomers(data.customers || []);
    } catch (error) {
      console.error('Failed to load analysis data:', error);
      alert('분석 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const productMap = useMemo(() => makeProductMap(products), [products]);
  const weekOptions = useMemo(() => Array.from(new Set(products.map(p => p.주차).filter((value): value is string => Boolean(value)))).sort(), [products]);
  const seasonOptions = useMemo(() => Array.from(new Set(products.map(p => p.시즌).filter((value): value is string => Boolean(value)))).sort(), [products]);
  const productOptions = useMemo(() => {
    const values = new Set<string>();
    products.forEach(product => {
      if (product.임시코드) values.add(product.임시코드);
      if (product.상품명) values.add(product.상품명);
      if (product.중국코드) values.add(product.중국코드);
    });
    return Array.from(values).sort();
  }, [products]);
  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    customers.forEach(c => c.거래처명 && names.add(c.거래처명));
    orders.forEach(o => o.거래처명 && names.add(o.거래처명));
    cartSnapshots.forEach(c => c.customerName && names.add(c.customerName));
    return Array.from(names).sort();
  }, [customers, orders, cartSnapshots]);

  const records = useMemo(() => {
    if (analysisMode === 'sales') {
      return orders.map(order => {
        const product = productMap.get(normalizeKey(order.상품코드));
        const quantity = Number(order.수량) || 0;
        const amount = Number(order.금액) || (resolveProductPrice(product) * quantity);
        return {
          source: 'sales' as const,
          date: parseDatePart(order.주문일시),
          customerName: order.거래처명 || '',
          productCode: order.상품코드 || '',
          color: order.컬러 || '',
          quantity,
          amount,
          week: product?.주차 || '',
          season: product?.시즌 || '',
          item: product?.아이템 || '',
          category: product?.카테고리 || '',
          productName: product?.상품명 || order.상품코드 || '',
        };
      });
    }

    return cartSnapshots.map(snapshot => {
      const product = productMap.get(normalizeKey(snapshot.productCode));
      const quantity = Number(snapshot.quantity) || 0;
      return {
        source: 'cart' as const,
        date: parseDatePart(snapshot.updatedAt),
        customerName: snapshot.customerName || '',
        productCode: snapshot.productCode || '',
        color: snapshot.color || '',
        quantity,
        amount: resolveProductPrice(product) * quantity,
        week: product?.주차 || '',
        season: product?.시즌 || '',
        item: product?.아이템 || '',
        category: product?.카테고리 || snapshot.category || '',
        productName: product?.상품명 || snapshot.productCode || '',
        updatedAt: snapshot.updatedAt,
      };
    });
  }, [analysisMode, orders, cartSnapshots, productMap]);

  const filteredRecords = useMemo(() => {
    const resolvedWeekFrom = weekFrom
      ? weekOptions.find(week => normalizeKey(week).startsWith(normalizeKey(weekFrom))) || weekFrom
      : '';
    const resolvedWeekTo = weekTo
      ? weekOptions.find(week => normalizeKey(week).startsWith(normalizeKey(weekTo))) || weekTo
      : '';

    return records.filter(record => {
      if (startDate && record.date && record.date < startDate) return false;
      if (endDate && record.date && record.date > endDate) return false;
      if (customerFilter && !matchesTextFilter(record.customerName, customerFilter)) return false;
      if (productFilter && ![
        record.productCode,
        record.productName,
        record.item,
      ].some(value => matchesTextFilter(value, productFilter))) return false;
      if (seasonFilter && !matchesTextFilter(record.season, seasonFilter)) return false;
      if (resolvedWeekFrom && record.week < resolvedWeekFrom) return false;
      if (resolvedWeekTo && record.week > resolvedWeekTo) return false;

      const query = searchTerm.trim().toLowerCase();
      if (query) {
        const haystack = [
          record.customerName,
          record.productCode,
          record.productName,
          record.color,
          record.item,
          record.week,
          record.season,
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [records, startDate, endDate, customerFilter, productFilter, seasonFilter, weekFrom, weekTo, weekOptions, searchTerm]);

  const groupedRows = useMemo<GroupedRow[]>(() => {
    const map = new Map<string, {
      row: GroupedRow;
      customers: Set<string>;
      products: Set<string>;
      colors: Set<string>;
    }>();

    const getGroup = (record: AnalysisRecord) => {
      if (groupMode === 'color') return `${record.productCode} / ${record.color || '미지정'}`;
      if (groupMode === 'customer') return record.customerName || '거래처 미지정';
      if (groupMode === 'week') return record.week || '주차 미지정';
      return record.productCode || record.productName || '상품 미지정';
    };

    filteredRecords.forEach(record => {
      const key = getGroup(record);
      if (!map.has(key)) {
        map.set(key, {
          row: {
            key,
            label: key,
            productCode: record.productCode,
            productName: record.productName,
            color: groupMode === 'color' ? record.color : '',
            week: record.week,
            season: record.season,
            item: record.item,
            category: record.category,
            quantity: 0,
            amount: 0,
            customerCount: 0,
            productCount: 0,
            colorCount: 0,
            lastDate: record.date,
          },
          customers: new Set(),
          products: new Set(),
          colors: new Set(),
        });
      }

      const entry = map.get(key)!;
      entry.row.quantity += record.quantity;
      entry.row.amount += record.amount;
      if (record.date && record.date > entry.row.lastDate) entry.row.lastDate = record.date;
      if (record.customerName) entry.customers.add(record.customerName);
      if (record.productCode) entry.products.add(record.productCode);
      if (record.color) entry.colors.add(record.color);
      entry.row.customerCount = entry.customers.size;
      entry.row.productCount = entry.products.size;
      entry.row.colorCount = entry.colors.size;
    });

    return Array.from(map.values())
      .map(entry => entry.row)
      .sort((a, b) => b.quantity - a.quantity || b.amount - a.amount);
  }, [filteredRecords, groupMode]);

  const totalQuantity = filteredRecords.reduce((sum, record) => sum + record.quantity, 0);
  const totalAmount = filteredRecords.reduce((sum, record) => sum + record.amount, 0);
  const activeCustomerCount = new Set(filteredRecords.map(record => record.customerName).filter(Boolean)).size;
  const activeProductCount = new Set(filteredRecords.map(record => record.productCode).filter(Boolean)).size;
  const maxQuantity = Math.max(...groupedRows.map(row => row.quantity), 1);

  const resetFilters = () => {
    setStartDate(today);
    setEndDate(today);
    setCustomerFilter('');
    setProductFilter('');
    setSeasonFilter('');
    setWeekFrom('');
    setWeekTo('');
    setSearchTerm('');
  };

  if (loadingAuth || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-xs text-neutral-400 font-mono tracking-widest uppercase">Verifying Admin Session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 flex flex-col">
      <header className="bg-white border-b border-neutral-100 h-16 flex items-center justify-between px-8 select-none">
        <button
          onClick={() => router.push('/')}
          className="flex items-center space-x-2 cursor-pointer hover:text-black transition-colors text-neutral-500"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono uppercase tracking-widest text-[10px]">Back to Shop</span>
        </button>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-mono text-neutral-600 hover:text-black hover:border-neutral-400 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </header>

      <main className="flex-1 p-6 md:p-12 space-y-6">
        <div className="flex border-b border-neutral-200 select-none mb-6 overflow-x-auto">
          {[
            ['/admin/products', '상품관리 마스터 (Products)'],
            ['/admin/orders', '주문관리 마스터 (Orders)'],
            ['/admin/analysis', '분석 마스터 (Analysis)'],
            ['/admin/ledger', '정산 마스터 (Ledger)'],
            ['/admin/customers', '거래처 마스터 (Customers)'],
          ].map(([href, label]) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 font-semibold cursor-pointer whitespace-nowrap ${
                href === '/admin/analysis'
                  ? 'border-black text-black'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 select-none">
          <div className="space-y-1">
            <h1 className="text-xl font-mono tracking-widest uppercase font-semibold text-black">ANALYSIS MASTER</h1>
            <p className="text-xs text-neutral-400 font-light leading-relaxed">
              판매 주문과 장바구니 수요를 기준별로 취합해 상품 대응 우선순위를 확인합니다.
            </p>
          </div>
          <div className="inline-flex border border-neutral-200 bg-white">
            <button
              onClick={() => setAnalysisMode('sales')}
              className={`px-4 py-2 text-xs font-mono font-semibold ${analysisMode === 'sales' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}
            >
              판매분석
            </button>
            <button
              onClick={() => setAnalysisMode('cart')}
              className={`px-4 py-2 text-xs font-mono font-semibold ${analysisMode === 'cart' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'}`}
            >
              장바구니분석
            </button>
          </div>
        </div>

        <div className="border border-neutral-200 bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <div className="xl:col-span-2">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-1.5">기간 설정</label>
              <div className="flex items-center gap-2">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-neutral-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-black" />
                <span className="text-neutral-400">~</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-neutral-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-black" />
              </div>
            </div>
            <SearchableFilterInput
              id="analysis-customer-options"
              label="판매처"
              value={customerFilter}
              onChange={setCustomerFilter}
              options={customerOptions}
              placeholder="판매처 입력..."
            />
            <SearchableFilterInput
              id="analysis-product-options"
              label="특정상품"
              value={productFilter}
              onChange={setProductFilter}
              options={productOptions}
              placeholder="품번/상품명 입력..."
            />
            <SearchableFilterInput
              id="analysis-season-options"
              label="시즌"
              value={seasonFilter}
              onChange={setSeasonFilter}
              options={seasonOptions}
              placeholder="시즌 입력..."
            />
            <div>
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-1.5">주차</label>
              <div className="flex gap-2">
                <div className="relative w-full">
                  <input
                    value={weekFrom}
                    onChange={e => setWeekFrom(e.target.value)}
                    list="analysis-week-options"
                    placeholder="시작"
                    className="w-full border border-neutral-200 px-2 py-1.5 pr-6 text-xs font-mono bg-white focus:outline-none focus:border-black"
                  />
                  {weekFrom && (
                    <button
                      type="button"
                      onClick={() => setWeekFrom('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-800 text-sm leading-none"
                      aria-label="시작 주차 초기화"
                    >
                      x
                    </button>
                  )}
                </div>
                <div className="relative w-full">
                  <input
                    value={weekTo}
                    onChange={e => setWeekTo(e.target.value)}
                    list="analysis-week-options"
                    placeholder="끝"
                    className="w-full border border-neutral-200 px-2 py-1.5 pr-6 text-xs font-mono bg-white focus:outline-none focus:border-black"
                  />
                  {weekTo && (
                    <button
                      type="button"
                      onClick={() => setWeekTo('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-800 text-sm leading-none"
                      aria-label="끝 주차 초기화"
                    >
                      x
                    </button>
                  )}
                </div>
                <datalist id="analysis-week-options">
                  {weekOptions.map(week => <option key={week} value={week} />)}
                </datalist>
              </div>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              {[
                ['product', '상품별'],
                ['color', '컬러별'],
                ['customer', '판매처별'],
                ['week', '주차별'],
              ].map(([mode, label]) => (
                <label key={mode} className="flex items-center gap-1.5 text-xs font-mono text-neutral-700 cursor-pointer">
                  <input
                    type="radio"
                    name="groupMode"
                    checked={groupMode === mode}
                    onChange={() => setGroupMode(mode as GroupMode)}
                    className="accent-black"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative w-full xl:w-80">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-400" />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="거래처, 상품, 컬러, 아이템 검색..."
                  className="w-full border border-neutral-200 pl-9 pr-3 py-2 text-xs font-mono focus:outline-none focus:border-black"
                />
              </div>
              <button onClick={resetFilters} className="border border-neutral-200 px-4 py-2 text-xs font-mono text-neutral-500 hover:text-black hover:border-neutral-400 whitespace-nowrap">
                초기화
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['총 수량', `${totalQuantity.toLocaleString('ko-KR')}개`],
            [analysisMode === 'sales' ? '판매금액' : '예상금액', formatMoney(totalAmount)],
            ['거래처 수', `${activeCustomerCount.toLocaleString('ko-KR')}곳`],
            ['상품 수', `${activeProductCount.toLocaleString('ko-KR')}개`],
          ].map(([label, value]) => (
            <div key={label} className="border border-neutral-200 bg-white p-4">
              <div className="text-[10px] text-neutral-400 font-mono tracking-widest uppercase">{label}</div>
              <div className="mt-2 text-lg font-semibold text-neutral-950">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          <div className="border border-neutral-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
              <div className="text-xs font-bold tracking-wider text-neutral-800">
                {analysisMode === 'sales' ? '판매 분석 집계' : '장바구니 수요 집계'}
              </div>
              <div className="text-[11px] text-neutral-400 font-mono">{groupedRows.length} rows</div>
            </div>
            <div className="overflow-auto max-h-[620px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-neutral-50 z-10">
                  <tr className="text-[10px] text-neutral-500 uppercase tracking-wider">
                    <th className="border-b border-r border-neutral-200 px-3 py-2 text-right w-12">No</th>
                    <th className="border-b border-r border-neutral-200 px-3 py-2 text-left">기준</th>
                    <th className="border-b border-r border-neutral-200 px-3 py-2 text-left">대표품명</th>
                    <th className="border-b border-r border-neutral-200 px-3 py-2 text-left">주차</th>
                    <th className="border-b border-r border-neutral-200 px-3 py-2 text-left">시즌</th>
                    <th className="border-b border-r border-neutral-200 px-3 py-2 text-right">수량</th>
                    <th className="border-b border-r border-neutral-200 px-3 py-2 text-right">금액</th>
                    <th className="border-b border-r border-neutral-200 px-3 py-2 text-right">거래처</th>
                    <th className="border-b border-neutral-200 px-3 py-2 text-left">최근일</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="text-center py-16 text-neutral-400 font-mono">Loading analysis database...</td></tr>
                  ) : groupedRows.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-16 text-neutral-400 font-mono">조건에 맞는 데이터가 없습니다.</td></tr>
                  ) : (
                    groupedRows.map((row, index) => (
                      <tr key={row.key} className={index < 5 ? 'bg-amber-50/45' : 'hover:bg-neutral-50'}>
                        <td className="border-b border-r border-neutral-100 px-3 py-2 text-right text-neutral-400">{index + 1}</td>
                        <td className="border-b border-r border-neutral-100 px-3 py-2 font-semibold text-neutral-900">{row.label}</td>
                        <td className="border-b border-r border-neutral-100 px-3 py-2">{row.productName || '-'}</td>
                        <td className="border-b border-r border-neutral-100 px-3 py-2 font-mono">{row.week || '-'}</td>
                        <td className="border-b border-r border-neutral-100 px-3 py-2 font-mono">{row.season || '-'}</td>
                        <td className="border-b border-r border-neutral-100 px-3 py-2 text-right font-semibold">{row.quantity.toLocaleString('ko-KR')}</td>
                        <td className="border-b border-r border-neutral-100 px-3 py-2 text-right font-mono">{formatMoney(row.amount)}</td>
                        <td className="border-b border-r border-neutral-100 px-3 py-2 text-right">{row.customerCount}</td>
                        <td className="border-b border-neutral-100 px-3 py-2 font-mono text-neutral-500">{row.lastDate || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-neutral-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-neutral-800 border-b border-neutral-100 pb-3">
              <BarChart3 className="w-4 h-4" />
              상위 흐름
            </div>
            <div className="space-y-3">
              {groupedRows.slice(0, 10).map((row, index) => (
                <div key={row.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="truncate font-medium text-neutral-800">{index + 1}. {row.label}</span>
                    <span className="font-mono text-neutral-500">{row.quantity.toLocaleString('ko-KR')}개</span>
                  </div>
                  <div className="h-2 bg-neutral-100">
                    <div className="h-2 bg-neutral-900" style={{ width: `${Math.max(5, Math.round((row.quantity / maxQuantity) * 100))}%` }} />
                  </div>
                </div>
              ))}
              {!loading && groupedRows.length === 0 && (
                <div className="py-12 text-center text-xs text-neutral-400">표시할 순위가 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
