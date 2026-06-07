import type { NicheConfig } from '../entities/NicheConfig.js';

/**
 * NicheLoader est le port pour charger les configurations de niches.
 *
 * Les niches sont stockées dans des fichiers JSON séparés (backend/niches/).
 * Le loader scanne le dossier au démarrage, charge tous les fichiers valides,
 * et les rend disponibles via une Map<command, NicheConfig>.
 *
 * Ajouter une niche = créer un fichier JSON. Aucune modification de code.
 */
export interface NicheLoader {
  /**
   * Charge toutes les niches disponibles.
   * @returns Une Map indexée par commande Discord (ex: "analyze" → NicheConfig)
   */
  loadAll(): Promise<Map<string, NicheConfig>>;

  /**
   * Récupère une niche par sa commande Discord.
   * @param command - Nom de la commande (ex: "analyze")
   * @returns La config de la niche, ou null si introuvable
   */
  getByCommand(command: string): Promise<NicheConfig | null>;

  /**
   * Retourne la liste de toutes les niches (pour la commande /niches).
   */
  listAll(): Promise<NicheConfig[]>;
}
