/**
 * DeepResearch Agent — Backend
 *
 * Point d'entrée du serveur Express + Bot Discord.
 * Orchestre le chargement des niches, la base de données,
 * le moteur agent, le bot Discord et l'API REST.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import express from 'express';

import { NicheLoaderService, OpenAIService, AgentEngine } from './services/index.js';
import { AppDatabase, ReportRepositorySQLite, UserRepositorySQLite } from './infrastructure/index.js';
import { startDiscordBot } from './presentation/discord/index.js';
import { createApiRouter } from './presentation/routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🚀 DeepResearch Agent — Backend');
  console.log('');

  // ---------------------------------------------------------------
  // 1. Charger les variables d'environnement
  // ---------------------------------------------------------------
  const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
  const DATABASE_PATH = process.env.DATABASE_PATH ?? resolve(__dirname, '..', 'data', 'deepresearch.db');
  const GUILD_ID = process.env.GUILD_ID; // Optionnel

  if (!DISCORD_TOKEN) {
    console.error('❌ Variable DISCORD_TOKEN manquante');
    process.exit(1);
  }
  if (!DISCORD_CLIENT_ID) {
    console.error('❌ Variable DISCORD_CLIENT_ID manquante');
    process.exit(1);
  }

  // ---------------------------------------------------------------
  // 2. Charger les niches
  // ---------------------------------------------------------------
  const nichesDir = resolve(__dirname, '..', 'niches');
  const nicheLoader = new NicheLoaderService(nichesDir);
  const niches = await nicheLoader.loadAll();

  console.log(`📦 ${niches.size} niche(s) chargée(s) :`);
  for (const [, niche] of niches) {
    console.log(`   /${niche.command} → ${niche.name} ${niche.emoji}`);
  }
  console.log('');

  // ---------------------------------------------------------------
  // 3. Initialiser la base de données
  // ---------------------------------------------------------------
  console.log(`🗄️  Base de données : ${DATABASE_PATH}`);
  const db = await AppDatabase.create(DATABASE_PATH);
  const reportRepository = new ReportRepositorySQLite(db);
  const userRepository = new UserRepositorySQLite(db);
  console.log('');

  // ---------------------------------------------------------------
  // 4. Initialiser le moteur agent
  // ---------------------------------------------------------------
  const openai = new OpenAIService();
  const agentEngine = new AgentEngine(openai);
  console.log('🤖 Moteur agent initialisé');
  console.log('');

  // ---------------------------------------------------------------
  // 5. Serveur Express
  // ---------------------------------------------------------------
  const app = express();

  // Middleware CORS pour le développement
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // Routes API
  app.use('/api', createApiRouter(reportRepository));

  // Servir les fichiers statiques du frontend buildé
  const frontendDist = resolve(__dirname, '..', '..', 'dist');
  app.use(express.static(frontendDist));

  // Toutes les autres routes → servent l'application React (pour le routing client)
  // Les fichiers statiques sont servis en priorité par express.static
  app.use((_req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });

  // Démarrage du serveur HTTP
  const server = app.listen(PORT, () => {
    console.log(`🌐 Serveur HTTP : http://localhost:${PORT}`);
  });
  console.log('');

  // ---------------------------------------------------------------
  // 6. Démarrer le bot Discord
  // ---------------------------------------------------------------
  const discordClient = await startDiscordBot(
    DISCORD_TOKEN,
    DISCORD_CLIENT_ID,
    {
      agentEngine,
      nicheLoader,
      userRepository,
      reportRepository,
      baseUrl: BASE_URL,
    },
    GUILD_ID,
  );

  console.log('');
  console.log('✅ DeepResearch Agent prêt !');
  console.log(`   🤖 Bot Discord : ${discordClient.user?.tag ?? 'connecté'}`);
  console.log(`   🌐 Serveur    : http://localhost:${PORT}`);
  console.log(`   📂 Niches     : ${niches.size} disponible(s)`);

  // Gestion de l'arrêt propre
  const shutdown = () => {
    console.log('\n🛑 Arrêt en cours...');
    server.close();
    db.close();
    discordClient.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('❌ Erreur fatale :', error);
  process.exit(1);
});
