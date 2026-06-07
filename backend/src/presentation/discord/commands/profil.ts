import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { UserRepository } from '../../../domain/ports/Repository.js';

/**
 * Commande /profil.
 *
 * V1.5 – Profil utilisateur pour les recommandations personnalisées.
 *
 * Utilisation :
 *   /profil                          → affiche le profil actuel
 *   /profil secteur:tech             → met à jour un champ
 *   /profil secteur:tech stack:React,Node
 *
 * Les tableaux (stack, priorites, contraintes) sont passés en CSV
 * et convertis en JSON pour le stockage.
 */
export const profilCommand = {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('Consulte ou modifie ton profil pour les recommandations personnalisées')
    .addStringOption((option) =>
      option
        .setName('secteur')
        .setDescription('Ton secteur d\'activité (ex: Tech, Santé, Finance)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('stack')
        .setDescription('Ta stack technique (séparée par des virgules, ex: React,Node,Python)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('priorites')
        .setDescription('Tes priorités (séparées par des virgules, ex: automatisation,ROI)')
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName('budget_max')
        .setDescription('Ton budget mensuel max pour un outil (en €, ex: 500)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('contraintes')
        .setDescription('Contraintes (séparées par des virgules, ex: RGPD,self-hosted)')
        .setRequired(false),
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    deps: { userRepository: UserRepository },
  ): Promise<void> {
    const discordId = interaction.user.id;

    // Récupérer les options fournies
    const secteur = interaction.options.getString('secteur');
    const stackRaw = interaction.options.getString('stack');
    const prioritesRaw = interaction.options.getString('priorites');
    const budgetMax = interaction.options.getNumber('budget_max');
    const contraintesRaw = interaction.options.getString('contraintes');

    const hasOptions = secteur !== null || stackRaw !== null || prioritesRaw !== null ||
      budgetMax !== null || contraintesRaw !== null;

    if (hasOptions) {
      // ── Mode édition ──
      const existing = await deps.userRepository.findByDiscordId(discordId);
      if (!existing) {
        // Créer un utilisateur minimal avant d'enregistrer le profil
        await deps.userRepository.save({
          discordId,
          openaiKey: '',
          createdAt: new Date().toISOString(),
        });
      }

      await deps.userRepository.updateProfile(discordId, {
        secteur: secteur ?? undefined,
        stack: stackRaw ? parseCsv(stackRaw) : undefined,
        priorites: prioritesRaw ? parseCsv(prioritesRaw) : undefined,
        budgetMax: budgetMax ?? undefined,
        contraintes: contraintesRaw ? parseCsv(contraintesRaw) : undefined,
      });

      // Recharger le profil complet pour l'afficher
      const updated = await deps.userRepository.findByDiscordId(discordId);
      await interaction.reply({
        embeds: [buildProfileEmbed(discordId, updated!, '✅ Profil mis à jour')],
        ephemeral: true,
      });
    } else {
      // ── Mode consultation ──
      const user = await deps.userRepository.findByDiscordId(discordId);
      if (!user) {
        await interaction.reply({
          content: '📋 Tu n\'as pas encore de profil. Utilise `/profil secteur:ton-secteur stack:React,Node` pour en créer un.',
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        embeds: [buildProfileEmbed(discordId, user)],
        ephemeral: true,
      });
    }
  },
};

/** Convertit une chaîne CSV en tableau nettoyé */
function parseCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Construit l'embed de profil */
function buildProfileEmbed(
  discordId: string,
  user: {
    secteur?: string;
    stack?: string[];
    priorites?: string[];
    budgetMax?: number;
    contraintes?: string[];
  },
  titlePrefix?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2) // Discord blurple
    .setTitle(`${titlePrefix ?? '📋'} Ton profil de recommandation`)
    .setDescription(
      'Ces informations permettent de personnaliser les recommandations d\'outils IA pour ton entreprise.\n'
      + 'Utilise `/profil champ:valeur` pour modifier un champ.',
    )
    .addFields(
      {
        name: '🏢 Secteur',
        value: user.secteur || '*Non renseigné*',
        inline: true,
      },
      {
        name: '💻 Stack technique',
        value: user.stack?.length ? user.stack.join(', ') : '*Non renseignée*',
        inline: true,
      },
      {
        name: '🎯 Priorités',
        value: user.priorites?.length ? user.priorites.join(', ') : '*Non renseignées*',
        inline: false,
      },
      {
        name: '💰 Budget max/mois',
        value: user.budgetMax != null ? `${user.budgetMax} €` : '*Non renseigné*',
        inline: true,
      },
      {
        name: '⚠️ Contraintes',
        value: user.contraintes?.length ? user.contraintes.join(', ') : '*Aucune*',
        inline: true,
      },
    )
    .setFooter({
      text: `IDs utilisateur : ${discordId}`,
    })
    .setTimestamp();

  return embed;
}
