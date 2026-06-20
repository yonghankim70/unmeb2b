'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  productCode: string;
  color: string;
  size?: string;
  quantity: number;
  category?: string;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (productCode: string, color: string, size?: string) => void;
  updateQuantity: (productCode: string, color: string, size: string | undefined, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  copyCartToClipboard: (customerName: string) => boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function normalizeOption(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeCartItems(items: CartItem[]): CartItem[] {
  return items.map((item) => ({
    ...item,
    color: String(item.color || '').trim(),
    size: String(item.size || '').trim(),
    quantity: Number(item.quantity || 0),
  })).filter((item) => item.productCode && item.quantity > 0);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState(0);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('b2b_cart');
    if (savedCart) {
      try {
        setCartItems(normalizeCartItems(JSON.parse(savedCart)));
      } catch (e) {
        console.error('Failed to parse saved cart', e);
      }
    }
  }, []);

  // Sync cart with localStorage and update total count
  useEffect(() => {
    localStorage.setItem('b2b_cart', JSON.stringify(cartItems));
    const total = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    setCartCount(total);
  }, [cartItems]);

  const addToCart = (newItem: CartItem) => {
    const normalizedNewItem: CartItem = {
      ...newItem,
      color: String(newItem.color || '').trim(),
      size: String(newItem.size || '').trim(),
      quantity: Math.max(1, Number(newItem.quantity || 1)),
    };

    setCartItems((prevItems) => {
      const existingIndex = prevItems.findIndex(
        (item) =>
          item.productCode === normalizedNewItem.productCode &&
          normalizeOption(item.color) === normalizeOption(normalizedNewItem.color) &&
          normalizeOption(item.size) === normalizeOption(normalizedNewItem.size)
      );

      if (existingIndex > -1) {
        const updated = [...prevItems];
        updated[existingIndex].quantity += normalizedNewItem.quantity;
        return updated;
      }

      return [...prevItems, normalizedNewItem];
    });
  };

  const removeFromCart = (productCode: string, color: string, size = '') => {
    setCartItems((prevItems) =>
      prevItems.filter(
        (item) => !(
          item.productCode === productCode &&
          normalizeOption(item.color) === normalizeOption(color) &&
          normalizeOption(item.size) === normalizeOption(size)
        )
      )
    );
  };

  const updateQuantity = (productCode: string, color: string, size: string | undefined, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productCode, color, size);
      return;
    }
    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.productCode === productCode &&
        normalizeOption(item.color) === normalizeOption(color) &&
        normalizeOption(item.size) === normalizeOption(size)
          ? { ...item, quantity }
          : item
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const copyCartToClipboard = (customerName: string): boolean => {
    if (cartItems.length === 0) return false;

    // Build KakaoTalk-friendly clean text template
    let text = `[B2B 주문/샘플 신청]\n`;
    text += `신청처: ${customerName}\n`;
    text += `신청일: ${new Date().toLocaleDateString('ko-KR')}\n`;
    text += `-------------------------\n`;

    cartItems.forEach((item, index) => {
      const sizeText = item.size ? ` / 사이즈: ${item.size}` : '';
      text += `${index + 1}. 품번: ${item.productCode} / 컬러: ${item.color}${sizeText} / 수량: ${item.quantity}개\n`;
    });
    
    text += `-------------------------\n`;
    text += `* 복사된 주문 내역입니다. 본사 카카오톡 채널이나 담당자에게 전송해 주세요.`;

    try {
      // Safe fallback copy mechanism if navigator.clipboard is unavailable
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed'; // Avoid scrolling to bottom
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (err) {
      console.error('Failed to copy text: ', err);
      return false;
    }
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        copyCartToClipboard,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
