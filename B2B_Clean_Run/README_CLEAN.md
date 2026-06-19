# B2B Clean Run

원본을 건드리지 않고 따로 운영하기 위해 만든 정리본입니다.

## 제외한 것

- `.next`, `build`, `node_modules` 같은 생성물
- 일회성 점검 스크립트
- 디버그 API route 파일
- 실제 `.env.local` 비밀값

## 데이터 위치

기본 데이터 폴더는 아래 경로입니다.

`data/pddb_dev`

자동으로 `Z:\HDD1\PDDB`를 읽거나 쓰지 않습니다. 다른 데이터 폴더를 쓰려면 `.env.local`에 `B2B_DATA_DIR`을 지정하세요.

대표 이미지는 서버 시작 전에 `public/image-cache` 폴더에 쇼핑몰용 WebP 이미지로 미리 생성됩니다. 첫 화면 로딩 속도를 위해 `run-dev.bat`이 자동으로 `scripts/warm-image-cache.js`를 실행합니다.

기본 설정은 800개 이상 상품 운영을 기준으로 최대 1000개 상품까지 준비합니다. 목록 이미지는 480/720px, 상세 앞쪽 이미지는 1200/1600px 고품질 WebP로 생성되며 원본 PDDB 이미지는 수정하지 않습니다.

## 실행

1. `.env.example`을 참고해 `.env.local`을 만듭니다.
2. `run-dev.bat`을 실행합니다.
3. `http://localhost:2000`을 엽니다.

`node_modules`가 이 폴더 안에 있으면 그것을 쓰고, 없으면 부모 폴더의 기존 의존성을 재사용합니다. 완전히 독립 설치하려면 이 폴더에서 `npm install`을 한 번 실행하면 됩니다.

## 확인

- `run-typecheck.bat`
- `run-build.bat`
