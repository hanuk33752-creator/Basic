import { Router } from 'express';
import * as repo from '../repo.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ packs: repo.listPacks(), active: repo.getActivePack() ?? null });
});

router.post('/', (req, res) => {
  const name = (req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: '팩 이름이 필요합니다.' });
  if (repo.listPacks().some((p) => p.name === name)) {
    return res.status(409).json({ error: '같은 이름의 팩이 이미 있습니다.' });
  }
  res.status(201).json(repo.createPack(name, { activate: !!req.body?.activate }));
});

router.post('/:packId/activate', (req, res) => {
  const pack = repo.activatePack(Number(req.params.packId));
  if (!pack) return res.status(404).json({ error: '팩을 찾을 수 없습니다.' });
  res.json(pack);
});

router.delete('/:packId', (req, res) => {
  const pack = repo.deletePack(Number(req.params.packId));
  if (!pack) return res.status(404).json({ error: '팩을 찾을 수 없습니다.' });
  res.json({ deleted: pack.pack_id });
});

export default router;
