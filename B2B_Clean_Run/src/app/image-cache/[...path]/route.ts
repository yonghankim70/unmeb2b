import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FALLBACK_R2_IMAGE_BASE_URL = 'https://pub-6bcee8668c3a45759ba8275c107e83fd.r2.dev';
const IMAGE_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

function getR2ImageBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_R2_IMAGE_BASE_URL
    || process.env.CF_R2_PUBLIC_BASE_URL
    || FALLBACK_R2_IMAGE_BASE_URL
  ).replace(/\/+$/, '');
}

function redirectImageCacheRequest(request: NextRequest) {
  const url = new URL(request.url);
  const tail = url.pathname.replace(/^\/image-cache\/?/, '');

  if (!tail) {
    return new NextResponse('Not Found', { status: 404 });
  }

  return NextResponse.redirect(`${getR2ImageBaseUrl()}/image-cache/${tail}${url.search}`, {
    status: 307,
    headers: {
      'Cache-Control': IMAGE_CACHE_CONTROL,
    },
  });
}

export async function GET(request: NextRequest) {
  return redirectImageCacheRequest(request);
}

export async function HEAD(request: NextRequest) {
  return redirectImageCacheRequest(request);
}
