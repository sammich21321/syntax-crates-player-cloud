const MAX_BIO_LENGTH = 500;
const MAX_AVATAR_CHARS = 750000;

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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function matchesQuery(player, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return player.username.toLowerCase().includes(q) ||
    String(player.profile.bio || '').toLowerCase().includes(q) ||
    String(player.stats.favoriteRollName || '').toLowerCase().includes(q) ||
    String(player.stats.rarestRollName || '').toLowerCase().includes(q);
}

async function getAllPlayers(env, query = '') {
  const listed = await env.PLAYERS.list({ prefix: 'player:', limit: 1000 });
  const players = [];

  for (const key of listed.keys) {
    const player = await env.PLAYERS.get(key.name, 'json');
    const clean = sanitizePlayer(player);
    if (clean && matchesQuery(clean, query)) players.push(clean);
  }

  return players
    .sort((a, b) => (b.stats.totalSpins - a.stats.totalSpins) || a.username.localeCompare(b.username))
    .slice(0, 100);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return json({ ok: true });

    if (request.method === 'GET' && url.pathname === '/health') {
      const count = await env.PLAYERS.list({ prefix: 'player:', limit: 1 });
      return json({ ok: true, storage: 'cloudflare-kv', hasPlayers: count.keys.length > 0 });
    }

    if (request.method === 'GET' && url.pathname === '/syntax-crates/players') {
      return json({ ok: true, players: await getAllPlayers(env, url.searchParams.get('query') || '') });
    }

    if (request.method === 'POST' && url.pathname === '/syntax-crates/players') {
      const body = await request.json().catch(() => null);
      const player = sanitizePlayer(body && body.player);
      if (!player) return json({ ok: false, error: 'Invalid player profile.' }, 400);
      await env.PLAYERS.put(`player:${player.username}`, JSON.stringify(player));
      return json({ ok: true, player });
    }

    const profileMatch = url.pathname.match(/^\/syntax-crates\/players\/([^/]+)$/);
    if (request.method === 'GET' && profileMatch) {
      const username = normalizeUsername(decodeURIComponent(profileMatch[1]));
      const player = await env.PLAYERS.get(`player:${username}`, 'json');
      const clean = sanitizePlayer(player);
      return clean ? json({ ok: true, player: clean }) : json({ ok: false, error: 'Player not found.' }, 404);
    }

    return json({ ok: false, error: 'Not found.' }, 404);
  }
};
