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
  const players = Array.isArray(data) ? data : (data?.players ?? data?.stats ?? []);
  return players;
}

async function getCurrentMapName() {
  try {
    const raw = await crconGet('get_map');
    return typeof raw === 'string' ? raw : (raw.pretty_name ?? raw.id ?? '');
  } catch {
    return '';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getKdr(p) {
  return p.kill_death_ratio ?? p.kdr ?? (p.kills / Math.max(p.deaths || 1, 1));
}

function topList(players, keyFn, format) {
  const sorted = [...players]
    .map(p => ({ ...p, _val: typeof keyFn === 'function' ? keyFn(p) : p[keyFn] }))
    .filter(p => p._val != null && !isNaN(p._val))
    .sort((a, b) => b._val - a._val)
    .slice(0, TOP_N);

  if (!sorted.length) return '```\nNo data\n```';

  const lines = sorted.map((p, i) => {
    const name = (p.player ?? p.name ?? 'Unknown').slice(0, 18).padEnd(18);
    return `[#${i + 1}] ${name} ${format(p._val)}`;
  });

  return '```\n' + lines.join('\n') + '\n```';
}

function footer() {
  return `Updates every 60s • ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET`;
}

// ── Embed builder ─────────────────────────────────────────────────────────────

function buildEmbed(players, map) {
  const kills   = topList(players, 'kills',            v => v);
  const kdr     = topList(players, getKdr,             v => v.toFixed(2));
  const kpm     = topList(players, 'kills_per_minute', v => v.toFixed(2));
  const combat  = topList(players, 'combat',           v => v);
  const offense = topList(players, 'offense',          v => v);
  const defense = topList(players, 'defense',          v => v);
  const support = topList(players, 'support',          v => v);

  return new EmbedBuilder()
    .setTitle('Sentinel VII | New York — Player Stats')
    .setDescription(map ? `**${map}**` : '')
    .setColor(CRIMSON)
    .setImage(BANNER_URL)
    .addFields(
      { name: 'Kills',   value: kills,   inline: true  },
      { name: 'KDR',     value: kdr,     inline: true  },
      { name: '\u200B',  value: '\u200B', inline: false },
      { name: 'KPM',     value: kpm,     inline: true  },
      { name: 'Combat',  value: combat,  inline: true  },
      { name: '\u200B',  value: '\u200B', inline: false },
      { name: 'Offense', value: offense, inline: true  },
      { name: 'Defense', value: defense, inline: true  },
      { name: '\u200B',  value: '\u200B', inline: false },
      { name: 'Support', value: support, inline: false },
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
    const [players, map] = await Promise.all([getLiveStats(), getCurrentMapName()]);
    const embed = players.length ? buildEmbed(players, map) : buildEmptyEmbed();

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
