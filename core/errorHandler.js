// core/errorHandler.js
// Centrale Express foutafhandeling — laad als LAATSTE middleware in app.js.
// Vangt alle errors op die via next(err) worden doorgegeven.

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const bericht = err.message || 'Interne serverfout';

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${status}`);
    console.error(err.stack);
  }

  res.status(status).json({ success: false, error: bericht, status });
}

function nietGevonden(req, res) {
  res.status(404).json({ success: false, error: `Route niet gevonden: ${req.method} ${req.path}`, status: 404 });
}

module.exports = { errorHandler, nietGevonden };
