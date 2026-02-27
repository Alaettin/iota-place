# IOTA Place

Kollaborative Pixel-Canvas-Web-App (wie Reddit r/place) mit IOTA-Mikrotransaktionen.

## Tech-Stack

- **Client:** React 18 + Vite + TypeScript (Port 5173)
- **Server:** Node.js 20 + Express 4 + TypeScript (Port 3001)
- **Admin:** Standalone HTML-Dashboard auf Port 3002 (nur localhost)
- **DB:** PostgreSQL 16 + Redis 7 (mit graceful In-Memory-Fallback)
- **Echtzeit:** Socket.io (binaere 5-Byte-Pixel-Updates)
- **Payment:** Swappbares Interface (`PAYMENT_MODE=mock` oder `iota`)
- **IOTA:** `@iota/iota-sdk` + `@iota/dapp-kit` (Mainnet, Browser-Wallet)
- **Security:** `helmet` (Security-Headers), HMAC-Token-Auth (kein X-Wallet-Id Fallback)
- **Monorepo:** npm workspaces (root + `client/` + `server/`)

## Projekt starten

```bash
npm run dev          # Startet Client + Server parallel (concurrently)
# oder:
start.bat            # Windows-Shortcut
```

PostgreSQL und Redis sind optional — ohne sie laeuft alles in-memory.

- **Client:** http://localhost:5173
- **Server:** http://localhost:3001
- **Admin:** http://localhost:3002 (Passwort: ADMIN_PASSWORD aus .env)

## Architektur

- Canvas = `Uint8Array` (1 Byte pro Pixel, Index in 32-Farb-Palette, dynamisch 250→500→750→1000)
- `resetCanvas()` setzt Pixel UND Groesse auf 250x250 zurueck (Season-Ende)
- Redis als Hot-State, PostgreSQL als durables Backup (5-Sek-Flush via `flush.service.ts`)
- Wallets werden in DB persistiert und beim Startup geladen (`wallet-db.ts`)
- WebSocket-Broadcasts: 5 Bytes pro Pixel-Update (2B x + 2B y + 1B color)
- CSS `image-rendering: pixelated` + `transform: scale()` fuer Canvas-Zoom
- `dotenv.config()` wird in `index.ts` VOR dynamischen Imports aufgerufen (ES Module Hoisting)

## UX-Flow

1. Klick auf Pixel → Selektion (sichtbarer Rahmen)
2. PixelInfo-Panel zeigt Details + Preis
3. Farbe waehlen in ColorPalette
4. "Place Pixel" Button → Bezahlung + Platzierung

## IOTA-Payment-Flow

1. Client baut Transaction via `@iota/dapp-kit` (splitCoins + transferObjects)
2. Browser-Wallet signiert die Transaktion
3. Client sendet `txDigest` an Server
4. Server verifiziert on-chain via `getTransactionBlock` (balanceChanges, Empfaenger, Betrag)
5. Replay-Prevention via `usedTxDigests` Set

## Wichtige Dateien

| Datei | Zweck |
|-------|-------|
| `server/src/index.ts` | Entry-Point, dynamische Imports fuer dotenv |
| `server/src/services/canvas.service.ts` | Zentraler Canvas-State + Pause-Modus |
| `server/src/services/payment/payment.interface.ts` | Swappbares Payment-Interface |
| `server/src/services/payment/mock-payment.service.ts` | Mock-Payment (Testmodus) |
| `server/src/services/payment/iota-payment.service.ts` | IOTA On-Chain Payment |
| `server/src/services/payment/wallet-db.ts` | Wallet-DB-Persistenz (upsert, load) |
| `server/src/services/pricing.service.ts` | Preisberechnung: `basePrice * priceFactor^n` |
| `server/src/services/backup.service.ts` | JSON-Backup alle 30 Min |
| `server/src/services/flush.service.ts` | Redis → PostgreSQL Flush (5s) |
| `server/src/admin-server.ts` | Admin-Express auf Port 3002 |
| `server/src/admin/index.html` | Admin-Dashboard (HTML+JS, Canvas-Viewer) |
| `server/src/db/migrations.ts` | DB-Schema (003: FK-Drop, 005: Power-Up-Tabellen) |
| `server/src/services/season.service.ts` | Saison-Lifecycle (Start, End, Load) |
| `server/src/services/powerup.service.ts` | Power-Up-System: Katalog, Kauf, Shield-Aktivierung |
| `server/src/routes/powerup.routes.ts` | Power-Up API (catalog, purchase, inventory, activate, shields) |
| `server/src/ws/socket.ts` | Echtzeit-Broadcasts (pixel, pause, usercount, season, reset, resize, shield) |
| `server/vitest.config.ts` | Test-Konfiguration |
| `client/src/App.tsx` | Hauptkomponente, State-Management |
| `client/src/components/Canvas.tsx` | HTML5 Canvas mit Zoom/Pan |
| `client/src/hooks/useIotaPayment.ts` | IOTA Transaction Builder |
| `client/src/hooks/useSocket.ts` | WebSocket-Hook (pixel, pause, season, reset, resize, shield events) |
| `client/src/components/PowerUpShop.tsx` | Power-Up Shop Modal (Katalog, Inventar, aktive Shields) |
| `client/src/components/LegalPages.tsx` | Impressum, Datenschutz, AGB (Modal-Overlay) |
| `client/src/components/CookieBanner.tsx` | Cookie-Consent-Banner (localStorage) |
| `client/src/components/Footer.tsx` | Footer mit Legal-Links |
| `client/.env` | Betreiberdaten (VITE_LEGAL_*), nicht in Git |
| `client/.env.example` | Beispielwerte fuer VITE_LEGAL_* |

## Admin-Dashboard (Port 3002)

- Passwort-Login (X-Admin-Password Header)
- Stats (Placements, Wallets, Banned, Spent, Canvas-Size)
- Pause/Resume Toggle (broadcastet via WebSocket)
- Saison-Management: Starten (Name), Beenden (immer Canvas-Reset auf 250x250 + Snapshot)
- Canvas-Viewer mit Zoom/Pan
- Inspect-Tool: Klick auf Pixel → Info (Owner, History, Preis)
- Area-Reset-Tool: Rechteck ziehen → Bereich zuruecksetzen (max 50x50)
- Wallet-Management: Suche, Ban/Unban

## Konventionen

- Alle UI-Panels nutzen Light Theme (weisse Hintergruende, dunkler Text)
- Inline-Styles (kein CSS-Framework)
- TypeScript strict mode
- Server hat graceful Fallbacks: kein PostgreSQL → in-memory, kein Redis → in-memory
- Z-Index Hierarchie: 10 (Zoom/Footer) → 50 (Panels) → 100 (Header) → 150 (Leaderboard/Shop) → 200 (Toast) → 300 (Cookie-Banner) → 400 (Legal-Modal)
- Betreiberdaten ueber `VITE_LEGAL_*` Env-Vars in `client/.env`, nicht im Source-Code
- Wallet-Daten werden in DB persistiert und beim Startup geladen
- Pricing: `basePrice` (0.2 IOTA) * `priceFactor` (1.2) ^ n, wobei n = overwriteCount + 1 wenn Pixel belegt, sonst 0
- Alle Singletons nutzen `globalThis`-Pattern (Fix fuer CJS/ESM Dual-Module-Bug in `tsx`)
- WebSocket-Events: `pixel:update`, `user:count`, `canvas:pause`, `season:change`, `canvas:reset`, `canvas:resize`, `powerup:shield`
- Power-Up-System: `powerUpService` verwaltet Katalog, Inventar und aktive Effekte (Shield)
- Shield: In-Memory `Map<"x,y", ShieldEntry>` fuer O(1) Lookup bei Pixel-Placement

## Tests

- **Framework:** Vitest
- **Server-Tests:** 198 Tests, 15 Dateien — `cd server && npm test`
- **Client-Tests:** 23 Tests, 4 Dateien — `cd client && npm test` (happy-dom + @testing-library/react)
- **Dokumentation:** `TEST.md` im Projekt-Root
- Tests liegen kolociert neben Source: `src/__tests__/`, `src/services/`, `src/routes/`, `src/middleware/`, `src/ws/`

## Regeln

- NIEMALS ohne explizite Anweisung pushen
- Payment-Aenderungen immer ueber das `PaymentService` Interface
- Canvas-Daten nur ueber `canvasService` aendern (nie direkt den Buffer manipulieren)
- Wallet-DB-Writes sind fire-and-forget (`.catch(() => {})`)
- Admin-Routes nur auf Port 3002, NICHT auf dem Hauptserver
