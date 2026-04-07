const form = document.getElementById('search-form');
const input = document.getElementById('steam-id');
const inputWrapper = document.getElementById('input-wrapper');
const errorMessage = document.getElementById('error-message');
const resultsSection = document.getElementById('results-section');
const globalMatchesSection = document.getElementById('global-matches-section');
const globalMatchesList = document.getElementById('global-matches-list');
const liveMatchSection = document.getElementById('live-match-section');
const liveMatchContent = document.getElementById('live-match-content');
const liveMatchTitle = document.getElementById('live-match-title');

const API_BASE = 'https://backend.hzqki.me/api/player-stats?steam_id=';

const FACEIT_COLORS = {
  1: '#b0b0b0',
  2: '#b0b0b0',
  3: '#f2c94c',
  4: '#f2c94c',
  5: '#27ae60',
  6: '#27ae60',
  7: '#2d9cdb',
  8: '#2d9cdb',
  9: '#9b59b6',
  10: '#e74c3c'
};

function getFaceitIconSvg(level) {
  const color = FACEIT_COLORS[level] || '#b0b0b0';
  return `<svg class="live-faceit-icon" viewBox="0 0 24 24" fill="${color}">
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
  </svg>`;
}

let liveMatchData = null;
let liveMatchScores = null;
let liveMatchPollInterval = null;

async function fetchPlayerInfo(steamId) {
  try {
    const res = await fetchWithTimeout(`https://backend.hzqki.me/api/player-info?steam_id=${encodeURIComponent(steamId)}`);
    if (!res.ok) throw new Error('Failed');
    
    const data = await res.json();
    
    return {
      steamName: data.steam_name || 'Unknown',
      steamAvatar: data.steam_avatar || null,
      steamId64: steamId,
      faceitLevel: data.faceit_level || null
    };
  } catch (e) {
    return {
      steamName: 'Unknown',
      steamAvatar: null,
      steamId64: steamId,
      faceitLevel: null
    };
  }
}

async function checkLiveMatch() {
  try {
    const serversRes = await fetchWithTimeout('https://backend.hzqki.me/api/servers');
    if (!serversRes.ok) {
      hideLiveMatch();
      return;
    }
    
    const servers = await serversRes.json();
    const onlineServer = servers.find(s => s.server_up);
    
    if (!onlineServer) {
      hideLiveMatch();
      return;
    }
    
    const sessionRes = await fetchWithTimeout(`https://backend.hzqki.me/api/servers/${onlineServer.id}/session`);
    if (!sessionRes.ok) {
      hideLiveMatch();
      return;
    }
    
    const session = await sessionRes.json();
    
    if (!session.server_up) {
      hideLiveMatch();
      return;
    }
    
    liveMatchData = {
      serverId: onlineServer.id,
      serverName: onlineServer.name,
      ...session
    };
    
    showLiveMatch(liveMatchData);
    
    if (liveMatchPollInterval) {
      clearInterval(liveMatchPollInterval);
    }
    liveMatchPollInterval = setInterval(pollLiveMatchScore, 5000);
    
  } catch (e) {
    hideLiveMatch();
  }
}

async function pollLiveMatchScore() {
  if (!liveMatchData) return;
  
  try {
    const sessionRes = await fetchWithTimeout(`https://backend.hzqki.me/api/servers/${liveMatchData.serverId}/session`);
    if (!sessionRes.ok) {
      hideLiveMatch();
      return;
    }
    
    const session = await sessionRes.json();
    
    if (!session.server_up) {
      hideLiveMatch();
      return;
    }
    
    updateLiveMatchScore(session);
    
  } catch (e) {
    console.error('Failed to poll live match:', e);
  }
}

async function showLiveMatch(data) {
  liveMatchSection.classList.add('active');
  liveMatchTitle.textContent = data.serverName || 'Live Match';
  liveMatchContent.innerHTML = '<div class="live-loading">Loading players...</div>';
  
  const team1Players = await Promise.all(
    data.team1.map(id => fetchPlayerInfo(id))
  );
  const team2Players = await Promise.all(
    data.team2.map(id => fetchPlayerInfo(id))
  );
  
  const defaultAvatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"%3E%3Crect fill="%23333" width="40" height="40" rx="20"/%3E%3C/svg%3E';
  
  liveMatchContent.innerHTML = `
    <div class="live-team">
      <div class="live-team-name">${data.team1_name || 'Team 1'}</div>
      <div class="live-team-players">
        ${team1Players.map((player, i) => `
          <div class="live-player">
            <img src="${player.steamAvatar || defaultAvatar}" alt="" class="live-player-avatar" onerror="this.src='${defaultAvatar}'">
            <div class="live-player-info">
              <div class="live-player-name">${player.steamName}</div>
              <div class="live-player-meta">
                ${player.faceitLevel ? getFaceitIconSvg(player.faceitLevel) : ''}
                <span class="live-side-badge">${data.team1_start_side}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="live-score">
      <span class="score" id="live-score-t1">0</span>
      <span class="score-divider">:</span>
      <span class="score" id="live-score-t2">0</span>
    </div>
    <div class="live-team team2">
      <div class="live-team-name">${data.team2_name || 'Team 2'}</div>
      <div class="live-team-players">
        ${team2Players.map((player, i) => `
          <div class="live-player">
            <img src="${player.steamAvatar || defaultAvatar}" alt="" class="live-player-avatar" onerror="this.src='${defaultAvatar}'">
            <div class="live-player-info">
              <div class="live-player-name">${player.steamName}</div>
              <div class="live-player-meta">
                ${player.faceitLevel ? getFaceitIconSvg(player.faceitLevel) : ''}
                <span class="live-side-badge">${data.team2_start_side}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  updateLiveMatchScore(data);
}

function updateLiveMatchScore(data) {
  const score1El = document.getElementById('live-score-t1');
  const score2El = document.getElementById('live-score-t2');
  
  if (score1El && score2El) {
    score1El.textContent = data.team1_score || 0;
    score2El.textContent = data.team2_score || 0;
  }
}

function hideLiveMatch() {
  liveMatchSection.classList.remove('active');
  if (liveMatchPollInterval) {
    clearInterval(liveMatchPollInterval);
    liveMatchPollInterval = null;
  }
  liveMatchData = null;
}

const historyModal = document.getElementById('history-modal');
const historyList = document.getElementById('history-list');
const historySubtitle = document.getElementById('history-subtitle');

function openHistoryModal() {
  closeMatchModal();
  historyModal.classList.add('visible');
  historySubtitle.textContent = 'Loading...';
  historyList.innerHTML = '<div class="history-loading"><div class="spinner-large"></div></div>';
  loadHistoryMatches();
}

function closeHistoryModal() {
  historyModal.classList.remove('visible');
}

document.getElementById('history-modal-overlay').addEventListener('click', closeHistoryModal);
document.getElementById('history-modal-close').addEventListener('click', closeHistoryModal);

document.getElementById('view-all-matches-btn').addEventListener('click', openHistoryModal);

async function loadGlobalMatches() {
  console.log('Loading global matches...');
  try {
    console.log('Fetching matches...');
    const res = await fetch('https://backend.hzqki.me/api/matches?limit=10');
    console.log('Got response:', res);
    if (!res.ok) throw new Error('Failed to load');
    const matches = await res.json();
    console.log('Got matches:', matches);
    
    if (matches.length === 0) {
      globalMatchesList.innerHTML = '<div class="global-matches-loading">No matches found</div>';
      return;
    }
    
    globalMatchesList.innerHTML = matches.map(match => {
      const isTeam1Winner = match.winner === 'team1';
      const mapName = match.map_name?.replace('de_', '') || 'Unknown';
      
      return `
        <div class="global-match-item" data-match-id="${match.id}">
          <div class="global-match-map">${mapName}</div>
          <div class="global-match-teams">${match.team1_name} vs ${match.team2_name}</div>
          <div class="global-match-score">
            <span class="score ${isTeam1Winner ? 'win' : 'loss'}">${match.team1_score}</span>
            <span class="divider">:</span>
            <span class="score ${!isTeam1Winner ? 'win' : 'loss'}">${match.team2_score}</span>
          </div>
          <div class="global-match-winner">${isTeam1Winner ? match.team1_name : match.team2_name}</div>
        </div>
      `;
    }).join('');
    
    document.querySelectorAll('.global-match-item').forEach(el => {
      el.addEventListener('click', () => {
        openMatchModal(el.dataset.matchId);
      });
    });
    
  } catch (e) {
    console.error('Error loading matches:', e);
    globalMatchesList.innerHTML = '<div class="global-matches-loading">Failed to load matches: ' + e.message + '</div>';
  }
}

loadGlobalMatches();

async function loadHistoryMatches() {
  try {
    const res = await fetchWithTimeout('https://backend.hzqki.me/api/matches?limit=50');
    if (!res.ok) throw new Error('Failed to load');
    const matches = await res.json();
    
    historySubtitle.textContent = `${matches.length} matches found`;
    
    if (matches.length === 0) {
      historyList.innerHTML = '<div class="history-loading">No matches found</div>';
      return;
    }
    
    historyList.innerHTML = matches.map(match => {
      const isTeam1Winner = match.winner === 'team1';
      const mapName = match.map_name?.replace('de_', '') || 'Unknown';
      
      return `
        <div class="history-match" data-match-id="${match.id}">
          <div class="history-match-info">
            <div class="history-match-map">
              <span class="history-map-badge">${mapName}</span>
              <span class="history-match-teams">${match.team1_name} vs ${match.team2_name}</span>
            </div>
            <div class="history-match-date">${formatDate(match.played_at)}</div>
          </div>
          <div class="history-score">
            <span class="team1 ${isTeam1Winner ? 'win' : 'loss'}">${match.team1_score}</span>
            <span class="divider">:</span>
            <span class="team2 ${!isTeam1Winner ? 'win' : 'loss'}">${match.team2_score}</span>
          </div>
          <div class="history-winner-badge ${match.winner}">
            ${isTeam1Winner ? match.team1_name : match.team2_name}
          </div>
          <div class="history-server-badge">${match.server_name}</div>
        </div>
      `;
    }).join('');
    
    document.querySelectorAll('.history-match').forEach(el => {
      el.addEventListener('click', () => {
        const matchId = el.dataset.matchId;
        openMatchModal(matchId);
      });
    });
    
  } catch (e) {
    historyList.innerHTML = '<div class="history-loading">Failed to load matches</div>';
  }
}

checkLiveMatch();
setInterval(checkLiveMatch, 10000);

function encodeSteamId(rawId) {
  return encodeURIComponent(rawId.trim());
}

function extractSteamIdRaw(steamId) {
  const match = steamId.match(/STEAM_\d+:\d+:\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function formatNumber(num) {
  return num.toLocaleString();
}

function animateValue(element, start, end, duration, isDecimal = false) {
  const startTime = performance.now();
  const update = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * easeOut;
    element.textContent = isDecimal ? current.toFixed(2) : Math.round(current).toLocaleString();
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  };
  requestAnimationFrame(update);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  inputWrapper.classList.add('error');
  setTimeout(() => inputWrapper.classList.remove('error'), 1000);
}

function hideError() {
  errorMessage.style.display = 'none';
}

const loadingOverlay = document.getElementById('loading-overlay');

function setLoading(loading) {
  if (loading) {
    loadingOverlay.classList.add('active');
  } else {
    loadingOverlay.classList.remove('active');
  }
}

function steamIdTo64(steamId) {
  const match = steamId.match(/STEAM_(\d+):(\d+):(\d+)/i);
  if (!match) return null;
  const [, universe, authServer, authId] = match;
  const authServerNum = parseInt(authServer);
  const authIdNum = parseInt(authId);
  const accountId = authIdNum * 2 + authServerNum;
  return BigInt(76561197960265728) + BigInt(accountId);
}

function steam64ToSteamId(steam64) {
  const num = BigInt(steam64);
  const base = BigInt(76561197960265728);
  if (num < base) return null;
  const accountId = num - base;
  const authId = accountId / BigInt(2);
  const authServer = accountId % BigInt(2);
  return `STEAM_1:${authServer}:${authId}`;
}

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

async function resolveSteamId(input) {
  input = input.trim();
  
  if (/^STEAM_\d+:\d+:\d+$/i.test(input)) {
    return input.toUpperCase();
  }
  
  if (/^\[U:1:\d+\]$/i.test(input)) {
    const match = input.match(/\d+/);
    if (match) {
      const accountId = BigInt(match[0]);
      const steamId64 = BigInt(76561197960265728) + accountId;
      return steam64ToSteamId(steamId64.toString());
    }
  }
  
  if (/^\d{15,20}$/.test(input)) {
    return steam64ToSteamId(input);
  }
  
  if (/^(https?:\/\/)?(steamcommunity\.com|steam\.id)/i.test(input)) {
    let url = input;
    if (!input.startsWith('http')) {
      url = 'https://' + input;
    }
    url = url.replace(/(\?.*|#.*)/, '');
    
    const vanities = url.match(/steamcommunity\.com\/id\/([^/]+)/);
    if (vanities && vanities[1]) {
      return resolveSteamId(vanities[1]);
    }
    
    const profiles = url.match(/steamcommunity\.com\/profiles\/(\d+)/);
    if (profiles && profiles[1]) {
      return steam64ToSteamId(profiles[1]);
    }
  }
  
  const urlMatch = input.match(/(steamcommunity\.com\/(?:id|profiles)\/[^\/\s]+)/i);
  if (urlMatch) {
    const segments = urlMatch[1].split('/');
    if (segments[1] === 'profiles' && segments[2]) {
      return steam64ToSteamId(segments[2]);
    }
    if (segments[1] === 'id' && segments[2]) {
      return resolveSteamId(segments[2]);
    }
  }
  
  if (/^[a-zA-Z0-9_-]+$/.test(input) && input.length >= 2 && input.length <= 32) {
    try {
      const res = await fetchWithTimeout(`https://playerdb.co/api/player/steam/${encodeURIComponent(input)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.player?.id) {
          return steam64ToSteamId(data.data.player.id);
        }
      }
    } catch (e) {}
  }
  
  return null;
}

async function getSteamInfo(steamId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`https://backend.hzqki.me/api/player-info?steam_id=${encodeURIComponent(steamId)}`, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) throw new Error('Failed');
    
    const data = await response.json();
    
    return {
      avatar: data.steam_avatar || null,
      steamId: steamId
    };
  } catch (e) {}
  
  return { avatar: null, steamId: steamId };
}

async function fetchPlayerStats(steamId) {
  const encoded = encodeURIComponent(steamId);
  const response = await fetchWithTimeout(`${API_BASE}${encoded}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Player not found. Check the Steam ID.');
    }
    throw new Error('Failed to fetch stats. Please try again.');
  }
  
  return response.json();
}

async function fetchPlayerMatches(steamId, limit = 10, offset = 0) {
  const encoded = encodeURIComponent(steamId);
  const response = await fetchWithTimeout(`https://backend.hzqki.me/api/player-matches?steam_id=${encoded}&limit=${limit}&offset=${offset}`);
  
  if (!response.ok) {
    return [];
  }
  
  return response.json();
}

async function fetchMatchDetails(matchId) {
  const response = await fetch(`https://backend.hzqki.me/api/matches/${matchId}`);
  
  if (!response.ok) {
    throw new Error('Failed to load match details');
  }
  
  return response.json();
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

let currentMatchOffset = 0;
let currentMatchSteamId = null;
const MATCH_LIMIT = 10;

async function renderMatchHistory(steamId) {
  const matchList = document.getElementById('match-list');
  const matchCount = document.getElementById('match-count');
  const matchPrev = document.getElementById('match-prev');
  const matchNext = document.getElementById('match-next');
  
  matchList.innerHTML = '<div class="match-loading">Loading matches...</div>';
  
  try {
    const matches = await fetchPlayerMatches(steamId, MATCH_LIMIT, currentMatchOffset);
    
    if (matches.length === 0) {
      matchList.innerHTML = '<div class="match-loading">No matches found</div>';
      return;
    }
    
    currentMatchSteamId = steamId;
    
    const start = currentMatchOffset + 1;
    const end = currentMatchOffset + matches.length;
    matchCount.textContent = start + ' - ' + end;
    matchPrev.disabled = currentMatchOffset === 0;
    matchNext.disabled = matches.length < MATCH_LIMIT;
    
    matchList.innerHTML = matches.map(match => {
      const score1 = match.winner === 'team1' ? match.team1_score : match.team2_score;
      const score2 = match.winner === 'team2' ? match.team1_score : match.team2_score;
      const isWin = match.result === 'W';
      const isIncomplete = match.kills === 0 && match.deaths === 0 && match.assists === 0 && match.damage === 0;
      const eloDelta = match.rating_delta || 0;
      
      return `
        <div class="match-item ${isIncomplete ? 'incomplete' : ''}" data-match-id="${match.match_id}">
          <div class="match-result ${isWin ? 'win' : 'loss'}">${match.result}</div>
          <div class="match-info">
            <div class="match-map">${match.map_name.replace('de_', '')}</div>
            <div class="match-teams">${match.team1_name} vs ${match.team2_name}</div>
          </div>
          <div class="match-score">
            <span class="${isWin ? 'win' : 'loss'}">${score1}</span>
            <span style="color: var(--text-muted)">:</span>
            <span class="${!isWin ? 'win' : 'loss'}">${score2}</span>
          </div>
          <div class="match-stats">
            <div class="match-stat">
              <span class="match-stat-value">${match.kills}/${match.deaths}</span>
              <span class="match-stat-label">K/D</span>
            </div>
            <div class="match-stat">
              <span class="match-stat-value">${match.adr > 0 ? match.adr.toFixed(1) : '-'}</span>
              <span class="match-stat-label">ADR</span>
            </div>
          </div>
          <div class="match-elo">
            <div class="match-elo-value ${eloDelta >= 0 ? 'positive' : 'negative'}">${eloDelta >= 0 ? '+' : ''}${eloDelta}</div>
            <div class="match-elo-label">ELO</div>
          </div>
          <div class="match-date">${formatDate(match.played_at)}</div>
        </div>
      `;
    }).join('');
    
    document.querySelectorAll('.match-item').forEach(item => {
      item.addEventListener('click', () => openMatchModal(item.dataset.matchId));
    });
    
  } catch (error) {
    matchList.innerHTML = '<div class="match-loading">Failed to load matches</div>';
  }
}

async function openMatchModal(matchId) {
  const modal = document.getElementById('match-modal');
  const body = document.getElementById('match-modal-body');
  
  closeMatchModal();
  closeHistoryModal();
  modal.classList.add('visible');
  body.innerHTML = '<div class="match-loading-spinner"><div class="spinner-large"></div></div>';
  
  try {
    const match = await fetchMatchDetails(matchId);
    
    const isIncomplete = match.player_stats.every(p => p.kills === 0 && p.deaths === 0 && p.assists === 0);
    
    const team1Players = match.player_stats.filter(p => p.team === 'team1').sort((a, b) => b.kills - a.kills);
    const team2Players = match.player_stats.filter(p => p.team === 'team2').sort((a, b) => b.kills - a.kills);
    
    let warningHTML = '';
    if (isIncomplete) {
      warningHTML = `
        <div class="match-detail-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          Match data not uploaded correctly - no player stats recorded
        </div>
      `;
    }
    
    const getPlayerElo = (p) => (p.rating_after || 0) - (p.rating_delta || 0);
    
    const team1AvgElo = team1Players.length > 0 
      ? Math.round(team1Players.reduce((sum, p) => sum + getPlayerElo(p), 0) / team1Players.length) 
      : 0;
    const team2AvgElo = team2Players.length > 0 
      ? Math.round(team2Players.reduce((sum, p) => sum + getPlayerElo(p), 0) / team2Players.length) 
      : 0;
    const overallAvgElo = Math.round((team1AvgElo + team2AvgElo) / 2);
    
    body.innerHTML = `
      <div class="match-detail-header">
        <div class="match-detail-map">${match.map_name.replace('de_', '')}</div>
        <div class="match-detail-score">
          <span class="score-value ${match.winner === 'team1' ? 'win' : 'loss'}">${match.team1_score}</span>
          <span class="score-divider">:</span>
          <span class="score-value ${match.winner === 'team2' ? 'win' : 'loss'}">${match.team2_score}</span>
        </div>
        <div class="match-detail-teams">${match.team1_name} vs ${match.team2_name}</div>
        <div class="match-detail-date">${new Date(match.played_at).toLocaleString('en-US', { 
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
        })}</div>
      </div>
      ${warningHTML}
      <div class="match-teams-container">
        <div class="match-team-box">
          <div class="match-team-title">${match.team1_name}</div>
          <div class="match-team-header">
            <span class="col-player">Player</span>
            <span class="col-elo">ELO</span>
            <span class="col-stat">K</span>
            <span class="col-stat">D</span>
            <span class="col-stat">A</span>
            <span class="col-stat">ADR</span>
          </div>
          ${team1Players.map(p => {
            const elo = getPlayerElo(p);
            const steamId = p.steam_id || '';
            return `
              <div class="match-team-row">
                <span class="col-player clickable" data-steamid="${steamId}">${p.name}</span>
                <span class="col-elo">${elo}</span>
                <span class="col-stat">${p.kills}</span>
                <span class="col-stat">${p.deaths}</span>
                <span class="col-stat">${p.assists}</span>
                <span class="col-stat adr">${p.adr > 0 ? p.adr.toFixed(0) : '-'}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div class="match-team-box">
          <div class="match-team-title">${match.team2_name}</div>
          <div class="match-team-header">
            <span class="col-player">Player</span>
            <span class="col-elo">ELO</span>
            <span class="col-stat">K</span>
            <span class="col-stat">D</span>
            <span class="col-stat">A</span>
            <span class="col-stat">ADR</span>
          </div>
          ${team2Players.map(p => {
            const elo = getPlayerElo(p);
            const steamId = p.steam_id || '';
            return `
              <div class="match-team-row">
                <span class="col-player clickable" data-steamid="${steamId}">${p.name}</span>
                <span class="col-elo">${elo}</span>
                <span class="col-stat">${p.kills}</span>
                <span class="col-stat">${p.deaths}</span>
                <span class="col-stat">${p.assists}</span>
                <span class="col-stat adr">${p.adr > 0 ? p.adr.toFixed(0) : '-'}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    
    document.querySelectorAll('.col-player.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const steamId = el.dataset.steamid;
        if (steamId) {
          closeMatchModal();
          input.value = steamId;
          handleSearch(steamId);
        }
      });
    });
    
  } catch (error) {
    body.innerHTML = '<div class="match-loading">Failed to load match details</div>';
  }
}

function closeMatchModal() {
  const modal = document.getElementById('match-modal');
  modal.classList.remove('visible');
}

document.getElementById('match-modal-overlay').addEventListener('click', closeMatchModal);
document.getElementById('match-modal-close').addEventListener('click', closeMatchModal);

document.getElementById('match-prev').addEventListener('click', () => {
  if (currentMatchOffset > 0) {
    currentMatchOffset -= MATCH_LIMIT;
    if (currentMatchSteamId) renderMatchHistory(currentMatchSteamId);
  }
});

document.getElementById('match-next').addEventListener('click', () => {
  currentMatchOffset += MATCH_LIMIT;
  if (currentMatchSteamId) renderMatchHistory(currentMatchSteamId);
});

function calculateHltvRating(data) {
  const kills = data.kills || 0;
  const deaths = data.deaths || 1;
  const damage = data.damage || 0;
  const matches = data.matches_played || 1;
  const hsKills = data.hs_kills || 0;
  
  if (kills === 0) return 0.00;
  
  const rounds = matches * 30;
  const adr = damage / rounds;
  const hsRate = hsKills / kills;
  const kdRatio = kills / deaths;
  
  const rating = (kills * 0.005) + (kdRatio * 0.3) + (adr * 0.003) + (hsRate * 0.1);
  
  return rating;
}

function renderPlayerCard(data, avatarUrl, faceitLevel) {
  const avatar = document.getElementById('avatar');
  avatar.src = avatarUrl;
  avatar.onerror = () => {
    avatar.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"%3E%3Crect fill="%231a1a1a" width="80" height="80"/%3E%3C/svg%3E';
  };

  const playerName = data.last_known_name || 'Unknown Player';
  const isDev = data.steam_id === 'STEAM_1:1:384092085';
  document.getElementById('player-name').innerHTML = isDev 
    ? `${playerName} <span class="dev-badge">DEV</span>` 
    : playerName;
  document.getElementById('player-steam-id').textContent = data.steam_id;
  document.getElementById('rank-tier').textContent = data.rank_tier || 'Unranked';
  document.getElementById('rank-color').style.backgroundColor = data.rank_color || '#555555';
  
  const eloEl = document.getElementById('elo-value');
  animateValue(eloEl, 0, data.rating || 0, 1000);

  const faceitEl = document.getElementById('faceit-level');
  faceitEl.innerHTML = faceitLevel ? getFaceitIconSvg(faceitLevel) : '';
}

function renderStats(data) {
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach((card, i) => {
    setTimeout(() => card.classList.add('visible'), 100 + i * 50);
  });

  const matches = data.matches_played || 0;
  const wins = data.wins || 0;
  const losses = data.losses || 0;
  const kills = data.kills || 0;
  const deaths = data.deaths || 0;
  const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;

    setTimeout(() => {
    animateValue(document.getElementById('stat-matches'), 0, matches, 600);
    document.querySelector('#stat-record > span:first-child').innerHTML = wins + ' - ' + losses;
    document.getElementById('stat-winrate').textContent = winRate + '%';
    document.querySelector('#stat-kda > span:first-child').innerHTML = kills + '<span class="kd-slash"> / </span>' + deaths;
  }, 150);
}

function renderRecentResults(data) {
  const resultsBar = document.getElementById('results-bar');
  resultsBar.innerHTML = '';
  
  const results = data.recent_results || [];
  results.forEach((result, i) => {
    const pill = document.createElement('div');
    pill.className = `result-pill ${result === 'W' ? 'win' : 'loss'}`;
    pill.textContent = result;
    resultsBar.appendChild(pill);
    
    setTimeout(() => pill.classList.add('visible'), 400 + i * 80);
  });
}

function renderSummary(data, matches = []) {
  const summaryCards = document.querySelectorAll('.summary-card');
  summaryCards.forEach((card, i) => {
    setTimeout(() => card.classList.add('visible'), 300 + i * 100);
  });

  setTimeout(() => {
    animateValue(document.getElementById('summary-hs'), 0, data.hs_kills || 0, 800);
    animateValue(document.getElementById('summary-hspct'), 0, data.hs_pct || 0, 800, true);
    animateValue(document.getElementById('summary-damage'), 0, data.damage || 0, 800);
    
    const validAdrMatches = matches.filter(m => m.adr > 0);
    const matchAdr = validAdrMatches.length > 0 
      ? validAdrMatches.reduce((sum, m) => sum + m.adr, 0) / validAdrMatches.length 
      : 0;
    animateValue(document.getElementById('summary-adr-match'), 0, matchAdr, 800, true);
    
    const kdr = (data.deaths || 0) > 0 ? (data.kills || 0) / data.deaths : 0;
    animateValue(document.getElementById('summary-kdr'), 0, kdr, 800, true);
  }, 400);
}

async function handleSearch(input) {
  hideError();
  
  setLoading(true);
  resultsSection.classList.add('fade-out');
  globalMatchesSection.classList.add('hidden');
  currentMatchOffset = 0;

  try {
    const resolvedId = await resolveSteamId(input);
    if (!resolvedId) {
      resultsSection.classList.remove('visible');
      resultsSection.classList.remove('fade-out');
      throw new Error('Could not resolve. Try: STEAM_1:1:X, SteamID64, URL, or profile name like "fluxy-64"');
    }

    const [data, steamInfo, matches] = await Promise.allSettled([
      fetchPlayerStats(resolvedId),
      getSteamInfo(resolvedId),
      fetchPlayerMatches(resolvedId, 10, 0)
    ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null));

    if (!data) {
      throw new Error('Failed to load player stats. Please try again.');
    }

    await new Promise(r => setTimeout(r, 300));
    resultsSection.classList.remove('fade-out');

    resultsSection.classList.add('visible');
    
    renderPlayerCard(data, steamInfo.avatar, steamInfo.faceitLevel);
    renderStats(data);
    renderRecentResults(data);
    renderSummary(data, matches);
    renderMatchHistory(resolvedId);
    
    trackRecentSearch(resolvedId, data.last_known_name, steamInfo.avatar);
    
  } catch (error) {
    showError(error.message);
    resultsSection.classList.remove('visible');
    resultsSection.classList.remove('fade-out');
    globalMatchesSection.classList.remove('hidden');
  } finally {
    setLoading(false);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const steamId = input.value.trim();
  if (steamId) {
    handleSearch(steamId);
  } else {
    resultsSection.classList.remove('visible');
    resultsSection.classList.remove('fade-out');
    globalMatchesSection.classList.remove('hidden');
  }
});

const RECENT_KEY = 'csgo_recent';
const MAX_RECENT = 3;

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function saveRecentSearches(searches) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(searches));
  } catch {}
}

function trackRecentSearch(steamId, name, avatar) {
  const searches = getRecentSearches();
  const filtered = searches.filter(s => s.steamId !== steamId);
  filtered.unshift({ steamId, name: name || 'Unknown', avatar, time: Date.now() });
  saveRecentSearches(filtered.slice(0, MAX_RECENT));
  renderRecentSearches();
}

function renderRecentSearches() {
  const container = document.getElementById('recent-searches');
  const searches = getRecentSearches();
  
  if (searches.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  const defaultAvatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"%3E%3Crect fill="%23333" width="40" height="40" rx="8"/%3E%3C/svg%3E';
  
  container.innerHTML = searches.map(s => `
    <div class="recent-search" data-steamid="${s.steamId}">
      <img src="${s.avatar || defaultAvatar}" alt="" class="recent-search-avatar" onerror="this.src='${defaultAvatar}'">
      <div class="recent-search-info">
        <div class="recent-search-name">${s.name}</div>
        <div class="recent-search-steamid">${s.steamId.slice(-8)}</div>
      </div>
    </div>
  `).join('');
  
  container.querySelectorAll('.recent-search').forEach(el => {
    el.addEventListener('click', () => {
      input.value = el.dataset.steamid;
      handleSearch(el.dataset.steamid);
    });
  });
}

renderRecentSearches();

input.addEventListener('input', () => {
  hideError();
  inputWrapper.classList.remove('error');
});

document.getElementById('logo-btn').addEventListener('click', () => {
  input.value = '';
  hideError();
  resultsSection.classList.remove('visible');
  resultsSection.classList.remove('fade-out');
  globalMatchesSection.classList.remove('hidden');
});
