require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const {
  DISCORD_TOKEN,
  DISCORD_CHANNEL_ID,
  CRCON_URL,
  CRCON_API_KEY,
} = process.env;

const UPDATE_INTERVAL = 60_000; // 60 seconds
const TOP_N = 5;

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
  const data = await crconGet('get_live_scoreboard');
  // Normalise — result may be an array or { players: [...] }
  const players = Array.isArray(data) ? data : (data?.players ?? data?.stats ?? []);
  return players;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function medal(i) {
  return ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i] ?? `${i + 1}.`;
}

function topList(players, key, format) {
  return [...players]
    .filter(p => p[key] != null)
    .sort((a, b) => b[key] - a[key])
    .slice(0, TOP_N)
    .map((p, i) => `${medal(i)} **${p.player ?? p.name ?? 'Unknown'}** — ${format(p[key])}`)
    .join('\n') || '*No data*';
}

function buildEmbed(players, map) {
  const kills   = topList(players, 'kills',   v => v);
  const deaths  = topList(players, 'deaths',  v => v);
  const kpm     = topList(players, 'kills_per_minute', v => v.toFixed(2));

  return new EmbedBuilder()
    .setTitle('📊 Live Player Stats')
    .setDescription(map ? `**${map}**` : '')
    .setColor(0x8B0000)
    .addFields(
      { name: '🔫 Highest Kills',  value: kills,  inline: true },
      { name: '💀 Highest Deaths', value: deaths, inline: true },
      { name: '\u200B',            value: '\u200B', inline: false }, // spacer
      { name: '⚡ Kills / Minute', value: kpm,    inline: false },
    )
    .setFooter({ text: `Updates every 60s • ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET` })
    .setTimestamp();
}

function buildEmptyEmbed() {
  return new EmbedBuilder()
    .setTitle('📊 Live Player Stats')
    .setDescription('No players currently on the server.')
    .setColor(0x555555)
    .setFooter({ text: `Updates every 60s • ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET` })
    .setTimestamp();
}

// ── Map name ──────────────────────────────────────────────────────────────────

async function getCurrentMapName() {
  try {
    const raw = await crconGet('get_map');
    return typeof raw === 'string' ? raw : (raw.pretty_name ?? raw.id ?? '');
  } catch {
    return '';
  }
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
        // Message was deleted — fall through to post a new one
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
