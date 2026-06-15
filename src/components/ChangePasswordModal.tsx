import React, { useState } from 'react';
import { X, Lock, Check, Loader2 } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError('모든 필드를 입력해 주세요.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (newPassword.trim().length < 2) {
      setError('새 비밀번호는 최소 2글자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/client/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          onClose();
          setSuccess(false);
        }, 1500);
      } else {
        setError(data.message || '비밀번호 변경에 실패했습니다.');
      }
    } catch (err) {
      console.error(err);
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center select-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 transition-opacity duration-300 animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="bg-white w-full max-w-md p-8 relative z-10 shadow-2xl overflow-hidden rounded-none border border-neutral-100 mx-4 animate-scaleUp">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-black transition-colors"
        >
          <X className="w-5 h-5 stroke-[1.5]" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-neutral-600" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 tracking-wide">
            비밀번호 변경
          </h2>
          <p className="text-xs text-neutral-450 mt-1 font-light">
            보안을 위해 비밀번호(접속코드)를 정기적으로 변경해 주세요.
          </p>
        </div>

        {success ? (
          <div className="py-6 flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-neutral-900">비밀번호가 성공적으로 변경되었습니다.</p>
            <p className="text-xs text-neutral-400 font-light">잠시 후 창이 닫힙니다.</p>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label 
                htmlFor="current-password" 
                className="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1.5"
              >
                현재 비밀번호 (접속코드)
              </label>
              <input
                id="current-password"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호를 입력하세요"
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-black rounded-none transition-colors duration-200 placeholder:text-gray-300"
              />
            </div>

            <div>
              <label 
                htmlFor="new-password" 
                className="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1.5"
              >
                새 비밀번호 (접속코드)
              </label>
              <input
                id="new-password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="새 비밀번호를 입력하세요"
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-black rounded-none transition-colors duration-200 placeholder:text-gray-300"
              />
            </div>

            <div>
              <label 
                htmlFor="confirm-password" 
                className="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1.5"
              >
                새 비밀번호 확인
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="새 비밀번호를 다시 입력하세요"
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-200 text-sm tracking-wider font-light text-black bg-white focus:outline-none focus:border-black rounded-none transition-colors duration-200 placeholder:text-gray-300"
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
              className="w-full bg-[#7a7369] text-white hover:bg-neutral-800 transition-colors duration-200 py-3 text-xs tracking-widest uppercase font-semibold rounded-none flex items-center justify-center gap-1.5 disabled:bg-neutral-300 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>변경 중...</span>
                </>
              ) : (
                <span>비밀번호 변경하기</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
