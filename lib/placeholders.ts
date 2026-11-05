/** 아직 구현 전인 화면에 표시할 안내 (구현하면 해당 항목 삭제) */
export const PLACEHOLDERS: Record<string, { title: string; body: string; items?: string[] }> = {
  "pl/predictions": { title: "승부예측", body: "기존 tufpl 승부예측 기능이 들어갈 자리입니다." },

  solo: { title: "개인리그", body: "개인리그 시즌 개요. 조별리그 → 토너먼트 방식을 가정했습니다." },
  "solo/groups": { title: "조편성 · 대진표", body: "조별리그 표와 토너먼트 브라켓." },
  "solo/schedule": { title: "일정 · 결과", body: "개인리그 경기 일정과 세트 결과." },
  "solo/hall-of-fame": { title: "명예의 전당", body: "역대 개인리그 우승 · 준우승 기록." },
  "solo/rules": { title: "규정", body: "개인리그 운영 규정과 맵풀." },

  "admin/site": { title: "사이트 설정", body: "사이트 정보, 대문 구성, 시즌, ELO 설정 등." },

  schedule: { title: "일정", body: "월간 달력. 프로리그 · 클랜 행사 · ELO 일정을 한눈에." },
}
