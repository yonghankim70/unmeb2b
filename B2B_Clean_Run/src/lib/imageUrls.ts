import type { SyntheticEvent } from 'react';

interface ImageProductLike {
  주차: string;
  상품명: string;
  임시코드?: string;
  이미지버전?: string;
}

const preloadedMainImages = new Set<string>();
const MAIN_IMAGE_WIDTHS = [480, 960] as const;
const DETAIL_IMAGE_WIDTHS = [1200, 2200] as const;
const DEFAULT_MAIN_IMAGE_WIDTH = 960;
const DEFAULT_DETAIL_IMAGE_WIDTH = 2200;
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

function withImageVersion(url: string, product: ImageProductLike): string {
  const version = String(product.이미지버전 || '').trim();
  if (!version) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
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
  return withImageVersion(`/image-cache/main/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}.jpg`, product);
}

export function getLegacyDetailImageUrl(product: ImageProductLike, fileName: string): string {
  return withImageVersion(`/image-cache/detail/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}/${encodeURIComponent(fileName)}`, product);
}

export function getOptimizedMainImageUrl(product: ImageProductLike, width = DEFAULT_MAIN_IMAGE_WIDTH): string {
  return withImageVersion(withImageBase(`/image-cache/main/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}-${width}.webp`), product);
}

export function getOptimizedMainImageSrcSet(product: ImageProductLike): string {
  return MAIN_IMAGE_WIDTHS
    .map((width) => `${getOptimizedMainImageUrl(product, width)} ${width}w`)
    .join(', ');
}

export function getOptimizedDetailImageUrl(
  product: ImageProductLike,
  fileName: string,
  width = DEFAULT_DETAIL_IMAGE_WIDTH
): string {
  return withImageVersion(withImageBase(`/image-cache/detail/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}/${getCacheSegment(fileName)}-${width}.webp`), product);
}

export function getEncodedOptimizedDetailImageUrl(
  product: ImageProductLike,
  fileName: string,
  width = DEFAULT_DETAIL_IMAGE_WIDTH
): string {
  const pathname = `/image-cache/detail/${encodeURIComponent(product.주차)}/${getCacheSegment(getImageCode(product))}/${getCacheSegment(fileName)}-${width}.webp`;
  return withImageVersion(withImageBase(encodePathSegments(pathname)), product);
}

export function getOptimizedDetailImageSrcSet(product: ImageProductLike, fileName: string): string {
  return DETAIL_IMAGE_WIDTHS
    .map((width) => `${getOptimizedDetailImageUrl(product, fileName, width)} ${width}w`)
    .join(', ');
}

export function getApiImageUrl(product: ImageProductLike, fileName?: string): string {
  const base = `/api/image?week=${encodeURIComponent(product.주차)}&code=${encodeURIComponent(getImageCode(product))}`;
  const imageUrl = fileName ? `${base}&file=${encodeURIComponent(fileName)}` : base;
  return withImageVersion(imageUrl, product);
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
