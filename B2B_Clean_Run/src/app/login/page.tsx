'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [customerName, setCustomerName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerName, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Redirect to main shop dashboard
        router.push('/');
        router.refresh();
      } else {
        setError(data.message || '인증에 실패했습니다. 입력 정보를 확인하세요.');
      }
    } catch (err) {
      console.error(err);
      setError('서버와의 통신 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fafafa] flex flex-col justify-center items-center px-4 select-none">
      <div className="w-full max-w-[400px] bg-white border border-gray-100 p-10 shadow-sm rounded-none">
        
        {/* Brand Header */}
        <div className="text-center mb-12 flex flex-col items-center select-none">
          <h1 
            className="tracking-[0.1em] text-[44px] font-bold uppercase leading-none gold-foil-light-bg font-cinzel pl-[0.1em]" 
            style={{ fontFamily: 'var(--font-cinzel)' }}
          >
            U&ME
          </h1>
          <div className="w-[140px] h-[1px] bg-gradient-to-r from-transparent via-[#bf953f] to-transparent my-3.5 mx-auto"></div>
          <p className="text-[10px] text-[#222222] tracking-[0.3em] uppercase font-semibold pl-[0.3em] font-sans">
            B2B CURATION SYSTEM
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label 
              htmlFor="customer-name" 
              className="block text-[11px] text-gray-500 uppercase tracking-widest font-medium mb-2"
            >
              거래처명
            </label>
            <input
              id="customer-name"
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="거래처명을 입력하세요 (예: 서울상사)"
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-[#bf953f] rounded-none transition-colors duration-200 placeholder:text-gray-300"
            />
          </div>

          <div>
            <label 
              htmlFor="password" 
              className="block text-[11px] text-gray-500 uppercase tracking-widest font-medium mb-2"
            >
              비밀번호 (접속코드)
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-[#bf953f] rounded-none transition-colors duration-200 placeholder:text-gray-300"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 font-light tracking-wide text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#bf953f] text-black hover:bg-[#c5a85c] transition-colors duration-200 py-3 text-xs tracking-widest uppercase font-semibold rounded-none disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
          >
            {loading ? '인증 중...' : 'Enter System'}
          </button>
        </form>

        {/* Footer / Description */}
        <div className="mt-12 text-center text-[10px] text-gray-400 font-light tracking-wider leading-relaxed">
          본 플랫폼은 사전 승인된 B2B 파트너 전용 도매 주문 전용 사이트입니다.
          <br />
          거래처명 및 접속코드가 분실된 경우 본사 담당자에게 문의해 주십시오.
        </div>
        
      </div>
    </main>
  );
}
