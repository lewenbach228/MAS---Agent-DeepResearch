import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { AppDatabase } from '../src/infrastructure/database/Database.js';
import { ReportRepositorySQLite } from '../src/infrastructure/repositories/ReportRepositorySQLite.js';

/**
 * Tests du ReportRepositorySQLite.
 *
 * Vérifie la sauvegarde, la récupération et la mise à jour des rapports,
 * y compris le mapping JSON des sections et sources.
 */
describe('ReportRepositorySQLite', () => {
  let db: AppDatabase;
  let repo: ReportRepositorySQLite;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-reports-${randomUUID()}.db`);
    db = await AppDatabase.create(dbPath);
    repo = new ReportRepositorySQLite(db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  const sampleReport = {
    id: 'r_test123',
    userId: 'discord_user_1',
    question: 'Quel est le marché des agents IA en France ?',
    nicheId: 'market-intelligence',
    sections: [
      { title: 'Résumé', content: 'Le marché est en croissance.' },
      { title: 'Sources', content: 'Source 1, Source 2' },
    ],
    sources: [
      {
        title: 'Article test',
        url: 'https://example.com',
        snippet: 'Extrait...',
        source: 'example.com',
      },
    ],
    status: 'completed' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:05:00.000Z',
  };

  it('retourne null pour un rapport inexistant', async () => {
    const report = await repo.findById('r_inexistant');
    expect(report).toBeNull();
  });

  it('sauvegarde et récupère un rapport', async () => {
    await repo.save(sampleReport);

    const report = await repo.findById('r_test123');
    expect(report).not.toBeNull();
    expect(report!.id).toBe('r_test123');
    expect(report!.question).toBe(sampleReport.question);
    expect(report!.status).toBe('completed');
  });

  it('préserve les sections JSON', async () => {
    await repo.save(sampleReport);

    const report = await repo.findById('r_test123');
    expect(report!.sections).toHaveLength(2);
    expect(report!.sections[0].title).toBe('Résumé');
    expect(report!.sections[1].content).toBe('Source 1, Source 2');
  });

  it('préserve les sources JSON', async () => {
    await repo.save(sampleReport);

    const report = await repo.findById('r_test123');
    expect(report!.sources).toHaveLength(1);
    expect(report!.sources[0].url).toBe('https://example.com');
  });

  it('retourne les rapports du plus récent au plus ancien', async () => {
    await repo.save({ ...sampleReport, id: 'r_001', createdAt: '2026-01-01T00:00:00.000Z' });
    await repo.save({ ...sampleReport, id: 'r_002', createdAt: '2026-01-02T00:00:00.000Z' });
    await repo.save({ ...sampleReport, id: 'r_003', createdAt: '2026-01-03T00:00:00.000Z' });

    const reports = await repo.findByUserId('discord_user_1', 10);
    expect(reports).toHaveLength(3);
    // Du plus récent au plus ancien
    expect(reports[0].id).toBe('r_003');
    expect(reports[2].id).toBe('r_001');
  });

  it('limite le nombre de rapports retournés', async () => {
    await repo.save({ ...sampleReport, id: 'r_001' });
    await repo.save({ ...sampleReport, id: 'r_002' });
    await repo.save({ ...sampleReport, id: 'r_003' });

    const reports = await repo.findByUserId('discord_user_1', 2);
    expect(reports).toHaveLength(2);
  });

  it('met à jour le statut et les données', async () => {
    await repo.save(sampleReport);

    await repo.update({
      ...sampleReport,
      status: 'error',
      error: 'Quota dépassé',
      sections: [],
      sources: [],
    });

    const report = await repo.findById('r_test123');
    expect(report!.status).toBe('error');
    expect(report!.error).toBe('Quota dépassé');
  });

  it('préserve les métadonnées du moteur agent', async () => {
    const reportWithMetadata = {
      ...sampleReport,
      metadata: {
        iterations: 3,
        totalQueries: 12,
        planning: {
          sousQuestions: ['Question A', 'Question B'],
          motsCles: ['IA', 'agents'],
          axes: ['Marché', 'Technologie'],
        },
      },
    };

    await repo.save(reportWithMetadata);

    const report = await repo.findById('r_test123');
    expect(report!.metadata).toBeDefined();
    expect(report!.metadata!.iterations).toBe(3);
    expect(report!.metadata!.totalQueries).toBe(12);
    expect(report!.metadata!.planning.sousQuestions).toHaveLength(2);
    expect(report!.metadata!.planning.axes).toContain('Technologie');
  });

  it('gère un rapport avec statut error et sans completedAt', async () => {
    const failedReport = {
      ...sampleReport,
      id: 'r_fail',
      status: 'error' as const,
      error: 'Timeout',
      sections: [],
      sources: [],
      completedAt: undefined,
    };

    await repo.save(failedReport);

    const report = await repo.findById('r_fail');
    expect(report!.status).toBe('error');
    expect(report!.error).toBe('Timeout');
    expect(report!.completedAt).toBeUndefined();
  });
});
