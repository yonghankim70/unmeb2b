import React, { useState, useEffect } from 'react';
import { Product } from '@/lib/db';
import { resolveProductPrice } from './DashboardClient';
import {
  getApiImageUrl,
  getCachedDetailImageUrl,
  getEncodedOptimizedDetailImageUrl,
  getLegacyDetailImageUrl,
  getOptimizedDetailImageSrcSet,
  useImageFallbacks as applyImageFallbacks
} from '@/lib/imageUrls';
import { X, Check, Plus, Loader2 } from 'lucide-react';

const PRODUCT_DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;
const INSTANT_MAIN_IMAGE = 'folder.jpg';
const DETAIL_PRELOAD_COUNT = 8;
const OPTIMIZED_DETAIL_IMAGE_COUNT = 12;

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  session?: {
    customerName: string;
    discountGrade: string;
  } | null;
  onAddToCart: (product: Product, selectedColor: string, selectedSize: string, quantity: number) => void;
}

interface VideoPlayerProps {
  src: string;
}

interface CachedProductDetails {
  images: string[];
  expiresAt: number;
  promise?: Promise<string[]>;
}

const productDetailsCache = new Map<string, CachedProductDetails>();

function getFolderName(product: Product): string {
  return product.임시코드 || product.상품명;
}

function getDetailCacheKey(product: Product): string {
  return `${product.주차}|${getFolderName(product)}|${product.이미지버전 || ''}`;
}

function getProductDetailsUrl(product: Product): string {
  const folderName = getFolderName(product);
  const base = `/api/product-details?week=${encodeURIComponent(product.주차)}&code=${encodeURIComponent(folderName)}`;
  return product.이미지버전 ? `${base}&v=${encodeURIComponent(product.이미지버전)}` : base;
}

function getImageUrl(product: Product, imageName: string): string {
  return getApiImageUrl(product, imageName);
}

function normalizeImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((imageName) => String(imageName || '').trim())
    .filter(Boolean);
}

function getProductImageList(product: Product): string[] {
  return normalizeImages((product as Product & { 상세이미지목록?: unknown }).상세이미지목록);
}

function getCachedImages(product: Product): string[] | null {
  const cached = productDetailsCache.get(getDetailCacheKey(product));
  if (!cached || cached.expiresAt <= Date.now() || cached.images.length === 0) {
    return null;
  }

  return cached.images;
}

function preloadDetailImages(product: Product, images: string[]): void {
  if (typeof window === 'undefined') return;

  images.slice(0, DETAIL_PRELOAD_COUNT).forEach((imageName, index) => {
    if (imageName.toLowerCase().endsWith('.mp4') || imageName.toLowerCase().endsWith('.webm')) return;

    const image = new Image();
    image.decoding = 'async';
    image.sizes = '(max-width: 768px) 100vw, 65vw';
    image.srcset = getOptimizedDetailImageSrcSet(product, imageName);
    (image as HTMLImageElement & { fetchPriority?: string }).fetchPriority = index < 3 ? 'high' : 'low';
    image.onerror = () => {
      image.src = getImageUrl(product, imageName);
    };
    image.src = getCachedDetailImageUrl(product, imageName);
  });
}

export function prefetchProductDetails(product: Product): Promise<string[]> {
  const embeddedImages = getProductImageList(product);
  if (embeddedImages.length > 0) {
    preloadDetailImages(product, embeddedImages);
  }

  const key = getDetailCacheKey(product);
  const cached = productDetailsCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    if (cached.images.length > 0) {
      preloadDetailImages(product, cached.images);
      return Promise.resolve(cached.images);
    }
    if (cached.promise) {
      return cached.promise;
    }
  }

  const promise = fetch(getProductDetailsUrl(product), { cache: 'no-store' })
    .then((res) => res.json())
    .then((data) => {
      const images = data?.success ? normalizeImages(data.images) : [];
      productDetailsCache.set(key, {
        images,
        expiresAt: Date.now() + PRODUCT_DETAILS_CACHE_TTL_MS,
      });
      preloadDetailImages(product, images.length > 0 ? images : [INSTANT_MAIN_IMAGE]);
      return images;
    })
    .catch((error) => {
      console.error('Failed to prefetch product details:', error);
      productDetailsCache.delete(key);
      return [];
    });

  productDetailsCache.set(key, {
    images: cached?.images || [],
    expiresAt: now + PRODUCT_DETAILS_CACHE_TTL_MS,
    promise,
  });

  return promise;
}

function VideoPlayer({ src }: VideoPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<string | null>(null);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Video play error:', err);
      });
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const durSec = videoRef.current.duration;
    if (durSec && !isNaN(durSec)) {
      const minutes = Math.floor(durSec / 60);
      const seconds = Math.floor(durSec % 60);
      const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      setDuration(formatted);
    }
  };

  return (
    <div className="relative w-full aspect-[4/3] sm:aspect-[3/4] bg-neutral-950 rounded-md shadow-sm overflow-hidden flex items-center justify-center border border-neutral-100/50 group/video">
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full h-full object-contain cursor-pointer"
        onClick={handlePlayPause}
      />
      
      {/* Video Marker Badge */}
      <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 backdrop-blur-sm pointer-events-none select-none z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
        <span>VIDEO</span>
      </div>

      {/* Play Button Overlay (Center) */}
      {!isPlaying && (
        <div 
          onClick={handlePlayPause}
          className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/30 transition-all duration-300 z-10"
        >
          <div className="w-14 h-14 rounded-full border border-white bg-white/10 flex items-center justify-center text-white backdrop-blur-xs scale-100 group-hover/video:scale-105 transition-transform duration-300 shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-0.5 text-white">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}

      {/* Duration Badge (Bottom-Right) */}
      {duration && !isPlaying && (
        <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md backdrop-blur-sm pointer-events-none select-none z-10">
          {duration}
        </div>
      )}
    </div>
  );
}

function parseColors(colorStr: string): string[] {
  if (!colorStr) return [];
  const parsed = colorStr.split(/[,/]/).map(c => {
    const trimmed = c.trim();
    const match = trimmed.match(/^[A-Za-z0-9#-]+\(([^)]+)\)$/);
    if (match) return match[1].trim();
    const innerMatch = trimmed.match(/\(([^)]+)\)/);
    if (innerMatch) return innerMatch[1].trim();
    return trimmed;
  }).filter(Boolean);
  return parsed;
}

function parseSizes(sizeStr: string): string[] {
  if (!sizeStr) return [];
  const normalized = sizeStr.trim();
  if (!normalized || normalized.toLowerCase() === 'free') return [];
  return normalized
    .split(/[,/|·\s]+/)
    .map(size => size.trim())
    .filter(Boolean);
}

export default function ProductDetailModal({
  isOpen,
  onClose,
  product,
  session,
  onAddToCart
}: ProductDetailModalProps) {
  const modalRootRef = React.useRef<HTMLDivElement>(null);
  const contentScrollRef = React.useRef<HTMLDivElement>(null);
  const detailImagePaneRef = React.useRef<HTMLDivElement>(null);
  const pendingWheelDeltaRef = React.useRef(0);
  const wheelFrameRef = React.useRef<number | null>(null);
  const onCloseRef = React.useRef(onClose);
  const modalHistoryTokenRef = React.useRef<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [addingSuccess, setAddingSuccess] = useState(false);

  const getActiveDetailScrollElement = (): HTMLDivElement | null => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      return detailImagePaneRef.current;
    }

    return contentScrollRef.current || detailImagePaneRef.current;
  };

  const scrollDetailImages = (deltaY: number, immediate = false): boolean => {
    const scrollElement = getActiveDetailScrollElement();
    if (!scrollElement) return false;

    const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
    if (maxScrollTop <= 0) return false;

    const canScrollDown = deltaY > 0 && scrollElement.scrollTop < maxScrollTop - 1;
    const canScrollUp = deltaY < 0 && scrollElement.scrollTop > 1;
    if (!canScrollDown && !canScrollUp) return false;

    if (immediate) {
      const nextScrollTop = Math.max(0, Math.min(scrollElement.scrollTop + deltaY, maxScrollTop));
      scrollElement.scrollTop = nextScrollTop;
      return true;
    }

    pendingWheelDeltaRef.current += deltaY;
    if (wheelFrameRef.current !== null) return true;

    wheelFrameRef.current = window.requestAnimationFrame(() => {
      const scrollTarget = getActiveDetailScrollElement();
      const pendingDelta = pendingWheelDeltaRef.current;
      pendingWheelDeltaRef.current = 0;
      wheelFrameRef.current = null;

      if (!scrollTarget || pendingDelta === 0) return;
      scrollTarget.scrollBy({ top: pendingDelta, left: 0, behavior: 'auto' });
    });

    return true;
  };

  const handleWheelCapture = (event: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

    const target = event.target instanceof Node ? event.target : null;
    const nativeScrollElement = getActiveDetailScrollElement();
    if (target && nativeScrollElement?.contains(target)) {
      return;
    }

    const handled = scrollDetailImages(event.deltaY);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keyScrollMap: Record<string, number> = {
      ArrowDown: 90,
      ArrowUp: -90,
      PageDown: 520,
      PageUp: -520,
      ' ': 520,
    };
    const deltaY = keyScrollMap[event.key];
    if (!deltaY) return;

    const handled = scrollDetailImages(deltaY, true);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

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
      <span className={`inline-block text-[9px] font-semibold tracking-wider px-2 py-0.5 uppercase ${bgClass}`}>
        {trimmed}
      </span>
    );
  };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const token = `unme-product-detail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    modalHistoryTokenRef.current = token;

    const currentState = window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};
    window.history.pushState(
      {
        ...currentState,
        __unmeProductDetailModal: token,
      },
      '',
      window.location.href,
    );

    const handlePopState = () => {
      if (modalHistoryTokenRef.current !== token) return;
      modalHistoryTokenRef.current = null;
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (modalHistoryTokenRef.current === token) {
        modalHistoryTokenRef.current = null;
      }
    };
  }, [isOpen]);

  const closeModal = () => {
    if (typeof window !== 'undefined' && modalHistoryTokenRef.current) {
      const token = modalHistoryTokenRef.current;
      window.history.back();

      window.setTimeout(() => {
        if (modalHistoryTokenRef.current !== token) return;
        modalHistoryTokenRef.current = null;
        onCloseRef.current();
      }, 150);
      return;
    }

    onCloseRef.current();
  };

  useEffect(() => {
    if (!isOpen || !product) return;

    let cancelled = false;
    const embeddedImages = getProductImageList(product);
    const cachedImages = getCachedImages(product);
    const hasImmediateDetailImages = Boolean(cachedImages && cachedImages.length > 0) || embeddedImages.length > 0;
    const instantImages = cachedImages || (embeddedImages.length > 0 ? embeddedImages : []);

    const initializeFrame = window.requestAnimationFrame(() => {
      if (cancelled) return;

      setLoading(!hasImmediateDetailImages);
      setImages(instantImages);
      setQuantity(1);
      setAddingSuccess(false);
      setSelectedColor(parseColors(product.컬러)[0] || '');
      setSelectedSize(parseSizes(product.사이즈)[0] || '');
    });

    prefetchProductDetails(product)
      .then((loadedImages) => {
        if (cancelled) return;
        if (loadedImages.length > 0) {
          setImages(loadedImages);
          return;
        }

        setImages([INSTANT_MAIN_IMAGE]);
      })
      .catch(err => console.error('Failed to load product details:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(initializeFrame);
    };
  }, [isOpen, product]);

  useEffect(() => {
    return () => {
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current);
        wheelFrameRef.current = null;
      }
      pendingWheelDeltaRef.current = 0;
    };
  }, [isOpen, product]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const focusTimer = window.setTimeout(() => {
      detailImagePaneRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const resolvedPrice = session ? resolveProductPrice(product, session.discountGrade) : 0;
  const colors = parseColors(product.컬러);
  const sizes = parseSizes(product.사이즈);

  const handleAdd = () => {
    const finalQty = quantity <= 0 ? 1 : quantity;
    onAddToCart(product, selectedColor, selectedSize, finalQty);
    setAddingSuccess(true);
    setTimeout(() => {
      setAddingSuccess(false);
    }, 1500);
  };

  const showSize = sizes.length > 0;
  const displayImages = images.length > 0 ? images : [INSTANT_MAIN_IMAGE];

  return (
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center select-none overscroll-none"
      onWheelCapture={handleWheelCapture}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        onClick={closeModal}
      />

      {/* Modal Container */}
      <div className="bg-white w-full max-w-4xl h-[90vh] md:h-[80vh] flex relative z-10 shadow-2xl overflow-hidden rounded-2xl border border-neutral-100 mx-4 overscroll-contain">
        
        {/* Close Button */}
        <button 
          onClick={closeModal}
          className="absolute top-4 right-4 z-30 text-neutral-400 hover:text-black transition-colors bg-white/80 p-1.5 rounded-full shadow-sm"
        >
          <X className="w-5 h-5 stroke-[1.5]" />
        </button>

        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-[#fafafa]">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
              <span className="text-xs text-neutral-400 font-light tracking-widest uppercase">Loading lookbook...</span>
            </div>
          </div>
        ) : (
          /* Content Scroll Wrapper for Mobile */
          <div
            ref={contentScrollRef}
            className="w-full h-full flex flex-col md:flex-row overflow-y-auto md:overflow-hidden overscroll-contain"
          >
            {/* Left Side: Scrollable lookbook column of images (Queries using product.임시코드) */}
            <div
              ref={detailImagePaneRef}
              tabIndex={-1}
              className="w-full md:flex-1 h-auto md:h-full overflow-y-visible md:overflow-y-auto bg-[#fafafa] p-4 md:p-6 space-y-4 md:space-y-6 scrollbar-none md:border-r border-neutral-100 overscroll-contain outline-none"
            >
              {displayImages.length === 0 ? (
                <div className="aspect-[3/4] w-full bg-neutral-100 rounded-md flex items-center justify-center text-neutral-400 text-xs font-light tracking-widest">
                  NO IMAGES AVAILABLE
                </div>
              ) : (
                displayImages.map((imgName, index) => {
                  const shouldUseResponsiveSrcSet = index < OPTIMIZED_DETAIL_IMAGE_COUNT;
                  const cachedFileUrl = getCachedDetailImageUrl(product, imgName);
                  const apiFileUrl = getImageUrl(product, imgName);
                  const ext = imgName.toLowerCase();
                  const isVideo = ext.endsWith('.mp4') || ext.endsWith('.webm');
                  const shouldPrioritizeImage = index < 3;

                  if (isVideo) {
                    return (
                      <VideoPlayer key={imgName} src={apiFileUrl} />
                    );
                  }

                  return (
                    <img
                      key={imgName}
                      src={cachedFileUrl}
                      srcSet={shouldUseResponsiveSrcSet ? getOptimizedDetailImageSrcSet(product, imgName) : undefined}
                      sizes="(max-width: 768px) 100vw, 65vw"
                      alt=""
                      className="w-full h-auto object-contain rounded-md shadow-sm select-none"
                      loading={index < DETAIL_PRELOAD_COUNT ? 'eager' : 'lazy'}
                      fetchPriority={shouldPrioritizeImage ? 'high' : 'auto'}
                      decoding="async"
                      draggable={false}
                      onError={(event) => applyImageFallbacks(event, [
                        getEncodedOptimizedDetailImageUrl(product, imgName),
                        getLegacyDetailImageUrl(product, imgName),
                        apiFileUrl,
                      ])}
                    />
                  );
                })
              )}
            </div>

            {/* Right Side: Sticky selection panel */}
            <div className="w-full md:w-[360px] flex flex-col p-4 md:p-6 justify-between h-auto md:h-full bg-white shrink-0">
              <div className="space-y-4 md:space-y-6">
                
                {/* Product Meta, Name & Price Block */}
                <div className="border-b border-neutral-200/60 pb-3 md:pb-5 space-y-1 md:space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {product.포인트 && renderPointBadge(product.포인트)}
                    <span className="text-[12px] text-[#8e8d89] tracking-widest font-normal">
                      {(() => {
                        const categoryText = product.카테고리
                          ? product.카테고리.split(',').map(s => {
                              const trimmed = s.trim();
                              return trimmed === '신상' ? 'This Week' : trimmed;
                            }).join(', ')
                          : '미분류';
                        const itemText = product.아이템 || '';
                        return itemText ? `${categoryText} / ${itemText}` : categoryText;
                      })()}
                    </span>
                  </div>
                  <h2 className="text-[18px] md:text-[21px] font-bold text-neutral-900 tracking-wide font-sans leading-snug">
                    {product.상품명}
                  </h2>
                  <div className="pt-0.5">
                    {(!product.단가 || product.단가 === 0) ? (
                      <span className="text-sm font-medium text-neutral-500">가격 문의</span>
                    ) : resolvedPrice > 0 ? (
                      <span className="text-[16px] md:text-[17px] font-semibold text-neutral-900 font-sans">
                        {resolvedPrice.toLocaleString('ko-KR')}원
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-neutral-500">가격 문의</span>
                    )}
                  </div>
                </div>

                {/* Options Panel */}
                <div className="space-y-4">
                  {/* Colors */}
                  <div>
                    <span className="block text-[10px] md:text-[10.5px] uppercase tracking-widest text-neutral-400 font-medium mb-1.5 md:mb-2.5">
                      COLOR
                    </span>
                    <div className="flex flex-wrap gap-1.5 md:gap-2">
                      {colors.map((c) => (
                        <button
                          key={c}
                          onClick={() => setSelectedColor(c)}
                          className={`text-[11px] md:text-[12px] tracking-wider px-3.5 py-2 md:px-4.5 md:py-2.5 border transition-all duration-200 rounded-[5px] min-w-[65px] md:min-w-[76px] text-center ${
                            selectedColor === c
                              ? 'bg-[#615b51] text-white border-transparent font-semibold shadow-sm'
                              : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size (Shown only if not 'free' or empty) */}
                  {showSize && (
                    <div>
                      <span className="block text-[10px] md:text-[10.5px] uppercase tracking-widest text-neutral-400 font-medium mb-1.5 md:mb-2.5">
                        사이즈
                      </span>
                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        {sizes.map((size) => (
                          <button
                            key={size}
                            onClick={() => setSelectedSize(size)}
                            className={`text-[11px] md:text-[12px] tracking-wider px-3.5 py-2 md:px-4.5 md:py-2.5 border transition-all duration-200 rounded-[5px] min-w-[58px] md:min-w-[68px] text-center ${
                              selectedSize === size
                                ? 'bg-[#615b51] text-white border-transparent font-semibold shadow-sm'
                                : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quantity */}
                  <div>
                    <span className="block text-[10px] md:text-[10.5px] uppercase tracking-widest text-neutral-400 font-medium mb-1.5 md:mb-2.5">
                      QUANTITY
                    </span>
                    <div className="flex items-center border border-neutral-200 rounded-[5px] bg-[#fdfdfc] w-[120px] md:w-[140px] h-9 md:h-11 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        className="flex-1 h-full flex items-center justify-center hover:bg-neutral-100 text-neutral-500 text-sm md:text-base transition-colors"
                      >
                        -
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={quantity === 0 ? '' : quantity}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '') {
                            setQuantity(0);
                            return;
                          }
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed)) {
                            setQuantity(parsed);
                          }
                        }}
                        onBlur={() => {
                          if (quantity <= 0) {
                            setQuantity(1);
                          }
                        }}
                        className="w-10 md:w-12 text-center text-xs md:text-sm font-semibold font-mono text-neutral-900 bg-transparent border-none focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity(q => (q === 0 ? 1 : q + 1))}
                        className="flex-1 h-full flex items-center justify-center hover:bg-neutral-100 text-neutral-500 text-sm md:text-base transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-neutral-100 mt-4 md:pt-6 md:mt-6">
                <button
                  onClick={handleAdd}
                  disabled={addingSuccess}
                  className={`w-full text-[11px] md:text-[12px] tracking-widest uppercase transition-all duration-300 rounded-full flex items-center justify-center gap-1.5 h-11 md:h-13 shadow-sm ${
                    addingSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#615b51] text-white hover:bg-[#524d44] active:scale-[0.98]'
                  }`}
                  style={{
                    fontFamily: 'var(--font-outfit), var(--font-noto), sans-serif',
                    fontWeight: 650
                  }}
                >
                  {addingSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 md:w-4 md:h-4 stroke-[2.5]" />
                      <span>장바구니에 담겼습니다</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 stroke-[2.5]" />
                      <span>장바구니 담기</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
