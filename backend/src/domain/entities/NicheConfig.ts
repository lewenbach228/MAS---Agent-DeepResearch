/**
 * NicheConfig décrit une niche métier paramétrable.
 *
 * Chaque fichier JSON dans backend/niches/ est chargé dynamiquement
 * au démarrage et converti en cette interface.
 *
 * Cela permet d'ajouter une nouvelle niche (ex: "veille technologique")
 * sans modifier une ligne de code : on crée juste un fichier JSON.
 */
export interface NicheConfig {
  /** Identifiant unique de la niche (ex: "market-intelligence") */
  id: string;

  /** Nom lisible pour l'utilisateur (ex: "Analyse de Marché") */
  name: string;

  /** Commande Discord associée (ex: "analyze" → /analyze) */
  command: string;

  /** Description courte affichée dans /niches */
  description: string;

  /** Emoji représentant la niche */
  emoji: string;

  /** Liste des sections attendues dans le rapport final */
  format: string[];

  /** Prompt système pour guider le comportement du LLM */
  promptSystem: string;

  /** Nombre maximum d'itérations de recherche si la couverture est insuffisante */
  maxIterations: number;
}
