/**
 * SearchResult représente un résultat de recherche web.
 *
 * C'est la structure atomique retournée par le web_search tool,
 * quel que soit le fournisseur (OpenAI, Google, Bing, etc.).
 *
 * Le moteur collecte ces résultats pendant la phase de recherche,
 * les stocke dans le rapport final, et les affiche comme sources cliquables.
 */
export interface SearchResult {
  /** Titre de la page web */
  title: string;

  /** URL complète de la source */
  url: string;

  /** Extrait pertinent (2-3 phrases max) */
  snippet: string;

  /** Nom de la source (ex: "journaldunet.com") */
  source: string;
}
