import { Router } from 'express';
import type { ReportRepository } from '../../domain/ports/Repository.js';

/**
 * Routes API REST pour les rapports.
 *
 * GET /api/r/:id → JSON du rapport
 * GET /api/health → Healthcheck
 */
export function createApiRouter(reportRepository: ReportRepository): Router {
  const router = Router();

  // ---------------------------------------------------------------
  // GET /api/r/:id — Retourne le rapport au format JSON
  // ---------------------------------------------------------------
  router.get('/r/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Valider le format de l'ID
      if (!id.startsWith('r_') || id.length < 4) {
        res.status(400).json({ error: 'Format d\'ID invalide' });
        return;
      }

      const report = await reportRepository.findById(id);

      if (!report) {
        res.status(404).json({ error: 'Rapport introuvable' });
        return;
      }

      res.json(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Erreur API /api/r/:id :', message);
      res.status(500).json({ error: 'Erreur interne' });
    }
  });

  // ---------------------------------------------------------------
  // GET /api/health — Healthcheck
  // ---------------------------------------------------------------
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return router;
}
