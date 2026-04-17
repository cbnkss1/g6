# 제품·운영 메모 (대화 반영, 한국어)

이 문서는 **운영자(사용자)와의 대화**에서 합의·확인된 내용을 코드베이스에 남긴 것입니다.  
외부 사이트(참고용 데모 ADM 등)의 **실제 소스는 없으며**, UI 스크린샷·설명만으로는 동작을 추정하지 않고 **아래 규칙을 우선**합니다.

---

## 1. 참고 어드민(스크린샷)과 우리 스택

- 스크린샷에 나온 **데모 ADM**류는 **레퍼런스 IA·화면 구성**으로만 사용합니다.
- **SLOTPASS / `game_platform`** 실제 구현은 `web-admin`(관리자), `web-public`(플레이어), `app`(FastAPI)를 기준으로 합니다.

### 참고로 정리한 메뉴(레퍼런스)

| 구역 | 예시 메뉴 |
|------|-----------|
| 상단 | 충전·환전·손익·베팅·당첨·롤링·보유머니·알림 카운트 등 |
| 좌측 | 대시보드, 시스템, 충환전, 파트너, 회원, 베팅·롤링(또는 폴링) 현황, 정산 통계, 설정(사이트·게임·관리자), 로그아웃 |
| 설정 | 사이트 설정(입출금 시간·최소금액·점검·로그인 실패 정책, **레벨별 첫충/매충/지인충**), 게임사 제한, 관리자·허용 IP |

---

## 2. 요구사항 (우선순위·백로그)

### 2.1 대시보드 — **실시간에 가깝게**

- **목표:** 관리자가 보는 금일 집계·접속 등이 **느리게 밀리지 않게** 갱신.
- **구현 방향 (현재 스택):**
  - **1차:** 관리자 WebSocket 메시지 `dashboard_tick`, `settlement`, `bet_log` 수신 시 스토어·React Query 갱신 (`useAdminDashboardSocket`, `AdminRealtimeBridge`, `useDashboardLiveStore`).
  - **2차(폴백):** REST `GET /admin/dashboard/today` 주기 폴링. 제품 요구에 맞춰 간격은 코드에서 조정 (문서 시점: 약 15초 폴백).
  - **서버 푸시 보강:** 집계만 푸시할 때는 내부 키로 `POST /internal/broadcast-dashboard` 호출 가능.

### 2.2 플레이어 화면 — **열고 닫음**

- **목표:** 라이브·배팅 UI에서 패널을 **접었다 펼칠** 수 있게 해 시야·스크롤 부담을 줄임.
- **`web-public` 파워볼 예시:** `배팅 접기/펼치기`(`betPanelOpen`), 우측·하단 블록 `사이드 접기/펼치기`(`sideOpen`), `영상 크게`(`liveTall`) 등.
- **bbs** `game_powerball_live` 등 별도 스킨이 있으면 동일 UX 원칙을 맞추면 됩니다.

### 2.3 관리자 권한 — **전체권한 / IP 허용**

- **백로그:** 나중에 구현해도 됨. 추가 요청 시 세분화(메뉴별 권한, IP 화이트리스트 강제 등).

---

## 3. 입금 보너스·머니 관련 **운영 규칙 (확정)**

### 3.1 용어

- **첫충전(첫충):** 첫 입금에 붙는 보너스 비율.
- **매충전:** 반복 입금(재충)에 붙는 비율로 해석 (화면 표기: 매충전).
- **지인충전:** 지인(추천 연결) 입금에 붙는 비율.

### 3.2 지급·동작 원칙 (**확정**)

- 회원이 **신청**하고, 관리자가 **승인**했을 때 **관련된 모든 처리**(보너스 지급·잔액 반영·이후 롤링·정산과 연동되는 부분 등)가 **그 시점에 일관되게** 동작한다.
- 구현 시에는 **신청 상태 → 승인 액션 → 단일 트랜잭션/도메인 이벤트**로 묶어 감사·재처리 가능하게 하는 것을 권장합니다.

---

## 4. 구현 파일 참고 (빠른 링크)

| 영역 | 경로 |
|------|------|
| 금일 집계 API | `app/api/admin_router.py` — `admin_dashboard_today` |
| 집계 로직 | `app/services/dashboard_stats.py` — `get_today_totals` |
| 대시보드 WS | `web-admin/hooks/useAdminDashboardSocket.ts`, `components/admin/AdminRealtimeBridge.tsx` |
| 대시보드 카드 폴링 | `web-admin/components/admin/DashboardCards.tsx` |
| 내부 브로드캐스트 | `app/api/internal_router.py` — `internal_broadcast_dashboard_tick` |
| 플레이어 파워볼 UI | `web-public/app/powerball/page.tsx` |
| 사이트 운영 정책(JSON) | `app/models/site_config.py` — `site_policies` · `app/services/site_policy_service.py` |
| 정책 API | `GET/PATCH /admin/site/policies` (`admin_router.py`) |
| 정책 UI | `web-admin/app/settings/site-policy/page.tsx` |
| 레퍼런스 대비 로드맵 | `docs/ADMIN_PARITY_ROADMAP_KO.md` |

### `site_policies` JSON (요약)

- `maintenance`: `{ enabled, message }` — 켜면 입출금 **신청** 503.
- `deposit`: `{ time_block: [HH:MM, HH:MM], min, unit }` — 서울 시간 불가 구간, 최소·(최소 대비) 단위.
- `withdraw`: `{ time_block, min, reapply_hours_after_approve }` — 출금 승인 시각 기준 쿨다운.
- `level_bonuses`: 배열 — **입금 승인 시** 첫충/매충(입금자)·지인충(추천인) 보너스 지급.
- `game_providers`: `{ casino: { key: bool }, slot: { … } }` — 게임사 ON/OFF (외부 API에서 소비 예정).

---

## 5. 변경 이력

- 대화 반영: 대시보드 실시간성, 플레이어 패널 열고 닫음, 권한·IP는 백로그, **보너스는 신청+승인 시 일괄 동작** 문서화.
