'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Customer } from '@/lib/db';
import { clearAdminAuthCache, hasFreshAdminAuthCache, markAdminAuthenticated, prefetchAdminRoutes, verifyAdminStatus } from '@/lib/adminClient';
import { 
  ArrowLeft, RefreshCw, Save, Plus, Search, 
  Trash2, Eye, EyeOff, UserPlus, Info
} from 'lucide-react';

const DEFAULT_CUSTOMER_GRADE_OPTIONS = ['S', 'A', 'B', 'C', 'W', '일반등급'];

function getCustomerKey(customer?: Customer): string {
  return String(customer?.거래처명 || '').trim();
}

function mergeCustomerGradeOptions(options: unknown): string[] {
  const serverOptions = Array.isArray(options)
    ? options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...DEFAULT_CUSTOMER_GRADE_OPTIONS, ...serverOptions]));
}

function getCustomerGradeLabel(grade: string): string {
  return grade === '일반등급' ? '일반등급' : `${grade} 등급`;
}

function normalizeCustomerForView(customer: Customer): Customer {
  return {
    ...customer,
    거래처명: getCustomerKey(customer),
    접속코드: customer.접속코드 || '',
    거래처등급: customer.거래처등급 || 'C',
    텔레그램ID: customer.텔레그램ID || '',
    결제방식: customer.결제방식 || '당일결제',
    세금계산서발행: customer.세금계산서발행 || '미발행',
    로그인차단: customer.로그인차단 || 'n',
    쥔장장바구니허락: customer.쥔장장바구니허락 || 'n',
    최근접속일: customer.최근접속일 || '',
  };
}

function normalizeCustomerForSave(customer: Customer): Customer {
  return {
    거래처명: getCustomerKey(customer),
    접속코드: customer.접속코드 || '',
    거래처등급: customer.거래처등급 || 'C',
    텔레그램ID: customer.텔레그램ID || '',
    결제방식: customer.결제방식 || '당일결제',
    세금계산서발행: customer.세금계산서발행 || '미발행',
    로그인차단: customer.로그인차단 || 'n',
    쥔장장바구니허락: customer.쥔장장바구니허락 || 'n',
    최근접속일: customer.최근접속일 || '',
  };
}

export default function AdminCustomersPage() {
  const router = useRouter();

  // Authentication guard
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [originalCustomers, setOriginalCustomers] = useState<Customer[]>([]);
  const [customerGradeOptions, setCustomerGradeOptions] = useState<string[]>(DEFAULT_CUSTOMER_GRADE_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Search
  const [searchTerm, setSearchTerm] = useState('');

  // Date Range States for Login Logs Filter
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Active Login Logs Modal Viewer State
  const [activeLogCustomer, setActiveLogCustomer] = useState<{ name: string; logs: string[] } | null>(null);

  // Password visibility state by index
  const [passwordVisibility, setPasswordVisibility] = useState<{ [key: number]: boolean }>({});

  // Track newly added row indices (to allow editing their Customer Name)
  const [newRowIndices, setNewRowIndices] = useState<Set<number>>(new Set());
  const [dirtyCustomerKeys, setDirtyCustomerKeys] = useState<string[]>([]);
  const [deletedCustomerNames, setDeletedCustomerNames] = useState<string[]>([]);

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

      if (!cancelled) {
        setLoadingAuth(false);
      }
    }

    verifyAdmin();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Load all customers with login log query period parameters
  const loadCustomers = async (start = startDate, end = endDate) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers?startDate=${start}&endDate=${end}`);
      const data = await res.json();
      if (data.success) {
        const loadedCustomers = Array.isArray(data.customers)
          ? data.customers.map((customer: Customer) => normalizeCustomerForView(customer))
          : [];
        setCustomers(loadedCustomers);
        setOriginalCustomers(JSON.parse(JSON.stringify(loadedCustomers)));
        setCustomerGradeOptions(mergeCustomerGradeOptions(data.globalSettings?.customerGradeOptions));
        setNewRowIndices(new Set());
        setDirtyCustomerKeys([]);
        setDeletedCustomerNames([]);
        setPasswordVisibility({});
      }
    } catch (e) {
      console.error('Failed to load customers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadCustomers(startDate, endDate);
    }
  }, [isAuthenticated, startDate, endDate]);

  // Handle save customers list
  const handleSaveCustomers = async () => {
    const normalizedCustomers = customers.map((customer) => normalizeCustomerForView(customer));

    // Validation
    const invalidRows = normalizedCustomers.filter(c => !getCustomerKey(c));
    if (invalidRows.length > 0) {
      alert('거래처명은 빈칸으로 둘 수 없습니다. 모든 행의 거래처명을 채워주세요.');
      return;
    }

    // Duplicate check
    const names = normalizedCustomers.map(c => getCustomerKey(c).toLowerCase());
    const duplicates = names.filter((item, index) => names.indexOf(item) !== index);
    if (duplicates.length > 0) {
      alert(`중복된 거래처명이 있습니다: ${Array.from(new Set(duplicates)).join(', ')}\n거래처명은 고유해야 합니다.`);
      return;
    }

    const originalKeys = new Set(originalCustomers.map((customer) => getCustomerKey(customer).toLowerCase()).filter(Boolean));
    const dirtyKeys = new Set(dirtyCustomerKeys.map((name) => name.toLowerCase()));
    const changedCustomers = normalizedCustomers
      .filter((customer) => {
        const key = getCustomerKey(customer).toLowerCase();
        return dirtyKeys.has(key) || !originalKeys.has(key);
      })
      .map(normalizeCustomerForSave);
    const deletedNames = Array.from(new Set(deletedCustomerNames.map((name) => name.trim()).filter(Boolean)));

    if (changedCustomers.length === 0 && deletedNames.length === 0) {
      alert('변경된 거래처 정보가 없습니다.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customers: changedCustomers,
          deletedCustomerNames: deletedNames,
          replaceAllCustomers: false,
        })
      });
      const data = await res.json();
      if (data.success) {
        const savedCount = Number(data.savedCustomerCount ?? changedCustomers.length);
        const deletedCount = Number(data.deletedCustomerCount ?? deletedNames.length);
        alert(`거래처 마스터가 반영되었습니다.\n수정/추가: ${savedCount}개\n삭제: ${deletedCount}개`);
        loadCustomers();
      } else {
        alert(data.message || '저장 실패');
      }
    } catch (err) {
      console.error(err);
      alert('서버 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // Add new blank customer row
  const handleAddCustomer = () => {
    const newRow: Customer = {
      거래처명: '',
      접속코드: '',
      거래처등급: 'C',
      텔레그램ID: '',
      결제방식: '당일결제',
      세금계산서발행: '미발행',
      로그인차단: 'n',
      쥔장장바구니허락: 'n',
      최근접속일: ''
    };
    const updated = [...customers, newRow];
    const newIndex = updated.length - 1;
    
    setCustomers(updated);
    
    // Mark this index as new
    setNewRowIndices(prev => {
      const next = new Set(prev);
      next.add(newIndex);
      return next;
    });

    // Make password visible by default for new rows
    setPasswordVisibility(prev => ({
      ...prev,
      [newIndex]: true
    }));
  };

  // Delete customer row
  const handleDeleteCustomer = (index: number) => {
    const cust = customers[index];
    const confirmMsg = cust.거래처명 
      ? `정말로 거래처 [${cust.거래처명}] 정보를 마스터에서 완전히 삭제하시겠습니까?\n이 거래처의 기존 주문 내역 및 정산 잔액 등에는 영향을 주지 않지만, 로그인 및 신규 정산 추적이 제한될 수 있습니다.`
      : '작성 중이던 거래처 행을 삭제하시겠습니까?';

    if (!confirm(confirmMsg)) return;

    const updated = customers.filter((_, i) => i !== index);
    setCustomers(updated);

    const customerName = getCustomerKey(cust);
    const persisted = originalCustomers.some((customer) => getCustomerKey(customer).toLowerCase() === customerName.toLowerCase());
    if (customerName && persisted) {
      setDeletedCustomerNames(prev => Array.from(new Set([...prev, customerName])));
    }
    if (customerName) {
      setDirtyCustomerKeys(prev => prev.filter((name) => name.toLowerCase() !== customerName.toLowerCase()));
    }

    // Adjust newRowIndices
    setNewRowIndices(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) {
          next.add(idx);
        } else if (idx > index) {
          next.add(idx - 1);
        }
      });
      return next;
    });
  };

  // Field change handler
  const handleFieldChange = (index: number, field: keyof Customer, value: string) => {
    const updated = [...customers];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setCustomers(updated);

    const key = getCustomerKey(updated[index]);
    if (key) {
      setDirtyCustomerKeys(prev => Array.from(new Set([...prev, key])));
      setDeletedCustomerNames(prev => prev.filter((name) => name.toLowerCase() !== key.toLowerCase()));
    }
  };

  // Password visibility toggle handler
  const togglePasswordVisibility = (index: number) => {
    setPasswordVisibility(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Filter based on search term
  const filteredCustomers = customers.map((c, originalIdx) => ({ ...c, originalIdx })).filter(item => {
    return getCustomerKey(item).toLowerCase().includes(searchTerm.toLowerCase()) ||
           (item.텔레그램ID || '').includes(searchTerm);
  });

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="flex flex-col items-center space-y-3">
          <RefreshCw className="w-6 h-6 text-neutral-400 animate-spin" />
          <span className="text-xs text-neutral-400 font-mono">Authenticating...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Top Header Bar */}
      <header className="border-b border-neutral-200 py-4 px-6 md:px-12 flex justify-between items-center text-xs tracking-wider font-light text-neutral-500 select-none bg-neutral-50">
        <div 
          className="flex items-center space-x-2 cursor-pointer hover:text-black transition-colors" 
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono uppercase tracking-widest text-[10px]">
            Back to Shop
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <button 
            onClick={() => loadCustomers(startDate, endDate)}
            className="flex items-center space-x-1.5 hover:text-black transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>새로고침</span>
          </button>
          
          <button 
            onClick={handleSaveCustomers}
            disabled={saving}
            className="flex items-center space-x-1.5 bg-black text-white px-5 py-1.5 text-xs font-semibold hover:bg-neutral-800 transition-colors uppercase tracking-wider"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? '저장 중...' : '저장'}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 md:p-12 space-y-6">
        
        {/* 어드민 대시보드 공용 탭 */}
        <div className="flex border-b border-neutral-200 select-none mb-6">
          <button
            onClick={() => router.push('/admin/products')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            상품관리 마스터 (Products)
          </button>
          <button
            onClick={() => router.push('/admin/orders')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            주문관리 마스터 (Orders)
          </button>
          <button
            onClick={() => router.push('/admin/analysis')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            분석 마스터 (Analysis)
          </button>
          <button
            onClick={() => router.push('/admin/ledger')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            정산 마스터 (Ledger)
          </button>
          <button
            onClick={() => router.push('/admin/customers')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-black text-black font-semibold cursor-pointer"
          >
            거래처 마스터 (Customers)
          </button>
        </div>

        {/* Page Title & Desc */}
        <div className="space-y-1">
          <h1 className="text-xl font-mono tracking-widest uppercase font-semibold text-black">
            CUSTOMER MASTER MANAGEMENT
          </h1>
          <p className="text-xs text-neutral-400 font-light leading-relaxed">
            운영 데이터베이스에 연동되어 있는 거래처 마스터 정보를 직접 관리합니다.<br />
            거래처 등급에 따른 도매 가격 필터링, 로그인 접속용 비밀번호 코드, 텔레그램 실시간 안내 알림방 챗 아이디(Chat ID)를 입력할 수 있습니다.
          </p>
        </div>

        {/* Alert/Info Banner */}
        <div className="bg-blue-50/50 border border-blue-100 p-4 flex gap-3 text-xs leading-relaxed text-blue-800">
          <Info className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">📢 텔레그램 알림 봇 연동 방법</p>
            <p className="font-light">
              1. 텔레그램에서 연동 봇(<b>@U_ME_B2B_bot</b> 등)을 검색하여 사용자가 <b>[시작]</b> 버튼을 먼저 눌러야 합니다.<br />
              2. 봇과 연결된 고객의 대화방 <b>Chat ID(숫자)</b>를 텔레그램 아이디 란에 적어주시고 <b>[저장]</b>을 눌러주세요.<br />
              3. 텔레그램 ID가 입력된 파트너사는 주문 저장 시 <b>[주문 확인]</b> 및 <b>[오더 진행]</b> 메시지를 텔레그램으로 자동 수신하게 됩니다.
            </p>
          </div>
        </div>

        {/* Date / Month Picker Filter Block */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 select-none bg-neutral-50 p-4 border border-neutral-200 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            {/* 접속기록 기간 설정 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">접속기록 조회기간 설정</label>
              <div className="flex items-center space-x-2">
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="p-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs font-mono rounded-none"
                />
                <span className="text-neutral-400">~</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="p-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs font-mono rounded-none"
                />
              </div>
            </div>

            {/* Quick selectors */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">간편 선택</label>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    setStartDate(`${yyyy}-${mm}-01`);
                    const dd = String(today.getDate()).padStart(2, '0');
                    setEndDate(`${yyyy}-${mm}-${dd}`);
                  }}
                  className="px-2.5 py-1.5 bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors rounded-none font-medium"
                >
                  이번달
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    today.setMonth(today.getMonth() - 1);
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    setStartDate(`${yyyy}-${mm}-01`);
                    const lastDay = new Date(yyyy, today.getMonth() + 1, 0).getDate();
                    setEndDate(`${yyyy}-${mm}-${lastDay}`);
                  }}
                  className="px-2.5 py-1.5 bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors rounded-none font-medium"
                >
                  지난달
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('2026-01-01');
                    const today = new Date();
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    const dd = String(today.getDate()).padStart(2, '0');
                    setEndDate(`${yyyy}-${mm}-${dd}`);
                  }}
                  className="px-2.5 py-1.5 bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors rounded-none font-medium"
                >
                  올해 전체
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Header Options */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 select-none">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
            <input 
              type="text" 
              placeholder="거래처명, 텔레그램 ID 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs font-mono rounded-none"
            />
          </div>
          
          <div className="flex items-center text-xs font-mono" style={{ gap: '24px' }}>
            <div className="text-neutral-400">
              등록된 거래처 수: <span className="font-bold text-neutral-700">{customers.length}개</span>
            </div>
            <button
              onClick={handleAddCustomer}
              className="flex items-center bg-black text-white hover:bg-neutral-850 px-4 py-2 text-xs font-semibold rounded-none transition-colors"
              style={{ gap: '6px' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>신규 거래처 추가</span>
            </button>
          </div>
        </div>

        {/* Customers Edit Table */}
        {loading ? (
          <div className="h-64 flex items-center justify-center text-xs text-neutral-400 font-mono tracking-widest uppercase">
            Loading customers database...
          </div>
        ) : (
          <div className="border border-neutral-200 overflow-x-auto shadow-sm">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-500 tracking-wider select-none uppercase">
                  <th className="py-3 px-4 border-r border-neutral-200 w-12 text-center">No</th>
                  <th className="py-3 px-4 border-r border-neutral-200">거래처명</th>
                  <th className="py-3 px-4 border-r border-neutral-200 w-36">비밀번호 (접속코드)</th>
                  <th className="py-3 px-4 border-r border-neutral-200 w-28 text-center">거래처 등급</th>
                  <th className="py-3 px-4 border-r border-neutral-200 w-28 text-center">결제방식</th>
                  <th className="py-3 px-4 border-r border-neutral-200 w-24 text-center">세금계산서</th>
                  <th className="py-3 px-4 border-r border-neutral-200 w-40">텔레그램 ID (Chat ID)</th>
                  <th className="py-3 px-4 border-r border-neutral-200 w-28 text-center">쥔장장바구니</th>
                  <th className="py-3 px-4 border-r border-neutral-200 w-24 text-center">로그인차단</th>
                  <th className="py-3 px-4 border-r border-neutral-200 w-44">최근접속 / 로그인 기록</th>
                  <th className="py-3 px-4 w-16 text-center">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-neutral-400 font-light italic bg-white text-xs">
                      등록된 거래처 데이터가 없거나 검색 조건과 일치하지 않습니다.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((item, rowIdx) => {
                    const originalIdx = item.originalIdx;
                    const isNew = newRowIndices.has(originalIdx);
                    const isPassVisible = passwordVisibility[originalIdx] || false;

                    return (
                      <tr key={rowIdx} className="hover:bg-neutral-50/50 transition-colors">
                        
                        {/* 1. 번호 */}
                        <td className="py-2.5 px-4 border-r border-neutral-200 text-center text-neutral-400 font-mono">
                          {rowIdx + 1}
                        </td>

                        {/* 2. 거래처명 */}
                        <td className="py-2.5 px-4 border-r border-neutral-200">
                          {isNew ? (
                            <input 
                              type="text"
                              value={item.거래처명}
                              placeholder="신규 거래처명 입력"
                              onChange={(e) => handleFieldChange(originalIdx, '거래처명', e.target.value)}
                              className="w-full py-1 px-1.5 border border-neutral-200 bg-white font-semibold text-neutral-900 focus:outline-none focus:border-black rounded-none"
                            />
                          ) : (
                            <span className="font-semibold text-neutral-900">{item.거래처명}</span>
                          )}
                        </td>

                        {/* 3. 비밀번호 (접속코드) */}
                        <td className="py-2.5 px-4 border-r border-neutral-200">
                          <div className="relative flex items-center gap-1.5">
                            <input 
                              type={isPassVisible ? 'text' : 'password'}
                              value={item.접속코드}
                              placeholder="접속 비밀번호"
                              onChange={(e) => handleFieldChange(originalIdx, '접속코드', e.target.value)}
                              className="flex-1 py-1 pl-1.5 pr-8 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(originalIdx)}
                              className="absolute right-2 text-neutral-400 hover:text-neutral-700"
                              title={isPassVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                            >
                              {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        {/* 4. 거래처 등급 */}
                        <td className="py-2.5 px-4 border-r border-neutral-200 text-center">
                          <select
                            value={item.거래처등급 || 'C'}
                            onChange={(e) => handleFieldChange(originalIdx, '거래처등급', e.target.value)}
                            className="w-full py-1 px-1 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none text-center font-bold text-neutral-700 text-[11px]"
                          >
                            {customerGradeOptions.map((grade) => (
                              <option key={grade} value={grade}>{getCustomerGradeLabel(grade)}</option>
                            ))}
                          </select>
                        </td>

                        {/* 5. 결제방식 */}
                        <td className="py-2.5 px-4 border-r border-neutral-200 text-center">
                          <select
                            value={item.결제방식 || '당일결제'}
                            onChange={(e) => handleFieldChange(originalIdx, '결제방식', e.target.value)}
                            className="w-full py-1 px-1 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none text-center text-neutral-700 text-[11px]"
                          >
                            <option value="당일결제">당일결제</option>
                            <option value="주결제">주결제</option>
                            <option value="15일결제">15일결제</option>
                            <option value="1달 결제">1달 결제</option>
                          </select>
                        </td>

                        {/* 6. 세금계산서 발행 */}
                        <td className="py-2.5 px-4 border-r border-neutral-200 text-center">
                          <select
                            value={item.세금계산서발행 || '미발행'}
                            onChange={(e) => handleFieldChange(originalIdx, '세금계산서발행', e.target.value)}
                            className="w-full py-1 px-1 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none text-center text-neutral-700 text-[11px]"
                          >
                            <option value="미발행">미발행</option>
                            <option value="발행">발행</option>
                          </select>
                        </td>

                        {/* 7. 텔레그램 ID */}
                        <td className="py-2.5 px-4 border-r border-neutral-200">
                          <input 
                            type="text"
                            value={item.텔레그램ID || ''}
                            placeholder="숫자 Chat ID 입력"
                            onChange={(e) => handleFieldChange(originalIdx, '텔레그램ID', e.target.value)}
                            className="w-full py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none font-mono"
                          />
                        </td>

                        {/* 8. 쥔장장바구니 허락 */}
                        <td className="py-2.5 px-4 border-r border-neutral-200 text-center">
                          <label className="inline-flex items-center justify-center gap-1.5 text-[11px] text-neutral-600 select-none">
                            <input
                              type="checkbox"
                              checked={(item.쥔장장바구니허락 || 'n') === 'y'}
                              onChange={(e) => handleFieldChange(originalIdx, '쥔장장바구니허락', e.target.checked ? 'y' : 'n')}
                              className="w-4 h-4 rounded-none border-neutral-300 text-black focus:ring-0 cursor-pointer"
                            />
                            <span>{(item.쥔장장바구니허락 || 'n') === 'y' ? '허락' : '차단'}</span>
                          </label>
                        </td>

                        {/* 9. 로그인 차단 */}
                        <td className="py-2.5 px-4 border-r border-neutral-200 text-center">
                          <select
                            value={item.로그인차단 || 'n'}
                            onChange={(e) => handleFieldChange(originalIdx, '로그인차단', e.target.value)}
                            className={`w-full py-1 px-1 border focus:outline-none focus:border-black rounded-none text-center font-semibold text-[11px] ${
                              item.로그인차단 === 'y'
                                ? 'border-rose-300 text-rose-700 bg-rose-50'
                                : 'border-neutral-200 text-neutral-700 bg-white'
                            }`}
                          >
                            <option value="n">허용</option>
                            <option value="y">차단</option>
                          </select>
                        </td>

                        {/* 10. 로그인 기록 (최근접속 / 기간별 조회) */}
                        <td className="py-2.5 px-4 border-r border-neutral-200">
                          <div className="text-[11px] leading-tight space-y-0.5 font-mono">
                            <div className="text-neutral-500 font-light" title="최근 접속일시">
                              최근: {item.최근접속일 ? item.최근접속일.slice(2) : '-'}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => setActiveLogCustomer({ name: item.거래처명, logs: (item as any).접속기록 || [] })}
                                className="text-[10px] text-blue-600 hover:text-blue-800 underline font-semibold flex items-center gap-0.5"
                                title="조회기간 내 접속 기록 상세조회"
                              >
                                <span>조회기간 내: </span>
                                <span className="font-bold text-neutral-900 font-mono">{(item as any).접속횟수 || 0}회</span>
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* 11. 삭제 */}
                        <td className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => handleDeleteCustomer(originalIdx)}
                            className="text-neutral-400 hover:text-rose-600 transition-colors p-1.5 mx-auto block"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Bottom helper */}
        <div className="flex justify-between items-center select-none bg-neutral-50 border border-neutral-100 p-4">
          <span className="text-[11px] text-neutral-400 font-light">
            변경사항은 우측 상단의 [저장] 버튼을 클릭해야 데이터베이스에 반영됩니다.
          </span>
        </div>

        {/* Active Logs Modal Overlay */}
        {activeLogCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 select-none animate-fade-in animate-duration-200">
            <div className="bg-white border border-neutral-200 shadow-2xl p-6 max-w-sm w-full rounded-[2px] space-y-4">
              <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
                <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  [{activeLogCustomer.name}] 로그인 접속 이력
                </h3>
                <button 
                  onClick={() => setActiveLogCustomer(null)}
                  className="text-neutral-400 hover:text-neutral-950 font-mono text-base"
                >
                  &times;
                </button>
              </div>
              
              <div className="max-h-60 overflow-y-auto space-y-2 text-xs font-mono">
                <div className="text-[10px] text-neutral-400 mb-1">
                  조회 기간: {startDate} ~ {endDate}
                </div>
                {activeLogCustomer.logs.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400 italic font-light">
                    해당 기간 내 접속 기록이 없습니다.
                  </div>
                ) : (
                  activeLogCustomer.logs.map((log, i) => (
                    <div key={i} className="flex justify-between items-center border-b border-neutral-50 py-1.5 text-neutral-700">
                      <span className="text-[11px] font-semibold text-neutral-400">No. {activeLogCustomer.logs.length - i}</span>
                      <span className="text-neutral-800">{log}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setActiveLogCustomer(null)}
                  className="px-4 py-1.5 bg-black text-white hover:bg-neutral-800 text-xs font-semibold transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-neutral-50 border-t border-neutral-200 py-6 text-center text-[10px] text-neutral-400 tracking-widest uppercase select-none mt-10">
        © 2026 U&ME CUSTOMER MANAGEMENT PORTAL. ALL RIGHTS RESERVED.
      </footer>
    </div>
  );
}
