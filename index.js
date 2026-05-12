require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const {
  DISCORD_TOKEN,
  DISCORD_CHANNEL_ID,
  CRCON_URL,
  CRCON_API_KEY,
} = process.env;

const UPDATE_INTERVAL = 60_000;
const TOP_N           = 5;
const BANNER_URL      = 'https://media.discordapp.net/attachments/1494169951999754280/1496373794745614509/Gemini_Generated_Image_ycslhwycslhwycsl.png?ex=6a035b71&is=6a0209f1&hm=36f1a135b91265b78b0c051fa32645f01e8dd3a3580063bcf2791e9646fef44b&=&format=webp&quality=lossless&width=2765&height=1542';
const CRIMSON         = 0xDC143C;

let embedMessageId = null;

// ── CRCON ─────────────────────────────────────────────────────────────────────

async function crconGet(endpoint) {
  const res  = await fetch(`${CRCON_URL}/api/${endpoint}`, {
    headers: { Authorization: `Bearer ${CRCON_API_KEY}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`CRCON ${endpoint} → ${res.status}`);
  return json.result;
}

async function getLiveStats() {
  const data    = await crconGet('get_live_scoreboard');
  const players = Array.isArray(data) ? data : (data?.stats ?? data?.players ?? []);
  return players;
}

async function getScores() {
  try {
    const data = await crconGet('get_team_view');
    const scores = {};
    const sides = [data?.allies, data?.axis].filter(Boolean);
    for (const side of sides) {
      const players = side?.players ?? [];
      for (const p of players) {
        const id = p.player_id ?? p.steam_id_64;
        if (id) {
          scores[id] = {
            combat:  p.combat  ?? 0,
            offense: p.offense ?? 0,
            defense: p.defense ?? 0,
            support: p.support ?? 0,
          };
        }
      }
    }
    return scores;
  } catch {
    return {};
  }
}

async function getCurrentMapName() {
  try {
    const raw = await crconGet('get_map');
    return typeof raw === 'string' ? raw : (raw.pretty_name ?? raw.id ?? '');
  } catch {
    return '';
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function getKdr(p) {
  return p.kill_death_ratio ?? p.kdr ?? (p.kills / Math.max(p.deaths || 1, 1));
}

function getField(p, ...keys) {
  for (const k of keys) {
    if (p[k] != null && p[k] !== 0) return p[k];
  }
  for (const k of keys) {
    if (p[k] != null) return p[k];
  }
  return null;
}

function topList(label, players, keyFn, format) {
  const sorted = [...players]
    .map(p => ({ ...p, _val: typeof keyFn === 'function' ? keyFn(p) : getField(p, keyFn) }))
    .filter(p => p._val != null && !isNaN(p._val))
    .sort((a, b) => b._val - a._val)
    .slice(0, TOP_N);

  if (!sorted.length) return { name: label, value: '```\nNo data\n```', inline: false };

  const lines = sorted.map((p, i) => {
    const val  = String(format(p._val)).padStart(6);
    const name = (p.player ?? p.name ?? 'Unknown').slice(0, 20);
    return `[#${i + 1}] ${val}  ${name}`;
  });

  return { name: label, value: '```\n' + lines.join('\n') + '\n```', inline: false };
}

function footer() {
  return `Updates every 60s • ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET`;
}

// ── Embed builder ─────────────────────────────────────────────────────────────

function buildEmbed(players, map) {
  return new EmbedBuilder()
    .setTitle('Sentinel VII | New York — Player Stats')
    .setDescription(map ? `**${map}**` : '')
    .setColor(CRIMSON)
    .setImage(BANNER_URL)
    .addFields(
      topList('Kills',          players, 'kills',            v => v),
      topList('KDR',            players, getKdr,             v => v.toFixed(2)),
      topList('KPM',            players, 'kills_per_minute', v => v.toFixed(2)),
      topList('Combat Score',   players, 'combat',           v => v),
      topList('Offense Score',  players, 'offense',          v => v),
      topList('Defense Score',  players, 'defense',          v => v),
      topList('Support Score',  players, 'support',          v => v),
    )
    .setFooter({ text: footer() })
    .setTimestamp();
}

function buildEmptyEmbed() {
  return new EmbedBuilder()
    .setTitle('Sentinel VII | New York — Player Stats')
    .setDescription('No players currently on the server.')
    .setColor(0x555555)
    .setImage(BANNER_URL)
    .setFooter({ text: footer() })
    .setTimestamp();
}

// ── Embed lifecycle ───────────────────────────────────────────────────────────

async function updateEmbed(channel) {
  try {
    const [players, scores, map] = await Promise.all([
      getLiveStats(),
      getScores(),
      getCurrentMapName(),
    ]);

    // Merge team view scores into live scoreboard players
    const merged = players.map(p => {
      const id = p.player_id ?? p.steam_id_64;
      const s  = scores[id] ?? {};
      return { ...p, ...s };
    });

    const embed = merged.length ? buildEmbed(merged, map) : buildEmptyEmbed();

    if (embedMessageId) {
      try {
        const msg = await channel.messages.fetch(embedMessageId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch {
        embedMessageId = null;
      }
    }

    const msg = await channel.send({ embeds: [embed] });
    embedMessageId = msg.id;
    console.log(`[embed] posted → ${msg.id}`);
  } catch (err) {
    console.error('[update] error:', err.message);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  console.log(`[bot] online as ${client.user.tag}`);
  const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
  await updateEmbed(channel);
  setInterval(() => updateEmbed(channel), UPDATE_INTERVAL);
});

client.login(DISCORD_TOKEN);
