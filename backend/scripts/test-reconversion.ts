/**
 * Test de la niche Reconversion Professionnelle.
 * Génère un rapport et le sauvegarde en base.
 *
 * Usage : OPENAI_API_KEY=sk-xxx npx tsx scripts/test-reconversion.ts
 */

import { NicheLoaderService, OpenAIService, AgentEngine } from '../src/services/index.js';
import { AppDatabase } from '../src/infrastructure/database/Database.js';
import { ReportRepositorySQLite } from '../src/infrastructure/repositories/ReportRepositorySQLite.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error('❌ OPENAI_API_KEY manquante'); process.exit(1); }

  // Charger la niche reconversion
  const nichesDir = resolve(__dirname, '..', 'niches');
  const loader = new NicheLoaderService(nichesDir);
  const niches = await loader.loadAll();
  const niche = niches.get('reconvert');
  if (!niche) { console.error('❌ Niche "reconvert" introuvable'); process.exit(1); }

  console.log(`📦 Niche : ${niche.name} ${niche.emoji}`);
  console.log(`   ${niche.format.length} sections, max ${niche.maxIterations} itérations\n`);

  // Lancer le pipeline
  const llm = OpenAIService.withApiKey(apiKey);
  const engine = new AgentEngine(llm);

  const question = 'Devenir développeur full-stack après 35 ans en France en 2026';
  console.log(`🔍 "${question}"`);
  console.log('');

  const result = await engine.execute(question, niche, 'test-user', {
    onProgress: (p) => {
      if (p.step === 'planning') console.log('🔍 Planification...');
      if (p.step === 'searching') console.log(`   📡 ${p.axe?.substring(0, 60)}... (${p.resultsCount})`);
      if (p.step === 'evaluating') console.log(`   🔄 Itération ${p.iteration}/${p.maxIterations}`);
      if (p.step === 'synthesizing') console.log('   ✍️ Synthèse...');
      if (p.step === 'completed') console.log(`   ✅ Terminé`);
    },
  });

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`${result.report.status.toUpperCase()} — ${result.report.sources.length} sources`);
  console.log(`Itérations : ${result.metadata.iterations} | Requêtes : ${result.metadata.totalQueries}`);
  console.log('');

  // Sauvegarder
  const dbPath = resolve(__dirname, '..', 'data', 'deepresearch.db');
  const db = await AppDatabase.create(dbPath);
  const repo = new ReportRepositorySQLite(db);
  await repo.save(result.report);
  db.close();

  console.log('✅ Sauvegardé en base');
  console.log(`🌐 http://localhost:3000/r/${result.report.id}`);
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
