import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { NicheLoaderService } from '../src/services/niche-loader/NicheLoaderService.js';

/**
 * Test du NicheLoaderService.
 *
 * Ce test protège :
 * - Le chargement correct des fichiers JSON
 * - La validation des champs obligatoires
 * - La gestion des fichiers invalides
 * - La gestion des doublons de commande
 * - Le cas du dossier vide
 */

describe('NicheLoaderService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Créer un dossier temporaire pour chaque test
    tmpDir = join(tmpdir(), `niche-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    // Nettoyer le dossier temporaire
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('charge une niche valide depuis un fichier JSON', async () => {
    await writeFile(
      join(tmpDir, 'test-niche.json'),
      JSON.stringify({
        id: 'test-niche',
        name: 'Test Niche',
        command: 'test',
        description: 'Une niche de test',
        emoji: '🧪',
        format: ['Résumé', 'Détails'],
        promptSystem: 'Sois concis.',
        maxIterations: 2,
      }),
    );

    const loader = new NicheLoaderService(tmpDir);
    const niches = await loader.loadAll();

    expect(niches.size).toBe(1);
    expect(niches.has('test')).toBe(true);

    const niche = niches.get('test')!;
    expect(niche.id).toBe('test-niche');
    expect(niche.name).toBe('Test Niche');
    expect(niche.command).toBe('test');
    expect(niche.format).toEqual(['Résumé', 'Détails']);
    expect(niche.maxIterations).toBe(2);
  });

  it('ignore les fichiers non-JSON', async () => {
    await writeFile(join(tmpDir, 'notes.txt'), 'ceci est du texte');
    await writeFile(
      join(tmpDir, 'valid.json'),
      JSON.stringify({
        id: 'valid',
        name: 'Valide',
        command: 'valid',
        description: 'Niche valide',
        emoji: '✅',
        format: ['Section'],
        promptSystem: 'Test.',
        maxIterations: 1,
      }),
    );

    const loader = new NicheLoaderService(tmpDir);
    const niches = await loader.loadAll();

    expect(niches.size).toBe(1);
    expect(niches.has('valid')).toBe(true);
  });

  it('ignore un fichier JSON avec des champs manquants', async () => {
    await writeFile(
      join(tmpDir, 'incomplet.json'),
      JSON.stringify({
        id: 'incomplet',
        name: 'Incomplet',
        // command manquant
        format: ['Section'],
        promptSystem: 'Test.',
        maxIterations: 1,
      }),
    );

    const loader = new NicheLoaderService(tmpDir);
    const niches = await loader.loadAll();

    expect(niches.size).toBe(0);
  });

  it('ignore un fichier avec maxIterations invalide', async () => {
    await writeFile(
      join(tmpDir, 'bad-iter.json'),
      JSON.stringify({
        id: 'bad-iter',
        name: 'Bad',
        command: 'bad',
        description: 'Test',
        emoji: '❌',
        format: ['Section'],
        promptSystem: 'Test.',
        maxIterations: 0, // Invalide : doit être >= 1
      }),
    );

    const loader = new NicheLoaderService(tmpDir);
    const niches = await loader.loadAll();

    expect(niches.size).toBe(0);
  });

  it('gère un dossier vide', async () => {
    const loader = new NicheLoaderService(tmpDir);
    const niches = await loader.loadAll();

    expect(niches.size).toBe(0);
  });

  it('gère un dossier inexistant', async () => {
    const loader = new NicheLoaderService(join(tmpDir, 'inexistant'));
    const niches = await loader.loadAll();

    expect(niches.size).toBe(0);
  });

  it('gère les doublons de commande (conserve le premier)', async () => {
    await writeFile(
      join(tmpDir, 'first.json'),
      JSON.stringify({
        id: 'first',
        name: 'Premier',
        command: 'same',
        description: 'Premier fichier',
        emoji: '1️⃣',
        format: ['Section'],
        promptSystem: 'Test.',
        maxIterations: 1,
      }),
    );
    await writeFile(
      join(tmpDir, 'second.json'),
      JSON.stringify({
        id: 'second',
        name: 'Second',
        command: 'same',
        description: 'Second fichier',
        emoji: '2️⃣',
        format: ['Section'],
        promptSystem: 'Test.',
        maxIterations: 1,
      }),
    );

    const loader = new NicheLoaderService(tmpDir);
    const niches = await loader.loadAll();

    expect(niches.size).toBe(1);
    expect(niches.get('same')!.id).toBe('first');
  });

  it('retourne la liste de toutes les niches via listAll()', async () => {
    await writeFile(
      join(tmpDir, 'niche-a.json'),
      JSON.stringify({
        id: 'niche-a',
        name: 'Niche A',
        command: 'a',
        description: 'Première',
        emoji: '🅰️',
        format: ['Section'],
        promptSystem: 'Test.',
        maxIterations: 1,
      }),
    );
    await writeFile(
      join(tmpDir, 'niche-b.json'),
      JSON.stringify({
        id: 'niche-b',
        name: 'Niche B',
        command: 'b',
        description: 'Deuxième',
        emoji: '🅱️',
        format: ['Section'],
        promptSystem: 'Test.',
        maxIterations: 1,
      }),
    );

    const loader = new NicheLoaderService(tmpDir);
    const list = await loader.listAll();

    expect(list).toHaveLength(2);
    expect(list.map((n) => n.id).sort()).toEqual(['niche-a', 'niche-b']);
  });

  it('retourne null pour getByCommand() si la niche nexiste pas', async () => {
    const loader = new NicheLoaderService(tmpDir);
    const result = await loader.getByCommand('inexistant');

    expect(result).toBeNull();
  });
});
