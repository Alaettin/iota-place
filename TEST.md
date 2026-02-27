# IOTA Place — Test-Dokumentation

## Setup

**Framework:** Vitest (TS-nativ, esbuild-basiert)

**Dependencies:**
- `vitest` — Test-Runner
- `supertest` + `@types/supertest` — HTTP-Endpoint-Tests (fuer spaetere API-Tests)

**Konfiguration:** `server/vitest.config.ts`, `client/vitest.config.ts`

## Tests ausfuehren

```bash
# --- Server-Tests ---
cd server

# Alle Tests einmalig
npm test

# Watch-Modus (re-run bei Datei-Aenderungen)
npm run test:watch

# Nur Unit-Tests (ohne Docker-Abhaengigkeiten)
npm run test:unit

# Nur Integration-Tests (braucht laufende Docker-Container)
npm run test:integration

# --- Client-Tests ---
cd client

# Alle Tests einmalig
npm test

# Watch-Modus
npm run test:watch
```

## Test-Dateien

| Datei | Kategorie | Tests | Beschreibung |
|-------|-----------|-------|-------------|
| `src/__tests__/singleton.test.ts` | Singleton-Integritaet | 6 | Validiert globalThis-Fix fuer CJS/ESM Dual-Module-Bug |
| `src/services/canvas.service.test.ts` | Canvas Service | 37 | Kern-Domaenenlogik: setPixel, getPixel, Bounds, Reset+Dimensions, PNG, Occupancy, Resize, AutoExpand |
| `src/services/payment/mock-payment.service.test.ts` | Payment Service | 17 | Wallet-Lifecycle: Connect, Balance, Payment, Funds |
| `src/services/pricing.service.test.ts` | Pricing Service | 5 | Preisberechnung: Basis, Overwrite-Eskalation, Rundung |
| `src/__tests__/flush-pipeline.integration.test.ts` | Flush-Pipeline | 11 | Redis→PostgreSQL Flush: Dirty Pixels, Season-Stats, Rollback |
| `src/services/season.service.test.ts` | Season Service | 16 | Season-Lifecycle: Start, End, Load, GetAll, GetById |
| `src/routes/canvas.routes.test.ts` | Canvas Routes | 15 | GET/POST Endpoints: Canvas, Pixel, Config, Placement, Shield-Integration |
| `src/routes/wallet.routes.test.ts` | Wallet Routes | 7 | Connect, Me, Balance, Faucet |
| `src/routes/leaderboard.routes.test.ts` | Leaderboard Routes | 8 | All-Time, Season, Stats |
| `src/services/powerup.service.test.ts` | Power-Up Service | 26 | Katalog, Kauf, Shield-Aktivierung, Ablauf, Cleanup, Stats |
| `src/routes/powerup.routes.test.ts` | Power-Up Routes | 13 | Catalog, Purchase, Inventory, Activate, Shields |
| `src/middleware/wallet-auth.test.ts` | Wallet-Auth Middleware | 7 | Bearer-Token Auth, 401/403 Checks, X-Wallet-Id Fallback rejected, Banned wallet |
| `src/middleware/rate-limit.test.ts` | Rate-Limit Middleware | 5 | Bearer-Token-based wallet ID, 5-Request-Window, 429, Reset |
| `src/ws/socket.test.ts` | WebSocket Broadcasts | 16 | Alle Broadcast-Funktionen inkl. Resize, Shield, Binary-Format, No-Op bei null |

**Server-Gesamt: 198 Tests**

---

## Client-Tests

**Framework:** Vitest + happy-dom + @testing-library/react

**Ausfuehren:** `cd client && npm test`

| Datei | Kategorie | Tests | Beschreibung |
|-------|-----------|-------|-------------|
| `src/components/LegalPages.test.tsx` | Legal Modal | 8 | Render (null, 3 Seiten), Close-Button, Backdrop-Click, Content-Click, Env-Fallback |
| `src/components/CookieBanner.test.tsx` | Cookie Banner | 3 | Banner-Text, Accept-Callback, Learn-more-Callback |
| `src/components/Footer.test.tsx` | Footer | 4 | Alle Links sichtbar, 3 onClick-Callbacks |
| `src/components/PowerUpShop.test.tsx` | Power-Up Shop | 8 | Render, Katalog, Buy-Button-States, Close, Active Shields |

**Client-Gesamt: 23 Tests**

**Projekt-Gesamt: 221 Tests (198 Server + 23 Client)**

---

## Server-Test-Kategorien

### 1. Singleton-Integritaet (Prio 1)

Regression-Guard fuer den kritischen Bug, bei dem `tsx` zwei separate Modul-Instanzen erzeugt hat (dynamisches `import()` vs statisches `import`). Fix: alle Singletons auf `globalThis`.

**Was wird getestet:**
- `canvasService`, `paymentService`, `seasonService` — Referenzgleichheit bei statischem und dynamischem Import
- State-Sharing: Pixel via Import A setzen, via Import B lesen
- Alle `globalThis.__iota*` Keys vorhanden nach Import
- `getPool()` / `getRedis()` konsistent

### 2. Canvas Service (Prio 2)

Unit-Tests fuer die zentrale Canvas-Logik. Kein Redis/PostgreSQL noetig — eigene `CanvasService`-Instanz mit 10x10 Config.

**Was wird getestet:**
- `setPixel`: Korrekte Daten, colorBuffer-Index, overwriteCount-Inkrement
- Bounds-Checks: x/y < 0, x/y >= width/height → null
- Color-Validierung: < 0 und >= colorCount → null, Randwerte 0 und 31 ok
- `getPixel`: Gesetzter Pixel mit Metadata, Default-Werte fuer unberuehrte Pixel
- `getFullCanvas`: Buffer-Laenge, Initial alles Null
- `resetCanvas`: colorBuffer und metadata geleert, Dimensionen auf 250x250 zurueckgesetzt (auch von 500x500)
- `isPaused`/`setPaused`: Toggle
- `generateSnapshotPng`: PNG-Magic-Bytes (`\x89PNG`)
- `getConfig`: Gibt Config zurueck

**Canvas Growth Tests (14 zusaetzliche Tests):**
- `getOccupancy`: 0% fuer leeren Canvas, korrekte Zaehlung, 100% fuer vollen Canvas
- `resize`: Buffer waechst (250→500), alte Pixel bleiben, Metadata bleibt, kein Shrink (Fehler), ungueltige Groesse (Fehler), No-Op bei gleicher Groesse, neue Flaeche ist 0
- `checkAutoExpand`: Kein Trigger bei <80%, kein Trigger wenn paused, kein Trigger bei Max (1000), Trigger bei ≥80%

**Mocks:** `db/redis` (alle Funktionen → null/void), `db/pool` (getPool → null), `ws/socket` (broadcastCanvasResize → no-op)

### 3. Payment Service (Prio 3)

Unit-Tests fuer `MockPaymentService` — rein in-memory, kein DB-Zugriff.

**Was wird getestet:**
- `connectWallet`: Neues Wallet (Balance 100), Idempotenz, Custom/Default displayName
- `getBalance`: Korrekter Wert, 0 fuer unbekanntes Wallet
- `getWallet`: Info fuer bekanntes Wallet, null fuer unbekanntes
- `processPayment`: Balance-Abzug, Stats-Update, INSUFFICIENT_BALANCE, WALLET_NOT_FOUND, pixelCount-Inkrement
- `addFunds`: Balance-Erhoehung, Fehler bei unbekanntem Wallet
- `getAllWallets`: Gibt alle Wallets zurueck
- `isWalletBanned`: false fuer normales/unbekanntes Wallet

**Mocks:** `wallet-db` (upsert/update → no-op, loadWallets → leere Maps)

### 4. Pricing Service (Prio 4)

Unit-Tests fuer die Preisformel `basePrice * priceFactor^n` (n = overwriteCount+1 wenn belegt, sonst 0).

**Was wird getestet:**
- Unbesetztes Pixel → 0.2 (Basis-Preis)
- 1. Ueberschreibung (owned, overwriteCount=0) → 0.24
- 2. Ueberschreibung (overwriteCount=1) → 0.288
- Nach 10 Overwrites → 0.2 * 1.2^11
- Rundung auf 4 Dezimalstellen
- Null-Pixel (out of bounds) → Basis-Preis

**Mocks:** `canvasService.getPixel()` mit kontrolliertem overwriteCount

## Refactorings fuer Testbarkeit

Zwei kleine Aenderungen wurden gemacht um Tests zu ermoeglichen:

1. **`CanvasService` Klasse exportiert** (`canvas.service.ts`)
   - `export class CanvasService { ... }` statt `class CanvasService { ... }`
   - Tests koennen eigene Instanzen mit Custom-Config (z.B. 10x10) erzeugen
   - Singleton-Export bleibt unveraendert

2. **`flushOnce()` extrahiert** (`flush.service.ts`)
   - Flush-Logik aus dem `setInterval`-Callback in eigene Funktion verschoben
   - `export async function flushOnce(): Promise<number>`
   - Integration-Tests koennen einen Flush-Zyklus direkt triggern

### 5. Flush-Pipeline (Prio 5)

Unit-Tests fuer `flushOnce()` — die Redis→PostgreSQL Flush-Logik. Mocked Redis + PostgreSQL.

**Was wird getestet:**
- 0 dirty Pixels → kein DB-Connect
- 1 dirty Pixel → korrekter INSERT pixels + INSERT pixel_history + COMMIT
- 3 dirty Pixels → alle geflusht
- Pixel ohne Metadata → uebersprungen
- Season aktiv → `season_id` in pixel_history, `wallet_season_stats` Upsert
- Admin-Wallet → kein `wallet_season_stats` Eintrag
- DB-Fehler → ROLLBACK, return 0, dirty set nicht geleert
- Pool null → return 0
- `startFlushService`/`stopFlushService` Timer-Lifecycle

**Mocks:** `db/pool` (mockPool mit connect/query/release), `db/redis` (getDirtyPixels, getPixelMeta, clearDirtyPixels), `seasonService` (getActiveSeasonId)

### 6. Season Service (Prio 6)

Unit-Tests fuer `SeasonService` — Season-Lifecycle. Mocked PostgreSQL Pool.

**Was wird getestet:**
- `getActiveSeason`/`getActiveSeasonId`: null ohne geladene Season
- `loadFromDb`: Aktive Season laden, keine Season → null, DB-Fehler → graceful, Pool null → noop
- `startSeason`: INSERT + UPDATE canvas_config, Fehler bei aktiver Season, Fehler bei null Pool
- `endSeason`: UPDATE seasons + canvas_config, Fehler ohne aktive Season, Fehler bei null Pool
- `getAllSeasons`: SELECT ORDER BY, leeres Array bei null Pool
- `getSeasonById`: Gefunden, nicht gefunden, null Pool

**Mocks:** `db/pool` (mockPool mit query)

### 7. API Routes (Prio 7)

Supertest-basierte HTTP-Tests gegen gemountete Express-Routes. Alle Services gemockt.

**Canvas Routes (15 Tests):**
- `GET /api/canvas` → Binary Buffer, Content-Type octet-stream
- `GET /api/canvas/pixel/:x/:y` → Pixel-Info + Preis + Shield-Info, 400 bei Out-of-Bounds
- `GET /api/canvas/price/:x/:y` → Preis fuer Pixel
- `GET /api/canvas/config` → Canvas-Config + Palette + Season
- `POST /api/canvas/pixel` → Placement (200), Paused (503), Shielded (403), Invalid Params (400), Invalid Color (400), Payment-Fail (402), Out-of-Bounds (400)
- `GET /api/canvas/pixel/:x/:y/history` → Leere History ohne Pool
- Shield-Integration: 403 bei Shield, Shield-Info in Pixel-Response

**Wallet Routes (7 Tests):**
- `POST /api/wallet/connect` → Neues Wallet erstellen, mit Adresse
- `GET /api/wallet/me` → Wallet-Info, 401 ohne Header, 404 unbekannt
- `GET /api/wallet/balance` → Balance
- `POST /api/wallet/faucet` → +50 Tokens

**Leaderboard Routes (8 Tests):**
- `GET /api/leaderboard` → Sortiert nach Pixels (default) oder Spent
- Filtert Wallets mit 0 Activity, respektiert Limit, Cap bei 100
- `GET /api/leaderboard/season/:id` → Leer ohne Pool, 400 bei ungueltigem ID
- `GET /api/stats` → Globale Stats (Placements, Wallets, Spent, Canvas-Size)

**Power-Up Routes (13 Tests):**
- `GET /api/powerups/catalog` → Katalog mit Shield
- `POST /api/powerups/purchase` → Kauf (200), Auth (401), Invalid Params (400), Insufficient Balance (402), Unknown Power-Up (400)
- `GET /api/powerups/inventory` → Inventar, Auth (401)
- `POST /api/powerups/activate` → Aktivierung (200), Auth (401), Invalid Params (400), Fehler (NOT_YOUR_PIXEL etc.)
- `GET /api/powerups/shields` → Aktive Shields

**Mocks:** canvasService, paymentService, pricingService, seasonService, powerUpService, broadcastPixelUpdate, walletAuth (pass-through), rateLimit (pass-through)

### 8. Middleware (Prio 8)

**Wallet-Auth (7 Tests):**
- Kein Authorization Header → 401 WALLET_NOT_CONNECTED
- Ungueltiger Bearer-Token → 401 WALLET_NOT_CONNECTED
- Unbekanntes Wallet → 401 WALLET_NOT_FOUND
- Gueltiges Wallet → next() + walletId auf Request gesetzt
- walletId korrekt aus Token extrahiert
- X-Wallet-Id Header ohne Bearer → 401 (Fallback entfernt)
- Gebanntes Wallet → 403 WALLET_BANNED

**Rate-Limit (5 Tests):**
- Erster Request → 200
- 5 Requests innerhalb Window → alle 200
- 6. Request → 429 RATE_LIMITED mit retryAfter
- Verschiedene Wallets → separate Counter
- Nach Window-Ablauf (10s) → Counter reset

**Mocks:** paymentService.getWallet/isWalletBanned, verifyToken (wallet-auth); verifyToken (rate-limit)

### 9. WebSocket Broadcasts (Prio 9)

Direkte Unit-Tests fuer alle Broadcast-Funktionen. Mock-Server via globalThis.

**No-Op bei null (7 Tests):** Alle 6 Broadcast-Funktionen + getIO sind safe wenn kein Server initialisiert

**Mit Server (9 Tests):**
- `broadcastPixelUpdate` → 5-Byte-Buffer korrekt kodiert (UInt16BE x/y, UInt8 color)
- `broadcastPixelUpdate` → Max-Koordinaten (249,249,31) korrekt
- `broadcastUserCount` → engine.clientsCount
- `broadcastPause` → true/false
- `broadcastSeasonChange` → Season-Objekt oder null
- `broadcastCanvasReset` → Event emittiert
- `broadcastCanvasResize` → width/height Objekt emittiert
- `getIO` → Server-Referenz

**Mocks:** globalThis.__iotaSocketIO mit mockEmit

### 10. Power-Up Service (Prio 10)

Unit-Tests fuer `PowerUpService` — Shield-Kauf und -Aktivierung. Eigene Service-Instanz pro Test.

**Was wird getestet:**
- `getCatalog`: Shield vorhanden mit korrekten Daten (Preis 2 IOTA, Dauer 3600s)
- `getCatalogItem`: Shield per ID, unbekannte ID → undefined
- `purchase`: Balance-Abzug, unbekanntes Power-Up, Wallet nicht gefunden, Wallet gebannt, insufficient Balance, Payment-Fehler
- `activateShield`: Pixel shielded + Broadcast, Out-of-Bounds, fremdes Pixel, bereits geshieldet
- `isPixelShielded`: true/false, Ablauf-Check mit lazy Cleanup
- `getPixelShield`: Shield-Details oder null
- `getAllActiveShields`: Alle aktiven, abgelaufene ausgeschlossen
- `cleanupExpired`: Entfernung + Broadcast, 0 wenn nichts abgelaufen
- `removeEffect`: Entfernt Shield per effectId
- `getStats`: activeShields-Zaehler

**Mocks:** `db/pool` (null), `ws/socket` (broadcastShieldActivated/Expired), `canvas.service` (getPixel), `payment` (getWallet, processPayment, isWalletBanned)

### 11. Client: Power-Up Shop (Prio 11)

React-Component-Tests fuer `PowerUpShop.tsx` mit @testing-library/react.

**Was wird getestet:**
- Render: Nichts bei `visible=false`, Shop-Titel sichtbar
- Katalog: Shield-Karte mit Name + Preis
- Buy-Button-States: Disabled ohne Wallet, Disabled bei insufficient Balance
- Close-Button: Callback
- Active Shields: Koordinaten-Anzeige
- Section Header: "Available" sichtbar

**Mocks:** `services/api` (apiRequest → Katalog-Daten)

## Architektur-Hinweis: globalThis-Pattern

Alle Server-Singletons nutzen `globalThis` statt Module-Level-Variablen:

```typescript
const G = globalThis as any;
export const canvasService: CanvasService =
  G.__iotaCanvasService || (G.__iotaCanvasService = new CanvasService());
```

**Grund:** `tsx` (TypeScript-Runner) erzeugt bei einer Mischung aus dynamischem `import()` und statischem `import` zwei separate Modul-Instanzen mit eigenen Variablen. `globalThis` ist der einzige Speicherort den alle Instanzen teilen.

**Betroffene Keys:**
| Key | Modul |
|-----|-------|
| `__iotaPool` | `db/pool.ts` |
| `__iotaRedis` | `db/redis.ts` |
| `__iotaCanvasService` | `services/canvas.service.ts` |
| `__iotaSeasonService` | `services/season.service.ts` |
| `__iotaPaymentService` | `services/payment/index.ts` |
| `__iotaSocketIO` | `ws/socket.ts` |
| `__iotaFlushTimer` | `services/flush.service.ts` |
| `__iotaBackupTimer` | `services/backup.service.ts` |
