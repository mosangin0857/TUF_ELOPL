/** 아직 구현 전인 화면에 표시할 안내 (구현하면 해당 항목 삭제) */
export const PLACEHOLDERS: Record<string, { title: string; body: string; items?: string[] }> = {
  "elo/data-center": {
    title: "데이터센터",
    body: "기존 /data-center 화면을 옮겨올 자리입니다.",
    items: ["선수 프로필 · 상대전적 · 최근 20경기", "종족·맵별 승률 차트", "런처 사용 통계 · 전적 등록 추세"],
  },
  "elo/history": { title: "전적 기록", body: "경기유형·시즌·티어 필터가 있는 전체 전적 테이블.", items: ["필터 URL 공유 · 테이블 캡처"] },
  "elo/weekly": { title: "위클리 베스트", body: "주간 ELO 상승 TOP 5." },

  pl: { title: "일정", body: "TFPL 시즌 경기 일정. PL 운영진이 등록하며 일정 메뉴 달력에도 자동으로 올라갑니다." },
  "pl/standings": { title: "순위", body: "팀 순위표. 1~4위 플레이오프 진출, 최근 5경기 승패." },
  "pl/teams": { title: "팀 · 선수단", body: "참가 팀 로고 · 슬로건 · 팀장/부팀장 · 로스터." },
  "pl/results": { title: "경기 결과", body: "세트별 결과와 맵, 승자." },
  "pl/predictions": { title: "승부예측", body: "기존 tufpl 승부예측 기능이 들어갈 자리입니다." },
  "pl/rules": { title: "규정", body: "리그 운영 규정, 맵풀, 엔트리 규칙." },

  solo: { title: "개인리그", body: "개인리그 시즌 개요. 조별리그 → 토너먼트 방식을 가정했습니다." },
  "solo/groups": { title: "조편성 · 대진표", body: "조별리그 표와 토너먼트 브라켓." },
  "solo/schedule": { title: "일정 · 결과", body: "개인리그 경기 일정과 세트 결과." },
  "solo/hall-of-fame": { title: "명예의 전당", body: "역대 개인리그 우승 · 준우승 기록." },
  "solo/rules": { title: "규정", body: "개인리그 운영 규정과 맵풀." },

  "admin/bj": { title: "BJ 관리", body: "클랜 BJ 이름과 SOOP 방송국 링크 등록. 대문 라이브 섹션에 표시됩니다." },
  "admin/site": { title: "사이트 설정", body: "사이트 정보, 대문 구성, 시즌, ELO 설정 등." },

  notice: { title: "공지 · 건의", body: "게시판. 공지 작성 시 '대문 노출'을 켜면 클랜하우스에 최신순으로 표시됩니다." },
  schedule: { title: "일정", body: "월간 달력. 프로리그 · 클랜 행사 · ELO 일정을 한눈에." },
}
