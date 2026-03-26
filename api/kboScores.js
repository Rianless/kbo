export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const today = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Seoul'});
    
    const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic%2Cschedule%2Cbaseball%2CmanualRelayUrl&upperCategoryId=kbaseball&categoryIds=kbo&fromDate=${today}&toDate=${today}&size=500`;

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://sports.naver.com/',
      }
    });
    const data = await r.json();

    const games = (data.result?.games || []).map(g => ({
      id: g.gameId,
      status: g.statusCode,
      home: g.homeTeamName,
      away: g.awayTeamName,
      homeCode: g.homeTeamCode,
      awayCode: g.awayTeamCode,
      homeScore: g.homeTeamScore,
      awayScore: g.awayTeamScore,
      homeStarter: g.homeStarterName || null,
      awayStarter: g.awayStarterName || null,
      winPitcher: g.winPitcherName || null,
      losePitcher: g.losePitcherName || null,
      stadium: g.stadium,
      time: g.gameDateTime,
      broadChannel: g.broadChannel || null,
    }));

    res.status(200).json({ date: today, games });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
