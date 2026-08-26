import { Router } from 'express';
import * as repo from '../repo.js';

const router = Router();

router.get('/', (req, res) => {
  const packs = repo.listPacks();
  // active 도 question_count 가 붙은 목록 항목을 그대로 돌려준다.
  res.json({ packs, active: packs.find((p) => p.is_active) ?? null });
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
