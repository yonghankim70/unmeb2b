'use client';

import React, { useState, useEffect } from 'react';
import { Settings, RotateCcw, RefreshCw, Calculator, HelpCircle, DollarSign, Percent, ArrowRight, Download } from 'lucide-react';

interface CalculatorSettings {
  exchange: number;
  logistics: number;
  margin: number;
  sRatio: number;
  aRatio: number;
  bRatio: number;
  cRatio: number;
  wRatio: number;
}

const DEFAULT_SETTINGS: CalculatorSettings = {
  exchange: 230,
  logistics: 1200,
  margin: 1.30,
  sRatio: 0.85,
  aRatio: 0.89,
  bRatio: 0.93,
  cRatio: 0.97,
  wRatio: 0.89
};

export default function MobileCalculatorPage() {
  const [unitPrice, setUnitPrice] = useState<string>('30');
  const [settings, setSettings] = useState<CalculatorSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle');

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('b2b_calc_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setSettings(prev => ({
            exchange: parsed.exchange ?? prev.exchange,
            logistics: parsed.logistics ?? prev.logistics,
            margin: parsed.margin ?? prev.margin,
            sRatio: parsed.sRatio ?? prev.sRatio,
            aRatio: parsed.aRatio ?? prev.aRatio,
            bRatio: parsed.bRatio ?? prev.bRatio,
            cRatio: parsed.cRatio ?? prev.cRatio,
            wRatio: parsed.wRatio ?? prev.wRatio
          }));
        }
      } catch (err) {
        console.error('Failed to load calc settings:', err);
      }
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings: CalculatorSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('b2b_calc_settings', JSON.stringify(newSettings));
    } catch (err) {
      console.error('Failed to save calc settings:', err);
    }
  };

  const handleReset = () => {
    if (confirm('설정 조건들을 초기화하시겠습니까?')) {
      saveSettings(DEFAULT_SETTINGS);
    }
  };

  // Sync settings with server admin globalSettings
  const handleSyncSettings = async () => {
    setSyncStatus('loading');
    try {
      const res = await fetch('/api/admin/products');
      if (!res.ok) throw new Error('Unauthorized or API Error');
      const data = await res.json();
      if (data.success && data.globalSettings) {
        const gs = data.globalSettings;
        const newSettings: CalculatorSettings = {
          exchange: gs.exchange ?? DEFAULT_SETTINGS.exchange,
          logistics: gs.logistics ?? DEFAULT_SETTINGS.logistics,
          margin: gs.margin ?? DEFAULT_SETTINGS.margin,
          sRatio: gs.sRatio ?? DEFAULT_SETTINGS.sRatio,
          aRatio: gs.aRatio ?? DEFAULT_SETTINGS.aRatio,
          bRatio: gs.bRatio ?? DEFAULT_SETTINGS.bRatio,
          cRatio: gs.cRatio ?? DEFAULT_SETTINGS.cRatio,
          wRatio: gs.wRatio ?? DEFAULT_SETTINGS.wRatio
        };
        saveSettings(newSettings);
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 2000);
      } else {
        throw new Error('No global settings found');
      }
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncStatus('failed');
      alert('서버 설정을 불러오지 못했습니다. 로그인 세션을 확인하시거나 수동으로 입력해 주세요.');
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  // Calculations
  const cnPrice = parseFloat(unitPrice) || 0;
  const cost = Math.round(cnPrice * settings.exchange + settings.logistics);
  const wholesale = Math.round((cost * settings.margin) / 1000) * 1000;

  const calculateGradePrice = (ratio: number) => {
    return Math.round((wholesale * ratio) / 100) * 100;
  };

  const sPrice = calculateGradePrice(settings.sRatio);
  const aPrice = calculateGradePrice(settings.aRatio);
  const bPrice = calculateGradePrice(settings.bRatio);
  const cPrice = calculateGradePrice(settings.cRatio);
  const wPrice = calculateGradePrice(settings.wRatio);

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-100 flex flex-col justify-between font-sans selection:bg-indigo-500 selection:text-white pb-6 relative overflow-hidden">
      {/* Background Decorative Blur Gradients */}
      <div className="absolute top-[-20%] left-[-30%] w-[80%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-20%] w-[70%] h-[50%] rounded-full bg-purple-500/10 blur-[100px] pointer-events-none" />

      {/* Styled JSX (Global / Embedded CSS for complete control of the UI) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        
        body {
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: #09090b;
        }

        /* Glassmorphism card utility */
        .glass-card {
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        /* Neon focus borders */
        .input-glow:focus {
          border-color: rgba(99, 102, 241, 0.6);
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.25);
          outline: none;
        }

        /* Smooth slide toggle settings */
        .settings-container {
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Range slider styling */
        input[type=range] {
          -webkit-appearance: none;
          width: 100%;
          background: transparent;
        }
        input[type=range]:focus {
          outline: none;
        }
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        input[type=range]::-webkit-slider-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #6366f1;
          cursor: pointer;
          -webkit-appearance: none;
          margin-top: -6px;
          box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
          transition: transform 0.1s;
        }
        input[type=range]::-webkit-slider-thumb:active {
          transform: scale(1.25);
          background: #a855f7;
        }
      ` }} />

      {/* Header */}
      <header className="px-5 pt-6 pb-2 flex justify-between items-center z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Calculator className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent">
              B2B 도매가 계산기
            </h1>
            <p className="text-[10px] text-neutral-500 font-medium tracking-wide">MOBILE WEB APP</p>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Sync config from server */}
          <button
            onClick={handleSyncSettings}
            disabled={syncStatus === 'loading'}
            className="p-2 glass-card rounded-xl hover:bg-neutral-800/50 text-neutral-400 hover:text-white transition-all active:scale-95 disabled:opacity-50"
            title="서버 글로벌 설정 동기화"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${syncStatus === 'loading' ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
          
          {/* Reset settings to default */}
          <button
            onClick={handleReset}
            className="p-2 glass-card rounded-xl hover:bg-neutral-800/50 text-neutral-400 hover:text-rose-400 transition-all active:scale-95"
            title="설정 초기화"
          >
            <RotateCcw className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-5 flex flex-col gap-5 justify-start z-10 max-w-md mx-auto w-full">
        {/* Offline Download Banner */}
        <section className="glass-card rounded-2xl p-4 flex justify-between items-center border border-indigo-500/30 bg-gradient-to-r from-indigo-950/20 to-purple-950/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 border border-indigo-500/30 animate-pulse">
              <Download className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-neutral-100">오프라인 계산기 파일 받기</h3>
              <p className="text-[10px] text-neutral-400 mt-0.5">인터넷 연결이 없어도 언제든 사용 가능</p>
            </div>
          </div>
          <a
            href="/calculator.html"
            download="UandME_B2B_Calculator.html"
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl transition-all font-semibold tracking-wider shadow-lg shadow-indigo-600/30"
          >
            다운로드
          </a>
        </section>

        {/* INPUT: 위안화 단가 입력 */}
        <section className="glass-card rounded-2xl p-4.5 flex flex-col gap-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-neutral-400 font-bold tracking-wider uppercase">중국 원가 입력 (위안화)</span>
            <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-bold bg-indigo-500/10 px-2.5 py-0.5 rounded-full">
              <DollarSign className="w-3.5 h-3.5" />
              <span>CNY</span>
            </div>
          </div>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-2xl font-semibold text-neutral-400">¥</span>
            <input
              type="number"
              pattern="[0-9]*"
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full bg-neutral-900/60 border border-neutral-800 pl-10 pr-4 py-4 rounded-xl text-3xl font-bold font-mono tracking-tight text-white input-glow"
              placeholder="0"
            />
          </div>
        </section>

        {/* OUTPUT CARD: 계산된 단가 표시 */}
        <section className="glass-card rounded-3xl p-5 flex flex-col gap-4 relative overflow-hidden bg-gradient-to-b from-neutral-900/30 to-neutral-950/30">
          {/* Top Info (Wholesale Price) */}
          <div className="flex justify-between items-end border-b border-neutral-800/80 pb-4">
            <div>
              <p className="text-[10px] text-neutral-400 font-bold tracking-wider uppercase mb-1">최종 산출 도매가</p>
              <h2 className="text-3xl font-extrabold text-white font-mono tracking-tight">
                ₩ {wholesale.toLocaleString('ko-KR')}
              </h2>
            </div>
            <div className="text-right text-xs">
              <p className="text-neutral-500 font-medium">원가 (¥➔₩)</p>
              <p className="text-neutral-300 font-semibold font-mono">₩ {cost.toLocaleString('ko-KR')}</p>
            </div>
          </div>

          {/* Grades Prices Table List */}
          <div className="space-y-2.5">
            <p className="text-[9px] text-neutral-500 font-bold tracking-wider uppercase mb-1">등급별 단가 현황</p>
            
            {/* Grade S */}
            <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/20 rounded-xl border border-neutral-900/50">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-400 text-[10px] font-bold flex items-center justify-center border border-amber-500/20">S</span>
                <span className="text-xs text-neutral-300 font-medium">S등급가</span>
                <span className="text-[9px] text-neutral-500 font-bold font-mono">({Math.round(settings.sRatio * 100)}%)</span>
              </div>
              <span className="text-sm font-bold text-white font-mono">₩ {sPrice.toLocaleString('ko-KR')}</span>
            </div>

            {/* Grade A */}
            <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/20 rounded-xl border border-neutral-900/50">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px] font-bold flex items-center justify-center border border-indigo-500/20">A</span>
                <span className="text-xs text-neutral-300 font-medium">A등급가</span>
                <span className="text-[9px] text-neutral-500 font-bold font-mono">({Math.round(settings.aRatio * 100)}%)</span>
              </div>
              <span className="text-sm font-bold text-white font-mono">₩ {aPrice.toLocaleString('ko-KR')}</span>
            </div>

            {/* Grade B */}
            <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/20 rounded-xl border border-neutral-900/50">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-purple-500/10 text-purple-400 text-[10px] font-bold flex items-center justify-center border border-purple-500/20">B</span>
                <span className="text-xs text-neutral-300 font-medium">B등급가</span>
                <span className="text-[9px] text-neutral-500 font-bold font-mono">({Math.round(settings.bRatio * 100)}%)</span>
              </div>
              <span className="text-sm font-bold text-white font-mono">₩ {bPrice.toLocaleString('ko-KR')}</span>
            </div>

            {/* Grade C */}
            <div className="flex justify-between items-center py-2 px-3 bg-neutral-900/20 rounded-xl border border-neutral-900/50">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-400 text-[10px] font-bold flex items-center justify-center border border-rose-500/20">C</span>
                <span className="text-xs text-neutral-300 font-medium">C등급가</span>
                <span className="text-[9px] text-neutral-500 font-bold font-mono">({Math.round(settings.cRatio * 100)}%)</span>
              </div>
              <span className="text-sm font-bold text-white font-mono">₩ {cPrice.toLocaleString('ko-KR')}</span>
            </div>

            {/* Grade W */}
            <div className="flex justify-between items-center py-2 px-3 bg-indigo-500/5 rounded-xl border border-indigo-500/20">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center justify-center border border-emerald-500/20">W</span>
                <span className="text-xs text-indigo-200 font-bold">W등급가</span>
                <span className="text-[9px] text-indigo-400 font-bold font-mono">({Math.round(settings.wRatio * 100)}%)</span>
              </div>
              <span className="text-sm font-bold text-indigo-300 font-mono">₩ {wPrice.toLocaleString('ko-KR')}</span>
            </div>
          </div>
        </section>

        {/* SETTINGS CARD: 계산 변수 제어 아코디언 */}
        <section className="glass-card rounded-2xl overflow-hidden settings-container">
          {/* Header click toggles accordion */}
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="w-full flex justify-between items-center p-4 hover:bg-neutral-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings className={`w-4.5 h-4.5 text-indigo-400`} />
              <span className="text-xs font-semibold text-neutral-200">계산 설정 조건 변경</span>
            </div>
            <span className="text-neutral-500 text-[10px] font-bold font-mono">
              {isSettingsOpen ? 'CLOSE ▲' : 'OPEN ▼'}
            </span>
          </button>

          {/* Accordion Content */}
          {isSettingsOpen && (
            <div className="border-t border-neutral-900 px-4.5 py-4 space-y-4 bg-neutral-950/20">
              {/* 환율 & 물류비 & 마진율 */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-neutral-400 font-bold uppercase">적용 환율 (₩/¥)</label>
                  <input
                    type="number"
                    value={settings.exchange}
                    onChange={(e) => saveSettings({ ...settings, exchange: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-neutral-900 border border-neutral-850 px-3 py-2 rounded-lg text-sm font-bold font-mono text-white input-glow"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-neutral-400 font-bold uppercase">적용 물류비 (₩)</label>
                  <input
                    type="number"
                    value={settings.logistics}
                    onChange={(e) => saveSettings({ ...settings, logistics: parseInt(e.target.value) || 0 })}
                    className="w-full bg-neutral-900 border border-neutral-850 px-3 py-2 rounded-lg text-sm font-bold font-mono text-white input-glow"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] text-neutral-400 font-bold uppercase">적용 마진율 (배수)</label>
                  <span className="text-xs font-bold text-indigo-400 font-mono">{settings.margin.toFixed(2)}배</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1.0"
                    max="2.0"
                    step="0.01"
                    value={settings.margin}
                    onChange={(e) => saveSettings({ ...settings, margin: parseFloat(e.target.value) || 1 })}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={settings.margin}
                    onChange={(e) => saveSettings({ ...settings, margin: parseFloat(e.target.value) || 1 })}
                    className="w-16 bg-neutral-900 border border-neutral-850 px-2 py-1 rounded text-center text-xs font-bold font-mono text-white input-glow"
                  />
                </div>
              </div>

              {/* Ratios Sliders */}
              <div className="border-t border-neutral-900 pt-3.5 space-y-3">
                <p className="text-[9px] text-neutral-500 font-bold tracking-wider uppercase">회원 등급별 할인 비율</p>

                {/* S Ratio */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-neutral-400 font-medium">S등급 비율</span>
                    <span className="font-bold text-amber-400 font-mono">{(settings.sRatio * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.01"
                      value={settings.sRatio}
                      onChange={(e) => saveSettings({ ...settings, sRatio: parseFloat(e.target.value) || 0.85 })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={settings.sRatio}
                      onChange={(e) => saveSettings({ ...settings, sRatio: parseFloat(e.target.value) || 0.85 })}
                      className="w-14 bg-neutral-900 border border-neutral-850 px-1.5 py-0.5 rounded text-center text-[10px] font-bold font-mono text-white input-glow"
                    />
                  </div>
                </div>

                {/* A Ratio */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-neutral-400 font-medium">A등급 비율</span>
                    <span className="font-bold text-indigo-400 font-mono">{(settings.aRatio * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.01"
                      value={settings.aRatio}
                      onChange={(e) => saveSettings({ ...settings, aRatio: parseFloat(e.target.value) || 0.89 })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={settings.aRatio}
                      onChange={(e) => saveSettings({ ...settings, aRatio: parseFloat(e.target.value) || 0.89 })}
                      className="w-14 bg-neutral-900 border border-neutral-850 px-1.5 py-0.5 rounded text-center text-[10px] font-bold font-mono text-white input-glow"
                    />
                  </div>
                </div>

                {/* B Ratio */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-neutral-400 font-medium">B등급 비율</span>
                    <span className="font-bold text-purple-400 font-mono">{(settings.bRatio * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.01"
                      value={settings.bRatio}
                      onChange={(e) => saveSettings({ ...settings, bRatio: parseFloat(e.target.value) || 0.93 })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={settings.bRatio}
                      onChange={(e) => saveSettings({ ...settings, bRatio: parseFloat(e.target.value) || 0.93 })}
                      className="w-14 bg-neutral-900 border border-neutral-850 px-1.5 py-0.5 rounded text-center text-[10px] font-bold font-mono text-white input-glow"
                    />
                  </div>
                </div>

                {/* C Ratio */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-neutral-450 font-medium">C등급 비율</span>
                    <span className="font-bold text-rose-400 font-mono">{(settings.cRatio * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.01"
                      value={settings.cRatio}
                      onChange={(e) => saveSettings({ ...settings, cRatio: parseFloat(e.target.value) || 0.97 })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={settings.cRatio}
                      onChange={(e) => saveSettings({ ...settings, cRatio: parseFloat(e.target.value) || 0.97 })}
                      className="w-14 bg-neutral-900 border border-neutral-850 px-1.5 py-0.5 rounded text-center text-[10px] font-bold font-mono text-white input-glow"
                    />
                  </div>
                </div>

                {/* W Ratio */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-indigo-200 font-bold">W등급 비율</span>
                    <span className="font-bold text-emerald-400 font-mono">{(settings.wRatio * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.01"
                      value={settings.wRatio}
                      onChange={(e) => saveSettings({ ...settings, wRatio: parseFloat(e.target.value) || 0.89 })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={settings.wRatio}
                      onChange={(e) => saveSettings({ ...settings, wRatio: parseFloat(e.target.value) || 0.89 })}
                      className="w-14 bg-neutral-900 border border-neutral-850 px-1.5 py-0.5 rounded text-center text-[10px] font-bold font-mono text-white input-glow"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer Info / Tutorial */}
      <footer className="px-5 mt-4 text-center z-10 max-w-md mx-auto w-full">
        <p className="text-[10px] text-neutral-600 font-medium">
          도매가 = (원가 * 마진율)에서 1,000원 단위 반올림 적용.
        </p>
        <p className="text-[10px] text-neutral-600 mt-0.5 font-medium">
          각 등급가 = 도매가 * 할인율에서 100원 단위 반올림 적용.
        </p>
        <div className="mt-4 flex justify-center items-center gap-1.5 text-neutral-500 hover:text-neutral-400 transition-colors">
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold">스마트폰 홈 화면에 바로가기를 추가해 앱처럼 사용하세요.</span>
        </div>
      </footer>
    </div>
  );
}
