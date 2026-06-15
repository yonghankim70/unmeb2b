@echo off
title U&ME B2B WebApp Server (UNMEB2B.COM)
chcp 65001 > nul
echo ===================================================================
echo   U&ME B2B WebApp 개발 서버 및 Cloudflare 터널 구동기
echo ===================================================================
echo.
echo  [터널 상태] 
echo  Cloudflare Tunnel 서비스가 백그라운드에서 실행 중입니다.
echo  (컴퓨터 부팅 시 자동으로 활성화되어 있습니다.)
echo.
echo  [접속 주소]
echo  - 내부 접속: http://localhost:3000
echo  - 외부 접속: https://unmeb2b.com
echo.
echo ===================================================================
echo.
echo  Next.js 개발 서버를 실행합니다...
echo.
npm run dev

