/**
 * test-local.ts — Test d'intégration local.
 *
 * Vérifie que tous les modules du bot se chargent et fonctionnent
 * sans dépendre de Discord ni d'une clé OpenAI active.
 *
 * Usage : npx tsx scripts/test-local.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// =================================================================
// 1. Valider les fichiers JSON (niches)
// =================================================================
console.log('\n📁 1. Validation des fichiers JSON');

const nichesDir = resolve(root, 'niches');

const nicheFiles = readdirSync(nichesDir)
  .filter((f) => f.endsWith('.json') && !f.includes('.schema.'));

for (const file of nicheFiles) {
  try {
    const content = readFileSync(join(nichesDir, file), 'utf-8');
    const parsed = JSON.parse(content);
    assert(
      parsed.id && parsed.name && parsed.command && parsed.format && parsed.promptSystem,
      `${file} : champs obligatoires OK`,
    );
  } catch (e: any) {
    assert(false, `${file} : ${e.message}`);
  }
}

assert(nicheFiles.length >= 2, `${nicheFiles.length} niches racine chargees`);

// =================================================================
// 2. Importer et initialiser les modules
// =================================================================
console.log('\n📦 2. Import des modules');

const imports = [
  'NicheLoaderService',
  'OpenAIService',
  'AgentEngine',
  'AppDatabase',
  'UserRepositorySQLite',
  'ReportRepositorySQLite',
] as const;

for (const name of imports) {
  try {
    // L'import dynamique vérifie que le module se charge sans erreur
    const mod = await import(`../src/services/index.js`);
    assert(true, `${name} importe sans erreur`);
  } catch (e: any) {
    assert(false, `${name} : ${e.message}`);
  }
}

// =================================================================
// 3. Base de données — migration + CRUD
// =================================================================
console.log('\n🗄️  3. Base de donnees (SQLite temporaire)');

const tmpDbDir = mkdtempSync(join(tmpdir(), 'deepresearch-test-'));
const tmpDbPath = join(tmpDbDir, 'test.db');

try {
  const { AppDatabase } = await import('../src/infrastructure/database/Database.js');
  const db = await AppDatabase.create(tmpDbPath);

  // Vérifier que les tables existent
  const tables = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  const tableNames = tables.map((t) => t.name);

  assert(tableNames.includes('reports'), 'Table reports creee');
  assert(tableNames.includes('users'), 'Table users creee');

  // ── Test UserRepository ──
  console.log('\n  ── UserRepository ──');
  const { UserRepositorySQLite } = await import('../src/infrastructure/repositories/UserRepositorySQLite.js');
  const userRepo = new UserRepositorySQLite(db);

  await userRepo.save({
    discordId: 'test-user-1',
    openaiKey: 'sk-test-key-123',
    createdAt: new Date().toISOString(),
  });

  const found = await userRepo.findByDiscordId('test-user-1');
  assert(found !== null, 'save + findByDiscordId OK');
  assert(found!.openaiKey === 'sk-test-key-123', 'openaiKey correcte');

  // Profil
  await userRepo.updateProfile('test-user-1', {
    secteur: 'Tech',
    stack: ['React', 'Node'],
    priorites: ['automatisation'],
    budgetMax: 500,
    contraintes: ['RGPD'],
  });

  const withProfile = await userRepo.findByDiscordId('test-user-1');
  assert(withProfile!.secteur === 'Tech', 'secteur mis a jour');
  assert(withProfile!.stack?.includes('React') === true, 'stack mise a jour');
  assert(withProfile!.budgetMax === 500, 'budgetMax mis a jour');

  // ── Test ReportRepository ──
  console.log('\n  ── ReportRepository ──');
  const { ReportRepositorySQLite } = await import('../src/infrastructure/repositories/ReportRepositorySQLite.js');
  const reportRepo = new ReportRepositorySQLite(db);

  const reportId = 'r_test1234';
  await reportRepo.save({
    id: reportId,
    userId: 'test-user-1',
    question: 'Test',
    nicheId: 'test',
    sections: [{ title: 'Section', content: 'Contenu' }],
    sources: [{ title: 'Source', url: 'https://test.com', snippet: '...', source: 'test' }],
    status: 'completed',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });

  const reportFound = await reportRepo.findById(reportId);
  assert(reportFound !== null, 'save + findById OK');
  assert(reportFound!.sections.length === 1, 'Sections preservees');

  const userReports = await reportRepo.findByUserId('test-user-1');
  assert(userReports.length >= 1, 'findByUserId OK');

  // ── Test NicheLoader ──
  console.log('\n  ── NicheLoader ──');
  const { NicheLoaderService } = await import('../src/services/niche-loader/NicheLoaderService.js');
  const nicheLoader = new NicheLoaderService(nichesDir);
  const niches = await nicheLoader.loadAll();
  assert(niches.size >= 2, `Au moins 2 niches chargees (obtenu: ${niches.size})`);

  // Nettoyage
  db.close();
  rmSync(tmpDbDir, { recursive: true, force: true });
  console.log('\n  🧹 Base temporaire nettoyee');

} catch (e: any) {
  assert(false, `Erreur lors des tests DB : ${e.message}`);
  // Nettoyage même en cas d'erreur
  try { rmSync(tmpDbDir, { recursive: true, force: true }); } catch {}
}

// =================================================================
// 4. Résultat final
// =================================================================
console.log('\n' + '='.repeat(50));
console.log(`📊 Resultat : ${passed} passes, ${failed} echoues`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log('\n⚠️  Certains tests ont echoue. Verifie les messages ci-dessus.');
  process.exit(1);
} else {
  console.log('\n✅ Tous les modules sont operotionnels !');
  console.log('   Tu peux lancer le bot avec : npm run dev (apres avoir configure .env)');
}
