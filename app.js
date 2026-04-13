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
const nieuwsRouter      = require('./modules/nieuws/nieuws.routes');
const adviesRouter      = require('./modules/advies/advies.routes');
const autoinvestRouter  = require('./modules/autoinvest/autoinvest.routes');
// ─────────────────────────────────────────────────────────────

const app = express();

// Railway gebruikt een proxy — vertrouw de X-Forwarded-For header
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────
// Reflecteer request-origin zodat preflight niet op een serverfout eindigt.
// Veilig in combinatie met credentials: false.
const corsOptions = {
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── RATE LIMITING ─────────────────────────────────────────────
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Te veel verzoeken. Probeer later opnieuw.' },
}));
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
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
app.use('/api/paginas',     paginasRouter);
app.use('/api/nieuws',      nieuwsRouter);
app.use('/api/advies',      adviesRouter);
app.use('/api/autoinvest',  autoinvestRouter);
// ─────────────────────────────────────────────────────────────

// ── 404 & ERROR HANDLER ── altijd als laatste ─────────────────
app.use(nietGevonden);
app.use(errorHandler);

module.exports = app;
