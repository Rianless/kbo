export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const pad = n => String(n).padStart(2, '0');
  const requestedDate = String(req?.query?.date || '').trim();
  const isRequestedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate);
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = pad(kst.getUTCMonth() + 1);
  const dd = pad(kst.getUTCDate());

  const todayDash = isRequestedDate ? requestedDate : `${yyyy}-${mm}-${dd}`;
  const todayStr  = todayDash.replace(/-/g, '');

  const TEAM_CODE = {
    'HT':'KIA','KT':'KT','LG':'LG','SK':'SSG','NC':'NC',
    'OB':'두산','LT':'롯데','SS':'삼성','HH':'한화','WO':'키움',
  };
  const mapTeam = code => TEAM_CODE[code] || code;

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    'Referer': 'https://m.sports.naver.com/',
    'Accept': 'application/json',
    'Origin': 'https://m.sports.naver.com',
  };

  // textRelays 배열 재귀 탐색
  function findTextRelaysRecursive(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      if (obj.length > 0 && (obj[0].title || obj[0].text || obj[0].type != null)) return obj;
      return null;
    }
    if (obj.textRelays) return obj.textRelays;
    if (obj.relays) return obj.relays;
    if (obj.list) return obj.list;
    for (const key in obj) {
      const found = findTextRelaysRecursive(obj[key]);
      if (found) return found;
    }
    return null;
  }

  // textOptions 마지막 항목에서 결과 텍스트 추출
  function extractResult(item) {
    const opts = item.textOptions || [];
    if (!opts.length) return null;
    const last = opts[opts.length - 1];
    return last?.text || last?.title || null;
  }

  async function fetchSchedule(date) {
    const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic%2Cschedule%2Cbaseball%2CmanualRelayUrl&upperCategoryId=kbaseball&fromDate=${date}&toDate=${date}&size=500`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) throw new Error(`schedule ${r.status}`);
    const data = await r.json();
    return (data?.result?.games || []).filter(g => g.categoryId === 'kbo');
  }

  async function fetchGameDetail(gameId, inning) {
    const inn = inning || 1;
    const url1 = `https://api-gw.sports.naver.com/schedule/games/${gameId}/text-relay?inning=${inn}&isHighlight=false`;
    const url2 = `https://api-gw.sports.naver.com/schedule/games/${gameId}/game-polling?inning=${inn}&isHighlight=false`;
    try {
      const r1 = await fetch(url1, { headers: HEADERS });
      if (r1.ok) {
        const d1 = await r1.json();
        if (d1?.result) return d1.result;
      }
      const r2 = await fetch(url2, { headers: HEADERS });
      if (r2.ok) {
        const d2 = await r2.json();
        return d2?.result || null;
      }
      return null;
    } catch(e) { return null; }
  }

  async function fetchLineup(gameId, inning) {
    const inn = inning || 1;
    const urls = [
      `https://api-gw.sports.naver.com/schedule/games/${gameId}/lineup`,
      `https://api-gw.sports.naver.com/schedule/games/${gameId}/game-polling?inning=${inn}&isHighlight=false`,
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url, { headers: HEADERS });
        if (!r.ok) continue;
        const data = await r.json();
        if (data?.result) return data.result;
      } catch(e) {}
    }
    return null;
  }

  function convertGame(g, detail) {
    const away = mapTeam(g.awayTeamCode) || g.awayTeamName;
    const home = mapTeam(g.homeTeamCode) || g.homeTeamName;
    const sc = g.statusCode || '';
    const status = sc==='BEFORE'?'SCHEDULED': sc==='STARTED'?'LIVE': sc==='RESULT'?'FINAL':'SCHEDULED';

    const gameData = detail?.game || g;
    const awayInnRaw = gameData.awayTeamScoreByInning || g.awayTeamScoreByInning || [];
    const homeInnRaw = gameData.homeTeamScoreByInning || g.homeTeamScoreByInning || [];

    const awayInnings = Array(9).fill(-1);
    const homeInnings = Array(9).fill(-1);
    awayInnRaw.forEach((s,i)=>{ if(i<9 && s!=='-') awayInnings[i]=Number(s); });
    homeInnRaw.forEach((s,i)=>{ if(i<9 && s!=='-') homeInnings[i]=Number(s); });

    const rawRelays = findTextRelaysRecursive(detail) || [];
    // 각 relay item에 resultText 추가 (textOptions 마지막 항목)
    const textRelaysData = rawRelays.map(item => ({
      ...item,
      resultText: extractResult(item),
    }));

    // currentGameState: detail 직접 → textRelayData → rawRelays 순으로 탐색
    let bestGs = detail?.currentGameState
      || detail?.textRelayData?.currentGameState
      || null;
    if (!bestGs && rawRelays.length) {
      // rawRelays는 시간순이므로 마지막부터 탐색 (가장 최신)
      for (let ri = 0; ri < rawRelays.length; ri++) {
        const relay = rawRelays[ri];
        if (relay.currentGameState) { bestGs = relay.currentGameState; break; }
        const opts = relay.textOptions || [];
        for (let oi = opts.length - 1; oi >= 0; oi--) {
          if (opts[oi]?.currentGameState) { bestGs = opts[oi].currentGameState; break; }
        }
        if (bestGs) break;
      }
    }
    // bestGs 필드 정규화 (네이버 API는 다양한 필드명 사용)
    if (bestGs) {
      bestGs = {
        ...bestGs,
        ball:   bestGs.ball   ?? bestGs.ballCount   ?? bestGs.balls   ?? 0,
        strike: bestGs.strike ?? bestGs.strikeCount ?? bestGs.strikes ?? 0,
        out:    bestGs.out    ?? bestGs.outCount     ?? bestGs.outs    ?? 0,
        base1:  bestGs.base1  ?? bestGs.runner1      ?? 0,
        base2:  bestGs.base2  ?? bestGs.runner2      ?? 0,
        base3:  bestGs.base3  ?? bestGs.runner3      ?? 0,
        // 투수/타자 이름 정규화 (숫자 ID는 pcode맵으로 이름 변환)
        pitcherName: (()=>{
          const m2 = {};
          const lu2 = detail?.textRelayData || detail;
          [...(lu2?.homeLineup?.batter||[]),...(lu2?.homeLineup?.pitcher||[]),...(lu2?.awayLineup?.batter||[]),...(lu2?.awayLineup?.pitcher||[])].forEach(p=>{if(p.pcode)m2[String(p.pcode)]=p.name||p.playerName||'';});
          return [bestGs.pitcherName, bestGs.currentPitcherName].find(v=>v&&!/^\d+$/.test(String(v)))
            || m2[String(bestGs.pitcher||'')] || '';
        })(),
        batterName: (()=>{
          const m3 = {};
          const lu3 = detail?.textRelayData || detail;
          [...(lu3?.homeLineup?.batter||[]),...(lu3?.homeLineup?.pitcher||[]),...(lu3?.awayLineup?.batter||[]),...(lu3?.awayLineup?.pitcher||[])].forEach(p=>{if(p.pcode)m3[String(p.pcode)]=p.name||p.playerName||'';});
          return [bestGs.batterName, bestGs.currentBatterName].find(v=>v&&!/^\d+$/.test(String(v)))
            || m3[String(bestGs.batter||'')] || '';
        })(),
      };
    }

    // 선발투수: 네이버 lineup API 응답의 다양한 경로 커버
    function extractStarterFromDetail(side) {
      if (!detail) return null;

      // 구조 1: detail.{side}Summary.pitcherName
      const summary = detail[`${side}Summary`];
      if (summary?.pitcherName) return summary.pitcherName;
      if (summary?.name) return summary.name;

      // 구조 2: detail.pitchers 배열에서 starter
      const pitchers = detail.pitchers;
      if (Array.isArray(pitchers)) {
        const p = pitchers.find(p =>
          (p.side === side || p.teamSide === side) &&
          (p.type === 'starter' || p.orderNum === 1 || p.startYn === 'Y')
        );
        if (p?.name) return p.name;
        if (p?.pitcherName) return p.pitcherName;
      }

      // 구조 3: detail.{side}Starters 배열
      const starters = detail[`${side}Starters`];
      if (Array.isArray(starters) && starters.length) {
        return starters[0]?.name || starters[0]?.pitcherName || null;
      }

      // 구조 4: detail.{side}Lineup.pitcher 배열 첫 번째
      const lineup = detail[`${side}Lineup`] || detail[`${side}TeamLineup`];
      if (lineup?.pitcher) {
        const arr = Array.isArray(lineup.pitcher) ? lineup.pitcher : [lineup.pitcher];
        const sp = arr.find(p => p.startYn === 'Y' || p.orderNum === 1 || p.type === 'starter');
        if (sp?.name) return sp.name;
        if (arr[0]?.name) return arr[0].name;
      }

      // 구조 5: game-polling 스타일
      const gd = detail.game || {};
      if (side === 'away') {
        return gd.awayStarterName || gd.awayStarter ||
               g.awayStarterName || g.awayStarter || g.awayStarterPitcherName || null;
      } else {
        return gd.homeStarterName || gd.homeStarter ||
               g.homeStarterName || g.homeStarter || g.homeStarterPitcherName || null;
      }
    }

    const awayStarter = extractStarterFromDetail('away');
    const homeStarter = extractStarterFromDetail('home');

    // currentGameState에 inningInfo 주입 (프론트에서 초/말 판별용)
    const enrichedGs = bestGs ? {
      ...bestGs,
      _inningInfo: g.statusInfo || bestGs.inningDisplay || bestGs.inningText || '',
    } : null;

    return {
      gameId: String(g.gameId || ""),
      date: g.gameDate || '',
      away, home,
      status,
      awayScore: g.awayTeamScore!=null ? Number(g.awayTeamScore) : null,
      homeScore: g.homeTeamScore!=null ? Number(g.homeTeamScore) : null,
      awayInnings, homeInnings,
      inningInfo: g.statusInfo || null,
      currentGameState: enrichedGs,
      textRelays: textRelaysData,
      awayStarter,
      homeStarter,
      winPitcher: gameData.winPitcherName || g.winPitcherName || null,
      losePitcher: gameData.losePitcherName || g.losePitcherName || null,
    };
  }

  try {
    const gameId = req.query.gameId;
    const inning = req.query.inning ? parseInt(req.query.inning) : null;
    const action = req.query.action || '';

    if (gameId && action === 'lineup') {
      // game-polling으로 textRelayData 포함 전체 응답 가져오기
      const inn = inning || 1;
      const detail = await fetchGameDetail(gameId, inn);
      if (!detail) {
        // fallback: lineup 전용 API
        const lineupRaw = await fetchLineup(gameId, inn);
        if (!lineupRaw) return res.status(404).json({ error: 'Lineup not found' });
        return res.status(200).json(lineupRaw);
      }
      // textRelayData 안의 homeLineup/awayLineup 추출
      const td = detail.textRelayData || detail;
      const homeLineup = td.homeLineup || detail.homeLineup || null;
      const awayLineup = td.awayLineup || detail.awayLineup || null;
      let gs = td.currentGameState || detail.currentGameState || null;

      // pcode → 이름 맵 구성 (lineup 배열에서 pcode 추출)
      const pcodeMap = {};
      const allPlayers = [
        ...(homeLineup?.batter || []), ...(homeLineup?.pitcher || []),
        ...(awayLineup?.batter || []), ...(awayLineup?.pitcher || []),
      ];
      allPlayers.forEach(p => { if (p.pcode) pcodeMap[String(p.pcode)] = p.name || p.playerName || ''; });

      // currentGameState의 pitcher/batter ID를 이름으로 변환
      if (gs) {
        const isNumId = v => v && /^\d+$/.test(String(v));
        const resolveName = (nameField, idField) => {
          // 이름 필드가 이미 문자열이면 그대로 사용
          if (nameField && !isNumId(nameField)) return nameField;
          // ID 필드로 pcodeMap 조회
          if (idField) {
            const mapped = pcodeMap[String(idField)];
            if (mapped) return mapped;
          }
          // 이름 필드가 숫자 ID면 비움
          return '';
        };
        gs = {
          ...gs,
          pitcherName: resolveName(gs.pitcherName, gs.pitcher),
          batterName:  resolveName(gs.batterName,  gs.batter),
        };
      }
      // 응답: 표준화된 구조
      return res.status(200).json({
        homeLineup,
        awayLineup,
        currentGameState: gs,
        pcodeMap,
        _raw_keys: Object.keys(td).slice(0, 20),
      });
    }

    if (gameId) {
      const m = String(gameId).match(/^(\d{4})(\d{2})(\d{2})/);
      const gameDateDash = m ? `${m[1]}-${m[2]}-${m[3]}` : todayDash;
      const rawGames = await fetchSchedule(gameDateDash);
      const g = rawGames.find(x => String(x.gameId) === String(gameId));
      if (!g) return res.status(404).json({ error: 'Game not found' });
      const detail = await fetchGameDetail(gameId, inning || (g.statusCode==='RESULT' ? 9 : 1));
      return res.status(200).json(convertGame(g, detail));
    }

    const rawGames = await fetchSchedule(todayDash);
    // LIVE/RESULT 경기는 game-polling으로 이닝 스코어+currentGameState 확보
    // BEFORE 경기는 lineup으로 선발 정보만 확보
    const detailMap = {};
    await Promise.all(rawGames.map(async g => {
      try {
        if (g.statusCode === 'STARTED' || g.statusCode === 'RESULT') {
          const inn = g.statusCode === 'RESULT' ? 9 : 1;
          const d = await fetchGameDetail(g.gameId, inn);
          if (d) detailMap[g.gameId] = d;
        } else {
          const lu = await fetchLineup(g.gameId, 1);
          if (lu) detailMap[g.gameId] = lu;
        }
      } catch(e) {}
    }));
    const allGames = rawGames.map(g => convertGame(g, detailMap[g.gameId] || null));
    return res.status(200).json({ games: allGames, date: todayStr });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
