import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { NicheConfig } from '../../domain/entities/NicheConfig.js';
import type { NicheLoader } from '../../domain/ports/NicheLoader.js';

/**
 * Champs obligatoires qu'un fichier niche JSON doit contenir.
 * Utilisé pour valider les fichiers au chargement.
 */
const REQUIRED_FIELDS: (keyof NicheConfig)[] = [
  'id',
  'name',
  'command',
  'description',
  'emoji',
  'format',
  'promptSystem',
  'maxIterations',
];

/**
 * NicheLoaderService implémente NicheLoader.
 *
 * Il scanne le dossier backend/niches/ au démarrage, charge tous les
 * fichiers JSON valides, et les rend disponibles dans une Map.
 *
 * Ajout d'une niche = création d'un fichier JSON. Zéro code modifié.
 */
export class NicheLoaderService implements NicheLoader {
  private niches: Map<string, NicheConfig> = new Map();
  private initialized = false;

  constructor(private readonly nichesDir: string) {}

  /**
   * Charge toutes les niches depuis le dossier de configuration.
   * Appelé au démarrage du serveur.
   */
  async loadAll(): Promise<Map<string, NicheConfig>> {
    if (this.initialized) {
      return this.niches;
    }

    const files = await this.scanDirectory();
    const loaded = new Map<string, NicheConfig>();

    for (const file of files) {
      try {
        const config = await this.loadFile(file);

        if (!this.validateConfig(config)) {
          console.warn(`⚠️  Fichier ignorer (validation echouee) : ${file}`);
          continue;
        }

        // Vérifier les doublons de commande
        if (loaded.has(config.command)) {
          console.warn(
            `⚠️  Commande dupliquee "${config.command}" dans ${file} — la premiere occurrence est conservee`,
          );
          continue;
        }

        loaded.set(config.command, config);
        console.log(`✅  Niche chargee : ${config.name} (/${config.command})`);
      } catch (error) {
        console.warn(`⚠️  Impossible de charger ${file} :`, error);
      }
    }

    this.niches = loaded;
    this.initialized = true;

    if (loaded.size === 0) {
      console.warn('⚠️  Aucune niche valide chargee. Le bot n\'aura aucune commande disponible.');
    }

    return this.niches;
  }

  /**
   * Récupère une niche par sa commande Discord (ex: "analyze").
   */
  async getByCommand(command: string): Promise<NicheConfig | null> {
    if (!this.initialized) {
      await this.loadAll();
    }
    return this.niches.get(command) ?? null;
  }

  /**
   * Retourne la liste de toutes les niches disponibles.
   */
  async listAll(): Promise<NicheConfig[]> {
    if (!this.initialized) {
      await this.loadAll();
    }
    return Array.from(this.niches.values());
  }

  // ---------------------------------------------------------------
  // Méthodes privées
  // ---------------------------------------------------------------

  /**
   * Scanne le dossier des niches et retourne les chemins des fichiers .json.
   */
  private async scanDirectory(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.nichesDir);
    } catch {
      console.warn(`⚠️  Dossier des niches introuvable : ${this.nichesDir}`);
      return [];
    }

    return entries
      .filter((entry) => extname(entry).toLowerCase() === '.json')
      // Ignorer les fichiers de documentation (niche.schema.json, etc.)
      .filter((entry) => !entry.includes('.schema.'))
      .map((entry) => join(this.nichesDir, entry));
  }

  /**
   * Lit et parse un fichier JSON de niche.
   */
  private async loadFile(filePath: string): Promise<NicheConfig> {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<NicheConfig>;
    return parsed as NicheConfig;
  }

  /**
   * Valide qu'un objet NicheConfig contient tous les champs obligatoires.
   */
  private validateConfig(config: Partial<NicheConfig>): config is NicheConfig {
    for (const field of REQUIRED_FIELDS) {
      if (config[field] === undefined || config[field] === null) {
        console.warn(`  Champ manquant : "${field}"`);
        return false;
      }
    }

    // Validations supplémentaires
    if (!Array.isArray(config.format) || config.format.length === 0) {
      console.warn('  Le champ "format" doit etre un tableau non vide.');
      return false;
    }

    if (typeof config.maxIterations !== 'number' || config.maxIterations < 1) {
      console.warn('  "maxIterations" doit etre un nombre >= 1.');
      return false;
    }

    return true;
  }
}
