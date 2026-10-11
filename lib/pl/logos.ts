/**
 * 프로리그 팀 로고 — public/pl/team-logos/<파일>.webp (256px, 원본은 D:\mosi\TuF\TFPL4_logos)
 * 팀 이름(pl_teams.name)과 파일을 짝짓는다. 목록에 없는 팀은 지금처럼 팀 색 동그라미 + 첫 글자.
 * 새 시즌에 팀이 바뀌면 파일을 넣고 여기에 한 줄 추가.
 */
const TEAM_LOGOS: Record<string, string> = {
  티트와라트: "titwarat",
  신과함께: "singwahamkke",
  만능브라더스: "manneung",
  룡어게인: "ryongagain",
  BRG: "brg",
  RIP: "rip",
}

export function teamLogo(teamName: string): string | null {
  const file = TEAM_LOGOS[teamName.trim()]
  return file ? `/pl/team-logos/${file}.webp` : null
}
