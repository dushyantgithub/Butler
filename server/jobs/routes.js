import express from 'express';
import { z } from 'zod';

export function jobRoutes(worker) {
  const router = express.Router();
  router.get('/', (req, res) => res.json(worker.state()));
  router.put('/preferences', (req, res) => res.json(worker.savePreferences(req.body)));
  router.post('/resume', async (req, res) =>
    res.json(
      await worker.upload(
        z
          .object({ name: z.string().max(250), base64: z.string().max(7_000_000) })
          .strict()
          .parse(req.body),
      ),
    ),
  );
  router.get('/resume/download', (req, res) => {
    const resume = worker.resume();
    if (!resume) return res.status(404).json({ error: 'Upload a résumé first.' });
    res.setHeader('Content-Disposition', `attachment; filename="${resume.name}"`);
    res.type(resume.mime).send(resume.data);
  });
  router.post('/portal-preview', async (req, res) => {
    const { url } = z
      .object({ url: z.string().url().max(2000) })
      .strict()
      .parse(req.body);
    res.json(await worker.previewListing(url));
  });
  router.post('/import', (req, res) => res.json(worker.importListing(req.body)));
  router.post('/search', (req, res) => {
    worker.search();
    res.status(202).json({ ok: true });
  });
  router.post('/queue', (req, res) => {
    worker.queue(
      z
        .object({ ids: z.array(z.string().max(64)).min(1).max(30) })
        .strict()
        .parse(req.body).ids,
    );
    res.status(202).json({ ok: true });
  });
  router.post('/stop', (req, res) => {
    worker.stop();
    res.json({ ok: true });
  });
  router.post('/:id/review', (req, res) => {
    worker.review(req.params.id);
    res.status(202).json({ ok: true });
  });
  router.post('/:id/resolve', (req, res) => {
    worker.resolve(
      req.params.id,
      z
        .object({ outcome: z.enum(['submitted', 'not_submitted', 'skipped']) })
        .strict()
        .parse(req.body).outcome,
    );
    res.json({ ok: true });
  });
  router.delete('/', (req, res) => {
    worker.clear();
    res.json({ ok: true });
  });
  return router;
}
