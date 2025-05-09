import { CommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import i18n from '../locales';
import { CONFIG } from '../config';

const availableLanguages = ['en', 'es', 'fr'];

export const data = new SlashCommandBuilder()
  .setName("language")
  .setDescription("Change the bot's language")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option =>
    option.setName('locale')
      .setDescription('Select language')
      .setRequired(true)
      .addChoices(
        { name: 'English', value: 'en' },
        { name: 'Español', value: 'es' },
        { name: 'Français', value: 'fr' }
      )
  );

export async function execute(interaction: CommandInteraction) {
  const locale = interaction.options.get('locale')?.value as string;

  if (locale && availableLanguages.includes(locale)) {
    i18n.setLocale(locale);
    CONFIG.locale = locale;
    return interaction.reply({content: `Language changed to: ${locale}`, flags: 'Ephemeral'});
  } else {
    return interaction.reply('Invalid language selected.');
  }
}

