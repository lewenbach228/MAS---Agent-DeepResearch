import { EmbedBuilder } from 'discord.js';
import type { AgentProgress } from '../../services/agent/AgentEngine.js';

/**
 * Couleurs pour les embeds selon le statut.
 */
const COLORS = {
  planning: 0x3498db,   // Bleu
  searching: 0xf39c12,  // Orange
  evaluating: 0x9b59b6, // Violet
  iterating: 0xe67e22,  // Orange foncé
  synthesizing: 0x1abc9c, // Turquoise
  completed: 0x2ecc71,  // Vert
  error: 0xe74c3c,      // Rouge
} as const;

/**
 * Crée un embed de progression pour une étape de l'agent.
 */
export function buildProgressEmbed(progress: AgentProgress): EmbedBuilder {
  switch (progress.step) {
    case 'planning':
      return new EmbedBuilder()
        .setColor(COLORS.planning)
        .setTitle('🔍 Planification')
        .setDescription('Analyse de la question et construction du plan de recherche...');

    case 'searching':
      return new EmbedBuilder()
        .setColor(COLORS.searching)
        .setTitle('📡 Recherche en cours')
        .setDescription(
          progress.resultsCount > 0
            ? `**${progress.axe}**\n${progress.resultsCount} source(s) trouvée(s)`
            : `**${progress.axe}**\nRecherche en cours...`,
        );

    case 'evaluating':
      return new EmbedBuilder()
        .setColor(COLORS.evaluating)
        .setTitle('🔍 Évaluation')
        .setDescription(
          `Itération ${progress.iteration}/${progress.maxIterations}\nÉvaluation de la couverture des sources...`,
        );

    case 'iterating':
      return new EmbedBuilder()
        .setColor(COLORS.iterating)
        .setTitle('🔄 Lacunes identifiées')
        .setDescription(
          `Lancement d'une nouvelle itération pour approfondir :\n${progress.gaps.map((g) => `• ${g}`).join('\n')}`,
        );

    case 'synthesizing':
      return new EmbedBuilder()
        .setColor(COLORS.synthesizing)
        .setTitle('✍️ Synthèse')
        .setDescription('Génération du rapport structuré à partir des sources collectées...');

    case 'completed':
      return new EmbedBuilder()
        .setColor(COLORS.completed)
        .setTitle('✅ Recherche terminée !')
        .setDescription(`Rapport prêt : \`${progress.reportId}\``);

    case 'error':
      return new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('❌ Erreur')
        .setDescription(`\`\`\`${progress.message.slice(0, 200)}\`\`\``);
  }
}

/**
 * Crée l'embed récapitulatif final avec le lien vers le rapport web.
 */
export function buildFinalEmbed(
  reportId: string,
  baseUrl: string,
  question: string,
  sourcesCount: number,
  durationMs: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.completed)
    .setTitle('✅ Rapport prêt !')
    .setDescription(
      [
        `**Question :** ${question}`,
        '',
        `🔗 **Rapport complet :** ${baseUrl}/r/${reportId}`,
        '',
        `📊 ${sourcesCount} sources utilisées`,
        `⏱️ ${Math.round(durationMs / 1000)} secondes`,
      ].join('\n'),
    )
    .setFooter({ text: 'DeepResearch Agent — cliques sur le lien pour voir le rapport' });
}

/**
 * Crée l'embed pour la liste des niches (/niches).
 */
export function buildNichesEmbed(niches: Array<{ name: string; emoji: string; description: string; command: string }>): EmbedBuilder {
  const description = niches
    .map((n) => `${n.emoji} **/${n.command}** — ${n.description}`)
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('📂 Niches disponibles')
    .setDescription(description || 'Aucune niche disponible pour le moment.');
}
