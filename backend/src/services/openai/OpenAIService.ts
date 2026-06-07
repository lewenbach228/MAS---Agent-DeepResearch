import type { LLMProvider, ResearchPlan } from '../../domain/ports/LLMProvider.js';
import type { NicheConfig } from '../../domain/entities/NicheConfig.js';
import type { SearchResult } from '../../domain/entities/SearchResult.js';
import type { ReportSection } from '../../domain/entities/Report.js';

/**
 * OpenAIService implémente LLMProvider via fetch natif.
 *
 * La clé API est lue depuis la variable d'environnement OPENAI_API_KEY.
 * Pas de stockage de clé en base — chaque déploiement a sa propre clé.
 * Pas de BYOK — une seule clé partagée pour toute l'instance.
 *
 * Deux APIs sont utilisées :
 * - Responses API (avec web_search_preview) pour la recherche web
 * - Chat Completions API pour la planification, l'évaluation et la synthèse
 *
 * Ce choix évite toute dépendance SDK et donne un contrôle fin
 * sur les appels réseau, le timeout et le parsing.
 */
export class OpenAIService implements LLMProvider {
  private readonly baseUrl = 'https://api.openai.com/v1';
  private readonly apiKey: string;

  /**
   * @param model - Modèle pour la synthèse (qualité, défaut: gpt-4o)
   * @param cheapModel - Modèle pour planification, évaluation, recherche (économique, défaut: gpt-4o-mini)
   */
  constructor(
    private readonly model = 'gpt-4o',
    private readonly cheapModel = 'gpt-4o-mini',
  ) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'OPENAI_API_KEY manquante. Définissez la variable d\'environnement ou passez une clé via setApiKey().',
      );
    }
    this.apiKey = key;
  }

  /**
   * Permet de définir une clé API alternative (utile pour les tests).
   */
  static withApiKey(
    apiKey: string,
    model = 'gpt-4o',
    cheapModel = 'gpt-4o-mini',
  ): OpenAIService {
    const instance = Object.create(OpenAIService.prototype) as OpenAIService;
    // Les champs de classe ne sont pas initialisés par Object.create,
    // on doit donc les définir manuellement.
    (instance as any).baseUrl = 'https://api.openai.com/v1';
    (instance as any).model = model;
    (instance as any).cheapModel = cheapModel;
    (instance as any).apiKey = apiKey;
    return instance;
  }

  // ---------------------------------------------------------------
  // Étape 1 — Planification
  // ---------------------------------------------------------------

  async planQuestion(niche: NicheConfig, question: string): Promise<ResearchPlan> {
    const systemMessage = `${niche.promptSystem}

Tu dois d'abord planifier la recherche en produisant un plan structuré.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :

{
  "sousQuestions": ["sous-question 1", "sous-question 2"],
  "motsCles": ["mot-clé 1", "mot-clé 2"],
  "axes": ["requête recherche 1", "requête recherche 2"]
}

Les axes sont des REQUETES DE RECHERCHE PRECISES (3 max) qu'on enverra à un moteur de recherche web.
EXIGENCES pour chaque axe :
- DOIT contenir des termes factuels et des mots-clés précis
- NE DOIT PAS contenir de verbe d'analyse (estimation, identification, analyse)
- DOIT être formulé comme une recherche Google : "taille marché agents IA France 2026"
- DOIT inclure des chiffres, années ou noms propres si possible
- MAX 10 mots par axe`;

    const body = {
      model: this.cheapModel,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: `Sujet à analyser : ${question}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    };

    const data = await this.chatCompletion(body);
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Réponse vide du LLM lors de la planification');

    try {
      const plan = JSON.parse(content) as ResearchPlan;
      // Validation minimale
      if (!plan.axes || !Array.isArray(plan.axes) || plan.axes.length === 0) {
        throw new Error('Le plan doit contenir au moins un axe');
      }
      plan.sousQuestions ??= [];
      plan.motsCles ??= [];
      return plan;
    } catch (parseError) {
      throw new Error(
        `Impossible de parser le plan de recherche : ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      );
    }
  }

  // ---------------------------------------------------------------
  // Étape 2 — Recherche web (Responses API avec web_search_preview)
  // ---------------------------------------------------------------

  async searchWeb(query: string): Promise<SearchResult[]> {
    const body = {
      model: this.cheapModel,
      input: query,
      tools: [
        {
          type: 'web_search_preview' as const,
          search_context_size: 'medium' as const,
        },
      ],
    };

    const data = await this.responsesApi(body);

    // Extraire les résultats depuis les annotations du texte de réponse
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    const outputMessages = data.output?.filter(
      (o: { type: string }) => o.type === 'message',
    ) ?? [];

    for (const msg of outputMessages) {
      const contents = msg.content ?? [];
      for (const content of contents) {
        if (content.type === 'output_text' && content.annotations) {
          for (const ann of content.annotations) {
            if (ann.type === 'url_citation' && !seen.has(ann.url)) {
              seen.add(ann.url);
              results.push({
                title: ann.title ?? 'Sans titre',
                url: ann.url,
                snippet: this.extractSnippet(content.text ?? '', ann),
                source: new URL(ann.url).hostname.replace('www.', ''),
              });
            }
          }
        }
      }
    }

    return results;
  }

  // ---------------------------------------------------------------
  // Étape 3 — Évaluation de la couverture
  // ---------------------------------------------------------------

  async evaluateCoverage(
    question: string,
    results: SearchResult[],
    niche: NicheConfig,
  ): Promise<{ sufficient: boolean; gaps: string[]; newQueries?: string[] }> {
    const sourcesText = results
      .map((r, i) => `${i + 1}. ${r.title} — ${r.snippet}`)
      .join('\n');

    const body = {
      model: this.cheapModel,
      messages: [
        {
          role: 'system',
          content: `Tu es un analyste qui évalue si une collecte de sources est suffisante pour répondre à une question.

${niche.promptSystem}

Réponds UNIQUEMENT avec un objet JSON valide :
{
  "sufficient": true/false,
  "gaps": ["lacune 1", "lacune 2"],
  "newQueries": ["nouvelle requête 1", "nouvelle requête 2"]
}

- sufficient : true si les sources couvrent le sujet, false sinon
- gaps : les angles morts identifiés (vide si suffisant)
- newQueries : suggestions de nouvelles recherches si insuffisant (maximum 2)`,
        },
        {
          role: 'user',
          content: `Question : ${question}

Format attendu du rapport :
${niche.format.map((s) => `- ${s}`).join('\n')}

Sources collectées :
${sourcesText}

Es-tu en mesure de produire un rapport complet et sourcé avec ces sources ?`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    };

    const data = await this.chatCompletion(body);
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Réponse vide du LLM lors de l\'évaluation');

    try {
      const evaluation = JSON.parse(content);
      return {
        sufficient: evaluation.sufficient ?? true,
        gaps: evaluation.gaps ?? [],
        newQueries: evaluation.newQueries ?? [],
      };
    } catch {
      // Si le LLM ne produit pas du JSON valide, on considère que c'est suffisant
      return { sufficient: true, gaps: [] };
    }
  }

  // ---------------------------------------------------------------
  // Étape 4 — Synthèse du rapport
  // ---------------------------------------------------------------

  async synthesize(
    niche: NicheConfig,
    question: string,
    results: SearchResult[],
  ): Promise<ReportSection[]> {
    const sourcesText = results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title}\n   URL: ${r.url}\n   Extrait: ${r.snippet}\n   Source: ${r.source}`,
      )
      .join('\n\n');

    const sectionsFormat = niche.format
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n');

    const systemMessage = `${niche.promptSystem}

Tu dois produire un rapport structuré en sections.
Utilise UNIQUEMENT les sources fournies ci-dessous.
Chaque affirmation doit être suivie d'une citation numérotée [1], [2], etc.
Réponds en français.

Format des sections attendues :
${sectionsFormat}

Pour chaque section, écris un paragraphe clair et concis en t'appuyant sur les sources.`;

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemMessage },
        {
          role: 'user',
          content: `Sujet : ${question}

Sources disponibles :
${sourcesText}

Produis le rapport complet avec toutes les sections listées ci-dessus.`,
        },
      ],
      temperature: 0.4,
    };

    const data = await this.chatCompletion(body);
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Réponse vide du LLM lors de la synthèse');

    // Parser le texte structuré en sections
    return this.parseSections(content, niche.format);
  }

  // ---------------------------------------------------------------
  // Appels API privés
  // ---------------------------------------------------------------

  /**
   * Appelle l'API Chat Completions (pour planification, évaluation, synthèse).
   */
  private async chatCompletion(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ ...body, max_tokens: 4096 }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Chat Completions API error ${response.status}: ${error}`);
    }

    return response.json() as Promise<ChatCompletionResponse>;
  }

  /**
   * Appelle l'API Responses (pour la recherche web avec web_search_preview).
   */
  private async responsesApi(body: Record<string, unknown>): Promise<ResponsesApiResponse> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Responses API error ${response.status}: ${error}`);
    }

    return response.json() as Promise<ResponsesApiResponse>;
  }

  // ---------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------

  /**
   * Extrait le snippet entourant une citation dans le texte.
   */
  private extractSnippet(text: string, annotation: Annotation): string {
    const { start_index, end_index } = annotation;
    // Prendre ~200 caractères autour de la citation
    const contextStart = Math.max(0, start_index - 100);
    const contextEnd = Math.min(text.length, end_index + 100);
    let snippet = text.slice(contextStart, contextEnd).trim();

    // Nettoyer les sauts de ligne
    snippet = snippet.replace(/\s+/g, ' ').trim();

    if (contextStart > 0) snippet = '...' + snippet;
    if (contextEnd < text.length) snippet = snippet + '...';

    return snippet.slice(0, 300);
  }

  /**
   * Parse le texte du rapport en sections structurées.
   * Chaque section commence par un titre correspondant au format de la niche.
   */
  private parseSections(text: string, format: string[]): ReportSection[] {
    const lines = text.split('\n');
    const sections: ReportSection[] = [];
    let currentTitle = '';
    let currentContent: string[] = [];

    const isTitle = (line: string): string | null => {
      const trimmed = line.trim().replace(/^[#*]*\s*/, '');
      for (const section of format) {
        // Match: "1. Titre", "Titre :", "**Titre**", etc.
        const sectionShort = section.replace(/\(.*\)/, '').trim();
        if (
          trimmed.toLowerCase().startsWith(sectionShort.toLowerCase().slice(0, 15)) ||
          trimmed.toLowerCase().includes(sectionShort.toLowerCase().slice(0, 10))
        ) {
          return section;
        }
      }
      return null;
    };

    for (const line of lines) {
      const title = isTitle(line);
      if (title) {
        if (currentTitle && currentContent.length > 0) {
          sections.push({
            title: currentTitle,
            content: currentContent.join('\n').trim(),
          });
        }
        currentTitle = title;
        currentContent = [];
      } else {
        const trimmed = line.trim();
        if (trimmed) {
          currentContent.push(trimmed);
        }
      }
    }

    // Dernière section
    if (currentTitle && currentContent.length > 0) {
      sections.push({
        title: currentTitle,
        content: currentContent.join('\n').trim(),
      });
    }

    // Fallback : si aucune section parsée, tout le texte dans une section "Rapport"
    if (sections.length === 0) {
      sections.push({
        title: 'Rapport',
        content: text.trim(),
      });
    }

    return sections;
  }
}

// ---------------------------------------------------------------
// Types internes pour les réponses API
// ---------------------------------------------------------------

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ResponsesApiResponse {
  id: string;
  output: Array<{
    type: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Annotation[];
    }>;
  }>;
}

interface Annotation {
  type: string;
  start_index: number;
  end_index: number;
  url: string;
  title?: string;
}
