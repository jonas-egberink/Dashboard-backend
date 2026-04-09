// app.js — Express configuratie
// Om een nieuwe module toe te voegen:
//   1. Maak modules/jouwmodule/jouwmodule.routes.js aan
//   2. Voeg één require + app.use regel toe hieronder
// Verder hoef je niets aan te raken.

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const logger     = require('morgan');
const rateLimit  = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const { errorHandler, nietGevonden } = require('./core/errorHandler');

// ── MODULES ── voeg hier nieuwe modules toe ──────────────────
const authRouter        = require('./modules/auth/auth.routes');
const portfolioRouter   = require('./modules/portfolio/portfolio.routes');
const transactiesRouter = require('./modules/transacties/transacties.routes');
const aandelenRouter    = require('./modules/aandelen/aandelen.routes');
const paginasRouter     = require('./modules/paginas/paginas.routes');
// ─────────────────────────────────────────────────────────────

const app = express();

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Niet toegestaan door CORS'));
  },
  credentials: true,
}));

// ── RATE LIMITING ─────────────────────────────────────────────
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Te veel verzoeken. Probeer later opnieuw.' },
}));
app.use('/api', rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
}));

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// ── ROUTES ── voeg hier nieuwe routes toe ────────────────────
app.use('/api/auth',        authRouter);
app.use('/api/portfolio',   portfolioRouter);
app.use('/api/transacties', transactiesRouter);
app.use('/api/aandelen',    aandelenRouter);
app.use('/api/paginas',    paginasRouter);
// ─────────────────────────────────────────────────────────────

// ── 404 & ERROR HANDLER ── altijd als laatste ─────────────────
app.use(nietGevonden);
app.use(errorHandler);

module.exports = app;
