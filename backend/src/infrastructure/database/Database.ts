import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Database gère la connexion SQLite et les migrations automatiques.
 *
 * SQLite est choisi pour sa simplicité (zéro configuration, fichier unique).
 * better-sqlite3 est synchrone : pas de callback hell, idéal pour un bot Discord.
 *
 * Schéma V1 :
 * - reports : stocke les rapports générés par l'agent
 * - (users : table supprimée en V1 — pas de stockage de clés API)
 */
export class AppDatabase {
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Ouvre (ou crée) la base de données et exécute les migrations.
   */
  static async create(dbPath: string): Promise<AppDatabase> {
    // Créer le dossier parent si nécessaire
    await mkdir(dirname(dbPath), { recursive: true }).catch(() => {});

    const db = new Database(dbPath);

    // Activer WAL mode pour de meilleures performances en lecture/écriture concurrente
    db.pragma('journal_mode = WAL');

    const appDb = new AppDatabase(db);
    appDb.migrate();
    return appDb;
  }

  /**
   * Exécute les migrations pour créer les tables si elles n'existent pas.
   *
   * Stratégie : CREATE TABLE IF NOT EXISTS pour la création initiale,
   * puis ALTER TABLE ADD COLUMN si une colonne manque (pour les bases existantes).
   */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        question TEXT NOT NULL,
        niche_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        sections TEXT NOT NULL DEFAULT '[]',
        sources TEXT NOT NULL DEFAULT '[]',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
      CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
    `);

    // ───── Table users (créée en V1.5 pour le profil utilisateur) ─────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id  TEXT PRIMARY KEY,
        openai_key  TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),

        -- Profil utilisateur (recommandations personnalisées)
        secteur     TEXT,
        stack       TEXT DEFAULT '[]',
        priorites   TEXT DEFAULT '[]',
        budget_max  REAL,
        contraintes TEXT DEFAULT '[]'
      );
    `);

    // Migrations incrémentales pour colonnes ajoutées après la V1 initiale
    this.addColumnIfMissing('reports', 'metadata', 'TEXT DEFAULT \'null\'');
  }

  /**
   * Ajoute une colonne à une table si elle n'existe pas encore.
   * SQLite ne supporte pas IF NOT EXISTS pour ALTER TABLE ADD COLUMN,
   * on utilise PRAGMA table_info pour détecter la présence de la colonne.
   */
  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  /**
   * Accès direct à l'instance better-sqlite3 pour les repositories.
   */
  get raw(): Database.Database {
    return this.db;
  }

  /**
   * Ferme la connexion à la base de données.
   */
  close(): void {
    this.db.close();
  }
}
