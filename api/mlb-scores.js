export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=linescore,probablePitcher`;
    
    const r = await fetch(url);
    const data = await r.json();
    
    const games = (data.dates?.[0]?.games || []).map(g => ({
      id: g.gamePk,
      status: g.status.detailedState,
      away: {
        name: g.teams.away.team.name,
        score: g.teams.away.score ?? '-',
        record: `${g.teams.away.leagueRecord.wins}-${g.teams.away.leagueRecord.losses}`,
      },
      home: {
        name: g.teams.home.team.name,
        score: g.teams.home.score ?? '-',
        record: `${g.teams.home.leagueRecord.wins}-${g.teams.home.leagueRecord.losses}`,
      },
      inning: g.linescore?.currentInning ?? null,
      inningHalf: g.linescore?.inningHalf ?? null,
      startTime: g.gameDate,
      venue: g.venue.name,
    }));
    
    res.status(200).json({ date: today, games });
    
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
