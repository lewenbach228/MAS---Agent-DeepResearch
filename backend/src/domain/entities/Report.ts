/**
 * Report représente un rapport de recherche complet.
 *
 * C'est l'entité centrale du projet : produite par l'agent,
 * stockée en base de données, servie par l'API REST,
 * et affichée sur la page web /r/:id.
 *
 * Les sections sont un tableau (pas un objet fixe) pour s'adapter
 * dynamiquement au format de n'importe quelle niche.
 */

/** Une section individuelle du rapport */
export interface ReportSection {
  /** Titre de la section (ex: "Résumé exécutif") */
  title: string;

  /** Contenu texte de la section */
  content: string;
}

/** Statut possible du rapport pendant son cycle de vie */
export type ReportStatus = 'pending' | 'completed' | 'error';

/** Rapport de recherche complet */
export interface Report {
  /** Identifiant unique (ex: "r_abc123") */
  id: string;

  /** Discord ID de l'utilisateur qui a lancé la recherche */
  userId: string;

  /** Question posée par l'utilisateur */
  question: string;

  /** Identifiant de la niche utilisée (ex: "market-intelligence") */
  nicheId: string;

  /** Sections du rapport (adaptées au format de la niche) */
  sections: ReportSection[];

  /** Toutes les sources collectées pendant la recherche */
  sources: SearchResult[];

  /** Statut actuel du rapport */
  status: ReportStatus;

  /** Message d'erreur si status === 'error' */
  error?: string;

  /** Date de création (ISO 8601) */
  createdAt: string;

  /** Date d'achèvement (ISO 8601), undefined si pas terminé */
  completedAt?: string;

  /** Métadonnées du moteur agent (plan, itérations) */
  metadata?: ReportMetadata;
}

/** Métadonnées de génération du rapport (provenant du moteur agent) */
export interface ReportMetadata {
  /** Nombre d'itérations de recherche effectuées */
  iterations: number;

  /** Nombre total de requêtes web effectuées */
  totalQueries: number;

  /** Plan de recherche initial */
  planning: {
    sousQuestions: string[];
    motsCles: string[];
    axes: string[];
  };
}

// Import nécessaire pour SearchResult (référence circulaire évitée par import)
import type { SearchResult } from './SearchResult.js';
