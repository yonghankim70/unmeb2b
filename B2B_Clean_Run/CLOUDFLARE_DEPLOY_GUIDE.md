# Cloudflare 배포용 토큰 준비

현재 D1/R2 데이터 이전과 Cloudflare 빌드는 완료되어 있습니다.
실제 `unmeb2b.com` 업로드만 Cloudflare 토큰 권한 부족으로 막힌 상태입니다.

## 새로 필요한 토큰

Cloudflare Dashboard에서 배포 전용 API Token을 하나 더 만듭니다.

필요 권한:

- Account / Workers Scripts / Edit
- Account / Workers Routes / Edit
- Account / Workers Tail / Read
- Account / D1 / Edit
- Account / Cloudflare Workers KV Storage / Edit
- Zone / Workers Routes / Edit
- Zone / DNS / Edit

Account Resources는 현재 계정 하나를 선택합니다.
Zone Resources는 `unmeb2b.com`이 보이면 해당 Zone만 선택합니다.

## 넣는 곳

1. `.env.deploy.local.example` 파일을 복사해서 `.env.deploy.local` 이름으로 만듭니다.
2. 새 배포 토큰을 아래처럼 넣습니다.

```env
CLOUDFLARE_API_TOKEN=새_배포용_토큰
```

3. `run-deploy-cloudflare.bat`를 실행합니다.

이 배포용 토큰은 사이트 업로드용입니다.
기존 `.env.local`의 `CF_API_TOKEN`은 쇼핑몰 서버가 D1을 조회하는 런타임 비밀값으로 따로 저장됩니다.
