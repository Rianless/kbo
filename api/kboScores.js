export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${today.getFullYear()}${pad(today.getMonth()+1)}${pad(today.getDate())}`;

  const TEAM_MAP = {
    'KIA': 'KIA', 'KT': 'KT', 'LG': 'LG', 'SSG': 'SSG', 'NC': 'NC',
    '두산': '두산', '롯데': '롯데', '삼성': '삼성', '한화': '한화', '키움': '키움',
    'Tigers': 'KIA', 'Wiz': 'KT', 'Twins': 'LG', 'Landers': 'SSG', 'Dinos': 'NC',
    'Bears': '두산', 'Giants': '롯데', 'Lions': '삼성', 'Eagles': '한화', 'Heroes': '키움',
  };
  const mapTeam = name => {
    if (!name) return name;
    for (const [k, v] of Object.entries(TEAM_MAP)) {
      if (name.includes(k)) return v;
    }
    return name;
  };

  // 여러 URL 순서대로 시도
  const urls = [
    `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,baseball&upperCategoryId=kbaseball&categoryIds=kbo&fromDate=${dateStr}&toDate=${dateStr}&size=100`,
    `https://m.sports.naver.com/ajax/schedule/list.nhn?upperCategoryId=kbaseball&categoryId=kbo&date=${dateStr}`,
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://m.sports.naver.com/',
    'Origin': 'https://m.sports.naver.com',
    'Accept': 'application/json',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  };

  let lastError = '';
  let debugInfo = [];

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers });
      const text = await r.text();
      debugInfo.push({ url, status: r.status, preview: text.substring(0, 150) });

      if (!r.ok) { lastError = `HTTP ${r.status}`; continue; }

      let data;
      try { data = JSON.parse(text); } catch(e) { lastError = 'JSON 파싱 실패'; continue; }

      const rawGames = data?.result?.games || data?.games || data?.list || [];
      if (!rawGames.length) { lastError = '경기 없음'; continue; }

      const games = rawGames.map(g => {
        const base = g.schedule || g;
        const baseball = g.baseball || {};
        const awayTeam = mapTeam(base.awayTeamName || base.awayTeam);
        const homeTeam = mapTeam(base.homeTeamName || base.homeTeam);
        const sc = String(base.statusCode || base.gameStatusCode || base.status || '');
        let status = 'SCHEDULED';
        if (['1','LIVE','playing'].includes(sc)) status = 'LIVE';
        else if (['2','RESULT','result','done'].includes(sc)) status = 'FINAL';
        const ai = baseball.awayScoreList || [];
        const hi = baseball.homeScoreList || [];
        return {
          date: dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
          time: (base.gameTime || '').substring(0, 5),
          away: awayTeam, home: homeTeam,
          stad: base.stadiumName || base.stadium || '',
          status,
          awayScore: base.awayScore ?? null,
          homeScore: base.homeScore ?? null,
          awayInnings: ai.length ? ai.map(Number) : Array(9).fill(-1),
          homeInnings: hi.length ? hi.map(Number) : Array(9).fill(-1),
          inning: baseball.currentInning || null,
          gameId: base.gameId || base.id || '',
        };
      });

      return res.status(200).json({ games, date: dateStr, total: games.length });

    } catch(e) {
      lastError = e.message;
      debugInfo.push({ url, error: e.message });
    }
  }

  // 모두 실패 시 디버그 정보 포함
  res.status(200).json({ games: [], date: dateStr, error: lastError, debug: debugInfo });
}
