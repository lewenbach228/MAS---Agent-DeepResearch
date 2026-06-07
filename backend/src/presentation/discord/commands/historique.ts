import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import type { ReportRepository } from '../../../domain/ports/Repository.js';

/**
 * Commande /historique.
 *
 * Affiche les 10 dernières recherches de l'utilisateur avec leur statut.
 */
export const historiqueCommand = {
  data: new SlashCommandBuilder()
    .setName('historique')
    .setDescription('Affiche vos 10 dernières recherches'),

  async execute(
    interaction: ChatInputCommandInteraction,
    deps: { reportRepository: ReportRepository; baseUrl: string },
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const reports = await deps.reportRepository.findByUserId(interaction.user.id, 10);

      if (reports.length === 0) {
        await interaction.editReply({
          content: '📭 Aucune recherche pour le moment. Utilise `/analyze` pour lancer une analyse.',
        });
        return;
      }

      const description = reports
        .map((r, i) => {
          const date = new Date(r.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
          const status =
            r.status === 'completed'
              ? '✅'
              : r.status === 'error'
                ? '❌'
                : '⏳';
          const link = `${deps.baseUrl}/r/${r.id}`;
          return `**${i + 1}.** ${status} ${r.question.slice(0, 80)} — ${date}\n   🔗 ${link}`;
        })
        .join('\n\n');

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('📋 Historique des recherches')
        .setDescription(description)
        .setFooter({ text: `${reports.length} recherche(s) au total` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await interaction.editReply({
        content: `❌ Erreur : ${errorMsg.slice(0, 100)}`,
      });
    }
  },
};
