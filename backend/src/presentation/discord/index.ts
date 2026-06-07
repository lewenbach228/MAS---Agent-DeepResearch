import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  type SlashCommandBuilder,
} from 'discord.js';
import type { AgentEngine } from '../../services/agent/AgentEngine.js';
import type { NicheLoader } from '../../domain/ports/NicheLoader.js';
import type { UserRepository, ReportRepository } from '../../domain/ports/Repository.js';

import { analyzeCommand } from './commands/analyze.js';
import { historiqueCommand } from './commands/historique.js';
import { nichesCommand } from './commands/niches.js';
import { profilCommand } from './commands/profil.js';
import { setkeyCommand } from './commands/setkey.js';
import { veilleCommand } from './commands/veille.js';

/**
 * Dépendances partagées entre toutes les commandes Discord.
 */
export interface DiscordDependencies {
  agentEngine: AgentEngine;
  nicheLoader: NicheLoader;
  userRepository: UserRepository;
  reportRepository: ReportRepository;
  baseUrl: string;
}

/**
 * Définition d'une commande Discord avec son handler.
 */
interface CommandDefinition {
  data: SlashCommandBuilder;
  execute: (interaction: any, deps: DiscordDependencies) => Promise<void>;
}

/**
 * Crée et démarre le bot Discord.
 *
 * 1. Enregistre les commandes slash via l'API REST Discord
 * 2. Connecte le client à la gateway Discord
 * 3. Route chaque interaction vers le bon handler
 *
 * @param token - Token du bot Discord (process.env.DISCORD_TOKEN)
 * @param clientId - ID du bot Discord (process.env.DISCORD_CLIENT_ID)
 * @param guildId - ID du serveur Discord pour les commandes instantanées (optionnel)
 * @param deps - Dépendances injectées (agentEngine, nicheLoader, etc.)
 */
export async function startDiscordBot(
  token: string,
  clientId: string,
  deps: DiscordDependencies,
  guildId?: string,
): Promise<Client> {
  // --- Lister les commandes ---
  const commands: CommandDefinition[] = [
    analyzeCommand as unknown as CommandDefinition,
    historiqueCommand as unknown as CommandDefinition,
    nichesCommand as unknown as CommandDefinition,
    profilCommand as unknown as CommandDefinition,
    setkeyCommand as unknown as CommandDefinition,
    veilleCommand as unknown as CommandDefinition,
  ];

  const commandsData = commands.map((cmd) => cmd.data.toJSON());

  // --- Enregistrer les commandes via REST ---
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (guildId) {
      // Commandes instantanées (pour le développement)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandsData,
      });
      console.log(`✅ Commandes enregistrées sur le serveur ${guildId}`);
    } else {
      // Commandes globales (mettent ~1h à se propager)
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandsData,
      });
      console.log('✅ Commandes globales enregistrées');
    }
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement des commandes :', error);
    throw error;
  }

  // --- Créer le client ---
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
  });

  // --- Gérer les interactions ---
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.find((cmd) => cmd.data.name === interaction.commandName);
    if (!command) {
      await interaction.reply({
        content: `❌ Commande "${interaction.commandName}" introuvable.`,
        ephemeral: true,
      });
      return;
    }

    try {
      await command.execute(interaction, deps);
    } catch (error) {
      console.error(`❌ Erreur commande ${interaction.commandName}:`, error);

      const errorMsg = error instanceof Error ? error.message : String(error);

      // Tenter de répondre si pas déjà fait
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: `❌ Erreur : ${errorMsg.slice(0, 200)}`,
          });
        } else {
          await interaction.reply({
            content: `❌ Erreur : ${errorMsg.slice(0, 200)}`,
            ephemeral: true,
          });
        }
      } catch {
        // La réponse a peut-être déjà été envoyée — on ignore
      }
    }
  });

  // --- Connecter le client ---
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`🤖 Bot Discord connecté : ${readyClient.user.tag}`);
  });

  await client.login(token);

  return client;
}
