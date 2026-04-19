# 늑구런 (Neukgu Run)

대전 동물원을 탈출한 늑구의 10일간의 질주를 모티브로 한 HTML5 엔들리스 러너 (픽션).

🔗 **Live**: https://neukgu-run.pages.dev/

## 게임 개요

- **장르**: 엔들리스 러너 / 밈 게임
- **플랫폼**: 웹 (모바일·데스크탑 브라우저)
- **조작**: 화면을 좌우로 쓸어서 (또는 ← → 키) 늑구 이동
- **목표**: 사육사·포획반 그물·수의사 마취총을 피해 북쪽으로 질주, 호르무즈 해협 보스 돌파 후 반전 엔딩

## 프로젝트 구조

```
.
├── web/                       # 배포 대상 (Cloudflare Pages)
│   ├── index.html
│   ├── game.js                # 메인 게임 로직
│   ├── style.css
│   ├── icon.svg
│   ├── manifest.webmanifest
│   ├── _headers               # Cloudflare 캐시·보안 헤더
│   └── og-image-generator.html
└── README.md
```

## 개발 · 배포 플로우

- **dev 브랜치**: `claude/indie-game-wolf-escape-4dijM` — 푸시 시 Cloudflare가 프리뷰 빌드 자동 생성
  - 프리뷰 alias: `claude-indie-game-wolf-escap.neukgu-run.pages.dev`
- **prod 브랜치**: `main` — 푸시 시 `neukgu-run.pages.dev` 라이브 반영

## 로컬 실행

```bash
cd web && python3 -m http.server 8000
# http://localhost:8000
```

---

※ 본 게임은 픽션이며, 실제 인물·단체·사건과는 무관합니다.
