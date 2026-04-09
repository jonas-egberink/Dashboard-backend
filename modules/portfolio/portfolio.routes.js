// modules/portfolio/portfolio.routes.js
// Endpoint: GET /api/portfolio

const express                  = require('express');
const { vereisLogin }          = require('../../core/auth');
const { ok, fout }             = require('../../core/response');
const { berekenPortfolio }     = require('./portfolio.service');
const router                   = express.Router();

router.use(vereisLogin);

// GET /api/portfolio
router.get('/', async (req, res, next) => {
  try {
    const data = await berekenPortfolio(req.gebruiker.id);
    res.json(ok(data));
  } catch (err) { next(err); }
});

module.exports = router;
