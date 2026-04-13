// modules/autoinvest/autoinvest.scheduler.js

const cron = require('node-cron');
const { voerVerschuldigdePlannenUit } = require('./autoinvest.service');

let task = null;
let bezig = false;

function schedulerAan() {
  return String(process.env.AUTOINVEST_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false';
}

function runOnStartAan() {
  return String(process.env.AUTOINVEST_RUN_ON_START || 'true').toLowerCase() !== 'false';
}

async function runDueCheck(bron) {
  if (bezig) return null;
  bezig = true;
  try {
    const resultaat = await voerVerschuldigdePlannenUit({ bron });
    if (resultaat.uitgevoerd || resultaat.mislukt) {
      console.log(`[autoinvest] ${bron} resultaat:`, JSON.stringify(resultaat));
    }
    return resultaat;
  } catch (err) {
    console.error(`[autoinvest] ${bron} fout:`, err.message);
    return null;
  } finally {
    bezig = false;
  }
}

function startAutoInvestScheduler() {
  if (!schedulerAan() || task) return task;

  const expressie = process.env.AUTOINVEST_CRON || '*/10 * * * *';
  task = cron.schedule(expressie, () => runDueCheck('scheduler'), { timezone: 'Europe/Amsterdam' });

  console.log(`[autoinvest] Scheduler gestart met schema ${expressie}`);
  if (runOnStartAan()) {
    setImmediate(() => { runDueCheck('startup'); });
  }
  return task;
}

module.exports = { startAutoInvestScheduler };


