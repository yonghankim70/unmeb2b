import type { SyntheticEvent } from 'react';

interface ImageProductLike {
  주차: string;
  상품명: string;
  임시코드?: string;
}

const preloadedMainImages = new Set<string>();
const MAIN_IMAGE_WIDTHS = [480, 720] as const;
const DETAIL_IMAGE_WIDTHS = [1200, 1600] as const;
const DEFAULT_MAIN_IMAGE_WIDTH = 720;
const DEFAULT_DETAIL_IMAGE_WIDTH = 1600;
const HQ_TEST_PRODUCT_CODE = 'BC0603-02';
const HQ_TEST_MAIN_WIDTH = 960;
const HQ_TEST_DETAIL_WIDTH = 2200;
const R2_IMAGE_BASE_URL = (process.env.NEXT_PUBLIC_R2_IMAGE_BASE_URL || '').replace(/\/+$/, '');

export function getImageCode(product: ImageProductLike): string {
  return product.임시코드 || product.상품명;
}

function getCacheSegment(value: string): string {
  return encodeURIComponent(encodeURIComponent(value));
}

function withImageBase(pathname: string): string {
  if (!R2_IMAGE_BASE_URL) return pathname;
  return `${R2_IMAGE_BASE_URL}${pathname}`;
}

function isHighQualityTestProduct(product: ImageProductLike): boolean {
  const code = getImageCode(product).trim().toUpperCase();
  const name = product.상품명.trim().toUpperCase();
  return code === HQ_TEST_PRODUCT_CODE || name === HQ_TEST_PRODUCT_CODE;
}

function getMainImageWidths(product: ImageProductLike): readonly number[] {
  return isHighQualityTestProduct(product) ? [HQ_TEST_MAIN_WIDTH] : MAIN_IMAGE_WIDTHS;
}

function getDetailImageWidths(product: ImageProductLike): readonly number[] {
  return isHighQualityTestProduct(product) ? [HQ_TEST_DETAIL_WIDTH] : DETAIL_IMAGE_WIDTHS;
}

function getDefaultMainImageWidth(product: ImageProductLike): number {
  return isHighQualityTestProduct(product) ? HQ_TEST_MAIN_WIDTH : DEFAULT_MAIN_IMAGE_WIDTH;
}

function getDefaultDetailImageWidth(product: ImageProductLike): number {
  return isHighQualityTestProduct(product) ? HQ_TEST_DETAIL_WIDTH : DEFAULT_DETAIL_IMAGE_WIDTH;
}

function encodePathSegments(pathname: string): string {
  return pathname
    .split('/')
    .map((segment, index) => index === 0 ? segment : encodeURIComponent(segment))
    .join('/');
}

export function getCachedMainImageUrl(product: ImageProductLike): string {
  return getOptimizedMainImageUrl(product);
}

export function getCachedDetailImageUrl(product: ImageProductLike, fileName: string): string {
  return getOptimizedDetailImageUrl(product, fileName);
}

export function getLegacyMainImageUrl(product: ImageProductLike): string {
  return `/image-cache/main/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}.jpg`;
}

export function getLegacyDetailImageUrl(product: ImageProductLike, fileName: string): string {
  return `/image-cache/detail/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}/${encodeURIComponent(fileName)}`;
}

export function getOptimizedMainImageUrl(product: ImageProductLike, width = getDefaultMainImageWidth(product)): string {
  return withImageBase(`/image-cache/main/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}-${width}.webp`);
}

export function getOptimizedMainImageSrcSet(product: ImageProductLike): string {
  return getMainImageWidths(product)
    .map((width) => `${getOptimizedMainImageUrl(product, width)} ${width}w`)
    .join(', ');
}

export function getOptimizedDetailImageUrl(
  product: ImageProductLike,
  fileName: string,
  width = getDefaultDetailImageWidth(product)
): string {
  return withImageBase(`/image-cache/detail/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}/${getCacheSegment(fileName)}-${width}.webp`);
}

export function getEncodedOptimizedDetailImageUrl(
  product: ImageProductLike,
  fileName: string,
  width = getDefaultDetailImageWidth(product)
): string {
  const pathname = `/image-cache/detail/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}/${getCacheSegment(fileName)}-${width}.webp`;
  return withImageBase(encodePathSegments(pathname));
}

export function getOptimizedDetailImageSrcSet(product: ImageProductLike, fileName: string): string {
  return getDetailImageWidths(product)
    .map((width) => `${getOptimizedDetailImageUrl(product, fileName, width)} ${width}w`)
    .join(', ');
}

export function getApiImageUrl(product: ImageProductLike, fileName?: string): string {
  const base = `/api/image?week=${encodeURIComponent(product.주차)}&code=${encodeURIComponent(getImageCode(product))}`;
  return fileName ? `${base}&file=${encodeURIComponent(fileName)}` : base;
}

export function useApiImageFallback(
  event: SyntheticEvent<HTMLImageElement>,
  fallbackUrl: string
): void {
  const image = event.currentTarget;
  if (image.dataset.fallback === 'api') return;
  image.dataset.fallback = 'api';
  image.src = fallbackUrl;
}

export function useImageFallbacks(
  event: SyntheticEvent<HTMLImageElement>,
  fallbackUrls: string[]
): void {
  const image = event.currentTarget;
  const fallbackIndex = Number(image.dataset.fallbackIndex || '0');
  const fallbackUrl = fallbackUrls[fallbackIndex];

  if (!fallbackUrl) return;
  image.dataset.fallbackIndex = String(fallbackIndex + 1);
  image.removeAttribute('srcset');
  image.src = fallbackUrl;
}

export function preloadMainProductImages(products: ImageProductLike[], limit = 800): void {
  if (typeof window === 'undefined') return;

  const targets = products.slice(0, limit);
  let cursor = 0;

  const loadBatch = () => {
    const batchEnd = Math.min(cursor + 24, targets.length);
    for (; cursor < batchEnd; cursor += 1) {
      const product = targets[cursor];
      const cachedUrl = getOptimizedMainImageUrl(product);
      if (preloadedMainImages.has(cachedUrl)) continue;

      preloadedMainImages.add(cachedUrl);
      const image = new Image();
      image.decoding = 'async';
      image.sizes = '(max-width: 768px) 50vw, 25vw';
      image.srcset = getOptimizedMainImageSrcSet(product);
      (image as HTMLImageElement & { fetchPriority?: string }).fetchPriority = cursor < 48 ? 'high' : 'low';
      image.onerror = () => {
        image.src = getApiImageUrl(product);
      };
      image.src = cachedUrl;
    }

    if (cursor < targets.length) {
      window.setTimeout(loadBatch, 180);
    }
  };

  loadBatch();
}
