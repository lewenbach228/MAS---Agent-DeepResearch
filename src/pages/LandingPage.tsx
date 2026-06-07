/**
 * LandingPage — Page d'accueil du DeepResearch Agent.
 *
 * Présente le projet et invite à ajouter le bot Discord.
 * Accessible via le navigateur à la racine du site.
 */
export function LandingPage() {
  return (
    <main className="landing-page">
      <section className="hero">
        <h1>DeepResearch Agent</h1>
        <p className="subtitle">
          Agent de recherche autonome accessible via Discord.
          Envoie une commande <code>/analyze</code> et reçois un rapport structuré
          avec sources vérifiées.
        </p>
      </section>

      <section className="features">
        <h2>Comment ça marche</h2>
        <ol className="steps">
          <li>
            <strong>1. Discuter</strong> — Ajoute le bot à ton serveur Discord
          </li>
          <li>
            <strong>2. Demander</strong> — Tape <code>/analyze "ton sujet"</code>
          </li>
          <li>
            <strong>3. Recevoir</strong> — Obtiens un rapport structuré avec sources
          </li>
        </ol>
      </section>

      <section className="example">
        <h2>Exemple de rapport</h2>
        <div className="demo-card">
          <p className="demo-question">
            📊 <em>Marché des agents IA en France</em>
          </p>
          <ul className="demo-sections">
            <li>📋 Résumé exécutif</li>
            <li>📈 Taille du marché + croissance</li>
            <li>🏢 Acteurs clés</li>
            <li>📉 Tendances</li>
            <li>💡 Opportunités</li>
            <li>⚠️ Risques</li>
            <li>🔗 Sources</li>
          </ul>
        </div>
      </section>

      <footer className="footer">
        <p>
          Projet portfolio —{' '}
          <a href="https://github.com/YOUR_USERNAME/deepresearch-agent" target="_blank" rel="noopener noreferrer">
            Voir sur GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
