import type { User } from '../../domain/entities/User.js';
import type { UserRepository } from '../../domain/ports/Repository.js';
import type { AppDatabase } from '../database/Database.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stmt = any;

/**
 * UserRepositorySQLite implémente UserRepository avec SQLite.
 *
 * V1.5 : ajout du profil utilisateur (secteur, stack, priorites, budget, contraintes)
 * pour les recommandations personnalisées (utility-based matching).
 */
export class UserRepositorySQLite implements UserRepository {
  private readonly stmts: {
    findById: Stmt;
    insert: Stmt;
    updateKey: Stmt;
    updateProfile: Stmt;
  };

  constructor(private readonly db: AppDatabase) {
    const raw = db.raw;

    this.stmts = {
      findById: raw.prepare('SELECT * FROM users WHERE discord_id = ?'),
      insert: raw.prepare(
        'INSERT INTO users (discord_id, openai_key, created_at, secteur, stack, priorites, budget_max, contraintes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ),
      updateKey: raw.prepare('UPDATE users SET openai_key = ? WHERE discord_id = ?'),
      updateProfile: raw.prepare(
        `UPDATE users SET secteur = ?, stack = ?, priorites = ?, budget_max = ?, contraintes = ? WHERE discord_id = ?`,
      ),
    };
  }

  async findByDiscordId(discordId: string): Promise<User | null> {
    const row = this.stmts.findById.get(discordId) as UserRow | undefined;
    if (!row) return null;

    return this.mapRow(row);
  }

  async save(user: User): Promise<void> {
    const existing = await this.findByDiscordId(user.discordId);
    if (existing) {
      this.stmts.updateKey.run(user.openaiKey, user.discordId);
    } else {
      this.stmts.insert.run(
        user.discordId,
        user.openaiKey,
        user.createdAt,
        user.secteur ?? null,
        JSON.stringify(user.stack ?? []),
        JSON.stringify(user.priorites ?? []),
        user.budgetMax ?? null,
        JSON.stringify(user.contraintes ?? []),
      );
    }
  }

  async updateKey(discordId: string, openaiKey: string): Promise<void> {
    this.stmts.updateKey.run(openaiKey, discordId);
  }

  async updateProfile(
    discordId: string,
    profile: {
      secteur?: string;
      stack?: string[];
      priorites?: string[];
      budgetMax?: number;
      contraintes?: string[];
    },
  ): Promise<void> {
    this.stmts.updateProfile.run(
      profile.secteur ?? null,
      JSON.stringify(profile.stack ?? []),
      JSON.stringify(profile.priorites ?? []),
      profile.budgetMax ?? null,
      JSON.stringify(profile.contraintes ?? []),
      discordId,
    );
  }

  /** Convertit une ligne SQLite en objet User */
  private mapRow(row: UserRow): User {
    return {
      discordId: row.discord_id,
      openaiKey: row.openai_key,
      createdAt: row.created_at,
      secteur: row.secteur ?? undefined,
      stack: this.parseJsonArray(row.stack),
      priorites: this.parseJsonArray(row.priorites),
      budgetMax: row.budget_max ?? undefined,
      contraintes: this.parseJsonArray(row.contraintes),
    };
  }

  /** Parse un champ JSON stocké en texte, retourne un tableau vide si invalide */
  private parseJsonArray(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

/** Ligne brute de la table users retournée par SQLite */
interface UserRow {
  discord_id: string;
  openai_key: string;
  created_at: string;
  secteur: string | null;
  stack: string | null;
  priorites: string | null;
  budget_max: number | null;
  contraintes: string | null;
}
