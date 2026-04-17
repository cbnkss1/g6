"""플랫폼 고정 UUID (마이그레이션·시드와 동기화)."""
import uuid

# 기본 분양 사이트 (마이그레이션·시드와 동기화)
DEFAULT_SITE_ID = uuid.UUID("a0000001-0000-4000-8000-000000000001")
# 토토 비활성 테스트용 테넌트
TEST_SITE_NO_TOTO_ID = uuid.UUID("b0000001-0000-4000-8000-000000000001")

USER_ROLE_SUPER_ADMIN = "super_admin"
USER_ROLE_OWNER = "owner"
USER_ROLE_STAFF = "staff"
USER_ROLE_PLAYER = "player"

# 어드민 라우트 허용 역할 (플레이어 JWT 차단용)
ADMIN_ROLES = frozenset({USER_ROLE_SUPER_ADMIN, USER_ROLE_OWNER, USER_ROLE_STAFF})

# 도메인: gp_users 는 모두 동일한 ‘회원’ 엔터티.
# - 추천인 체인(referrer_id) = 다단계 팀 네트워크
# - 요율 임계값 이상이면 정산·롤링 네트워크 참여 (partner_utils)
