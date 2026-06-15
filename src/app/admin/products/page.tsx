'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product, ItemMaster, ColorMaster, CategoryMaster, Customer } from '@/lib/db';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Lock, Save, RefreshCw, Trash2, Search, Plus, 
  ArrowLeft, ArrowUpDown, ChevronDown, Check, AlertCircle, HelpCircle, Calculator, FileUp, FileDown,
  Sparkles, Settings
} from 'lucide-react';

export function getCategoryFromItem(itemName: string): string {
  if (!itemName) return '';
  const name = itemName.trim().toLowerCase();
  
  // TOP
  if (name.includes('니트') || name.includes('kt')) return '니트';
  if (name.includes('블라우스') || name.includes('bl')) return '블라우스';
  if (name.includes('셔츠') || name.includes('남방') || name.includes('sh')) return '셔츠/남방';
  if (name.includes('베스트') || name.includes('vt') || name.includes('조끼')) return '베스트';
  if (name.includes('티셔츠') || name.includes('ts') || name.includes('티')) return '티셔츠';
  if (name.includes('나시') || name.includes('ns')) return '나시';
  
  // BOTTOM
  if (name.includes('데님') || name.includes('dn') || name.includes('청')) return '데님';
  if (name.includes('팬츠') || name.includes('pt') || name.includes('바지')) return '팬츠';
  if (name.includes('반바지') || name.includes('hp')) return '반바지';
  
  // OUTER
  if (name.includes('레자') || name.includes('가죽')) return '레자';
  if (name.includes('세트') || name.includes('st')) return '세트';
  if (name.includes('가디건') || name.includes('cd')) return '가디건';
  if (name.includes('점퍼') || name.includes('jp')) return '점퍼';
  if (name.includes('자켓') || name.includes('jk') || name.includes('코트') || name.includes('아우터')) return '자켓';
  
  // ONE-PIECE
  if (name.includes('원피스') || name.includes('op') || name.includes('드레스')) return '원피스';

  return '';
}

interface ColumnMeta {
  key: string;
  label: string;
  defaultWidth: number;
  isSticky: boolean;
  canHide: boolean;
}

const ALL_COLUMNS: ColumnMeta[] = [
  { key: '체크박스', label: '선택', defaultWidth: 40, isSticky: true, canHide: false },
  { key: '시즌', label: '시즌', defaultWidth: 70, isSticky: true, canHide: false },
  { key: '업로드일자', label: '노출날짜', defaultWidth: 100, isSticky: true, canHide: true },
  { key: '이미지', label: '대표 이미지', defaultWidth: 80, isSticky: true, canHide: true },
  { key: '주차', label: '주차', defaultWidth: 80, isSticky: true, canHide: true },
  { key: '임시코드', label: '임시코드', defaultWidth: 120, isSticky: true, canHide: true },
  { key: '상품명', label: '상품명', defaultWidth: 260, isSticky: true, canHide: true },
  { key: '카테고리', label: '카테고리', defaultWidth: 150, isSticky: false, canHide: true },
  { key: '아이템', label: '아이템', defaultWidth: 150, isSticky: false, canHide: true },
  { key: '컬러', label: '컬러', defaultWidth: 180, isSticky: false, canHide: true },
  { key: '사이즈', label: '사이즈', defaultWidth: 180, isSticky: false, canHide: true },
  { key: '노출여부', label: '노출여부', defaultWidth: 200, isSticky: false, canHide: true },
  { key: '노출제외', label: '노출제외', defaultWidth: 200, isSticky: false, canHide: true },
  { key: '등급할인제외', label: '등급할인 제외', defaultWidth: 160, isSticky: false, canHide: true },
  { key: '포인트', label: '포인트', defaultWidth: 120, isSticky: false, canHide: true },
  { key: '추천', label: '추천', defaultWidth: 60, isSticky: false, canHide: true },
  { key: '단가', label: '단가 (¥)', defaultWidth: 110, isSticky: false, canHide: true },
  { key: '환율', label: '환율', defaultWidth: 60, isSticky: false, canHide: true },
  { key: '물류비', label: '물류비 (₩)', defaultWidth: 140, isSticky: false, canHide: true },
  { key: '원가', label: '원가 (₩)', defaultWidth: 120, isSticky: false, canHide: true },
  { key: '도매가', label: '도매가 (₩)', defaultWidth: 140, isSticky: false, canHide: true },
  { key: 'S등급가', label: 'S등급가 (₩)', defaultWidth: 140, isSticky: false, canHide: true },
  { key: 'A등급', label: 'A등급 (₩)', defaultWidth: 140, isSticky: false, canHide: true },
  { key: 'B등급', label: 'B등급 (₩)', defaultWidth: 140, isSticky: false, canHide: true },
  { key: 'C등급', label: 'C등급 (₩)', defaultWidth: 140, isSticky: false, canHide: true },
  { key: 'W등급가', label: 'W등급가 (₩)', defaultWidth: 140, isSticky: false, canHide: true },
  { key: '사입처', label: '사입처', defaultWidth: 150, isSticky: false, canHide: true },
  { key: '중국코드', label: '중국코드', defaultWidth: 130, isSticky: false, canHide: true },
];

export default function AdminPage() {
  const router = useRouter();
  const pathname = usePathname();
  
  // Horizontal Scroll Sync Refs
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Sync scroll from top scrollbar to table container
  const handleTopScroll = () => {
    if (topScrollRef.current && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  // Sync scroll from table container to top scrollbar
  const handleTableScroll = () => {
    if (topScrollRef.current && tableContainerRef.current) {
      topScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  };
  
  // 보안 및 인증 관련 상태
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = sessionStorage.getItem('admin_authenticated');
      if (auth === 'true') {
        setIsAuthenticated(true);
      } else {
        router.push('/admin');
      }
      setLoadingAuth(false);
    }
  }, [router]);

  // 데이터 로드 상태 목록
  const [products, setProducts] = useState<Product[]>([]);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortField === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(key);
      setSortDirection('asc');
    }
  };

  const SORTABLE_COLUMNS = ['시즌', '업로드일자', '주차', '임시코드', '상품명', '카테고리', '아이템', '사입처', '중국코드'];

  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => ALL_COLUMNS.map(c => c.key));
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const [showColSelector, setShowColSelector] = useState(false);
  const colSelectorRef = useRef<HTMLDivElement>(null);

  const orderedColumns = useMemo(() => {
    return columnOrder
      .map(key => ALL_COLUMNS.find(c => c.key === key))
      .filter(Boolean) as ColumnMeta[];
  }, [columnOrder]);

  // 컬럼 너비 및 표시 상태 외부 클릭 감지
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colSelectorRef.current && !colSelectorRef.current.contains(e.target as Node)) {
        setShowColSelector(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStickyLeft = (colKey: string) => {
    let left = 0;
    for (const col of orderedColumns) {
      if (col.key === colKey) {
        return `${left}px`;
      }
      const isVisible = !hiddenColumns.includes(col.key);
      if (col.isSticky && isVisible) {
        left += columnWidths[col.key] || col.defaultWidth;
      }
    }
    return '0px';
  };

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = columnWidths[colKey] || ALL_COLUMNS.find(c => c.key === colKey)?.defaultWidth || 100;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.pageX - startX;
      const newWidth = Math.max(30, startWidth + deltaX);
      setColumnWidths(prev => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const totalTableWidth = ALL_COLUMNS.reduce((sum, col) => {
    if (hiddenColumns.includes(col.key)) return sum;
    return sum + (columnWidths[col.key] || col.defaultWidth);
  }, 0);

  const renderCellContent = (colKey: string, product: Product, globalIdx: number, relativeIdx: number) => {
    const pKey = product.임시코드 || product.상품명;
    const isChecked = selectedKeys.includes(pKey);
    const imgCode = product.임시코드 || product.상품명;
    const imageUrl = `/api/image?week=${encodeURIComponent(product.주차)}&code=${encodeURIComponent(imgCode)}${cacheBuster ? `&t=${cacheBuster}` : ''}`;

    switch (colKey) {
      case '체크박스':
        return (
          <input 
            type="checkbox"
            checked={isChecked}
            onChange={() => handleToggleSelect(pKey)}
            className="rounded-none border-neutral-300 focus:ring-0 text-black w-3.5 h-3.5 cursor-pointer mx-auto block"
          />
        );
      case '시즌':
        return (
          <input
            type="text"
            list="season-options"
            value={product.시즌 || ''}
            onChange={(e) => handleValueChange(globalIdx, '시즌', e.target.value)}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
            placeholder="시즌 입력/선택"
          />
        );
      case '업로드일자':
        return (
          <input
            type="text"
            value={product.업로드일자}
            placeholder="날짜 입력"
            onChange={(e) => handleValueChange(globalIdx, '업로드일자', e.target.value)}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
          />
        );
      case '이미지':
        return (
          <div className="flex flex-col items-center gap-1.5 py-1.5 mx-auto">
            <img 
              src={imageUrl} 
              alt="thumbnail"
              onClick={() => setEnlargedImage(imageUrl)}
              className="w-10 h-10 object-cover border border-neutral-200 cursor-zoom-in hover:brightness-95 transition-all"
              onError={(e) => {
                (e.target as HTMLImageElement).src = imageUrl + '&debug=false';
              }}
            />
            {uploadingState[`${product.주차}-${imgCode}`] ? (
              <span className="text-[8px] text-neutral-450 scale-90">업로드 중...</span>
            ) : (
              <label className="text-[9px] bg-neutral-100 hover:bg-neutral-200 text-neutral-600 px-1 py-0.5 rounded cursor-pointer border border-neutral-200 select-none block text-center scale-90">
                업로드
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImageUpload(product.주차, imgCode, file);
                    }
                  }}
                />
              </label>
            )}
          </div>
        );
      case '주차':
        return (
          <span className="text-neutral-450 select-none font-medium block text-center">{product.주차}</span>
        );
      case '임시코드':
        return (
          <span className="text-neutral-455 select-none font-bold block text-center">{product.임시코드}</span>
        );
      case '상품명':
        return (
          <input
            type="text"
            value={product.상품명}
            onChange={(e) => handleValueChange(globalIdx, '상품명', e.target.value)}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none font-semibold text-black"
          />
        );
      case '카테고리':
        return (
          <CategorySelectorInput
            value={product.카테고리}
            categories={categories}
            onChange={(newVal) => {
              handleValueChange(globalIdx, '카테고리', newVal);
              const matchedCat = categories.find(c => c.카테고리 === newVal);
              if (matchedCat) {
                const updated = [...products];
                updated[globalIdx] = {
                  ...updated[globalIdx],
                  카테고리: newVal,
                  환율: matchedCat.환율 || 0,
                  물류비: matchedCat.물류비 || 0
                };
                setProducts(updated);
              }
            }}
          />
        );
      case '아이템':
        return (
          <ItemSelectorInput
            value={product.아이템}
            items={itemsList}
            onChange={(newVal) => handleValueChange(globalIdx, '아이템', newVal)}
          />
        );
      case '컬러':
        return (
          <ColorTagInput 
            colorsString={product.컬러}
            colorsList={colorsList}
            onChange={(newVal) => handleValueChange(globalIdx, '컬러', newVal)}
            onColorsListChange={setColorsList}
          />
        );
      case '사이즈':
        return (
          <SizeSelectorInput 
            sizeValue={product.사이즈}
            onChange={(newVal) => handleValueChange(globalIdx, '사이즈', newVal)}
          />
        );
      case '노출여부':
        return (
          <ExposureInput 
            exposure={product.노출여부}
            customers={customersList}
            onChange={(newVal) => handleValueChange(globalIdx, '노출여부', newVal)}
          />
        );
      case '노출제외':
        return (
          <ExcludeInput 
            exclude={product.노출제외 || ''}
            customers={customersList}
            onChange={(newVal) => handleValueChange(globalIdx, '노출제외', newVal)}
          />
        );
      case '등급할인제외':
        return (
          <GradeExcludeInput 
            value={product.등급할인제외 || ''}
            onChange={(newVal) => {
              const updated = [...products];
              const row = { ...updated[globalIdx], 등급할인제외: newVal };
              
              const catRow = categories.find(c => c.카테고리 === row.카테고리);
              const exchange = Number(row.환율) || (catRow ? catRow.환율 : globalSettings.exchange);
              const logistics = Number(row.물류비) || (catRow ? catRow.물류비 : globalSettings.logistics);
              const marginRatio = catRow?.마진율 !== undefined ? catRow.마진율 : globalSettings.margin;
              const sRatio = catRow?.S등급비율 !== undefined ? catRow.S등급비율 : globalSettings.sRatio;
              const aRatio = catRow?.A등급비율 !== undefined ? catRow.A등급비율 : globalSettings.aRatio;
              const bRatio = catRow?.B등급비율 !== undefined ? catRow.B등급비율 : globalSettings.bRatio;
              const cRatio = catRow?.C등급비율 !== undefined ? catRow.C등급비율 : globalSettings.cRatio;
              const wRatio = catRow?.W등급비율 !== undefined ? catRow.W등급비율 : globalSettings.wRatio;

              row.환율 = exchange;
              row.물류비 = logistics;

              const unitPrice = Number(row.단가) || 0;
              const computedCost = Math.round(unitPrice * exchange + logistics);
              row.원가 = computedCost;

              const computedWholesale = Math.round((computedCost * marginRatio) / 1000) * 1000;
              row.도매가 = computedWholesale;

              const excluded = newVal ? newVal.split(',').map(s => s.trim().toUpperCase()) : [];
              row.S등급가 = excluded.includes('S') ? computedWholesale : Math.round((computedWholesale * sRatio) / 100) * 100;
              row.A등급 = excluded.includes('A') ? computedWholesale : Math.round((computedWholesale * aRatio) / 100) * 100;
              row.B등급 = excluded.includes('B') ? computedWholesale : Math.round((computedWholesale * bRatio) / 100) * 100;
              row.C등급 = excluded.includes('C') ? computedWholesale : Math.round((computedWholesale * cRatio) / 100) * 100;
              row.W등급가 = excluded.includes('W') ? computedWholesale : Math.round((computedWholesale * wRatio) / 100) * 100;

              updated[globalIdx] = row;
              setProducts(updated);
            }}
          />
        );
      case '포인트':
        return (
          <input
            type="text"
            list="point-options"
            value={product.포인트 || ''}
            onChange={(e) => handleValueChange(globalIdx, '포인트', e.target.value)}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
            placeholder="선택/입력"
          />
        );
      case '추천':
        return (
          <input
            type="text"
            value={product.추천 || ''}
            placeholder="-"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              const val = raw === '' ? 0 : parseInt(raw, 10);
              handleValueChange(globalIdx, '추천', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
          />
        );
      case '단가':
        return (
          <input
            type="text"
            value={product.단가 ? product.단가.toLocaleString('ko-KR') : ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9.]/g, '');
              const val = parseFloat(raw) || 0;
              handleValueChange(globalIdx, '단가', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
          />
        );
      case '환율':
        return (
          <input
            type="number"
            step="0.01"
            value={product.환율 || ''}
            placeholder="0"
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              handleValueChange(globalIdx, '환율', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
          />
        );
      case '물류비':
        return (
          <input
            type="text"
            value={product.물류비 ? product.물류비.toLocaleString('ko-KR') : ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              const val = parseInt(raw, 10) || 0;
              handleValueChange(globalIdx, '물류비', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
          />
        );
      case '원가':
        return (
          <span className="text-neutral-500 select-none block text-center">
            {(product.원가 || 0).toLocaleString('ko-KR')}
          </span>
        );
      case '도매가':
        return (
          <div className="flex items-center justify-center space-x-1">
            <input
              type="text"
              value={product.도매가 ? product.도매가.toLocaleString('ko-KR') : ''}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                const val = parseInt(raw, 10) || 0;
                handleValueChange(globalIdx, '도매가', val);
              }}
              className="w-full text-center pl-4 pr-1 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none font-semibold text-black"
            />
            <button
              onClick={() => triggerRecalculate(globalIdx)}
              title="재계산 규칙에 의해 원가, 도매가, 등급별 단가 재설정"
              className="text-neutral-400 hover:text-black p-0.5 shrink-0"
            >
              <Calculator className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      case 'S등급가':
        return (
          <input
            type="text"
            value={product.S등급가 ? product.S등급가.toLocaleString('ko-KR') : ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              const val = parseInt(raw, 10) || 0;
              handleValueChange(globalIdx, 'S등급가', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none font-semibold text-indigo-700"
          />
        );
      case 'A등급':
        return (
          <input
            type="text"
            value={product.A등급 ? product.A등급.toLocaleString('ko-KR') : ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              const val = parseInt(raw, 10) || 0;
              handleValueChange(globalIdx, 'A등급', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none font-semibold text-indigo-700"
          />
        );
      case 'B등급':
        return (
          <input
            type="text"
            value={product.B등급 ? product.B등급.toLocaleString('ko-KR') : ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              const val = parseInt(raw, 10) || 0;
              handleValueChange(globalIdx, 'B등급', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none font-semibold text-indigo-700"
          />
        );
      case 'C등급':
        return (
          <input
            type="text"
            value={product.C등급 ? product.C등급.toLocaleString('ko-KR') : ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              const val = parseInt(raw, 10) || 0;
              handleValueChange(globalIdx, 'C등급', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none font-semibold text-indigo-700"
          />
        );
      case 'W등급가':
        return (
          <input
            type="text"
            value={product.W등급가 ? product.W등급가.toLocaleString('ko-KR') : ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              const val = parseInt(raw, 10) || 0;
              handleValueChange(globalIdx, 'W등급가', val);
            }}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none font-semibold text-indigo-700"
          />
        );
      case '사입처':
        return (
          <input
            type="text"
            value={product.사입처}
            onChange={(e) => handleValueChange(globalIdx, '사입처', e.target.value)}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
          />
        );
      case '중국코드':
        return (
          <input
            type="text"
            value={product.중국코드}
            onChange={(e) => handleValueChange(globalIdx, '중국코드', e.target.value)}
            className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black bg-transparent focus:bg-white text-xs font-mono focus:outline-none rounded-none"
          />
        );
      default:
        return null;
    }
  };
  const [categories, setCategories] = useState<CategoryMaster[]>([]);
  const [itemsList, setItemsList] = useState<ItemMaster[]>([]);
  const [colorsList, setColorsList] = useState<ColorMaster[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState({ current: 0, total: 0, currentProductCode: '' });
  const [globalSettings, setGlobalSettings] = useState({
    exchange: 230,
    logistics: 1200,
    margin: 1.3,
    sRatio: 0.85,
    aRatio: 0.89,
    bRatio: 0.93,
    cRatio: 0.97,
    wRatio: 0.89,
    showCategoriesOnMain: true,
    pointOptions: [] as string[],
    seasonOptions: [] as string[],
    defaultSeason: ''
  });
  const [activeTab, setActiveTab] = useState<'all' | 'new'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [selectedSyncTime, setSelectedSyncTime] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedExposures, setSelectedExposures] = useState<string[]>([]);
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // 체크박스 선택 관리를 위한 식별자(임시코드 또는 상품명) 배열 상태
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // 대표 이미지 원본 크기 팝업 모달 상태
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  // 엑셀 불러오기(Import) 시 데이터 중복 컨펌 모달 상태
  const [importConfirmModal, setImportConfirmModal] = useState(false);
  const [importConflictCount, setImportConflictCount] = useState(0);

  // 일괄 삭제(Bulk Delete) 컨펌 모달 상태
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // 일괄 변경(Bulk Update) 모달 상태
  const [isBulkUpdateModalOpen, setIsBulkUpdateModalOpen] = useState(false);
  const [bulkFields, setBulkFields] = useState({
    applyExposure: false,
    exposureValue: 'n',
    applyExclude: false,
    excludeValue: '',
    applyWeek: false,
    weekValue: '',
    applyCategory: false,
    categoryValue: '',
    applyItem: false,
    itemValue: '',
    applySize: false,
    sizeValue: '',
    applyBuySource: false,
    buySourceValue: '',
    applyRecommend: false,
    recommendValue: 0,
    applyUnitPrice: false,
    unitPriceValue: '' as string | number,
    applyExchange: false,
    exchangeValue: '' as string | number,
    applyLogistics: false,
    logisticsValue: '' as string | number,
    applyPoint: false,
    pointValue: '',
    applyUploadDate: false,
    uploadDateValue: '',
    applySeason: false,
    seasonValue: '',
    applyGradeExclude: false,
    gradeExcludeValue: ''
  });

  // 2안 옵션 준비: 로컬 이미지 업로드 및 신규 상품 수동 추가 상태와 핸들러
  const [cacheBuster, setCacheBuster] = useState<number>(0);
  const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    상품명: '',
    임시코드: '',
    카테고리: '신상',
    주차: '',
    아이템: '',
    컬러: 'Free',
    사이즈: 'free',
    단가: 0,
    노출여부: 'y',
    시즌: '',
    등급할인제외: ''
  });

  // 카테고리/포인트 관리 모달 관련 상태
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsCategories, setSettingsCategories] = useState<CategoryMaster[]>([]);
  const [settingsPointOptions, setSettingsPointOptions] = useState<string[]>([]);
  const [settingsSeasonOptions, setSettingsSeasonOptions] = useState<string[]>([]);
  const [settingsDefaultSeason, setSettingsDefaultSeason] = useState<string>('');
  
  // 신규 추가용 로컬 임시 상태
  const [newCatName, setNewCatName] = useState('');
  const [newCatExchange, setNewCatExchange] = useState<number>(230);
  const [newCatLogistics, setNewCatLogistics] = useState<number>(1200);
  const [newPointName, setNewPointName] = useState('');
  const [newSeasonName, setNewSeasonName] = useState('');

  const handleImageUpload = async (week: string, code: string, file: File) => {
    const key = `${week}-${code}`;
    setUploadingState(prev => ({ ...prev, [key]: true }));

    const formData = new FormData();
    formData.append('week', week);
    formData.append('code', code);
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert(`${code} 상품의 이미지가 업로드되었습니다.`);
        setCacheBuster(Date.now());
        loadData();
      } else {
        alert(`업로드 실패: ${data.message}`);
      }
    } catch (err: any) {
      alert(`업로드 에러: ${err.message}`);
    } finally {
      setUploadingState(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductForm.상품명.trim() || !newProductForm.임시코드.trim() || !newProductForm.주차.trim()) {
      alert('상품명, 임시코드, 주차는 필수 입력 항목입니다.');
      return;
    }

    const codeExists = products.some(p => 
      (p.임시코드 || p.상품명 || '').toLowerCase().trim() === newProductForm.임시코드.toLowerCase().trim()
    );
    if (codeExists) {
      alert('이미 존재하는 임시코드(상품)입니다. 다른 코드를 사용해 주세요.');
      return;
    }

    const payload: Product = {
      업로드일자: new Date().toLocaleDateString('ko-KR').slice(5).replace('. ', '/').replace('.', ''),
      노출여부: newProductForm.노출여부,
      노출제외: '',
      카테고리: newProductForm.카테고리,
      주차: newProductForm.주차,
      상품명: newProductForm.상품명,
      임시코드: newProductForm.임시코드,
      아이템: newProductForm.아이템,
      컬러: newProductForm.컬러,
      사이즈: newProductForm.사이즈,
      단가: Number(newProductForm.단가) || 0,
      환율: 230,
      물류비: 1200,
      원가: 0,
      도매가: 0,
      S등급가: 0,
      A등급: 0,
      B등급: 0,
      C등급: 0,
      W등급가: 0,
      사입처: '',
      중국코드: '',
      신규등록대기: false,
      추천: 0,
      시즌: newProductForm.시즌,
      등급할인제외: newProductForm.등급할인제외
    };

    try {
      const res = await fetch('/api/admin/add-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('상품이 성공적으로 추가되었습니다.');
        setIsAddProductModalOpen(false);
        setNewProductForm({
          상품명: '',
          임시코드: '',
          카테고리: '신상',
          주차: '',
          아이템: '',
          컬러: 'Free',
          사이즈: 'free',
          단가: 0,
          노출여부: 'y',
          시즌: globalSettings.defaultSeason || '26SM',
          등급할인제외: ''
        });
        loadData();
      } else {
        alert(`추가 실패: ${data.message}`);
      }
    } catch (err: any) {
      alert(`에러 발생: ${err.message}`);
    }
  };

  const handleOpenAddProductModal = () => {
    setNewProductForm({
      상품명: '',
      임시코드: '',
      카테고리: categories[0]?.카테고리 || '신상',
      주차: '',
      아이템: '',
      컬러: 'Free',
      사이즈: 'free',
      단가: 0,
      노출여부: 'y',
      시즌: globalSettings.defaultSeason || '26SM',
      등급할인제외: ''
    });
    setIsAddProductModalOpen(true);
  };

  // 2안 옵션: 주문서 관리용 상태 및 함수
  const [adminActiveTab, setAdminActiveTab] = useState<'products' | 'orders'>('products');
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [savingOrders, setSavingOrders] = useState(false);
  const [ordersSearchTerm, setOrdersSearchTerm] = useState('');

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch('/api/admin/orders');
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      } else {
        alert(`주문 로딩 실패: ${data.message}`);
      }
    } catch (err: any) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleOrderValueChange = (index: number, key: string, val: any) => {
    setOrders(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [key]: val
      };
      if (key === '단가' || key === '수량') {
        const qty = Number(key === '수량' ? val : copy[index].수량) || 0;
        const price = Number(key === '단가' ? val : copy[index].단가) || 0;
        copy[index].금액 = qty * price;
      }
      return copy;
    });
  };

  const handleSaveOrders = async () => {
    setSavingOrders(true);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || '주문 변경 사항이 성공적으로 저장되었습니다.');
        loadOrders();
      } else {
        alert(`저장 실패: ${data.message}`);
      }
    } catch (err: any) {
      alert(`저장 중 에러가 발생했습니다: ${err.message}`);
    } finally {
      setSavingOrders(false);
    }
  };

  useEffect(() => {
    if (adminActiveTab === 'orders') {
      loadOrders();
    }
  }, [adminActiveTab]);

  // 어드민 데이터 로드 API 호출
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products');
      const data = await res.json();
      if (data.success) {
        setCacheBuster(Date.now());
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setItemsList(data.items || []);
        setColorsList(data.colors || []);
        setCustomersList(data.customers || []);
        if (data.globalSettings) {
          setGlobalSettings({
            exchange: data.globalSettings.exchange ?? 230,
            logistics: data.globalSettings.logistics ?? 1200,
            margin: data.globalSettings.margin ?? 1.3,
            sRatio: data.globalSettings.sRatio ?? 0.85,
            aRatio: data.globalSettings.aRatio ?? 0.89,
            bRatio: data.globalSettings.bRatio ?? 0.93,
            cRatio: data.globalSettings.cRatio ?? 0.97,
            wRatio: data.globalSettings.wRatio ?? 0.89,
            showCategoriesOnMain: data.globalSettings.showCategoriesOnMain !== undefined ? data.globalSettings.showCategoriesOnMain : true,
            pointOptions: data.globalSettings.pointOptions || ['오더만', '공동구매', '세일', '품절'],
            seasonOptions: data.globalSettings.seasonOptions || ['26SM', '26FA', '26WT'],
            defaultSeason: data.globalSettings.defaultSeason || '26SM'
          });
          if (data.globalSettings.columnWidths) {
            setColumnWidths(data.globalSettings.columnWidths);
          }
          if (data.globalSettings.visibleColumns && data.globalSettings.visibleColumns.length > 0) {
            const visibleCols = data.globalSettings.visibleColumns;
            const hidden = ALL_COLUMNS.filter(c => c.canHide && !visibleCols.includes(c.key)).map(c => c.key);
            setHiddenColumns(hidden);
          } else {
            setHiddenColumns([]);
          }
          if (data.globalSettings.columnOrder && Array.isArray(data.globalSettings.columnOrder) && data.globalSettings.columnOrder.length > 0) {
            const savedOrder = data.globalSettings.columnOrder.filter((k: string) => ALL_COLUMNS.some(c => c.key === k));
            const missingKeys = ALL_COLUMNS.map(c => c.key).filter(k => !savedOrder.includes(k));
            setColumnOrder([...savedOrder, ...missingKeys]);
          } else {
            setColumnOrder(ALL_COLUMNS.map(c => c.key));
          }
        }
        return data.products || [];
      }
    } catch (e) {
      console.error('상품 및 마스터 데이터 불러오기 실패:', e);
    } finally {
      setLoading(false);
    }
    return null;
  };

  const handleOpenSettingsModal = () => {
    setSettingsCategories(categories);
    setSettingsPointOptions(globalSettings.pointOptions || ['오더만', '공동구매', '세일', '품절']);
    setSettingsSeasonOptions(globalSettings.seasonOptions || ['26SM', '26FA', '26WT']);
    setSettingsDefaultSeason(globalSettings.defaultSeason || '26SM');
    setNewCatName('');
    setNewCatExchange(globalSettings.exchange || 230);
    setNewCatLogistics(globalSettings.logistics || 1200);
    setNewPointName('');
    setNewSeasonName('');
    setIsSettingsModalOpen(true);
  };

  const handleAddSeasonOption = () => {
    const trimmed = newSeasonName.trim();
    if (!trimmed) return;
    if (settingsSeasonOptions.includes(trimmed)) {
      alert('이미 존재하는 시즌 옵션입니다.');
      return;
    }
    setSettingsSeasonOptions(prev => [...prev, trimmed]);
    setNewSeasonName('');
  };

  const handleDeleteSeasonOption = (optName: string) => {
    setSettingsSeasonOptions(prev => {
      const filtered = prev.filter(o => o !== optName);
      if (settingsDefaultSeason === optName) {
        setSettingsDefaultSeason(filtered[0] || '');
      }
      return filtered;
    });
  };

  const handleAddCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (settingsCategories.some(c => c.카테고리 === trimmed)) {
      alert('이미 존재하는 카테고리입니다.');
      return;
    }
    const newCat: CategoryMaster = {
      카테고리: trimmed,
      등급: 'C',
      환율: Number(newCatExchange) || 230,
      물류비: Number(newCatLogistics) || 1200
    };
    setSettingsCategories(prev => [...prev, newCat]);
    setNewCatName('');
  };

  const handleDeleteCategory = (catName: string) => {
    setSettingsCategories(prev => prev.filter(c => c.카테고리 !== catName));
  };

  const handleUpdateCategoryField = (index: number, field: keyof CategoryMaster, value: any) => {
    setSettingsCategories(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };

  const handleAddPointOption = () => {
    const trimmed = newPointName.trim();
    if (!trimmed) return;
    if (settingsPointOptions.includes(trimmed)) {
      alert('이미 존재하는 포인트 옵션입니다.');
      return;
    }
    setSettingsPointOptions(prev => [...prev, trimmed]);
    setNewPointName('');
  };

  const handleDeletePointOption = (optName: string) => {
    setSettingsPointOptions(prev => prev.filter(o => o !== optName));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updatedGlobalSettings = {
        ...globalSettings,
        pointOptions: settingsPointOptions,
        seasonOptions: settingsSeasonOptions,
        defaultSeason: settingsDefaultSeason,
        columnOrder
      };
      
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalSettings: updatedGlobalSettings,
          categories: settingsCategories
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('카테고리 및 포인트 설정이 성공적으로 저장되었습니다.');
        await loadData();
        setIsSettingsModalOpen(false);
      } else {
        alert(data.message || '저장 중 오류가 발생했습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('서버 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);


  // 주차 폴더 신규 동기화
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`신규 폴더 동기화 완료: ${data.addedCount}개의 신상품이 추가되었습니다.`);
        if (data.addedCount > 0) {
          setActiveTab('new');
          const loadedProducts = await loadData();
          if (loadedProducts) {
            // Find newly synced products that need AI classification
            const newProducts = loadedProducts.filter((p: Product) => 
              data.addedProducts && data.addedProducts.includes(p.임시코드 || p.상품명)
            );
            if (newProducts.length > 0) {
              setTimeout(() => {
                runAIAutoFill(newProducts, false);
              }, 500);
            }
          }
        } else {
          loadData();
        }
      } else {
        alert(data.message || '동기화 중 오류가 발생했습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('신규 폴더 동기화 처리 실패');
    } finally {
      setSyncing(false);
    }
  };

  // 현재 테이블에 수정된 최종 데이터를 JSON Primary DB에 저장
  const handleSaveAll = async () => {
    if (saving) return;
    setSaving(true);

    // 저장 시, 현재 목록에 있는 상품 중 '신규등록대기' 상태인 것들의 플래그를 false로 해제하여 전체 DB에 편입
    const productsToSave = products.map(p => ({
      ...p,
      신규등록대기: false
    }));

    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: productsToSave,
          globalSettings: {
            ...globalSettings,
            columnWidths,
            visibleColumns: ALL_COLUMNS.filter(c => !hiddenColumns.includes(c.key)).map(c => c.key),
            columnOrder
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('성공적으로 데이터베이스에 저장되었으며, 신규 상품이 전체 데이터베이스로 정식 편입되었습니다.');
        setActiveTab('all'); // 저장 완료 시 전체 보기로 전환
        handleResetAllFilters(); // 저장 완료 시 모든 필터 및 정렬 상태 초기화
        loadData();
      } else {
        alert(data.message || '저장 실패');
      }
    } catch (e) {
      console.error(e);
      alert('데이터베이스 저장 도중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 글로벌 설정만 단독으로 JSON DB에 저장
  const handleSaveGlobalSettings = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalSettings: {
            ...globalSettings,
            columnWidths,
            visibleColumns: ALL_COLUMNS.filter(c => !hiddenColumns.includes(c.key)).map(c => c.key),
            columnOrder
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('글로벌 설정이 성공적으로 저장되었습니다.');
        loadData();
      } else {
        alert(data.message || '설정 저장 실패');
      }
    } catch (e) {
      console.error(e);
      alert('글로벌 설정 저장 도중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // AI 이미지 자동 분석 및 기입 핵심 로직
  const runAIAutoFill = async (targets: Product[], confirmRequired: boolean = true) => {
    if (targets.length === 0) {
      if (confirmRequired) {
        alert(`AI 자동 입력을 실행할 대상 상품이 없습니다.
(아이템이나 컬러가 비어있는 상품이 없거나, 선택된 상품이 없습니다.)`);
      }
      return;
    }

    if (confirmRequired) {
      const confirmMessage = selectedKeys.length > 0
        ? `선택한 ${targets.length}개의 상품에 대해 AI 이미지 분석을 시작하시겠습니까?
(API 제한 준수를 위해 상품당 약 4초의 대기 시간이 발생합니다.)`
        : `분석 대기 중인 ${targets.length}개의 상품에 대해 AI 이미지 분석을 시작하시겠습니까?
(API 제한 준수를 위해 상품당 약 4초의 대기 시간이 발생합니다.)`;

      if (!confirm(confirmMessage)) {
        return;
      }
    }

    setAiLoading(true);
    setAiProgress({ current: 0, total: targets.length, currentProductCode: '' });

    // 임시로 상태를 조금씩 업데이트하기 위한 로컬 배열 카피
    let currentProds = [...products];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const targetKey = target.임시코드 || target.상품명;

      setAiProgress({
        current: i + 1,
        total: targets.length,
        currentProductCode: targetKey
      });

      try {
        const res = await fetch('/api/admin/ai-auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ week: target.주차, code: targetKey })
        });
        const data = await res.json();

        if (data.success) {
          const idx = currentProds.findIndex(p => (p.임시코드 || p.상품명) === targetKey);
          if (idx !== -1) {
            const detectedItem = data.item || currentProds[idx].아이템;
            const detectedCategory = getCategoryFromItem(detectedItem) || currentProds[idx].카테고리;
            currentProds[idx] = {
              ...currentProds[idx],
              아이템: detectedItem,
              컬러: data.colors || currentProds[idx].컬러,
              카테고리: detectedCategory
            };
            // 실시간 프로그레스를 그리드에 바로 보여주기 위해 업데이트
            setProducts([...currentProds]);
          }
          successCount++;
        } else {
          console.warn(`[AI Auto] 상품 ${targetKey} 분석 실패:`, data.message);
          failCount++;
        }
      } catch (e) {
        console.error(`[AI Auto] 상품 ${targetKey} 통신 에러:`, e);
        failCount++;
      }

      // API RPM 15 제한(분당 15회 = 4초당 1회) 준수를 위해 4초 대기 (마지막 루프 제외)
      if (i < targets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    }

    setAiLoading(false);
    
    if (confirmRequired) {
      alert(`AI 자동 분석 완료!
성공: ${successCount}건
실패: ${failCount}건

그리드에 반영된 값을 확인한 후 반드시 [저장] 버튼을 눌러 최종 적용해 주세요.`);
    } else {
      alert(`신규 상품 AI 자동 분석 완료!
성공: ${successCount}건
실패: ${failCount}건

결과를 확인하고 반드시 [저장] 버튼을 눌러주세요.`);
    }
  };

  // AI 이미지 자동 분석 및 기입 (수동 실행)
  const handleAIAutoFill = async () => {
    // 1. 대상 선정: 체크된 상품이 있으면 해당 상품만, 없으면 아이템이나 컬러가 비어있거나 'Free'인 상품
    const targets = selectedKeys.length > 0
      ? products.filter(p => selectedKeys.includes(p.임시코드 || p.상품명))
      : products.filter(p => 
          !p.아이템 || 
          p.아이템 === '아이템명 입력' || 
          !p.컬러 || 
          p.컬러.toLowerCase() === 'free'
        );

    await runAIAutoFill(targets, true);
  };

  // 엑셀 내보내기 (체크된 상품들을 Master.xlsx 상품 마스터 시트에 덮어씀)
  const handleExportSelected = async () => {
    const selectedList = products.filter(p => selectedKeys.includes(p.임시코드 || p.상품명));
    if (selectedList.length === 0) {
      alert('엑셀로 내보낼 상품을 1개 이상 체크박스로 선택해 주세요.');
      return;
    }

    try {
      const res = await fetch('/api/admin/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selectedList })
      });
      const data = await res.json();
      if (data.success) {
        alert(`선택된 ${selectedList.length}개의 상품을 Master.xlsx의 '상품 마스터' 시트에 덮어썼습니다.`);
      } else {
        alert(data.message || '엑셀 내보내기 도중 오류가 발생했습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('엑셀 내보내기 실패');
    }
  };

  // 엑셀 불러오기 (Master.xlsx에서 JSON Primary DB로 머지)
  const handleImport = async (force = false) => {
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });
      const data = await res.json();
      if (data.success) {
        if (data.hasConflicts) {
          setImportConflictCount(data.count);
          setImportConfirmModal(true);
        } else {
          alert(data.message || '성공적으로 엑셀 데이터를 불러왔습니다.');
          setImportConfirmModal(false);
          loadData();
        }
      } else {
        alert(data.message || '엑셀 불러오기 도중 오류가 발생했습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('엑셀 불러오기 에러 발생');
    }
  };

  // 일괄 삭제 실행을 위한 모달 활성화
  const handleBulkDeletePrompt = () => {
    if (selectedKeys.length === 0) return;
    setIsBulkDeleteModalOpen(true);
    setDeleteConfirmPassword('');
    setDeleteError('');
  };

  // 일괄 삭제 승인 처리 (비밀번호 확인 후 실행)
  const handleBulkDeleteConfirm = () => {
    if (deleteConfirmPassword !== '1234') {
      setDeleteError('비밀번호가 올바르지 않습니다.');
      return;
    }
    
    // 선택되지 않은 상품들만 남기고 필터링
    const remainingProducts = products.filter(p => {
      const key = p.임시코드 || p.상품명;
      return !selectedKeys.includes(key);
    });

    setProducts(remainingProducts);
    setSelectedKeys([]);
    setIsBulkDeleteModalOpen(false);
    setDeleteConfirmPassword('');
    setDeleteError('');
    alert('선택한 상품이 삭제되었습니다. 변경 사항을 적용하려면 [저장] 버튼을 눌러주세요.');
  };

  // 그리드 내 필드 변경 처리기
  const handleValueChange = (index: number, field: keyof Product, value: any) => {
    const updated = [...products];
    const row = { ...updated[index], [field]: value };

    // 노출여부가 y/Y로 변경되거나, 노출제외 필드에 특정 값이 지정될 때 노출날짜(업로드일자)가 비어있다면 오늘 날짜 자동 기입
    if (
      (field === '노출여부' && String(value).toLowerCase().trim() === 'y') ||
      (field === '노출제외' && String(value).trim() !== '')
    ) {
      if (!row.업로드일자 || row.업로드일자.trim() === '') {
        const now = new Date();
        row.업로드일자 = `${now.getMonth() + 1}/${now.getDate()}`;
      }
    }

    updated[index] = row;
    setProducts(updated);
  };

  // 등급별 자동 가격 계산 로직 트리거
  const triggerRecalculate = (index: number) => {
    const updated = [...products];
    const row = { ...updated[index] };

    const catRow = categories.find(c => c.카테고리 === row.카테고리);
    
    const exchange = Number(row.환율) || (catRow ? catRow.환율 : globalSettings.exchange);
    const logistics = Number(row.물류비) || (catRow ? catRow.물류비 : globalSettings.logistics);
    const marginRatio = catRow?.마진율 !== undefined ? catRow.마진율 : globalSettings.margin;
    const sRatio = catRow?.S등급비율 !== undefined ? catRow.S등급비율 : globalSettings.sRatio;
    const aRatio = catRow?.A등급비율 !== undefined ? catRow.A등급비율 : globalSettings.aRatio;
    const bRatio = catRow?.B등급비율 !== undefined ? catRow.B등급비율 : globalSettings.bRatio;
    const cRatio = catRow?.C등급비율 !== undefined ? catRow.C등급비율 : globalSettings.cRatio;
    const wRatio = catRow?.W등급비율 !== undefined ? catRow.W등급비율 : globalSettings.wRatio;

    row.환율 = exchange;
    row.물류비 = logistics;

    const unitPrice = Number(row.단가) || 0;
    const computedCost = Math.round(unitPrice * exchange + logistics);
    row.원가 = computedCost;

    const computedWholesale = Math.round((computedCost * marginRatio) / 1000) * 1000;
    row.도매가 = computedWholesale;

    const excluded = (row.등급할인제외 || '').split(',').map(s => s.trim().toUpperCase());
    row.S등급가 = excluded.includes('S') ? computedWholesale : Math.round((computedWholesale * sRatio) / 100) * 100;
    row.A등급 = excluded.includes('A') ? computedWholesale : Math.round((computedWholesale * aRatio) / 100) * 100;
    row.B등급 = excluded.includes('B') ? computedWholesale : Math.round((computedWholesale * bRatio) / 100) * 100;
    row.C등급 = excluded.includes('C') ? computedWholesale : Math.round((computedWholesale * cRatio) / 100) * 100;
    row.W등급가 = excluded.includes('W') ? computedWholesale : Math.round((computedWholesale * wRatio) / 100) * 100;

    updated[index] = row;
    setProducts(updated);
  };

  // 고유값 리스트 추출 (고급 필터용)
  const uniqueWeeks = Array.from(new Set(products.map(p => p.주차).filter(Boolean))).sort();
  const uniqueCategoryOptions = categories.map(c => c.카테고리).filter(Boolean);
  const uniqueItemOptions = itemsList.map(i => i.아이템).filter(Boolean);
  const uniqueSeasonOptions = Array.from(new Set(products.map(p => p.시즌).filter(Boolean))).sort();
  const uniqueExposureClients = Array.from(new Set(
    products.flatMap(p => {
      if (!p.노출여부) return [];
      return p.노출여부.split(',').map(s => s.trim()).filter(s => {
        const lower = s.toLowerCase();
        // y, n 및 a, b, c, b,c 등 표준 등급 코드들을 모두 제외하여 순수 거래처명만 추출
        return lower !== 'y' && lower !== 'n' && lower !== 'a' && lower !== 'b' && lower !== 'c' && lower !== 'b,c' && lower !== 'b, c' && lower !== '';
      });
    })
  )).sort();

  // 선택 일괄 변경 실행
  const handleApplyBulkUpdate = () => {
    if (selectedKeys.length === 0) {
      alert('일괄 변경할 상품을 왼쪽 체크박스로 선택해 주세요.');
      return;
    }

    const updated = products.map(p => {
      const isTarget = selectedKeys.includes(p.임시코드 || p.상품명);
      if (!isTarget) return p;

      const row = { ...p };

      // 1. 카테고리
      if (bulkFields.applyCategory) {
        row.카테고리 = bulkFields.categoryValue;
        // 카테고리가 변경되면 기본 환율/물류비 로드
        const matchedCat = categories.find(c => c.카테고리 === bulkFields.categoryValue);
        if (matchedCat) {
          row.환율 = matchedCat.환율 || 0;
          row.물류비 = matchedCat.물류비 || 0;
        }
      }

      // 2. 노출여부
      if (bulkFields.applyExposure) {
        row.노출여부 = bulkFields.exposureValue;
      }

      // 2-2. 노출제외
      if (bulkFields.applyExclude) {
        row.노출제외 = bulkFields.excludeValue;
      }

      // 노출여부/노출제외 일괄 변경 시 노출날짜 자동 입력
      if (
        (row.노출여부 && String(row.노출여부).toLowerCase().trim() === 'y') ||
        (row.노출제외 && String(row.노출제외 || '').trim() !== '')
      ) {
        if (!row.업로드일자 || row.업로드일자.trim() === '') {
          const now = new Date();
          row.업로드일자 = `${now.getMonth() + 1}/${now.getDate()}`;
        }
      }

      // 3. 주차
      if (bulkFields.applyWeek) {
        row.주차 = bulkFields.weekValue;
      }

      // 4. 아이템
      if (bulkFields.applyItem) {
        row.아이템 = bulkFields.itemValue;
      }

      // 5. 사이즈
      if (bulkFields.applySize) {
        row.사이즈 = bulkFields.sizeValue;
      }

      // 6. 사입처
      if (bulkFields.applyBuySource) {
        row.사입처 = bulkFields.buySourceValue;
      }

      // 7. 추천여부
      if (bulkFields.applyRecommend) {
        row.추천 = bulkFields.recommendValue;
      }

      // 8. 단가
      if (bulkFields.applyUnitPrice) {
        row.단가 = Number(bulkFields.unitPriceValue) || 0;
      }

      // 9. 환율
      if (bulkFields.applyExchange) {
        row.환율 = Number(bulkFields.exchangeValue) || 0;
      }

      // 10. 물류비
      if (bulkFields.applyLogistics) {
        row.물류비 = Number(bulkFields.logisticsValue) || 0;
      }

      // 11. 포인트
      if (bulkFields.applyPoint) {
        row.포인트 = bulkFields.pointValue;
      }

      // 12. 업로드일자
      if (bulkFields.applyUploadDate) {
        row.업로드일자 = bulkFields.uploadDateValue;
      }

      // 13. 시즌
      if (bulkFields.applySeason) {
        row.시즌 = bulkFields.seasonValue;
      }

      // 14. 등급할인제외
      if (bulkFields.applyGradeExclude) {
        row.등급할인제외 = bulkFields.gradeExcludeValue;
      }

      // 단가, 환율, 물류비, 카테고리가 변경되었으므로 가격 관련 필드 전체 재계산
      const catRow = categories.find(c => c.카테고리 === row.카테고리);
      const exchange = Number(row.환율) || (catRow ? catRow.환율 : globalSettings.exchange);
      const logistics = Number(row.물류비) || (catRow ? catRow.물류비 : globalSettings.logistics);
      const marginRatio = catRow?.마진율 !== undefined ? catRow.마진율 : globalSettings.margin;
      const sRatio = catRow?.S등급비율 !== undefined ? catRow.S등급비율 : globalSettings.sRatio;
      const aRatio = catRow?.A등급비율 !== undefined ? catRow.A등급비율 : globalSettings.aRatio;
      const bRatio = catRow?.B등급비율 !== undefined ? catRow.B등급비율 : globalSettings.bRatio;
      const cRatio = catRow?.C등급비율 !== undefined ? catRow.C등급비율 : globalSettings.cRatio;
      const wRatio = catRow?.W등급비율 !== undefined ? catRow.W등급비율 : globalSettings.wRatio;

      row.환율 = exchange;
      row.물류비 = logistics;

      const unitPrice = Number(row.단가) || 0;
      const computedCost = Math.round(unitPrice * exchange + logistics);
      row.원가 = computedCost;

      const computedWholesale = Math.round((computedCost * marginRatio) / 1000) * 1000;
      row.도매가 = computedWholesale;

      const excluded = (row.등급할인제외 || '').split(',').map(s => s.trim().toUpperCase());
      row.S등급가 = excluded.includes('S') ? computedWholesale : Math.round((computedWholesale * sRatio) / 100) * 100;
      row.A등급 = excluded.includes('A') ? computedWholesale : Math.round((computedWholesale * aRatio) / 100) * 100;
      row.B등급 = excluded.includes('B') ? computedWholesale : Math.round((computedWholesale * bRatio) / 100) * 100;
      row.C등급 = excluded.includes('C') ? computedWholesale : Math.round((computedWholesale * cRatio) / 100) * 100;
      row.W등급가 = excluded.includes('W') ? computedWholesale : Math.round((computedWholesale * wRatio) / 100) * 100;

      return row;
    });

    setProducts(updated);
    setSelectedKeys([]);
    setIsBulkUpdateModalOpen(false);

    // bulkFields 초기화
    setBulkFields({
      applyExposure: false,
      exposureValue: 'n',
      applyExclude: false,
      excludeValue: '',
      applyWeek: false,
      weekValue: '',
      applyCategory: false,
      categoryValue: '',
      applyItem: false,
      itemValue: '',
      applySize: false,
      sizeValue: '',
      applyBuySource: false,
      buySourceValue: '',
      applyRecommend: false,
      recommendValue: 0,
      applyUnitPrice: false,
      unitPriceValue: '',
      applyExchange: false,
      exchangeValue: '',
      applyLogistics: false,
      logisticsValue: '',
      applyPoint: false,
      pointValue: '',
      applyUploadDate: false,
      uploadDateValue: '',
      applySeason: false,
      seasonValue: '',
      applyGradeExclude: false,
      gradeExcludeValue: ''
    });

    alert(`선택한 상품 정보가 일괄 변경되었습니다. 변경 내용을 파일에 최종 반영하려면 상단의 [저장] 버튼을 꼭 클릭해 주세요.`);
  };

  // 글로벌 설정 일괄 적용 (체크박스 선택된 항목만 강제 적용)
  const handleApplyGlobalSettings = () => {
    if (selectedKeys.length === 0) {
      alert('일괄 적용할 상품을 왼쪽 체크박스로 선택해 주세요.');
      return;
    }

    const targets = products.filter(p => selectedKeys.includes(p.임시코드 || p.상품명));

    if (targets.length === 0) {
      alert('선택된 상품 중 적용 가능한 대상이 없습니다.');
      return;
    }

    const confirmMsg = `선택한 ${targets.length}개의 상품에 입력하신 글로벌 설정(환율, 물류비, 마진율 및 등급별 비율)을 일괄 적용하시겠습니까?
(그리드 값은 임시 변경되며, 최종 저장을 위해 상단의 [저장] 버튼을 누르셔야 데이터베이스에 최종 반영됩니다.)`;

    if (!confirm(confirmMsg)) {
      return;
    }

    const updated = products.map(p => {
      const isTarget = selectedKeys.includes(p.임시코드 || p.상품명);

      if (!isTarget) return p;

      const exchange = Number(globalSettings.exchange) || 0;
      const logistics = Number(globalSettings.logistics) || 0;
      const marginRatio = Number(globalSettings.margin) || 1.25;
      const sRatio = Number(globalSettings.sRatio) || 0.80;
      const aRatio = Number(globalSettings.aRatio) || 0.85;
      const bRatio = Number(globalSettings.bRatio) || 0.90;
      const cRatio = Number(globalSettings.cRatio) || 0.95;
      const wRatio = Number(globalSettings.wRatio) || 0.89;

      const unitPrice = Number(p.단가) || 0;
      const computedCost = Math.round(unitPrice * exchange + logistics);
      const computedWholesale = Math.round((computedCost * marginRatio) / 1000) * 1000;

      const excluded = (p.등급할인제외 || '').split(',').map(s => s.trim().toUpperCase());
      return {
        ...p,
        환율: exchange,
        물류비: logistics,
        원가: computedCost,
        도매가: computedWholesale,
        S등급가: excluded.includes('S') ? computedWholesale : Math.round((computedWholesale * sRatio) / 100) * 100,
        A등급: excluded.includes('A') ? computedWholesale : Math.round((computedWholesale * aRatio) / 100) * 100,
        B등급: excluded.includes('B') ? computedWholesale : Math.round((computedWholesale * bRatio) / 100) * 100,
        C등급: excluded.includes('C') ? computedWholesale : Math.round((computedWholesale * cRatio) / 100) * 100,
        W등급가: excluded.includes('W') ? computedWholesale : Math.round((computedWholesale * wRatio) / 100) * 100,
      };
    });

    setProducts(updated);
    alert(`선택한 ${targets.length}개의 상품에 글로벌 설정이 일괄 적용되었습니다.
최종 저장을 원하시면 상단의 [저장] 버튼을 눌러주세요.`);
  };

  // 고유한 동기화시간 목록 추출 (내림차순 정렬)
  const syncTimeOptions = useMemo(() => {
    const times = products
      .map(p => p.동기화시간)
      .filter((t): t is string => !!t);
    return Array.from(new Set(times)).sort((a, b) => b.localeCompare(a));
  }, [products]);

  // 필터 및 검색 처리된 상품 배열 (6단 고급 필터 연동 - 다중 선택 + 달력 범위 + 동기화시간 + AND 검색, 원본 인덱스 globalIdx 포함)
  const filteredBeforeSort = useMemo(() => {
    return products
      .map((product, globalIdx) => ({ product, globalIdx }))
      .filter(({ product: p }) => {
        // 신규 등록 대기 탭인 경우, 신규등록대기 플래그가 true인 상품만 거름
        if (activeTab === 'new' && !p.신규등록대기) return false;

        // 1. 일반 검색어 매칭
        const matchesSearch = 
          (p.상품명 || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
          (p.임시코드 || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.중국코드 || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        if (!matchesSearch) return false;

        // 2. 주차 다중선택 매칭 (OR)
        if (selectedWeeks.length > 0) {
          if (!selectedWeeks.includes(p.주차)) return false;
        }

        // 3. 카테고리 다중선택 매칭 (OR)
        if (selectedCategories.length > 0) {
          const pCats = (p.카테고리 || '').split(',').map(s => s.trim().toLowerCase());
          const hasMatch = selectedCategories.some(cat => pCats.includes(cat.toLowerCase()));
          if (!hasMatch) return false;
        }

        // 4. 아이템 다중선택 매칭 (OR)
        if (selectedItems.length > 0) {
          if (!selectedItems.includes(p.아이템)) return false;
        }

        // 5. 노출여부 다중선택 매칭 (OR)
        if (selectedExposures.length > 0) {
          const pExposureLower = (p.노출여부 || '').toLowerCase().trim();
          const pExposures = (p.노출여부 || '').split(',').map(s => s.trim().toLowerCase());
          
          const hasMatch = selectedExposures.some(exp => {
            const expLower = exp.toLowerCase().trim();
            // 'b,c' 혹은 'b, c' 형태와 그대로 일치하는지 먼저 검사
            if (expLower === 'b,c' || expLower === 'b, c') {
              return pExposureLower === 'b,c' || pExposureLower === 'b, c';
            }
            // 쉼표로 쪼개진 단위 항목 중 일치하는 것이 있는지 매칭 (y, n, a, b, c, 또는 개별 거래처명)
            return pExposures.includes(expLower);
          });
          if (!hasMatch) return false;
        }

        // 6. 노출날짜 달력 범위 매칭 (AND)
        if (startDateFilter || endDateFilter) {
          const pDate = parseProductDate(p.업로드일자);
          if (!pDate) return false; 

          if (startDateFilter) {
            const start = new Date(startDateFilter);
            start.setHours(0, 0, 0, 0);
            if (pDate < start) return false;
          }

          if (endDateFilter) {
            const end = new Date(endDateFilter);
            end.setHours(23, 59, 59, 999);
            if (pDate > end) return false;
          }
        }

        // 7. 동기화시간 단일 매칭 (AND)
        if (selectedSyncTime) {
          if (p.동기화시간 !== selectedSyncTime) return false;
        }

        return true;
      });
  }, [products, activeTab, searchTerm, selectedWeeks, selectedCategories, selectedItems, selectedExposures, startDateFilter, endDateFilter, selectedSyncTime]);

  const filtered = useMemo(() => {
    if (!sortField) return filteredBeforeSort;

    return [...filteredBeforeSort].sort((a, b) => {
      let valA = a.product[sortField as keyof Product];
      let valB = b.product[sortField as keyof Product];

      // 1. 노출날짜(업로드일자) 특수 정렬 처리
      if (sortField === '업로드일자') {
        const dateA = parseProductDate(String(valA || ''));
        const dateB = parseProductDate(String(valB || ''));
        if (dateA && dateB) {
          return sortDirection === 'asc' 
            ? dateA.getTime() - dateB.getTime() 
            : dateB.getTime() - dateA.getTime();
        }
        // 날짜 파싱이 안 되는 경우는 뒤로 보냄
        if (dateA && !dateB) return sortDirection === 'asc' ? -1 : 1;
        if (!dateA && dateB) return sortDirection === 'asc' ? 1 : -1;
      }

      // 2. 숫자형 정렬 처리
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      // 3. 문자열 자연스러운 정렬 처리 (Natural Sort with English-First rule)
      const strA = valA === undefined || valA === null ? '' : String(valA).trim();
      const strB = valB === undefined || valB === null ? '' : String(valB).trim();

      // 빈 값 처리: 빈값은 항상 맨 뒤로 보냄
      if (strA === '' && strB !== '') return 1;
      if (strA !== '' && strB === '') return -1;
      if (strA === '' && strB === '') return 0;

      // 첫 글자가 한글인지 여부 판단 (유니코드 범위 사용 - 완성형 및 호환자모 범위)
      const isKoreanStart = (str: string) => {
        if (!str) return false;
        const code = str.charCodeAt(0);
        return (code >= 0xAC00 && code <= 0xD7A3) || (code >= 0x3130 && code <= 0x318F);
      };

      const isA_Kor = isKoreanStart(strA);
      const isB_Kor = isKoreanStart(strB);

      let compareResult = 0;
      if (isA_Kor !== isB_Kor) {
        // 서로 다른 그룹일 때: 영문/숫자(한글 아님)를 우선 배치
        // 오름차순일 때: 한글이 뒤로(+1), 영문이 앞으로(-1)
        compareResult = isA_Kor ? 1 : -1;
      } else {
        // 같은 그룹일 때: Intl.Collator 로 자연스럽게 정렬
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        compareResult = collator.compare(strA, strB);
      }
      
      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [filteredBeforeSort, sortField, sortDirection]);

  const displayProducts = useMemo(() => {
    if (!sortField) {
      return [...filtered].reverse();
    }
    return filtered;
  }, [filtered, sortField]);


  // 필터 전체 초기화 로직
  const handleResetAllFilters = () => {
    setSearchTerm('');
    setSelectedWeeks([]);
    setSelectedSyncTime('');
    setSelectedCategories([]);
    setSelectedItems([]);
    setSelectedExposures([]);
    setStartDateFilter('');
    setEndDateFilter('');
    // 정렬 상태 초기화
    setSortField('');
    setSortDirection('asc');
  };

  // 탭 이동 등으로 상품관리 마스터 진입/복귀 시 모든 필터 및 정렬 초기화
  useEffect(() => {
    if (pathname === '/admin/products') {
      handleResetAllFilters();
    }
  }, [pathname]);

  // 체크박스 선택 로직
  const handleToggleSelect = (key: string) => {
    setSelectedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // 체크박스 전체 선택/해제 로직
  const isAllSelected = filtered.length > 0 && filtered.every(({ product: p }) => {
    const key = p.임시코드 || p.상품명;
    return selectedKeys.includes(key);
  });

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const currentKeys = filtered.map(({ product: p }) => p.임시코드 || p.상품명);
      setSelectedKeys(prev => prev.filter(k => !currentKeys.includes(k)));
    } else {
      const currentKeys = filtered.map(({ product: p }) => p.임시코드 || p.상품명);
      setSelectedKeys(prev => {
        const next = [...prev];
        currentKeys.forEach(k => {
          if (!next.includes(k)) next.push(k);
        });
        return next;
      });
    }
  };

  // 인증 대기 또는 미인증 시 화면 노출 차단 (Redirect 처리 대기)
  if (loadingAuth || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-center space-y-2 select-none">
          <Lock className="w-8 h-8 text-neutral-400 animate-pulse mx-auto" />
          <p className="text-xs text-neutral-400 font-mono tracking-widest uppercase">Verifying Admin Session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      
      {/* 상단 액션 바 */}
      <header className="border-b border-neutral-200 py-4 px-6 md:px-12 flex justify-between items-center text-xs tracking-wider font-light text-neutral-500 select-none">
        <div className="flex items-center space-x-2 cursor-pointer hover:text-black transition-colors" onClick={() => router.push('/')}>
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono uppercase tracking-widest text-[10px]">Back to Shop</span>
        </div>
        
        {/* 상단 버튼들 */}
        <div className="flex items-center space-x-4">
          <button 
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center space-x-1.5 hover:text-black transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? '동기화 중...' : '신규 폴더 동기화'}</span>
          </button>
          
          <button 
            onClick={() => handleImport(false)}
            className="flex items-center space-x-1.5 hover:text-black transition-colors border border-neutral-200 px-3 py-1.5"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>엑셀 불러오기</span>
          </button>

          <button 
            onClick={handleExportSelected}
            className="flex items-center space-x-1.5 hover:text-black transition-colors border border-neutral-200 px-3 py-1.5"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>엑셀 내보내기 ({selectedKeys.length})</span>
          </button>

          <button 
            onClick={handleOpenSettingsModal}
            className="flex items-center space-x-1.5 hover:text-black transition-colors border border-neutral-200 px-3.5 py-1.5 bg-white font-medium"
          >
            <Settings className="w-3.5 h-3.5 text-neutral-600" />
            <span>카테고리/포인트 관리</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 md:p-12 space-y-6">
        
        {/* 어드민 대시보드 공용 탭 */}
        <div className="flex border-b border-neutral-200 select-none mb-6">
          <button
            onClick={() => router.push('/admin/products')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-black text-black font-semibold cursor-pointer"
          >
            상품관리 마스터 (Products)
          </button>
          <button
            onClick={() => router.push('/admin/orders')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            주문관리 마스터 (Orders)
          </button>
          <button
            onClick={() => router.push('/admin/ledger')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            정산 마스터 (Ledger)
          </button>
          <button
            onClick={() => router.push('/admin/customers')}
            className="py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 border-transparent text-neutral-400 hover:text-neutral-600 font-semibold cursor-pointer"
          >
            거래처 마스터 (Customers)
          </button>
        </div>
        
        {/* 페이지 타이틀 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
          <div className="space-y-1">
            <h1 className="text-xl font-mono tracking-widest uppercase font-semibold text-black">PRODUCT MANAGEMENT MASTER</h1>
            <p className="text-xs text-neutral-400 font-light leading-relaxed">
              상품관리 마스터 데이터베이스를 관리합니다. 스페이스바를 누르면 약어와 일치하는 항목이 선택/태깅됩니다.
            </p>
          </div>
        </div>

        {/* 탭 네비게이션 (전체 상품 vs 신규 등록 대기) */}
        <div className="flex border-b border-neutral-200 select-none mb-1">
          <button
            onClick={() => setActiveTab('all')}
            className={`py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 transition-all font-semibold ${
              activeTab === 'all'
                ? 'border-black text-black border-b-2'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
          >
            전체 상품 ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`py-3 px-6 text-xs font-mono tracking-wider uppercase border-b-2 transition-all font-semibold flex items-center gap-1.5 ${
              activeTab === 'new'
                ? 'border-black text-black border-b-2'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
          >
            <span>신규 등록 대기</span>
            <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
              products.filter(p => p.신규등록대기).length > 0
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-neutral-200 text-neutral-500'
            }`}>
              {products.filter(p => p.신규등록대기).length}
            </span>
          </button>
        </div>

        {/* 필터 제어 영역 (고급 6단 필터링 탑재 - 다중 선택 + 달력 + 동기화 회차 연동) */}
        <div className="bg-neutral-50 p-4 border border-neutral-100 select-none space-y-3">
          <div className="flex gap-2">
            <button
              onClick={handleOpenAddProductModal}
              className="bg-black hover:bg-neutral-900 text-white text-xs font-mono px-4 py-2 flex items-center gap-1.5 transition-colors select-none rounded-none shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>상품 등록</span>
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
              <input 
                type="text" 
                placeholder="상품명, 임시코드, 중국코드 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs font-mono rounded-none"
              />
            </div>
            {(searchTerm || selectedWeeks.length > 0 || selectedSyncTime || selectedCategories.length > 0 || selectedItems.length > 0 || selectedExposures.length > 0 || startDateFilter || endDateFilter) && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-mono px-4 py-2 flex items-center gap-1.5 transition-colors select-none rounded-none shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>필터 전체 초기화</span>
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {/* 1. 주차 필터 (다중 선택) */}
            <div>
              <MultiSelectFilter 
                label="주차"
                options={uniqueWeeks}
                selectedValues={selectedWeeks}
                onChange={setSelectedWeeks}
              />
            </div>

            {/* 2. 카테고리 필터 (다중 선택) */}
            <div>
              <MultiSelectFilter 
                label="카테고리"
                options={uniqueCategoryOptions}
                selectedValues={selectedCategories}
                onChange={setSelectedCategories}
              />
            </div>

            {/* 3. 아이템 필터 (다중 선택) */}
            <div>
              <MultiSelectFilter 
                label="아이템"
                options={uniqueItemOptions}
                selectedValues={selectedItems}
                onChange={setSelectedItems}
              />
            </div>

            {/* 4. 노출여부 필터 (다중 선택 - y, n, 등급별, 개별 거래처 연동) */}
            <div>
              <MultiSelectFilter 
                label="노출여부"
                options={['y', 'n', 'a', 'b', 'c', 'b,c', ...uniqueExposureClients]}
                selectedValues={selectedExposures}
                onChange={setSelectedExposures}
              />
            </div>

            {/* 5. 동기화 회차 필터 (단일 선택) */}
            <div>
              <div className="relative">
                <label className="block text-[10px] text-neutral-450 font-bold uppercase tracking-wider mb-1 font-sans">
                  동기화 회차
                </label>
                <select
                  value={selectedSyncTime}
                  onChange={(e) => setSelectedSyncTime(e.target.value)}
                  className="w-full px-2 py-1.5 border border-neutral-200 bg-white text-xs font-mono focus:outline-none focus:border-black rounded-none cursor-pointer appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2050/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                    backgroundSize: '12px',
                    paddingRight: '24px'
                  }}
                >
                  <option value="">전체 회차</option>
                  {syncTimeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 6. 노출날짜 필터 (커스텀 달력 기간 선택 - 2열 차지) */}
            <div className="md:col-span-2">
              <DateRangeFilter
                label="노출날짜 범위"
                startDate={startDateFilter}
                endDate={endDateFilter}
                onChange={(start, end) => {
                  setStartDateFilter(start);
                  setEndDateFilter(end);
                }}
              />
            </div>
          </div>
        </div>

        {/* [저장] [삭제] 분류행 바로 위 버튼 배치 영역 - 왼쪽 처음으로 배치 */}
        <div className="flex justify-between items-center bg-neutral-50 p-3.5 border-x border-t border-neutral-200 select-none">
          <div className="flex items-center space-x-2">
            {/* 0. AI 자동입력 버튼 */}
            <button
              onClick={handleAIAutoFill}
              disabled={aiLoading}
              className="flex items-center space-x-1.5 bg-neutral-900 text-white px-5 py-2 text-xs font-semibold hover:bg-black border border-neutral-900 transition-colors uppercase tracking-wider"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>AI 자동입력</span>
            </button>
            {/* 1. 저장 버튼 */}
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center space-x-1.5 bg-black text-white px-5 py-2 text-xs font-semibold hover:bg-neutral-850 transition-colors uppercase tracking-wider"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? '저장 중...' : '저장'}</span>
            </button>
            {/* 2. 삭제 버튼 */}
            <button
              onClick={handleBulkDeletePrompt}
              disabled={selectedKeys.length === 0}
              className={`flex items-center space-x-1.5 px-5 py-2 text-xs font-semibold border transition-colors ${selectedKeys.length === 0 ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>삭제</span>
            </button>
            {/* 3. 일괄 변경 버튼 */}
            <button
              onClick={() => setIsBulkUpdateModalOpen(true)}
              disabled={selectedKeys.length === 0}
              className={`flex items-center space-x-1.5 px-5 py-2 text-xs font-semibold border transition-colors ${selectedKeys.length === 0 ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'}`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>선택 일괄 변경 ({selectedKeys.length})</span>
            </button>
          </div>
          
          <div className="text-[11px] text-neutral-500 font-mono tracking-wide">
            선택된 상품: <strong className="text-black font-semibold text-xs">{selectedKeys.length}</strong>개
          </div>
        </div>

        {/* 글로벌 설정 일괄 입력 및 계산 바 */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-50 p-3 border-x border-t border-neutral-200 select-none border-b">
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 border-r border-neutral-200 pr-3 flex items-center gap-1">
              <Calculator className="w-3.5 h-3.5 text-neutral-700" />
              <span>글로벌 설정 (일괄 적용)</span>
            </div>

            {/* 환율 */}
            <div className="flex items-center space-x-1">
              <span className="text-[10px] text-neutral-400 font-bold">환율:</span>
              <input 
                type="number"
                value={globalSettings.exchange}
                onChange={(e) => setGlobalSettings({ ...globalSettings, exchange: parseFloat(e.target.value) || 0 })}
                className="w-20 px-2 py-1 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs text-right font-mono rounded-none"
              />
            </div>

            {/* 물류비 */}
            <div className="flex items-center space-x-1">
              <span className="text-[10px] text-neutral-400 font-bold">물류비:</span>
              <input 
                type="number"
                value={globalSettings.logistics}
                onChange={(e) => setGlobalSettings({ ...globalSettings, logistics: parseInt(e.target.value) || 0 })}
                className="w-24 px-2 py-1 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs text-right font-mono rounded-none"
              />
            </div>

            {/* 마진율 */}
            <div className="flex items-center space-x-1">
              <span className="text-[10px] text-neutral-400 font-bold">마진율:</span>
              <input 
                type="number"
                step="0.01"
                value={globalSettings.margin}
                onChange={(e) => setGlobalSettings({ ...globalSettings, margin: parseFloat(e.target.value) || 0 })}
                className="w-20 px-2 py-1 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs text-right font-mono rounded-none"
              />
            </div>

            {/* 등급별 비율 */}
            <div className="flex items-center space-x-3 border-l border-neutral-200 pl-3">
              <div className="flex items-center space-x-1">
                <span className="text-[10px] text-neutral-400 font-bold">S:</span>
                <input 
                  type="number"
                  step="0.01"
                  value={globalSettings.sRatio}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, sRatio: parseFloat(e.target.value) || 0 })}
                  className="w-16 px-1.5 py-1 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs text-right font-mono rounded-none"
                />
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-[10px] text-neutral-400 font-bold">A:</span>
                <input 
                  type="number"
                  step="0.01"
                  value={globalSettings.aRatio}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, aRatio: parseFloat(e.target.value) || 0 })}
                  className="w-16 px-1.5 py-1 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs text-right font-mono rounded-none"
                />
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-[10px] text-neutral-400 font-bold">B:</span>
                <input 
                  type="number"
                  step="0.01"
                  value={globalSettings.bRatio}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, bRatio: parseFloat(e.target.value) || 0 })}
                  className="w-16 px-1.5 py-1 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs text-right font-mono rounded-none"
                />
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-[10px] text-neutral-400 font-bold">C:</span>
                <input 
                  type="number"
                  step="0.01"
                  value={globalSettings.cRatio}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, cRatio: parseFloat(e.target.value) || 0 })}
                  className="w-16 px-1.5 py-1 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs text-right font-mono rounded-none"
                />
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-[10px] text-neutral-400 font-bold">W:</span>
                <input 
                  type="number"
                  step="0.01"
                  value={globalSettings.wRatio}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, wRatio: parseFloat(e.target.value) || 0 })}
                  className="w-16 px-1.5 py-1 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs text-right font-mono rounded-none"
                />
              </div>
            </div>

            {/* 메인 카테고리 노출 여부 */}
            <div className="flex items-center space-x-1.5 border-l border-neutral-200 pl-3">
              <input
                type="checkbox"
                id="showCategoriesOnMain"
                checked={globalSettings.showCategoriesOnMain ?? true}
                onChange={(e) => setGlobalSettings({ ...globalSettings, showCategoriesOnMain: e.target.checked })}
                className="w-3.5 h-3.5 text-neutral-800 border-neutral-300 rounded focus:ring-neutral-500 cursor-pointer"
              />
              <label htmlFor="showCategoriesOnMain" className="text-[10px] text-neutral-600 font-bold select-none cursor-pointer">
                메인 카테고리 노출
              </label>
            </div>

            {/* 적용 버튼 */}
            <button
              onClick={handleApplyGlobalSettings}
              className="ml-2 bg-neutral-800 text-white px-3.5 py-1 text-[11px] font-semibold hover:bg-black transition-colors uppercase tracking-wider rounded-none"
            >
              일괄 적용
            </button>

            {/* 저장 버튼 (기존 설정 저장 옆에서 일괄 적용 옆으로 이동) */}
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="ml-1 bg-black text-white px-3.5 py-1 text-[11px] font-semibold hover:bg-neutral-850 transition-colors uppercase tracking-wider rounded-none"
            >
              저장
            </button>
          </div>
          
          {/* 오른쪽 정렬 영역: 설명글, 설정 저장, 컬럼 표시 설정 */}
          <div className="flex flex-wrap items-center gap-3 ml-auto">
            <span className="text-[10px] text-neutral-400 font-light italic">
              * '일괄 적용' 후 상품과 함께 저장하려면 상단 [저장]을, 설정값만 저장하려면 [설정 저장]을 누르세요.
            </span>

            {/* 설정 저장 버튼 */}
            <button
              onClick={handleSaveGlobalSettings}
              className="bg-blue-600 text-white px-3.5 py-1 text-[11px] font-semibold hover:bg-blue-700 transition-colors uppercase tracking-wider rounded-none"
            >
              설정 저장
            </button>

            {/* 컬럼 표시 설정 드롭다운 */}
            <div className="relative inline-block text-left" ref={colSelectorRef}>
              <button
                type="button"
                onClick={() => setShowColSelector(!showColSelector)}
                className="border border-neutral-300 hover:border-black text-neutral-600 hover:text-black px-3.5 py-1 text-[11px] font-semibold transition-colors flex items-center gap-1.5 rounded-none"
              >
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                <span>컬럼 표시 설정</span>
              </button>
              {showColSelector && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-neutral-200 shadow-xl z-50 p-3 select-none text-[11px] space-y-2 max-h-80 overflow-y-auto rounded-none">
                  <span className="text-[9px] text-neutral-400 block pb-1 border-b border-neutral-100 font-semibold uppercase">표시할 컬럼 선택</span>
                  <div className="space-y-1">
                    {ALL_COLUMNS.filter(c => c.canHide).map(col => {
                      const isVisible = !hiddenColumns.includes(col.key);
                      return (
                        <label 
                          key={col.key} 
                          className="flex items-center space-x-2 py-1 px-1.5 cursor-pointer hover:bg-neutral-50 text-neutral-700 text-left"
                        >
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => {
                              if (isVisible) {
                                setHiddenColumns(prev => [...prev, col.key]);
                              } else {
                                setHiddenColumns(prev => prev.filter(k => k !== col.key));
                              }
                            }}
                            className="rounded-none border-neutral-300 focus:ring-0 text-black w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="truncate">{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 그리드 뷰 */}
        {loading ? (
          <div className="h-96 flex items-center justify-center text-xs text-neutral-400 font-mono tracking-widest uppercase">
            Loading products from database...
          </div>
        ) : (
          <>
            {/* 상단 동기화 스크롤바 (글로벌 설정과 테이블 헤더 사이) */}
            <div 
              ref={topScrollRef} 
              onScroll={handleTopScroll}
              className="overflow-x-auto border-x border-t border-neutral-200 bg-white"
              style={{ scrollbarWidth: 'thin' }}
            >
              <div className="h-2" style={{ minWidth: `${totalTableWidth}px` }}></div>
            </div>

            <div 
              ref={tableContainerRef}
              onScroll={handleTableScroll}
              className="border border-neutral-200 overflow-x-auto overflow-y-auto max-h-[68vh] shadow-sm bg-white relative"
            >
            <table className="w-full border-collapse text-left text-xs font-mono" style={{ minWidth: `${totalTableWidth}px`, tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-[10px] text-neutral-500 tracking-wider select-none uppercase">
                  {orderedColumns.map(col => {
                    if (hiddenColumns.includes(col.key)) return null;

                    const width = columnWidths[col.key] || col.defaultWidth;
                    const isSticky = col.isSticky;
                    const leftOffset = isSticky ? getStickyLeft(col.key) : undefined;

                    return (
                      <th
                        key={col.key}
                        draggable={col.key !== '체크박스'}
                        onDragStart={(e) => {
                          if (col.key === '체크박스') return;
                          setDraggedColKey(col.key);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          if (col.key === '체크박스' || draggedColKey === '체크박스' || draggedColKey === col.key) return;
                          e.preventDefault();
                        }}
                        onDragEnter={(e) => {
                          if (col.key === '체크박스' || draggedColKey === '체크박스' || draggedColKey === col.key) return;
                          setDragOverColKey(col.key);
                        }}
                        onDragLeave={() => {
                          setDragOverColKey(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (col.key === '체크박스' || draggedColKey === '체크박스' || !draggedColKey || draggedColKey === col.key) return;
                          
                          const fromIndex = columnOrder.indexOf(draggedColKey);
                          const toIndex = columnOrder.indexOf(col.key);
                          if (fromIndex !== -1 && toIndex !== -1) {
                            const newOrder = [...columnOrder];
                            newOrder.splice(fromIndex, 1);
                            newOrder.splice(toIndex, 0, draggedColKey);
                            setColumnOrder(newOrder);
                          }
                          setDraggedColKey(null);
                          setDragOverColKey(null);
                        }}
                        onDragEnd={() => {
                          setDraggedColKey(null);
                          setDragOverColKey(null);
                        }}
                        className={`py-3 px-3 text-center border-r border-neutral-200 select-none relative transition-colors duration-200 ${
                          col.key !== '체크박스' ? 'cursor-move' : ''
                        } ${
                          col.key === '상품명' ? 'border-r-2 border-neutral-300' : ''
                        } ${
                          col.key === dragOverColKey ? 'bg-neutral-100 border-l-4 border-l-black' : ''
                        } ${
                          col.key === draggedColKey ? 'opacity-40' : ''
                        }`}
                        style={{
                          position: 'sticky',
                          top: 0,
                          left: leftOffset,
                          zIndex: isSticky ? 30 : 20,
                          width: `${width}px`,
                          minWidth: `${width}px`,
                          maxWidth: `${width}px`,
                          backgroundColor: '#f9fafb'
                        }}
                      >
                        {col.key === '체크박스' ? (
                          <input 
                            type="checkbox" 
                            checked={isAllSelected}
                            onChange={handleToggleSelectAll}
                            className="rounded-none border-neutral-300 focus:ring-0 text-black w-3.5 h-3.5 cursor-pointer mx-auto block"
                          />
                        ) : (
                          <div className="flex items-center justify-center space-x-1 select-none">
                            <span>{col.label}</span>
                            {SORTABLE_COLUMNS.includes(col.key) && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSort(col.key);
                                }}
                                className="focus:outline-none p-0.5 hover:bg-neutral-200 rounded text-[9px] inline-flex items-center text-neutral-400 hover:text-black cursor-pointer ml-1"
                                title={`${col.label} 정렬`}
                              >
                                {sortField === col.key ? (
                                  sortDirection === 'asc' ? '▲' : '▼'
                                ) : (
                                  '↕'
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Resize Handle */}
                        {col.key !== '체크박스' && (
                          <div
                            onMouseDown={(e) => handleResizeStart(col.key, e)}
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-neutral-300 active:bg-neutral-500 z-10"
                            style={{ userSelect: 'none' }}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {displayProducts.map(({ product, globalIdx }, relativeIdx) => {
                  const pKey = product.임시코드 || product.상품명;

                  return (
                    <tr key={`${pKey}-${globalIdx}`} className="hover:bg-neutral-50/50 group">
                      {orderedColumns.map(col => {
                        if (hiddenColumns.includes(col.key)) return null;

                        const width = columnWidths[col.key] || col.defaultWidth;
                        const isSticky = col.isSticky;
                        const leftOffset = isSticky ? getStickyLeft(col.key) : undefined;

                        const cellStyle: React.CSSProperties = {
                          position: isSticky ? 'sticky' : undefined,
                          left: leftOffset,
                          zIndex: isSticky ? 10 : undefined,
                          backgroundColor: '#ffffff',
                          width: `${width}px`,
                          minWidth: `${width}px`,
                          maxWidth: `${width}px`,
                          textAlign: 'center'
                        };

                        return (
                          <td
                            key={col.key}
                            className={`py-2 px-2 border-r border-neutral-200 ${
                              col.key === '상품명' ? 'border-r-2 border-neutral-300' : ''
                            } ${
                              col.key === draggedColKey ? 'opacity-30 bg-neutral-50' : ''
                            } ${
                              col.key === dragOverColKey ? 'bg-neutral-50 border-l-4 border-l-black' : ''
                            }`}
                            style={cellStyle}
                          >
                            {renderCellContent(col.key, product, globalIdx, relativeIdx)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </main>

      {/* 대표 이미지 클릭 시 띄울 고화질 모달 팝업 */}
      {enlargedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-zoom-out p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden bg-transparent select-none">
            <img 
              src={enlargedImage} 
              alt="Enlarged product preview"
              className="max-w-full max-h-[90vh] object-contain shadow-2xl border border-neutral-800"
            />
            <div className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 px-3 py-1 font-mono text-[10px] tracking-widest uppercase">
              Click anywhere to close
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 불러오기 시 기존 데이터 충돌(덮어쓰기 여부) 컨펌 모달 */}
      {importConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-neutral-200 p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="inline-flex p-3 bg-rose-50 rounded-full border border-rose-100 mb-1">
              <AlertCircle className="w-6 h-6 text-rose-600" />
            </div>
            <h2 className="text-sm font-mono tracking-widest font-semibold text-black uppercase">EXCEL IMPORT CONFLICT</h2>
            <p className="text-xs text-neutral-600 leading-relaxed">
              기존 상품 데이터베이스에 중복되는 상품이 {importConflictCount}건 감지되었습니다. <br />
              <strong className="text-black">모두 덮어써서 수정하시겠습니까?</strong>
            </p>
            <div className="flex space-x-2 pt-2">
              <button 
                onClick={() => setImportConfirmModal(false)}
                className="flex-1 border border-neutral-200 text-neutral-500 text-[11px] tracking-wider py-2.5 font-semibold hover:bg-neutral-50"
              >
                취소 (덮어쓰지 않음)
              </button>
              <button 
                onClick={() => handleImport(true)}
                className="flex-1 bg-black text-white text-[11px] tracking-wider py-2.5 font-semibold hover:bg-neutral-800"
              >
                예 (덮어쓰기 수정)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상품 일괄 삭제 확인 비밀번호 입력 모달 */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-neutral-200 p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="inline-flex p-3 bg-rose-50 rounded-full border border-rose-100 mb-1">
              <AlertCircle className="w-6 h-6 text-rose-650" />
            </div>
            <h2 className="text-sm font-mono tracking-widest font-semibold text-black uppercase">DELETE SELECTED PRODUCTS</h2>
            <p className="text-xs text-neutral-550 leading-relaxed">
              선택한 <strong className="text-black">{selectedKeys.length}개</strong>의 상품 데이터를 정말 삭제하시겠습니까? <br />
              삭제를 확인하려면 비밀번호를 입력해 주세요.
            </p>
            <input 
              type="password" 
              placeholder="••••"
              value={deleteConfirmPassword}
              onChange={(e) => setDeleteConfirmPassword(e.target.value)}
              className="w-full text-center tracking-[0.2em] font-mono text-sm py-2 border border-neutral-200 focus:outline-none focus:border-black bg-white rounded-none"
              autoFocus
            />
            {deleteError && <p className="text-[10px] text-rose-500 font-semibold">{deleteError}</p>}
            <div className="flex space-x-2 pt-2">
              <button 
                onClick={() => {
                  setIsBulkDeleteModalOpen(false);
                  setDeleteConfirmPassword('');
                  setDeleteError('');
                }}
                className="flex-1 border border-neutral-200 text-neutral-500 text-[11px] tracking-wider py-2.5 font-semibold hover:bg-neutral-50"
              >
                취소
              </button>
              <button 
                onClick={handleBulkDeleteConfirm}
                className="flex-1 bg-rose-600 text-white text-[11px] tracking-wider py-2.5 font-semibold hover:bg-rose-700"
              >
                삭제 진행 (확인)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상품 정보 일괄 변경 모달 다이얼로그 */}
      {isBulkUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 select-none overflow-y-auto py-8">
          <div className="bg-white border border-neutral-200 shadow-2xl p-6 max-w-lg w-full rounded-none space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
              <div className="p-2 bg-blue-50 rounded-full border border-blue-200 text-blue-600 shrink-0">
                <Save className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-[14px] font-bold text-neutral-900">선택 상품 정보 일괄 변경</h3>
                <p className="text-[11px] text-neutral-500 font-light leading-relaxed">
                  선택된 <strong className="text-blue-600 font-bold">{selectedKeys.length}개</strong>의 상품 속성을 한 번에 일괄 수정합니다.<br/>
                  수정할 필드 왼쪽의 체크박스를 체크하고 값을 입력해 주세요.
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs max-h-[50vh] overflow-y-auto pr-1">
              
              {/* 1. 카테고리 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyCategory"
                  checked={bulkFields.applyCategory}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyCategory: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyCategory" className="w-24 font-semibold text-neutral-700 cursor-pointer">카테고리</label>
                <select
                  value={bulkFields.categoryValue}
                  disabled={!bulkFields.applyCategory}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, categoryValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- 카테고리 선택 --</option>
                  {categories.map(c => (
                    <option key={c.카테고리} value={c.카테고리}>{c.카테고리}</option>
                  ))}
                </select>
              </div>

              {/* 2. 노출여부 */}
              <div className="flex items-start gap-3">
                <div className="flex items-center h-5">
                  <input 
                    type="checkbox" 
                    id="bulk_applyExposure"
                    checked={bulkFields.applyExposure}
                    onChange={(e) => setBulkFields(prev => ({ ...prev, applyExposure: e.target.checked }))}
                    className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                  />
                </div>
                <label htmlFor="bulk_applyExposure" className="w-24 font-semibold text-neutral-700 cursor-pointer pt-0.5">노출 여부</label>
                <div className="flex-1">
                  {bulkFields.applyExposure ? (
                    <ExposureInput 
                      exposure={bulkFields.exposureValue}
                      customers={customersList}
                      onChange={(newVal) => setBulkFields(prev => ({ ...prev, exposureValue: newVal }))}
                    />
                  ) : (
                    <div className="py-1 px-1.5 border border-neutral-200 bg-neutral-100 text-neutral-400 text-xs select-none">
                      노출여부 편집 비활성화됨
                    </div>
                  )}
                </div>
              </div>

              {/* 2-2. 노출제외 */}
              <div className="flex items-start gap-3">
                <div className="flex items-center h-5">
                  <input 
                    type="checkbox" 
                    id="bulk_applyExclude"
                    checked={bulkFields.applyExclude}
                    onChange={(e) => setBulkFields(prev => ({ ...prev, applyExclude: e.target.checked }))}
                    className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                  />
                </div>
                <label htmlFor="bulk_applyExclude" className="w-24 font-semibold text-neutral-700 cursor-pointer pt-0.5">노출 제외</label>
                <div className="flex-1">
                  {bulkFields.applyExclude ? (
                    <ExcludeInput 
                      exclude={bulkFields.excludeValue}
                      customers={customersList}
                      onChange={(newVal) => setBulkFields(prev => ({ ...prev, excludeValue: newVal }))}
                    />
                  ) : (
                    <div className="py-1 px-1.5 border border-neutral-200 bg-neutral-100 text-neutral-400 text-xs select-none">
                      노출제외 편집 비활성화됨
                    </div>
                  )}
                </div>
              </div>


              {/* 2-3. 등급할인 제외 */}
              <div className="flex items-start gap-3">
                <div className="flex items-center h-5">
                  <input 
                    type="checkbox" 
                    id="bulk_applyGradeExclude"
                    checked={bulkFields.applyGradeExclude}
                    onChange={(e) => setBulkFields(prev => ({ ...prev, applyGradeExclude: e.target.checked }))}
                    className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                  />
                </div>
                <label htmlFor="bulk_applyGradeExclude" className="w-24 font-semibold text-neutral-700 cursor-pointer pt-0.5">등급할인 제외</label>
                <div className="flex-1">
                  {bulkFields.applyGradeExclude ? (
                    <GradeExcludeInput 
                      value={bulkFields.gradeExcludeValue}
                      onChange={(newVal) => setBulkFields(prev => ({ ...prev, gradeExcludeValue: newVal }))}
                    />
                  ) : (
                    <div className="py-1 px-1.5 border border-neutral-200 bg-neutral-100 text-neutral-400 text-xs select-none text-center">
                      등급할인제외 편집 비활성화됨
                    </div>
                  )}
                </div>
              </div>

              {/* 3. 주차 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyWeek"
                  checked={bulkFields.applyWeek}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyWeek: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyWeek" className="w-24 font-semibold text-neutral-700 cursor-pointer">주차</label>
                <input 
                  type="text"
                  list="bulk-weeks-options"
                  value={bulkFields.weekValue}
                  disabled={!bulkFields.applyWeek}
                  placeholder="주차 입력 (예: 5/20)"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, weekValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed font-mono"
                />
                <datalist id="bulk-weeks-options">
                  {uniqueWeeks.map(w => (
                    <option key={w} value={w} />
                  ))}
                </datalist>
              </div>

              {/* 3-2. 시즌 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applySeason"
                  checked={bulkFields.applySeason}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applySeason: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applySeason" className="w-24 font-semibold text-neutral-700 cursor-pointer">시즌</label>
                <input 
                  type="text"
                  list="bulk-season-options"
                  value={bulkFields.seasonValue}
                  disabled={!bulkFields.applySeason}
                  placeholder="시즌 선택 또는 직접 입력"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, seasonValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                />
                <datalist id="bulk-season-options">
                  {(globalSettings.seasonOptions || ['26SM', '26FA', '26WT']).map(opt => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>

              {/* 4. 아이템 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyItem"
                  checked={bulkFields.applyItem}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyItem: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyItem" className="w-24 font-semibold text-neutral-700 cursor-pointer">아이템</label>
                <select
                  value={bulkFields.itemValue}
                  disabled={!bulkFields.applyItem}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, itemValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                >
                  <option value="">-- 아이템 선택 --</option>
                  {itemsList.map(i => (
                    <option key={i.아이템} value={i.아이템}>{i.아이템}</option>
                  ))}
                </select>
              </div>

              {/* 5. 사이즈 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applySize"
                  checked={bulkFields.applySize}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applySize: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applySize" className="w-24 font-semibold text-neutral-700 cursor-pointer">사이즈</label>
                <input 
                  type="text"
                  value={bulkFields.sizeValue}
                  disabled={!bulkFields.applySize}
                  placeholder="사이즈 입력 (예: S, M, L)"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, sizeValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* 6. 사입처 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyBuySource"
                  checked={bulkFields.applyBuySource}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyBuySource: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyBuySource" className="w-24 font-semibold text-neutral-700 cursor-pointer">사입처</label>
                <input 
                  type="text"
                  value={bulkFields.buySourceValue}
                  disabled={!bulkFields.applyBuySource}
                  placeholder="사입처 정보 입력"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, buySourceValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* 7. 추천순위 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyRecommend"
                  checked={bulkFields.applyRecommend}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyRecommend: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyRecommend" className="w-24 font-semibold text-neutral-700 cursor-pointer">추천 순위</label>
                <input
                  type="text"
                  value={bulkFields.recommendValue || ''}
                  disabled={!bulkFields.applyRecommend}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    const val = raw === '' ? 0 : parseInt(raw, 10);
                    setBulkFields(prev => ({ ...prev, recommendValue: val }));
                  }}
                  placeholder="0 (추천 안함) 또는 순위 입력"
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed font-mono"
                />
              </div>

              {/* 8. 단가 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyUnitPrice"
                  checked={bulkFields.applyUnitPrice}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyUnitPrice: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyUnitPrice" className="w-24 font-semibold text-neutral-700 cursor-pointer">단가</label>
                <input 
                  type="number"
                  value={bulkFields.unitPriceValue}
                  disabled={!bulkFields.applyUnitPrice}
                  placeholder="단가 입력 (숫자)"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, unitPriceValue: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed text-right font-mono"
                />
              </div>

              {/* 9. 환율 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyExchange"
                  checked={bulkFields.applyExchange}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyExchange: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyExchange" className="w-24 font-semibold text-neutral-700 cursor-pointer">환율</label>
                <input 
                  type="number"
                  step="0.01"
                  value={bulkFields.exchangeValue}
                  disabled={!bulkFields.applyExchange}
                  placeholder="환율 입력 (예: 200)"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, exchangeValue: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed text-right font-mono"
                />
              </div>

              {/* 10. 물류비 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyLogistics"
                  checked={bulkFields.applyLogistics}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyLogistics: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyLogistics" className="w-24 font-semibold text-neutral-700 cursor-pointer">물류비</label>
                <input 
                  type="number"
                  value={bulkFields.logisticsValue}
                  disabled={!bulkFields.applyLogistics}
                  placeholder="물류비 입력 (예: 1500)"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, logisticsValue: e.target.value === '' ? '' : parseInt(e.target.value) || 0 }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed text-right font-mono"
                />
              </div>

              {/* 11. 포인트 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyPoint"
                  checked={bulkFields.applyPoint}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyPoint: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyPoint" className="w-24 font-semibold text-neutral-700 cursor-pointer">포인트</label>
                <input 
                  type="text"
                  list="bulk-point-options"
                  value={bulkFields.pointValue}
                  disabled={!bulkFields.applyPoint}
                  placeholder="포인트 선택 또는 직접 입력"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, pointValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white text-xs disabled:bg-neutral-100 disabled:cursor-not-allowed"
                />
                <datalist id="bulk-point-options">
                  {(globalSettings.pointOptions || ['오더만', '공동구매', '세일', '품절']).map(opt => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>

              {/* 12. 업로드일자 */}
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="bulk_applyUploadDate"
                  checked={bulkFields.applyUploadDate}
                  onChange={(e) => setBulkFields(prev => ({ ...prev, applyUploadDate: e.target.checked }))}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bulk_applyUploadDate" className="w-24 font-semibold text-neutral-700 cursor-pointer">업로드 일자</label>
                <input 
                  type="text"
                  value={bulkFields.uploadDateValue}
                  disabled={!bulkFields.applyUploadDate}
                  placeholder="업로드일자 입력 (예: 5/20)"
                  onChange={(e) => setBulkFields(prev => ({ ...prev, uploadDateValue: e.target.value }))}
                  className="flex-1 py-1 px-1.5 border border-neutral-200 bg-white focus:outline-none focus:border-black disabled:bg-neutral-100 disabled:cursor-not-allowed font-mono text-[11px]"
                />
              </div>

            </div>

            <div className="flex gap-2.5 justify-end text-xs font-semibold pt-4 border-t border-neutral-200">
              <button
                onClick={() => setIsBulkUpdateModalOpen(false)}
                className="px-4 py-2 border border-neutral-200 text-neutral-500 hover:bg-neutral-50 transition-colors rounded-none"
              >
                취소
              </button>
              <button
                onClick={handleApplyBulkUpdate}
                className="px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors rounded-none"
              >
                선택 일괄 적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 자동입력 진행률 인디케이터 모달 */}
      {aiLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-neutral-200 p-8 max-w-md w-full shadow-2xl space-y-6 text-center rounded-none">
            <div className="relative flex justify-center">
              <div className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-neutral-100 opacity-75"></div>
              <div className="relative inline-flex p-3.5 bg-black text-white rounded-full">
                <Sparkles className="w-6 h-6 animate-pulse text-amber-400" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-mono tracking-widest font-semibold text-black uppercase">AI AUTO FILL IN PROGRESS</h3>
              <p className="text-xs text-neutral-500 font-light">
                대표 이미지를 분석하여 상품의 아이템과 컬러를 입력 중입니다.
              </p>
            </div>

            {/* 진행 상황 수치 */}
            <div className="bg-neutral-50 p-4 border border-neutral-150 rounded-none space-y-3">
              <div className="flex justify-between text-[11px] font-mono text-neutral-500">
                <span>진행율</span>
                <span className="font-bold text-black">{aiProgress.current} / {aiProgress.total} ({Math.round((aiProgress.current / aiProgress.total) * 100)}%)</span>
              </div>
              
              {/* 프로그레스 바 */}
              <div className="w-full bg-neutral-200 h-1.5 rounded-none overflow-hidden">
                <div 
                  className="bg-black h-full transition-all duration-300"
                  style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%` }}
                ></div>
              </div>

              <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                <span>분석 상품코드:</span>
                <span className="font-bold text-neutral-700">{aiProgress.currentProductCode}</span>
              </div>
            </div>

            <p className="text-[10px] text-amber-700 font-medium tracking-wide flex items-center justify-center gap-1.5 bg-amber-50 py-2 border border-amber-100 rounded-none">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>무료 API 속도 제한(RPM 15) 준수를 위해 4초 대기 중...</span>
            </p>
          </div>
        </div>
      )}

      {/* 포인트 옵션용 데이터리스트 */}
      <datalist id="point-options">
        {(globalSettings.pointOptions || ['오더만', '공동구매', '세일', '품절']).map(opt => (
          <option key={opt} value={opt} />
        ))}
      </datalist>

      {/* 시즌 옵션용 데이터리스트 */}
      <datalist id="season-options">
        {(globalSettings.seasonOptions || ['26SM', '26FA', '26WT']).map(opt => (
          <option key={opt} value={opt} />
        ))}
      </datalist>

      {/* 카테고리/포인트 관리 설정 모달 */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1.5px] select-none p-4 animate-fadeIn">
          <div className="bg-white border border-neutral-200 max-w-4xl w-full shadow-lg p-6 space-y-6 max-h-[90vh] overflow-y-auto rounded-none">
            <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
              <h3 className="text-xs font-bold font-mono tracking-widest uppercase text-neutral-850">카테고리 & 포인트/시즌 옵션 설정</h3>
              <button 
                type="button" 
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-neutral-400 hover:text-black font-light text-base"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-mono">
              {/* 카테고리 관리 영역 */}
              <div className="space-y-3">
                <h4 className="font-bold text-neutral-700 border-b border-neutral-100 pb-1 uppercase tracking-wider">카테고리 관리</h4>
                
                {/* 카테고리 목록 */}
                <div className="border border-neutral-200 divide-y divide-neutral-100 max-h-60 overflow-y-auto bg-neutral-50 p-1">
                  {settingsCategories.length === 0 ? (
                    <div className="p-4 text-center text-neutral-400">등록된 카테고리가 없습니다.</div>
                  ) : (
                    settingsCategories.map((cat, idx) => (
                      <div key={cat.카테고리} className="p-2 flex flex-col gap-2 bg-white">
                        <div className="flex justify-between items-center font-bold">
                          <span>{cat.카테고리}</span>
                          <button 
                            type="button"
                            onClick={() => handleDeleteCategory(cat.카테고리)}
                            className="text-rose-600 hover:text-rose-800 font-semibold"
                          >
                            삭제
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="flex items-center gap-1">
                            <span className="text-neutral-400">환율:</span>
                            <input 
                              type="number"
                              value={cat.환율}
                              onChange={(e) => handleUpdateCategoryField(idx, '환율', parseFloat(e.target.value) || 0)}
                              className="w-16 border border-neutral-200 p-0.5"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-neutral-400">물류비:</span>
                            <input 
                              type="number"
                              value={cat.물류비}
                              onChange={(e) => handleUpdateCategoryField(idx, '물류비', parseInt(e.target.value) || 0)}
                              className="w-20 border border-neutral-200 p-0.5"
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 카테고리 추가 폼 */}
                <div className="border border-neutral-200 p-3 bg-neutral-50 space-y-2">
                  <div className="font-semibold text-neutral-600">신규 카테고리 추가</div>
                  <input 
                    type="text"
                    placeholder="카테고리명 (예: 셔츠/남방)"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full border border-neutral-200 p-1.5 focus:outline-none focus:border-black bg-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-400">기본 환율</span>
                      <input 
                        type="number"
                        value={newCatExchange}
                        onChange={(e) => setNewCatExchange(parseFloat(e.target.value) || 0)}
                        className="border border-neutral-200 p-1 bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-400">기본 물류비</span>
                      <input 
                        type="number"
                        value={newCatLogistics}
                        onChange={(e) => setNewCatLogistics(parseInt(e.target.value) || 0)}
                        className="border border-neutral-200 p-1 bg-white"
                      />
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={handleAddCategory}
                    className="w-full bg-black hover:bg-neutral-800 text-white p-1.5 text-center font-bold tracking-widest"
                  >
                    카테고리 추가
                  </button>
                </div>
              </div>

              {/* 포인트 옵션 관리 영역 */}
              <div className="space-y-3">
                <h4 className="font-bold text-neutral-700 border-b border-neutral-100 pb-1 uppercase tracking-wider">포인트 옵션 관리</h4>
                
                {/* 포인트 옵션 목록 */}
                <div className="border border-neutral-200 divide-y divide-neutral-100 max-h-60 overflow-y-auto bg-neutral-50">
                  {settingsPointOptions.length === 0 ? (
                    <div className="p-4 text-center text-neutral-400">등록된 포인트 옵션이 없습니다.</div>
                  ) : (
                    settingsPointOptions.map((opt) => (
                      <div key={opt} className="p-2.5 flex justify-between items-center bg-white">
                        <span>{opt}</span>
                        <button 
                          type="button"
                          onClick={() => handleDeletePointOption(opt)}
                          className="text-rose-600 hover:text-rose-800 font-semibold"
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* 포인트 옵션 추가 폼 */}
                <div className="border border-neutral-200 p-3 bg-neutral-50 space-y-2">
                  <div className="font-semibold text-neutral-600">신규 포인트 옵션 추가</div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="포인트 (예: 기획, 인기)"
                      value={newPointName}
                      onChange={(e) => setNewPointName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddPointOption();
                        }
                      }}
                      className="flex-1 border border-neutral-200 p-1.5 focus:outline-none focus:border-black bg-white"
                    />
                    <button 
                      type="button"
                      onClick={handleAddPointOption}
                      className="bg-black hover:bg-neutral-800 text-white px-3 font-bold"
                    >
                      추가
                    </button>
                  </div>
                </div>
              </div>

              {/* 시즌 옵션 관리 영역 */}
              <div className="space-y-3">
                <h4 className="font-bold text-neutral-700 border-b border-neutral-100 pb-1 uppercase tracking-wider">시즌 옵션 관리 (라디오: 기본값)</h4>
                
                {/* 시즌 옵션 목록 */}
                <div className="border border-neutral-200 divide-y divide-neutral-100 max-h-60 overflow-y-auto bg-neutral-50">
                  {settingsSeasonOptions.length === 0 ? (
                    <div className="p-4 text-center text-neutral-400">등록된 시즌 옵션이 없습니다.</div>
                  ) : (
                    settingsSeasonOptions.map((opt) => (
                      <div key={opt} className="p-2.5 flex justify-between items-center bg-white">
                        <div className="flex items-center gap-2">
                          <input 
                            type="radio" 
                            name="defaultSeason"
                            checked={settingsDefaultSeason === opt}
                            onChange={() => setSettingsDefaultSeason(opt)}
                            className="rounded-full border-neutral-300 focus:ring-0 text-black w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className={settingsDefaultSeason === opt ? 'font-bold text-black' : 'text-neutral-750'}>
                            {opt} {settingsDefaultSeason === opt && '(기본값)'}
                          </span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => handleDeleteSeasonOption(opt)}
                          className="text-rose-600 hover:text-rose-800 font-semibold"
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* 시즌 옵션 추가 폼 */}
                <div className="border border-neutral-200 p-3 bg-neutral-50 space-y-2">
                  <div className="font-semibold text-neutral-600">신규 시즌 옵션 추가</div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="시즌 (예: 26WT)"
                      value={newSeasonName}
                      onChange={(e) => setNewSeasonName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSeasonOption();
                        }
                      }}
                      className="flex-1 border border-neutral-200 p-1.5 focus:outline-none focus:border-black bg-white"
                    />
                    <button 
                      type="button"
                      onClick={handleAddSeasonOption}
                      className="bg-black hover:bg-neutral-800 text-white px-3 font-bold"
                    >
                      추가
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* 하단 모달 저장/닫기 액션 */}
            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 text-xs font-semibold">
              <button 
                type="button" 
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-5 py-2.5 text-neutral-500 border border-neutral-200 hover:bg-neutral-50 transition-colors"
              >
                닫기
              </button>
              <button 
                type="button" 
                onClick={handleSaveSettings}
                disabled={saving}
                className="px-6 py-2.5 bg-black hover:bg-neutral-900 text-white transition-colors tracking-widest font-bold"
              >
                {saving ? '저장 중...' : '설정 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2안 옵션: 신규 상품 등록 모달 */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1.5px] select-none p-4 animate-fadeIn">
          <div className="bg-white border border-neutral-200 max-w-md w-full shadow-lg p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
              <h3 className="text-xs font-bold font-mono tracking-widest uppercase text-neutral-850">신규 상품 등록</h3>
              <button 
                type="button" 
                onClick={() => setIsAddProductModalOpen(false)}
                className="text-neutral-400 hover:text-black font-light text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddProductSubmit} className="space-y-3.5 text-xs font-mono">
              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">주차 (필수)</label>
                <input 
                  type="text" 
                  placeholder="예: 23W" 
                  value={newProductForm.주차}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 주차: e.target.value.trim() }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black"
                  required
                />
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">임시코드 (필수)</label>
                <input 
                  type="text" 
                  placeholder="예: BC0604-03" 
                  value={newProductForm.임시코드}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 임시코드: e.target.value.trim() }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black"
                  required
                />
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">상품명 (필수)</label>
                <input 
                  type="text" 
                  placeholder="예: BC0604-03" 
                  value={newProductForm.상품명}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 상품명: e.target.value }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black"
                  required
                />
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">카테고리</label>
                <select 
                  value={newProductForm.카테고리}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 카테고리: e.target.value }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black bg-white"
                >
                  <option value="신상">신상</option>
                  <option value="오더만">오더만</option>
                  <option value="공동구매">공동구매</option>
                  <option value="세일">세일</option>
                  <option value="품절">품절</option>
                </select>
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">아이템</label>
                <input 
                  type="text" 
                  placeholder="예: kt(니트)" 
                  value={newProductForm.아이템}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 아이템: e.target.value }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">컬러</label>
                <input 
                  type="text" 
                  value={newProductForm.컬러}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 컬러: e.target.value }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">사이즈</label>
                <input 
                  type="text" 
                  value={newProductForm.사이즈}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 사이즈: e.target.value }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">단가 (¥)</label>
                <input 
                  type="number" 
                  value={newProductForm.단가}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 단가: Number(e.target.value) || 0 }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">시즌</label>
                <input 
                  type="text" 
                  list="season-options"
                  placeholder="예: 26SM" 
                  value={newProductForm.시즌}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 시즌: e.target.value }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black bg-white"
                />
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">등급할인 제외</label>
                <div className="col-span-2">
                  <GradeExcludeInput 
                    value={newProductForm.등급할인제외 || ''}
                    onChange={(newVal) => setNewProductForm(prev => ({ ...prev, 등급할인제외: newVal }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <label className="text-neutral-600">노출여부</label>
                <select 
                  value={newProductForm.노출여부}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, 노출여부: e.target.value }))}
                  className="col-span-2 border border-neutral-200 p-1.5 focus:outline-none focus:border-black bg-white"
                >
                  <option value="y">y (외부 노출)</option>
                  <option value="n">n (미노출)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button 
                  type="button" 
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="px-4 py-2 text-neutral-500 border border-neutral-200 hover:bg-neutral-50 transition-colors"
                >
                  취소
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-black hover:bg-neutral-900 text-white transition-colors"
                >
                  추가하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

/* ============================================================================
   Custom Component: CategorySelectorInput (개편됨)
   카테고리 약어 입력 후 Space 다중 자동완성 태그 선택기
   ============================================================================ */
interface CategorySelectorInputProps {
  value: string;
  categories: CategoryMaster[];
  onChange: (val: string) => void;
}

function CategorySelectorInput({ value, categories, onChange }: CategorySelectorInputProps) {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 쉼표로 분리하여 다중 카테고리 태그 리스트 파싱
  const tags = value
    ? value.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const matches = categories.filter(c => {
    const term = inputText.toLowerCase().trim();
    if (!term) return true;
    return c.카테고리.toLowerCase().includes(term);
  });

  const addTag = (catName: string) => {
    if (!tags.includes(catName)) {
      const updated = [...tags, catName];
      onChange(updated.join(', '));
    }
    setInputText('');
  };

  const removeTag = (catName: string) => {
    const updated = tags.filter(t => t !== catName);
    onChange(updated.join(', '));
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const term = inputText.trim().toLowerCase();
        if (term) {
          const exactMatch = categories.find(c => c.카테고리.toLowerCase().trim() === term);
          if (exactMatch) {
            addTag(exactMatch.카테고리);
          } else if (matches.length > 0) {
            addTag(matches[0].카테고리);
          }
        }
        setInputText('');
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputText, matches, categories, tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      const term = inputText.trim().toLowerCase();
      if (term) {
        e.preventDefault();
        const exactMatch = categories.find(c => c.카테고리.toLowerCase().trim() === term);
        if (exactMatch) {
          addTag(exactMatch.카테고리);
        } else if (matches.length > 0) {
          addTag(matches[0].카테고리);
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) {
        addTag(matches[0].카테고리);
      }
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full space-y-1.5" ref={dropdownRef}>
      {/* 선택된 카테고리 태그 목록 */}
      <div className="flex flex-wrap justify-center gap-1">
        {tags.map(t => (
          <span 
            key={t} 
            className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-800 text-[10px] px-1.5 py-0.5 border border-neutral-200 select-none font-sans"
          >
            <span>{t}</span>
            <button 
              type="button"
              onClick={() => removeTag(t)}
              className="text-neutral-400 hover:text-black font-bold focus:outline-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <input
        type="text"
        placeholder="신상 등 입력 후 Space"
        value={inputText}
        onFocus={(e) => {
          setIsOpen(true);
          e.target.select();
        }}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black focus:outline-none text-[11px] font-mono bg-transparent focus:bg-white rounded-none"
      />

      {isOpen && (
        <div className="absolute left-2 right-2 mt-1 max-h-40 overflow-y-auto bg-white border border-neutral-200 shadow-lg z-50 divide-y divide-neutral-100 rounded-none">
          {matches.length === 0 ? (
            <div className="p-2 text-neutral-400 text-[10px] text-center select-none font-mono">NO MATCHING CATEGORY</div>
          ) : (
            matches.map(c => (
              <div
                key={c.카테고리}
                onClick={() => {
                  addTag(c.카테고리);
                  setIsOpen(false);
                }}
                className="p-1.5 hover:bg-neutral-50 cursor-pointer text-[10px] font-mono select-none text-black text-left"
              >
                {c.카테고리}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Custom Component: ItemSelectorInput (개편됨)
   아이템 단일 선택기 - Space 누르면 즉시 선택 확정 및 드롭다운 폐쇄(마무리)
   ============================================================================ */
interface ItemSelectorInputProps {
  value: string;
  items: ItemMaster[];
  onChange: (val: string) => void;
}

function ItemSelectorInput({ value, items, onChange }: ItemSelectorInputProps) {
  const [inputText, setInputText] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputText(value);
  }, [value]);

  const matches = useMemo(() => {
    const term = inputText.toLowerCase().trim();
    const orig = value.toLowerCase().trim();
    // 포커스되어 아직 텍스트를 수정하지 않은 상태이거나 검색어가 비어 있으면 전체 항목 노출
    if (!term || term === orig) return items;
    return items.filter(i => {
      return i.아이템.toLowerCase().includes(term) || i.표기.toLowerCase().includes(term);
    });
  }, [inputText, value, items]);

  const selectItem = (itemName: string) => {
    onChange(itemName);
    setInputText(itemName);
    setIsOpen(false);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const term = inputText.trim().toLowerCase();
        const orig = value.trim().toLowerCase();
        if (term && term !== orig) {
          if (matches.length > 0) {
            selectItem(matches[0].아이템);
          } else {
            setInputText(value);
            setIsOpen(false);
          }
        } else {
          setInputText(value);
          setIsOpen(false);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, inputText, matches, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      const term = inputText.trim().toLowerCase();
      if (term) {
        e.preventDefault();
        const exactMatch = items.find(i => {
          const match = i.아이템.match(/^([^(]+)/);
          const abbr = match ? match[1].toLowerCase().trim() : '';
          return abbr === term || i.표기.toLowerCase().trim() === term || i.아이템.toLowerCase().trim() === term;
        });
        
        if (exactMatch) {
          selectItem(exactMatch.아이템);
        } else if (matches.length > 0) {
          selectItem(matches[0].아이템);
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) {
        selectItem(matches[0].아이템);
      }
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <input
        type="text"
        value={inputText}
        placeholder="아이템명 입력"
        onFocus={(e) => {
          setIsOpen(true);
          e.target.select();
        }}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black focus:outline-none text-[11px] font-mono bg-transparent focus:bg-white rounded-none"
      />
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-neutral-200 shadow-lg z-50 divide-y divide-neutral-100 rounded-none">
          {matches.length === 0 ? (
            <div className="p-2 text-neutral-400 text-[10px] text-center select-none font-mono">NO MATCHING ITEM</div>
          ) : (
            matches.map(i => (
              <div
                key={i.아이템}
                onClick={() => selectItem(i.아이템)}
                className="p-1.5 hover:bg-neutral-50 cursor-pointer flex justify-between items-center text-[10px] font-mono select-none"
              >
                <span className="text-black text-left">{i.아이템}</span>
                <span className="text-neutral-400 text-[9px]">{i.표기}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Custom Component: ColorTagInput
   단어 약어 매칭(예: iv 입력 후 Space 입력시 IV(아이)가 추가됨)
   ============================================================================ */
interface ColorTagInputProps {
  colorsString: string;
  colorsList: ColorMaster[];
  onChange: (val: string) => void;
  onColorsListChange: (newColors: ColorMaster[]) => void;
}

function ColorTagInput({ colorsString, colorsList, onChange, onColorsListChange }: ColorTagInputProps) {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const tags = colorsString
    ? colorsString.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const matches = colorsList.filter(item => {
    const term = inputText.toLowerCase().trim();
    if (!term) return true;
    return (
      item.컬러.toLowerCase().includes(term) || 
      item.표기컬러.toLowerCase().includes(term)
    );
  });

  const addTag = (fullColorCode: string) => {
    if (!tags.includes(fullColorCode)) {
      const updated = [...tags, fullColorCode];
      onChange(updated.join(', '));
    }
    setInputText('');
  };

  const removeTag = (fullColorCode: string) => {
    const updated = tags.filter(t => t !== fullColorCode);
    onChange(updated.join(', '));
  };

  // 존재하지 않는 새 컬러를 등록하는 함수
  const handleRegisterNewColor = async (typedText: string) => {
    const englishPart = typedText.trim().replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (!englishPart) {
      alert('컬러의 영문 약어/코드를 올바르게 입력해 주세요.');
      setInputText('');
      return;
    }

    const confirmRegister = window.confirm(`'${englishPart}'(은)는 등록되지 않은 컬러입니다. 새 컬러로 등록하시겠습니까?`);
    if (confirmRegister) {
      const label = window.prompt(`등록할 컬러의 한글 표기명을 입력해 주세요 (예: 다크오렌지):`);
      if (label && label.trim()) {
        const fullColorName = `${englishPart}(${label.trim()})`;
        try {
          const res = await fetch('/api/admin/colors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: fullColorName, label: label.trim() })
          });
          const resData = await res.json();
          if (resData.success) {
            // 컬러 마스터 리스트 상태 동적 갱신
            onColorsListChange(resData.colors);
            // 현재 상품의 컬러 태그로 추가
            addTag(fullColorName);
            alert(`새 컬러 '${fullColorName}'이 등록되었습니다.`);
          } else {
            alert(resData.message || '컬러 등록 중 오류가 발생했습니다.');
            setInputText('');
          }
        } catch (err) {
          console.error(err);
          alert('서버와 통신 중 에러가 발생했습니다.');
          setInputText('');
        }
      } else {
        setInputText('');
      }
    } else {
      setInputText('');
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const term = inputText.trim().toLowerCase();
        if (term) {
          const exactMatch = colorsList.find(c => {
            const match = c.컬러.match(/^([^(]+)/);
            const abbr = match ? match[1].toLowerCase().trim() : '';
            return abbr === term || c.표기컬러.toLowerCase().trim() === term;
          });

          if (exactMatch) {
            addTag(exactMatch.컬러);
          } else if (matches.length > 0) {
            addTag(matches[0].컬러);
          } else {
            // 매칭되는 컬러가 아예 없는 경우 새 컬러 등록 시도
            handleRegisterNewColor(term);
            setIsOpen(false);
            return;
          }
        }
        setInputText('');
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputText, matches, colorsList, tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      const term = inputText.trim().toLowerCase();
      if (term) {
        e.preventDefault();
        const exactMatch = colorsList.find(c => {
          const match = c.컬러.match(/^([^(]+)/);
          const abbr = match ? match[1].toLowerCase().trim() : '';
          return abbr === term || c.표기컬러.toLowerCase().trim() === term;
        });

        if (exactMatch) {
          addTag(exactMatch.컬러);
        } else if (matches.length > 0) {
          addTag(matches[0].컬러);
        } else {
          // 매칭 결과가 없을 때 Space 입력 시 등록 시도
          handleRegisterNewColor(term);
        }
      }
    } else if (e.key === 'Enter') {
      const term = inputText.trim().toLowerCase();
      if (term) {
        e.preventDefault();
        const exactMatch = colorsList.find(c => {
          const match = c.컬러.match(/^([^(]+)/);
          const abbr = match ? match[1].toLowerCase().trim() : '';
          return abbr === term || c.표기컬러.toLowerCase().trim() === term;
        });

        if (exactMatch) {
          addTag(exactMatch.컬러);
          setIsOpen(false);
        } else if (matches.length > 0) {
          addTag(matches[0].컬러);
          setIsOpen(false);
        } else {
          // 매칭 결과가 없을 때 Enter 입력 시 등록 시도
          handleRegisterNewColor(term);
          setIsOpen(false);
        }
      } else {
        setIsOpen(false);
      }
    }
  };

  return (
    <div className="relative w-full space-y-1.5" ref={dropdownRef}>
      <div className="flex flex-wrap justify-center gap-1">
        {tags.map(t => (
          <span 
            key={t} 
            className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-800 text-[10px] px-1.5 py-0.5 border border-neutral-200 select-none"
          >
            <span>{t}</span>
            <button 
              type="button"
              onClick={() => removeTag(t)}
              className="text-neutral-400 hover:text-black font-bold focus:outline-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <input
        type="text"
        placeholder="컬러 입력 스페이스바"
        value={inputText}
        onFocus={(e) => {
          setIsOpen(true);
          e.target.select();
        }}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black focus:outline-none text-[11px] font-mono bg-transparent focus:bg-white rounded-none"
      />

      {isOpen && (
        <div className="absolute left-2 right-2 mt-1 max-h-40 overflow-y-auto bg-white border border-neutral-200 shadow-lg z-50 divide-y divide-neutral-100 rounded-none">
          {matches.length === 0 ? (
            <div className="p-2 text-neutral-400 text-[10px] text-center select-none font-mono">NO MATCHING COLOR</div>
          ) : (
            matches.map(c => (
              <div
                key={c.컬러}
                onClick={() => {
                  addTag(c.컬러);
                  setIsOpen(false);
                }}
                className="p-1.5 hover:bg-neutral-50 cursor-pointer flex justify-between items-center text-[10px] font-mono select-none"
              >
                <span className="text-black font-medium">{c.컬러}</span>
                <span className="text-neutral-400">{c.표기컬러}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Custom Component: SizeSelectorInput (개편됨)
   사이즈 약어/글자 입력 후 Space 태그 누적 선택기
   ============================================================================ */
interface SizeSelectorInputProps {
  sizeValue: string;
  onChange: (val: string) => void;
}

const AVAILABLE_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '90', '95', '100', '105', 'free'];

function SizeSelectorInput({ sizeValue, onChange }: SizeSelectorInputProps) {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const tags = sizeValue
    ? sizeValue.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const matches = AVAILABLE_SIZES.filter(size => {
    const term = inputText.toLowerCase().trim();
    if (!term) return true;
    return size.toLowerCase().includes(term);
  });

  const addTag = (size: string) => {
    const normalizedSize = AVAILABLE_SIZES.find(s => s.toLowerCase() === size.toLowerCase()) || size;
    if (!tags.includes(normalizedSize)) {
      let updated = [...tags];
      // free가 지정되면 다른 항목 초기화
      if (normalizedSize.toLowerCase() === 'free') {
        updated = ['free'];
      } else {
        updated = updated.filter(t => t.toLowerCase() !== 'free');
        updated.push(normalizedSize);
      }
      onChange(updated.join(', '));
    }
    setInputText('');
  };

  const removeTag = (size: string) => {
    const updated = tags.filter(t => t !== size);
    onChange(updated.join(', ') || 'free');
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const term = inputText.trim().toLowerCase();
        if (term) {
          const exactMatch = AVAILABLE_SIZES.find(s => s.toLowerCase() === term);
          if (exactMatch) {
            addTag(exactMatch);
          } else if (matches.length > 0) {
            addTag(matches[0]);
          }
        }
        setInputText('');
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputText, matches, tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      const term = inputText.trim().toLowerCase();
      if (term) {
        e.preventDefault();
        const exactMatch = AVAILABLE_SIZES.find(s => s.toLowerCase() === term);
        if (exactMatch) {
          addTag(exactMatch);
        } else if (matches.length > 0) {
          addTag(matches[0]);
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) {
        addTag(matches[0]);
      }
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full space-y-1.5" ref={dropdownRef}>
      <div className="flex flex-wrap justify-center gap-1">
        {tags.map(t => (
          <span 
            key={t} 
            className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-800 text-[10px] px-1.5 py-0.5 border border-neutral-200 select-none"
          >
            <span>{t}</span>
            <button 
              type="button"
              onClick={() => removeTag(t)}
              className="text-neutral-400 hover:text-black font-bold focus:outline-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <input
        type="text"
        placeholder="s, free 등 입력 후 Space"
        value={inputText}
        onFocus={(e) => {
          setIsOpen(true);
          e.target.select();
        }}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black focus:outline-none text-[11px] font-mono bg-transparent focus:bg-white rounded-none"
      />

      {isOpen && (
        <div className="absolute left-2 right-2 mt-1 max-h-40 overflow-y-auto bg-white border border-neutral-200 shadow-lg z-50 divide-y divide-neutral-100 rounded-none">
          {matches.length === 0 ? (
            <div className="p-2 text-neutral-400 text-[10px] text-center select-none font-mono">NO MATCHING SIZE</div>
          ) : (
            matches.map(s => (
              <div
                key={s}
                onClick={() => {
                  addTag(s);
                  setIsOpen(false);
                }}
                className="p-1.5 hover:bg-neutral-50 cursor-pointer text-[10px] font-mono select-none text-black text-left"
              >
                {s}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Custom Component: ExposureInput (개편됨)
   노출여부 약어 입력 후 Space 자동완성 태그 선택기 (배타성 규칙 유지)
   ============================================================================ */
interface ExposureInputProps {
  exposure: string;
  customers: Customer[];
  onChange: (val: string) => void;
}

function ExposureInput({ exposure, customers, onChange }: ExposureInputProps) {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const standardOptions = ['n', 'y', 'a', 'b', 'c', 'b,c', '일반등급', '일반'];
  
  // 쉼표로 분할하여 선택된 태그 목록 배열 생성
  const tags = exposure
    ? exposure.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const addTag = (value: string, type: 'standard' | 'customer') => {
    let updated: string[];

    if (type === 'standard') {
      // 등급을 지정하면 다른 거래처 칩은 전부 클리어
      updated = [value];
    } else {
      // 거래처명을 추가하면 등급 코드(y, n 등)는 지우고 거래처만 누적
      const filtered = tags.filter(t => !standardOptions.includes(t.toLowerCase()));
      if (!filtered.includes(value)) {
        updated = [...filtered, value];
      } else {
        updated = filtered;
      }
    }

    onChange(updated.join(', ') || 'n');
    setInputText('');
  };

  const removeTag = (tag: string) => {
    const updated = tags.filter(t => t !== tag);
    onChange(updated.join(', ') || 'n');
  };

  const handleToggleCustomer = (custName: string) => {
    if (tags.includes(custName)) {
      removeTag(custName);
    } else {
      addTag(custName, 'customer');
    }
  };

  // 타이핑 검색어 기반 매치 거래처 목록
  const term = inputText.toLowerCase().trim();
  const filteredCustomers = customers.filter(c => 
    !term || c.거래처명.toLowerCase().includes(term)
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const inputTerm = inputText.trim().toLowerCase();
        if (inputTerm) {
          const matchedStandard = standardOptions.find(o => o.toLowerCase() === inputTerm);
          if (matchedStandard) {
            addTag(matchedStandard, 'standard');
          } else {
            const matchedCust = customers.find(c => c.거래처명.toLowerCase() === inputTerm);
            if (matchedCust) {
              addTag(matchedCust.거래처명, 'customer');
            } else if (filteredCustomers.length > 0) {
              addTag(filteredCustomers[0].거래처명, 'customer');
            }
          }
        }
        setInputText('');
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputText, filteredCustomers, customers, tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      if (term) {
        e.preventDefault();
        
        // 1. 등급 표준 코드 매치 검사
        const matchedStandard = standardOptions.find(o => o.toLowerCase() === term);
        if (matchedStandard) {
          addTag(matchedStandard, 'standard');
          setIsOpen(false); // 등급 지정 시 닫음
          return;
        }

        // 2. 거래처명 매치 검사
        const matchedCust = customers.find(c => c.거래처명.toLowerCase() === term);
        if (matchedCust) {
          addTag(matchedCust.거래처명, 'customer');
          return;
        }

        // 3. 검색 결과 첫 번째 매치 자동 추가
        if (filteredCustomers.length > 0) {
          addTag(filteredCustomers[0].거래처명, 'customer');
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // 현재 단일 표준 등급 값 매칭 확인
  const currentStandard = tags.length === 1 && standardOptions.includes(tags[0].toLowerCase()) ? tags[0].toLowerCase() : '';

  return (
    <div className="relative w-full space-y-1.5" ref={dropdownRef}>
      {/* 노출 태그 목록 */}
      <div className="flex flex-wrap justify-center gap-1">
        {tags.map(t => {
          const isStandard = standardOptions.includes(t.toLowerCase());
          return (
            <span 
              key={t} 
              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 border select-none ${isStandard ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-neutral-100 text-neutral-800 border-neutral-200'}`}
            >
              <span>{t}</span>
              <button 
                type="button"
                onClick={() => removeTag(t)}
                className="hover:text-rose-500 font-bold focus:outline-none"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {/* 입력 박스 */}
      <input
        type="text"
        placeholder="y, n 또는 거래처명 입력 후 Space"
        value={inputText}
        onFocus={(e) => {
          setIsOpen(true);
          e.target.select();
        }}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black focus:outline-none text-[11px] font-mono bg-transparent focus:bg-white rounded-none"
      />

      {/* 드롭다운 포폴리오 (다중 체크박스 & 스페이스 융합 지원) */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-neutral-200 shadow-xl z-50 p-3 select-none text-[11px] space-y-3.5 rounded-none">
          {/* 등급 코드 버튼 그룹 */}
          <div className="space-y-1">
            <span className="text-[9px] text-neutral-400 block pb-1 border-b border-neutral-100 font-semibold uppercase">등급 지정</span>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {[
                ['n', '비노출'], 
                ['y', '전체노출'], 
                ['a', 'A등급만'], 
                ['b', 'B등급만'], 
                ['c', 'C등급만'], 
                ['b,c', 'B & C등급'],
                ['일반등급', '일반등급']
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    addTag(val, 'standard');
                    setIsOpen(false); // 등급 코드는 즉시 닫기
                  }}
                  className={`px-1.5 py-1 text-left border text-[10px] ${currentStandard === val ? 'bg-black text-white border-black font-semibold' : 'border-neutral-200 hover:bg-neutral-50 text-neutral-600'}`}
                >
                  {val} ({label})
                </button>
              ))}
            </div>
          </div>

          {/* 특정 거래처 체크박스 그룹 */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[9px] text-neutral-400 block pb-1 border-b border-neutral-100 font-semibold uppercase">거래처 직접 선택 ({filteredCustomers.length}곳)</span>
            <div className="space-y-1 max-h-36 overflow-y-auto pt-1 pr-1">
              {filteredCustomers.length === 0 ? (
                <div className="text-[10px] text-neutral-400 py-2 text-center font-mono">검색 결과 없음</div>
              ) : (
                filteredCustomers.map(c => {
                  const isChecked = tags.includes(c.거래처명);
                  return (
                    <label 
                      key={c.거래처명} 
                      className="flex items-center space-x-2 py-1 px-1.5 cursor-pointer hover:bg-neutral-50 text-neutral-700 text-left"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleCustomer(c.거래처명)}
                        className="rounded-none border-neutral-300 focus:ring-0 text-black w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="truncate">{c.거래처명} ({c.거래처등급}등급)</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ExcludeInputProps {
  exclude: string;
  customers: Customer[];
  onChange: (val: string) => void;
}

function ExcludeInput({ exclude, customers, onChange }: ExcludeInputProps) {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 쉼표로 분할하여 선택된 태그 목록 배열 생성
  const tags = exclude
    ? exclude.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const addTag = (value: string) => {
    if (!tags.includes(value)) {
      const updated = [...tags, value];
      onChange(updated.join(', ') || '');
    }
    setInputText('');
  };

  const removeTag = (tag: string) => {
    const updated = tags.filter(t => t !== tag);
    onChange(updated.join(', ') || '');
  };

  const handleToggleCustomer = (custName: string) => {
    if (tags.includes(custName)) {
      removeTag(custName);
    } else {
      addTag(custName);
    }
  };

  // 타이핑 검색어 기반 매치 거래처 목록
  const term = inputText.toLowerCase().trim();
  const filteredCustomers = customers.filter(c => 
    !term || c.거래처명.toLowerCase().includes(term)
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        const inputTerm = inputText.trim().toLowerCase();
        if (inputTerm) {
          const matchedCust = customers.find(c => c.거래처명.toLowerCase() === inputTerm);
          if (matchedCust) {
            addTag(matchedCust.거래처명);
          } else if (filteredCustomers.length > 0) {
            addTag(filteredCustomers[0].거래처명);
          }
        }
        setInputText('');
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputText, filteredCustomers, customers, tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      if (term) {
        e.preventDefault();
        
        // 1. 거래처명 매치 검사
        const matchedCust = customers.find(c => c.거래처명.toLowerCase() === term);
        if (matchedCust) {
          addTag(matchedCust.거래처명);
          return;
        }

        // 2. 검색 결과 첫 번째 매치 자동 추가
        if (filteredCustomers.length > 0) {
          addTag(filteredCustomers[0].거래처명);
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full space-y-1.5" ref={dropdownRef}>
      {/* 노출제외 태그 목록 */}
      <div className="flex flex-wrap justify-center gap-1">
        {tags.map(t => (
          <span 
            key={t} 
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 border select-none bg-rose-50 text-rose-700 border-rose-200"
          >
            <span>{t}</span>
            <button 
              type="button"
              onClick={() => removeTag(t)}
              className="hover:text-rose-950 font-bold focus:outline-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* 입력 박스 */}
      <input
        type="text"
        placeholder="제외할 거래처명 입력 후 Space"
        value={inputText}
        onFocus={(e) => {
          setIsOpen(true);
          e.target.select();
        }}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full text-center px-1.5 py-1 border border-transparent hover:border-neutral-300 focus:border-black focus:outline-none text-[11px] font-mono bg-transparent focus:bg-white rounded-none"
      />

      {/* 드롭다운 포폴리오 */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-neutral-200 shadow-xl z-50 p-3 select-none text-[11px] space-y-3.5 rounded-none">
          <div className="space-y-1.5">
            <span className="text-[9px] text-neutral-400 block pb-1 border-b border-neutral-100 font-semibold uppercase">제외할 거래처 선택 ({filteredCustomers.length}곳)</span>
            <div className="space-y-1 max-h-48 overflow-y-auto pt-1 pr-1">
              {filteredCustomers.length === 0 ? (
                <div className="text-[10px] text-neutral-400 py-2 text-center font-mono">검색 결과 없음</div>
              ) : (
                filteredCustomers.map(c => {
                  const isChecked = tags.includes(c.거래처명);
                  return (
                    <label 
                      key={c.거래처명} 
                      className="flex items-center space-x-2 py-1 px-1.5 cursor-pointer hover:bg-neutral-50 text-neutral-700 text-left"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleCustomer(c.거래처명)}
                        className="rounded-none border-neutral-300 focus:ring-0 text-black w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="truncate">{c.거래처명} ({c.거래처등급}등급)</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface GradeExcludeInputProps {
  value: string;
  onChange: (val: string) => void;
}

function GradeExcludeInput({ value, onChange }: GradeExcludeInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedGrades = value
    ? value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : [];
  const grades = ['S', 'A', 'B', 'C', 'W'];

  const handleToggle = (grade: string) => {
    let updated: string[];
    if (selectedGrades.includes(grade)) {
      updated = selectedGrades.filter(g => g !== grade);
    } else {
      updated = [...selectedGrades, grade];
    }
    const sorted = grades.filter(g => updated.includes(g));
    onChange(sorted.join(', '));
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full text-left" ref={dropdownRef}>
      {/* Trigger Area (Looks like a select/input) */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[28px] py-1 px-1.5 border border-neutral-200 hover:border-neutral-400 bg-white cursor-pointer flex items-center justify-between gap-1 select-none"
      >
        {selectedGrades.length > 0 ? (
          <div className="flex flex-wrap gap-0.5">
            {selectedGrades.map(g => (
              <span 
                key={g} 
                className="bg-neutral-800 text-white text-[9px] font-bold px-1 py-0.5 rounded shadow-sm"
              >
                {g}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-neutral-400 text-[10px]">미설정</span>
        )}
        <span className="text-neutral-400 text-[8px] select-none ml-auto">▼</span>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-neutral-200 shadow-lg rounded z-50 py-1 text-[11px] max-h-48 overflow-y-auto">
          {grades.map(g => {
            const isSelected = selectedGrades.includes(g);
            return (
              <label 
                key={g} 
                className="flex items-center px-2 py-1.5 hover:bg-neutral-50 cursor-pointer select-none"
              >
                <input 
                  type="checkbox" 
                  checked={isSelected}
                  onChange={() => handleToggle(g)}
                  className="rounded-none border-neutral-300 focus:ring-0 text-black w-3.5 h-3.5 mr-2 cursor-pointer"
                />
                <span className="font-semibold text-neutral-700">{g}등급 제외</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 헬퍼: 다양한 형식의 업로드 날짜 문자열을 Date 객체로 파싱
const parseProductDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  
  // YYYY-MM-DD or YYYY.MM.DD 형식 지원
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(clean)) {
    return new Date(clean.replace(/\./g, '-'));
  }
  
  // MM/DD or M/D or MM.DD or M.D 형식 지원 (현재 년도 대입)
  const match = clean.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    const year = new Date().getFullYear();
    return new Date(year, month, day);
  }
  
  return null;
};

/* ============================================================================
   Custom Component: MultiSelectFilter (다중 선택 드롭다운 필터)
   ============================================================================ */
interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}

function MultiSelectFilter({ label, options, selectedValues, onChange }: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOption = (opt: string) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter(v => v !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  const handleSelectAll = () => {
    if (selectedValues.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  const displayLabel = selectedValues.length === 0
    ? `${label} 전체`
    : selectedValues.length === options.length
      ? `${label} 전체 선택됨`
      : selectedValues.join(', ');

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="text-[10px] text-neutral-400 font-mono block mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left py-1.5 px-2.5 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs font-mono rounded-none flex justify-between items-center select-none min-h-[30px]"
      >
        <span className="truncate pr-2">{displayLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-neutral-200 shadow-lg z-50 divide-y divide-neutral-100 rounded-none">
          {options.length === 0 ? (
            <div className="p-2.5 text-neutral-400 text-[10px] text-center select-none font-mono">선택 항목 없음</div>
          ) : (
            <>
              {/* 전체 선택 토글 */}
              <div 
                onClick={handleSelectAll}
                className="p-2 hover:bg-neutral-50 cursor-pointer flex items-center space-x-2 text-[10px] font-mono select-none font-bold text-neutral-600 bg-neutral-50"
              >
                <input 
                  type="checkbox" 
                  checked={selectedValues.length === options.length && options.length > 0}
                  readOnly
                  className="rounded-none border-neutral-300 text-black w-3 h-3 cursor-pointer focus:ring-0"
                />
                <span>[전체 선택 / 해제]</span>
              </div>
              {/* 옵션 목록 */}
              {options.map(opt => {
                const isChecked = selectedValues.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => handleToggleOption(opt)}
                    className="p-2 hover:bg-neutral-50 cursor-pointer flex items-center space-x-2 text-[10px] font-mono select-none text-black"
                  >
                    <input 
                      type="checkbox" 
                      checked={isChecked}
                      readOnly
                      className="rounded-none border-neutral-300 text-black w-3 h-3 cursor-pointer focus:ring-0"
                    />
                    <span className="truncate">{opt}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Helper & Custom Component: DateRangeFilter (달력 기간 범위 선택기)
   ============================================================================ */
const generateCalendarDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1).getDay(); // 0(일) ~ 6(토)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  // 이전 달 날짜들로 채우기
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, daysInPrevMonth - i),
      isCurrentMonth: false
    });
  }

  // 이번 달 날짜들로 채우기
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({
      date: new Date(year, month, i),
      isCurrentMonth: true
    });
  }

  // 다음 달 날짜들로 채우기 (총 42칸을 맞추기 위해)
  const remainingCells = 42 - days.length;
  for (let i = 1; i <= remainingCells; i++) {
    days.push({
      date: new Date(year, month + 1, i),
      isCurrentMonth: false
    });
  }

  return days;
};

interface DateRangeFilterProps {
  label: string;
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

function DateRangeFilter({ label, startDate, endDate, onChange }: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 달력 연/월 이동용 상태 (기본값은 오늘 혹은 이미 선택된 시작일 기준)
  const initialDate = startDate ? new Date(startDate) : new Date();
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth()); // 0-indexed

  // 임시 선택 날짜 범위 상태
  const [tempStart, setTempStart] = useState<string>(startDate);
  const [tempEnd, setTempEnd] = useState<string>(endDate);

  // 외부 상태가 바뀔 때 임시 상태 동기화
  useEffect(() => {
    setTempStart(startDate);
    setTempEnd(endDate);
  }, [startDate, endDate]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const formatDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const handleDateClick = (d: Date) => {
    const dateStr = formatDate(d);
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(dateStr);
      setTempEnd('');
    } else {
      if (dateStr < tempStart) {
        setTempStart(dateStr);
      } else {
        setTempEnd(dateStr);
      }
    }
  };

  const handleApply = () => {
    onChange(tempStart, tempEnd);
    setIsOpen(false);
  };

  const handleReset = () => {
    setTempStart('');
    setTempEnd('');
    onChange('', '');
    setIsOpen(false);
  };

  const calendarDays = generateCalendarDays(currentYear, currentMonth);

  const displayLabel = startDate && endDate
    ? `${startDate} ~ ${endDate}`
    : startDate
      ? `${startDate} ~`
      : `${label} 전체`;

  return (
    <div className="relative w-full select-none" ref={containerRef}>
      <label className="text-[10px] text-neutral-400 font-mono block mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left py-1.5 px-2.5 border border-neutral-200 bg-white focus:outline-none focus:border-black text-xs font-mono rounded-none flex justify-between items-center min-h-[30px]"
      >
        <span className="truncate pr-2">{displayLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-[280px] bg-white border border-neutral-200 shadow-xl z-50 p-4 rounded-none space-y-3">
          {/* 달력 헤더 (월 탐색) */}
          <div className="flex justify-between items-center text-xs font-mono font-semibold">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-neutral-100 border border-neutral-200"
            >
              ◀
            </button>
            <span>{currentYear}년 {currentMonth + 1}월</span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 hover:bg-neutral-100 border border-neutral-200"
            >
              ▶
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 text-center text-[10px] font-mono text-neutral-400 border-b border-neutral-100 pb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* 날짜 격자 */}
          <div className="grid grid-cols-7 gap-y-1 text-center text-xs font-mono">
            {calendarDays.map(({ date, isCurrentMonth }, idx) => {
              const dateStr = formatDate(date);
              const isSelectedStart = tempStart === dateStr;
              const isSelectedEnd = tempEnd === dateStr;
              const isInRange = tempStart && tempEnd && dateStr > tempStart && dateStr < tempEnd;

              let cellClass = "py-1 cursor-pointer transition-colors relative ";
              if (!isCurrentMonth) {
                cellClass += "text-neutral-300 hover:bg-neutral-50 ";
              } else {
                cellClass += "text-black hover:bg-neutral-100 ";
              }

              if (isSelectedStart || isSelectedEnd) {
                cellClass += "bg-black text-white hover:bg-neutral-800 font-bold ";
              } else if (isInRange) {
                cellClass += "bg-neutral-100 font-semibold ";
              }

              return (
                <div
                  key={idx}
                  onClick={() => handleDateClick(date)}
                  className={cellClass}
                >
                  {date.getDate()}
                </div>
              );
            })}
          </div>

          {/* 하단 액션 버튼 */}
          <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 text-[10px] font-mono text-neutral-500 border border-neutral-200 hover:bg-neutral-50"
            >
              초기화
            </button>
            <div className="flex space-x-1">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 text-[10px] font-mono text-neutral-500 border border-neutral-200 hover:bg-neutral-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-2.5 py-1 text-[10px] font-mono text-white bg-black hover:bg-neutral-800"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
