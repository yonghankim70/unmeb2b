'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Product, GlobalSettings } from '@/lib/db';
import { useCart } from '@/context/CartContext';
import CartSidebar from './CartSidebar';
import ProductDetailModal from './ProductDetailModal';
import ChangePasswordModal from './ChangePasswordModal';
import { getGradeLabel, resolveProductPrice, resolveColorHex, shouldShowProduct } from './DashboardClient';
import { ShoppingBag, RefreshCw, LogOut, Crown, Search, Check, ShoppingCart, Send, Phone, MessageSquare, X } from 'lucide-react';

interface StitchDashboardClientProps {
  products: Product[];
  session?: {
    customerName: string;
    discountGrade: string;
  } | null;
  globalSettings?: GlobalSettings;
}

export default function StitchDashboardClient({ products, session, globalSettings }: StitchDashboardClientProps) {
  const router = useRouter();
  const { addToCart, cartCount } = useCart();
  
  // State
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number; products: string[] } | null>(null);
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  
  // Local state for product item configurations (selected colors & quantities)
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addingSuccess, setAddingSuccess] = useState<Record<string, boolean>>({});
  
  // Local search query for demo search simulation
  const [searchQuery, setSearchQuery] = useState('');

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

  // 2. Data Filtering & Ordering
  // - Show only if customer has permission based on 노출여부
  const filteredProducts = products.filter(p => shouldShowProduct(p, session));

  // - Sort by: Recommended Rank (ascending) -> Normal (newest first)
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const aRank = typeof a.추천 === 'number' ? a.추천 : (a.추천 ? 1 : 0);
    const bRank = typeof b.추천 === 'number' ? b.추천 : (b.추천 ? 1 : 0);

    const aHasRank = aRank > 0;
    const bHasRank = bRank > 0;

    if (aHasRank && !bHasRank) return -1;
    if (!aHasRank && bHasRank) return 1;

    if (aHasRank && bHasRank) {
      // Both have recommendation rank: sort by rank ascending (1 is first)
      if (aRank !== bRank) return aRank - bRank;
      
      // If ranks are equal, fallback to default recommended sorting (Oldest first)
      const cmp = (a.주차 || '').localeCompare(b.주차 || '');
      if (cmp !== 0) return cmp;
      return (a.임시코드 || a.상품명 || '').localeCompare(a.임시코드 || a.상품명 || '');
    } else {
      // Normal: Newest first (descending order of week)
      const cmp = (b.주차 || '').localeCompare(a.주차 || '');
      if (cmp !== 0) return cmp;
      return (b.임시코드 || b.상품명 || '').localeCompare(a.임시코드 || a.상품명 || '');
    }
  });

  // Apply Category & Search selection
  const displayedProducts = sortedProducts.filter(p => {
    // Category check
    const matchesCategory = selectedCategory === 'ALL' || getProductMainCategories(p).includes(selectedCategory);
    // Search check
    const matchesSearch = !searchQuery || 
      (p.상품명 || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (p.임시코드 || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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
        setTimeout(() => setSyncResult(null), 4000);
        router.refresh(); 
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

  const handleAddToCartFromModal = (product: Product, color: string, qty: number) => {
    addToCart({
      productCode: product.상품명, 
      color,
      quantity: qty,
      category: product.카테고리,
    });
  };

  const renderProductCard = (product: Product) => {
    const code = product.임시코드 || product.상품명;
    const resolvedPrice = session ? resolveProductPrice(product, session.discountGrade) : 0;
    const colors = parseColors(product.컬러);

    return (
      <div key={code} className="flex flex-col group relative">
        {/* Thumbnail Image Wrapper */}
        <div 
          className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-[#eeeeec] mb-3 select-none cursor-pointer"
          onClick={() => {
            if (!session) {
              setIsLoginModalOpen(true);
            } else {
              setSelectedDetailProduct(product);
              setIsDetailOpen(true);
            }
          }}
        >
          {/* Gold crown icon for recommended products - STITCH PREVIEW 13번 디자인 그대로 */}
          {Number(product.추천) > 0 && (
            <div className="absolute top-3 right-3 z-10 bg-[#fbf9f3] text-amber-600 rounded-full p-1.5 shadow-sm flex items-center justify-center border border-amber-200/80">
              <Crown className="w-3.5 h-3.5 fill-amber-200/30 stroke-[1.8]" />
            </div>
          )}

          <img
            src={`/api/image?week=${encodeURIComponent(product.주차)}&code=${encodeURIComponent(code)}`}
            alt={product.상품명}
            className="h-full w-full object-cover object-center rounded-md group-hover:scale-[1.03] transition-transform duration-700 ease-out"
            loading="lazy"
          />

          {/* Quick View Add Hover Overlay (implicit action from Stitch design) */}
          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (!session) {
                  setIsLoginModalOpen(true);
                } else {
                  setSelectedDetailProduct(product);
                  setIsDetailOpen(true);
                }
              }}
              className="w-full bg-white/90 backdrop-blur-sm py-2.5 text-[10px] tracking-widest font-semibold text-stitch-on-background uppercase hover:bg-stitch-primary hover:text-white transition-colors duration-200 rounded-[2px]"
            >
              QUICK VIEW
            </button>
          </div>
        </div>

        {/* Information Details (Exactly 4 Items: Name, Color, Price, Point) - 기존 13번 명칭대로 복구 */}
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

          {/* 3. Color Names */}
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

  return (
    <div className="min-h-screen flex flex-col bg-stitch-background text-stitch-on-background antialiased font-sans">
      
      {/* Top Banner */}
      <div className="w-full bg-[#111111] text-[#e0e0e0] text-[10px] tracking-[0.2em] font-light text-center py-2 uppercase select-none">
        B2B Wholesale Partner System | STITCH 2.0 DESIGN PREVIEW
      </div>

      {/* Top Navigation Bar (Stitch 2.0 Layout) */}
      <nav className="w-full border-b border-stitch-outline-variant bg-stitch-background sticky top-0 z-50 select-none">
        <div className="flex justify-between items-center px-[40px] pt-[31px] pb-[29px] w-full max-w-[1400px] mx-auto">
          {/* Logo & Subtitle Combo */}
          <div 
            className="flex flex-col cursor-pointer" 
            onClick={() => {
              setSelectedCategory('ALL');
              setSearchQuery('');
              router.push('/stitch-demo');
            }}
          >
            <span className="font-semibold text-[32px] tracking-[0.2em] leading-none text-stitch-on-background pl-[0.2em]" style={{ fontFamily: 'var(--font-outfit)' }}>U&ME</span>
            <span className="text-[10px] text-stitch-secondary tracking-[0.22em] mt-1.5 font-light uppercase">B2B CURATION</span>
          </div>
          
          {/* Interactive Utilities (서치 바 왼쪽에 New Arrival / Order Status 밀착 배치) */}
          <div className="flex items-center gap-4">
            {/* New Arrival & Order Status Links */}
            <div className="hidden md:flex items-center gap-2 select-none">
              <button 
                onClick={handleSync}
                disabled={syncing}
                className={`text-[12.5px] font-semibold tracking-widest text-stitch-secondary px-4.5 py-2 rounded-full border border-transparent cursor-pointer transition-all duration-300 flex items-center gap-1.5 hover:bg-stitch-primary hover:text-white hover:shadow-sm active:scale-95 ${syncing ? 'opacity-50' : ''}`}
              >
                New Arrival
                {syncing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              </button>
              <button 
                onClick={() => router.push('/stitch-demo/orders')}
                className="text-[12.5px] font-semibold tracking-widest text-stitch-secondary px-4.5 py-2 rounded-full border border-transparent cursor-pointer transition-all duration-300 hover:bg-stitch-primary hover:text-white hover:shadow-sm active:scale-95"
              >
                Order Status
              </button>
              <button 
                onClick={() => setIsChangePasswordOpen(true)}
                className="text-[12.5px] font-semibold tracking-widest text-stitch-secondary px-4.5 py-2 rounded-full border border-transparent cursor-pointer transition-all duration-300 hover:bg-stitch-primary hover:text-white hover:shadow-sm active:scale-95"
              >
                비밀번호 변경
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="relative flex items-center border-b border-stitch-outline py-1">
              <Search className="w-4 h-4 text-stitch-outline" />
              <input 
                className="bg-transparent border-none focus:ring-0 text-[13px] placeholder:text-stitch-outline-variant w-44 py-0 pl-2 focus:outline-none" 
                placeholder="Search Wholesale" 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* Icons Stack */}
            <div className="flex items-center gap-5 ml-4">
              {!session ? (
                <button 
                  onClick={() => setIsLoginModalOpen(true)}
                  className="text-[12.5px] font-semibold tracking-widest text-white bg-stitch-primary px-5 py-2.5 rounded-full border border-transparent cursor-pointer transition-all duration-300 hover:bg-neutral-800 hover:shadow-sm active:scale-95"
                >
                  로그인
                </button>
              ) : (
                <>
                  {/* Customer Name & Cart Icon Stack - 서울상사 / 장바구니 그대로 유지 */}
                  <div className="flex flex-col items-center justify-end">
                    <span className="text-[9.5px] text-stitch-secondary tracking-wider font-semibold leading-none mb-1">
                      {session.customerName}
                    </span>
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

                  {/* Log out profile icon */}
                  <button 
                    onClick={handleLogout}
                    title="로그아웃"
                    className="text-stitch-on-background hover:text-stitch-primary transition-colors p-1 flex items-center justify-center"
                  >
                    <LogOut className="w-[22px] h-[22px] stroke-[1.5]" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Category Filter Pills (Stitch 2.0 pills styling) */}
      {(globalSettings?.showCategoriesOnMain !== false) && (
        <section className="w-full max-w-[1400px] mx-auto px-[40px] pt-[52px] select-none">
          <div className="flex items-center gap-3.5 overflow-x-auto no-scrollbar py-2 justify-center">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-8 py-2.5 rounded-full font-semibold text-[10.5px] tracking-widest uppercase transition-all duration-300 min-w-[125px] text-center flex items-center justify-center ${
                    isSelected
                      ? 'bg-stitch-primary text-white border border-transparent shadow-sm'
                      : 'bg-white text-stitch-secondary border border-stitch-outline-variant/50 hover:bg-stitch-surface-container-low'
                  }`}
                  style={{
                    fontFamily: 'var(--font-outfit), var(--font-noto), sans-serif',
                    fontWeight: 650
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Gallery Grid (Stitch 2.0 content layout with DB products) */}
      <main className="w-full max-w-[1400px] mx-auto px-[40px] pt-[76px] pb-[32px] flex-1">
        {displayedProducts.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center space-y-3 text-neutral-400 select-none">
            <span className="text-[14px] text-stitch-secondary tracking-wide font-medium">새로운 상품이 곧 업데이트됩니다.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-[24px] gap-y-[48px]">
            {displayedProducts.map((product) => renderProductCard(product))}
          </div>
        )}
      </main>

      {/* Sync Status Toast */}
      {syncResult && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-[#111] text-white px-6 py-4 shadow-xl border border-neutral-800 max-w-md w-full">
          <p className="text-xs font-semibold tracking-wider flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>데이터 동기화 완료!</span>
          </p>
          <p className="text-[10px] text-gray-400 mt-1 font-light leading-relaxed">
            스캔을 진행하여 총 {syncResult.count}개의 새로운 상품 폴더를 추가했습니다.
          </p>
        </div>
      )}

      {/* Footer (Stitch 2.0 layout) */}
      <footer className="bg-stitch-surface-container-low w-full mt-[48px] border-t border-stitch-outline-variant select-none">
        <div className="flex flex-col md:flex-row justify-between items-center px-[40px] py-[40px] w-full max-w-[1400px] mx-auto">
          <div className="flex flex-col mb-8 md:mb-0">
            <span className="font-semibold text-[20px] text-stitch-on-background mb-2" style={{ fontFamily: 'var(--font-outfit)' }}>U&ME</span>
            <p className="text-[10.5px] tracking-widest text-stitch-secondary">© 2026 U&ME B2B CURATION. All rights reserved.</p>
            <p className="text-[12px] text-neutral-600 font-medium bg-neutral-100 px-3 py-1.5 rounded mt-2.5 inline-block w-fit">
              📢 가입문의는 우측 텔레그램이나 전화 문의
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <a className="text-[10.5px] tracking-widest text-stitch-secondary hover:text-stitch-primary transition-all duration-300 cursor-pointer">Terms of Service</a>
            <a className="text-[10.5px] tracking-widest text-stitch-secondary hover:text-stitch-primary transition-all duration-300 cursor-pointer">Privacy Policy</a>
            <a className="text-[10.5px] tracking-widest text-stitch-secondary hover:text-stitch-primary transition-all duration-300 cursor-pointer">Wholesale Inquiry</a>
            <a className="text-[10.5px] tracking-widest text-stitch-secondary hover:text-stitch-primary transition-all duration-300 cursor-pointer">Contact Support</a>
          </div>
        </div>
      </footer>

      {/* Cart Sidebar Panel */}
      {session && (
        <CartSidebar 
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          customerName={session.customerName}
          products={products}
          discountGrade={session.discountGrade}
        />
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        product={selectedDetailProduct}
        session={session}
        onAddToCart={handleAddToCartFromModal}
      />

      {/* Floating Sticky Actions (3번째 이미지 룩앤필 적용 - 스크롤 따라다님) */}
      <div className="fixed bottom-8 right-8 z-40 flex flex-col gap-3.5 items-center select-none">
        
        {/* Cart Floating Button */}
        <button
          onClick={() => {
            if (!session) {
              setIsLoginModalOpen(true);
            } else {
              setIsCartOpen(true);
            }
          }}
          className="w-[54px] h-[54px] rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border border-neutral-200/40 bg-white relative"
        >
          <img 
            src="/cart.png" 
            alt="Cart" 
            className="w-full h-full rounded-full object-cover" 
          />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#ba1a1a] text-white text-[10px] font-mono font-bold w-[22px] h-[22px] rounded-full flex items-center justify-center border-2 border-white">
              {cartCount}
            </span>
          )}
        </button>

        {/* Telegram Q/A Floating Button */}
        <a
          href={process.env.NEXT_PUBLIC_TELEGRAM_URL || 'https://t.me/unme802'} 
          target="_blank"
          rel="noopener noreferrer"
          title="텔레그램 Q/A"
          className="w-[54px] h-[54px] rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border border-neutral-200/40 bg-white"
        >
          <img 
            src="/telegram.png" 
            alt="Q/A" 
            className="w-full h-full rounded-full object-cover" 
          />
        </a>

        {/* SMS Message Floating Button */}
        <a
          href={`sms:${process.env.NEXT_PUBLIC_COMPANY_PHONE || '010-4481-7802'}`}
          title="문자 문의"
          className="w-[54px] h-[54px] rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border border-neutral-200/40 bg-white"
        >
          <div className="w-[38px] h-[38px] bg-blue-500 rounded-full flex items-center justify-center text-white shadow-inner">
            <MessageSquare className="w-[18px] h-[18px] stroke-[2.5]" />
          </div>
        </a>

        {/* Phone Call Floating Button */}
        <a
          href={`tel:${process.env.NEXT_PUBLIC_COMPANY_PHONE || '010-4481-7802'}`}
          title="전화 문의"
          className="w-[54px] h-[54px] rounded-full shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 border border-neutral-200/40 bg-white"
        >
          <div className="w-[38px] h-[38px] bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-inner">
            <Phone className="w-[18px] h-[18px] stroke-[2.5]" />
          </div>
        </a>
      </div>

      {/* Login Popup Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center select-none">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 transition-opacity duration-300 animate-fadeIn"
            onClick={() => setIsLoginModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="bg-white w-full max-w-md p-8 relative z-10 shadow-2xl overflow-hidden rounded-none border border-neutral-100 mx-4 animate-scaleUp">
            {/* Close Button */}
            <button 
              onClick={() => setIsLoginModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-black transition-colors"
            >
              <X className="w-5 h-5 stroke-[1.5]" />
            </button>

            {/* Brand Header */}
            <div className="text-center mb-8">
              <h2 className="font-serif tracking-[0.3em] text-2xl font-light text-black mb-2" style={{ fontFamily: 'var(--font-outfit)' }}>
                U&ME
              </h2>
              <p className="text-[9px] text-gray-400 tracking-[0.15em] uppercase font-light">
                B2B CURATION SYSTEM LOGIN
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
                  className="w-full px-4 py-3 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-black rounded-none transition-colors duration-200 placeholder:text-gray-300"
                />
              </div>

              <div>
                <label 
                  htmlFor="modal-password" 
                  className="block text-[10px] text-gray-500 uppercase tracking-widest font-medium mb-1.5"
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
                  className="w-full px-4 py-3 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-black rounded-none transition-colors duration-200 placeholder:text-gray-300"
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
                className="w-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 py-3 text-xs tracking-widest uppercase font-semibold rounded-none disabled:bg-neutral-300 disabled:cursor-not-allowed"
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
