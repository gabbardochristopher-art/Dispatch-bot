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

/* ------------ CLIENT ------------ */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

/* ------------ CONFIG ------------ */

const CATEGORY_ID = "1452091744807157980";
const TEXT_CHANNEL_ID = "1452092865126862961";

const createdVoiceChannels = new Map();

/* ------------ READY ------------ */

client.once("ready", async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);

  const channel = await client.channels.fetch(TEXT_CHANNEL_ID);

  /* ===== TITRES ===== */

  const titlePatrol = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("title_patrol")
      .setLabel("🚓 DISPATCHS PATROUILLE")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  const titleUnits = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("title_units")
      .setLabel("🛡️ DISPATCHS D’UNITÉS")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  const titleSpecial = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("title_special")
      .setLabel("🎯 DISPATCHS SPÉCIFIQUES")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  /* ===== PATROUILLE ===== */

  const patrolRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("lincoln").setLabel("Lincoln").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("adam").setLabel("Adam").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("tango").setLabel("Tango").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("delta").setLabel("Delta").setStyle(ButtonStyle.Success)
  );

  const patrolRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mary").setLabel("Mary").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("victor").setLabel("Victor").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("henry").setLabel("Henry").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("baro").setLabel("Baro").setStyle(ButtonStyle.Success)
  );

  /* ===== UNITÉS ===== */

  const unitRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("qrf").setLabel("QRF").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sahp").setLabel("SAHP").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("echo").setLabel("ECHO").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("doa").setLabel("DOA").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("k9").setLabel("K9").setStyle(ButtonStyle.Primary)
  );

  const unitRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("sru").setLabel("SRU").setStyle(ButtonStyle.Primary)
  );

  /* ===== SPÉCIFIQUES ===== */

  const specialRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("banalise").setLabel("Banalisé").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("mainhall").setLabel("Mainhall").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bureau").setLabel("Bureau").setStyle(ButtonStyle.Secondary)
  );

  const specialRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("formation").setLabel("Formation").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("recrutement").setLabel("Recrutement").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("operation").setLabel("Opération").setStyle(ButtonStyle.Secondary)
  );

  /* ===== ENVOI ===== */

  await channel.send({ components: [titlePatrol] });
  await channel.send({ components: [patrolRow1, patrolRow2] });

  await channel.send({ components: [titleUnits] });
  await channel.send({ components: [unitRow1, unitRow2] });

  await channel.send({ components: [titleSpecial] });
  await channel.send({ components: [specialRow1, specialRow2] });
});

/* ------------ INTERACTIONS ------------ */

client.on("interactionCreate", async interaction => {
  try {

    /* ----- BOUTONS ----- */
    if (interaction.isButton()) {

      if (!interaction.member.voice || !interaction.member.voice.channel) {
        return interaction.reply({
          content: "❌ Tu dois être dans un salon vocal.",
          ephemeral: true
        });
      }

      const dispatchName = interaction.customId.toUpperCase();

      const modal = new ModalBuilder()
        .setCustomId(`dispatch_modal_${dispatchName}`)
        .setTitle(`Créer dispatch — ${dispatchName}`);

      const matricule = new TextInputBuilder()
        .setCustomId("matricule")
        .setLabel("Matricule")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const plaque = new TextInputBuilder()
        .setCustomId("plaque")
        .setLabel("Plaque")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      // ✅ LABEL CORRIGÉ + PLACEHOLDER
      const membres = new TextInputBuilder()
        .setCustomId("membres")
        .setLabel("Membres à ajouter")
        .setPlaceholder("Pseudo serveur, ID ou mention\n1 par ligne")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(matricule),
        new ActionRowBuilder().addComponents(plaque),
        new ActionRowBuilder().addComponents(membres)
      );

      return interaction.showModal(modal);
    }

    /* ----- MODAL ----- */
    if (interaction.isModalSubmit()) {

      if (!interaction.customId.startsWith("dispatch_modal_")) return;

      const dispatchName = interaction.customId.replace("dispatch_modal_", "");
      const matricule = interaction.fields.getTextInputValue("matricule");
      const plaque = interaction.fields.getTextInputValue("plaque");

      const membresRaw = interaction.fields
        .getTextInputValue("membres")
        ?.split("\n")
        .map(v => v.trim())
        .filter(Boolean) || [];

      await interaction.guild.members.fetch();

      const voiceChannel = await interaction.guild.channels.create({
        name: `🚓 ${dispatchName} - ${matricule}${plaque ? ` - ${plaque}` : ""}`,
        type: ChannelType.GuildVoice,
        parent: CATEGORY_ID
      });

      createdVoiceChannels.set(voiceChannel.id, interaction.user.id);

      await interaction.member.voice.setChannel(voiceChannel);

      const nonAjoutes = [];

      for (const entry of membresRaw) {
        let member = null;

        const mention = entry.match(/^<@!?(\d+)>$/);
        if (mention) {
          member = await interaction.guild.members.fetch(mention[1]).catch(() => null);
        } else if (/^\d{17,20}$/.test(entry)) {
          member = await interaction.guild.members.fetch(entry).catch(() => null);
        } else {
          const search = entry.toLowerCase();
          member = interaction.guild.members.cache.find(m =>
            m.displayName.toLowerCase() === search ||
            m.user.username.toLowerCase() === search
          );
        }

        if (member && member.voice.channel) {
          await member.voice.setChannel(voiceChannel);
        } else if (member) {
          nonAjoutes.push(member.displayName);
        }
      }

      await interaction.reply({
        content: `✅ Dispatch créé.${
          nonAjoutes.length ? `\n⚠️ Pas en vocal : ${nonAjoutes.join(", ")}` : ""
        }`,
        ephemeral: true
      });
    }

  } catch (err) {
    console.error("❌ Erreur interaction :", err);
  }
});

/* ------------ AUTO DELETE ------------ */

client.on("voiceStateUpdate", async oldState => {

  if (!oldState.channelId) return;

  const channel = oldState.channel;
  if (!channel) return;
  if (!createdVoiceChannels.has(channel.id)) return;

  setTimeout(async () => {
    const fetched = await channel.guild.channels.fetch(channel.id).catch(() => null);
    if (!fetched) return;

    if (fetched.members.size === 0) {
      await fetched.delete("Dispatch vide");
      createdVoiceChannels.delete(channel.id);
    }
  }, 5000);
});

/* ------------ LOGIN ------------ */

if (!process.env.TOKEN) {
  console.error("❌ TOKEN manquant (.env)");
  process.exit(1);
}

client.login(process.env.TOKEN);
