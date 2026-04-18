# 늑구런 (Neukgu Run)

대전 오월드를 탈출한 늑구의 10일간의 질주를 모티브로 한 모바일 엔드리스 러너.

## 🎮 게임 개요

- **장르**: 엔드리스 러너
- **플랫폼**: Android
- **엔진**: Godot 4.3
- **조작**: 화면 터치 (점프, 2단 점프 지원)
- **목표**: 포획팀 피해서 최대한 오래 도망치기

## 📦 프로젝트 구조

```
.
├── project.godot              # Godot 프로젝트 설정
├── export_presets.cfg         # Android export 프리셋
├── scenes/
│   ├── main.tscn              # 메인 게임 씬
│   ├── player.tscn            # 늑구 (플레이어)
│   └── obstacle.tscn          # 장애물
├── scripts/
│   ├── main.gd                # 게임 루프, 스폰, 점수
│   ├── player.gd              # 점프, 중력, 사망
│   └── obstacle.gd            # 이동, 충돌
├── assets/                    # 스프라이트, 사운드
└── .github/workflows/
    └── build-android.yml      # 클라우드 APK 빌드
```

## 🚀 APK 빌드 (PC 없이)

1. 이 브랜치에 커밋이 푸시되면 GitHub Actions가 자동으로 APK를 빌드합니다.
2. GitHub 리포 → **Actions** 탭 → 최신 `Build Android APK` 워크플로우 선택
3. 하단 **Artifacts** 에서 `neukgu-run-apk` 다운로드
4. 폰에 APK 설치 (설정 → "출처를 알 수 없는 앱 설치 허용" 필요)

수동 빌드도 가능: Actions 탭 → `Build Android APK` → `Run workflow` 버튼.

## 💻 로컬 개발 (PC 있을 때)

1. [Godot 4.3](https://godotengine.org/download) 설치
2. Godot 에디터에서 `project.godot` 열기
3. `F5` 로 실행
4. Android 빌드를 로컬에서 하려면:
   - Android Studio 설치 + Android SDK 설정
   - Godot → Editor → Editor Settings → Export/Android 경로 지정
   - Project → Export → Android → Export APK

## 🎨 AI 스프라이트 교체 가이드

현재는 컬러 박스로 된 임시 늑구/장애물입니다. AI로 생성한 스프라이트로 교체하려면:

### 1. 늑구 스프라이트 (플레이어)

**추천 프롬프트 (ChatGPT / Midjourney / Stable Diffusion)**
```
2D pixel art side-view running wolf character, cute friendly face,
light beige fur, small black eyes, upright ears, transparent background,
game asset sprite sheet, 4-frame running animation, 128x128 per frame
```

- 결과물을 `assets/player_run.png` 로 저장 (투명 배경 PNG)
- 점프 포즈: `assets/player_jump.png`
- `scenes/player.tscn` 에서 `ColorRect` 노드들을 지우고 `Sprite2D` 추가 후 텍스처 할당

### 2. 장애물 스프라이트

- 동물원 직원, 포획 그물차, 나무 등 다양하게
- 프롬프트 예: `2D pixel art zoo keeper with net, side view, transparent background`
- `assets/obstacle_keeper.png`, `assets/obstacle_net.png` 등으로 저장
- `scenes/obstacle.tscn` 의 `ColorRect` 를 `Sprite2D` 로 교체

### 3. 배경

- 대전 오월드 풍경, 도시 거리, 야산 등 여러 배경 루프
- `scenes/main.tscn` 의 `Sky` `ColorRect` 를 배경 이미지로 교체

## 💰 수익화 로드맵 (TODO)

- [ ] Godot AdMob 플러그인 연동 (`shin-degica/Godot-Android-Admob-Plugin`)
- [ ] 게임 오버 시 리워드 광고로 부활
- [ ] 30초마다 배너 광고
- [ ] "광고 제거" 인앱결제 (2,500원)
- [ ] 코인 시스템 + 스킨 해금 (회색 늑구 / 흰 늑구 / 검은 늑구)

## 📱 플레이스토어 출시 체크리스트

- [ ] 구글 플레이 콘솔 개발자 계정 ($25)
- [ ] 앱 서명 키 생성 및 관리 (debug 키스토어 아님)
- [ ] `export_presets.cfg` 에 release 키스토어 설정
- [ ] 앱 아이콘 512x512
- [ ] 스크린샷 (최소 2장)
- [ ] 짧은/긴 설명 한국어
- [ ] 개인정보 처리방침 URL
- [ ] 콘텐츠 등급 설문

## 🐾 크레딧

- 원작 늑구: 대전 오월드 (2026년 4월, 무사 생포 🎉)
- 게임 제작: Made with Claude Code + Godot Engine
