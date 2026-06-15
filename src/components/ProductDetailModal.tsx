import React, { useState, useEffect } from 'react';
import { Product } from '@/lib/db';
import { resolveProductPrice } from './DashboardClient';
import { X, Check, Plus, Loader2 } from 'lucide-react';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  session?: {
    customerName: string;
    discountGrade: string;
  } | null;
  onAddToCart: (product: Product, selectedColor: string, quantity: number) => void;
}

interface VideoPlayerProps {
  src: string;
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

export default function ProductDetailModal({
  isOpen,
  onClose,
  product,
  session,
  onAddToCart
}: ProductDetailModalProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [addingSuccess, setAddingSuccess] = useState(false);

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
    if (!isOpen || !product) return;

    setLoading(true);
    setImages([]);
    setQuantity(1);
    setAddingSuccess(false);

    // Parse default color
    const colors = parseColors(product.컬러);
    setSelectedColor(colors[0] || '');

    const folderName = product.임시코드 || product.상품명;

    // Fetch all image files inside folder (Uses folderName fallback)
    fetch(`/api/product-details?week=${encodeURIComponent(product.주차)}&code=${encodeURIComponent(folderName)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setImages(data.images);
        }
      })
      .catch(err => console.error('Failed to load product details:', err))
      .finally(() => setLoading(false));
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const resolvedPrice = session ? resolveProductPrice(product, session.discountGrade) : 0;
  const colors = parseColors(product.컬러);

  const handleAdd = () => {
    const finalQty = quantity <= 0 ? 1 : quantity;
    onAddToCart(product, selectedColor, finalQty);
    setAddingSuccess(true);
    setTimeout(() => {
      setAddingSuccess(false);
    }, 1500);
  };

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

  // Format size display
  const showSize = product.사이즈 && product.사이즈.trim().toLowerCase() !== 'free';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center select-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="bg-white w-full max-w-4xl h-[90vh] md:h-[80vh] flex relative z-10 shadow-2xl overflow-hidden rounded-none border border-neutral-100 mx-4">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
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
          <div className="w-full h-full flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
            {/* Left Side: Scrollable lookbook column of images (Queries using product.임시코드) */}
            <div className="w-full md:flex-1 h-auto md:h-full overflow-y-visible md:overflow-y-auto bg-[#fafafa] p-4 md:p-6 space-y-4 md:space-y-6 scrollbar-none md:border-r border-neutral-100">
              {images.length === 0 ? (
                <div className="aspect-[3/4] w-full bg-neutral-100 rounded-md flex items-center justify-center text-neutral-400 text-xs font-light tracking-widest">
                  NO IMAGES AVAILABLE
                </div>
              ) : (
                images.map((imgName) => {
                  const folderName = product.임시코드 || product.상품명;
                  const fileUrl = `/api/image?week=${encodeURIComponent(product.주차)}&code=${encodeURIComponent(folderName)}&file=${encodeURIComponent(imgName)}`;
                  const ext = imgName.toLowerCase();
                  const isVideo = ext.endsWith('.mp4') || ext.endsWith('.webm');

                  if (isVideo) {
                    return (
                      <VideoPlayer key={imgName} src={fileUrl} />
                    );
                  }

                  return (
                    <img
                      key={imgName}
                      src={fileUrl}
                      alt={imgName}
                      className="w-full h-auto object-contain rounded-md shadow-sm"
                      loading="lazy"
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
                              ? 'bg-stitch-primary text-white border-transparent font-semibold shadow-sm'
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
                      <span className="block text-[9.5px] md:text-[10px] uppercase tracking-widest text-neutral-400 font-medium mb-1 md:mb-1.5">
                        사이즈
                      </span>
                      <p className="text-xs text-neutral-800 font-mono">
                        {product.사이즈}
                      </p>
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
                      : 'bg-stitch-primary text-white hover:bg-[#524d44] active:scale-[0.98]'
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
