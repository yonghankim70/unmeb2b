'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CustomerOrder, PaymentLog, Customer } from '@/lib/db';
import { clearAdminAuthCache, hasFreshAdminAuthCache, markAdminAuthenticated, prefetchAdminRoutes, verifyAdminStatus } from '@/lib/adminClient';
import * as xlsx from 'xlsx';
import { 
  ArrowLeft, RefreshCw, FileSpreadsheet, Plus, Search, 
  Printer, ChevronRight, Download, Calendar, User, FileText, Trash2
} from 'lucide-react';

export default function AdminLedgerPage() {
  const router = useRouter();

  // Authentication guard
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [payments, setPayments] = useState<PaymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Navigation states
  const [activeView, setActiveView] = useState<'overview' | 'detail'>('overview');
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');

  // Date Range and Grouping States
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
  const [groupMode, setGroupMode] = useState<'cumulative' | 'monthly' | 'weekly' | 'daily'>('cumulative');
  const [sortField, setSortField] = useState<string>('거래처명');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Payment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({
    입금일자: new Date().toISOString().slice(0, 10),
    거래처명: '',
    입금금액: '',
    입금방식: '국민은행 123-45-67890 (주)유앤미',
    입금자: '',
    비고: ''
  });

  const bankAccountOptions = [
    '국민은행 123-45-67890 (주)유앤미',
    '신한은행 987-65-43210 (주)유앤미',
    '우리은행 1002-12-34567 (주)유앤미',
    '현금 (시조/사입삼촌)'
  ];

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

  // Load all ledger data from the unified API
  const loadLedgerData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ledger');
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers || []);
        setOrders(data.orders || []);
        setPayments(data.payments || []);
      }
    } catch (e) {
      console.error('Failed to load ledger data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadLedgerData();
    }
  }, [isAuthenticated]);

  // Handle register payment
  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayment.거래처명 || !newPayment.입금금액 || !newPayment.입금일자) {
      alert('필수 정보를 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPayment,
          입금금액: Number(newPayment.입금금액)
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('입금이 성공적으로 기록되었습니다.');
        setIsModalOpen(false);
        // Reset form
        setNewPayment({
          입금일자: new Date().toISOString().slice(0, 10),
          거래처명: '',
          입금금액: '',
          입금방식: '국민은행 123-45-67890 (주)유앤미',
          입금자: '',
          비고: ''
        });
        loadLedgerData();
      } else {
        alert(data.message || '입금 기록 실패');
      }
    } catch (err) {
      console.error(err);
      alert('서버 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete payment
  const handleDeletePayment = async (index: number) => {
    if (!confirm('정말로 이 입금 기록을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/admin/payments?index=${index}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        alert('입금 기록이 성공적으로 삭제되었습니다.');
        loadLedgerData();
      } else {
        alert(data.message || '삭제 실패');
      }
    } catch (err) {
      console.error(err);
      alert('서버 삭제 실패');
    }
  };

  // Helper: Find customer payment condition (last registered condition or defaults)
  const getCustomerCondition = (custName: string): string => {
    const customerOrders = orders.filter(o => o.거래처명.trim() === custName.trim());
    const conditions = Array.from(new Set(customerOrders.map(o => o.입금확인).filter(Boolean)));
    const creditConditions = conditions.filter(c => ['주결제', '15일결제', '1달 결제'].includes(c!));
    if (creditConditions.length > 0 && creditConditions[0]) return creditConditions[0];
    return '당일결제';
  };

  // Calculate overview metrics for each customer
  const getOverviewData = () => {
    // 1. Get unique customer names from Master.xlsx and Orders.xlsx
    const allCustomerNames = Array.from(new Set([
      ...customers.map(c => c.거래처명.trim()),
      ...orders.map(o => o.거래처명.trim())
    ])).filter(Boolean);

    return allCustomerNames.map(custName => {
      const custOrders = orders.filter(o => o.거래처명.trim() === custName.trim());
      const custPayments = payments.filter(p => p.거래처명.trim() === custName.trim());

      // 총 주문액 (VAT 제외)
      const totalOrderAmount = custOrders.reduce((sum, o) => sum + (o.금액 || 0), 0);
      
      // 총 발송액 (출고완료 건만 미수금으로 산정, 부가세 10% 포함)
      const shippedOrders = custOrders.filter(o => o.출고상황 === '발송완료');
      const totalShippedAmount = shippedOrders.reduce((sum, o) => {
        const supply = o.금액 || 0;
        const vat = Math.round(supply * 0.1);
        return sum + supply + vat;
      }, 0);

      // 총 입금액
      const totalDepositAmount = custPayments.reduce((sum, p) => sum + (p.입금금액 || 0), 0);

      // 현재 미수금 (발송액 - 입금액)
      const outstandingBalance = totalShippedAmount - totalDepositAmount;

      return {
        거래처명: custName,
        결제조건: getCustomerCondition(custName),
        총주문액: totalOrderAmount,
        총발송액: totalShippedAmount,
        총입금액: totalDepositAmount,
        미수금: outstandingBalance
      };
    });
  };

  // Helper: Format weekly period range
  const getWeekString = (dateStr: string): string => {
    if (!dateStr) return '날짜미상';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '날짜미상';
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const formatDate = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    return `${formatDate(monday)} ~ ${formatDate(sunday)}`;
  };

  // Filtered and Aggregated Data according to selection range and group mode
  const getFilteredAndAggregatedData = () => {
    const allTimeData = getOverviewData();
    const outstandingMap = new Map<string, number>();
    const conditionMap = new Map<string, string>();
    allTimeData.forEach(d => {
      outstandingMap.set(d.거래처명, d.미수금);
      conditionMap.set(d.거래처명, d.결제조건);
    });

    const allCustomerNames = Array.from(new Set([
      ...customers.map(c => c.거래처명.trim()),
      ...orders.map(o => o.거래처명.trim())
    ])).filter(Boolean);

    interface AggregationItem {
      거래처명: string;
      결제조건: string;
      기간?: string;
      주문수량: number;
      주문액: number;
      출고액: number;
      입금액: number;
      현재미수금: number;
    }

    const result: AggregationItem[] = [];

    const getPeriodKey = (dateStr: string) => {
      if (!dateStr) return '날짜미상';
      const cleanDate = dateStr.split(' ')[0];
      if (groupMode === 'cumulative') return '누적';
      if (groupMode === 'monthly') return cleanDate.slice(0, 7);
      if (groupMode === 'weekly') return getWeekString(cleanDate);
      return cleanDate;
    };

    allCustomerNames.forEach(custName => {
      const custOrders = orders.filter(o => o.거래처명.trim() === custName.trim());
      const custPayments = payments.filter(p => p.거래처명.trim() === custName.trim());

      const periodMap = new Map<string, { 주문수량: number; 주문액: number; 출고액: number; 입금액: number }>();

      // 1. Aggregate orders and shipments
      custOrders.forEach(o => {
        const orderDate = o.주문일시 ? o.주문일시.split(' ')[0] : '';
        if (orderDate && orderDate >= startDate && orderDate <= endDate) {
          const pKey = getPeriodKey(orderDate);
          if (!periodMap.has(pKey)) {
            periodMap.set(pKey, { 주문수량: 0, 주문액: 0, 출고액: 0, 입금액: 0 });
          }
          const data = periodMap.get(pKey)!;
          data.주문수량 += (Number(o.수량) || 0);
          data.주문액 += (Number(o.금액) || 0);
        }

        if (o.출고상황 === '발송완료') {
          const shippedDate = o.발송날짜 || (o.주문일시 ? o.주문일시.split(' ')[0] : '');
          if (shippedDate && shippedDate >= startDate && shippedDate <= endDate) {
            const pKey = getPeriodKey(shippedDate);
            if (!periodMap.has(pKey)) {
              periodMap.set(pKey, { 주문수량: 0, 주문액: 0, 출고액: 0, 입금액: 0 });
            }
            const data = periodMap.get(pKey)!;
            const supply = Number(o.금액) || 0;
            const vat = Math.round(supply * 0.1);
            data.출고액 += (supply + vat);
          }
        }
      });

      // 2. Aggregate payments
      custPayments.forEach(p => {
        const payDate = p.입금일자;
        if (payDate && payDate >= startDate && payDate <= endDate) {
          const pKey = getPeriodKey(payDate);
          if (!periodMap.has(pKey)) {
            periodMap.set(pKey, { 주문수량: 0, 주문액: 0, 출고액: 0, 입금액: 0 });
          }
          const data = periodMap.get(pKey)!;
          data.입금액 += (Number(p.입금금액) || 0);
        }
      });

      const outstanding = outstandingMap.get(custName) || 0;
      const condition = conditionMap.get(custName) || '당일결제';

      if (groupMode === 'cumulative') {
        const metrics = periodMap.get('누적') || { 주문수량: 0, 주문액: 0, 출고액: 0, 입금액: 0 };
        result.push({
          거래처명: custName,
          결제조건: condition,
          주문수량: metrics.주문수량,
          주문액: metrics.주문액,
          출고액: metrics.출고액,
          입금액: metrics.입금액,
          현재미수금: outstanding
        });
      } else {
        periodMap.forEach((metrics, period) => {
          if (metrics.주문수량 > 0 || metrics.주문액 > 0 || metrics.출고액 > 0 || metrics.입금액 > 0) {
            result.push({
              거래처명: custName,
              결제조건: condition,
              기간: period,
              주문수량: metrics.주문수량,
              주문액: metrics.주문액,
              출고액: metrics.출고액,
              입금액: metrics.입금액,
              현재미수금: outstanding
            });
          }
        });
      }
    });

    return result;
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortableHeader = (label: string, field: string, widthClass?: string, align: 'left' | 'center' | 'right' = 'left') => {
    const isSorted = sortField === field;
    return (
      <th 
        className={`py-3 px-4 border-r border-neutral-200 cursor-pointer select-none hover:bg-neutral-100 transition-colors ${widthClass || ''} ${
          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
        }`}
        onClick={() => handleSort(field)}
      >
        <div className={`flex items-center space-x-1 ${
          align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
        }`}>
          <span className="font-semibold text-neutral-700">{label}</span>
          {isSorted ? (
            sortDirection === 'asc' ? <span className="text-[10px] text-black">▲</span> : <span className="text-[10px] text-black">▼</span>
          ) : (
            <span className="text-[10px] text-neutral-300">▲▼</span>
          )}
        </div>
      </th>
    );
  };

  // Compile detailed chronological ledger for selected customer
  const getDetailLedgerData = (custName: string) => {
    const custOrders = orders.filter(o => o.거래처명.trim() === custName.trim());
    const custPayments = payments.filter(p => p.거래처명.trim() === custName.trim());

    interface LedgerRow {
      date: string;
      rawDate: string; // for sorting
      type: '주문' | '발송' | '입금';
      reference: string;
      orderAmount: number;
      shippedAmount: number;
      depositAmount: number;
      paymentIndex?: number; // to allow deletion of manual deposit logs
    }

    const ledgerItems: LedgerRow[] = [];

    // 1. 주문 발생 건들 (미수금에 바로 영향은 주지 않음)
    // 날짜별/주문번호별로 그룹핑하여 합산 표시해도 되지만, 상품별 상세 표시가 추적에 용이함.
    custOrders.forEach(o => {
      // Parse date
      const datePart = o.주문일시 ? o.주문일시.split(' ')[0] : '';
      ledgerItems.push({
        date: datePart || '날짜미상',
        rawDate: o.주문일시 || '',
        type: '주문',
        reference: `주문서: ${o.주문번호 || '미발급'} (${o.상품코드}/${o.컬러}/${o.수량}개)`,
        orderAmount: o.금액 || 0,
        shippedAmount: 0,
        depositAmount: 0
      });
    });

    // 2. 발송(출고) 발생 건들 (미수금 증가 요인, 부가세 10% 포함)
    // 동일 전표번호 묶음으로 보여주면 보기가 훨씬 깔끔함
    const shippedGroups: { [slipNo: string]: CustomerOrder[] } = {};
    const shippedNoSlip: CustomerOrder[] = [];

    custOrders.filter(o => o.출고상황 === '발송완료').forEach(o => {
      if (o.전표번호) {
        if (!shippedGroups[o.전표번호]) {
          shippedGroups[o.전표번호] = [];
        }
        shippedGroups[o.전표번호].push(o);
      } else {
        shippedNoSlip.push(o);
      }
    });

    // 전표번호가 있는 출고 건들
    Object.keys(shippedGroups).forEach(slipNo => {
      const items = shippedGroups[slipNo];
      const date = items[0].발송날짜 || items[0].주문일시.split(' ')[0];
      const rawDate = items[0].발송날짜 ? `${items[0].발송날짜} 00:00:00` : items[0].주문일시;
      
      const supplySum = items.reduce((sum, o) => sum + (o.금액 || 0), 0);
      const vat = Math.round(supplySum * 0.1);
      const totalShipped = supplySum + vat;

      const details = items.map(o => `${o.상품코드}(${o.수량}개)`).join(', ');

      ledgerItems.push({
        date,
        rawDate,
        type: '발송',
        reference: `전표번호: ${slipNo} (${details}) [공급가:${supplySum.toLocaleString()} 부가세:${vat.toLocaleString()}]`,
        orderAmount: 0,
        shippedAmount: totalShipped,
        depositAmount: 0
      });
    });

    // 전표번호가 누락된 개별 출고 건들
    shippedNoSlip.forEach(o => {
      const date = o.발송날짜 || o.주문일시.split(' ')[0];
      const rawDate = o.발송날짜 ? `${o.발송날짜} 00:00:00` : o.주문일시;
      const supply = o.금액 || 0;
      const vat = Math.round(supply * 0.1);
      const totalShipped = supply + vat;

      ledgerItems.push({
        date,
        rawDate,
        type: '발송',
        reference: `출고(전표무): ${o.상품코드}/${o.컬러}/${o.수량}개 [공급가:${supply.toLocaleString()} 부가세:${vat.toLocaleString()}]`,
        orderAmount: 0,
        shippedAmount: totalShipped,
        depositAmount: 0
      });
    });

    // 3. 입금(수금) 발생 건들 (미수금 차감 요인)
    custPayments.forEach(p => {
      // Find global index in payments array for delete action
      const pIdx = payments.findIndex(pay => 
        pay.입금일자 === p.입금일자 && 
        pay.거래처명 === p.거래처명 && 
        pay.입금금액 === p.입금금액 && 
        pay.입금방식 === p.입금방식 && 
        pay.입금자 === p.입금자
      );

      ledgerItems.push({
        date: p.입금일자,
        rawDate: `${p.입금일자} 23:59:59`, // Sort payments at the end of the day
        type: '입금',
        reference: `입금등록: ${p.입금방식} (입금자: ${p.입금자 || '미지정'}) ${p.비고 ? `[비고: ${p.비고}]` : ''}`,
        orderAmount: 0,
        shippedAmount: 0,
        depositAmount: p.입금금액,
        paymentIndex: pIdx !== -1 ? pIdx : undefined
      });
    });

    // 4. Chronological Sort (Date ascending)
    // If dates are identical: 주문 -> 발송 -> 입금 순으로 나열
    ledgerItems.sort((a, b) => {
      const dateA = new Date(a.rawDate || a.date).getTime();
      const dateB = new Date(b.rawDate || b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      
      const typePriority = { '주문': 1, '발송': 2, '입금': 3 };
      return typePriority[a.type] - typePriority[b.type];
    });

    // 5. Compute Running Balance (출고액 누적합산 - 입금액 누적합산)
    let balance = 0;
    const ledgerWithBalance = ledgerItems.map(item => {
      balance += item.shippedAmount - item.depositAmount;
      return {
        ...item,
        balance
      };
    });

    return ledgerWithBalance;
  };

  // Detail Ledger Excel Download
  const handleDownloadDetailExcel = (custName: string) => {
    const data = getDetailLedgerData(custName);
    const rows = data.map(d => ({
      일자: d.date,
      구분: d.type,
      거래참조: d.reference,
      '주문금액(참고)': d.orderAmount,
      '발송금액(VAT포함)': d.shippedAmount,
      입금액: d.depositAmount,
      미수잔액: d.balance
    }));

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '거래처 원장');
    xlsx.writeFile(workbook, `${custName}_상세원장_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Print Detail Ledger
  const handlePrintDetailLedger = (custName: string) => {
    const data = getDetailLedgerData(custName);
    const overview = getOverviewData().find(o => o.거래처명 === custName);

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('팝업 차단이 활성화되어 있어 인쇄할 수 없습니다.');
      return;
    }

    let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${custName} 거래원장인쇄</title>
<style>
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
    color: #000;
    margin: 20px;
    font-size: 12px;
  }
  .header-container {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #000;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  h1 {
    font-size: 24px;
    margin: 0;
    letter-spacing: 4px;
  }
  .meta-info {
    text-align: right;
  }
  .info-box {
    display: flex;
    justify-content: space-between;
    background: #f9f9f9;
    border: 1px solid #ddd;
    padding: 15px;
    margin-bottom: 20px;
  }
  .info-item {
    font-size: 13px;
  }
  .info-item strong {
    font-size: 15px;
    color: #c2410c;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  th, td {
    border: 1px solid #333;
    padding: 8px;
    text-align: left;
  }
  th {
    background: #f3f4f6;
    font-weight: bold;
    text-align: center;
  }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .bg-blue { background: #eff6ff; }
  .bg-red { background: #fff5f5; }
  .bg-green { background: #f0fdf4; }
  @media print {
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; text-align: right;">
    <button onclick="window.print()" style="background:#000; color:#fff; border:none; padding:8px 16px; font-weight:bold; cursor:pointer;">인쇄하기</button>
  </div>

  <div class="header-container">
    <h1>상 세 거 래 원 장</h1>
    <div class="meta-info">
      <div><strong>거래처명:</strong> ${custName}</div>
      <div><strong>출력일시:</strong> ${new Date().toLocaleString('ko-KR')}</div>
    </div>
  </div>

  <div class="info-box">
    <div class="info-item">결제 조건: <strong>${overview?.결제조건 || '당일결제'}</strong></div>
    <div class="info-item">총 출고액(VAT포함): <strong>${overview?.총발송액.toLocaleString()}원</strong></div>
    <div class="info-item">총 입금액: <strong>${overview?.총입금액.toLocaleString()}원</strong></div>
    <div class="info-item">현재 미수금 잔액: <strong style="color:#e11d48;">${overview?.미수금.toLocaleString()}원</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 10%;">일자</th>
        <th style="width: 8%;">구분</th>
        <th style="width: 42%;">거래 내용 / 참조 번호</th>
        <th style="width: 12%;" class="text-right">주문금액(VAT별도)</th>
        <th style="width: 12%;" class="text-right">출고발송액(VAT포함)</th>
        <th style="width: 12%;" class="text-right">실 입금액</th>
        <th style="width: 14%;" class="text-right">미수 잔액</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(d => `
      <tr class="${d.type === '발송' ? 'bg-red' : d.type === '입금' ? 'bg-green' : ''}">
        <td class="text-center font-mono">${d.date}</td>
        <td class="text-center font-bold">${d.type}</td>
        <td style="font-size: 11px;">${d.reference}</td>
        <td class="text-right font-mono">${d.orderAmount ? d.orderAmount.toLocaleString() + '원' : '-'}</td>
        <td class="text-right font-mono font-bold">${d.shippedAmount ? d.shippedAmount.toLocaleString() + '원' : '-'}</td>
        <td class="text-right font-mono font-bold text-emerald-700">${d.depositAmount ? d.depositAmount.toLocaleString() + '원' : '-'}</td>
        <td class="text-right font-mono font-bold bg-blue">${d.balance.toLocaleString()}원</td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #666; border-top: 1px dashed #ccc; padding-top: 10px;">
    U&ME B2B SYSTEM - 정산 관리 마스터 출력본
  </div>
</body>
</html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Get all-time dataset for global total banners and detail headers
  const allTimeData = getOverviewData();

  // Get filtered and aggregated data based on date filters and grouping mode
  const aggregatedData = getFilteredAndAggregatedData();

  // Filter overview list based on search term
  const filteredOverviewData = aggregatedData.filter(item => {
    return item.거래처명.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Sort the filtered dataset
  const sortedOverviewData = [...filteredOverviewData].sort((a, b) => {
    let valA: any = a[sortField as keyof typeof a];
    let valB: any = b[sortField as keyof typeof b];

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortDirection === 'asc'
        ? valA.localeCompare(valB, 'ko-KR')
        : valB.localeCompare(valA, 'ko-KR');
    } else {
      // numbers
      return sortDirection === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    }
  });

  // Calculate global totals for banner
  const globalTotalShipped = allTimeData.reduce((sum, item) => sum + item.총발송액, 0);
  const globalTotalDeposited = allTimeData.reduce((sum, item) => sum + item.총입금액, 0);
  const globalTotalOutstanding = allTimeData.reduce((sum, item) => sum + item.미수금, 0);

  // Overview Excel Download using sorted and filtered state
  const handleDownloadOverviewExcel = () => {
    const rows = sortedOverviewData.map(d => {
      const row: any = {
        업체명: d.거래처명,
      };
      if (groupMode !== 'cumulative') {
        row['기간'] = d.기간;
      }
      row['결제조건'] = d.결제조건;
      row['주문수량'] = d.주문수량;
      row['주문액'] = d.주문액;
      row['출고액'] = d.출고액;
      row['입금액'] = d.입금액;
      row['현재미수금'] = d.현재미수금;
      return row;
    });

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '전체 미수금 현황');
    
    xlsx.writeFile(workbook, `전체_미수금_현황_${groupMode}_${startDate}_to_${endDate}.xlsx`);
  };

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
          onClick={() => {
            if (activeView === 'detail') {
              setActiveView('overview');
              setSelectedCustomerName(null);
            } else {
              router.push('/');
            }
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono uppercase tracking-widest text-[10px]">
            {activeView === 'detail' ? 'Back to Overview' : 'Back to Shop'}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <button 
            onClick={loadLedgerData}
            className="flex items-center space-x-1.5 hover:text-black transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>새로고침</span>
          </button>
          
          {activeView === 'overview' ? (
            <>
              <button 
                onClick={handleDownloadOverviewExcel}
                className="flex items-center space-x-1.5 hover:text-black transition-colors border border-neutral-200 px-3.5 py-1.5 bg-white font-medium"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>전체 현황 엑셀 다운로드</span>
              </button>

              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center space-x-1.5 bg-black text-white px-5 py-1.5 text-xs font-semibold hover:bg-neutral-800 transition-colors uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>입금 직접 등록</span>
              </button>
            </>
          ) : (
            selectedCustomerName && (
              <>
                <button 
                  onClick={() => {
                    setActiveView('overview');
                    setSelectedCustomerName(null);
                  }}
                  className="flex items-center space-x-1.5 hover:text-black transition-colors border border-neutral-200 px-3.5 py-1.5 bg-white font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-neutral-600" />
                  <span>목록으로</span>
                </button>

                <button 
                  onClick={() => handlePrintDetailLedger(selectedCustomerName)}
                  className="flex items-center space-x-1.5 bg-neutral-900 text-white px-4 py-1.5 text-xs font-semibold hover:bg-black transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>원장 인쇄하기</span>
                </button>
                
                <button 
                  onClick={() => handleDownloadDetailExcel(selectedCustomerName)}
                  className="flex items-center space-x-1.5 hover:text-black transition-colors border border-neutral-200 px-3.5 py-1.5 bg-white font-medium"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>원장 엑셀 다운로드</span>
                </button>
              </>
            )
          )}
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
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-black text-black font-semibold cursor-pointer"
          >
            정산 마스터 (Ledger)
          </button>
          <button
            onClick={() => router.push('/admin/customers')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            거래처 마스터 (Customers)
          </button>
        </div>

        {/* Global Summary Cards (Overview View Only) */}
        {activeView === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 select-none mb-4">
            <div className="border border-neutral-200 p-5 rounded-[2px] bg-neutral-50/30 flex flex-col justify-between">
              <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">총 누적 출고액 (VAT 포함)</span>
              <span className="text-xl font-mono font-bold text-neutral-800 mt-2">
                {globalTotalShipped.toLocaleString()}원
              </span>
            </div>
            <div className="border border-neutral-200 p-5 rounded-[2px] bg-neutral-50/30 flex flex-col justify-between">
              <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">총 누적 수금액 (입금액)</span>
              <span className="text-xl font-mono font-bold text-emerald-700 mt-2">
                {globalTotalDeposited.toLocaleString()}원
              </span>
            </div>
            <div className="border border-neutral-900 bg-neutral-900 text-white p-5 rounded-[2px] flex flex-col justify-between shadow-sm">
              <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">전체 총 미수금 현황</span>
              <span className="text-xl font-mono font-bold text-rose-400 mt-2">
                {globalTotalOutstanding.toLocaleString()}원
              </span>
            </div>
          </div>
        )}

        {/* Page Title & Desc */}
        <div className="space-y-1">
          <h1 className="text-xl font-mono tracking-widest uppercase font-semibold text-black">
            {activeView === 'overview' ? 'CREDIT & LEDGER MASTER' : `${selectedCustomerName} - TRANSACTION LEDGER`}
          </h1>
          <p className="text-xs text-neutral-400 font-light leading-relaxed">
            {activeView === 'overview' 
              ? '거래처별 총 출고(발송)금액과 총 수금액(입금)을 대조하여 현재 미수금 잔액을 통합 관리합니다. 미수금은 오직 실제 발송 완료액을 기준으로 자동 가감됩니다.'
              : '해당 거래처의 날짜별 주문서 접수, 실물 출고 발송 건, 그리고 수금 등록 이력을 순차 정렬하여 잔액(Running Balance)의 흐름을 확인합니다.'}
          </p>
        </div>

        {/* ======================= VIEW 1: OVERVIEW ======================= */}
        {activeView === 'overview' && (
          <div className="space-y-4">
            {/* Filter and Period Selection Controls */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 select-none bg-neutral-50 p-4 border border-neutral-200">
              <div className="flex flex-wrap items-center gap-4">
                {/* 거래처명 검색 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">업체명 검색</label>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-400" />
                    <input 
                      type="text" 
                      placeholder="거래처명 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs font-mono rounded-none"
                    />
                  </div>
                </div>

                {/* 기간 설정 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">기간 설정</label>
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
              </div>

              {/* 조회 기준 (Radio Buttons) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">조회 기준</label>
                <div className="flex items-center space-x-5 bg-white border border-neutral-200 px-4 py-2">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-medium text-neutral-700">
                    <input
                      type="radio"
                      name="groupMode"
                      value="cumulative"
                      checked={groupMode === 'cumulative'}
                      onChange={() => setGroupMode('cumulative')}
                      className="w-3.5 h-3.5 text-black border-neutral-300 focus:ring-black accent-black"
                    />
                    <span>누적</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-medium text-neutral-700">
                    <input
                      type="radio"
                      name="groupMode"
                      value="monthly"
                      checked={groupMode === 'monthly'}
                      onChange={() => setGroupMode('monthly')}
                      className="w-3.5 h-3.5 text-black border-neutral-300 focus:ring-black accent-black"
                    />
                    <span>월별</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-medium text-neutral-700">
                    <input
                      type="radio"
                      name="groupMode"
                      value="weekly"
                      checked={groupMode === 'weekly'}
                      onChange={() => setGroupMode('weekly')}
                      className="w-3.5 h-3.5 text-black border-neutral-300 focus:ring-black accent-black"
                    />
                    <span>주별</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-medium text-neutral-700">
                    <input
                      type="radio"
                      name="groupMode"
                      value="daily"
                      checked={groupMode === 'daily'}
                      onChange={() => setGroupMode('daily')}
                      className="w-3.5 h-3.5 text-black border-neutral-300 focus:ring-black accent-black"
                    />
                    <span>일자별</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Overview Table */}
            {loading ? (
              <div className="h-64 flex items-center justify-center text-xs text-neutral-400 font-mono tracking-widest uppercase">
                Loading ledger database...
              </div>
            ) : (
              <div className="border border-neutral-200 overflow-x-auto shadow-sm">
                <table className="w-full border-collapse text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-500 tracking-wider select-none uppercase">
                      {renderSortableHeader('업체명', '거래처명')}
                      {groupMode !== 'cumulative' && renderSortableHeader('기간', '기간', 'w-48', 'center')}
                      {renderSortableHeader('결제조건', '결제조건', 'w-32', 'center')}
                      {renderSortableHeader('주문수량', '주문수량', 'w-32', 'right')}
                      {renderSortableHeader('주문액', '주문액', 'w-40', 'right')}
                      {renderSortableHeader('출고액', '출고액', 'w-40', 'right')}
                      {renderSortableHeader('입금액', '입금액', 'w-40', 'right')}
                      {renderSortableHeader('현재미수금', '현재미수금', 'w-40', 'right')}
                      <th className="py-3 px-4 w-28 text-center font-semibold text-neutral-700">상세 보기</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {sortedOverviewData.length === 0 ? (
                      <tr>
                        <td colSpan={groupMode !== 'cumulative' ? 9 : 8} className="py-16 text-center text-neutral-400 font-light italic bg-white text-xs">
                          검색 조건에 맞는 거래처 정산 기록이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      sortedOverviewData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="py-3 px-4 border-r border-neutral-200 font-semibold text-neutral-900">
                            {item.거래처명}
                          </td>
                          {groupMode !== 'cumulative' && (
                            <td className="py-3 px-4 border-r border-neutral-200 text-center font-mono text-neutral-600 bg-neutral-50/10">
                              {item.기간}
                            </td>
                          )}
                          <td className="py-3 px-4 border-r border-neutral-200 text-center">
                            <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                              ['주결제', '15일결제', '1달 결제'].includes(item.결제조건)
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                            }`}>
                              {item.결제조건}
                            </span>
                          </td>
                          <td className="py-3 px-4 border-r border-neutral-200 text-right font-mono text-neutral-500">
                            {(item.주문수량 || 0).toLocaleString()}개
                          </td>
                          <td className="py-3 px-4 border-r border-neutral-200 text-right font-mono text-neutral-500">
                            {(item.주문액 || 0).toLocaleString()}원
                          </td>
                          <td className="py-3 px-4 border-r border-neutral-200 text-right font-mono text-neutral-700 bg-neutral-50/20 font-semibold">
                            {(item.출고액 || 0).toLocaleString()}원
                          </td>
                          <td className="py-3 px-4 border-r border-neutral-200 text-right font-mono text-emerald-600 font-semibold">
                            {(item.입금액 || 0).toLocaleString()}원
                          </td>
                          <td className={`py-3 px-4 border-r border-neutral-200 text-right font-mono font-bold ${
                            item.현재미수금 > 0 ? 'text-rose-600 bg-rose-50/20' : 'text-neutral-950'
                          }`}>
                            {(item.현재미수금 || 0).toLocaleString()}원
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedCustomerName(item.거래처명);
                                setActiveView('detail');
                              }}
                              className="text-[11px] font-semibold text-neutral-700 hover:text-black flex items-center justify-center gap-1 mx-auto hover:underline"
                            >
                              <span>원장보기</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======================= VIEW 2: DETAIL LEDGER ======================= */}
        {activeView === 'detail' && selectedCustomerName && (
          <div className="space-y-6">
            
            {/* Quick Header Summary for Detailed View */}
            <div className="flex flex-col md:flex-row justify-between border border-neutral-200 bg-neutral-50/40 p-5 rounded-[2px] gap-4 select-none">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-neutral-400" />
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">조회 거래처</div>
                  <div className="text-base font-bold text-neutral-800">{selectedCustomerName}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
                <div>
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">결제 조건</div>
                  <div className="font-semibold text-neutral-800 mt-1">
                    {getCustomerCondition(selectedCustomerName)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">누적 출고총액</div>
                  <div className="font-semibold text-neutral-800 mt-1">
                    {getOverviewData().find(o => o.거래처명 === selectedCustomerName)?.총발송액.toLocaleString()}원
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">누적 수금액</div>
                  <div className="font-semibold text-emerald-700 mt-1">
                    {getOverviewData().find(o => o.거래처명 === selectedCustomerName)?.총입금액.toLocaleString()}원
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400 font-bold uppercase">현재 미수잔액</div>
                  <div className="font-bold text-rose-600 mt-1 text-sm">
                    {getOverviewData().find(o => o.거래처명 === selectedCustomerName)?.미수금.toLocaleString()}원
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Chronological Table */}
            {loading ? (
              <div className="h-64 flex items-center justify-center text-xs text-neutral-400 font-mono tracking-widest uppercase">
                Loading transaction ledger...
              </div>
            ) : (
              <div className="border border-neutral-200 overflow-x-auto shadow-sm">
                <table className="w-full border-collapse text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-500 tracking-wider select-none uppercase">
                      <th className="py-3 px-4 border-r border-neutral-200 w-32 text-center">일자</th>
                      <th className="py-3 px-4 border-r border-neutral-200 w-24 text-center">구분</th>
                      <th className="py-3 px-4 border-r border-neutral-200">거래 내용 / 참조번호</th>
                      <th className="py-3 px-4 border-r border-neutral-200 w-36 text-right">주문금액 (VAT별도)</th>
                      <th className="py-3 px-4 border-r border-neutral-200 w-36 text-right">출고발송액 (VAT포함)</th>
                      <th className="py-3 px-4 border-r border-neutral-200 w-36 text-right">실 입금액</th>
                      <th className="py-3 px-4 border-r border-neutral-200 w-36 text-right font-bold">미수 잔액 (Running Balance)</th>
                      <th className="py-3 px-4 w-16 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {getDetailLedgerData(selectedCustomerName).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-neutral-400 font-light italic bg-white text-xs">
                          거래 내역이 존재하지 않습니다.
                        </td>
                      </tr>
                    ) : (
                      getDetailLedgerData(selectedCustomerName).map((row, idx) => (
                        <tr 
                          key={idx} 
                          className={`hover:bg-neutral-50/50 transition-colors ${
                            row.type === '발송' 
                              ? 'bg-rose-50/10' 
                              : row.type === '입금' 
                              ? 'bg-emerald-50/10' 
                              : 'bg-white'
                          }`}
                        >
                          <td className="py-2.5 px-4 border-r border-neutral-200 text-center text-neutral-500 font-mono">
                            {row.date}
                          </td>
                          <td className="py-2.5 px-4 border-r border-neutral-200 text-center">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-[2px] ${
                              row.type === '발송'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200/40'
                                : row.type === '입금'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/40'
                                : 'bg-neutral-100 text-neutral-800 border border-neutral-200/40'
                            }`}>
                              {row.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 border-r border-neutral-200 font-light text-neutral-800">
                            {row.reference}
                          </td>
                          <td className="py-2.5 px-4 border-r border-neutral-200 text-right font-mono text-neutral-400">
                            {row.orderAmount > 0 ? `${row.orderAmount.toLocaleString()}원` : '-'}
                          </td>
                          <td className="py-2.5 px-4 border-r border-neutral-200 text-right font-mono font-bold text-rose-700 bg-rose-50/10">
                            {row.shippedAmount > 0 ? `${row.shippedAmount.toLocaleString()}원` : '-'}
                          </td>
                          <td className="py-2.5 px-4 border-r border-neutral-200 text-right font-mono font-bold text-emerald-700 bg-emerald-50/10">
                            {row.depositAmount > 0 ? `${row.depositAmount.toLocaleString()}원` : '-'}
                          </td>
                          <td className="py-2.5 px-4 border-r border-neutral-200 text-right font-mono font-bold text-neutral-900 bg-blue-50/20">
                            {row.balance.toLocaleString()}원
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {row.type === '입금' && row.paymentIndex !== undefined ? (
                              <button
                                onClick={() => handleDeletePayment(row.paymentIndex!)}
                                className="text-neutral-400 hover:text-rose-600 transition-colors p-1"
                                title="입금 로그 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>

      {/* ======================= DIALOG MODAL: REGISTER PAYMENT ======================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 select-none animate-fade-in">
          <div className="bg-white border border-neutral-200 shadow-2xl p-6 max-w-md w-full rounded-[2px] space-y-4">
            
            <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">입금 정보 직접 등록</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-950 font-mono text-base"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRegisterPayment} className="space-y-4 text-xs">
              
              {/* 1. 입금 일자 */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-600 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                  <span>입금 일자 *</span>
                </label>
                <input 
                  type="date" 
                  value={newPayment.입금일자}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, 입금일자: e.target.value }))}
                  required
                  className="w-full p-2 border border-neutral-200 bg-white focus:outline-none focus:border-black font-mono rounded-none"
                />
              </div>

              {/* 2. 거래처명 */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-600 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-neutral-400" />
                  <span>대상 거래처명 *</span>
                </label>
                <select
                  value={newPayment.거래처명}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, 거래처명: e.target.value }))}
                  required
                  className="w-full p-2 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none text-neutral-700"
                >
                  <option value="">-- 거래처 선택 --</option>
                  {Array.from(new Set([
                    ...customers.map(c => c.거래처명),
                    ...orders.map(o => o.거래처명)
                  ])).filter(Boolean).sort().map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* 3. 입금 금액 */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-600 flex items-center gap-1.5">
                  <span className="text-neutral-500 font-bold text-[13px] leading-none select-none">₩</span>
                  <span>실제 입금액 (수금액) *</span>
                </label>
                <input 
                  type="number" 
                  value={newPayment.입금금액}
                  placeholder="예: 4900000 (쉼표 없이 입력)"
                  onChange={(e) => setNewPayment(prev => ({ ...prev, 입금금액: e.target.value }))}
                  required
                  className="w-full p-2 border border-neutral-200 bg-white focus:outline-none focus:border-black font-mono rounded-none"
                />
              </div>

              {/* 4. 입금 방식 */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-600">입금 계좌/방식 *</label>
                <select
                  value={newPayment.입금방식}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, 입금방식: e.target.value }))}
                  required
                  className="w-full p-2 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none text-neutral-700"
                >
                  {bankAccountOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* 5. 입금자명 */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-600">입금자명 (비어두면 거래처명 자동 지정)</label>
                <input 
                  type="text" 
                  value={newPayment.입금자}
                  placeholder="송금인 실명 입력"
                  onChange={(e) => setNewPayment(prev => ({ ...prev, 입금자: e.target.value }))}
                  className="w-full p-2 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none"
                />
              </div>

              {/* 6. 비고 */}
              <div className="space-y-1.5">
                <label className="font-bold text-neutral-600">비고 (기타 특이사항)</label>
                <input 
                  type="text" 
                  value={newPayment.비고}
                  placeholder="예: 4월 잔금 일부, 할인가 차감 등"
                  onChange={(e) => setNewPayment(prev => ({ ...prev, 비고: e.target.value }))}
                  className="w-full p-2 border border-neutral-200 bg-white focus:outline-none focus:border-black rounded-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 justify-end font-semibold pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors rounded-none"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-black text-white hover:bg-neutral-800 transition-colors rounded-none"
                >
                  {saving ? '기록 중...' : '입금 기록 등록'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-neutral-50 border-t border-neutral-200 py-6 text-center text-[10px] text-neutral-400 tracking-widest uppercase select-none mt-10">
        © 2026 U&ME LEDGER MANAGEMENT PORTAL. ALL RIGHTS RESERVED.
      </footer>
    </div>
  );
}
