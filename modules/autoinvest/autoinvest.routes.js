// modules/autoinvest/autoinvest.routes.js

const express = require('express');
const { vereisLogin } = require('../../core/auth');
const { ok, fout } = require('../../core/response');
const {
  haalAutoInvestOverzichtOp,
  haalAutoInvestGroepOp,
  slaAutoInvestPlanOp,
  verwijderAutoInvestPlan,
  haalAutoInvestGeschiedenisOp,
  voerVerschuldigdePlannenUit,
} = require('./autoinvest.service');

const router = express.Router();

router.post('/run-due', async (req, res, next) => {
  try {
    const secret = process.env.AUTOINVEST_CRON_SECRET;
    if (!secret || req.headers['x-autoinvest-secret'] !== secret) {
      return res.status(403).json(fout('Niet toegestaan.', 403));
    }

    const data = await voerVerschuldigdePlannenUit({ bron: 'http-trigger' });
    res.json(ok(data));
  } catch (err) { next(err); }
});

router.use(vereisLogin);

router.get('/', async (req, res, next) => {
  try {
    const data = await haalAutoInvestOverzichtOp(req.gebruiker.id);
    res.json(ok(data));
  } catch (err) { next(err); }
});

router.get('/:groupId/history', async (req, res, next) => {
  try {
    const data = await haalAutoInvestGeschiedenisOp(req.gebruiker.id, req.params.groupId);
    res.json(ok(data));
  } catch (err) { next(err); }
});

router.get('/:groupId', async (req, res, next) => {
  try {
    const data = await haalAutoInvestGroepOp(req.gebruiker.id, req.params.groupId);
    res.json(ok(data));
  } catch (err) { next(err); }
});

router.post('/:groupId', async (req, res, next) => {
  try {
    const data = await slaAutoInvestPlanOp(req.gebruiker.id, req.params.groupId, req.body);
    res.status(201).json(ok(data, 201));
  } catch (err) { next(err); }
});

router.delete('/:groupId', async (req, res, next) => {
  try {
    const data = await verwijderAutoInvestPlan(req.gebruiker.id, req.params.groupId);
    res.json(ok(data));
  } catch (err) { next(err); }
});

module.exports = router;

