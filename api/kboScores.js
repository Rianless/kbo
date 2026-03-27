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
    // 네이버 스포츠 API - 실제 데이터 엔드포인트
    const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic%2Cschedule%2Cbaseball%2CmanualRelayUrl&upperCategoryId=kbaseball&categoryIds=kbo&fromDate=${dateStr}&toDate=${dateStr}&size=100&_=${Date.now()}`;

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'com.naver.sports/4.0.0 (Android; 13)',
        'Accept': 'application/json',
        'Accept-Language': 'ko-KR',
        'x-naver-client-id': 'sports',
        'x-naver-client-version': '4.0.0',
      }
    });

    const text = await r.text();

    if (!r.ok) {
      // 앱 UA 실패시 웹 UA로 재시도
      const r2 = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36',
          'Referer': 'https://m.sports.naver.com/',
          'Accept': 'application/json',
        }
      });
      const text2 = await r2.text();
      if (!r2.ok) {
        return res.status(200).json({ games: [], date: dateStr, error: `HTTP ${r2.status}`, raw: text2.substring(0,200) });
      }
      const data2 = JSON.parse(text2);
      return processAndRespond(data2, yyyy, mm, dd, dateStr, mapTeam, res);
    }

    const data = JSON.parse(text);
    return processAndRespond(data, yyyy, mm, dd, dateStr, mapTeam, res);

  } catch(e) {
    res.status(200).json({ games: [], date: dateStr, error: e.message });
  }
}

function processAndRespond(data, yyyy, mm, dd, dateStr, mapTeam, res) {
  const rawGames = data?.result?.games || data?.games || [];

  if (!rawGames.length) {
    return res.status(200).json({ games: [], date: dateStr, note: '오늘 경기 없음 (개막 전 또는 휴식일)', keys: Object.keys(data?.result || {}) });
  }

  const games = rawGames.map(g => {
    const base = g.schedule || g;
    const baseball = g.baseball || {};
    const sc = String(base.statusCode || base.gameStatusCode || '');
    let status = 'SCHEDULED';
    if (['1','LIVE'].includes(sc)) status = 'LIVE';
    else if (['2','RESULT'].includes(sc)) status = 'FINAL';

    const ai = baseball.awayScoreList || [];
    const hi = baseball.homeScoreList || [];

    return {
      date: `${yyyy}-${mm}-${dd}`,
      time: (base.gameTime || '').substring(0, 5),
      away: mapTeam(base.awayTeamName || base.awayTeam || ''),
      home: mapTeam(base.homeTeamName || base.homeTeam || ''),
      stad: base.stadiumName || '',
      status,
      awayScore: base.awayScore ?? null,
      homeScore: base.homeScore ?? null,
      awayInnings: ai.length ? ai.map(Number) : Array(9).fill(-1),
      homeInnings: hi.length ? hi.map(Number) : Array(9).fill(-1),
      inning: baseball.currentInning || null,
      gameId: base.gameId || '',
    };
  });

  return res.status(200).json({ games, date: dateStr, total: games.length });
}
