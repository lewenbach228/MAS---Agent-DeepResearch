# DeepResearch Agent — Agent de recherche et veille sur mesure

Un **agent de recherche autonome** accessible via Discord avec **analyses de marché** et **veille personnalisée**. Configure ton profil d'entreprise, lance des recherches approfondies avec une simple commande `/analyze`, ou obtiens un rapport de veille sur mesure via `/veille`. Le bot gère la planification, recherche, évaluation et synthèse en temps réel.

**Code source :** [github.com/lewenbach228/MAS---Agent-DeepResearch](https://github.com/lewenbach228/MAS---Agent-DeepResearch)

---

## Architecture

```
┌──────────┐     ┌────────────────────┐     ┌──────────────────────┐
│ Discord  │ ──► │  Backend Node.js   │ ──► │  OpenAI (BYOK)       │
│ /analyze │     │  + Express          │     │  - Responses API     │
│ /veille  │     │                     │     │  - Chat Completions  │
│ /profil  │     │  AgentEngine        │     │                      │
│ /setkey  │     │  NicheLoader        │     │  - gpt-4o-mini       │
└──────────┘     └─────────┬──────────┘     └──────────────────────┘
                           │                 ┌──────────────────────┐
                     ┌─────▼─────┐           │  Frontend React/Vite │
                     │  SQLite   │ ────────► │  - /r/:id (rapports) │
                     │ - reports │           │  - Landing page      │
                     │ - users   │           └──────────────────────┘
                     └───────────┘
```

---

## How It Works

### Pipeline de recherche (`/analyze`)

L'agent exécute un workflow de recherche autonome en plusieurs étapes :
1. **Planification** : Le LLM décompose le sujet en axes de recherche et mots-clés.
2. **Recherche** : L'agent lance des recherches web ciblées pour chaque axe et extrait le contenu pertinent.
3. **Évaluation** : L'agent évalue la complétude des informations recueillies par rapport au sujet.
4. **Raffinement** : S'il y a des lacunes, l'agent formule de nouvelles requêtes et boucle (jusqu'à la limite configurée).
5. **Synthèse** : Le LLM produit le rapport final structuré avec citations et sources.

### Veille personnalisée (`/veille`)

L'agent adapte la recherche de veille au profil de l'utilisateur :
1. L'utilisateur configure son secteur, sa stack et ses priorités via `/profil`.
2. Lors de la commande `/veille`, le système utilise ce profil pour guider la planification des axes et pondérer l'importance des sources.
3. Le rapport final propose des recommandations personnalisées directement actionnables selon le profil de l'utilisateur.

---

## Stack technique

| Couche | Technologie | Usage |
|--------|------------|-------|
| **Interface** | Discord.js | Interface utilisateur, slash commands, threads, embeds de progression |
| **Backend** | Node.js + TypeScript + Express | Serveur API, point d'entrée du bot, service de rapports |
| **Agent Engine** | OpenAI Responses API | Planification, évaluation de couverture, synthèse |
| **Base de données** | SQLite via better-sqlite3 | Persistance des utilisateurs, profils et rapports |
| **BYOK** | OpenAI API Key personnelle | Chaque utilisateur fournit sa propre clé OpenAI via `/setkey` |
| **Frontend** | React 18 + Vite | Visualisation web des rapports de recherche |

---

## Quick Start

### 1. Installer les dépendances

```bash
# Frontend
npm install

# Backend
cd backend && npm install
```

### 2. Configuration

Copier le fichier `.env.example` en `.env` dans le dossier `backend` et renseigner les clés obligatoires :

```env
DISCORD_TOKEN=ton_token_discord
DISCORD_CLIENT_ID=ton_client_id
PORT=3000
BASE_URL=http://localhost:3000
```

### 3. Lancer l'application

```bash
# Démarrer le frontend (dans un terminal)
npm run dev

# Démarrer le backend (dans un autre terminal)
npm start
```

### 4. Lancer les tests

```bash
# Tests backend
cd backend && npm test
```

---

## Ce que ça prouve

### Compétences agentiques

| Compétence | Comment |
|------------|---------|
| **Pipeline agentique réel** | Planification → Recherche → Évaluation → Itération → Synthèse |
| **Profil & fonction d'utilité** | Adaptation dynamique de la recherche technologique selon le profil utilisateur |
| **BYOK (Bring Your Own Key)** | Modèle économique d'agent décentralisé, chaque utilisateur apporte son crédit OpenAI |
| **Progression temps réel** | Notifications et embeds d'étapes dans les fils Discord (threads) |
| **Clean Architecture** | Séparation claire (Domain / Services / Infrastructure / Presentation) |
| **Rapports web interactifs** | Visualisation web des résultats avec sections repliables, citations et sources cliquables |
