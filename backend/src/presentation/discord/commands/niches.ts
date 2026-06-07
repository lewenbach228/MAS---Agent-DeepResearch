import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import type { NicheLoader } from '../../../domain/ports/NicheLoader.js';
import { buildNichesEmbed } from '../embeds.js';

/**
 * Commande /niches.
 *
 * Liste toutes les niches disponibles avec leur description.
 * Chaque niche correspond à une commande Discord (ex: /analyze).
 *
 * Ajouter une niche = créer un fichier JSON dans backend/niches/.
 */
export const nichesCommand = {
  data: new SlashCommandBuilder()
    .setName('niches')
    .setDescription('Liste les niches de recherche disponibles'),

  async execute(
    interaction: ChatInputCommandInteraction,
    deps: { nicheLoader: NicheLoader },
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const niches = await deps.nicheLoader.listAll();

      const embed = buildNichesEmbed(
        niches.map((n) => ({
          name: n.name,
          emoji: n.emoji,
          description: n.description,
          command: n.command,
        })),
      );

      if (niches.length === 0) {
        embed.setDescription('Aucune niche disponible pour le moment.');
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await interaction.editReply({
        content: `❌ Erreur : ${errorMsg.slice(0, 100)}`,
      });
    }
  },
};
