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

/* ================= DISPATCH ================= */

const DISPATCH_ORDER = ["LINCOLN", "ADAM", "TANGO", "DELTA"];
const DISPATCH_LIMITS = {
  LINCOLN: 1,
  ADAM: 2,
  TANGO: 3,
  DELTA: 4
};

/* ================= LOG ================= */

function getTimestamp() {
  return new Date().toLocaleTimeString("fr-FR", {
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
      row(ButtonStyle.Success, ["mary","victor","henry","baro"])
    ]
  });

  /* 🛡️ UNITÉS */
  await channel.send({ components: [title("🛡️ DISPATCHS UNITÉS")] });
  await channel.send({
    components: [
      row(ButtonStyle.Primary, ["swat","cid"])
    ]
  });

  /* 🎯 SPÉCIFIQUES */
  await channel.send({ components: [title("🎯 DISPATCHS SPÉCIFIQUES")] });
  await channel.send({
    components: [
      row(ButtonStyle.Secondary, ["banalise","mainhall","bureau"]),
      row(ButtonStyle.Secondary, ["formation","recrutement","operation"])
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

      await interaction.member.voice.setChannel(ch).catch(() => {});

      /* 🔥 AJOUT AUTO DES MEMBRES 🔥 */
      if (membersRaw.trim()) {
        const names = membersRaw.split(",").map(x => x.trim()).filter(Boolean);

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

      await sendLog(interaction.guild,
        `🚓 DISPATCH CRÉÉ
Chef : ${interaction.member.displayName}
Type : ${type}
Matricule : ${matricule}
Plaque : ${plaque}`
      );

      return interaction.editReply("✅ Dispatch créé");
    }

    /* ===== AJOUT MEMBRE ===== */
    if (interaction.isButton() && interaction.customId === "add_member") {
      if (interaction.member.voice?.channelId !== WAITING_VOICE_CHANNEL_ID) {
        return interaction.reply({
          content: "❌ Tu dois être dans le salon vocal d'attente pour utiliser cette action.",
          flags: 64
        });
      }

      if (!activeDispatch.has(interaction.user.id)) {
        await interaction.reply({ content: "❌ Aucun dispatch actif", flags: 64 });
        return;
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

      const member = findMemberByPartialName(
        interaction.guild,
        interaction.fields.getTextInputValue("member")
      );

      if (!member || !member.voice?.channel)
        return interaction.editReply("❌ Membre introuvable ou pas en vocal");

      const current = getCurrentDispatch(ch.name);
      const next = getNextDispatch(current);

      if (next && ch.members.size >= DISPATCH_LIMITS[current]) {
        ch = await evolveDispatch(interaction.guild, ch, next);
        activeDispatch.set(interaction.user.id, ch.id);
      }

      await member.voice.setChannel(ch).catch(() => {});
      return interaction.editReply("✅ Membre ajouté");
    }

  } catch (e) {
    console.error("❌ Erreur interaction :", e);
  }
});

/* ================= AUTO DELETE ================= */

client.on("voiceStateUpdate", async oldState => {
  const ch = oldState.channel;
  if (ch && botVoiceChannels.has(ch.id) && ch.members.size === 0) {
    await sendLog(ch.guild, `🗑️ DISPATCH SUPPRIMÉ • ${ch.name}`);
    botVoiceChannels.delete(ch.id);
    await ch.delete().catch(() => {});
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);