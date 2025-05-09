// src/commands/configuration.ts
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { GuildConfiguration, guildConfigurationManager } from "../config/guild-configurations";
import Roboto from "../roboto";
import i18n from "../locales";
import { CONFIG } from "../config";

const maxPromptPreview = 300;

export const data = new SlashCommandBuilder()
    .setName("config")
    .setDescription(i18n.t("commands.config.description"))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
        option
            .setName("name")
            .setDescription(i18n.t("commands.config.options.name"))
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName("promptinfo")
            .setDescription(i18n.t("commands.config.options.promptinfo"))
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName("botname")
            .setDescription(i18n.t("commands.config.options.botname"))
            .setRequired(false)
    )
    .addIntegerOption(option =>
        option
            .setName("maxmessages")
            .setDescription(i18n.t("commands.config.options.maxmessages"))
            .setMinValue(1)
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName("ttsprovider")
            .setDescription(i18n.t("commands.config.options.ttsprovider"))
            .addChoices(
                { name: "OpenAI", value: "OPENAI" },
                { name: "ElevenLabs", value: "ELEVENLABS" }
            )
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option
            .setName("imagecreationenabled")
            .setDescription(i18n.t("commands.config.options.imagecreationenabled"))
            .setRequired(false)
    );

export async function execute(interaction: any) {
    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({
            content: i18n.t("commands.config.responses.noGuild"),
            flags: [MessageFlags.Ephemeral],
        });
    }

    const current = guildConfigurationManager.getGuildConfig(guildId, interaction.guild.name);
    const opts: Partial<Omit<GuildConfiguration, "guildId">> = {};

    if (interaction.options.getString("name") !== null)
        opts.name = interaction.options.getString("name");
    if (interaction.options.getString("promptinfo") !== null)
        opts.promptInfo = interaction.options.getString("promptinfo");
    if (interaction.options.getString("botname") !== null)
        opts.botName = interaction.options.getString("botname");
    if (interaction.options.getInteger("maxmessages") !== null)
        opts.maxMessages = interaction.options.getInteger("maxmessages");
    if (interaction.options.getString("ttsprovider") !== null)
        opts.ttsProvider = interaction.options.getString("ttsprovider") as "OPENAI" | "ELEVENLABS";
    if (interaction.options.getBoolean("imagecreationenabled") !== null)
        opts.imageCreationEnabled = interaction.options.getBoolean("imagecreationenabled");

    // Si no se pasó ninguna opción, mostramos la config actual
    if (Object.keys(opts).length === 0) {
        const embed = new EmbedBuilder()
            .setTitle(i18n.t("commands.config.responses.currentTitle"))
            .setColor(0x00AFAF)
            .addFields(
                { name: i18n.t("commands.config.fields.name"), value: current.name, inline: true },
                {
                    name: i18n.t("commands.config.fields.prompt"),
                    value:
                        current.promptInfo.slice(0, maxPromptPreview) +
                        (current.promptInfo.length > maxPromptPreview ? "…" : ""),
                    inline: false,
                },
                { name: i18n.t("commands.config.fields.botName"), value: current.botName!, inline: true },
                {
                    name: i18n.t("commands.config.fields.maxMessages"),
                    value: current.maxMessages!.toString(),
                    inline: true,
                },
                {
                    name: i18n.t("commands.config.fields.ttsProvider"),
                    value: current.ttsProvider!,
                    inline: true,
                },
                {
                    name: i18n.t("commands.config.fields.imageCreation"),
                    value: current.imageCreationEnabled! ? "✅" : "❌",
                    inline: true,
                }
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Actualizar la configuración
    const updated = guildConfigurationManager.updateGuildConfig(current, opts);
    // Refrescar en memoria (opcional)
    const guildData = Roboto.getGuildData(guildId);
    guildData.guildConfig = updated;

    // Enviar confirmación
    const embed = new EmbedBuilder()
        .setTitle(i18n.t("commands.config.responses.updatedTitle"))
        .setColor(0x00FF7F)
        .addFields(
            { name: i18n.t("commands.config.fields.name"), value: updated.name, inline: true },
            {
                name: i18n.t("commands.config.fields.prompt"),
                value:
                    updated.promptInfo.slice(0, maxPromptPreview) +
                    (updated.promptInfo.length > maxPromptPreview ? "…" : ""),
                inline: false,
            },
            { name: i18n.t("commands.config.fields.botName"), value: updated.botName!, inline: true },
            {
                name: i18n.t("commands.config.fields.maxMessages"),
                value: updated.maxMessages!.toString(),
                inline: true,
            },
            {
                name: i18n.t("commands.config.fields.ttsProvider"),
                value: updated.ttsProvider!,
                inline: true,
            },
            {
                name: i18n.t("commands.config.fields.imageCreation"),
                value: updated.imageCreationEnabled! ? "✅" : "❌",
                inline: true,
            }
        )
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
}