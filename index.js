const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const fs = require("fs");
require("dotenv").config();

/* ================= CONFIG ================= */

const CATEGORY_ID = "1514197100064407583";
const TEXT_CHANNEL_ID = "1514196466820845748";
const LOG_CHANNEL_ID = "1514193783573577858";
const WAITING_VOICE_CHANNEL_ID = "1514198634982408192";

/* ========================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

/* ================= STATE ================= */

const activeDispatch = new Map(); // chefId => channelId
const botVoiceChannels = new Set();
const dispatchInfo = new Map(); // channelId => { plaque, createdAt, members: Set<string> }

/* ================= TEMPS DE PATROUILLE ================= */

const PATROL_FILE = "./patrolTime.json";
const memberSessions = new Map(); // userId => startTimestamp (vocal de dispatch en cours)

function loadPatrolData() {
  try {
    return JSON.parse(fs.readFileSync(PATROL_FILE, "utf8"));
  } catch {
    return { lastSent: null, totals: {} };
  }
}

function savePatrolData() {
  fs.writeFileSync(PATROL_FILE, JSON.stringify(patrolData, null, 2));
}

let patrolData = loadPatrolData();

function addPatrolTime(member, seconds) {
  if (seconds <= 0) return;
  const entry = patrolData.totals[member.id] || { name: member.displayName, seconds: 0 };
  entry.name = member.displayName;
  entry.seconds += seconds;
  patrolData.totals[member.id] = entry;
  savePatrolData();
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}min`;
}

function getParisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return { weekday: map.weekday, hour: parseInt(map.hour, 10), minute: parseInt(map.minute, 10) };
}

function getParisDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
}

async function sendWeeklyPatrolReport() {
  const entries = Object.values(patrolData.totals)
    .filter(e => e.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  let msg = "📊 **Récap hebdomadaire des temps de patrouille**\n";
  msg += entries.length
    ? entries.map(e => `• **${e.name}** : ${formatDuration(e.seconds)}`).join("\n")
    : "Aucun dispatch effectué cette semaine.";

  const ch = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (ch) await ch.send(msg).catch(() => {});

  patrolData = { lastSent: getParisDateString(), totals: {} };
  savePatrolData();
}

function startPatrolScheduler() {
  setInterval(() => {
    const { weekday, hour, minute } = getParisParts();
    if (weekday === "Thu" && hour === 20 && minute === 0) {
      const today = getParisDateString();
      if (patrolData.lastSent !== today) {
        sendWeeklyPatrolReport();
      }
    }
  }, 60 * 1000);
}

/* ================= DISPATCH ================= */

const DISPATCH_ORDER = ["LINCOLN", "ADAM", "TANGO", "DELTA"];
const DISPATCH_LIMITS = {
  LINCOLN: 1,
  ADAM: 2,
  TANGO: 3,
  DELTA: 4
};

/* ================= LOG ================= */

function getTimestamp(date = new Date()) {
  return date.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

async function sendLog(guild, msg) {
  const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (ch) ch.send({ content: `🕒 ${getTimestamp()}\n${msg}` }).catch(() => {});
}

/* ================= READY ================= */

client.once("clientReady", async () => {
  console.log("✅ Bot prêt");

  startPatrolScheduler();

  const channel = await client.channels.fetch(TEXT_CHANNEL_ID);
  await channel.bulkDelete(50).catch(() => {});

  const title = txt =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`title_${txt}`)
        .setLabel(txt)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

  const row = (style, ids) =>
    new ActionRowBuilder().addComponents(
      ids.map(id =>
        new ButtonBuilder()
          .setCustomId(`dispatch_${id}`)
          .setLabel(id.toUpperCase())
          .setStyle(style)
      )
    );

  /* 🚓 PATROUILLES */
  await channel.send({ components: [title("🚓 DISPATCHS PATROUILLE")] });
  await channel.send({
    components: [
      row(ButtonStyle.Success, ["lincoln","adam","tango","delta"]),
      row(ButtonStyle.Success, ["mary","victor","henry","bravo"])
    ]
  });

  /* 🛡️ UNITÉS */
  await channel.send({ components: [title("🛡️ DISPATCHS UNITÉS")] });
  await channel.send({
    components: [
      row(ButtonStyle.Primary, ["swat","cid","k9"])
    ]
  });

  /* 🎯 SPÉCIFIQUES */
  await channel.send({ components: [title("🎯 DISPATCHS SPÉCIFIQUES")] });
  await channel.send({
    components: [
      row(ButtonStyle.Secondary, ["banalise","recrutement","operation"])
    ]
  });

  /* 🟥 GESTION */
  await channel.send({ components: [title("🟥 GESTION DU DISPATCH")] });
  await channel.send({
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("add_member")
          .setLabel("➕ Ajouter un membre")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("remove_member")
          .setLabel("➖ Retirer un membre")
          .setStyle(ButtonStyle.Danger)
      )
    ]
  });
});

/* ================= UTILS ================= */

function getCurrentDispatch(name) {
  return DISPATCH_ORDER.find(d => name.includes(d));
}

function getNextDispatch(cur) {
  const i = DISPATCH_ORDER.indexOf(cur);
  return DISPATCH_ORDER[i + 1] || null;
}

function getPrevDispatch(cur) {
  const i = DISPATCH_ORDER.indexOf(cur);
  return i > 0 ? DISPATCH_ORDER[i - 1] : null;
}

function findMemberByPartialName(guild, search) {
  search = search.toLowerCase();
  const matches = guild.members.cache.filter(m =>
    m.displayName.toLowerCase().includes(search)
  );
  return matches.size === 1 ? matches.first() : null;
}

async function evolveDispatch(guild, oldCh, next) {
  const limit = DISPATCH_LIMITS[next];
  const base = oldCh.name.split("|").slice(1,3).map(x => x.trim()).join(" | ");

  const newCh = await guild.channels.create({
    name: `🚓 ${next} | ${base} | ${oldCh.members.size}/${limit}`,
    type: ChannelType.GuildVoice,
    parent: CATEGORY_ID,
    userLimit: limit
  });

  botVoiceChannels.add(newCh.id);

  const info = dispatchInfo.get(oldCh.id);
  if (info) {
    dispatchInfo.set(newCh.id, info);
    dispatchInfo.delete(oldCh.id);
  }

  for (const m of oldCh.members.values()) {
    await m.voice.setChannel(newCh).catch(() => {});
  }

  botVoiceChannels.delete(oldCh.id);
  await oldCh.delete().catch(() => {});
  return newCh;
}

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction => {
  try {

    /* ===== OUVERTURE MODAL CRÉATION ===== */
    if (interaction.isButton() && interaction.customId.startsWith("dispatch_")) {
      if (interaction.member.voice?.channelId !== WAITING_VOICE_CHANNEL_ID) {
        return interaction.reply({
          content: "❌ Tu dois être dans le salon vocal d'attente pour créer un dispatch.",
          flags: 64
        });
      }

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(interaction.customId)
          .setTitle("Créer un dispatch")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("matricule")
                .setLabel("Matricule")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("plaque")
                .setLabel("Plaque")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("members")
                .setLabel("Membres (optionnel)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            )
          )
      );
    }

    /* ===== CRÉATION DISPATCH (CORRIGÉ) ===== */
    if (interaction.isModalSubmit() && interaction.customId.startsWith("dispatch_")) {
      await interaction.deferReply({ flags: 64 });

      let type = interaction.customId.replace("dispatch_","").toUpperCase();
      let limit = DISPATCH_LIMITS[type];

      const matricule = interaction.fields.getTextInputValue("matricule");
      const plaque = interaction.fields.getTextInputValue("plaque");
      const membersRaw = interaction.fields.getTextInputValue("members") || "";

      let ch = await interaction.guild.channels.create({
        name: `🚓 ${type} | ${matricule} | ${plaque} | 1/${limit}`,
        type: ChannelType.GuildVoice,
        parent: CATEGORY_ID,
        userLimit: limit
      });

      botVoiceChannels.add(ch.id);
      activeDispatch.set(interaction.user.id, ch.id);
      dispatchInfo.set(ch.id, { plaque, createdAt: Date.now(), members: new Set() });

      await interaction.member.voice.setChannel(ch).catch(() => {});

      /* 🔥 AJOUT AUTO DES MEMBRES 🔥 */
      if (membersRaw.trim()) {
        const names = membersRaw.split("/").map(x => x.trim()).filter(Boolean);

        for (const name of names) {
          const member = findMemberByPartialName(interaction.guild, name);
          if (!member || !member.voice?.channel) continue;

          const current = getCurrentDispatch(ch.name);
          const next = getNextDispatch(current);

          if (next && ch.members.size >= DISPATCH_LIMITS[current]) {
            ch = await evolveDispatch(interaction.guild, ch, next);
            activeDispatch.set(interaction.user.id, ch.id);
          }

          await member.voice.setChannel(ch).catch(() => {});
        }
      }

      return interaction.editReply("✅ Dispatch créé");
    }

    /* ===== AJOUT MEMBRE ===== */
    if (interaction.isButton() && interaction.customId === "add_member") {
      if (!activeDispatch.has(interaction.user.id)) {
        await interaction.reply({ content: "❌ Aucun dispatch actif", flags: 64 });
        return;
      }

      if (interaction.member.voice?.channelId !== activeDispatch.get(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Tu dois être dans le salon vocal de ton dispatch pour utiliser cette action.",
          flags: 64
        });
      }

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId("add_member_modal")
          .setTitle("Ajouter un membre")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("member")
                .setLabel("Pseudo partiel")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    }

    if (interaction.isModalSubmit() && interaction.customId === "add_member_modal") {
      await interaction.deferReply({ flags: 64 });

      let ch = interaction.guild.channels.cache.get(activeDispatch.get(interaction.user.id));
      if (!ch) return interaction.editReply("❌ Dispatch introuvable");

      const names = interaction.fields.getTextInputValue("member")
        .split("/").map(x => x.trim()).filter(Boolean);

      const added = [];
      const failed = [];

      for (const name of names) {
        const member = findMemberByPartialName(interaction.guild, name);

        if (!member || !member.voice?.channel) {
          failed.push(name);
          continue;
        }

        const current = getCurrentDispatch(ch.name);
        const next = getNextDispatch(current);

        if (next && ch.members.size >= DISPATCH_LIMITS[current]) {
          ch = await evolveDispatch(interaction.guild, ch, next);
          activeDispatch.set(interaction.user.id, ch.id);
        }

        await member.voice.setChannel(ch).catch(() => {});
        added.push(member.displayName);
      }

      let reply = "";
      if (added.length) reply += `✅ Ajouté(s) : ${added.join(", ")}`;
      if (failed.length) reply += `${reply ? "\n" : ""}❌ Introuvable(s) ou pas en vocal : ${failed.join(", ")}`;

      return interaction.editReply(reply || "❌ Aucun membre traité");
    }

    /* ===== RETRAIT MEMBRE ===== */
    if (interaction.isButton() && interaction.customId === "remove_member") {
      if (!activeDispatch.has(interaction.user.id)) {
        await interaction.reply({ content: "❌ Aucun dispatch actif", flags: 64 });
        return;
      }

      if (interaction.member.voice?.channelId !== activeDispatch.get(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Tu dois être dans le salon vocal de ton dispatch pour utiliser cette action.",
          flags: 64
        });
      }

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId("remove_member_modal")
          .setTitle("Retirer un membre")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("member")
                .setLabel("Pseudo partiel")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    }

    if (interaction.isModalSubmit() && interaction.customId === "remove_member_modal") {
      await interaction.deferReply({ flags: 64 });

      let ch = interaction.guild.channels.cache.get(activeDispatch.get(interaction.user.id));
      if (!ch) return interaction.editReply("❌ Dispatch introuvable");

      const names = interaction.fields.getTextInputValue("member")
        .split("/").map(x => x.trim().toLowerCase()).filter(Boolean);

      const removed = [];
      const failed = [];

      for (const search of names) {
        const matches = ch.members.filter(m =>
          m.displayName.toLowerCase().includes(search)
        );

        if (matches.size !== 1) {
          failed.push(search);
          continue;
        }

        const member = matches.first();
        await member.voice.setChannel(WAITING_VOICE_CHANNEL_ID).catch(() => {});

        let current = getCurrentDispatch(ch.name);
        let prev = getPrevDispatch(current);
        while (prev && ch.members.size > 0 && ch.members.size <= DISPATCH_LIMITS[prev]) {
          ch = await evolveDispatch(interaction.guild, ch, prev);
          activeDispatch.set(interaction.user.id, ch.id);
          current = prev;
          prev = getPrevDispatch(current);
        }
        removed.push(member.displayName);
      }

      let reply = "";
      if (removed.length) reply += `✅ Retiré(s) : ${removed.join(", ")}`;
      if (failed.length) reply += `${reply ? "\n" : ""}❌ Introuvable(s) ou pas dans ce dispatch : ${failed.join(", ")}`;

      return interaction.editReply(reply || "❌ Aucun membre traité");
    }

  } catch (e) {
    console.error("❌ Erreur interaction :", e);
  }
});

/* ================= AUTO DELETE ================= */

client.on("voiceStateUpdate", async (oldState, newState) => {
  /* ===== SUIVI DES PERSONNES PRÉSENTES ===== */
  if (newState.channel && botVoiceChannels.has(newState.channel.id)) {
    const info = dispatchInfo.get(newState.channel.id);
    if (info) info.members.add(newState.member.displayName);
  }

  /* ===== SUIVI DU TEMPS DE PATROUILLE ===== */
  const member = newState.member || oldState.member;
  const wasInDispatch = oldState.channel && botVoiceChannels.has(oldState.channel.id);
  const isInDispatch = newState.channel && botVoiceChannels.has(newState.channel.id);

  if (isInDispatch && !wasInDispatch) {
    memberSessions.set(member.id, Date.now());
  } else if (wasInDispatch && !isInDispatch) {
    const start = memberSessions.get(member.id);
    if (start) {
      addPatrolTime(member, Math.floor((Date.now() - start) / 1000));
      memberSessions.delete(member.id);
    }
  }

  const ch = oldState.channel;
  if (ch && botVoiceChannels.has(ch.id) && ch.members.size === 0) {
    const info = dispatchInfo.get(ch.id);
    if (info) {
      await sendLog(ch.guild,
        `🗑️ DISPATCH TERMINÉ • ${ch.name}
Personnes présentes : ${[...info.members].join(", ") || "Aucune"}
Plaque : ${info.plaque}
Début : ${getTimestamp(new Date(info.createdAt))}
Fin : ${getTimestamp()}`
      );
      dispatchInfo.delete(ch.id);
    }
    botVoiceChannels.delete(ch.id);
    await ch.delete().catch(() => {});
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);