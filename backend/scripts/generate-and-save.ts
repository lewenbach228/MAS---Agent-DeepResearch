/**
 * Script one-shot : génère un rapport via le pipeline agent complet,
 * le sauvegarde en base de données, et affiche l'URL d'accès.
 *
 * Usage : OPENAI_API_KEY=sk-xxx npx tsx scripts/generate-and-save.ts
 */

import { NicheLoaderService, OpenAIService, AgentEngine } from '../src/services/index.js';
import { AppDatabase } from '../src/infrastructure/database/Database.js';
import { ReportRepositorySQLite } from '../src/infrastructure/repositories/ReportRepositorySQLite.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY manquante');
    process.exit(1);
  }

  // 1. Charger la niche
  const nichesDir = resolve(__dirname, '..', 'niches');
  const loader = new NicheLoaderService(nichesDir);
  const niches = await loader.loadAll();
  const niche = niches.get('analyze');

  if (!niche) {
    console.error('❌ Niche "analyze" introuvable');
    process.exit(1);
  }

  console.log(`📦 Niche : ${niche.name} ${niche.emoji}`);

  // 2. Créer LLM et AgentEngine
  const llm = OpenAIService.withApiKey(apiKey);
  const engine = new AgentEngine(llm);

  const question = 'Marché des agents IA en France en 2026, taille, acteurs et tendances';
  console.log(`🔍 Question : "${question}"`);
  console.log('');

  // 3. Exécuter le pipeline
  const result = await engine.execute(question, niche, 'test-user', {
    onProgress: (progress) => {
      switch (progress.step) {
        case 'planning':
          console.log('🔍 Planification...');
          break;
        case 'searching':
          console.log(`   📡 ${progress.axe}... (${progress.resultsCount} sources)`);
          break;
        case 'evaluating':
          console.log(`   🔄 Évaluation (itération ${progress.iteration}/${progress.maxIterations})...`);
          break;
        case 'iterating':
          console.log(`   🔄 Lacunes : ${progress.gaps.join(', ')}`);
          break;
        case 'synthesizing':
          console.log('   ✍️ Synthèse...');
          break;
        case 'completed':
          console.log(`   ✅ Terminé !`);
          break;
      }
    },
  });

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`Statut : ${result.report.status}`);
  console.log(`Sources : ${result.report.sources.length}`);
  console.log(`Itérations : ${result.metadata.iterations}`);
  console.log(`Requêtes totales : ${result.metadata.totalQueries}`);
  console.log('');

  // 4. Sauvegarder en base
  const dbPath = resolve(__dirname, '..', 'data', 'deepresearch.db');
  const db = await AppDatabase.create(dbPath);
  const repo = new ReportRepositorySQLite(db);
  await repo.save(result.report);
  db.close();

  console.log('✅ Rapport sauvegardé en base de données');
  console.log(`🌐 Accès : http://localhost:3000/r/${result.report.id}`);
  console.log(`📡 JSON   : http://localhost:3000/api/r/${result.report.id}`);
}

main().catch((err) => {
  console.error('❌ Erreur :', err);
  process.exit(1);
});
