import type { NicheConfig } from '../entities/NicheConfig.js';
import type { SearchResult } from '../entities/SearchResult.js';
import type { ReportSection } from '../entities/Report.js';

/**
 * Plan de recherche généré par le LLM lors de la phase de planification.
 */
export interface ResearchPlan {
  /** Sous-questions à explorer pour couvrir le sujet */
  sousQuestions: string[];

  /** Mots-clés pour guider les recherches web */
  motsCles: string[];

  /** Axes d'analyse principaux (ex: "marché", "concurrence", "tendances") */
  axes: string[];
}

/**
 * LLMProvider est le port pour le fournisseur d'IA.
 *
 * Le domaine définit ce contrat ; les adapteurs concrets (OpenAI, mock, etc.)
 * l'implémentent. Cela permet de :
 *   - tester le moteur agent sans appeler OpenAI
 *   - changer de fournisseur (Claude, Gemini) sans modifier le domaine
 *   - contrôler finement les appels API et leur coût
 */
export interface LLMProvider {
  /**
   * Étape 1 — Planification : analyse la question et produit un plan de recherche.
   * @param niche - Configuration de la niche (prompt système, format, etc.)
   * @param question - Question posée par l'utilisateur
   */
  planQuestion(niche: NicheConfig, question: string): Promise<ResearchPlan>;

  /**
   * Étape 2 — Recherche : exécute une requête web et retourne les résultats.
   * @param query - Requête de recherche (mot-clé ou question)
   */
  searchWeb(query: string): Promise<SearchResult[]>;

  /**
   * Étape 3 — Évaluation : juge si les résultats couvrent suffisamment le sujet.
   * @param question - Question originale
   * @param results - Résultats collectés jusqu'à présent
   * @param niche - Configuration de la niche
   * @returns sufficient + lacunes identifiées
   */
  evaluateCoverage(
    question: string,
    results: SearchResult[],
    niche: NicheConfig,
  ): Promise<{
    sufficient: boolean;
    gaps: string[];
    /** Nouvelles requêtes de recherche reformulées pour le web (vs gaps qui sont descriptifs) */
    newQueries?: string[];
  }>;

  /**
   * Étape 4 — Synthèse : produit le rapport final structuré en sections.
   * @param niche - Configuration de la niche (définit le format attendu)
   * @param question - Question originale
   * @param results - Tous les résultats collectés
   */
  synthesize(
    niche: NicheConfig,
    question: string,
    results: SearchResult[],
  ): Promise<ReportSection[]>;
}
