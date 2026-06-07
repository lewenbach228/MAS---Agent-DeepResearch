# DeepResearch Agent

Un **agent de recherche autonome** accessible via Discord avec **recommandations personnalisées d'outils IA**.

- `/analyze "marché des agents IA en France"` → rapport structuré avec sources
- `/veille` → classement des catégories d'outils IA selon ton profil (0-100)
- `/profil` → configure ton secteur, stack, priorités pour des recommandations sur mesure

---

## Architecture

```
┌──────────┐     ┌────────────────────┐     ┌──────────────────────┐
│ Discord  │ ──► │  Backend Node.js   │ ──► │  OpenAI (BYOK)       │
│ /analyze │     │  + Express          │     │  - Responses API     │
│ /veille  │     │                     │     │  - Chat Completions  │
│ /profil  │     │  AgentEngine        │     │                      │
│ /setkey  │     │  UtilityScorer ◄────┼─────┤  - gpt-4o-mini       │
└──────────┘     │  NicheLoader        │     └──────────────────────┘
                 │  AiToolLoader       │
                 │  ScoreRepository    │     ┌──────────────────────┐
                 └─────────┬──────────┘     │  Frontend React/Vite │
                           │                 │  - /r/:id (rapports) │
                     ┌─────▼─────┐           │  - Landing page      │
                     │  SQLite   │           └──────────────────────┘
                     │ - reports │
                     │ - users   │
                     │ - scores  │
                     └───────────┘
```

## Stack technique

| Couche | Technologie |
|--------|------------|
| Bot Discord | discord.js (slash commands, threads, embeds) |
| Backend | Node.js + TypeScript + Express |
| Agent Engine | Fetch natif → OpenAI Responses API (web_search tool) |
| Base de données | SQLite via better-sqlite3 |
| Architecture | Clean architecture (domain / services / infrastructure / presentation) |
| BYOK | Chaque utilisateur utilise sa propre clé OpenAI |
| Cache scoring | Table `profile_scores` avec invalidation automatique |
| Niches recherche | Fichiers JSON dans `backend/niches/` |
| Catégories AI Tools | Fichiers JSON dans `backend/niches/ai-tools/` |
| Frontend rapports | React + Vite (page rapport avec sections pliables, citations, sources) |

## Commandes Discord

| Commande | Description | Vérrou |
|----------|-------------|--------|
| `/setkey clé:sk-xxx` | Configure ta clé OpenAI (BYOK) | — |
| `/profil secteur:tech stack:React,Node` | Configure ton profil métier | — |
| `/veille` | Classement des 6 catégories AI Tools selon ton profil | Clé + profil requis |
| `/analyze sujet:...` | Lance une analyse de marché complète | Clé requise |
| `/historique` | Liste tes 10 dernières recherches | — |
| `/niches` | Liste les niches disponibles | — |

## Types d'agents IA couverts

Ce projet illustre l'architecture **Utility-based Agent** (Russell & Norvig) :

1. **But (Goal)** : répondre à une question de marché avec `/analyze`
2. **Utilité (Utility)** : classer les catégories d'outils IA par pertinence via `/veille`
3. **Apprentissage** : le LLM évalue le matching (pas de règles hardcodées)

## Prérequis

- Node.js >= 18
- Un token et client ID Discord bot
- Une clé API OpenAI (chaque utilisateur peut utiliser la sienne)

## Installation

```bash
# Frontend
npm install

# Backend
cd backend && npm install
```

### Variables d'environnement

```env
# Obligatoire pour le bot
DISCORD_TOKEN=ton_token_discord
DISCORD_CLIENT_ID=ton_client_id

# Optionnel (BYOK : chaque utilisateur met sa clé via /setkey)
OPENAI_API_KEY=

# Optionnel
GUILD_ID=id_du_serveur          # Commandes instantanées
PORT=3000
BASE_URL=http://localhost:3000
```

## Développement

```bash
# Backend + Bot Discord (dans un terminal)
cd backend && npm run dev

# Frontend (dans un autre terminal, si tu modifies le React)
npm run dev

# Tests unitaires
cd backend && npm test

# Test d'intégration local (sans Discord, 54 tests)
cd backend && npm run test:local
```

## Project structure

```
├── backend/
│   ├── src/
│   │   ├── domain/
│   │   │   ├── entities/       # User, Report, NicheConfig, AiToolCategory, ProfileScore
│   │   │   └── ports/          # LLMProvider, UserRepository, ScoreRepository, AiToolLoader
│   │   ├── services/
│   │   │   ├── agent/          # AgentEngine (pipeline 5 étapes)
│   │   │   ├── scorer/         # UtilityScorer (appel LLM pour scoring)
│   │   │   ├── openai/         # OpenAIService + withApiKey()
│   │   │   ├── niche-loader/   # Chargement niches JSON
│   │   │   └── ai-tools/       # Chargement catégories AI Tools
│   │   ├── infrastructure/
│   │   │   ├── database/       # SQLite + migrations
│   │   │   └── repositories/   # User, Report, Score repositories
│   │   └── presentation/
│   │       └── discord/commands/  # analyze, setkey, profil, veille, niches, historique
│   ├── niches/
│   │   ├── market-intelligence.json    # Niche de recherche
│   │   ├── reconversion-professionnelle.json
│   │   └── ai-tools/                  # 6 catégories AI Tools
│   └── scripts/
│       ├── test-local.ts      # Test d'intégration (54 tests)
│       └── demo-e2e.ts        # Démonstration complète
├── src/                       # Frontend React/Vite
└── .env.example
```

## Système de recommandation (Utility-based)

1. L'utilisateur configure son profil : `secteur`, `stack`, `priorités`, `budget`, `contraintes`
2. `/veille` appelle le LLM avec le profil + la description de chaque catégorie
3. Le LLM retourne un score 0-100 avec justification et outils recommandés
4. Les scores sont mis en cache tant que le profil ne change pas

## Licence

MIT
