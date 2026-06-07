import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import type { AgentEngine } from '../../../services/agent/AgentEngine.js';
import type { NicheLoader } from '../../../domain/ports/NicheLoader.js';
import type { UserRepository, ReportRepository } from '../../../domain/ports/Repository.js';
import { buildProgressEmbed, buildFinalEmbed } from '../embeds.js';

/**
 * Commande /analyze <sujet>.
 *
 * 1. Vérifie que la niche "analyze" existe
 * 2. Defer la réponse (Discord demande un accusé < 3s)
 * 3. Crée un thread privé pour suivre la progression
 * 4. Lance l'AgentEngine avec callback onProgress
 * 5. Sauvegarde le rapport en base
 * 6. Envoie l'embed final avec le lien
 */
export const analyzeCommand = {
  data: new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('Lance une analyse de marché sur un sujet')
    .addStringOption((option) =>
      option
        .setName('sujet')
        .setDescription('Le sujet à analyser (ex: marché des agents IA en France)')
        .setRequired(true),
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    deps: {
      agentEngine: AgentEngine;
      nicheLoader: NicheLoader;
      userRepository: UserRepository;
      reportRepository: ReportRepository;
      baseUrl: string;
    },
  ): Promise<void> {
    const sujet = interaction.options.getString('sujet', true);

    // 0. Vérifier que l'utilisateur a configuré sa clé API
    const user = await deps.userRepository.findByDiscordId(interaction.user.id);
    const userKey = user?.openaiKey;
    if (!userKey) {
      await interaction.reply({
        content: '🔑 Tu dois d\'abord configurer ta clé API avec `/setkey clé:sk-xxx...` avant de lancer une analyse.',
        ephemeral: true,
      });
      return;
    }

    // 1. Vérifier que la niche existe
    const niche = await deps.nicheLoader.getByCommand('analyze');
    if (!niche) {
      await interaction.reply({
        content: '❌ La niche "analyze" n\'est pas disponible.',
        ephemeral: true,
      });
      return;
    }

    // 2. Defer la réponse (le traitement peut prendre > 3s)
    await interaction.deferReply({ ephemeral: false });

    // 3. Créer un thread privé pour la progression
    if (!interaction.channel || !('threads' in interaction.channel)) {
      await interaction.editReply('❌ Cette commande doit être utilisée dans un salon textuel.');
      return;
    }

    const thread = await interaction.channel.threads.create({
      name: `🔍 ${sujet.slice(0, 90)}`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
      reason: `Analyse demandée par ${interaction.user.tag}`,
    });

    if (!thread) {
      await interaction.editReply('❌ Impossible de créer le thread de progression.');
      return;
    }

    // Message initial dans le thread
    const startEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🔍 Analyse en cours')
      .setDescription(`**Sujet :** ${sujet}\n**Niche :** ${niche.emoji} ${niche.name}`)
      .setFooter({ text: 'Le rapport sera prêt sous 1 à 3 minutes...' });

    const progressMsg = await thread.send({ embeds: [startEmbed] });

    // 4. Lancer l'agent avec callback de progression
    const startTime = Date.now();
    let messageLock = false;

    try {
      const result = await deps.agentEngine.execute(
        sujet,
        niche,
        interaction.user.id,
        {
          onProgress: async (progress) => {
            // Éviter les écritures concurrentes sur Discord (rate limits)
            if (messageLock) return;
            messageLock = true;

            try {
              const embed = buildProgressEmbed(progress);

              if (progress.step === 'searching' || progress.step === 'evaluating' || progress.step === 'iterating') {
                // Ajouter au thread sans écraser l'embed précédent
                await thread.send({ embeds: [embed] });
              } else if (progress.step === 'synthesizing') {
                // Mettre à jour l'embed de progression
                await progressMsg.edit({ embeds: [embed] });
              }
            } finally {
              messageLock = false;
            }
          },
        },
        userKey,
      );

      // 5. Sauvegarder le rapport en base
      await deps.reportRepository.save(result.report);

      // 6. Envoyer l'embed final
      const durationMs = Date.now() - startTime;
      const finalEmbed = buildFinalEmbed(
        result.report.id,
        deps.baseUrl,
        sujet,
        result.report.sources.length,
        durationMs,
      );

      await thread.send({ embeds: [finalEmbed] });

      // Répondre à l'interaction initiale avec un lien vers le thread
      await interaction.editReply({
        content: `🔍 Progression de l'analyse dans ${thread} — prête dans ~30s`,
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('❌ Erreur')
            .setDescription(`\`\`\`${errorMsg.slice(0, 200)}\`\`\``),
        ],
      });

      await interaction.editReply({
        content: `❌ L'analyse a échoué : ${errorMsg.slice(0, 100)}`,
      });
    }
  },
};
