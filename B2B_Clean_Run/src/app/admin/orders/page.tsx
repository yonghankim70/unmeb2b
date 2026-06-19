'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CustomerOrder } from '@/lib/db';
import { clearAdminAuthCache, hasFreshAdminAuthCache, markAdminAuthenticated, prefetchAdminRoutes, verifyAdminStatus } from '@/lib/adminClient';
import * as xlsx from 'xlsx';
import { 
  ArrowLeft, RefreshCw, Save, FileSpreadsheet, Check, AlertCircle, 
  HelpCircle, Trash2, Search, CheckCircle2, Clock, Package, Printer
} from 'lucide-react';

export default function AdminOrdersPage() {
  const router = useRouter();

  // Authentication guard
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Data states
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [completionFilter, setCompletionFilter] = useState('n'); // n: 진행중, y: 종결, ALL: 전체


  // 선택된 주문 키 상태 (주문일시_상품코드_컬러 포맷)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  // 선택 삭제 확인 대화상자 상태
  const [deleteDialog, setDeleteDialog] = useState<{ show: boolean; count: number } | null>(null);

  // 일괄 변경 상태 추가
  const [isBulkUpdateModalOpen, setIsBulkUpdateModalOpen] = useState(false);
  const [bulkFields, setBulkFields] = useState({
    applyConfirm: false, confirmValue: 'y',
    applyPayStatus: false, payStatusValue: '미입금',
    applyPayMethod: false, payMethodValue: '',
    applyPayAmount: false, payAmountValue: '',
    applyPaySender: false, paySenderValue: '',
    applyStatus: false, statusValue: '주문확인대기',
    applySlipNo: false, slipNoValue: '',
    applyShipDate: false, shipDateValue: '',
    applyShipType: false, shipTypeValue: '',
    applyCourier: false, courierValue: '',
    applyTrackingNo: false, trackingNoValue: '',
    applyComplete: false, completeValue: 'n'
  });

  // Bank Statement Upload states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mismatchDialog, setMismatchDialog] = useState<{
    show: boolean;
    customerName: string;
    sender: string;
    bankAmount: number;
    orderAmount: number;
    orderKeys: string[]; // matching identifier keys (timestamp + productCode + color)
  } | null>(null);

  // Bank accounts config options
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

  // Load all orders
  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders');
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      }
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportOrders = () => {
    const a = document.createElement('a');
    a.href = '/api/admin/export-orders';
    a.download = `Orders_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadOrders();
    }
  }, [isAuthenticated]);

  // Save changes back to database
  const handleSaveOrders = async (ordersList = orders) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: ordersList })
      });
      const data = await res.json();
      if (data.success) {
        alert('주문 변경 사항이 성공적으로 저장되었습니다.');
        loadOrders();
      } else {
        alert(data.message || '저장 중 오류가 발생했습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('서버 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // Toggle order confirmation checkbox
  const handleToggleConfirm = (index: number) => {
    const updated = [...orders];
    const item = updated[index];
    const nextVal = item.주문확인 === 'y' ? 'n' : 'y';
    
    updated[index] = {
      ...item,
      주문확인: nextVal,
      // If unconfirming, roll back status if it was order processing/confirmed
      출고상황: nextVal === 'n' && (item.출고상황 === '오더 진행' || item.출고상황 === '오더진행' || item.출고상황 === '주문확인') 
        ? '주문확인대기' 
        : (nextVal === 'y' && (item.출고상황 === '출고 대기' || item.출고상황 === '주문확인대기' || !item.출고상황) ? '주문확인' : item.출고상황)
    };
    setOrders(updated);
  };

  // Handle value change for general fields with bulk shipping propagation
  const handleFieldChange = (index: number, field: keyof CustomerOrder, value: any) => {
    const updated = [...orders];
    const targetOrder = updated[index];
    const targetKey = `${targetOrder.주문일시}_${targetOrder.상품코드}_${targetOrder.컬러}`;
    const isTargetSelected = selectedKeys.includes(targetKey);

    // Prepare shared slip number and shipping date if shipping is initiated
    let sharedSlipNo = '';
    let sharedShippingDate = '';
    
    const checkAndPrepareShippingData = (o: CustomerOrder, f: keyof CustomerOrder, v: any) => {
      const isNowShipped = (f === '출고상황' && v === '발송완료') || 
                           (f === '발송처리' && v !== '');
      if (isNowShipped) {
        if (!o.발송날짜 && !sharedShippingDate) {
          sharedShippingDate = new Date().toISOString().slice(0, 10);
        }
        if (!o.전표번호 && !sharedSlipNo) {
          const todayStr = new Date().toISOString().slice(0, 10);
          const yy = todayStr.slice(2, 4);
          const mm = todayStr.slice(5, 7);
          const dd = todayStr.slice(8, 10);
          const randomDigits = Math.floor(100 + Math.random() * 900);
          sharedSlipNo = `S${yy}${mm}${dd}${randomDigits}`;
        }
      }
    };

    const indicesToUpdate: number[] = [];
    if (isTargetSelected) {
      updated.forEach((o, i) => {
        const k = `${o.주문일시}_${o.상품코드}_${o.컬러}`;
        if (selectedKeys.includes(k)) {
          indicesToUpdate.push(i);
        }
      });
    } else {
      indicesToUpdate.push(index);
    }

    // First pass: Prepare shared info
    indicesToUpdate.forEach(idx => {
      checkAndPrepareShippingData(updated[idx], field, value);
    });

    // Second pass: Apply changes
    indicesToUpdate.forEach(idx => {
      const item = { ...updated[idx], [field]: value };

      // 입금금액 기본값 자동 입력 연동
      if (field === '입금확인' && value === '입금완료' && !item.입금금액) {
        item.입금금액 = item.금액 || 0;
      }

      // 주문 확인, 입금 확인, 출고 상황의 자동 연동 및 진행상태 동기화
      if (field === '출고상황') {
        // 1) 수동으로 출고상황(진행상황)을 명시 변경한 경우
        if (value === '주문확인대기') {
          item.출고상황 = '출고 대기';
          item.주문확인 = 'n';
        } else if (value === '주문확인') {
          item.출고상황 = '주문확인';
          item.주문확인 = 'y';
        } else if (value === '오더진행') {
          item.출고상황 = '오더 진행';
          item.주문확인 = 'y';
        } else if (value === '발송완료') {
          item.출고상황 = '발송완료';
        }
      } else {
        // 2) 다른 필드가 변동된 경우 즉각 자동 동기화 적용
        if (field === '입금확인' && ['입금완료', '주결제', '15일결제', '1달 결제'].includes(value)) {
          item.주문확인 = 'y';
        }

        const hasShipping = (item.운송장번호 && item.운송장번호.trim() !== '') || 
                             (item.발송날짜 && item.발송날짜.trim() !== '') ||
                             (item.발송처리 && item.발송처리.trim() !== '') ||
                             (field === '발송처리' && value !== '') ||
                             (field === '운송장번호' && value !== '') ||
                             (field === '발송날짜' && value !== '');

        if (hasShipping) {
          item.출고상황 = '발송완료';
        } else {
          const isConfirmed = item.주문확인 === 'y';
          const isPaid = ['입금완료', '주결제', '15일결제', '1달 결제'].includes(item.입금확인 || '');
          if (isConfirmed) {
            item.출고상황 = isPaid ? '오더 진행' : '주문확인';
          } else {
            item.출고상황 = '출고 대기';
          }
        }
      }

      // 발송완료로 판단되면 날짜/전표번호 누락 자동생성 보완
      const isNowShipped = item.출고상황 === '발송완료';
      if (isNowShipped) {
        if (!item.발송날짜) {
          item.발송날짜 = sharedShippingDate || new Date().toISOString().slice(0, 10);
        }
        if (!item.전표번호) {
          if (!sharedSlipNo) {
            const todayStr = new Date().toISOString().slice(0, 10);
            const yy = todayStr.slice(2, 4);
            const mm = todayStr.slice(5, 7);
            const dd = todayStr.slice(8, 10);
            const randomDigits = Math.floor(100 + Math.random() * 900);
            sharedSlipNo = `S${yy}${mm}${dd}${randomDigits}`;
          }
          item.전표번호 = sharedSlipNo;
        }
      }

      updated[idx] = item;
    });

    setOrders(updated);
  };

  // A4 Transaction Statement Print Integration (optimized for HP A4 printers)
  const handlePrintA4Statements = () => {
    if (selectedKeys.length === 0) return;

    const selectedOrders = orders.filter(o => {
      const key = `${o.주문일시}_${o.상품코드}_${o.컬러}`;
      return selectedKeys.includes(key);
    });

    if (selectedOrders.length === 0) return;

    // Group selected orders by customer first
    const groupedSelected: { [customerName: string]: CustomerOrder[] } = {};
    selectedOrders.forEach(so => {
      if (!groupedSelected[so.거래처명]) {
        groupedSelected[so.거래처명] = [];
      }
      groupedSelected[so.거래처명].push(so);
    });

    const updatedOrders = [...orders];
    let hasUpdates = false;
    const todayStr = new Date().toISOString().slice(0, 10);
    const yy = todayStr.slice(2, 4);
    const mm = todayStr.slice(5, 7);
    const dd = todayStr.slice(8, 10);

    // For each customer group, find or generate a single shared slip number
    Object.keys(groupedSelected).forEach(customerName => {
      const groupItems = groupedSelected[customerName];
      
      // Find if any item already has a slip number
      let existingSlip = '';
      groupItems.forEach(item => {
        const found = updatedOrders.find(o => 
          o.주문일시 === item.주문일시 && 
          o.상품코드 === item.상품코드 && 
          o.컬러 === item.컬러
        );
        if (found && found.전표번호) {
          existingSlip = found.전표번호;
        }
      });

      // If no existing slip number is found, generate one for this customer group
      if (!existingSlip) {
        const randomDigits = Math.floor(100 + Math.random() * 900);
        existingSlip = `S${yy}${mm}${dd}${randomDigits}`;
      }

      // Assign the shared slip number and shipping date to all items in this group
      groupItems.forEach(item => {
        const globalIdx = updatedOrders.findIndex(o => 
          o.주문일시 === item.주문일시 && 
          o.상품코드 === item.상품코드 && 
          o.컬러 === item.컬러
        );
        if (globalIdx !== -1) {
          let changed = false;
          const o = updatedOrders[globalIdx];
          if (!o.발송날짜) {
            o.발송날짜 = todayStr;
            changed = true;
          }
          if (o.전표번호 !== existingSlip) {
            o.전표번호 = existingSlip;
            changed = true;
          }
          if (changed) {
            updatedOrders[globalIdx] = { ...o };
            hasUpdates = true;
          }
        }
      });
    });

    const grouped: { [customerName: string]: CustomerOrder[] } = {};
    selectedOrders.forEach(so => {
      const matched = updatedOrders.find(o => 
        o.주문일시 === so.주문일시 && 
        o.상품코드 === so.상품코드 && 
        o.컬러 === so.컬러
      );
      const itemToUse = matched || so;
      if (!grouped[itemToUse.거래처명]) {
        grouped[itemToUse.거래처명] = [];
      }
      grouped[itemToUse.거래처명].push(itemToUse);
    });

    if (hasUpdates) {
      setOrders(updatedOrders);
      alert('일부 주문에 전표번호/발송날짜가 없어서 오늘 날짜 기준으로 자동 생성되었습니다. 인쇄 완료 후 상단의 [저장] 버튼을 클릭해 주세요.');
    }

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('팝업 차단이 활성화되어 있어 인쇄 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.');
      return;
    }

    let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>거래명세서 인쇄 (A4)</title>
<style>
  * {
    box-sizing: border-box;
  }
  @media print {
    body {
      margin: 0;
      padding: 0;
      font-size: 11px;
      color: #000;
    }
    .no-print {
      display: none !important;
    }
    .page-break {
      page-break-after: always;
    }
  }
  @page {
    size: A4 portrait;
    margin: 15mm 10mm 15mm 10mm;
  }
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
    color: #000;
    margin: 0;
    padding: 0;
  }
  .statement-container {
    width: 190mm;
    margin: 0 auto;
    padding-bottom: 20px;
  }
  .title-container {
    text-align: center;
    margin-bottom: 25px;
  }
  .title-container h1 {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 12px;
    margin: 0 0 5px 0;
    display: inline-block;
    border-bottom: 3px double #000;
    padding-bottom: 3px;
  }
  .partner-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 15px;
  }
  .partner-table td {
    padding: 0;
    vertical-align: top;
    border: none;
  }
  .buyer-side {
    width: 48%;
    border: 1px solid #000 !important;
    padding: 10px !important;
  }
  .buyer-title {
    font-size: 12px;
    font-weight: bold;
    border-bottom: 1px solid #000;
    padding-bottom: 3px;
    margin-bottom: 8px;
    text-align: center;
    background-color: #f5f5f5;
  }
  .buyer-name {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 10px;
  }
  .buyer-info-row {
    font-size: 11px;
    color: #333;
    margin-bottom: 3px;
  }
  .supplier-side {
    width: 52%;
    padding-left: 12px !important;
  }
  .supplier-info {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
    font-size: 11px;
  }
  .supplier-info td {
    border: 1px solid #000;
    padding: 5px;
    text-align: center;
  }
  .supplier-title {
    width: 25px;
    font-weight: bold;
    background-color: #f5f5f5;
    writing-mode: vertical-rl;
    text-orientation: upright;
    letter-spacing: 4px;
  }
  .items-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid #000;
    margin-bottom: 15px;
    font-size: 11px;
  }
  .items-table th, .items-table td {
    border: 1px solid #000;
    padding: 7px 5px;
  }
  .items-table th {
    background-color: #f5f5f5;
    font-weight: bold;
    text-align: center;
  }
  .empty-row td {
    height: 26px;
  }
  .summary-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid #000;
    font-size: 11px;
  }
  .summary-table td {
    border: 1px solid #000;
    padding: 8px;
  }
  .summary-label {
    background-color: #f5f5f5;
    font-weight: bold;
    text-align: center;
  }
  .footer {
    text-align: center;
    font-size: 10px;
    margin-top: 15px;
    color: #444;
    border-top: 1px dashed #ccc;
    padding-top: 8px;
  }
  .btn-container {
    text-align: center;
    margin: 15px 0;
  }
  .print-btn {
    background: #000;
    color: #fff;
    border: none;
    padding: 8px 18px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
  }
  .print-btn:hover {
    background: #333;
  }
  .copy-btn {
    background-color: #24292e;
    color: #ffffff;
    border: none;
    padding: 6px 12px;
    font-size: 11px;
    cursor: pointer;
    font-weight: bold;
    border-radius: 4px;
    transition: background-color 0.2s;
  }
  .copy-btn:hover {
    background-color: #444d56;
  }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .font-bold { font-weight: bold; }
  .text-lg { font-size: 13px; }
  .bg-light { background-color: #fafafa; }
</style>
<script>
  function copyStatementText(encodedData) {
    try {
      const data = JSON.parse(decodeURIComponent(encodedData));
      let text = "[거래명세서]\\n";
      text += "거래처: " + data.customerName + " 귀하\\n";
      text += "발송날짜: " + data.shipDate + "\\n";
      text += "전표번호: " + data.slipNo + "\\n";
      if (data.memo) {
        text += "요청사항: " + data.memo + "\\n";
      }
      text += "----------------------------------\\n";
      text += "품명 (컬러) | 수량 | 단가 | 금액\\n";
      text += "----------------------------------\\n";
      data.items.forEach(function(item) {
        text += item.code + " (" + item.color + ") | " + item.qty + " | " + item.price.toLocaleString() + " | " + item.amount.toLocaleString() + "\\n";
      });
      text += "----------------------------------\\n";
      text += "총 수량: " + data.totalQty.toLocaleString() + " 개\\n";
      text += "공급가액: " + data.totalSupplyPrice.toLocaleString() + " 원\\n";
      text += "부가세(10%): " + data.vatAmount.toLocaleString() + " 원\\n";
      text += "합계금액: " + data.totalAmount.toLocaleString() + " 원\\n";
      
      if (data.isCreditCustomer) {
        text += "----------------------------------\\n";
        text += "----------------------------------\n";
        text += "이전 미수 (전잔): " + data.previousBalance.toLocaleString() + " 원\n";
        text += "당일 합계: " + data.todayTotal.toLocaleString() + " 원\n";
        text += "총 미수금: " + data.totalOutstanding.toLocaleString() + " 원\n";
      }
      
      text += "----------------------------------\n";
      text += "U&ME B2B SYSTEM";

      navigator.clipboard.writeText(text).then(function() {
        alert(data.customerName + " 거래명세서 텍스트가 클립보드에 복사되었습니다. 카카오톡이나 텔레그램 창에 붙여넣기(Ctrl+V) 하세요.");
      }).catch(function(err) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
          alert(data.customerName + " 거래명세서 텍스트가 클립보드에 복사되었습니다. 카카오톡이나 텔레그램 창에 붙여넣기(Ctrl+V) 하세요.");
        } catch (e) {
          console.error("Fallback copy failed", e);
        }
        document.body.removeChild(textarea);
      });
    } catch (err) {
      console.error("Copy failed", err);
    }
  }
</script>
</head>
<body>
<div class="no-print btn-container">
  <button class="print-btn" onclick="window.print()">A4 거래명세서 인쇄</button>
</div>
`;

    const customers = Object.keys(grouped);
    customers.forEach((customerName, index) => {
      const items = grouped[customerName];
      const slipNos = Array.from(new Set(items.map(o => o.전표번호).filter(Boolean)));
      const slipNoStr = slipNos.join(', ') || '미발행';
      const shipDates = Array.from(new Set(items.map(o => o.발송날짜).filter(Boolean)));
      const shipDateStr = shipDates.join(', ') || todayStr;
      
      const memos = Array.from(new Set(items.map(o => o.요청사항).filter(m => m && m.trim() !== '')));
      const memoStr = memos.join(' / ');

      const totalQty = items.reduce((sum, o) => sum + (o.수량 || 0), 0);
      const totalSupplyPrice = items.reduce((sum, o) => sum + (o.금액 || 0), 0);
      const vatAmount = Math.round(totalSupplyPrice * 0.1);
      const totalAmount = totalSupplyPrice + vatAmount;

      // Credit calculations for 주결제, 15일결제, 1달 결제
      const isCreditCustomer = items.some(item => 
        ['주결제', '15일결제', '1달 결제'].includes(item.입금확인 || '')
      );

      let totalOutstanding = 0;
      let previousBalance = 0;
      let todayTotal = totalAmount;

      if (isCreditCustomer) {
        // Calculate total outstanding from global updatedOrders
        const unpaidOrders = updatedOrders.filter(o => 
          o.거래처명 === customerName && 
          o.입금확인 !== '입금완료'
        );
        totalOutstanding = unpaidOrders.reduce((sum, o) => {
          const supply = o.금액 || 0;
          const vat = Math.round(supply * 0.1);
          return sum + supply + vat;
        }, 0);

        previousBalance = Math.max(0, totalOutstanding - todayTotal);
      }

      const statementData = {
        customerName: customerName,
        slipNo: slipNoStr,
        shipDate: shipDateStr,
        memo: memoStr,
        totalQty: totalQty,
        totalSupplyPrice: totalSupplyPrice,
        vatAmount: vatAmount,
        totalAmount: totalAmount,
        isCreditCustomer: isCreditCustomer,
        previousBalance: previousBalance,
        todayTotal: todayTotal,
        totalOutstanding: totalOutstanding,
        items: items.map(item => ({
          code: item.상품코드,
          color: item.컬러,
          qty: item.수량,
          price: item.단가 || 0,
          amount: item.금액 || 0
        }))
      };
      const dataStr = encodeURIComponent(JSON.stringify(statementData));

      html += `
<div class="statement-container ${index < customers.length - 1 ? 'page-break' : ''}">
  <div class="no-print statement-actions" style="margin-bottom: 15px; text-align: right; width: 100%;">
    <button class="copy-btn" onclick="copyStatementText('${dataStr}')">📋 명세서 텍스트 복사</button>
  </div>

  <div class="title-container">
    <h1>거 래 명 세 서</h1>
  </div>

  <table class="partner-table">
    <tr>
      <!-- 공급받는자 -->
      <td class="buyer-side">
        <div class="buyer-title">공급받는자</div>
        <div class="buyer-name">${customerName} 귀하</div>
        <div class="buyer-info-row"><strong>발송날짜:</strong> ${shipDateStr}</div>
        <div class="buyer-info-row"><strong>전표번호:</strong> ${slipNoStr}</div>
        ${memoStr ? `<div class="buyer-info-row" style="color: #d32f2f; margin-top: 5px;"><strong>요청사항:</strong> ${memoStr}</div>` : ''}
      </td>
      <!-- 공급자 -->
      <td class="supplier-side">
        <table class="supplier-info">
          <tr>
            <td rowspan="4" class="supplier-title" style="width: 25px;">공급자</td>
            <td style="width: 70px; background-color: #f5f5f5; font-weight: bold;">등록번호</td>
            <td colspan="3" style="font-weight: bold;">120-81-12345</td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f5; font-weight: bold;">상호(법인)</td>
            <td style="width: 120px;">(주)유앤미</td>
            <td style="width: 50px; background-color: #f5f5f5; font-weight: bold;">대표자</td>
            <td>김용한</td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f5; font-weight: bold;">사업장주소</td>
            <td colspan="3" style="text-align: left; font-size: 10px;">서울특별시 중구 동대문패션타운</td>
          </tr>
          <tr>
            <td style="background-color: #f5f5f5; font-weight: bold;">업태 / 종목</td>
            <td>도소매</td>
            <td style="background-color: #f5f5f5; font-weight: bold;">종목</td>
            <td>의류 (인)</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 5%;">No</th>
        <th style="width: 30%;">상품코드 (품번)</th>
        <th style="width: 15%;">규격 (컬러)</th>
        <th style="width: 10%;" class="text-center">수량</th>
        <th style="width: 15%;" class="text-right">단가</th>
        <th style="width: 15%;" class="text-right">금액</th>
        <th style="width: 10%;">비고</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, idx) => `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td class="font-bold">${item.상품코드}</td>
        <td class="text-center">${item.컬러}</td>
        <td class="text-center font-bold">${item.수량}</td>
        <td class="text-right">${(item.단가 || 0).toLocaleString()}</td>
        <td class="text-right">${(item.금액 || 0).toLocaleString()}</td>
        <td></td>
      </tr>
      `).join('')}
      <!-- 빈 줄로 채워 A4 레이아웃을 보기 좋게 유지 (최소 8줄) -->
      ${Array.from({ length: Math.max(0, 8 - items.length) }).map((_, i) => `
      <tr class="empty-row">
        <td class="text-center">${items.length + i + 1}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <table class="summary-table">
    <tr>
      <td style="width: 15%;" class="summary-label">합계수량</td>
      <td style="width: 35%;" class="text-center font-bold text-lg">${totalQty.toLocaleString()} 개</td>
      <td style="width: 15%;" class="summary-label">공급가액</td>
      <td style="width: 35%;" class="text-right">${totalSupplyPrice.toLocaleString()} 원</td>
    </tr>
    <tr>
      <td class="summary-label">부가세 (10%)</td>
      <td class="text-right">${vatAmount.toLocaleString()} 원</td>
      <td class="summary-label font-bold text-lg">합계금액</td>
      <td class="text-right font-bold text-lg bg-light">${totalAmount.toLocaleString()} 원</td>
    </tr>
  </table>

  ${isCreditCustomer ? `
  <table class="summary-table" style="margin-top: 10px; border-color: #d32f2f;">
    <tr>
      <td style="width: 15%; background-color: #faf0f0; font-weight: bold; text-align: center; border-color: #e5a9a9;">이전 미수 (전잔)</td>
      <td style="width: 18%; text-align: right; border-color: #e5a9a9;">${previousBalance.toLocaleString()} 원</td>
      <td style="width: 15%; background-color: #faf0f0; font-weight: bold; text-align: center; border-color: #e5a9a9;">당일 합계</td>
      <td style="width: 18%; text-align: right; border-color: #e5a9a9;">${todayTotal.toLocaleString()} 원</td>
      <td style="width: 16%; background-color: #ffebe8; font-weight: bold; text-align: center; border-color: #d32f2f; color: #d32f2f;">총 미수금</td>
      <td style="width: 18%; text-align: right; font-weight: bold; border-color: #d32f2f; color: #d32f2f; background-color: #fff8f8; font-size: 13px;">${totalOutstanding.toLocaleString()} 원</td>
    </tr>
  </table>
  ` : ''}

  <div class="footer">
    <div style="font-weight: bold; margin-bottom: 3px; font-size: 11px;">U&ME B2B SYSTEM</div>
    <div>본 명세서는 공급받는자 보관용이며, 인쇄일시: ${new Date().toLocaleString('ko-KR')}</div>
  </div>
</div>
`;
    });

    html += `
</body>
</html>
`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Toggle individual order selection
  const toggleSelectOrder = (key: string) => {
    setSelectedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // 일괄 종결 처리 핸들러
  const handleBulkCompleteOrders = () => {
    if (selectedKeys.length === 0) return;
    const updated = [...orders];
    updated.forEach((o, i) => {
      const key = `${o.주문일시}_${o.상품코드}_${o.컬러}`;
      if (selectedKeys.includes(key)) {
        updated[i] = { ...o, 종결여부: 'y' };
      }
    });
    setOrders(updated);
    alert('선택한 주문들이 종결 처리되었습니다. 최종 저장하려면 상단의 [저장] 버튼을 클릭해 주세요.');
  };

  // Trigger bulk delete dialog confirmation
  const handleDeleteSelected = () => {
    if (selectedKeys.length === 0) return;
    setDeleteDialog({
      show: true,
      count: selectedKeys.length
    });
  };

  // Perform actual deletion from local orders state
  const confirmDeleteSelected = () => {
    if (!deleteDialog) return;
    const updatedOrders = orders.filter(o => {
      const key = `${o.주문일시}_${o.상품코드}_${o.컬러}`;
      return !selectedKeys.includes(key);
    });
    setOrders(updatedOrders);
    setSelectedKeys([]);
    setDeleteDialog(null);
    alert('선택된 주문 내역이 목록에서 삭제되었습니다. 파일에 최종 반영하려면 상단의 [저장] 버튼을 꼭 클릭해 주세요.');
  };

  // 일괄 적용 실행
  const handleApplyBulkUpdate = () => {
    const updated = [...orders];
    let updatedCount = 0;
    
    updated.forEach((o, i) => {
      const key = `${o.주문일시}_${o.상품코드}_${o.컬러}`;
      if (selectedKeys.includes(key)) {
        const item = { ...o };
        
        if (bulkFields.applyConfirm) item.주문확인 = bulkFields.confirmValue;
        if (bulkFields.applyPayStatus) {
          item.입금확인 = bulkFields.payStatusValue;
          if (bulkFields.payStatusValue === '입금완료' && !bulkFields.applyPayAmount && !item.입금금액) {
            item.입금금액 = item.금액 || 0;
          }
        }
        if (bulkFields.applyPayMethod) item.입금방식 = bulkFields.payMethodValue;
        if (bulkFields.applyPayAmount) item.입금금액 = Number(bulkFields.payAmountValue) || 0;
        if (bulkFields.applyPaySender) item.입금자 = bulkFields.paySenderValue;
        if (bulkFields.applySlipNo) item.전표번호 = bulkFields.slipNoValue;
        if (bulkFields.applyShipDate) item.발송날짜 = bulkFields.shipDateValue;
        if (bulkFields.applyShipType) item.발송처리 = bulkFields.shipTypeValue;
        if (bulkFields.applyCourier) item.택배사 = bulkFields.courierValue;
        if (bulkFields.applyTrackingNo) item.운송장번호 = bulkFields.trackingNoValue;
        if (bulkFields.applyComplete) item.종결여부 = bulkFields.completeValue;

        // 일괄 변경 필드 값 적용 후 진행상태 최종 동기화
        if (bulkFields.applyStatus) {
          // 사용자가 모달에서 진행상황을 수동으로 명시 변경 적용한 경우
          const val = bulkFields.statusValue;
          if (val === '주문확인대기') {
            item.출고상황 = '출고 대기';
            item.주문확인 = 'n';
          } else if (val === '주문확인') {
            item.출고상황 = '주문확인';
            item.주문확인 = 'y';
          } else if (val === '오더진행') {
            item.출고상황 = '오더 진행';
            item.주문확인 = 'y';
          } else if (val === '발송완료') {
            item.출고상황 = '발송완료';
          }
        } else {
          // 진행상황은 명시 체크하지 않고 주문확인/입금확인/발송처리 등을 일괄 수정한 경우 -> 자동 동기화
          if (bulkFields.applyPayStatus && ['입금완료', '주결제', '15일결제', '1달 결제'].includes(item.입금확인 || '')) {
            item.주문확인 = 'y';
          }
          
          const hasShipping = (item.운송장번호 && item.운송장번호.trim() !== '') || 
                               (item.발송날짜 && item.발송날짜.trim() !== '') ||
                               (item.발송처리 && item.발송처리.trim() !== '');
                               
          if (hasShipping) {
            item.출고상황 = '발송완료';
          } else {
            const isConfirmed = item.주문확인 === 'y';
            const isPaid = ['입금완료', '주결제', '15일결제', '1달 결제'].includes(item.입금확인 || '');
            if (isConfirmed) {
              item.출고상황 = isPaid ? '오더 진행' : '주문확인';
            } else {
              item.출고상황 = '출고 대기';
            }
          }
        }

        // 최종적으로 출고상황이 발송완료인데 발송날짜나 전표번호가 없으면 자동생성 보완
        if (item.출고상황 === '발송완료') {
          if (!item.발송날짜) {
            item.발송날짜 = new Date().toISOString().slice(0, 10);
          }
          if (!item.전표번호) {
            const todayStr = new Date().toISOString().slice(0, 10);
            const yy = todayStr.slice(2, 4);
            const mm = todayStr.slice(5, 7);
            const dd = todayStr.slice(8, 10);
            const randomDigits = Math.floor(100 + Math.random() * 900);
            item.전표번호 = `S${yy}${mm}${dd}${randomDigits}`;
          }
        }
        
        updated[i] = item;
        updatedCount++;
      }
    });
    
    setOrders(updated);
    setSelectedKeys([]);
    setIsBulkUpdateModalOpen(false);
    
    // Reset bulkFields form
    setBulkFields({
      applyConfirm: false, confirmValue: 'y',
      applyPayStatus: false, payStatusValue: '미입금',
      applyPayMethod: false, payMethodValue: '',
      applyPayAmount: false, payAmountValue: '',
      applyPaySender: false, paySenderValue: '',
      applyStatus: false, statusValue: '주문확인대기',
      applySlipNo: false, slipNoValue: '',
      applyShipDate: false, shipDateValue: '',
      applyShipType: false, shipTypeValue: '',
      applyCourier: false, courierValue: '',
      applyTrackingNo: false, trackingNoValue: '',
      applyComplete: false, completeValue: 'n'
    });

    alert(`선택한 ${updatedCount}건의 주문 정보가 일괄 변경되었습니다. 파일에 최종 반영하려면 상단의 [저장] 버튼을 꼭 클릭해 주세요.`);
  };

  const generateBulkSlipNo = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yy = todayStr.slice(2, 4);
    const mm = todayStr.slice(5, 7);
    const dd = todayStr.slice(8, 10);
    const randomDigits = Math.floor(100 + Math.random() * 900);
    setBulkFields(prev => ({
      ...prev,
      applySlipNo: true,
      slipNoValue: `S${yy}${mm}${dd}${randomDigits}`
    }));
  };

  const setTodayShipDate = () => {
    setBulkFields(prev => ({
      ...prev,
      applyShipDate: true,
      shipDateValue: new Date().toISOString().slice(0, 10)
    }));
  };

  // Handlers for quick actions
  const handleMarkShipped = (index: number) => {
    handleFieldChange(index, '출고상황', '발송완료');
  };

  // Bank statement upload parsing logic
  const handleBankExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = xlsx.read(data, { type: 'array' });
        
        // Read first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json<any>(sheet);

        if (rows.length === 0) {
          alert('엑셀 시트에 데이터가 존재하지 않습니다.');
          return;
        }

        // Detect columns dynamically
        let amountKey = '';
        let senderKey = '';

        // Scan keys in the first row
        const firstRow = rows[0];
        const keys = Object.keys(firstRow);

        keys.forEach(k => {
          const cleanK = k.trim().toLowerCase();
          if (cleanK.includes('입금') || cleanK.includes('입금액') || cleanK.includes('거래금액') || cleanK.includes('찾으신금액') || (cleanK.includes('금액') && !cleanK.includes('잔액') && !cleanK.includes('출금'))) {
            amountKey = k;
          }
          if (cleanK.includes('적요') || cleanK.includes('의뢰인') || cleanK.includes('입금자') || cleanK.includes('송금인') || cleanK.includes('기재사항') || cleanK.includes('내용') || cleanK.includes('보낸분') || cleanK.includes('거래처')) {
            senderKey = k;
          }
        });

        if (!amountKey || !senderKey) {
          // Fallback: look for commonly used indices
          alert('통장 엑셀 컬럼(입금액 및 적요/입금자명)을 자동으로 판별하기 어렵습니다.\n엑셀 파일에 "입금액" 과 "적요(보낸분)" 명칭의 컬럼이 존재해야 합니다.');
          return;
        }

        // Extract deposits
        const deposits: { sender: string; amount: number }[] = [];
        rows.forEach(row => {
          const amt = parseFloat(row[amountKey]);
          const snd = String(row[senderKey] || '').trim();
          if (amt > 0 && snd) {
            deposits.push({ sender: snd, amount: amt });
          }
        });

        if (deposits.length === 0) {
          alert('통장 엑셀 파일 내에서 0원 초과의 입금 거래 내역을 찾을 수 없습니다.');
          return;
        }

        // Auto match logic
        let matchCount = 0;
        let mismatchCount = 0;
        const currentOrders = [...orders];

        deposits.forEach(dep => {
          const depSender = dep.sender.toLowerCase();
          
          // Find pending orders for a customer whose name matches or is included in the sender name
          // E.g., Order "서울상사" matches Bank "서울상사 김철수"
          const matchingPendingOrders = currentOrders.filter(o => {
            const clientName = o.거래처명.toLowerCase().trim();
            const isPending = o.입금확인 === '미입금';
            const nameMatches = depSender.includes(clientName) || clientName.includes(depSender);
            return isPending && nameMatches;
          });

          if (matchingPendingOrders.length === 0) return;

          // Sum total amount for this client's pending orders
          const totalPendingAmount = matchingPendingOrders.reduce((sum, o) => sum + (o.금액 || 0), 0);
          
          const orderKeys = matchingPendingOrders.map(o => `${o.주문일시}_${o.상품코드}_${o.컬러}`);

          if (totalPendingAmount === dep.amount) {
            // Perfect match! Auto record payment.
            matchingPendingOrders.forEach(o => {
              const idx = currentOrders.findIndex(co => co.주문일시 === o.주문일시 && co.상품코드 === o.상품코드 && co.컬러 === o.컬러);
              if (idx !== -1) {
                currentOrders[idx] = {
                  ...currentOrders[idx],
                  입금확인: '입금완료',
                  입금방식: '통장 (자동매칭)',
                  입금금액: currentOrders[idx].금액 || 0,
                  입금자: dep.sender,
                  주문확인: 'y',
                  출고상황: '오더진행'
                };
              }
            });
            matchCount++;
          } else {
            // Mismatch: Amount differs. Trigger modal.
            mismatchCount++;
            setMismatchDialog({
              show: true,
              customerName: matchingPendingOrders[0].거래처명,
              sender: dep.sender,
              bankAmount: dep.amount,
              orderAmount: totalPendingAmount,
              orderKeys
            });
          }
        });

        setOrders(currentOrders);
        if (mismatchCount === 0) {
          alert(`통장 대조 완료!\n성공적으로 일치하는 입금 내역 ${matchCount}건을 매칭하여 자동기록 완료했습니다.`);
        }
      } catch (err) {
        console.error(err);
        alert('엑셀 파일을 읽는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Clear input value to allow uploading same file again
    if (e.target) {
      e.target.value = '';
    }
  };

  // Force approve deposit mismatch
  const handleForceApproveMismatch = () => {
    if (!mismatchDialog) return;
    
    const updated = orders.map(o => {
      const uniqueKey = `${o.주문일시}_${o.상품코드}_${o.컬러}`;
      if (mismatchDialog.orderKeys.includes(uniqueKey)) {
        return {
          ...o,
          입금확인: '입금완료',
          입금방식: '통장 (강제승인)',
          입금금액: o.금액 || 0,
          입금자: mismatchDialog.sender,
          주문확인: 'y',
          출고상황: '오더진행'
        };
      }
      return o;
    });

    setOrders(updated);
    setMismatchDialog(null);
    alert(`${mismatchDialog.customerName}님의 입금이 강제 완료 처리되어 '오더진행'으로 갱신되었습니다.`);
  };

  // Filter orders
  const filteredOrders = orders.filter(o => {
    // Search filter
    const matchesSearch = 
      (o.주문번호 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.거래처명 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.상품코드 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.입금자 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.운송장번호 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.요청사항 || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Status filter
    if (statusFilter !== 'ALL') {
      const currentStatus = o.출고상황 === '출고 대기' ? '주문확인대기' : (o.출고상황 === '오더 진행' ? '오더진행' : (o.출고상황 || '주문확인대기'));
      if (statusFilter === '주문확인대기' && currentStatus !== '주문확인대기') return false;
      if (statusFilter === '주문확인' && currentStatus !== '주문확인') return false;
      if (statusFilter === '오더진행' && currentStatus !== '오더진행') return false;
      if (statusFilter === '발송완료' && currentStatus !== '발송완료') return false;
    }

    // Payment filter
    if (paymentFilter !== 'ALL') {
      if (paymentFilter === '미입금' && o.입금확인 !== '미입금') return false;
      if (paymentFilter === '입금완료' && o.입금확인 !== '입금완료') return false;
      if (paymentFilter === '주결제' && o.입금확인 !== '주결제') return false;
      if (paymentFilter === '15일결제' && o.입금확인 !== '15일결제') return false;
      if (paymentFilter === '1달 결제' && o.입금확인 !== '1달 결제') return false;
    }

    // Completion filter
    if (completionFilter !== 'ALL') {
      const comp = o.종결여부 || 'n';
      if (comp !== completionFilter) return false;
    }

    return true;
  });

  const filteredKeys = filteredOrders.map(o => `${o.주문일시}_${o.상품코드}_${o.컬러}`);
  const isAllSelected = filteredOrders.length > 0 && filteredKeys.every(k => selectedKeys.includes(k));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedKeys(prev => prev.filter(k => !filteredKeys.includes(k)));
    } else {
      setSelectedKeys(prev => {
        const next = [...prev];
        filteredKeys.forEach(k => {
          if (!next.includes(k)) next.push(k);
        });
        return next;
      });
    }
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
      
      {/* Top action bar */}
      <header className="border-b border-neutral-200 py-4 px-6 md:px-12 flex justify-between items-center text-xs tracking-wider font-light text-neutral-500 select-none bg-neutral-50">
        <div className="flex items-center space-x-2 cursor-pointer hover:text-black transition-colors" onClick={() => router.push('/')}>
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono uppercase tracking-widest text-[10px]">Back to Shop</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={loadOrders}
            className="flex items-center space-x-1.5 hover:text-black transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>새로고침</span>
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleBankExcelUpload}
            className="hidden" 
            accept=".xlsx, .xls"
          />

          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 hover:text-black transition-colors border border-neutral-200 px-3.5 py-1.5 bg-white font-medium"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>통장 엑셀 업로드</span>
          </button>

          <button 
            onClick={handleExportOrders}
            className="flex items-center space-x-1.5 hover:text-black transition-colors border border-neutral-200 px-3.5 py-1.5 bg-white font-medium"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>발주 엑셀 다운로드</span>
          </button>

          {selectedKeys.length > 0 && (
            <>
              <button 
                onClick={handlePrintA4Statements}
                className="flex items-center space-x-1.5 bg-neutral-900 text-white px-4 py-1.5 text-xs font-semibold hover:bg-black transition-colors uppercase tracking-wider mr-2"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>명세서 인쇄 (A4) ({selectedKeys.length}건)</span>
              </button>

              <button 
                onClick={handleBulkCompleteOrders}
                className="flex items-center space-x-1.5 bg-emerald-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-emerald-700 transition-colors uppercase tracking-wider mr-2"
              >
                <Check className="w-3.5 h-3.5" />
                <span>선택 종결 ({selectedKeys.length}건)</span>
              </button>

              <button 
                onClick={() => setIsBulkUpdateModalOpen(true)}
                className="flex items-center space-x-1.5 bg-blue-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-blue-700 transition-colors uppercase tracking-wider mr-2"
              >
                <Save className="w-3.5 h-3.5" />
                <span>선택 일괄 변경 ({selectedKeys.length}건)</span>
              </button>

              <button 
                onClick={handleDeleteSelected}
                className="flex items-center space-x-1.5 bg-rose-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-rose-700 transition-colors uppercase tracking-wider mr-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>선택 삭제 ({selectedKeys.length}건)</span>
              </button>
            </>
          )}

          <button 
            onClick={() => handleSaveOrders(orders)}
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
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-black text-black font-semibold cursor-pointer"
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
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            거래처 마스터 (Customers)
          </button>
        </div>

        {/* Page Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
          <div className="space-y-1">
            <h1 className="text-xl font-mono tracking-widest uppercase font-semibold text-black">ORDER MANAGEMENT MASTER</h1>
            <p className="text-xs text-neutral-400 font-light leading-relaxed">
              전체 거래처의 오더 현황 및 출고 상황을 수시 모니터링하고 가공합니다. 통장 엑셀을 업로드하면 입금 건이 자동 매칭됩니다.
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-neutral-50 p-4 border border-neutral-100 select-none space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
              <input 
                type="text" 
                placeholder="거래처명, 상품코드, 입금자명, 운송장번호 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs font-mono rounded-none"
              />
            </div>
            
            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold text-neutral-400">진행상황:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-neutral-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-black rounded-none text-neutral-700"
              >
                <option value="ALL">전체보기</option>
                <option value="주문확인대기">주문확인대기</option>
                <option value="주문확인">주문확인</option>
                <option value="오더진행">오더진행</option>
                <option value="발송완료">발송완료</option>
              </select>
            </div>

            {/* Payment Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold text-neutral-400">입금여부:</span>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="border border-neutral-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-black rounded-none text-neutral-700"
              >
                <option value="ALL">전체보기</option>
                <option value="미입금">미입금</option>
                <option value="입금완료">입금완료</option>
                <option value="주결제">주결제</option>
                <option value="15일결제">15일결제</option>
                <option value="1달 결제">1달 결제</option>
              </select>
            </div>

            {/* Completion Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold text-neutral-400">종결여부:</span>
              <select
                value={completionFilter}
                onChange={(e) => setCompletionFilter(e.target.value)}
                className="border border-neutral-200 bg-white py-1.5 px-3 text-xs focus:outline-none focus:border-black rounded-none text-neutral-700"
              >
                <option value="ALL">전체보기</option>
                <option value="n">진행중</option>
                <option value="y">종결</option>
              </select>
            </div>
          </div>
        </div>

        {/* Orders Table Grid */}
        {loading ? (
          <div className="h-96 flex items-center justify-center text-xs text-neutral-400 font-mono tracking-widest uppercase">
            Loading orders database...
          </div>
        ) : (
          <div className="border border-neutral-200 overflow-x-auto shadow-sm">
            <table className="w-full border-collapse text-left text-xs font-mono min-w-[2450px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-500 tracking-wider select-none uppercase">
                  <th className="py-3 px-3 border-r border-neutral-200 w-12 text-center select-none">
                    <input 
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-36">주문번호</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-28 text-center">종결여부</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-36">주문일시</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-36">거래처명</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-36">상품코드 (품번)</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-24">컬러</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-16 text-center">수량</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-28 text-right">도매단가</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-28 text-right">총 주문금액</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-48">요청사항</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-24 text-center">주문확인</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-28">입금확인</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-44">입금 계좌/방식</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-24">실 입금액</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-28">입금자명</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-32">진행상황</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-32">전표번호</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-32">발송날짜</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-28">발송처리</th>
                  <th className="py-3 px-3 border-r border-neutral-200 w-32">택배사</th>
                  <th className="py-3 px-3 w-44">운송장번호</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="py-16 text-center text-neutral-400 font-light italic bg-white text-xs">
                      조건에 만족하는 주문 접수 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order, relativeIdx) => {
                    const globalIdx = orders.findIndex(o => 
                      o.주문일시 === order.주문일시 && 
                      o.상품코드 === order.상품코드 && 
                      o.컬러 === order.컬러
                    );
                    if (globalIdx === -1) return null;

                    const isConfirmed = order.주문확인 === 'y';
                    const isPaid = ['입금완료', '주결제', '15일결제', '1달 결제'].includes(order.입금확인 || '');
                    const rowKey = `${order.주문일시}_${order.상품코드}_${order.컬러}`;

                    return (
                      <tr key={relativeIdx} className="hover:bg-neutral-50/50 transition-colors">
                        
                        {/* 0. 선택 체크박스 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 text-center select-none">
                          <input 
                            type="checkbox"
                            checked={selectedKeys.includes(rowKey)}
                            onChange={() => toggleSelectOrder(rowKey)}
                            className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                          />
                        </td>

                        {/* 주문번호 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 font-bold font-mono text-neutral-700">
                          {order.주문번호 || '-'}
                        </td>

                        {/* 종결여부 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 text-center select-none">
                          <select
                            value={order.종결여부 || 'n'}
                            onChange={(e) => handleFieldChange(globalIdx, '종결여부', e.target.value)}
                            className={`py-0.5 px-1 border text-[11px] font-semibold focus:outline-none focus:ring-0 rounded-none ${
                              order.종결여부 === 'y'
                                ? 'border-neutral-300 bg-neutral-100 text-neutral-400 font-normal'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold'
                            }`}
                          >
                            <option value="n">진행중</option>
                            <option value="y">종결</option>
                          </select>
                        </td>

                        {/* 1. 주문일시 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 text-neutral-500 font-mono text-[11px]">
                          {order.주문일시}
                        </td>

                        {/* 2. 거래처명 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 font-semibold text-neutral-800">
                          {order.거래처명}
                        </td>

                        {/* 3. 상품코드 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 font-bold text-black">
                          {order.상품코드}
                        </td>

                        {/* 4. 컬러 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <span className="bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded-[2px] font-medium border border-neutral-200/40">
                            {order.컬러}
                          </span>
                        </td>

                        {/* 5. 수량 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 text-center font-bold font-mono">
                          {order.수량}
                        </td>

                        {/* 6. 도매단가 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 text-right font-mono text-neutral-500">
                          {order.단가 ? `${order.단가.toLocaleString('ko-KR')}원` : '단가 문의'}
                        </td>

                        {/* 7. 총 주문금액 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 text-right font-mono font-semibold text-neutral-900 bg-neutral-50/40">
                          {order.금액 ? `${order.금액.toLocaleString('ko-KR')}원` : '-'}
                        </td>

                        {/* 요청사항 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <input 
                            type="text"
                            value={order.요청사항 || ''}
                            placeholder="요청사항 없음"
                            onChange={(e) => handleFieldChange(globalIdx, '요청사항', e.target.value)}
                            className="w-full py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black font-light text-neutral-800"
                          />
                        </td>
 
                        {/* 8. 주문확인 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200 text-center select-none">
                          <input 
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={() => handleToggleConfirm(globalIdx)}
                            className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                          />
                        </td>

                        {/* 9. 입금확인 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <select
                            value={order.입금확인 || '미입금'}
                            onChange={(e) => handleFieldChange(globalIdx, '입금확인', e.target.value)}
                            className={`w-full py-1 px-1.5 border focus:outline-none focus:ring-0 text-[11px] font-bold ${
                              order.입금확인 === '입금완료'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : ['주결제', '15일결제', '1달 결제'].includes(order.입금확인 || '')
                                ? 'border-blue-300 bg-blue-50 text-blue-800'
                                : 'border-neutral-200 bg-white text-neutral-500'
                            }`}
                          >
                            <option value="미입금">미입금</option>
                            <option value="입금완료">입금완료</option>
                            <option value="주결제">주결제</option>
                            <option value="15일결제">15일결제</option>
                            <option value="1달 결제">1달 결제</option>
                          </select>
                        </td>

                        {/* 10. 입금 계좌/방식 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <select
                            value={order.입금방식 || ''}
                            onChange={(e) => handleFieldChange(globalIdx, '입금방식', e.target.value)}
                            className="w-full py-1 px-1 border border-neutral-200 bg-white text-[11px] focus:outline-none focus:border-black rounded-none text-neutral-800"
                          >
                            <option value="">-- 입금방식 선택 --</option>
                            {bankAccountOptions.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </td>

                        {/* 11. 실 입금액 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <input 
                            type="number"
                            value={order.입금금액 || 0}
                            onChange={(e) => handleFieldChange(globalIdx, '입금금액', parseInt(e.target.value) || 0)}
                            className="w-full py-1 px-1.5 border border-neutral-200 bg-white text-right font-mono focus:outline-none focus:border-black"
                          />
                        </td>

                        {/* 12. 입금자명 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <input 
                            type="text"
                            value={order.입금자 || ''}
                            placeholder="입금주명"
                            onChange={(e) => handleFieldChange(globalIdx, '입금자', e.target.value)}
                            className="w-full py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black"
                          />
                        </td>

                        {/* 13. 진행상황 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <select
                            value={order.출고상황 === '출고 대기' ? '주문확인대기' : (order.출고상황 === '오더 진행' ? '오더진행' : (order.출고상황 || '주문확인대기'))}
                            onChange={(e) => handleFieldChange(globalIdx, '출고상황', e.target.value)}
                            className="w-full py-1 px-1 border border-neutral-200 bg-white text-[11px] font-semibold focus:outline-none focus:border-black rounded-none text-neutral-800"
                          >
                            <option value="주문확인대기">주문확인대기</option>
                            <option value="주문확인">주문확인</option>
                            <option value="오더진행">오더진행</option>
                            <option value="발송완료">발송완료</option>
                          </select>
                        </td>

                        {/* 신규: 전표번호 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <input 
                            type="text"
                            value={order.전표번호 || ''}
                            placeholder="전표번호"
                            onChange={(e) => handleFieldChange(globalIdx, '전표번호', e.target.value)}
                            className="w-full py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black font-mono text-[11px] text-neutral-800"
                          />
                        </td>

                        {/* 신규: 발송날짜 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <input 
                            type="text"
                            value={order.발송날짜 || ''}
                            placeholder="YYYY-MM-DD"
                            onChange={(e) => handleFieldChange(globalIdx, '발송날짜', e.target.value)}
                            className="w-full py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black font-mono text-[11px] text-neutral-800"
                          />
                        </td>

                        {/* 14. 발송처리 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <select
                            value={order.발송처리 || ''}
                            onChange={(e) => handleFieldChange(globalIdx, '발송처리', e.target.value)}
                            className="w-full py-1 px-1 border border-neutral-200 bg-white text-[11px] focus:outline-none focus:border-black rounded-none text-neutral-700"
                          >
                            <option value="">-- 발송 종류 --</option>
                            <option value="택배">택배</option>
                            <option value="퀵">퀵</option>
                            <option value="직접">직접</option>
                          </select>
                        </td>

                        {/* 15. 택배사 */}
                        <td className="py-2.5 px-3 border-r border-neutral-200">
                          <input 
                            type="text"
                            value={order.택배사 || ''}
                            placeholder="롯데/대한통운 등"
                            disabled={order.발송처리 !== '택배'}
                            onChange={(e) => handleFieldChange(globalIdx, '택배사', e.target.value)}
                            className="w-full py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed text-neutral-800"
                          />
                        </td>

                        {/* 16. 운송장번호 */}
                        <td className="py-2.5 px-3 flex items-center gap-1.5 justify-between">
                          <input 
                            type="text"
                            value={order.운송장번호 || ''}
                            placeholder="숫자 입력"
                            disabled={order.발송처리 !== '택배'}
                            onChange={(e) => handleFieldChange(globalIdx, '운송장번호', e.target.value)}
                            className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black font-mono disabled:bg-neutral-100 disabled:cursor-not-allowed text-neutral-800"
                          />
                          {order.출고상황 !== '발송완료' && order.발송처리 === '택배' && order.운송장번호 && (
                            <button
                              onClick={() => handleMarkShipped(globalIdx)}
                              className="px-2 py-1 bg-neutral-900 text-white text-[9px] hover:bg-black rounded-none transition-colors"
                              title="즉시 발송완료 처리"
                            >
                              발송
                            </button>
                          )}
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

      </main>

      {/* Delete Confirmation Alert Dialog */}
      {deleteDialog && deleteDialog.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center select-none bg-black/45 animate-fade-in">
          <div className="bg-white border border-neutral-200 shadow-2xl p-6 max-w-md w-full rounded-[3px] space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 rounded-full border border-rose-200 text-rose-600 shrink-0">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[14px] font-bold text-neutral-900">주문 내역 선택 삭제 확인</h3>
                <p className="text-xs text-neutral-500 font-light leading-relaxed">
                  정말로 선택된 주문 내역들을 삭제하시겠습니까?
                </p>
              </div>
            </div>

            <div className="bg-neutral-50 p-4 border border-rose-200 rounded-[2px] text-xs font-light text-neutral-700 leading-relaxed">
              • 선택된 주문 건수: <strong className="text-rose-600 font-bold">{deleteDialog.count}건</strong><br />
              • 목록에서 삭제한 후, <b>상단의 [저장] 버튼을 클릭해야</b> 주문 데이터베이스에 최종 반영됩니다.
            </div>

            <div className="flex gap-2.5 justify-end text-xs font-semibold pt-2">
              <button
                onClick={() => setDeleteDialog(null)}
                className="px-4 py-2 border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors rounded-none"
              >
                취소
              </button>
              <button
                onClick={confirmDeleteSelected}
                className="px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 transition-colors rounded-none"
              >
                삭제 진행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification / Mismatch Alert Dialog */}
      {mismatchDialog && mismatchDialog.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center select-none bg-black/45">
          <div className="bg-white border border-neutral-200 shadow-2xl p-6 max-w-md w-full rounded-[3px] space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 rounded-full border border-amber-200 text-amber-600 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[14px] font-bold text-neutral-900">통장 대조 입금액 불일치 경고</h3>
                <p className="text-xs text-neutral-500 font-light leading-relaxed">
                  거래처명 매칭은 감지되었으나, 통장 입금액과 주문 누적 금액에 차액이 있습니다.
                </p>
              </div>
            </div>

            <div className="bg-neutral-50 p-4 border border-neutral-200/60 rounded-[2px] space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-neutral-500">매칭 거래처:</span>
                <span className="font-semibold text-neutral-800">{mismatchDialog.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">통장 입금자:</span>
                <span className="font-semibold text-neutral-800">{mismatchDialog.sender}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200/50 pt-2">
                <span className="text-neutral-500">실제 입금액:</span>
                <span className="font-bold text-neutral-900 text-sm">{mismatchDialog.bankAmount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">주문 누적액:</span>
                <span className="font-bold text-neutral-900 text-sm">{mismatchDialog.orderAmount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200/50 pt-2 text-rose-600 font-semibold">
                <span>차액:</span>
                <span>{(mismatchDialog.bankAmount - mismatchDialog.orderAmount).toLocaleString()}원</span>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end text-xs font-semibold pt-2">
              <button
                onClick={() => setMismatchDialog(null)}
                className="px-4 py-2 border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors rounded-none"
              >
                대조 보류 (대기)
              </button>
              <button
                onClick={handleForceApproveMismatch}
                className="px-4 py-2 bg-neutral-900 text-white hover:bg-black transition-colors rounded-none"
              >
                강제 입금완료 승인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 변경 모달 다이얼로그 */}
      {isBulkUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 select-none overflow-y-auto py-8">
          <div className="bg-white border border-neutral-200 shadow-2xl p-6 max-w-lg w-full rounded-[3px] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
              <div className="p-2 bg-blue-50 rounded-full border border-blue-200 text-blue-600 shrink-0">
                <Save className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[14px] font-bold text-neutral-900">선택 주문 정보 일괄 변경</h3>
                <p className="text-[11px] text-neutral-500 font-light leading-relaxed">
                  선택된 <strong className="text-blue-600 font-bold">{selectedKeys.length}건</strong>의 주문 내역을 한 번에 일괄 수정합니다.<br/>
                  수정할 필드 왼쪽의 체크박스를 체크하고 값을 입력해 주세요.
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs max-h-[50vh] overflow-y-auto pr-1">
              
              {/* 1. 종결여부 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyComplete"
                  checked={bulkFields.applyComplete}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyComplete: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyComplete" className="w-24 font-semibold text-neutral-700 cursor-pointer">종결 여부</label>
                <select
                  value={bulkFields.completeValue}
                  disabled={!bulkFields.applyComplete}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, completeValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                >
                  <option value="n">진행중</option>
                  <option value="y">종결</option>
                </select>
              </div>

              {/* 2. 주문확인 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyConfirm"
                  checked={bulkFields.applyConfirm}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyConfirm: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyConfirm" className="w-24 font-semibold text-neutral-700 cursor-pointer">주문 확인</label>
                <select
                  value={bulkFields.confirmValue}
                  disabled={!bulkFields.applyConfirm}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, confirmValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                >
                  <option value="y">y (확인완료)</option>
                  <option value="n">n (대기중)</option>
                </select>
              </div>

              {/* 3. 입금확인 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyPayStatus"
                  checked={bulkFields.applyPayStatus}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyPayStatus: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyPayStatus" className="w-24 font-semibold text-neutral-700 cursor-pointer">입금 확인</label>
                <select
                  value={bulkFields.payStatusValue}
                  disabled={!bulkFields.applyPayStatus}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, payStatusValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                >
                  <option value="미입금">미입금</option>
                  <option value="입금완료">입금완료</option>
                  <option value="주결제">주결제</option>
                  <option value="15일결제">15일결제</option>
                  <option value="1달 결제">1달 결제</option>
                </select>
              </div>

              {/* 4. 입금 계좌/방식 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyPayMethod"
                  checked={bulkFields.applyPayMethod}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyPayMethod: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyPayMethod" className="w-24 font-semibold text-neutral-700 cursor-pointer">입금 계좌/방식</label>
                <select
                  value={bulkFields.payMethodValue}
                  disabled={!bulkFields.applyPayMethod}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, payMethodValue: e.target.value }))}
                  className="flex-1 py-1 px-1 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- 입금방식 선택 --</option>
                  {bankAccountOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* 5. 실 입금액 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyPayAmount"
                  checked={bulkFields.applyPayAmount}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyPayAmount: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyPayAmount" className="w-24 font-semibold text-neutral-700 cursor-pointer">실 입금액</label>
                <input 
                  type="number"
                  value={bulkFields.payAmountValue}
                  disabled={!bulkFields.applyPayAmount}
                  placeholder="숫자만 입력"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, payAmountValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed text-right font-mono"
                />
              </div>

              {/* 6. 입금자명 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyPaySender"
                  checked={bulkFields.applyPaySender}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyPaySender: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyPaySender" className="w-24 font-semibold text-neutral-700 cursor-pointer">입금자명</label>
                <input 
                  type="text"
                  value={bulkFields.paySenderValue}
                  disabled={!bulkFields.applyPaySender}
                  placeholder="입금주명 기입"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, paySenderValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* 7. 진행상황 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyStatus"
                  checked={bulkFields.applyStatus}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyStatus: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyStatus" className="w-24 font-semibold text-neutral-700 cursor-pointer">진행 상황</label>
                <select
                  value={bulkFields.statusValue}
                  disabled={!bulkFields.applyStatus}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, statusValue: e.target.value }))}
                  className="flex-1 py-1 px-1 border border-neutral-200 bg-white text-xs font-semibold disabled:bg-neutral-100 disabled:cursor-not-allowed"
                >
                  <option value="주문확인대기">주문확인대기</option>
                  <option value="주문확인">주문확인</option>
                  <option value="오더진행">오더진행</option>
                  <option value="발송완료">발송완료</option>
                </select>
              </div>

              {/* 8. 전표번호 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applySlipNo"
                  checked={bulkFields.applySlipNo}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applySlipNo: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applySlipNo" className="w-24 font-semibold text-neutral-700 cursor-pointer">전표 번호</label>
                <div className="flex-1 flex gap-1.5">
                  <input 
                    type="text"
                    value={bulkFields.slipNoValue}
                    disabled={!bulkFields.applySlipNo}
                    placeholder="S로 시작하는 번호"
                    onChange={(e) => setBulkFields(prev => ({ ...prev, slipNoValue: e.target.value }))}
                    className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={generateBulkSlipNo}
                    className="px-2 py-1 bg-neutral-800 text-white text-[10px] hover:bg-black transition-colors"
                  >
                    자동생성
                  </button>
                </div>
              </div>

              {/* 9. 발송날짜 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyShipDate"
                  checked={bulkFields.applyShipDate}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyShipDate: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyShipDate" className="w-24 font-semibold text-neutral-700 cursor-pointer">발송 날짜</label>
                <div className="flex-1 flex gap-1.5">
                  <input 
                    type="text"
                    value={bulkFields.shipDateValue}
                    disabled={!bulkFields.applyShipDate}
                    placeholder="YYYY-MM-DD"
                    onChange={(e) => setBulkFields(prev => ({ ...prev, shipDateValue: e.target.value }))}
                    className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={setTodayShipDate}
                    className="px-2 py-1 bg-neutral-800 text-white text-[10px] hover:bg-black transition-colors"
                  >
                    오늘날짜
                  </button>
                </div>
              </div>

              {/* 10. 발송처리 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyShipType"
                  checked={bulkFields.applyShipType}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyShipType: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyShipType" className="w-24 font-semibold text-neutral-700 cursor-pointer">발송 종류</label>
                <select
                  value={bulkFields.shipTypeValue}
                  disabled={!bulkFields.applyShipType}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, shipTypeValue: e.target.value }))}
                  className="flex-1 py-1 px-1 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- 발송 종류 선택 --</option>
                  <option value="택배">택배</option>
                  <option value="퀵">퀵</option>
                  <option value="직접">직접</option>
                </select>
              </div>

              {/* 11. 택배사 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyCourier"
                  checked={bulkFields.applyCourier}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyCourier: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyCourier" className="w-24 font-semibold text-neutral-700 cursor-pointer">택배사</label>
                <input 
                  type="text"
                  value={bulkFields.courierValue}
                  disabled={!bulkFields.applyCourier}
                  placeholder="롯데/대한통운 등"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, courierValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* 12. 운송장번호 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyTrackingNo"
                  checked={bulkFields.applyTrackingNo}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyTrackingNo: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyTrackingNo" className="w-24 font-semibold text-neutral-700 cursor-pointer">운송장 번호</label>
                <input 
                  type="text"
                  value={bulkFields.trackingNoValue}
                  disabled={!bulkFields.applyTrackingNo}
                  placeholder="운송장번호 기입"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, trackingNoValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed font-mono"
                />
              </div>

            </div>

            <div className="flex gap-2.5 justify-end text-xs font-semibold pt-4 border-t border-neutral-200">
              <button
                onClick={() => setIsBulkUpdateModalOpen(false)}
                className="px-4 py-2 border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors rounded-none"
              >
                취소
              </button>
              <button
                onClick={handleApplyBulkUpdate}
                className="px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors rounded-none"
              >
                선택 일괄 적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-neutral-50 border-t border-neutral-200 py-6 text-center text-[10px] text-neutral-400 tracking-widest uppercase select-none mt-10">
        © 2026 U&ME ORDER MANAGEMENT PORTAL. ALL RIGHTS RESERVED.
      </footer>

    </div>
  );
}
