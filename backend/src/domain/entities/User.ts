/**
 * User représente un utilisateur Discord du bot.
 *
 * Le BYOK (Bring Your Own Key) est un choix délibéré :
 * - Pas de clé OpenAI partagée = pas de coût pour le mainteneur
 * - Chaque utilisateur est responsable de sa propre consommation
 * - La clé est stockée en clair en V1 (SQLite), pas de chiffrement
 *
 * Les champs "profil" permettent au système de recommander
 * des outils IA pertinents selon le secteur, la stack, les priorités
 * et les contraintes de l'utilisateur (utility-based matching).
 *
 * À améliorer en V2 : chiffrement au repos de la clé.
 */
export interface User {
  /** Identifiant unique Discord de l'utilisateur */
  discordId: string;

  /** Clé API OpenAI (stockée en clair en V1) */
  openaiKey: string;

  /** Date de première inscription (ISO 8601) */
  createdAt: string;

  // ───── Profil utilisateur (pour recommandations personnalisées) ─────

  /** Secteur d'activité (ex: "Assurance", "SaaS", "E-commerce", "Santé") */
  secteur?: string;

  /** Stack technique utilisée (ex: ["React", "Node.js", "PostgreSQL", "AWS"]) */
  stack?: string[];

  /** Priorités métier (ex: ["automatisation", "réduction coûts", "conformité"]) */
  priorites?: string[];

  /** Budget mensuel maximum pour outils IA (en euros) */
  budgetMax?: number;

  /** Contraintes (ex: ["RGPD", "pas de cloud US", "données sensibles"]) */
  contraintes?: string[];
}
