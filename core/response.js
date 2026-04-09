// core/response.js
// Standaard response helpers — elke module geeft dezelfde JSON structuur terug.
// Gebruik: const { ok, fout } = require('../../core/response');
//
// Voorbeelden:
//   res.json(ok(data))                     → { success: true, data: ... }
//   res.status(400).json(fout('Bericht'))  → { success: false, error: '...' }
//   res.status(201).json(ok(item, 201))    → { success: true, data: ..., status: 201 }

function ok(data = null, status = 200) {
  return { success: true, data, status };
}

function fout(bericht = 'Er is een fout opgetreden', status = 500) {
  return { success: false, error: bericht, status };
}

module.exports = { ok, fout };
