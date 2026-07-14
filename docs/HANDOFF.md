# 프로젝트 인수인계 문서 (HANDOFF)

> 새 대화창에서 작업을 이어가기 위한 문서. 2026-07-14 기준으로 시스템 전체 구조,
> 지금까지의 작업 내역, 제약 사항, 진행 방법을 정리했다.

## 1. 프로젝트 개요

- **이름**: maple-boss-revenue — 메이플스토리 보스 결정석(강렬한 힘의 결정) 수익 계산기 + 주간 체크리스트
- **저장소**: https://github.com/LYJ91/maple-boss-revenue (`main` 브랜치)
- **배포**: Vercel — https://maple-boss.vercel.app
  - `main`에 push하면 **자동 배포**된다 (별도 배포 명령 불필요, 보통 ~1분 소요)
  - 배포 확인: `vercel ls maple-boss-revenue` 또는 사이트 HTML의 번들 해시가 로컬 빌드와 같은지 확인
  - Vercel CLI 로그인/링크 완료 상태. `vercel env pull .env.local`로 환경변수를 받을 수 있다
- **스택**: React 19 + TypeScript + Vite 8, 테스트는 Vitest, 상태는 전부 **localStorage** (백엔드 DB 없음)
- **서버리스**: `api/*.ts` (Vercel Functions, @vercel/node) — 넥슨 Open API 프록시 용도
- **환경변수**: `NEXON_API_KEY` (Vercel에 설정됨, 사이트 운영자의 넥슨 API 키)

### 실행/검증 명령

```bash
npm run dev      # 로컬 개발 서버 (단, /api/*는 vite에서 동작 안 함 — vercel dev 필요)
npm test         # vitest 37개 테스트
npm run build    # tsc --noEmit + vite build (커밋 전 필수 통과)
```

## 2. 화면 구성 (탭 순서 중요)

해시 라우팅 (`src/lib/router.ts`). 탭 순서: **체크리스트(기본 랜딩) → 보스수익 → 장비확인**

| 탭 | 해시 | 파일 | 내용 |
|---|---|---|---|
| 체크리스트 | `#/todo` (기본) | `src/pages/TodoPage.tsx` | 캐릭터×주간숙제 그리드, 계정 연동, API 자동 체크 |
| 보스수익 | `#/calc` | `src/App.tsx` + `src/components/BossPanel.tsx` 등 | 캐릭터별 주간/월간 보스 선택과 수익 계산, 주간 수익 기록 |
| 장비확인 | `#/lookup`, `#/c/캐릭터명` | `src/pages/CharacterPage.tsx` | 캐릭터 상세(장비/스탯/유니온/스킬) |

## 3. 넥슨 Open API 연동 (핵심)

### 3.1 서버리스 프록시 (`api/`)

모든 넥슨 호출은 `https://open.api.nexon.com/maplestory/v1/*`를 프록시로 경유한다.

| 엔드포인트 | 키 | 용도 |
|---|---|---|
| `GET /api/character?name=` | 서버 키(NEXON_API_KEY) | 캐릭터명 → ocid + 기본 정보 (1시간 CDN 캐시) |
| `GET /api/detail?ocid=&parts=` | 서버 키 | 캐릭터 상세 파트 일괄 조회 |
| `GET /api/account` (헤더 `x-user-api-key`) | **방문자 키** | 키 소유 계정의 전체 캐릭터 목록 |
| `GET /api/scheduler?ocid=` (헤더 `x-user-api-key`) | **방문자 키** | 스케줄러(주간 숙제/보스 처치 현황) 조회 |

### 3.2 스케줄러 API 제약 (실측으로 확인함)

- 넥슨이 2026-06-25 오픈한 `GET /maplestory/v1/scheduler/character-state?ocid=` 사용
- **키 소유 계정의 캐릭터만 조회 가능**. 다른 계정 캐릭터는 400 `OPENAPI00004` 반환
  → 그래서 사용자가 계정별 API 키를 등록하는 구조를 만들었다
- 2026-06-25 이후 1회 이상 접속한 캐릭터만 조회 가능
- 실시간 조회는 `date` 파라미터를 **빼고** 호출해야 한다 (오늘 날짜를 넣으면 400). 과거 조회는 최대 14일
- 응답의 `weekly_boss_clear_count`(주간 보스 처치 수 카운터)는 **보스별 complete 플래그와 어긋나는 사례가 있다**
  (실제 12마리인데 11로 응답) → 카운터를 쓰지 말고 `boss_contents[].complete_flag`에서 직접 세도록 구현함
- `boss_contents`: 보스별 `{content_name, difficulty(easy~extreme), cycle(bossWeekly|bossMonthly), complete_flag}`
- `weekly_contents`: 에픽던전/길드 수로/플래그 등 `{content_name, type, registration_flag, now_count, max_count}`
  - 미등록(`registration_flag=false`) 항목의 `now_count`는 신뢰 불가 → 집계에서 제외함
- 넥슨 보스명과 앱 보스명의 공백 차이 존재 (넥슨 "블러디퀸" vs 앱 "블러디 퀸") → 공백 제거 정규화로 매핑
- 앱에 없는 보스(예: "시즌 보스 메이린")는 무시
- 리셋: 주간 보스·에픽던전 = 목요일 0시 / 길드 수로·플래그 = 월요일 0시 / 검은 마법사 = 월간

### 3.3 클라이언트 캐시

`src/lib/scheduler.ts` — ocid별 **10분 localStorage 캐시** + 동시 요청 합치기.
체크리스트 탭의 "현황 새로고침" 버튼은 캐시 무시(force) 조회.

## 4. 데이터 모델 / localStorage 키

| 키 | 내용 |
|---|---|
| `maple-boss-revenue:v1` | 보스수익 탭 상태 `{characters: Character[], selectedId}` |
| `maple-boss-revenue:todo:v1` | 체크리스트 `{items, characters, checks, accounts, version}` — **version=2** (v2 마이그레이션: '플래그' 항목 제거) |
| `maple-boss-revenue:scheduler-cache:v1` | ocid → 스케줄러 응답 10분 캐시 |
| `maple-boss-revenue:history:v1` | 주간 수익 기록 `WeekRecord[]` (최대 52주) |

핵심 타입 (`src/types.ts`):

- `Character { id, name, entries: BossEntry[], meta?: CharacterMeta }`
- `CharacterMeta { world, job, level, image, ocid?, accountId? }` — `ocid`+`accountId`가 있어야 API 연동 캐릭터
- `BossEntry { bossId, difficulty, partySize, clearsPerWeek }` — clearsPerWeek는 과거 일일 보스용 잔재(호환 유지)
- `TodoAccount { id, label, apiKey }` — 사용자가 등록한 넥슨 API 키. **브라우저에만 저장, 서버 저장 안 함**
- `TodoCharacter { id, name, meta?, disabledItemIds }`

## 5. 게임 규칙 (calc 로직, `src/lib/calc.ts` + `src/data/crystalData.ts`)

- **일일 보스는 다루지 않는다** (사용자 요청으로 완전 제거, 스케줄러 API도 미제공).
  과거 저장 데이터의 일일 보스 항목은 BOSS 데이터에 없으므로 계산에서 자동 무시된다
- 주간 보스: 캐릭터당 가격 높은 순 **12개**까지 판매 집계 (`RULES.weeklyBossSellLimitPerCharacter`)
- 결정석 판매 제한 **90개는 "계정×월드" 그룹별로 각각** 적용 (`RULES.worldWeeklySellLimit`)
  - 그룹 키 = `meta.accountId + ':' + meta.world`. 계정 정보 없는 수동 캐릭터는 같은 월드끼리 한 그룹
  - 요약 카드에 그룹별 `n/90 (계정이름)` 칩 표시 (`AccountSummary.groups`)
- 월간 보스(검은 마법사)는 주간 수익이 아니라 **월간 수익**(주간×4 + 월간 보스)에만 합산
- 결정석 가격 데이터: 2026-06-18 공지 기준, `PricePoint.since`로 발효일 처리 (검마 7/1 가격 변동 반영)
- 최대 캐릭터 수 30 (`RULES.maxCharacters`) — 체크리스트 동기화 수용 목적으로 12→30 상향

## 6. 주요 기능 동작 방식

### 6.1 체크리스트 탭 (`TodoPage.tsx`)

- "캐릭터 목록 가져오기" 모달: 계정(이름+API 키) 등록 → `/api/account`로 전체 캐릭터 목록 → 다중 선택 추가.
  캐릭터명 검색 개별 추가도 가능(이 경우 API 연동 없음 = 수동 체크)
- 계정은 여러 개 등록 가능 (사용자는 본계정/부계정 2개 사용 중)
- 기본 항목: 주간보스(목) / 수로(월) / 에픽던전(목) / 미니게임(월). 커스텀 항목 추가 가능
- **API 자동 체크** (`AUTO_ITEM_PROGRESS` in `scheduler.ts`):
  - `weekly-boss` → 보스별 complete 플래그 수 (n/12 표시)
  - `suro` → [길드] 지하 수로 now_count > 0
  - `epic-dungeon` → 등록된 에픽던전 클리어 수 (n/3 표시)
  - 자동 항목은 클릭 불가(API 값 우선), 연동 안 된 캐릭터는 수동 클릭 체크
- 체크 상태는 주차 키(리셋 요일별 YYYY-MM-DD)로 저장 → 주가 바뀌면 자동 리셋

### 6.2 보스수익 탭 (`App.tsx`)

- 진입 시 체크리스트 캐릭터를 **자동 동기화** (ocid 우선, 이름 보조 매칭. 없는 캐릭터 추가 + 메타 보강)
- 연동 캐릭터 전체의 스케줄러를 조회해 **실제 처치한 보스(난이도까지)를 entries에 자동 반영**
  (`entriesFromSchedule` — 미처치 보스는 해제, 기존 파티 인원 설정은 유지, 파티 인원은 API로 알 수 없어 기본 1인)
  - 연동 캐릭터의 주간/월간 보스 수동 변경은 다음 조회 때 API 기준으로 되돌아간다 (패널에 안내문 있음)
- 처치된 난이도 알약에 ✓, 보스명 옆 "격파" 태그 표시
- **주간 수익 기록** (`src/lib/history.ts` + `RevenueHistory.tsx`): 보스수익 탭이 계산될 때마다
  이번 주(목요일 키) 기록을 localStorage에 갱신. 주가 넘어가면 지난 주 기록이 동결되어 하단 목록에 남는다

## 7. 이번 대화에서 작업한 커밋 (main, 시간순)

1. `d2c4200` 체크리스트 왼쪽 항목 열 sticky 고정 (가로 스크롤 시)
2. `72069a6` 넥슨 스케줄러 연동: 계정 등록/캐릭터 가져오기, 자동 체크, `/api/scheduler`, 탭 순서 변경
3. `a445f1e` 체크리스트→보스수익 동기화 수정 (캐릭터 상한 12→30, ocid 매칭), '플래그' 항목 저장소 마이그레이션(v2)
4. `da6ea9b` 90개 판매 제한을 전역 → 계정×월드 그룹별로 변경
5. `b638d7e` 요약 카드에 계정별 `n/90` 칩 표시
6. `865445d` 실제 처치 보스(난이도 포함)를 entries에 자동 반영 → 수익 계산에 사용
7. `52cb219` 일일 보스 완전 제거 (데이터/UI/계산)
8. `550297c` "이번 주 처치" 칩 제거(주간 보스 n/12와 중복), 주간 보스 카운트를 보스별 플래그 기준으로 변경
9. (이번 커밋) 주간 수익 기록 기능 + 이 문서

## 8. 개발 시 주의사항 / 관례

- **사용자 규칙**: ① 재배포 필요한 수정이면 배포까지 확인할 것 ② 하드코딩 지양(필요 시 사용자 확인) ③ 우려되는 결함은 보고
- 커밋 전에 `npm test`와 `npm run build`(타입체크 포함) 통과 확인
- push하면 Vercel이 자동 배포 → 프로덕션 HTML의 번들 해시가 로컬 빌드 산출물과 일치하는지 확인하는 방식으로 검증해왔다
- 셸은 PowerShell 5 — `&&` 체이닝 불가, `;` 사용
- 테스트 파일: `calc.test.ts`(수익/제한), `scheduler.test.ts`(보스 매핑/자동 반영/진행도), `history.test.ts`, `presets.test.ts`, `week.test.ts`, `format.test.ts`
- 실데이터 검증이 필요하면 `vercel env pull .env.local`로 키를 받아 임시 스크립트로 넥슨 API를 직접 호출해 확인했다 (스크립트는 검증 후 삭제)
- 사용자 캐릭터 예시(본계정, 루나 월드): 꿀꾸링불독(Lv.291), 꿀꾸링썬콜, 꿀꾸리렌, 꿀꾸리레테, 꿀꾸릿보마 등 74캐릭터.
  부계정(스카니아): 7살캡틴, 8살렌 등 — 부계정 캐릭터는 부계정 키로만 스케줄러 조회 가능

## 9. 알려진 한계 / 사용자에게 안내한 내용

- 파티 인원은 API로 알 수 없어 자동 반영 시 기본 1인 → 사용자가 조정하면 이후에도 유지됨
- 스케줄러 10분 캐시 때문에 목요일 리셋 직후 최대 10분간 옛 데이터가 보일 수 있음
- 목요일 리셋 후 API를 다시 조회하면 주간보스는 0/12로 리셋되는 것이 정상 동작 (사용자 확인 완료)
- 에픽던전은 계정 공유 콘텐츠지만 API가 캐릭터 단위로 응답 → 캐릭터별 표시
- 넥슨 API 데이터 자체가 간헐적으로 부정확하다는 커뮤니티 리포트 있음

## 10. 파일 맵 (src)

```
src/
  App.tsx                  # 보스수익 탭 + 라우팅 셸 + 체크리스트 동기화/스케줄러 반영/수익 기록
  types.ts                 # 공용 타입
  index.css                # 전체 스타일 (단일 CSS 파일)
  data/crystalData.ts      # 보스/가격/규칙 데이터 (주간·월간만)
  data/presets.ts          # 주간 보스돌이 프리셋 (검밑솔~노칼이카)
  lib/calc.ts              # 수익 계산 (12개/90개 제한, 계정×월드 그룹)
  lib/scheduler.ts         # 스케줄러 클라이언트/캐시/보스 매핑/entries 자동 반영/체크리스트 진행도
  lib/history.ts           # 주간 수익 기록
  lib/todoStorage.ts       # 체크리스트 저장 (schema v2)
  lib/storage.ts           # 보스수익 탭 저장
  lib/week.ts              # 주차 키 (mon/thu 리셋)
  lib/nexon.ts             # /api/* 프록시 클라이언트
  lib/router.ts            # 해시 라우터 (기본 랜딩 = 체크리스트)
  pages/TodoPage.tsx       # 체크리스트 탭 (계정/캐릭터 가져오기 모달 포함)
  pages/CharacterPage.tsx  # 장비확인 상세
  components/              # BossPanel, SummaryBar, RevenueHistory, CharacterSidebar, ImportModal 등
api/
  character.ts / detail.ts / account.ts / scheduler.ts   # Vercel Functions (넥슨 프록시)
```
