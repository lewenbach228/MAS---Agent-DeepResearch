import type { User } from '../entities/User.js';
import type { Report } from '../entities/Report.js';

/**
 * Repository est le port pour la persistence des données.
 *
 * Deux repositories sont définis :
 *   - UserRepository : gestion des utilisateurs Discord et leurs clés API
 *   - ReportRepository : sauvegarde et consultation des rapports
 *
 * L'implémentation concrète (SQLite en V1) se trouve dans infrastructure/.
 */
export interface UserRepository {
  /** Récupère un utilisateur par son identifiant Discord */
  findByDiscordId(discordId: string): Promise<User | null>;

  /** Enregistre ou met à jour un utilisateur */
  save(user: User): Promise<void>;

  /** Met à jour la clé OpenAI d'un utilisateur */
  updateKey(discordId: string, openaiKey: string): Promise<void>;

  /** Met à jour le profil utilisateur pour les recommandations personnalisées */
  updateProfile(
    discordId: string,
    profile: {
      secteur?: string;
      stack?: string[];
      priorites?: string[];
      budgetMax?: number;
      contraintes?: string[];
    },
  ): Promise<void>;
}

export interface ReportRepository {
  /** Récupère un rapport par son identifiant unique */
  findById(id: string): Promise<Report | null>;

  /** Récupère les N derniers rapports d'un utilisateur, triés par date */
  findByUserId(userId: string, limit?: number): Promise<Report[]>;

  /** Sauvegarde un nouveau rapport */
  save(report: Report): Promise<void>;

  /** Met à jour le statut et les sections d'un rapport existant */
  update(report: Report): Promise<void>;
}
