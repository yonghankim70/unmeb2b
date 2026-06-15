'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Product, Customer, GlobalSettings } from '@/lib/db';
import { useCart } from '@/context/CartContext';
import CartSidebar from './CartSidebar';
import ProductDetailModal from './ProductDetailModal';
import ChangePasswordModal from './ChangePasswordModal';
import { ShoppingBag, RefreshCw, LogOut, Award, Sparkles, Plus, Check, Crown, Phone, MessageSquare, X } from 'lucide-react';

interface DashboardClientProps {
  products: Product[];
  session?: {
    customerName: string;
    discountGrade: string;
  } | null;
  globalSettings?: GlobalSettings;
}

export function getGradeLabel(grade?: string | null): string {
  if (!grade) return '비회원';
  const trimmed = String(grade).trim();
  if (trimmed.endsWith('등급')) return trimmed;
  return `${trimmed.toUpperCase()}등급`;
}

export function resolveProductPrice(product: Product, grade?: string | null): number {
  if (!grade) return 0;
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

export function resolveColorHex(colorName: string): string {
  const name = colorName.trim().toLowerCase();
  if (name.includes('블랙') || name.includes('검정') || name.includes('black')) return '#111111';
  if (name.includes('화이트') || name.includes('흰색') || name.includes('white')) return '#ffffff';
  if (name.includes('아이보리') || name.includes('ivory')) return '#fbfbf9';
  if (name.includes('크림') || name.includes('cream')) return '#f7f2ea';
  if (name.includes('네이비') || name.includes('곤색') || name.includes('navy')) return '#1a2b4c';
  if (name.includes('소라') || name.includes('sora') || name.includes('sky')) return '#b5c9d6';
  if (name.includes('베이지') || name.includes('beige')) return '#d9cdbc';
  if (name.includes('카키') || name.includes('khaki')) return '#656d5c';
  if (name.includes('브라운') || name.includes('갈색') || name.includes('brown')) return '#6c5344';
  if (name.includes('카멜') || name.includes('camel')) return '#bfa38a';
  if (name.includes('차콜') || name.includes('먹색') || name.includes('charcoal')) return '#444444';
  if (name.includes('그레이') || name.includes('회색') || name.includes('gray') || name.includes('grey')) return '#a3a3a3';
  if (name.includes('멜란지') || name.includes('메란지') || name.includes('melange')) return '#cccccc';
  if (name.includes('핑크') || name.includes('pink')) return '#f0b5be';
  if (name.includes('민트') || name.includes('mint')) return '#bfe3db';
  if (name.includes('블루') || name.includes('blue')) return '#3d7cbd';
  if (name.includes('레드') || name.includes('빨강') || name.includes('red')) return '#c23b3b';
  if (name.includes('와인') || name.includes('wine')) return '#6b2d38';
  if (name.includes('그린') || name.includes('초록') || name.includes('green')) return '#4c8c5c';
  if (name.includes('옐로우') || name.includes('노랑') || name.includes('yellow')) return '#f0d36c';
  if (name.includes('오렌지') || name.includes('주황') || name.includes('orange')) return '#e67e22';
  if (name.includes('퍼플') || name.includes('보라') || name.includes('purple')) return '#8e44ad';
  if (name.includes('라벤더') || name.includes('lavender')) return '#decce6';
  if (name.includes('머스타드') || name.includes('mustard')) return '#e5a93b';
  if (name.includes('샌드') || name.includes('sand')) return '#cfc5b4';
  
  return '#e5e5e5';
}

export function shouldShowProduct(product: Product, session?: { customerName: string; discountGrade: string } | null): boolean {
  // 노출제외(노출제외 컬럼) 필터링 우선 수행
  if (session && product.노출제외) {
    const myName = String(session.customerName || '').trim().toLowerCase();
    if (myName) {
      const excludedCustomers = String(product.노출제외)
        .split(',')
        .map(s => s.trim().toLowerCase());
      if (excludedCustomers.includes(myName)) {
        return false;
      }
    }
  }

  const exposure = String(product.노출여부 || '').trim().toLowerCase();

  // If blank/empty, default to visible (exposed to all) for backward compatibility
  if (exposure === '') {
    return true;
  }

  // 'n' -> Non-exposed
  if (exposure === 'n') {
    return false;
  }

  // 'y' -> Exposed to all
  if (exposure === 'y') {
    return true;
  }

  if (!session) {
    return true;
  }

  const myGrade = String(session.discountGrade || 'C').trim().toLowerCase();
  const myName = String(session.customerName || '').trim().toLowerCase();
  
  // 특정 거래처 다중 지정 및 등급 노출 처리를 위해 쉼표로 분리하여 확인합니다.
  const allowedItems = exposure.split(',').map(item => item.trim().toLowerCase());
  
  // 로그인한 고객의 접속 등급(a, b, c 등)이 포함되어 있으면 노출
  if (allowedItems.includes(myGrade)) {
    return true;
  }

  // 로그인한 고객의 업체명(예: 서울상사)이 포함되어 있으면 노출
  if (allowedItems.includes(myName)) {
    return true;
  }

  return false;
}

export default function DashboardClient({ products, session, globalSettings }: DashboardClientProps) {
  const router = useRouter();
  const { addToCart, cartCount } = useCart();
  
  // State
  const [isMounted, setIsMounted] = useState(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number; products: string[] } | null>(null);
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isSpeedDialOpen, setIsSpeedDialOpen] = useState(false);
  
  // Local state for product item configurations (selected colors & quantities)
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addingSuccess, setAddingSuccess] = useState<Record<string, boolean>>({});

  // Login popup state
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginCustomerName, setLoginCustomerName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleAccessCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginCustomerName.trim() || !loginPassword.trim()) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: loginCustomerName, password: loginPassword })
      });
      const data = await res.json();
      if (data.success) {
        setIsLoginModalOpen(false);
        setLoginCustomerName('');
        setLoginPassword('');
        router.refresh();
      } else {
        setLoginError(data.message || '등록되지 않은 거래처명이거나 비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('로그인 중 서버 오류가 발생했습니다.');
    } finally {
      setLoginLoading(false);
    }
  };

  const gradeLabel = getGradeLabel(session?.discountGrade);

  const renderPointBadge = (point?: string) => {
    if (!point) return null;
    const trimmed = point.trim();
    if (!trimmed) return null;
    
    let bgClass = "bg-neutral-100 text-neutral-800 border border-neutral-200";
    if (trimmed === "오더만") {
      bgClass = "bg-neutral-950 text-white";
    } else if (trimmed === "공동구매") {
      bgClass = "bg-amber-100 text-amber-800 border border-amber-200";
    } else if (trimmed === "세일") {
      bgClass = "bg-rose-500 text-white";
    } else if (trimmed === "품절") {
      bgClass = "bg-neutral-100 text-neutral-400 border border-neutral-200";
    }
    
    return (
      <span className={`inline-block text-[10px] font-semibold tracking-wider px-2.5 py-0.5 uppercase ${bgClass}`}>
        {trimmed}
      </span>
    );
  };

  // 1. Redefined Categories for Main Menu
  const categories = ['ALL', 'NEW', '선기획', 'TOP', 'BOTTOM', 'OUTER', 'ONE-PIECE'];

  // DB category to storefront category mapping helper
  const getProductMainCategories = (product: Product): string[] => {
    const mainCats = new Set<string>();
    
    // 1. 카테고리 필드 처리 (신상 -> NEW, 선기획 -> 선기획)
    if (product.카테고리) {
      const parts = product.카테고리.split(',').map(s => s.trim());
      parts.forEach(name => {
        if (name === '신상') mainCats.add('NEW');
        else if (name === '선기획') mainCats.add('선기획');
      });
    }

    // 2. 아이템 필드 처리 (TOP, BOTTOM, OUTER, ONE-PIECE 매핑)
    if (product.아이템) {
      const itemStr = product.아이템.trim();
      const match = itemStr.match(/^([a-zA-Z0-9-]+)(?:\(([^)]+)\))?/);
      if (match) {
        const code = match[1].toUpperCase();
        const koName = match[2] || '';

        // TOP --> KT, SH, BL, VT, TS, NS
        if (['KT', 'SH', 'BL', 'VT', 'TS', 'NS'].includes(code) || 
            ['니트', '블라우스', '셔츠/남방', '셔츠', '베스트', '티셔츠', '나시'].includes(koName)) {
          mainCats.add('TOP');
        }
        // BOTTOM --> PT, SK, HPT
        else if (['PT', 'SK', 'HPT'].includes(code) || 
                 ['팬츠', '반바지', '스커트'].includes(koName)) {
          mainCats.add('BOTTOM');
        }
        // OUTER --> L-JK, SET, Y, JP, JK, CT
        else if (['L-JK', 'SET', 'Y', 'JP', 'JK', 'CT'].includes(code) || 
                 ['레자', '세트', '가디건', '점퍼', '자켓', '코트'].includes(koName)) {
          mainCats.add('OUTER');
        }
        // ONE-PIECE --> ONE-PIECE, OPS
        else if (['ONE-PIECE', 'OPS'].includes(code) || 
                 ['원피스'].includes(koName)) {
          mainCats.add('ONE-PIECE');
        }
      }
    }
    
    return Array.from(mainCats);
  };

  // 2. Data Filtering & Ordering
  // - Show only if customer has permission based on 노출여부
  const filteredProducts = products.filter(p => shouldShowProduct(p, session));

  // - Sort by: Recommended (oldest first) -> Normal (newest first)
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const aRec = !!a.추천;
    const bRec = !!b.추천;

    if (aRec && !bRec) return -1;
    if (!aRec && bRec) return 1;

    if (aRec && bRec) {
      // Recommended: Oldest first (ascending order of week)
      const cmp = (a.주차 || '').localeCompare(b.주차 || '');
      if (cmp !== 0) return cmp;
      return (a.임시코드 || a.상품명 || '').localeCompare(b.임시코드 || b.상품명 || '');
    } else {
      // Normal: Newest first (descending order of week)
      const cmp = (b.주차 || '').localeCompare(a.주차 || '');
      if (cmp !== 0) return cmp;
      return (b.임시코드 || b.상품명 || '').localeCompare(a.임시코드 || a.상품명 || '');
    }
  });

  // Apply Category selection
  const displayedProducts = selectedCategory === 'ALL' 
    ? sortedProducts 
    : sortedProducts.filter(p => getProductMainCategories(p).includes(selectedCategory));

  // Handlers
  const handleLogout = async () => {
    try {
      const res = await fetch('/api/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncResult({
          count: data.addedCount,
          products: data.addedProducts,
        });
        // Auto dismiss sync toast after 4s
        setTimeout(() => setSyncResult(null), 4000);
        router.refresh(); // Refresh page data from Excel
      } else {
        alert(data.message || '동기화 실패');
      }
    } catch (e) {
      console.error(e);
      alert('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddToCart = (product: Product) => {
    const code = product.임시코드 || product.상품명;
    const colors = parseColors(product.컬러);
    const selectedColor = selectedColors[code] || colors[0];
    const qty = quantities[code] || 1;

    addToCart({
      productCode: product.상품명, // Use the official 상품명 in order logs
      color: selectedColor,
      quantity: qty,
      category: product.카테고리,
    });

    // Reset local quant input
    setQuantities(prev => ({ ...prev, [code]: 1 }));
    
    // Show success animation
    setAddingSuccess(prev => ({ ...prev, [code]: true }));
    setTimeout(() => {
      setAddingSuccess(prev => ({ ...prev, [code]: false }));
    }, 1500);
  };

  const handleAddToCartFromModal = (product: Product, color: string, qty: number) => {
    addToCart({
      productCode: product.상품명, // Use the official 상품명 in order logs
      color,
      quantity: qty,
      category: product.카테고리,
    });
  };

  const parseColors = (colorStr: string): string[] => {
    if (!colorStr) return [];
    const colors = colorStr.split(/[,/]/).map(c => {
      const trimmed = c.trim();
      const match = trimmed.match(/^[A-Za-z0-9#-]+\(([^)]+)\)$/);
      if (match) return match[1].trim();
      const innerMatch = trimmed.match(/\(([^)]+)\)/);
      if (innerMatch) return innerMatch[1].trim();
      return trimmed;
    }).filter(Boolean);
    return colors;
  };

  const renderProductCard = (product: Product) => {
    const code = product.임시코드 || product.상품명;
    const resolvedPrice = session ? resolveProductPrice(product, session.discountGrade) : 0;
    const colors = parseColors(product.컬러);

    return (
      <div key={code} className="flex flex-col group relative">
        {/* Thumbnail Image Wrapper */}
        <div 
          className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-50 mb-3 select-none cursor-pointer"
          onClick={() => {
            if (!session) {
              setIsLoginModalOpen(true);
            } else {
              setSelectedDetailProduct(product);
              setIsDetailOpen(true);
            }
          }}
        >
          {/* Gold crown icon for recommended products */}
          {Number(product.추천) > 0 && (
            <div className="absolute top-3 right-3 z-10 bg-[#fbf9f3] text-amber-600 rounded-full p-1.5 shadow-sm flex items-center justify-center border border-amber-200/80">
              <Crown className="w-3.5 h-3.5 fill-amber-200/30 stroke-[1.8]" />
            </div>
          )}

          {/* Image URL calling local API stream (uses code = product.임시코드) */}
          <img
            src={`/api/image?week=${encodeURIComponent(product.주차)}&code=${encodeURIComponent(code)}`}
            alt={product.상품명}
            className="h-full w-full object-cover object-center rounded-md group-hover:scale-[1.03] transition-transform duration-700 ease-out"
            loading="lazy"
          />
        </div>

        {/* Information Details (Exactly 4 Items: Name, Color, Price, Point) */}
        <div className="flex-1 flex flex-col items-center justify-start space-y-2 px-2 select-none font-sans text-center mt-3.5">
          
          {/* 1. Point Badge (if exists) */}
          {product.포인트 && (
            <div className="flex flex-wrap justify-center gap-1 mb-0.5">
              {renderPointBadge(product.포인트)}
            </div>
          )}

          {/* 2. Product Name */}
          <h3 
            className="text-[13px] font-medium text-neutral-900 tracking-wide cursor-pointer hover:underline leading-relaxed"
            onClick={() => {
              if (!session) {
                setIsLoginModalOpen(true);
              } else {
                setSelectedDetailProduct(product);
                setIsDetailOpen(true);
              }
            }}
          >
            {product.상품명}
          </h3>

          {/* 3. Color Names (e.g. "블랙, 네이비") */}
          <p className="text-[11px] text-neutral-450 font-normal leading-normal tracking-[0.08em]">
            {colors.join(', ')}
          </p>

          {/* 3-2. Color Circles (Small circles instead of thin bars) */}
          <div className="flex justify-center items-center gap-1.5 mt-0.5">
            {colors.map((colorName) => {
              const hex = resolveColorHex(colorName);
              const isWhiteOrVeryLight = hex === '#ffffff' || hex === '#fbfbf9' || hex === '#f7f2ea';
              return (
                <div 
                  key={colorName}
                  title={colorName}
                  className={`w-2.5 h-2.5 rounded-full transition-transform hover:scale-110 ${
                    isWhiteOrVeryLight ? 'border border-neutral-300' : 'border border-neutral-950/10'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
          </div>

          {/* 4. Price Block */}
          <div className="pt-0.5">
            {!session ? (
              <span 
                className="text-[11.5px] font-semibold text-rose-600 cursor-pointer hover:underline"
                onClick={() => setIsLoginModalOpen(true)}
              >
                로그인 후 확인
              </span>
            ) : (!product.단가 || product.단가 === 0) ? (
              <span className="text-xs font-medium text-neutral-500">
                가격 문의
              </span>
            ) : resolvedPrice > 0 ? (
              <span className="text-[13.5px] font-semibold text-neutral-950 font-mono">
                {resolvedPrice.toLocaleString('ko-KR')}원
              </span>
            ) : (
              <span className="text-xs font-medium text-neutral-500">
                가격 문의
              </span>
            )}
          </div>

        </div>
      </div>
    );
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <div className="text-neutral-500 tracking-[0.3em] text-[13px] font-light uppercase select-none animate-pulse">
          Loading U&ME Partner System...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      
      {/* Top Banner */}
      <div className="w-full bg-[#111111] text-[#e0e0e0] text-[9px] sm:text-[10px] tracking-[0.05em] sm:tracking-[0.2em] font-light text-center py-2 uppercase select-none px-4">
        <span className="hidden sm:inline">B2B Wholesale Partner System | </span>매일 트렌디한 신상 업데이트
      </div>

      {/* Header Utilities */}
      <header className="py-2 px-4 md:px-12 flex justify-between items-center text-[11px] tracking-wider font-light select-none text-neutral-500 bg-[#f5f5f3] min-h-11 h-auto flex-wrap sm:flex-nowrap gap-2 border-b border-neutral-200/20">
        <div className="flex items-center gap-1.5">
          {session ? (
            <>
              <Award className="w-3.5 h-3.5 stroke-[1.5] text-neutral-600" />
              <span className="font-semibold text-neutral-700 max-sm:max-w-[120px] truncate">{session.customerName}</span>
            </>
          ) : (
            <span className="text-neutral-400">U&ME B2B 큐레이션 시스템</span>
          )}
        </div>
        
        <div className="flex items-center space-x-0.5 sm:space-x-1 flex-wrap sm:flex-nowrap gap-1">
          {session && (
            <button 
              onClick={handleSync}
              disabled={syncing}
              className={`text-[11px] sm:text-[12.5px] tracking-wider sm:tracking-widest text-neutral-500 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-neutral-200 sm:border-transparent cursor-pointer transition-all duration-300 flex items-center gap-1 hover:bg-[#7a7369] hover:text-white hover:shadow-sm active:scale-95 ${syncing ? 'opacity-50' : ''}`}
              style={{ fontWeight: 650, fontFamily: 'var(--font-outfit), var(--font-noto), sans-serif' }}
            >
              <span className="hidden sm:inline">New Arrival</span>
              <span className="sm:hidden">신상동기화</span>
              {syncing && <RefreshCw className="w-3 h-3 animate-spin" />}
            </button>
          )}
          
          {session && (
            <button 
              onClick={() => router.push('/orders')}
              className="text-[11px] sm:text-[12.5px] tracking-wider sm:tracking-widest text-neutral-500 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-neutral-200 sm:border-transparent cursor-pointer transition-all duration-300 hover:bg-[#7a7369] hover:text-white hover:shadow-sm active:scale-95"
              style={{ fontWeight: 650, fontFamily: 'var(--font-outfit), var(--font-noto), sans-serif' }}
            >
              <span className="hidden sm:inline">Order Status</span>
              <span className="sm:hidden">주문현황</span>
            </button>
          )}

          {session && (
            <button 
              onClick={() => setIsChangePasswordOpen(true)}
              className="text-[11px] sm:text-[12.5px] tracking-wider sm:tracking-widest text-neutral-500 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-neutral-200 sm:border-transparent cursor-pointer transition-all duration-300 hover:bg-[#7a7369] hover:text-white hover:shadow-sm active:scale-95"
              style={{ fontWeight: 650, fontFamily: 'var(--font-outfit), var(--font-noto), sans-serif' }}
            >
              <span className="hidden sm:inline">비밀번호 변경</span>
              <span className="sm:hidden">비번변경</span>
            </button>
          )}
          
          {session && <span className="text-neutral-300 px-0.5 sm:px-1 font-mono text-[9px] select-none hidden sm:inline">|</span>}

          {!session ? (
            <button 
              onClick={() => setIsLoginModalOpen(true)}
              className="text-[11.5px] text-neutral-600 font-bold px-4 py-1 hover:text-black hover:bg-neutral-200/50 transition-colors flex items-center gap-1 rounded-full border border-neutral-300"
            >
              <span>로그인</span>
            </button>
          ) : (
            <button 
              onClick={handleLogout}
              className="text-[11.5px] text-neutral-500 px-3 py-1.5 hover:text-black transition-colors flex items-center gap-1.5 rounded-full hover:bg-neutral-200/40"
              style={{ fontWeight: 500 }}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>
          )}
        </div>
      </header>

      {/* Logo Wrapper (Grey Background Header) */}
      <div className="bg-[#f5f5f3] select-none w-full border-b border-neutral-200/20 pt-12 pb-10">
        {/* Brand Title Area */}
        <div className="text-center flex flex-col items-center justify-center select-none">
          <div className="inline-block">
            <h1 
              className="tracking-[0.1em] text-[52px] font-bold uppercase leading-none cursor-pointer gold-foil-light-bg font-cinzel pl-[0.1em]" 
              style={{ fontFamily: 'var(--font-cinzel)' }}
              onClick={() => {
                setSelectedCategory('ALL');
              }}
            >
              U&ME
            </h1>
            <div className="w-[160px] h-[1px] bg-gradient-to-r from-transparent via-[#9a7428] to-transparent my-4 mx-auto"></div>
            <p className="text-[12.5px] text-[#8c661b] tracking-[0.45em] uppercase font-semibold pl-[0.45em] font-sans">
              B2B CURATION
            </p>
          </div>
        </div>
      </div>

      {/* Category Tabs (Direct child of root, sticky across the whole page scroll, glassmorphism applied) */}
      {(globalSettings?.showCategoriesOnMain !== false) && (
        <nav className="w-full sticky top-0 z-40 bg-[#f5f5f3]/90 backdrop-blur-md border-b border-neutral-200/10 py-3 shadow-sm select-none">
          <div className="max-w-screen-xl mx-auto px-4 overflow-x-auto flex sm:justify-center justify-start scrollbar-none">
            <div className="flex flex-nowrap sm:flex-wrap sm:justify-center gap-3 sm:gap-5 py-1">
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`text-[12px] tracking-[0.14em] uppercase rounded-full px-5 py-[10px] font-semibold transition-all duration-300 min-w-[100px] text-center flex items-center justify-center subpixel-antialiased ${
                      isSelected
                        ? 'bg-[#7a7369] text-white shadow-sm border border-transparent'
                        : 'bg-white text-[#4e4a43] hover:bg-[#7a7369] hover:text-white border border-neutral-200/20'
                    }`}
                    style={{
                      fontFamily: 'var(--font-outfit), var(--font-noto), sans-serif',
                      textRendering: 'geometricPrecision',
                      fontWeight: 650
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      {/* First Row of Products (Featured Section with its own soft grey background to prevent layout bleeding) */}
      {displayedProducts.length > 0 && (
        <div className="bg-[#f5f5f3]/40 w-full border-b border-neutral-200/20 py-12 select-none">
          <div className="max-w-[1400px] mx-auto px-5 w-full">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-9 gap-y-8 sm:gap-y-18">
              {displayedProducts.slice(0, 4).map((product) => renderProductCard(product))}
            </div>
          </div>
        </div>
      )}

      {/* Sync Status Toast */}
      {syncResult && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-[#111] text-white px-6 py-4 shadow-xl border border-neutral-800 max-w-md w-full">
          <p className="text-xs font-semibold tracking-wider flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>데이터 동기화 완료!</span>
          </p>
          <p className="text-[10px] text-gray-400 mt-1 font-light leading-relaxed">
            스캔을 진행하여 총 {syncResult.count}개의 새로운 상품 폴더를 추가했습니다.
            {syncResult.count > 0 && ` (${syncResult.products.join(', ')})`}
          </p>
        </div>
      )}

      {/* Main Gallery Grid (Remaining products on White background) */}
      <main className="flex-1 max-w-[1400px] mx-auto px-5 py-14 w-full">
        {displayedProducts.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center space-y-3 text-neutral-400 select-none">
            <span className="text-[14px] text-neutral-500 tracking-wide font-medium">새로운 상품이 곧 업데이트됩니다.</span>
          </div>
        ) : (
          <>
            {displayedProducts.length > 4 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 sm:gap-x-9 gap-y-8 sm:gap-y-18">
                {displayedProducts.slice(4).map((product) => renderProductCard(product))}
              </div>
            ) : null}
          </>
        )}
      </main>

      {/* Floating Sticky Actions (Always visible, compact size to prevent layout block) */}
      <div className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-40 flex flex-col gap-2 sm:gap-2.5 items-end select-none">
        
        {/* Cart Button */}
        <button
          onClick={() => {
            if (!session) {
              setIsLoginModalOpen(true);
            } else {
              setIsCartOpen(true);
            }
          }}
          className="w-[38px] h-[38px] md:w-[48px] md:h-[48px] rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border border-neutral-200/40 bg-white relative"
        >
          <img 
            src="/cart.png" 
            alt="Cart" 
            className="w-full h-full rounded-full object-cover" 
          />
          {cartCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-[#ba1a1a] text-white text-[8px] md:text-[9.5px] font-mono font-bold w-[15px] h-[15px] md:w-[19px] md:h-[19px] rounded-full flex items-center justify-center border border-white">
              {cartCount}
            </span>
          )}
        </button>

        {/* Telegram Q/A */}
        <a
          href={process.env.NEXT_PUBLIC_TELEGRAM_URL || 'https://t.me/unme802'} 
          target="_blank"
          rel="noopener noreferrer"
          title="텔레그램 Q/A"
          className="w-[38px] h-[38px] md:w-[48px] md:h-[48px] rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border border-neutral-200/40 bg-white"
        >
          <img 
            src="/telegram.png" 
            alt="Q/A" 
            className="w-full h-full rounded-full object-cover" 
          />
        </a>

        {/* SMS Message */}
        <a
          href={`sms:${process.env.NEXT_PUBLIC_COMPANY_PHONE || '010-4481-7802'}`}
          title="문자 문의"
          className="w-[38px] h-[38px] md:w-[48px] md:h-[48px] rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border border-neutral-200/40 bg-white"
        >
          <div className="w-[26px] h-[26px] md:w-[34px] md:h-[34px] bg-blue-500 rounded-full flex items-center justify-center text-white shadow-inner">
            <MessageSquare className="w-[12px] h-[12px] md:w-[16px] md:h-[16px] stroke-[2.5]" />
          </div>
        </a>

        {/* Phone Call */}
        <a
          href={`tel:${process.env.NEXT_PUBLIC_COMPANY_PHONE || '010-4481-7802'}`}
          title="전화 문의"
          className="w-[38px] h-[38px] md:w-[48px] md:h-[48px] rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border border-neutral-200/40 bg-white"
        >
          <div className="w-[26px] h-[26px] md:w-[34px] md:h-[34px] bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-inner">
            <Phone className="w-[12px] h-[12px] md:w-[16px] md:h-[16px] stroke-[2.5]" />
          </div>
        </a>
      </div>

      {/* Footer (Stitch 2.0 layout) */}
      <footer className="bg-[#121212] w-full mt-[48px] border-t border-neutral-900 select-none text-neutral-400">
        <div className="flex flex-col md:flex-row justify-between items-center px-[40px] py-[40px] w-full max-w-[1400px] mx-auto">
          <div className="flex flex-col mb-8 md:mb-0">
            <div className="flex flex-col mb-2 items-start select-none">
              <span className="font-bold text-[22px] gold-foil-text font-cinzel leading-none mb-1" style={{ fontFamily: 'var(--font-cinzel)' }}>U&ME</span>
              <div className="w-[70px] h-[1px] bg-gradient-to-r from-transparent via-[#bf953f] to-transparent my-1.5"></div>
              <span className="text-[7.5px] tracking-[0.25em] text-[#bf953f] uppercase font-light pl-[0.25em] font-sans">B2B CURATION</span>
            </div>
            <p className="text-[10.5px] tracking-widest text-neutral-500 mt-2">© 2026 U&ME B2B CURATION. All rights reserved.</p>
            <p className="text-[12px] text-neutral-300 font-medium bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded mt-2.5 inline-block w-fit">
              📢 가입문의는 우측 텔레그램이나 전화 문의
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <a className="text-[10.5px] tracking-widest text-neutral-400 hover:text-[#bf953f] transition-all duration-300 cursor-pointer">Terms of Service</a>
            <a className="text-[10.5px] tracking-widest text-neutral-400 hover:text-[#bf953f] transition-all duration-300 cursor-pointer">Privacy Policy</a>
            <a className="text-[10.5px] tracking-widest text-neutral-400 hover:text-[#bf953f] transition-all duration-300 cursor-pointer">Wholesale Inquiry</a>
            <a className="text-[10.5px] tracking-widest text-neutral-400 hover:text-[#bf953f] transition-all duration-300 cursor-pointer">Contact Support</a>
          </div>
        </div>
      </footer>

      {/* Cart Sidebar Panel */}
      <CartSidebar 
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        customerName={session?.customerName || ''}
        products={products}
        discountGrade={session?.discountGrade || ''}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        product={selectedDetailProduct}
        session={session}
        onAddToCart={handleAddToCartFromModal}
      />

      {/* Login Popup Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center select-none">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 transition-opacity duration-300 animate-fadeIn"
            onClick={() => setIsLoginModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="bg-white w-full max-w-md p-8 relative z-10 shadow-2xl overflow-hidden rounded-none border border-neutral-100 mx-4 animate-scaleUp text-neutral-800">
            {/* Close Button */}
            <button 
              onClick={() => setIsLoginModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-black transition-colors"
            >
              <X className="w-5 h-5 stroke-[1.5]" />
            </button>

            {/* Brand Header */}
            <div className="text-center mb-8 flex flex-col items-center select-none">
              <h2 className="font-bold text-2xl gold-foil-light-bg font-cinzel leading-none mb-1" style={{ fontFamily: 'var(--font-cinzel)' }}>
                U&ME
              </h2>
              <div className="w-[80px] h-[1px] bg-gradient-to-r from-transparent via-[#bf953f] to-transparent my-1.5"></div>
              <p className="text-[9px] text-[#222222] tracking-[0.2em] uppercase font-semibold font-sans">
                B2B WHOLESALE SYSTEM LOGIN
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleAccessCodeLogin} className="space-y-5">
              <div>
                <label 
                  htmlFor="modal-customer-name" 
                  className="block text-[10px] text-gray-500 uppercase tracking-widest font-medium mb-1.5"
                >
                  거래처명
                </label>
                <input
                  id="modal-customer-name"
                  type="text"
                  required
                  value={loginCustomerName}
                  onChange={(e) => setLoginCustomerName(e.target.value)}
                  placeholder="거래처명을 입력하세요 (예: 서울상사)"
                  disabled={loginLoading}
                  className="w-full px-4 py-3 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-[#bf953f] rounded-none transition-colors duration-200 placeholder:text-gray-300"
                />
              </div>

              <div>
                <label 
                  htmlFor="modal-password" 
                  className="block text-[10px] text-gray-550 uppercase tracking-widest font-medium mb-1.5"
                >
                  비밀번호 (접속코드)
                </label>
                <input
                  id="modal-password"
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  disabled={loginLoading}
                  className="w-full px-4 py-3 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-[#bf953f] rounded-none transition-colors duration-200 placeholder:text-gray-300"
                />
              </div>

              {loginError && (
                <p className="text-xs text-red-500 font-light tracking-wide text-center">
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-[#bf953f] text-black hover:bg-[#c5a85c] transition-colors duration-200 py-3 text-xs tracking-widest uppercase font-semibold rounded-none disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
              >
                {loginLoading ? '인증 중...' : 'Enter System'}
              </button>
            </form>

            {/* Info Footer */}
            <div className="mt-8 text-center text-[10px] text-gray-400 font-light tracking-wider leading-relaxed">
              본 플랫폼은 사전 승인된 B2B 파트너 전용 도매 사이트입니다.
              <br />
              처음이시거나 계정이 없으신 경우 하단의 가입 문의처로 연락 바랍니다.
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal 
        isOpen={isChangePasswordOpen} 
        onClose={() => setIsChangePasswordOpen(false)} 
      />

    </div>
  );
}
