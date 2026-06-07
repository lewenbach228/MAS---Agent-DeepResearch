import type { Report, ReportSection } from '../../domain/entities/Report.js';
import type { SearchResult } from '../../domain/entities/SearchResult.js';
import type { ReportRepository } from '../../domain/ports/Repository.js';
import type { AppDatabase } from '../database/Database.js';

// Type pour les requêtes préparées better-sqlite3
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stmt = any;

/**
 * ReportRepositorySQLite implémente ReportRepository avec SQLite.
 *
 * Les sections et sources sont stockées en JSON dans des colonnes TEXT,
 * ce qui évite des tables de jointure complexes en V1.
 */
export class ReportRepositorySQLite implements ReportRepository {
  private readonly stmts: {
    findById: Stmt;
    findByUserId: Stmt;
    insert: Stmt;
    update: Stmt;
  };

  constructor(private readonly db: AppDatabase) {
    const raw = db.raw;

    this.stmts = {
      findById: raw.prepare('SELECT * FROM reports WHERE id = ?'),
      findByUserId: raw.prepare(
        'SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      ),
      insert: raw.prepare(
        `INSERT INTO reports (id, user_id, question, niche_id, status, sections, sources, metadata, error, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      update: raw.prepare(
        `UPDATE reports SET status = ?, sections = ?, sources = ?, metadata = ?, error = ?, completed_at = ?
         WHERE id = ?`,
      ),
    };
  }

  async findById(id: string): Promise<Report | null> {
    const row = this.stmts.findById.get(id) as ReportRow | undefined;
    if (!row) return null;

    return this.mapRowToReport(row);
  }

  async findByUserId(userId: string, limit = 10): Promise<Report[]> {
    const rows = this.stmts.findByUserId.all(userId, limit) as ReportRow[];
    return rows.map((row) => this.mapRowToReport(row));
  }

  async save(report: Report): Promise<void> {
    this.stmts.insert.run(
      report.id,
      report.userId,
      report.question,
      report.nicheId,
      report.status,
      JSON.stringify(report.sections),
      JSON.stringify(report.sources),
      JSON.stringify(report.metadata ?? null),
      report.error ?? null,
      report.createdAt,
      report.completedAt ?? null,
    );
  }

  async update(report: Report): Promise<void> {
    this.stmts.update.run(
      report.status,
      JSON.stringify(report.sections),
      JSON.stringify(report.sources),
      JSON.stringify(report.metadata ?? null),
      report.error ?? null,
      report.completedAt ?? null,
      report.id,
    );
  }

  // ---------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------

  private mapRowToReport(row: ReportRow): Report {
    const metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
    return {
      id: row.id,
      userId: row.user_id,
      question: row.question,
      nicheId: row.niche_id,
      status: row.status as Report['status'],
      sections: JSON.parse(row.sections) as ReportSection[],
      sources: JSON.parse(row.sources) as SearchResult[],
      metadata: metadata ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
    };
  }
}

/** Ligne brute de la table reports retournée par SQLite */
interface ReportRow {
  id: string;
  user_id: string;
  question: string;
  niche_id: string;
  status: string;
  sections: string; // JSON
  sources: string; // JSON
  metadata: string | null; // JSON
  error: string | null;
  created_at: string;
  completed_at: string | null;
}
