import { randomUUID } from 'node:crypto';
import type { LLMProvider, ResearchPlan } from '../../domain/ports/LLMProvider.js';
import type { NicheConfig } from '../../domain/entities/NicheConfig.js';
import type { SearchResult } from '../../domain/entities/SearchResult.js';
import type { Report, ReportSection, ReportStatus } from '../../domain/entities/Report.js';
import { OpenAIService } from '../openai/OpenAIService.js';

/**
 * Statut de progression de l'agent, transmis au callback onProgress.
 * Le bot Discord utilise ces statuts pour mettre à jour les embeds.
 */
export type AgentProgress =
  | { step: 'planning' }
  | { step: 'searching'; axe: string; resultsCount: number }
  | { step: 'evaluating'; iteration: number; maxIterations: number }
  | { step: 'iterating'; gaps: string[] }
  | { step: 'synthesizing' }
  | { step: 'completed'; reportId: string }
  | { step: 'error'; message: string };

/**
 * Options d'exécution pour l'AgentEngine.
 */
export interface AgentOptions {
  /** Callback appelé à chaque changement d'étape */
  onProgress?: (progress: AgentProgress) => void;

  /** Seed optionnelle pour les tests (même question → même plan) */
  seed?: number;
}

/**
 * Résultat complet de l'exécution de l'agent.
 */
export interface AgentResult {
  report: Report;
  metadata: {
    iterations: number;
    totalQueries: number;
    totalSources: number;
    planning: ResearchPlan;
  };
}

/**
 * AgentEngine — Moteur agent avec boucle de rétroaction.
 *
 * Exécute le pipeline en 5 étapes :
 * 1. Planification → LLM analyse la question, produit un plan
 * 2. Recherche → pour chaque axe, recherche web via web_search tool
 * 3. Évaluation → LLM juge la couverture, décide d'itérer ou non
 * 4. Synthèse → LLM produit le rapport structuré
 * 5. Finalisation → construction du Report complet
 *
 * La boucle d'itération (étape 3 → 2) permet d'approfondir
 * les lacunes identifiées jusqu'à maxIterations.
 */
export class AgentEngine {
  constructor(private readonly llm: LLMProvider) {}

  /**
   * Exécute le pipeline agentique complet.
   *
   * @param question - La question posée par l'utilisateur
   * @param niche - Configuration de la niche (définit le format, le prompt, maxIterations)
   * @param userId - Identifiant Discord de l'utilisateur
   * @param options - Options d'exécution (callback, seed)
   * @param apiKey - Clé API OpenAI optionnelle (BYOK). Si fournie, crée une instance LLM
   *                 temporaire avec cette clé pour cette exécution uniquement.
   * @returns Le rapport complet avec métadonnées
   */
  async execute(
    question: string,
    niche: NicheConfig,
    userId: string,
    options?: AgentOptions,
    apiKey?: string,
  ): Promise<AgentResult> {
    // BYOK : si une clé utilisateur est fournie, créer un LLM dédié pour cette exécution
    // Cela évite de partager la clé globale et protège l'admin des coûts externes.
    const llm = apiKey ? OpenAIService.withApiKey(apiKey) : this.llm;

    const onProgress = options?.onProgress;
    const startTime = Date.now();
    const allResults: SearchResult[] = [];
    let totalQueries = 0;

    // Génération d'un ID unique pour le rapport
    const reportId = this.generateReportId();

    try {
      // -----------------------------------------------------------
      // ÉTAPE 1 — Planification
      // -----------------------------------------------------------
      onProgress?.({ step: 'planning' });

      const plan = await llm.planQuestion(niche, question);

      // Valider le plan
      if (!plan.axes || plan.axes.length === 0) {
        throw new Error('Le plan de recherche est vide — impossible de continuer');
      }

      // -----------------------------------------------------------
      // ÉTAPE 2 & 3 — Boucle de recherche + évaluation
      // -----------------------------------------------------------
      const searchQueries: string[] = [...plan.axes];
      let iteration = 0;

      while (searchQueries.length > 0 && iteration < niche.maxIterations) {
        iteration++;

        // Phase de recherche : pour chaque requête, lancer une recherche web
        for (const query of searchQueries) {
          totalQueries++;

          // Utiliser mots-clés et sous-questions pour enrichir la requête
          const enrichedQuery = this.buildSearchQuery(query, plan);

          const results = await llm.searchWeb(enrichedQuery);

          // Dédupliquer par URL
          const existingUrls = new Set(allResults.map((r) => r.url));
          const newResults = results.filter((r) => !existingUrls.has(r.url));

          allResults.push(...newResults);

          onProgress?.({ step: 'searching', axe: query, resultsCount: newResults.length });
        }

        // Vider la liste des requêtes pour cette itération
        searchQueries.length = 0;

        // Phase d'évaluation (sauf si c'est la dernière itération)
        if (iteration < niche.maxIterations) {
          onProgress?.({ step: 'evaluating', iteration, maxIterations: niche.maxIterations });

          const evaluation = await llm.evaluateCoverage(question, allResults, niche);

          if (!evaluation.sufficient && (evaluation.gaps.length > 0)) {
            // Utiliser les newQueries reformulées pour la recherche (plus précises que gaps)
            // Fallback sur gaps si newQueries est vide
            const nextQueries = (evaluation.newQueries && evaluation.newQueries.length > 0)
              ? evaluation.newQueries
              : evaluation.gaps;

            for (const query of nextQueries) {
              searchQueries.push(query);
            }

            if (searchQueries.length > 0) {
              onProgress?.({ step: 'iterating', gaps: evaluation.gaps });
            }
          }
        }
      }

      // -----------------------------------------------------------
      // ÉTAPE 4 — Synthèse
      // -----------------------------------------------------------
      onProgress?.({ step: 'synthesizing' });

      const sections = await llm.synthesize(niche, question, allResults);

      // -----------------------------------------------------------
      // ÉTAPE 5 — Construction du rapport final
      // -----------------------------------------------------------
      const metadata = {
        iterations: iteration,
        totalQueries,
        totalSources: allResults.length,
        planning: plan,
      };

      const report: Report = {
        id: reportId,
        userId,
        question,
        nicheId: niche.id,
        sections,
        sources: allResults,
        status: 'completed',
        createdAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        metadata,
      };

      onProgress?.({ step: 'completed', reportId });

      return {
        report,
        metadata,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const failedReport: Report = {
        id: reportId,
        userId,
        question,
        nicheId: niche.id,
        sections: [],
        sources: allResults,
        status: 'error',
        error: errorMessage,
        createdAt: new Date(startTime).toISOString(),
      };

      onProgress?.({ step: 'error', message: errorMessage });

      return {
        report: failedReport,
        metadata: {
          iterations: 0,
          totalQueries,
          totalSources: allResults.length,
          planning: { sousQuestions: [], motsCles: [], axes: [] },
        },
      };
    }
  }

  // ---------------------------------------------------------------
  // Méthodes privées
  // ---------------------------------------------------------------

  /**
   * Génère un ID court pour le rapport (ex: "r_a1b2c3d4").
   */
  private generateReportId(): string {
    const uuid = randomUUID().replace(/-/g, '');
    return `r_${uuid.slice(0, 8)}`;
  }

  /**
   * Construit une requête de recherche enrichie à partir d'un axe et du plan.
   */
  private buildSearchQuery(axe: string, plan: ResearchPlan): string {
    // Si l'axe seul est suffisamment long, on l'utilise tel quel
    if (axe.length > 20) return axe;

    // Sinon, on l'enrichit avec les mots-clés pertinents
    const keywords = plan.motsCles.slice(0, 3).join(' ');
    return `${axe} ${keywords}`.trim();
  }
}
