'use client';
 
import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { CustomerOrder, Product } from '@/lib/db';
import { useCart } from '@/context/CartContext';
import { ArrowLeft, Clock, Package, CheckCircle2, ShoppingCart, Check, RefreshCw } from 'lucide-react';
import CartSidebar from './CartSidebar';
import ChangePasswordModal from './ChangePasswordModal';

interface StitchOrdersClientProps {
  orders: CustomerOrder[];
  session: {
    customerName: string;
    discountGrade: string;
  };
  products: Product[];
}

export default function StitchOrdersClient({ orders, session, products }: StitchOrdersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isStitchDemo = pathname?.startsWith('/stitch-demo');
  const basePath = isStitchDemo ? '/stitch-demo' : '';
  const { addToCart, cartCount } = useCart();
  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');
  const [reorderSuccess, setReorderSuccess] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleTabChange = (tab: 'progress' | 'completed') => {
    setActiveTab(tab);
    setSelectedKeys([]);
  };

  // Helper to determine if order is shipped
  const isShippedStatus = (status?: string): boolean => {
    const s = String(status || '').trim();
    return s.includes('완료') || s.includes('배송완료') || s.includes('배송 완료');
  };

  // Split orders
  const progressOrders = orders.filter(o => o.종결여부 !== 'y' && !isShippedStatus(o.출고상황));
  const completedOrders = orders.filter(o => o.종결여부 === 'y' || isShippedStatus(o.출고상황));

  // Determine current active orders list
  const displayedOrders = activeTab === 'progress' ? progressOrders : completedOrders;

  // Calculate totals for summary cards based on the selected tab
  const totalAmount = displayedOrders.reduce((sum, o) => sum + (o.금액 || 0), 0);
  const totalItems = displayedOrders.reduce((sum, o) => sum + (o.수량 || 0), 0);

  const getStatusBadge = (status?: string) => {
    const s = String(status || '').trim();
    
    if (s === '발송완료') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          발송완료
        </span>
      );
    }
    if (s === '오더진행' || s === '오더 진행') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
          <Package className="w-3.5 h-3.5 animate-pulse" />
          오더진행
        </span>
      );
    }
    if (s === '주문확인') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          주문확인
        </span>
      );
    }
    // Default / 주문확인대기 / 출고 대기
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
        <Clock className="w-3.5 h-3.5" />
        {s === '출고 대기' ? '주문확인대기' : (s || '주문확인대기')}
      </span>
    );
  };

  const handleReorder = (order: CustomerOrder) => {
    const key = `${order.주문일시}_${order.상품코드}_${order.컬러}`;
    addToCart({
      productCode: order.상품코드,
      color: order.컬러,
      quantity: order.수량,
      category: ''
    });

    setReorderSuccess(key);
    setIsCartOpen(true); // Open cart sidebar to let them check immediately
    setTimeout(() => setReorderSuccess(null), 2500);
  };

  const getOrderKey = (order: CustomerOrder) => {
    return `${order.주문일시}_${order.상품코드}_${order.컬러}`;
  };

  const handleRowCheckboxChange = (key: string) => {
    setSelectedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleHeaderCheckboxChange = () => {
    const displayedKeys = displayedOrders.map(getOrderKey);
    const allSelected = displayedKeys.every(k => selectedKeys.includes(k));
    
    if (allSelected) {
      setSelectedKeys(prev => prev.filter(k => !displayedKeys.includes(k)));
    } else {
      setSelectedKeys(prev => {
        const newKeys = [...prev];
        displayedKeys.forEach(k => {
          if (!newKeys.includes(k)) {
            newKeys.push(k);
          }
        });
        return newKeys;
      });
    }
  };

  const handleSelectAddToCart = () => {
    if (selectedKeys.length === 0) return;

    const selectedOrders = displayedOrders.filter(order => 
      selectedKeys.includes(getOrderKey(order))
    );

    selectedOrders.forEach(order => {
      addToCart({
        productCode: order.상품코드,
        color: order.컬러,
        quantity: order.수량,
        category: ''
      });
    });

    alert(`선택하신 ${selectedOrders.length}개 상품이 장바구니에 담겼습니다.`);
    setSelectedKeys([]);
    setIsCartOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-stitch-background text-stitch-on-background font-sans antialiased">
      
      {/* Top Banner */}
      <div className="w-full bg-[#111111] text-[#e0e0e0] text-[10px] tracking-[0.2em] font-light text-center py-2 uppercase select-none">
        B2B Wholesale Partner System | STITCH 2.0 ORDER STATUS
      </div>

      {/* Header */}
      <header className="w-full border-b border-stitch-outline-variant bg-stitch-background sticky top-0 z-50 select-none">
        <div className="flex justify-between items-center px-[40px] pt-[31px] pb-[29px] w-full max-w-[1400px] mx-auto">
          {/* Logo Combo */}
          <Link href={basePath || '/'} className="flex flex-col cursor-pointer">
            <span className="font-semibold text-[32px] tracking-[0.2em] leading-none text-stitch-on-background pl-[0.2em]" style={{ fontFamily: 'var(--font-outfit)' }}>U&ME</span>
            <span className="text-[10px] text-stitch-secondary tracking-[0.22em] mt-1.5 font-light uppercase">B2B CURATION</span>
          </Link>

          {/* User Display & Cart Stack */}
          <div className="flex items-center gap-6">
            <span className="text-stitch-secondary tracking-widest text-xs hidden sm:inline">
              CLIENT: <strong className="text-stitch-on-background font-semibold">{session.customerName}</strong>
            </span>

            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="text-[11px] font-semibold tracking-wider text-stitch-secondary hover:text-stitch-primary transition-colors cursor-pointer border border-stitch-outline-variant/65 rounded-full px-3 py-1 bg-white shadow-sm"
            >
              비밀번호 변경
            </button>
            
            {/* Cart Icon */}
            <div 
              className="relative cursor-pointer text-stitch-on-background hover:text-stitch-primary transition-colors p-1"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingCart className="w-[22px] h-[22px] stroke-[1.5]" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-mono font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center border border-stitch-background">
                  {cartCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-[1400px] mx-auto px-[40px] py-[48px] flex-1 flex flex-col">
        
        {/* Back Link & Title */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-6 select-none">
          <div className="flex items-center gap-4">
            <Link 
              href={basePath || '/'} 
              className="w-10 h-10 rounded-full border border-stitch-outline-variant/60 flex items-center justify-center text-stitch-secondary hover:text-stitch-primary hover:border-stitch-primary transition-all duration-200"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stitch-on-background">Order Status</h1>
              <p className="text-xs text-stitch-secondary tracking-wide mt-1">거래처님의 소중한 주문 및 출고 실시간 현황입니다.</p>
            </div>
          </div>
          
          {/* Summary Cards */}
          <div className="flex gap-4">
            <div className="bg-white border border-stitch-outline-variant/50 p-4 min-w-[150px] shadow-sm rounded-[4px] flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-stitch-surface-container-low flex items-center justify-center text-stitch-secondary font-bold text-[15px] select-none">
                ₩
              </div>
              <div>
                <p className="text-[10px] text-stitch-secondary font-semibold uppercase tracking-wider">주문 총액</p>
                <p className="text-[14px] font-bold text-stitch-on-background font-mono mt-0.5">{totalAmount.toLocaleString('ko-KR')}원</p>
              </div>
            </div>
            
            <div className="bg-white border border-stitch-outline-variant/50 p-4 min-w-[130px] shadow-sm rounded-[4px] flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-stitch-surface-container-low flex items-center justify-center text-stitch-secondary">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-stitch-secondary font-semibold uppercase tracking-wider">품목 총 수량</p>
                <p className="text-[14px] font-bold text-stitch-on-background font-mono mt-0.5">{totalItems}개</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-stitch-outline-variant/60 select-none mb-6 gap-4 pb-2 sm:pb-0">
          <div className="flex">
            <button
              onClick={() => handleTabChange('progress')}
              className={`py-3.5 px-6 text-xs tracking-wider uppercase border-b-2 transition-all duration-300 font-semibold flex items-center gap-2 ${
                activeTab === 'progress'
                  ? 'border-stitch-primary text-stitch-on-background border-b-2'
                  : 'border-transparent text-stitch-secondary/60 hover:text-stitch-primary'
              }`}
            >
              <span>진행중 주문</span>
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                progressOrders.length > 0 ? 'bg-amber-500 text-white' : 'bg-neutral-200 text-neutral-500'
              }`}>
                {progressOrders.length}
              </span>
            </button>
            <button
              onClick={() => handleTabChange('completed')}
              className={`py-3.5 px-6 text-xs tracking-wider uppercase border-b-2 transition-all duration-300 font-semibold flex items-center gap-2 ${
                activeTab === 'completed'
                  ? 'border-stitch-primary text-stitch-on-background border-b-2'
                  : 'border-transparent text-stitch-secondary/60 hover:text-stitch-primary'
              }`}
            >
              <span>진행완료 주문</span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-neutral-200 text-neutral-500">
                {completedOrders.length}
              </span>
            </button>
          </div>

          {/* 일괄 장바구니 담기 버튼 */}
          <div className="flex items-center px-4 sm:px-0 pb-2 sm:pb-0">
            <button
              onClick={handleSelectAddToCart}
              disabled={selectedKeys.length === 0}
              className={`flex items-center gap-2 text-xs font-semibold tracking-wider px-5 py-2 rounded-full transition-all duration-200 select-none shadow-sm cursor-pointer border ${
                selectedKeys.length > 0
                  ? 'bg-stitch-primary text-white hover:bg-neutral-800 border-transparent animate-fadeIn'
                  : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed shadow-none'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>선택 상품 장바구니 담기 {selectedKeys.length > 0 && `(${selectedKeys.length})`}</span>
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white border border-stitch-outline-variant/40 shadow-sm rounded-[4px] overflow-hidden flex-1 flex flex-col justify-start">
          {displayedOrders.length === 0 ? (
            <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center space-y-3 text-neutral-400 select-none py-16">
              <Package className="w-12 h-12 stroke-[1.2] text-neutral-300" />
              <span className="font-serif italic font-light text-sm">
                {activeTab === 'progress' ? '진행중인 주문 내역이 없습니다.' : '완료된 주문 내역이 없습니다.'}
              </span>
              {activeTab === 'progress' && (
                <Link 
                  href={basePath || '/'} 
                  className="mt-4 px-6 py-2.5 bg-stitch-primary text-white text-[11px] font-semibold tracking-wider rounded-full hover:bg-neutral-800 transition-colors"
                >
                  Start Ordering
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="bg-stitch-surface-container-low border-b border-stitch-outline-variant/50 font-semibold text-stitch-secondary select-none">
                    <th className="py-4.5 px-4 text-center w-12">
                      <input 
                        type="checkbox"
                        checked={displayedOrders.length > 0 && displayedOrders.map(getOrderKey).every(k => selectedKeys.includes(k))}
                        onChange={handleHeaderCheckboxChange}
                        className="w-4 h-4 rounded border-neutral-300 text-stitch-primary focus:ring-stitch-primary cursor-pointer"
                      />
                    </th>
                    <th className="py-4.5 px-6 font-medium tracking-wide">주문번호</th>
                    <th className="py-4.5 px-6 font-medium tracking-wide">주문일시</th>
                    <th className="py-4.5 px-6 font-medium tracking-wide">상품코드 (품명)</th>
                    <th className="py-4.5 px-6 font-medium tracking-wide">선택 컬러</th>
                    <th className="py-4.5 px-6 font-medium tracking-wide text-center">수량</th>
                    <th className="py-4.5 px-6 font-medium tracking-wide text-right">도매단가</th>
                    <th className="py-4.5 px-6 font-medium tracking-wide text-right">총 금액</th>
                    <th className="py-4.5 px-6 font-medium tracking-wide text-center">요청사항</th>
                    <th className="py-4.5 px-6 font-medium tracking-wide text-center">진행 상황</th>
                    {activeTab === 'completed' && (
                      <th className="py-4.5 px-6 font-medium tracking-wide text-center w-32">재구매</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stitch-outline-variant/20">
                  {displayedOrders.map((order, idx) => {
                    const key = getOrderKey(order);
                    const isReordered = reorderSuccess === key;
                    const isChecked = selectedKeys.includes(key);

                    // Find product matching code to load its image
                    const code = order.상품코드;
                    const matchedProduct = products.find(p => 
                      (p.임시코드 && p.임시코드.toLowerCase().trim() === code.toLowerCase().trim()) ||
                      (p.상품명 && p.상품명.toLowerCase().trim() === code.toLowerCase().trim())
                    );
                    const imageUrl = matchedProduct 
                      ? `/api/image?week=${encodeURIComponent(matchedProduct.주차)}&code=${encodeURIComponent(code)}`
                      : null;

                    return (
                      <tr key={idx} className={`hover:bg-neutral-50/60 transition-colors ${isChecked ? 'bg-neutral-50/40' : ''}`}>
                        <td className="py-4 px-4 text-center">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleRowCheckboxChange(key)}
                            className="w-4 h-4 rounded border-neutral-300 text-stitch-primary focus:ring-stitch-primary cursor-pointer"
                          />
                        </td>
                        <td className="py-4 px-6 text-stitch-on-background font-mono text-xs font-semibold">{order.주문번호 || '-'}</td>
                        <td className="py-4 px-6 text-stitch-secondary font-mono text-xs">{order.주문일시}</td>
                        <td className="py-4 px-6 font-semibold text-stitch-on-background">
                          <div className="flex items-center gap-3">
                            {imageUrl ? (
                              <div 
                                className="w-10 h-[53px] bg-neutral-50 border border-neutral-200/40 rounded-sm overflow-hidden shrink-0 cursor-zoom-in relative group"
                                onClick={() => setPreviewImage(imageUrl)}
                                title="클릭하여 이미지 확대"
                              >
                                <img 
                                  src={imageUrl} 
                                  alt={order.상품코드} 
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              </div>
                            ) : (
                              <div className="w-10 h-[53px] bg-neutral-100 border border-neutral-200/40 rounded-sm shrink-0 flex items-center justify-center text-[10px] text-neutral-400 font-mono">
                                No Img
                              </div>
                            )}
                            <span className="font-mono text-xs">{order.상품코드}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="bg-neutral-100 text-neutral-800 text-xs px-2 py-0.5 rounded-[2px] font-medium border border-neutral-200/40">
                            {order.컬러}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center font-bold font-mono">{order.수량}</td>
                        <td className="py-4 px-6 text-right font-mono text-stitch-secondary">
                          {order.단가 ? `${order.단가.toLocaleString('ko-KR')}원` : '단가 문의'}
                        </td>
                        <td className="py-4 px-6 text-right font-mono font-semibold text-stitch-on-background">
                          {order.금액 ? `${order.금액.toLocaleString('ko-KR')}원` : '-'}
                        </td>
                        <td className="py-4 px-6 text-neutral-500 font-light max-w-[180px] truncate" title={order.요청사항}>
                          {order.요청사항 || '-'}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex flex-col items-center gap-1.5 justify-center">
                            {getStatusBadge(order.출고상황)}
                            {order.종결여부 === 'y' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-neutral-900 text-white border border-transparent tracking-wide select-none">
                                주문서 종결
                              </span>
                            )}
                          </div>
                          {order.출고상황 === '발송완료' && (order.발송처리 || order.운송장번호 || order.전표번호) && (
                            <div className="mt-1.5 text-[10px] text-stitch-secondary font-mono leading-tight space-y-0.5 text-center">
                              {order.전표번호 && <div>전표: {order.전표번호}</div>}
                              {order.발송날짜 && <div>날짜: {order.발송날짜}</div>}
                              {order.발송처리 && <div>배송: {order.발송처리} {order.택배사 ? `(${order.택배사})` : ''}</div>}
                              {order.운송장번호 && <div>송장: {order.운송장번호}</div>}
                            </div>
                          )}
                        </td>
                        {activeTab === 'completed' && (
                          <td className="py-3 px-6 text-center select-none">
                            <button
                              onClick={() => handleReorder(order)}
                              disabled={isReordered}
                              className={`text-[11px] font-semibold tracking-wider rounded-full px-4.5 py-1.5 transition-all duration-300 flex items-center gap-1 mx-auto cursor-pointer active:scale-95 border ${
                                isReordered
                                  ? 'bg-emerald-600 text-white border-transparent'
                                  : 'bg-stitch-primary text-white hover:bg-neutral-850 border-transparent shadow-sm'
                              }`}
                              style={{
                                fontFamily: 'var(--font-outfit), var(--font-noto), sans-serif',
                                fontWeight: 650
                              }}
                            >
                              {isReordered ? (
                                <>
                                  <Check className="w-3 h-3 stroke-[2.5]" />
                                  <span>담김!</span>
                                </>
                              ) : (
                                <span>재주문</span>
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stitch-surface-container-low w-full border-t border-stitch-outline-variant select-none">
        <div className="flex flex-col md:flex-row justify-between items-center px-[40px] py-[32px] w-full max-w-[1400px] mx-auto">
          <div className="flex flex-col mb-4 md:mb-0">
            <span className="font-semibold text-[18px] text-stitch-on-background mb-1" style={{ fontFamily: 'var(--font-outfit)' }}>U&ME</span>
            <p className="text-[10px] tracking-widest text-stitch-secondary">© 2026 U&ME B2B CURATION. All rights reserved.</p>
          </div>
          <div className="flex gap-6">
            <a className="text-[10px] tracking-widest text-stitch-secondary hover:text-stitch-primary transition-all duration-200 cursor-pointer">Terms</a>
            <a className="text-[10px] tracking-widest text-stitch-secondary hover:text-stitch-primary transition-all duration-200 cursor-pointer">Privacy</a>
            <a className="text-[10px] tracking-widest text-stitch-secondary hover:text-stitch-primary transition-all duration-200 cursor-pointer">Support</a>
          </div>
        </div>
      </footer>

      {/* Cart Sidebar Panel */}
      <CartSidebar 
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        customerName={session.customerName}
        products={products}
        discountGrade={session.discountGrade}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal 
        isOpen={isChangePasswordOpen} 
        onClose={() => setIsChangePasswordOpen(false)} 
      />

      {/* Image Zoom Preview Overlay */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/85 z-[1000] flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] w-full h-full flex items-center justify-center animate-scaleUp">
            <img 
              src={previewImage} 
              alt="Enlarged preview" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-md bg-white"
            />
          </div>
        </div>
      )}

    </div>
  );
}
