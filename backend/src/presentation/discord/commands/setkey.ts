import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { UserRepository } from '../../../domain/ports/Repository.js';

/**
 * Commande /setkey.
 *
 * V1.5 – BYOK (Bring Your Own Key).
 * Chaque utilisateur entre sa propre clé OpenAI pour utiliser /analyze.
 *
 * Validation :
 * - Format : doit commencer par "sk-"
 * - Appel API : GET https://api.openai.com/v1/models (0 token consommé)
 *
 * Stockage :
 * - Sauvegardée dans la colonne openai_key de la table users
 * - Utilisée uniquement pour les requêtes de cet utilisateur
 */
export const setkeyCommand = {
  data: new SlashCommandBuilder()
    .setName('setkey')
    .setDescription('Configure ta clé API OpenAI pour utiliser le bot')
    .addStringOption((option) =>
      option
        .setName('clé')
        .setDescription('Ta clé OpenAI (commence par sk-...)')
        .setRequired(true),
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    deps: { userRepository: UserRepository },
  ): Promise<void> {
    const rawKey = interaction.options.getString('clé', true).trim();
    const discordId = interaction.user.id;

    // ── 1. Validation de format ──
    if (!rawKey.startsWith('sk-')) {
      await interaction.reply({
        content: '❌ Clé invalide. Une clé OpenAI commence par `sk-`.',
        ephemeral: true,
      });
      return;
    }

    if (rawKey.length < 20) {
      await interaction.reply({
        content: '❌ Clé trop courte. Vérifie que tu as copié la clé entière.',
        ephemeral: true,
      });
      return;
    }

    // ── 2. Validation live : appeler l'API OpenAI ──
    await interaction.deferReply({ ephemeral: true });

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${rawKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const status = response.status;

        if (status === 401) {
          await interaction.editReply({
            content: '❌ Clé refusée par OpenAI (401). Vérifie que la clé est valide et active sur https://platform.openai.com/api-keys',
          });
        } else if (status === 429) {
          await interaction.editReply({
            content: '⚠️ Trop de requêtes. Réessaie dans quelques secondes.',
          });
        } else {
          await interaction.editReply({
            content: `❌ Erreur API OpenAI (${status}) : ${errorBody.slice(0, 200)}`,
          });
        }
        return;
      }

      // ── 3. Stocker la clé ──
      // Créer l'utilisateur s'il n'existe pas encore
      const existing = await deps.userRepository.findByDiscordId(discordId);
      if (!existing) {
        await deps.userRepository.save({
          discordId,
          openaiKey: rawKey,
          createdAt: new Date().toISOString(),
        });
      } else {
        await deps.userRepository.updateKey(discordId, rawKey);
      }

      // ── 4. Réponse ──
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ Clé API enregistrée')
        .setDescription(
          [
            'Ta clé OpenAI a été validée et sauvegardée.',
            '',
            '📋 **Prochaine étape** : configure ton profil avec `/profil`',
            '   pour des recommandations personnalisées.',
            '',
            '🔍 Ensuite lance `/analyze sujet:ton-sujet` pour une analyse.',
          ].join('\n'),
        )
        .setFooter({ text: 'Ta clé est stockée de manière sécurisée et utilisée uniquement pour tes requêtes.' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // Timeout vs erreur réseau
      if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('abort')) {
        await interaction.editReply({
          content: '⏱️ Le délai de validation a expiré. Vérifie ta connexion et réessaie.',
        });
      } else {
        await interaction.editReply({
          content: `❌ Impossible de valider la clé : ${msg.slice(0, 200)}`,
        });
      }
    }
  },
};
