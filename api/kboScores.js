export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const yyyy = today.getFullYear();
  const mm = pad(today.getMonth() + 1);
  const dd = pad(today.getDate());
  const dateStr = `${yyyy}${mm}${dd}`;

  // MLB Stats API KBO 팀명 매핑 (sportId=6)
  const TEAM = {
    'KIA Tigers': 'KIA', 'KT Wiz': 'KT', 'LG Twins': 'LG',
    'SSG Landers': 'SSG', 'NC Dinos': 'NC', 'Doosan Bears': '두산',
    'Lotte Giants': '롯데', 'Samsung Lions': '삼성',
    'Hanwha Eagles': '한화', 'Kiwoom Heroes': '키움',
    // 한글 혹시 올 경우
    'KIA': 'KIA', 'KT': 'KT', 'LG': 'LG', 'SSG': 'SSG', 'NC': 'NC',
    '두산': '두산', '롯데': '롯데', '삼성': '삼성', '한화': '한화', '키움': '키움',
  };
  const mapTeam = n => {
    if (!n) return n;
    if (TEAM[n]) return TEAM[n];
    for (const [k, v] of Object.entries(TEAM)) {
      if (n.includes(k) || k.includes(n)) return v;
    }
    return n;
  };

  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=6&date=${yyyy}-${mm}-${dd}&gameType=R&hydrate=linescore,boxscore`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        'Accept': 'application/json',
      }
    });

    const data = await r.json();
    const dates = data?.dates || [];
    const gamesRaw = dates.flatMap(d => d.games || []);

    if (!gamesRaw.length) {
      return res.status(200).json({ games: [], date: dateStr, note: '오늘 KBO 경기 없음', total: 0 });
    }

    const games = gamesRaw.map(g => {
      const away = g.teams?.away;
      const home = g.teams?.home;
      const ls = g.linescore || {};

      let status = 'SCHEDULED';
      const sc = g.status?.detailedState || '';
      if (['In Progress', 'Live', 'Manager Challenge'].includes(sc)) status = 'LIVE';
      else if (['Final', 'Game Over', 'Completed Early', 'Postponed'].includes(sc)) status = 'FINAL';

      // 이닝별 스코어
      const innings = ls.innings || [];
      const awayInnings = Array(9).fill(-1);
      const homeInnings = Array(9).fill(-1);
      innings.forEach((inn, i) => {
        if (i < 9) {
          awayInnings[i] = inn.away?.runs ?? -1;
          homeInnings[i] = inn.home?.runs ?? -1;
        }
      });

      // 한국시간 변환
      let time = '';
      if (g.gameDate) {
        const d = new Date(g.gameDate);
        time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
      }

      return {
        date: `${yyyy}-${mm}-${dd}`,
        time,
        away: mapTeam(away?.team?.name || ''),
        home: mapTeam(home?.team?.name || ''),
        stad: g.venue?.name || '',
        status,
        awayScore: away?.score ?? null,
        homeScore: home?.score ?? null,
        awayInnings,
        homeInnings,
        inning: ls.currentInning || null,
        gameId: String(g.gamePk || ''),
      };
    });

    res.status(200).json({ games, date: dateStr, total: games.length, src: 'mlb-stats' });

  } catch(e) {
    res.status(200).json({ games: [], date: dateStr, error: e.message });
  }
}
