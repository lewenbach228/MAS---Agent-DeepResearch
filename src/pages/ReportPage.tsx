import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';

interface ReportSection {
  title: string;
  content: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface ReportMetadata {
  iterations: number;
  totalQueries: number;
  planning: {
    sousQuestions: string[];
    motsCles: string[];
    axes: string[];
  };
}

interface Report {
  id: string;
  question: string;
  nicheId: string;
  sections: ReportSection[];
  sources: SearchResult[];
  status: string;
  error?: string;
  metadata?: ReportMetadata;
  createdAt: string;
  completedAt?: string;
}

/**
 * Transforme le texte brut en JSX avec mise en forme.
 */
function renderText(text: string, sources: SearchResult[]) {
  const parts: Array<{ type: 'text' | 'bold' | 'citation' | 'url'; value: string }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    const citationMatch = remaining.match(/\[(\d+)\]/);
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const urlMatch = remaining.match(/https?:\/\/[^\s]+/);

    const matches: Array<{
      index: number;
      type: 'bold' | 'citation' | 'url';
      match: RegExpMatchArray;
    }> = [];

    if (boldMatch) matches.push({ index: boldMatch.index!, type: 'bold', match: boldMatch });
    if (citationMatch) matches.push({ index: citationMatch.index!, type: 'citation', match: citationMatch });
    if (urlMatch) matches.push({ index: urlMatch.index!, type: 'url', match: urlMatch });

    if (matches.length === 0) {
      parts.push({ type: 'text', value: remaining });
      break;
    }

    matches.sort((a, b) => a.index - b.index);
    const first = matches[0];

    if (first.index > 0) {
      parts.push({ type: 'text', value: remaining.slice(0, first.index) });
    }

    if (first.type === 'bold') {
      parts.push({ type: 'bold', value: first.match[1]! });
      remaining = remaining.slice(first.index + first.match[0].length);
    } else if (first.type === 'citation') {
      const num = parseInt(first.match[1]!, 10);
      if (num >= 1 && num <= sources.length) {
        parts.push({ type: 'citation', value: first.match[1]! });
      } else {
        parts.push({ type: 'text', value: `[${first.match[1]}]` });
      }
      remaining = remaining.slice(first.index + first.match[0].length);
    } else if (first.type === 'url') {
      parts.push({ type: 'url', value: first.match[0] });
      remaining = remaining.slice(first.index + first.match[0].length);
    } else {
      remaining = remaining.slice(first.index + 1);
    }
  }

  const scrollToSource = (num: number) => {
    const el = document.getElementById(`source-${num}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case 'bold':
            return <strong key={i}>{part.value}</strong>;
          case 'citation': {
            const num = parseInt(part.value, 10);
            const source = sources[num - 1];
            return (
              <sup key={i} className="citation-wrapper" title={source?.title ?? ''}>
                <a
                  href={`#source-${num}`}
                  className="citation-link"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSource(num);
                  }}
                >
                  [{num}]
                </a>
              </sup>
            );
          }
          case 'url':
            return (
              <a key={i} href={part.value} target="_blank" rel="noopener noreferrer" className="inline-link">
                {part.value}
              </a>
            );
          default:
            return <span key={i}>{part.value}</span>;
        }
      })}
    </>
  );
}

// ── Constantes d'identifiants de sections pliables ──
const SECTION_SOURCES = '__sources__';
const SECTION_METHODOLOGY = '__methodology__';

type CollapsibleKey = number | typeof SECTION_SOURCES | typeof SECTION_METHODOLOGY;

/**
 * ReportPage — Affiche un rapport de recherche complet.
 * Toutes les sections sont pliables/dépliables.
 */
export function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLElement>(null);

  // État d'ouverture des sections : true = visible, false = pliée
  // Initialisé à true pour toutes après chargement du rapport
  const [openSections, setOpenSections] = useState<Set<CollapsibleKey>>(new Set());

  // Filtrer la section "Sources" (déjà affichée via les cartes sources dédiées)
  const contentSections = (report?.sections ?? []).filter(
    (s) => s.title.toLowerCase() !== 'sources',
  );

  // Quand le rapport est chargé, initialiser toutes les sections comme ouvertes
  useEffect(() => {
    if (report) {
      const all = new Set<CollapsibleKey>();
      contentSections.forEach((_, i) => all.add(i));
      all.add(SECTION_SOURCES);
      if (report.metadata) all.add(SECTION_METHODOLOGY);
      setOpenSections(all);
    }
  }, [report]);

  const toggle = (key: CollapsibleKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const collapseAll = () => setOpenSections(new Set());
  const expandAll = () => {
    const all = new Set<CollapsibleKey>();
    contentSections.forEach((_, i) => all.add(i));
    all.add(SECTION_SOURCES);
    if (report?.metadata) all.add(SECTION_METHODOLOGY);
    setOpenSections(all);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Compte combien sont ouvertes ──
  const totalCollapsible = contentSections.length + 1 + (report?.metadata ? 1 : 0);
  const openCount = openSections.size;

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch(`/api/r/${id}`);
        if (!response.ok) {
          if (response.status === 404) throw new Error('Rapport introuvable');
          throw new Error('Erreur lors du chargement du rapport');
        }
        const data = await response.json();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [id]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  if (loading) {
    return (
      <main className="report-page">
        <div className="loading">
          <div className="spinner" />
          <p>Chargement du rapport...</p>
        </div>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="report-page">
        <div className="error-state">
          <h1>Rapport introuvable</h1>
          <p>Le rapport demandé n'existe pas ou a été supprimé.</p>
          <a href="/" className="back-link">← Retour à l'accueil</a>
        </div>
      </main>
    );
  }

  if (report.status === 'error') {
    return (
      <main className="report-page">
        <div className="error-state">
          <h1>Erreur de génération</h1>
          <p>Le rapport n'a pas pu être généré :</p>
          <pre className="error-message">{report.error}</pre>
          <a href="/" className="back-link">← Retour à l'accueil</a>
        </div>
      </main>
    );
  }

  return (
    <main className="report-page" ref={reportRef}>
      {/* ── En-tête ── */}
      <header className="report-header">
        <div className="header-top">
          <span className="report-badge">Rapport d'analyse</span>
          <button className="btn-icon" onClick={copyLink} title="Copier le lien">
            {copied ? '✓ Lien copié !' : '🔗 Partager'}
          </button>
        </div>
        <h1 className="report-title">{report.question}</h1>
        <div className="report-meta">
          <span className="meta-item"><span className="meta-icon">📅</span>{formatDate(report.createdAt)}</span>
          <span className="meta-divider">·</span>
          <span className="meta-item"><span className="meta-icon">⏱️</span>
            {report.completedAt
              ? `${Math.round((new Date(report.completedAt).getTime() - new Date(report.createdAt).getTime()) / 1000)}s`
              : 'en cours'}
          </span>
          <span className="meta-divider">·</span>
          <span className="meta-item"><span className="meta-icon">📂</span>{report.nicheId}</span>
          <span className="meta-divider">·</span>
          <span className="meta-item"><span className="meta-icon">🔗</span>{report.sources.length} sources</span>
          {report.metadata && (
            <>
              <span className="meta-divider">·</span>
              <span className="meta-item"><span className="meta-icon">🔄</span>{report.metadata.iterations} itération(s)</span>
            </>
          )}
        </div>
      </header>

      {/* ── Table des matières ── */}
      <nav className="toc">
        <div className="toc-header">
          <h3 className="toc-title">Sections</h3>
          <div className="toc-actions">
            <button
              className="toc-action-btn"
              onClick={expandAll}
              disabled={openCount === totalCollapsible}
              title="Tout déplier"
            >
              ⊕ Tout déplier
            </button>
            <button
              className="toc-action-btn"
              onClick={collapseAll}
              disabled={openCount === 0}
              title="Tout plier"
            >
              ⊖ Tout plier
            </button>
          </div>
        </div>
        <ul className="toc-list">
          {contentSections.map((section, i) => (
            <li key={i}>
              <a href={`#section-${i}`} className="toc-link"
                onClick={(e) => {
                  e.preventDefault();
                  toggle(i);
                  setTimeout(() => scrollTo(`section-${i}`), 50);
                }}>
                <span className="toc-toggle-indicator">{openSections.has(i) ? '▼' : '▶'}</span>
                {section.title}
              </a>
            </li>
          ))}
          <li>
            <a href="#sources" className="toc-link"
              onClick={(e) => {
                e.preventDefault();
                toggle(SECTION_SOURCES);
                setTimeout(() => scrollTo('sources'), 50);
              }}>
              <span className="toc-toggle-indicator">{openSections.has(SECTION_SOURCES) ? '▼' : '▶'}</span>
              Sources ({report.sources.length})
            </a>
          </li>
          {report.metadata && (
            <li>
              <a href="#methodologie" className="toc-link"
                onClick={(e) => {
                  e.preventDefault();
                  toggle(SECTION_METHODOLOGY);
                  setTimeout(() => scrollTo('methodologie'), 50);
                }}>
                <span className="toc-toggle-indicator">{openSections.has(SECTION_METHODOLOGY) ? '▼' : '▶'}</span>
                Méthodologie
              </a>
            </li>
          )}
        </ul>
      </nav>

      {/* ── Contenu du rapport (sections pliables) ── */}
      <div className="report-body">
        {contentSections.map((section, i) => (
          <article
            key={i}
            id={`section-${i}`}
            className={`report-section collapsible ${openSections.has(i) ? 'open' : 'closed'}`}
          >
            <div className="collapsible-header" onClick={() => toggle(i)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(i); }}>
              <h2 className="collapsible-title">{section.title}</h2>
              <span className={`collapsible-chevron ${openSections.has(i) ? 'open' : ''}`}>
                ▼
              </span>
            </div>
            {openSections.has(i) && (
              <div className="collapsible-body">
                {section.content.split('\n').filter(Boolean).map((line, j) => (
                  <p key={j} className="section-paragraph">
                    {renderText(line, report.sources)}
                  </p>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* ── Méthodologie (pliée par défaut, mais suit le toggle général) ── */}
      {report.metadata && (
        <section
          id="methodologie"
          className={`report-section collapsible methodology-section ${openSections.has(SECTION_METHODOLOGY) ? 'open' : 'closed'}`}
        >
          <div className="collapsible-header" onClick={() => toggle(SECTION_METHODOLOGY)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(SECTION_METHODOLOGY); }}>
            <span className="section-icon">⚙️</span>
            <h2 className="collapsible-title">Méthodologie</h2>
            <span className={`collapsible-chevron ${openSections.has(SECTION_METHODOLOGY) ? 'open' : ''}`}>
              ▼
            </span>
          </div>

          {openSections.has(SECTION_METHODOLOGY) && (
            <div className="collapsible-body">
              <p className="methodology-intro">
                Ce rapport a été généré par un pipeline agentique en <strong>{report.metadata.iterations} itération(s)</strong>{' '}
                et <strong>{report.metadata.totalQueries} requêtes web</strong> via l'API OpenAI Responses.
              </p>

              <div className="methodology-grid">
                <div className="methodology-card">
                  <h4>📋 Plan de recherche</h4>
                  <ul>
                    {report.metadata.planning.axes.map((axe, i) => (
                      <li key={i}>{axe}</li>
                    ))}
                  </ul>
                </div>

                {report.metadata.planning.motsCles.length > 0 && (
                  <div className="methodology-card">
                    <h4>🔑 Mots-clés</h4>
                    <div className="keywords">
                      {report.metadata.planning.motsCles.map((kw, i) => (
                        <span key={i} className="keyword-tag">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <p className="methodology-footnote">
                Le moteur a planifié la recherche, exécuté les requêtes web, évalué la couverture,
                et itéré sur les lacunes jusqu'à obtenir un ensemble de sources suffisant
                avant de synthétiser le rapport final.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Sources (pliables) ── */}
      {report.sources.length > 0 && (
        <section
          id="sources"
          className={`report-section collapsible sources-section ${openSections.has(SECTION_SOURCES) ? 'open' : 'closed'}`}
        >
          <div className="collapsible-header" onClick={() => toggle(SECTION_SOURCES)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(SECTION_SOURCES); }}>
            <span className="section-icon">🔗</span>
            <h2 className="collapsible-title">
              Sources <span className="sources-count">{report.sources.length}</span>
            </h2>
            <span className={`collapsible-chevron ${openSections.has(SECTION_SOURCES) ? 'open' : ''}`}>
              ▼
            </span>
          </div>

          {openSections.has(SECTION_SOURCES) && (
            <div className="collapsible-body">
              <div className="sources-grid">
                {report.sources.map((source, i) => (
                  <div key={i} id={`source-${i + 1}`} className="source-card">
                    <div className="source-number">{i + 1}</div>
                    <div className="source-body">
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="source-title">
                        {source.title}
                      </a>
                      <span className="source-domain">{source.source}</span>
                      <p className="source-snippet">{source.snippet.slice(0, 200)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="report-footer">
        <p>Généré par <strong>DeepResearch Agent</strong></p>
        <a href="/" className="footer-link">← Nouvelle recherche</a>
      </footer>
    </main>
  );
}
