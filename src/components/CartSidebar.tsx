'use client';

import React, { useState, useEffect } from 'react';
import { useCart } from '@/context/CartContext';
import { X, Minus, Plus, Trash2, Check, Maximize2, Minimize2 } from 'lucide-react';
import { Product } from '@/lib/db';

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  products: Product[];
  discountGrade?: string;
}

function resolveProductPrice(product: Product, grade: string): number {
  const trimmedGrade = String(grade).trim().toUpperCase();
  let price = 0;
  
  if (trimmedGrade === 'S') {
    price = product.S등급가;
  } else if (trimmedGrade === 'A') {
    price = product.A등급;
  } else if (trimmedGrade === 'B') {
    price = product.B등급;
  } else if (trimmedGrade === 'C') {
    price = product.C등급;
  } else if (trimmedGrade === 'W') {
    price = product.W등급가 || 0;
  } else if (trimmedGrade === '일반등급' || trimmedGrade === '일반') {
    price = product.도매가;
  }

  // Fallback to wholesale price if the grade price is 0 or undefined
  if (!price || price === 0) {
    price = product.도매가;
  }

  return price;
}

export default function CartSidebar({ isOpen, onClose, customerName, products, discountGrade }: CartSidebarProps) {
  const { cartItems, updateQuantity, removeFromCart, clearCart } = useCart();
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // 체크박스 선택 관리 상태 (기본적으로 모두 checked 처리)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // 요청사항 메모 상태
  const [memo, setMemo] = useState('');

  // 장바구니 가로 너비 상태 및 리사이징 상태
  const [width, setWidth] = useState(448);
  const [isResizing, setIsResizing] = useState(false);

  // 개별 아이템의 임시 수량 입력 상태 (숫자 지우기 및 편집 시 삭제 방지용)
  const [tempQuantities, setTempQuantities] = useState<Record<string, string>>({});

  // 화면 크기에 맞게 초기 너비 설정
  useEffect(() => {
    if (isOpen) {
      if (window.innerWidth < 640) {
        setWidth(window.innerWidth);
      } else {
        setWidth(448);
      }
    }
  }, [isOpen]);

  // 마우스 드래그 리사이징 이벤트 리스너
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // 화면 오른쪽 끝 기준으로 마우스 X 좌표 차이를 너비로 지정
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 320 && newWidth <= window.innerWidth * 0.95) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // ESC 키 누르면 이미지 프리뷰 닫히도록 리스너 장착
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewImage(null);
      }
    };
    if (previewImage) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewImage]);

  if (!isOpen) return null;

  const isItemChecked = (productCode: string, color: string) => {
    const key = `${productCode}_${color}`;
    return checkedItems[key] !== false;
  };

  const toggleCheck = (productCode: string, color: string) => {
    const key = `${productCode}_${color}`;
    setCheckedItems(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }));
  };

  // 1. 체크된 품목들만 필터링
  const checkedCartItems = cartItems.filter(item => isItemChecked(item.productCode, item.color));
  const checkedItemsCount = checkedCartItems.length;
  const checkedTotalQuantity = checkedCartItems.reduce((sum, item) => sum + item.quantity, 0);

  // 2. 가격 계산 (체크된 상품 대상)
  const grade = discountGrade || 'C';
  const checkedTotalSupplyPrice = checkedCartItems.reduce((sum, item) => {
    const matchedProduct = products.find(p => p.상품명 === item.productCode || p.임시코드 === item.productCode);
    if (!matchedProduct) return sum;
    const price = resolveProductPrice(matchedProduct, grade);
    return sum + (price * item.quantity);
  }, 0);

  // 부가세 10% 및 합계 금액 계산
  const vat = Math.floor(checkedTotalSupplyPrice * 0.1);
  const totalAmount = checkedTotalSupplyPrice + vat;

  const handleOrderSubmit = async () => {
    if (checkedCartItems.length === 0) {
      alert('주문서에 접수할 상품을 선택해 주세요.');
      return;
    }

    setSubmitting(true);
    setSuccess(false);

    try {
      // 1. Send checked order payload to Next.js API
      const response = await fetch('/api/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerName,
          memo,
          items: checkedCartItems.map(item => ({
            productCode: item.productCode,
            color: item.color,
            quantity: item.quantity
          }))
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 2. Copy checked order formatted text to clipboard
        let clipboardText = `[주문서 - ${customerName}]\n`;
        if (memo.trim()) {
          clipboardText += `요청사항: ${memo.trim()}\n`;
        }
        clipboardText += checkedCartItems.map(item => {
          const matched = products.find(p => p.상품명 === item.productCode || p.임시코드 === item.productCode);
          const price = matched ? resolveProductPrice(matched, grade) : 0;
          return `- ${item.productCode} (${item.color}) : ${item.quantity}개 (단가: ${price.toLocaleString('ko-KR')}원, 소계: ${(price * item.quantity).toLocaleString('ko-KR')}원)`;
        }).join('\n') + `\n\n총 공급가액: ${checkedTotalSupplyPrice.toLocaleString('ko-KR')}원\n부가세 (10%): ${vat.toLocaleString('ko-KR')}원\n최종 합계 금액: ${totalAmount.toLocaleString('ko-KR')}원`;

        try {
          await navigator.clipboard.writeText(clipboardText);
        } catch (e) {
          console.error('Failed to copy to clipboard', e);
        }
        
        setSuccess(true);
        setCopied(true);
        
        // 3. Remove only the checked (ordered) items from cart
        checkedCartItems.forEach(item => {
          removeFromCart(item.productCode, item.color);
        });
        
        // Reset check status & memo
        setCheckedItems({});
        setMemo('');
        
        // Auto close sidebar after 3s
        setTimeout(() => {
          setSuccess(false);
          setCopied(false);
          onClose();
        }, 3000);
      } else {
        alert(data.message || '주문 처리 중 오류가 발생했습니다.');
      }
    } catch (err) {
      console.error('Order submit error:', err);
      alert('서버와 통신 중 오류가 발생하여 주문 처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30 transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div 
          style={{ 
            width: `${width}px`, 
            transition: isResizing ? 'none' : 'width 0.2s ease-out, transform 0.3s ease-in-out'
          }}
          className="max-w-full transform bg-white shadow-2xl transition-all duration-300 ease-in-out flex flex-col h-full border-l border-gray-100 relative"
        >
          {/* Resize Handle on Left Edge (Desktop only) */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
            className="absolute top-0 bottom-0 left-0 w-2.5 cursor-ew-resize hover:bg-neutral-200/50 active:bg-neutral-300/50 z-50 flex items-center justify-center group transition-colors"
            title="마우스 드래그로 가로 조절"
          >
            <div className="w-[1.5px] h-12 bg-neutral-300 group-hover:bg-neutral-600 group-active:bg-neutral-850 rounded transition-colors" />
          </div>
          
          {/* Header */}
          <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="font-serif tracking-widest text-base font-light text-neutral-900 uppercase">
              Shopping Cart
            </h2>
            <div className="flex items-center space-x-2">
              {/* Maximize/Minimize Quick Toggle (Desktop only) */}
              <button 
                onClick={() => {
                  if (width > 500) {
                    setWidth(448);
                  } else {
                    setWidth(Math.min(900, window.innerWidth * 0.85));
                  }
                }}
                className="text-neutral-400 hover:text-neutral-600 transition-colors p-1 hidden sm:block"
                title={width > 500 ? "기본 크기로 축소" : "전체 화면 수준으로 확대"}
              >
                {width > 500 ? (
                  <Minimize2 className="w-4.5 h-4.5 stroke-[1.5]" />
                ) : (
                  <Maximize2 className="w-4.5 h-4.5 stroke-[1.5]" />
                )}
              </button>
              <button 
                onClick={onClose}
                className="text-neutral-400 hover:text-neutral-600 transition-colors p-1"
              >
                <X className="w-5 h-5 stroke-[1.5]" />
              </button>
            </div>
          </div>

          {/* Cart items list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {cartItems.length === 0 && !success ? (
              <div className="h-64 flex flex-col items-center justify-center space-y-3 text-neutral-400">
                <span className="font-serif italic font-light text-sm">Your cart is empty.</span>
                <button 
                  onClick={onClose}
                  className="text-xs uppercase tracking-widest text-black underline underline-offset-4"
                >
                  Continue Browsing
                </button>
              </div>
            ) : success ? (
              <div className="h-64 flex flex-col items-center justify-center space-y-4 text-center px-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <Check className="w-6 h-6 stroke-[2]" />
                </div>
                <h3 className="text-sm font-semibold text-black tracking-wide">주문이 성공적으로 완료되었습니다!</h3>
                <p className="text-[11px] text-gray-500 leading-relaxed font-light">
                  주문서가 내 PC의 <code className="font-mono bg-neutral-100 px-1 py-0.5">Orders.xlsx</code>에 저장되었고 실시간 메시지 전송이 완료되었습니다. 카톡 전송용 클립보드 복사도 함께 진행되었습니다.
                </p>
              </div>
            ) : (
              cartItems.map((item) => {
                const matchedProduct = products.find(p => p.상품명 === item.productCode || p.임시코드 === item.productCode);
                const code = matchedProduct?.임시코드 || matchedProduct?.상품명 || item.productCode;
                const imageUrl = matchedProduct 
                  ? `/api/image?week=${encodeURIComponent(matchedProduct.주차)}&code=${encodeURIComponent(code)}`
                  : null;

                const isChecked = isItemChecked(item.productCode, item.color);
                const itemPrice = matchedProduct ? resolveProductPrice(matchedProduct, grade) : 0;

                return (
                  <div 
                    key={`${item.productCode}-${item.color}`}
                    className="flex py-4 border-b border-neutral-100/50 last:border-0 items-start gap-4"
                  >
                    {/* Checkbox */}
                    <div className="flex items-center self-center shrink-0 pr-1">
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(item.productCode, item.color)}
                        className="w-4.5 h-4.5 text-black border-neutral-300 rounded focus:ring-black cursor-pointer bg-white"
                      />
                    </div>

                    {/* Thumbnail Image (Click to zoom) */}
                    <div 
                      onClick={() => imageUrl && setPreviewImage(imageUrl)}
                      className={`w-14 aspect-[3/4] bg-neutral-50 overflow-hidden rounded-md shrink-0 border border-neutral-200/40 relative ${imageUrl ? 'cursor-zoom-in hover:brightness-95 transition-all' : ''}`}
                    >
                      {imageUrl ? (
                        <img 
                          src={imageUrl} 
                          alt={item.productCode} 
                          className="w-full h-full object-cover rounded-md"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-neutral-100 rounded-md flex items-center justify-center text-[9px] text-neutral-400 font-light">
                          NO IMG
                        </div>
                      )}
                    </div>

                    {/* Product Info & Quantity Controls */}
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-semibold tracking-wider text-black font-mono truncate">
                        {item.productCode}
                      </p>
                      <p className="text-[11px] text-neutral-800 font-medium mt-1">
                        컬러: {item.color}
                      </p>
                      
                      {/* Quantity Controls */}
                      <div className="flex items-center space-x-2 mt-3">
                        <button 
                          type="button"
                          onClick={() => {
                            const itemKey = `${item.productCode}-${item.color}`;
                            setTempQuantities(prev => {
                              const copy = { ...prev };
                              delete copy[itemKey];
                              return copy;
                            });
                            updateQuantity(item.productCode, item.color, Math.max(1, item.quantity - 1));
                          }}
                          className="p-1 border border-neutral-200 hover:bg-neutral-50 rounded-none transition-colors"
                        >
                          <Minus className="w-3 h-3 text-neutral-600" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={
                            tempQuantities[`${item.productCode}-${item.color}`] !== undefined 
                              ? tempQuantities[`${item.productCode}-${item.color}`] 
                              : (item.quantity === 0 ? '' : String(item.quantity))
                          }
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            const itemKey = `${item.productCode}-${item.color}`;
                            setTempQuantities(prev => ({ ...prev, [itemKey]: val }));
                            
                            if (val !== '') {
                              const parsed = parseInt(val, 10);
                              if (parsed > 0) {
                                updateQuantity(item.productCode, item.color, parsed);
                              }
                            }
                          }}
                          onBlur={() => {
                            const itemKey = `${item.productCode}-${item.color}`;
                            const localVal = tempQuantities[itemKey];
                            if (localVal !== undefined) {
                              const parsed = parseInt(localVal, 10);
                              if (isNaN(parsed) || parsed <= 0) {
                                updateQuantity(item.productCode, item.color, 1);
                              }
                            } else if (item.quantity <= 0) {
                              updateQuantity(item.productCode, item.color, 1);
                            }
                            setTempQuantities(prev => {
                              const copy = { ...prev };
                              delete copy[itemKey];
                              return copy;
                            });
                          }}
                          className="text-xs font-mono w-8 text-center text-black bg-transparent border border-neutral-200 py-0.5 focus:outline-none"
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const itemKey = `${item.productCode}-${item.color}`;
                            setTempQuantities(prev => {
                              const copy = { ...prev };
                              delete copy[itemKey];
                              return copy;
                            });
                            updateQuantity(item.productCode, item.color, item.quantity === 0 ? 1 : item.quantity + 1);
                          }}
                          className="p-1 border border-neutral-200 hover:bg-neutral-50 rounded-none transition-colors"
                        >
                          <Plus className="w-3 h-3 text-neutral-600" />
                        </button>
                      </div>
                    </div>

                    {/* Trash & Item Prices */}
                    <div className="flex flex-col items-end shrink-0 select-none justify-between h-full min-h-[90px]">
                      <button 
                        onClick={() => removeFromCart(item.productCode, item.color)}
                        className="text-neutral-300 hover:text-red-500 transition-colors p-1"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                      </button>
                      {itemPrice > 0 && (
                        <div className="text-right mt-3">
                          <p className="text-[10px] text-neutral-400 font-mono">
                            {itemPrice.toLocaleString('ko-KR')}원
                          </p>
                          <p className="text-[12px] font-bold text-neutral-950 font-mono mt-0.5">
                            {(itemPrice * item.quantity).toLocaleString('ko-KR')}원
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer actions */}
          {cartItems.length > 0 && (
            <div className="border-t border-neutral-100 px-6 py-6 bg-neutral-50 space-y-3.5">
              
              {/* 요청사항 입력란 */}
              <div className="space-y-1.5 pb-2">
                <label htmlFor="order-memo" className="text-[11px] font-bold text-neutral-850 uppercase tracking-wider block">
                  요청사항 (메모)
                </label>
                <textarea
                  id="order-memo"
                  rows={2}
                  placeholder="주문 시 전달하실 요청사항을 입력해 주세요. (예: 삼촌 전달 사항 등)"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full text-xs border border-neutral-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-black focus:border-black outline-none resize-none bg-white font-light text-neutral-900 shadow-sm"
                />
              </div>

              {/* 전체 선택 */}
              <div className="flex justify-between items-center text-xs tracking-wider text-neutral-600 font-light pb-2.5 border-b border-neutral-200/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={checkedCartItems.length === cartItems.length}
                    onChange={() => {
                      if (checkedCartItems.length === cartItems.length) {
                        const next: Record<string, boolean> = {};
                        cartItems.forEach(i => {
                          next[`${i.productCode}_${i.color}`] = false;
                        });
                        setCheckedItems(next);
                      } else {
                        setCheckedItems({});
                      }
                    }}
                    className="w-4 h-4 text-black border-neutral-300 rounded focus:ring-black cursor-pointer bg-white"
                  />
                  <span className="text-[11px] font-medium text-neutral-800">전체 선택 ({checkedCartItems.length}/{cartItems.length})</span>
                </label>
              </div>

              <div className="flex justify-between items-center text-xs tracking-wider text-neutral-800 uppercase font-medium">
                <span>선택 종류 / 수량</span>
                <span className="font-mono text-black font-bold">{checkedItemsCount} 종 / {checkedTotalQuantity} 개</span>
              </div>
              
              <div className="flex justify-between items-center text-xs tracking-wider text-neutral-800 uppercase font-medium pt-0.5">
                <span>공급가액 (VAT 별도)</span>
                <span className="font-mono text-black font-bold">{checkedTotalSupplyPrice.toLocaleString('ko-KR')}원</span>
              </div>

              <div className="flex justify-between items-center text-xs tracking-wider text-neutral-800 uppercase font-medium">
                <span>부가세 (10%)</span>
                <span className="font-mono text-black font-bold">{vat.toLocaleString('ko-KR')}원</span>
              </div>

              <div className="flex justify-between items-center text-xs tracking-wider text-neutral-600 uppercase font-light pt-2.5 border-t border-neutral-200/50">
                <span className="text-[12px] font-bold text-neutral-800">총 상품 금액 (합계)</span>
                <span className="font-mono text-neutral-950 font-bold text-sm">{totalAmount.toLocaleString('ko-KR')}원</span>
              </div>

              {copied && (
                <div className="bg-emerald-50 text-emerald-700 text-xs px-4 py-3 text-center border border-emerald-100 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>선택된 주문 내역이 클립보드에 복사되었습니다!</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={clearCart}
                  disabled={submitting}
                  className="py-3 border border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-600 text-xs tracking-widest uppercase transition-colors rounded-none disabled:opacity-50"
                >
                  비우기
                </button>
                <button
                  onClick={handleOrderSubmit}
                  disabled={submitting}
                  className="py-3 bg-black hover:bg-neutral-800 text-white text-xs tracking-widest uppercase font-semibold transition-colors rounded-none disabled:bg-neutral-400"
                >
                  {submitting ? '처리 중...' : '주문서 접수하기'}
                </button>
              </div>

              <p className="text-[10px] text-gray-400 text-center font-light leading-relaxed mt-2">
                * 체크된 상품만 주문 저장 및 전송되며, 주문 완료 후 장바구니에서 소거됩니다. (미선택 상품은 유지)
              </p>
            </div>
          )}

        </div>
      </div>

      {/* Image Zoom Preview Overlay */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 cursor-zoom-out p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-full overflow-hidden bg-transparent select-none">
            <img 
              src={previewImage} 
              alt="Cart product zoom preview"
              className="max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl border border-neutral-800"
            />
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/75 bg-black/60 px-3 py-1 font-mono text-[9px] tracking-widest uppercase rounded-full whitespace-nowrap">
              Click anywhere or ESC to close
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
