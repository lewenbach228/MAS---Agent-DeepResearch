import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import type { NicheConfig } from '../../../domain/entities/NicheConfig.js';
import type { UserRepository, ReportRepository } from '../../../domain/ports/Repository.js';
import type { AgentEngine } from '../../../services/agent/AgentEngine.js';
import { buildProgressEmbed, buildFinalEmbed } from '../embeds.js';

/**
 * Commande /veille.
 *
 * V1.5 — Utility-based matching + recherche automatique.
 *
 * 1. Score les 6 catégories AI Tools selon le profil
 * 2. Sélectionne la meilleure catégorie
 * 3. Lance une recherche web (AgentEngine) dans cette catégorie
 * 4. Retourne un rapport sourcé avec tendances et outils récents
 */
export const veilleCommand = {
  data: new SlashCommandBuilder()
    .setName('veille')
    .setDescription('Recherche web personnalisée sur un sujet, adaptée à ton profil')
    .addStringOption((option) =>
      option
        .setName('sujet')
        .setDescription('Le sujet de ta veille (ex: comment l\'IA aide les infirmières)')
        .setRequired(true)
        .setMaxLength(500),
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    deps: {
      userRepository: UserRepository;
      agentEngine: AgentEngine;
      reportRepository: ReportRepository;
      baseUrl: string;
    },
  ): Promise<void> {
    const discordId = interaction.user.id;
    const sujet = interaction.options.getString('sujet', true);

    // ── 1. Vérifier la clé API ──
    const user = await deps.userRepository.findByDiscordId(discordId);
    if (!user?.openaiKey) {
      await interaction.reply({
        content: '🔑 Configure d\'abord ta clé API avec `/setkey clé:sk-xxx...`',
        ephemeral: true,
      });
      return;
    }

    // ── 2. Vérifier le profil (secteur minimum pour adapter la synthèse) ──
    if (!user.secteur && !user.priorites?.length) {
      await interaction.reply({
        content: '📋 Configure d\'abord ton profil avec `/profil secteur:ton-secteur` pour des recommandations personnalisées.',
        ephemeral: true,
      });
      return;
    }

    // ── 3. Defer (public pour pouvoir créer un thread) ──
    await interaction.deferReply({ ephemeral: false });

    try {
      // ── 4. Vérifier le channel pour le thread ──
      if (!interaction.channel || !('threads' in interaction.channel)) {
        await interaction.editReply('❌ Cette commande doit être utilisée dans un salon textuel.');
        return;
      }

      // ── 5. Créer un thread pour la veille ──
      const threadName = `📡 Veille : ${sujet.slice(0, 80)}`;
      const thread = await interaction.channel.threads.create({
        name: threadName.slice(0, 100),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneHour,
        reason: `Veille demandée par ${interaction.user.tag}`,
      });

      // ── 6. Envoyer un embed de démarrage ──
      const startEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📡 Veille en cours`)
        .setDescription(
          `**Sujet :** ${sujet}\n`
          + `**Profil :** ${user.secteur ?? 'Non renseigné'}\n\n`
          + `Recherche en cours — le rapport sera prêt sous 1 à 3 minutes...`,
        );

      const progressMsg = await thread.send({ embeds: [startEmbed] });

      // ── 7. Lancer la recherche avec AgentEngine ──
      // La question = le sujet de l'utilisateur (recherche pure)
      // Le promptSystem = profil pour générer des axes pertinents + adapter la synthèse
      const question = sujet;
      const veilleNiche = buildVeilleNiche(user);

      const startTime = Date.now();
      let messageLock = false;

      const result = await deps.agentEngine.execute(
        question,
        veilleNiche,
        interaction.user.id,
        {
          onProgress: async (progress) => {
            if (messageLock) return;
            messageLock = true;
            try {
              const embed = buildProgressEmbed(progress);
              if (progress.step === 'searching' || progress.step === 'evaluating' || progress.step === 'iterating') {
                await thread.send({ embeds: [embed] });
              } else if (progress.step === 'synthesizing') {
                await progressMsg.edit({ embeds: [embed] });
              }
            } finally {
              messageLock = false;
            }
          },
        },
        user.openaiKey,
      );

      // ── 10. Sauvegarder le rapport ──
      await deps.reportRepository.save(result.report);

      // ── 11. Envoyer l'embed final ──
      const durationMs = Date.now() - startTime;
      const finalEmbed = buildFinalEmbed(
        result.report.id,
        deps.baseUrl,
        question,
        result.report.sources.length,
        durationMs,
      );
      await thread.send({ embeds: [finalEmbed] });

      // ── 12. Répondre à l'interaction initiale ──
      await interaction.editReply({
        content: `📡 Veille lancée dans ${thread} — rapport prêt dans ~30s`,
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('❌ Erreur /veille :', msg);
      try {
        await interaction.editReply({
          content: `❌ Erreur lors de la veille : ${msg.slice(0, 200)}`,
        });
      } catch {
        // interaction déjà répondue
      }
    }
  },
};

// ---------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------

/**
 * Construit une configuration de niche dynamique pour la veille.
 * Le promptSystem contient le profil utilisateur pour :
 * - guider la génération des axes de recherche (pertinence)
 * - adapter les recommandations de la synthèse
 *
 * La question de recherche vient du paramètre `sujet` de l'utilisateur.
 * Utility-based : le LLM reçoit le profil + la question, et décide
 * des axes qui maximisent la valeur pour CET utilisateur.
 */
function buildVeilleNiche(
  user: { secteur?: string; stack?: string[]; priorites?: string[]; budgetMax?: number },
): NicheConfig {
  const secteur = user.secteur ?? 'Non renseigné';
  const stack = (user.stack ?? []).join(', ') || 'Non renseignée';
  const priorites = (user.priorites ?? []).join(', ') || 'Non renseignées';

  return {
    id: 'veille',
    name: 'Veille personnalisée',
    command: 'veille',
    description: 'Recherche web adaptée à ton profil et à ton sujet',
    emoji: '📡',
    format: [
      'Résumé exécutif (3 lignes max)',
      'Tendances et innovations récentes (3-5 points sourcés)',
      'Nouveaux outils et acteurs émergents',
      'Impact pour le secteur (opportunités et risques)',
      'Recommandations concrètes',
      'Sources',
    ],
    promptSystem: `Tu es un analyste spécialisé en veille technologique.
Ton objectif est de répondre à la question posée en produisant un rapport sourcé, concis et orienté action.

Contexte de l'utilisateur (utilise-le pour affiner la recherche et adapter les recommandations) :
- Secteur : ${secteur}
- Stack technique : ${stack}
- Priorités : ${priorites}

Règles :
- Les axes de recherche doivent couvrir la question sous tous ses angles utiles pour ce profil
- Les sources doivent être récentes (2025-2026)
- Cite TOUJOURS tes sources avec des chiffres entre crochets [1], [2], etc.
- Les recommandations doivent être concrètes et adaptées au contexte utilisateur`,
    maxIterations: 2,
  };
}
