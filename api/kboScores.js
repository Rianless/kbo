export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const yyyy = today.getFullYear();
  const mm = pad(today.getMonth() + 1);
  const dd = pad(today.getDate());
  const dateStr = `${yyyy}${mm}${dd}`;

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

  try {
    // 네이버 스포츠 KBO 일정 페이지 스크래핑
    const url = `https://m.sports.naver.com/kbaseball/schedule/index?date=${dateStr}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      }
    });

    const html = await r.text();

    // __NEXT_DATA__ 안에 경기 데이터가 JSON으로 들어있음
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
    if (!match) {
      return res.status(200).json({ games: [], date: dateStr, error: '__NEXT_DATA__ 없음', preview: html.substring(0, 300) });
    }

    const nextData = JSON.parse(match[1]);

    // 데이터 경로 탐색
    const props = nextData?.props?.pageProps;
    const rawGames =
      props?.scheduleData?.games ||
      props?.games ||
      props?.data?.games ||
      nextData?.props?.initialState?.schedule?.games ||
      [];

    if (!rawGames.length) {
      // 경로 디버그용
      const keys = Object.keys(props || {});
      return res.status(200).json({ games: [], date: dateStr, error: '경기 데이터 없음', keys, today: `${yyyy}-${mm}-${dd}` });
    }

    const games = rawGames.map(g => {
      const sc = String(g.statusCode || g.gameStatusCode || g.status || '');
      let status = 'SCHEDULED';
      if (['1','LIVE'].includes(sc)) status = 'LIVE';
      else if (['2','RESULT','FINAL'].includes(sc)) status = 'FINAL';

      const ai = g.awayScoreList || g.awayInnings || [];
      const hi = g.homeScoreList || g.homeInnings || [];

      return {
        date: `${yyyy}-${mm}-${dd}`,
        time: (g.gameTime || g.startTime || '').substring(0, 5),
        away: mapTeam(g.awayTeamName || g.awayTeam || ''),
        home: mapTeam(g.homeTeamName || g.homeTeam || ''),
        stad: g.stadiumName || g.stadium || '',
        status,
        awayScore: g.awayScore ?? null,
        homeScore: g.homeScore ?? null,
        awayInnings: ai.length ? ai.map(Number) : Array(9).fill(-1),
        homeInnings: hi.length ? hi.map(Number) : Array(9).fill(-1),
        inning: g.currentInning || null,
        gameId: g.gameId || g.id || '',
      };
    });

    res.status(200).json({ games, date: dateStr, total: games.length });

  } catch(e) {
    res.status(200).json({ games: [], date: dateStr, error: e.message });
  }
}
