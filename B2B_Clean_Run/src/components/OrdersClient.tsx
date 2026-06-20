'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, CheckCircle2, Clock, LogOut, Package, RefreshCw, ShoppingCart } from 'lucide-react';
import { CustomerOrder, Product } from '@/lib/db';
import { useCart } from '@/context/CartContext';
import CartSidebar from './CartSidebar';
import ChangePasswordModal from './ChangePasswordModal';

interface OrdersClientProps {
  orders: CustomerOrder[];
  session: {
    customerName: string;
    discountGrade: string;
  };
  products: Product[];
}

export default function OrdersClient({ orders, session, products }: OrdersClientProps) {
  const router = useRouter();
  const { addToCart, cartCount } = useCart();
  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');
  const [reorderSuccess, setReorderSuccess] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const productByCode = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((product) => {
      if (product.임시코드) map.set(product.임시코드, product);
      if (product.상품명) map.set(product.상품명, product);
    });
    return map;
  }, [products]);

  const isShippedStatus = (status?: string): boolean => {
    const value = String(status || '').trim();
    return value.includes('완료') || value.includes('배송완료') || value.includes('배송 완료');
  };

  const progressOrders = orders.filter((order) => order.종결여부 !== 'y' && !isShippedStatus(order.출고상황));
  const completedOrders = orders.filter((order) => order.종결여부 === 'y' || isShippedStatus(order.출고상황));
  const displayedOrders = activeTab === 'progress' ? progressOrders : completedOrders;

  const totalAmount = displayedOrders.reduce((sum, order) => sum + (Number(order.금액) || 0), 0);
  const totalItems = displayedOrders.reduce((sum, order) => sum + (Number(order.수량) || 0), 0);

  const getOrderKey = (order: CustomerOrder) => `${order.주문일시}_${order.상품코드}_${order.컬러}_${order.사이즈 || ''}`;

  const getStatusBadge = (status?: string) => {
    const value = String(status || '').trim();

    if (value === '발송완료') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          발송완료
        </span>
      );
    }

    if (value === '오더진행' || value === '오더 진행') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
          <Package className="w-3.5 h-3.5" />
          오더진행
        </span>
      );
    }

    if (value === '주문확인') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          주문확인
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
        <Clock className="w-3.5 h-3.5" />
        {value === '출고 대기' ? '주문확인대기' : value || '주문확인대기'}
      </span>
    );
  };

  const handleReorder = (order: CustomerOrder) => {
    const key = getOrderKey(order);
    addToCart({
      productCode: order.상품코드,
      color: order.컬러,
      size: order.사이즈 || '',
      quantity: Number(order.수량) || 1,
      category: ''
    });
    setReorderSuccess(key);
    setIsCartOpen(true);
    window.setTimeout(() => setReorderSuccess(null), 2500);
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.refresh();
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9f7] text-neutral-950 font-sans antialiased">
      <div className="bg-[#111] text-white text-center py-2 text-[10px] tracking-[0.32em] uppercase select-none">
        B2B Wholesale Partner System | Order Status
      </div>

      <header className="w-full border-b border-neutral-200 bg-white sticky top-0 z-50 select-none">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-10 h-20 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-[11px] tracking-widest uppercase text-neutral-500 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Shop
          </button>

          <div className="flex flex-col items-center">
            <span className="font-semibold text-[28px] tracking-[0.2em] leading-none pl-[0.2em]" style={{ fontFamily: 'var(--font-outfit)' }}>U&ME</span>
            <span className="text-[10px] text-[#8c661b] tracking-[0.24em] mt-1.5 uppercase">B2B CURATION</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="hidden sm:inline-flex text-[11px] tracking-wider text-neutral-500 hover:text-black transition-colors"
            >
              비밀번호 변경
            </button>
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative text-neutral-700 hover:text-black transition-colors"
              title="장바구니"
            >
              <ShoppingCart className="w-[22px] h-[22px]" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[9px] font-mono font-bold w-5 h-5 rounded-full flex items-center justify-center border border-white">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="text-neutral-700 hover:text-black transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-[22px] h-[22px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1400px] mx-auto px-5 sm:px-10 py-10 flex-1">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <p className="text-[11px] text-neutral-500 tracking-widest uppercase mb-2">
              Client: <strong className="text-neutral-900">{session.customerName}</strong>
            </p>
            <h1 className="text-2xl font-bold tracking-tight">주문현황</h1>
            <p className="text-xs text-neutral-500 mt-2">주문 확인, 오더 진행, 발송 현황을 확인합니다.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-[280px]">
            <div className="bg-white border border-neutral-200 p-4 shadow-sm rounded-[4px]">
              <p className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">주문 총액</p>
              <p className="text-[15px] font-bold text-neutral-900 font-mono mt-1">{totalAmount.toLocaleString('ko-KR')}원</p>
            </div>
            <div className="bg-white border border-neutral-200 p-4 shadow-sm rounded-[4px]">
              <p className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">품목 총 수량</p>
              <p className="text-[15px] font-bold text-neutral-900 font-mono mt-1">{totalItems}개</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-neutral-200 mb-6">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('progress')}
              className={`py-3 text-xs font-semibold tracking-wider border-b-2 transition-colors ${
                activeTab === 'progress'
                  ? 'border-black text-black'
                  : 'border-transparent text-neutral-400 hover:text-black'
              }`}
            >
              진행중 주문 ({progressOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`py-3 text-xs font-semibold tracking-wider border-b-2 transition-colors ${
                activeTab === 'completed'
                  ? 'border-black text-black'
                  : 'border-transparent text-neutral-400 hover:text-black'
              }`}
            >
              완료 주문 ({completedOrders.length})
            </button>
          </div>
          <button
            onClick={() => router.refresh()}
            className="hidden sm:flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-black transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            새로고침
          </button>
        </div>

        <div className="bg-white border border-neutral-200 shadow-sm rounded-[4px] overflow-hidden">
          {displayedOrders.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-neutral-400 text-sm">
              표시할 주문이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] text-neutral-500">
                    <th className="py-3 px-4 text-left font-semibold">주문일시</th>
                    <th className="py-3 px-4 text-left font-semibold">상품</th>
                    <th className="py-3 px-4 text-center font-semibold">컬러</th>
                    <th className="py-3 px-4 text-center font-semibold">사이즈</th>
                    <th className="py-3 px-4 text-right font-semibold">수량</th>
                    <th className="py-3 px-4 text-right font-semibold">금액</th>
                    <th className="py-3 px-4 text-center font-semibold">상태</th>
                    <th className="py-3 px-4 text-center font-semibold">재주문</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {displayedOrders.map((order) => {
                    const key = getOrderKey(order);
                    const product = productByCode.get(order.상품코드);
                    return (
                      <tr key={key} className="hover:bg-neutral-50/70 transition-colors">
                        <td className="py-4 px-4 text-neutral-500 font-mono text-xs whitespace-nowrap">{order.주문일시}</td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-neutral-900">{order.상품코드}</div>
                          {product?.상품명 && product.상품명 !== order.상품코드 && (
                            <div className="text-[11px] text-neutral-400 mt-1">{product.상품명}</div>
                          )}
                          {order.요청사항 && (
                            <div className="text-[11px] text-neutral-500 mt-1">요청: {order.요청사항}</div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center text-neutral-700">{order.컬러 || '-'}</td>
                        <td className="py-4 px-4 text-center text-neutral-700 font-mono">{order.사이즈 || '-'}</td>
                        <td className="py-4 px-4 text-right font-mono">{Number(order.수량 || 0).toLocaleString('ko-KR')}</td>
                        <td className="py-4 px-4 text-right font-mono font-semibold">{Number(order.금액 || 0).toLocaleString('ko-KR')}원</td>
                        <td className="py-4 px-4 text-center">{getStatusBadge(order.출고상황 || order.주문확인)}</td>
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => handleReorder(order)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                              reorderSuccess === key
                                ? 'bg-emerald-600 text-white'
                                : 'bg-neutral-900 text-white hover:bg-neutral-700'
                            }`}
                          >
                            {reorderSuccess === key ? <Check className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                            {reorderSuccess === key ? '담김' : '담기'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-white w-full border-t border-neutral-200 select-none">
        <div className="flex flex-col md:flex-row justify-between items-center px-5 sm:px-10 py-8 w-full max-w-[1400px] mx-auto gap-4">
          <div className="flex flex-col">
            <span className="font-semibold text-[18px] text-neutral-900 mb-1" style={{ fontFamily: 'var(--font-outfit)' }}>U&ME</span>
            <p className="text-[10px] tracking-widest text-neutral-500">2026 U&ME B2B CURATION</p>
          </div>
          <p className="text-[11px] text-neutral-500">가입문의는 우측 텔레그램이나 전화 문의</p>
        </div>
      </footer>

      <CartSidebar 
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        customerName={session.customerName}
        products={products}
        discountGrade={session.discountGrade}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
