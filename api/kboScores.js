export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const yyyy = today.getFullYear();
  const mm = pad(today.getMonth() + 1);
  const dd = pad(today.getDate());
  const dateStr = `${yyyy}${mm}${dd}`;

  const TEAM = {
    'KIA':'KIA','KT':'KT','LG':'LG','SSG':'SSG','NC':'NC',
    '두산':'두산','롯데':'롯데','삼성':'삼성','한화':'한화','키움':'키움',
    'Tigers':'KIA','Wiz':'KT','Twins':'LG','Landers':'SSG','Dinos':'NC',
    'Bears':'두산','Giants':'롯데','Lions':'삼성','Eagles':'한화','Heroes':'키움',
  };
  const mapTeam = n => {
    if(!n) return n;
    for(const [k,v] of Object.entries(TEAM)) if(n.includes(k)) return v;
    return n;
  };

  const attempts = [];

  // 1. MLB Stats API 스타일 KBO (실제 동작 확인된 엔드포인트)
  const apis = [
    {
      url: `https://statsapi.mlb.com/api/v1/schedule?sportId=6&date=${yyyy}-${mm}-${dd}&gameType=R&language=ko`,
      src: 'mlb-stats-kbo'
    },
    {
      url: `https://statsapi.mlb.com/api/v1/schedule?sportId=6&date=${yyyy}-${mm}-${dd}`,
      src: 'mlb-stats-kbo-en'
    },
    {
      url: `https://baseballsavant.mlb.com/schedule?date=${yyyy}-${mm}-${dd}&sportId=6`,
      src: 'savant'
    },
  ];

  for(const api of apis) {
    try {
      const r = await fetch(api.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          'Accept': 'application/json',
        }
      });
      const text = await r.text();
      attempts.push({ src: api.src, status: r.status, preview: text.substring(0, 200) });

      if(!r.ok) continue;
      const data = JSON.parse(text);

      const dates = data?.dates || [];
      const gamesRaw = dates.flatMap(d => d.games || []);
      if(!gamesRaw.length) continue;

      const games = gamesRaw.map(g => {
        const away = g.teams?.away;
        const home = g.teams?.home;
        let status = 'SCHEDULED';
        const sc = g.status?.detailedState || '';
        if(['In Progress','Live'].includes(sc)) status = 'LIVE';
        else if(['Final','Game Over','Completed Early'].includes(sc)) status = 'FINAL';

        return {
          date: `${yyyy}-${mm}-${dd}`,
          time: g.gameDate ? new Date(g.gameDate).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}) : '',
          away: mapTeam(away?.team?.name || ''),
          home: mapTeam(home?.team?.name || ''),
          stad: g.venue?.name || '',
          status,
          awayScore: away?.score ?? null,
          homeScore: home?.score ?? null,
          awayInnings: Array(9).fill(-1),
          homeInnings: Array(9).fill(-1),
          gameId: String(g.gamePk || ''),
        };
      });

      return res.status(200).json({ games, date: dateStr, total: games.length, src: api.src });
    } catch(e) {
      attempts.push({ src: api.src, error: e.message });
    }
  }

  res.status(200).json({ games: [], date: dateStr, error: '모든 API 실패', debug: attempts });
}
