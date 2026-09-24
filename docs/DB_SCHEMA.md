# TuFELO DB 스키마

Supabase 프로젝트: `TuFELO`
기준일: 2026-09-23 (information_schema 조회 결과)

## 규칙

- 아래 테이블은 전부 **ELO 사이트 소유**다. 프로리그 쪽에서는 읽기/참조만 하고, 수정이 필요하면 팀원과 먼저 협의한다.
- 신규 테이블 접두사(소문자): 프로리그 `pl_` (예: `pl_teams`), 개인리그 `solo_` — 레포 CLAUDE.md 규칙과 동일
- 선수 정보는 복제하지 않고 `members.id`를 FK로 참조한다.

## 관계도

```
members ─┬─< matches (player1_id, player2_id, winner_id)
         ├─< season_rankings (member_id)
         └─< member_decorative_badges (member_id) >─ decorative_badges

seasons ─┬─< matches (season_id)
         └─< season_rankings (season_id)

suggestions ─< suggestion_replies (suggestion_id)

독립: admins, admin_logs, daily_visitors, settings, site_notice
```

## 핵심 테이블

### members — 클랜원 (프로리그에서도 선수 마스터로 사용)
| 컬럼 | 타입 | null | 기본값 | 비고 |
|---|---|---|---|---|
| id | uuid | N | gen_random_uuid() | PK |
| name | text | N | | 닉네임 |
| race | text | N | | `P` / `T` / `Z` |
| tier | smallint | N | | 1~4, 1이 최상위 |
| elo | integer | N | 1650 | |
| wins | integer | N | 0 | |
| losses | integer | N | 0 | |
| streak | integer | N | 0 | 연승/연패 |
| is_active | boolean | N | true | 활동 여부 |
| admin_memo | text | Y | | |
| last_launcher_used_at | timestamptz | Y | | ELO 런처 사용 기록 |
| created_at / updated_at | timestamptz | N | now() | |

### matches — ELO 1:1 경기 기록
| 컬럼 | 타입 | null | 비고 |
|---|---|---|---|
| id | uuid | N | PK |
| player1_id / player2_id / winner_id | uuid | N | → members.id |
| map_name | text | N | |
| played_date | date | N | |
| played_at | timestamptz | Y | |
| player1_elo_before / player2_elo_before | integer | Y | |
| player1_elo_delta / player2_elo_delta | integer | Y | |
| match_type | text | Y | |
| season_id | uuid | Y | → seasons.id |
| user_ip | text | Y | |
| created_at | timestamptz | N | |

### seasons — ELO 시즌
| 컬럼 | 타입 | null |
|---|---|---|
| id | uuid | N |
| name | text | N |
| start_date | date | N |
| end_date | date | Y |
| created_at | timestamptz | Y |

### season_rankings — 시즌 종료 시 최종 순위 스냅샷
id, season_id(→seasons), member_id(→members), final_elo, final_wins, final_losses, rank, created_at

## 관리자 / 운영

### admins — 자체 관리자 계정 (Supabase Auth 아님)
| 컬럼 | 타입 | null | 기본값 |
|---|---|---|---|
| id | uuid | N | gen_random_uuid() |
| username | text | N | |
| password_hash | text | N | |
| role | text | N | 'admin' |
| created_at | timestamptz | Y | now() |

### admin_logs — 관리자 작업 기록
id, admin_username, action, target, detail, created_at

## 새 사이트가 추가한 컬럼

### members 로그인 컬럼 (추가: `docs/sql/001_members_login.sql`)
| 컬럼 | 타입 | null | 기본값 | 비고 |
|---|---|---|---|---|
| pin_hash | text | Y | | scrypt 해시. null이면 첫 로그인 PIN이 비밀번호가 됨 |
| pin_set_at | timestamptz | Y | | |
| pin_failed_attempts | integer | N | 0 | PIN 연속 실패 횟수 |
| pin_locked_until | timestamptz | Y | | 5회 실패 시 10분 잠금 |
| session_version | integer | N | 0 | 올리면 그 선수의 기존 로그인이 전부 풀림 |
| last_login_at | timestamptz | Y | | |
| role | text | N | 'member' | `member` / `admin` / `super` (check 제약 `members_role_check`, `docs/sql/002_admin_roles.sql`). 관리자 구분 확정 — CLAUDE.md "관리자 구분" |

- members는 anon 전체 조회가 열려 있어 이 컬럼들도 anon으로 조회된다. PIN은 중요 정보로 취급하지 않기로 결정
- 쓰기는 `app/auth/actions.ts`(로그인)에서만

### notices — 공지 (추가: `docs/sql/003_notices.sql`)
| 컬럼 | 타입 | null | 기본값 | 비고 |
|---|---|---|---|---|
| id | uuid | N | gen_random_uuid() | PK |
| title | text | N | | 1~100자 |
| body | text | N | '' | 5,000자 이내 |
| show_on_home | boolean | N | false | 클랜하우스 대문 공지 줄에 표시 (최신순 최대 3개) |
| author_member_id | uuid | Y | | → members.id (on delete set null) |
| author_name | text | N | | 작성 당시 닉네임 |
| created_at / updated_at | timestamptz | N | now() | |

- RLS: 조회는 누구나(`notices_select_all`), 쓰기는 서버(service_role)에서만 — `app/notice/actions.ts`

### suggestions 추가 컬럼 (`docs/sql/003_notices.sql`)
| 컬럼 | 타입 | null | 비고 |
|---|---|---|---|
| member_id | uuid | Y | → members.id. 새 사이트에서 로그인해 쓴 건의만 채워짐 (기존 사이트 글은 null) |

### clan_bjs — 클랜 BJ (추가: `docs/sql/004_clan_bjs.sql`)
| 컬럼 | 타입 | null | 기본값 | 비고 |
|---|---|---|---|---|
| id | uuid | N | gen_random_uuid() | PK |
| name | text | N | | 화면에 보일 BJ 이름 (1~30자) |
| soop_id | text | N | | SOOP 방송국 아이디, UNIQUE, 소문자 (`ch.sooplive.co.kr/<soop_id>`) |
| sort_order | integer | N | 0 | 작을수록 앞 |
| is_visible | boolean | N | true | 끄면 대문에서 숨김 |
| created_at / updated_at | timestamptz | N | now() | |

- RLS: 조회는 누구나(`clan_bjs_select_all`), 쓰기는 서버(service_role)에서만 — `app/admin/bj/actions.ts`
- 방송 중 여부 · 제목 · 시청자 · 썸네일은 저장하지 않음 → SOOP Open API (`lib/soop.ts`)
- 클랜원(`members`)과 연결하지 않음 (이름 + 링크만)

## 기타

| 테이블 | 컬럼 | 용도 |
|---|---|---|
| decorative_badges | id, label, sort_order, accent('amber'), created_at | 장식 뱃지 정의 |
| member_decorative_badges | badge_id, member_id | 멤버-뱃지 연결 (N:M) |
| daily_visitors | visit_date, count | 일별 방문자 수 |
| settings | id(=1), current_version, screp_url, notice, is_maintenance | 단일 행 설정 (런처 버전, 점검 모드) |
| site_notice | id(=1), title, items(jsonb), updated_at | 단일 행 공지 |
| suggestions | id, category, content, nickname, user_ip, created_at | 건의사항 |
| suggestion_replies | id, suggestion_id, admin_username, content, created_at | 건의 답변 |

## 제약조건

| 테이블 | 제약 |
|---|---|
| members | `name` UNIQUE, `race` ∈ {T, P, Z}, `tier` 1~4 |
| matches | player1 ≠ player2, winner ∈ {player1, player2} |
| season_rankings | (season_id, member_id) UNIQUE |
| admins | `username` UNIQUE, `role` ∈ {admin, creator, guest} |
| suggestions | `category` ∈ {데이터수정, 기능건의, 기타} |
| settings / site_notice | id = 1 (단일 행) |

tier: **1이 최상위**, 4가 최하위.

## anon 키로 조회 가능한 테이블

`members`, `matches`, `seasons`, `season_rankings`, `decorative_badges`, `member_decorative_badges`, `settings`

- 그 외 테이블과 모든 쓰기 작업은 서버 액션(서버 전용 키)으로 처리한다.
- 새로 만드는 `pl_` / `solo_` 테이블을 화면에서 조회하려면 RLS를 켜고 anon `select` 정책을 추가해야 한다.

## DB 함수 (public, pg_trgm 확장 함수 제외)

| 함수 | 인자 | 용도(추정) |
|---|---|---|
| apply_season_match_member_updates | winner_id, loser_id, winner_elo, loser_elo, winner_streak, loser_streak | 경기 후 멤버 ELO·전적 반영 |
| apply_season_match_member_stats_only | winner_id, loser_id, winner_streak, loser_streak | ELO 변경 없이 전적만 반영 |
| apply_season_match_undo_stats | player1_id, player2_id, winner_id, delta1, delta2 | 경기 취소 시 되돌리기 |
| get_data_center_summary(_v2) | 시즌/맵/타입/종족/티어/선수 필터 | 데이터센터 통계 요약 |
| get_data_center_detail_v2 | 동일 | 데이터센터 상세 |
| get_data_center_season_trend(_v2) | 동일 | 시즌별 추이 |
| get_data_center_page_data | match_limit | 데이터센터 페이지 일괄 로드 |
| get_distinct_match_meta | - | 맵/매치타입 목록 |
| increment_daily_visitor | date | 방문자 카운트 |
| mark_launcher_used | member_name | 런처 사용 기록 |
| set_updated_at | - | updated_at 트리거 |

- 관리자 로그인 검증용 함수는 없다 → 서버 코드에서 password_hash 검증하는 것으로 보임
- pg_trgm 확장 사용 중 (닉네임 유사 검색용)
- 프로리그 쪽에서 ELO 함수는 호출하지 않는다 (ELO 수치 변경 방지)
