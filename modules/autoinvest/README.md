# Auto-Invest

Deze module voegt een modulaire Auto-Invest simulatie toe bovenop de bestaande Supabase-tabellen voor `aandelen` en `transacties`.

## Wat deze feature doet

- 1 plan per `rekening`/groep
- maandbedrag in elke ondersteunde valuta (bijv. EUR/USD/GBP)
- uitvoeringsdag per maand
- allocaties per aandeel binnen de groep
- niet elk aandeel uit de groep hoeft in de allocatie te zitten
- actief / gepauzeerd
- start- en optionele einddatum
- uitvoeringshistorie in Supabase
- bij uitvoering worden gewone `Buy`-transacties toegevoegd aan `transacties`
- uitvoering gebruikt per aandeel de valuta van de laatste transactie (fallback: aandeelvaluta)

## Benodigde migratie

Voer eerst `models/migratie_autoinvest.sql` uit in Supabase.

## Relevante endpoints

- `GET /api/autoinvest`
- `GET /api/autoinvest/:groupId`
- `POST /api/autoinvest/:groupId`
- `DELETE /api/autoinvest/:groupId`
- `GET /api/autoinvest/:groupId/history`
- `POST /api/autoinvest/run-due` (secret header vereist)

## Scheduler

De backend start automatisch een cron-task via `node-cron`.
Dat gebeurt in de backend zelf zodra `bin/www` online komt — dus **zonder** dat je de website hoeft te openen of handmatig iets hoeft te doen in de frontend.

Concreet betekent dit:

- zolang je backendproces online draait, controleert Auto-Invest automatisch op verschuldigde plannen;
- bij elke backend-start wordt ook direct één startup-check gedaan, zodat een verschuldigde run niet hoeft te wachten op de eerstvolgende cron-tick;
- de frontend op Netlify is hiervoor niet nodig.

Environment variabelen:

- `AUTOINVEST_SCHEDULER_ENABLED=true|false`
- `AUTOINVEST_CRON=*/10 * * * *`
- `AUTOINVEST_RUN_ON_START=true|false`
- `AUTOINVEST_CRON_SECRET=<sterk geheim>`

## Netlify / serverless opmerking

Als je frontend op Netlify draait maar de scheduler niet in een persistente Node-process draait, kun je een geplande Netlify job of andere scheduler laten posten naar:

`POST /api/autoinvest/run-due`

met header:

`x-autoinvest-secret: <AUTOINVEST_CRON_SECRET>`

Zo blijft de uitvoeringslogica op één plek in de backend.



