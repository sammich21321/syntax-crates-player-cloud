const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 43872;
const STORE_PATH = process.env.SYNTAX_CLOUD_STORE || path.join(__dirname, 'cloud-players.json');
const MAX_BODY_BYTES = 900000;
const MAX_BIO_LENGTH = 500;
const MAX_AVATAR_CHARS = 750000;

let store = { version: 1, players: {} };

function normalizeUsername(username) {
  return String(username || '').trim().toUpperCase();
}

function nowISO() {
  return new Date().toISOString();
}

function defaultProfile() {
  return { bio: '', avatarDataUrl: '', favoriteRoll: '' };
}

function defaultStats() {
  return {
    totalSpins: 0,
    uniqueUnlocked: 0,
    level: 1,
    shards: 0,
    bestDropIndex: 0,
    bestDropName: '',
    bestDropRarity: '',
    bestDropColor: '',
    rarestRollName: '',
    rarestRollRarity: '',
    rarestRollColor: '',
    rarestRollOdds: '',
    favoriteRollName: '',
    favoriteRollRarity: '',
    favoriteRollColor: '',
    favoriteRollOdds: '',
    lastPullName: '',
    lastPullRarity: '',
    lastPullColor: '',
    updatedAt: nowISO()
  };
}

function sanitizeProfile(profile = {}) {
  const avatarDataUrl = String(profile.avatarDataUrl || '');
  return {
    bio: String(profile.bio || '').slice(0, MAX_BIO_LENGTH),
    favoriteRoll: String(profile.favoriteRoll || '').slice(0, 120),
    avatarDataUrl: avatarDataUrl.startsWith('data:image/') && avatarDataUrl.length <= MAX_AVATAR_CHARS ? avatarDataUrl : ''
  };
}

function sanitizeStats(stats = {}) {
  const fallback = defaultStats();
  return {
    totalSpins: Math.max(0, Number(stats.totalSpins) || fallback.totalSpins),
    uniqueUnlocked: Math.max(0, Number(stats.uniqueUnlocked) || fallback.uniqueUnlocked),
    level: Math.max(1, Number(stats.level) || fallback.level),
    shards: Math.max(0, Number(stats.shards) || fallback.shards),
    bestDropIndex: Math.max(0, Number(stats.bestDropIndex) || fallback.bestDropIndex),
    bestDropName: String(stats.bestDropName || '').slice(0, 120),
    bestDropRarity: String(stats.bestDropRarity || '').slice(0, 60),
    bestDropColor: String(stats.bestDropColor || '').slice(0, 32),
    rarestRollName: String(stats.rarestRollName || '').slice(0, 120),
    rarestRollRarity: String(stats.rarestRollRarity || '').slice(0, 60),
    rarestRollColor: String(stats.rarestRollColor || '').slice(0, 32),
    rarestRollOdds: String(stats.rarestRollOdds || '').slice(0, 60),
    favoriteRollName: String(stats.favoriteRollName || '').slice(0, 120),
    favoriteRollRarity: String(stats.favoriteRollRarity || '').slice(0, 60),
    favoriteRollColor: String(stats.favoriteRollColor || '').slice(0, 32),
    favoriteRollOdds: String(stats.favoriteRollOdds || '').slice(0, 60),
    lastPullName: String(stats.lastPullName || '').slice(0, 120),
    lastPullRarity: String(stats.lastPullRarity || '').slice(0, 60),
    lastPullColor: String(stats.lastPullColor || '').slice(0, 32),
    updatedAt: stats.updatedAt || nowISO()
  };
}

function sanitizePlayer(player = {}) {
  const username = normalizeUsername(player.username);
  if (!/^[A-Z0-9_-]{3,20}$/.test(username)) return null;
  return {
    username,
    createdAt: player.createdAt || nowISO(),
    lastLoginAt: player.lastLoginAt || null,
    profile: sanitizeProfile(player.profile || defaultProfile()),
    stats: sanitizeStats(player.stats || defaultStats())
  };
}

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      store = { version: 1, players: parsed.players && typeof parsed.players === 'object' ? parsed.players : {} };
    }
  } catch (_) {
    store = { version: 1, players: {} };
  }
  Object.entries(store.players).forEach(([username, player]) => {
    const clean = sanitizePlayer(player);
    if (clean) store.players[clean.username] = clean;
    if (!clean || username !== clean.username) delete store.players[username];
  });
}

function saveStore() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tempPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2));
  fs.renameSync(tempPath, STORE_PATH);
}

function sendJson(res, payload, statusCode = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) reject(new Error('Request too large.'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function searchPlayers(query = '') {
  const q = String(query || '').trim().toLowerCase();
  return Object.values(store.players)
    .filter(player => {
      if (!q) return true;
      return player.username.toLowerCase().includes(q) ||
        String(player.profile.bio || '').toLowerCase().includes(q) ||
        String(player.stats.favoriteRollName || '').toLowerCase().includes(q) ||
        String(player.stats.rarestRollName || '').toLowerCase().includes(q);
    })
    .sort((a, b) => (b.stats.totalSpins - a.stats.totalSpins) || a.username.localeCompare(b.username))
    .slice(0, 100);
}

loadStore();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS') {
      sendJson(res, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, { ok: true, players: Object.keys(store.players).length });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/syntax-crates/players') {
      sendJson(res, { ok: true, players: searchPlayers(url.searchParams.get('query') || '') });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/syntax-crates/players') {
      const body = await readJsonBody(req);
      const player = sanitizePlayer(body.player);
      if (!player) {
        sendJson(res, { ok: false, error: 'Invalid player profile.' }, 400);
        return;
      }

      store.players[player.username] = player;
      saveStore();
      sendJson(res, { ok: true, player });
      return;
    }

    const profileMatch = url.pathname.match(/^\/syntax-crates\/players\/([^/]+)$/);
    if (req.method === 'GET' && profileMatch) {
      const username = normalizeUsername(decodeURIComponent(profileMatch[1]));
      const player = store.players[username];
      sendJson(res, player ? { ok: true, player } : { ok: false, error: 'Player not found.' }, player ? 200 : 404);
      return;
    }

    sendJson(res, { ok: false, error: 'Not found.' }, 404);
  } catch (error) {
    sendJson(res, { ok: false, error: error.message || 'Server failed.' }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`Syntax Crates player cloud listening on port ${PORT}`);
});
