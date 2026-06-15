'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, AlertCircle, ShoppingBag, FolderKanban, LogOut, Calculator } from 'lucide-react';

export default function AdminPortalPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = sessionStorage.getItem('admin_authenticated');
      if (auth === 'true') {
        setIsAuthenticated(true);
      }
      setLoadingAuth(false);
    }
  }, []);

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '1234') {
      sessionStorage.setItem('admin_authenticated', 'true');
      setIsAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('비밀번호가 올바르지 않습니다.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_authenticated');
    setIsAuthenticated(false);
    setPasswordInput('');
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-xs text-neutral-400 font-mono tracking-widest uppercase">
          Verifying credentials...
        </div>
      </div>
    );
  }

  // Password Shield gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f9f7] text-[#1a1c1b] antialiased">
        <div className="bg-white border border-neutral-200/80 p-8 max-w-sm w-full shadow-xl text-center space-y-6 rounded-[2px]">
          <div className="inline-flex p-3.5 bg-[#f4f4f2] rounded-full border border-neutral-100 mb-2">
            <Lock className="w-5 h-5 text-[#615b51]" />
          </div>
          <div className="space-y-1">
            <h1 className="text-[13px] font-semibold tracking-[0.2em] uppercase text-neutral-900" style={{ fontFamily: 'var(--font-outfit)' }}>
              U&ME B2B ADMIN
            </h1>
            <p className="text-[11px] text-neutral-400 font-light">데이터 수정을 위해 보안 비밀번호를 기입해 주세요.</p>
          </div>
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <input 
              type="password" 
              placeholder="••••"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full text-center tracking-[0.2em] font-mono text-sm py-2.5 border border-neutral-200 focus:outline-none focus:border-neutral-950 bg-white rounded-none"
              autoFocus
            />
            {authError && (
              <p className="text-[10px] text-rose-600 font-semibold tracking-wide flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{authError}</span>
              </p>
            )}
            <button 
              type="submit"
              className="w-full bg-[#111] text-white text-xs tracking-widest font-semibold py-3.5 transition-colors hover:bg-neutral-800 uppercase"
            >
              Enter Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9f7] text-[#1a1c1b] antialiased font-sans select-none">
      {/* Top Header */}
      <header className="border-b border-[#cdc5bb]/60 bg-[#f4f4f2] py-4.5 px-6 md:px-12 flex justify-between items-center text-xs tracking-wider font-light text-neutral-500">
        <div className="flex items-center space-x-2 cursor-pointer hover:text-black transition-colors" onClick={() => router.push('/stitch-demo')}>
          <span className="font-semibold text-neutral-800 tracking-[0.15em] text-[10.5px]">U&ME SHOP</span>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center space-x-1.5 hover:text-rose-600 transition-colors text-[10.5px] font-mono font-medium uppercase"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout Portal</span>
        </button>
      </header>

      {/* Main portal grid selection */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-20 flex flex-col justify-center w-full space-y-12">
        <div className="text-center space-y-3">
          <h1 className="text-[28px] font-medium tracking-[0.3em] uppercase leading-none text-neutral-950" style={{ fontFamily: 'var(--font-outfit)' }}>
            U&ME
          </h1>
          <p className="text-xs text-neutral-400 tracking-[0.2em] uppercase font-light">
            B2B CURATION MANAGEMENT PORTAL
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
          
          {/* Card 1: Product Master */}
          <div 
            onClick={() => router.push('/admin/products')}
            className="group bg-white border border-[#cdc5bb]/50 p-8 flex flex-col justify-between hover:shadow-2xl hover:border-[#615b51]/60 transition-all duration-500 cursor-pointer rounded-[4px]"
          >
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] flex items-center justify-center text-[#615b51] group-hover:bg-[#615b51] group-hover:text-white transition-colors duration-500">
                <FolderKanban className="w-5 h-5 stroke-[1.8]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-[17px] font-bold text-neutral-900 tracking-wide">상품관리 마스터</h2>
                <p className="text-[11.5px] text-neutral-400 font-light leading-relaxed">
                  상품 정보(JSON), 수량 동기화, 환율/물류비/마진율에 따른 등급가 자동 계산 및 AI 속성 추출 등을 통제합니다.
                </p>
              </div>
            </div>
            <div className="pt-8 text-neutral-800 text-[11px] font-semibold tracking-widest uppercase flex items-center gap-1 group-hover:text-[#615b51] transition-colors">
              <span>Go to Products Master →</span>
            </div>
          </div>

          {/* Card 2: Order Management Master */}
          <div 
            onClick={() => router.push('/admin/orders')}
            className="group bg-white border border-[#cdc5bb]/50 p-8 flex flex-col justify-between hover:shadow-2xl hover:border-[#615b51]/60 transition-all duration-500 cursor-pointer rounded-[4px]"
          >
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] flex items-center justify-center text-[#615b51] group-hover:bg-[#615b51] group-hover:text-white transition-colors duration-500">
                <ShoppingBag className="w-5 h-5 stroke-[1.8]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-[17px] font-bold text-neutral-900 tracking-wide">주문관리 마스터</h2>
                <p className="text-[11.5px] text-neutral-400 font-light leading-relaxed">
                  고객사 신규 주문 오더 현황판을 조회하고, 통장 거래내역 엑셀 대조를 통한 자동 입금확인 및 발송처리를 진행합니다.
                </p>
              </div>
            </div>
            <div className="pt-8 text-neutral-800 text-[11px] font-semibold tracking-widest uppercase flex items-center gap-1 group-hover:text-[#615b51] transition-colors">
              <span>Go to Orders console →</span>
            </div>
          </div>

          {/* Card 3: Wholesale Price Calculator */}
          <div 
            onClick={() => router.push('/calculator')}
            className="group bg-white border border-[#cdc5bb]/50 p-8 flex flex-col justify-between hover:shadow-2xl hover:border-[#615b51]/60 transition-all duration-500 cursor-pointer rounded-[4px]"
          >
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-full bg-[#f4f4f2] flex items-center justify-center text-[#615b51] group-hover:bg-[#615b51] group-hover:text-white transition-colors duration-500">
                <Calculator className="w-5 h-5 stroke-[1.8]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-[17px] font-bold text-neutral-900 tracking-wide">도매가 계산기</h2>
                <p className="text-[11.5px] text-neutral-400 font-light leading-relaxed">
                  위안화(CNY) 단가를 기준으로 설정된 환율, 물류비, 마진율을 적용한 최종 도매가 및 회원 등급별 단가를 실시간으로 산출하고 오프라인 파일을 다운로드합니다.
                </p>
              </div>
            </div>
            <div className="pt-8 text-neutral-800 text-[11px] font-semibold tracking-widest uppercase flex items-center gap-1 group-hover:text-[#615b51] transition-colors">
              <span>Open Calculator →</span>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-[10px] text-neutral-400 tracking-widest uppercase select-none">
        © 2026 U&ME B2B CURATION PORTAL. ALL RIGHTS RESERVED.
      </footer>
    </div>
  );
}
