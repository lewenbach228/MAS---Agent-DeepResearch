/**
 * Script de test pour valider le moteur agent (AgentEngine + OpenAIService).
 *
 * Usage :
 *   OPENAI_API_KEY=sk-xxx npx tsx scripts/test-agent.ts
 *
 * Le script exécute le pipeline complet sur une question exemple
 * et affiche le rapport généré dans la console.
 */

import { NicheLoaderService, OpenAIService, AgentEngine } from '../src/services/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ Variable OPENAI_API_KEY manquante.');
    console.error('   Usage : OPENAI_API_KEY=sk-xxx npx tsx scripts/test-agent.ts');
    process.exit(1);
  }
  console.log('🔑 Clé API trouvée');

  // 1. Charger la niche
  const nichesDir = resolve(__dirname, '..', 'niches');
  const loader = new NicheLoaderService(nichesDir);
  const niches = await loader.loadAll();
  const niche = niches.get('analyze');
  if (!niche) {
    console.error('❌ Niche "analyze" introuvable');
    process.exit(1);
  }
  console.log(`📦 Niche chargée : ${niche.name} ${niche.emoji}`);
  console.log(`   Format : ${niche.format.length} sections`);
  console.log(`   Iterations max : ${niche.maxIterations}`);
  console.log('');

  // 2. Créer le service OpenAI avec la clé passée en variable d'env
  const llm = OpenAIService.withApiKey(apiKey);
  const engine = new AgentEngine(llm);

  // 3. Lancer l'agent
  const question = 'Marché des agents IA en France en 2026, taille, acteurs et tendances';
  console.log(`🔍 Question : "${question}"`);
  console.log('');

  const result = await engine.execute(question, niche, 'test-user', {
    onProgress: (progress) => {
      switch (progress.step) {
        case 'planning':
          console.log('🔍 Planification...');
          break;
        case 'searching':
          console.log(`   📡 Recherche sur "${progress.axe}"... (${progress.resultsCount} sources trouvées)`);
          break;
        case 'evaluating':
          console.log(`   🔄 Évaluation (itération ${progress.iteration}/${progress.maxIterations})...`);
          break;
        case 'iterating':
          console.log(`   🔄 Lacunes identifiées : ${progress.gaps.join(', ')}`);
          break;
        case 'synthesizing':
          console.log('   ✍️ Synthèse du rapport...');
          break;
        case 'completed':
          console.log(`   ✅ Terminé ! Rapport : ${progress.reportId}`);
          break;
        case 'error':
          console.log(`   ❌ Erreur : ${progress.message}`);
          break;
      }
    },
  });

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('              RAPPORT GÉNÉRÉ                   ');
  console.log('═══════════════════════════════════════════════');
  console.log(`ID : ${result.report.id}`);
  console.log(`Statut : ${result.report.status}`);
  console.log(`Question : ${result.report.question}`);
  console.log(`Sources : ${result.report.sources.length}`);
  console.log(`Itérations : ${result.metadata.iterations}`);
  console.log(`Requêtes totales : ${result.metadata.totalQueries}`);
  console.log('');

  console.log('Plan de recherche :');
  console.log(`  Axes : ${result.metadata.planning.axes.join(', ')}`);
  console.log(`  Mots-clés : ${result.metadata.planning.motsCles.join(', ')}`);
  console.log('');

  console.log('Sections du rapport :');
  for (const section of result.report.sections) {
    console.log(`\n  ── ${section.title} ──`);
    console.log(`  ${section.content.slice(0, 500)}${section.content.length > 500 ? '...' : ''}`);
  }

  console.log('');
  console.log('Sources :');
  for (const source of result.report.sources.slice(0, 10)) {
    console.log(`  [${source.source}] ${source.title}`);
    console.log(`       ${source.url}`);
  }
  if (result.report.sources.length > 10) {
    console.log(`  ... et ${result.report.sources.length - 10} autres sources`);
  }

  console.log('');
  if (result.report.status === 'error') {
    console.log(`❌ ERREUR : ${result.report.error}`);
    process.exit(1);
  } else {
    console.log('✅ Test réussi !');
  }
}

main().catch(console.error);
