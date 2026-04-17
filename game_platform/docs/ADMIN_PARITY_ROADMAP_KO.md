# 어드민 기능 패리티 로드맵 (레퍼런스 대비)

`game_platform`에 **외부 데모 ADM**과 유사한 운영 기능을 쌓아가는 순서입니다.

## 이미 있는 것

- 메인 대시보드(금일 배팅·롤링 등) + WebSocket + REST 폴백
- 입출금 신청·승인·거절, 감사 로그, OTP, 팀/롤링, 정산·배팅 내역, 회원, 배팅 한도

## 구현 완료 (최신)

| 항목 | 설명 |
|------|------|
| `site_policies` | 점검·충환 시간·금액·출금 쿨다운·`level_bonuses`·`game_providers` |
| 입출금 신청 검증 | 플레이어·관리자 대리 신청 시 정책 검증 (Asia/Seoul) |
| **입금 승인 시 보너스** | `level_bonuses` + `User.member_level` — 첫충/매충은 입금자, 지인충은 추천인 잔액 + 원장 |
| **대시보드 입출금 지표** | `pending_deposit_requests`, `pending_withdraw_requests`, 금일 승인 합계 |
| **헤더 배지** | 충전/환전 대기·접속 수 (대시보드 API) |
| **게임사 제한 UI** | `/settings/vendor-gates` → `site_policies.game_providers` 저장 |
| **어드민 IP** | `gp_admin_allowed_ips` + 로그인 시 허용 검사 + `/settings/admin-ips` |
| **회원 레벨** | `member_level` 컬럼, 목록·한도 화면에서 수정, 보너스 테이블과 연동 |
| **실시간 갱신** | 입출금 처리 시 `dashboard_refresh` WS → 대시보드 쿼리 무효화 |

## 선택적 후속

- 외부 카지노/슬롯 API가 `game_providers` 플래그를 실제로 읽어 차단
- 대시보드에 손익·보유알 등 레퍼런스 전량 지표(별도 원장·집계 설계)
- 어드민 계정 다수·세분 권한 (현재는 owner/staff/super + IP)

## 마이그레이션

```bash
cd game_platform && alembic upgrade head
```
