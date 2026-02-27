# IOTA Place - Vollstaendiger Projektplan

## Vision

Kollaborative Pixel-Canvas-Web-App (wie Reddit r/place) mit IOTA-Mikrotransaktionen.
Jeder Pixel kostet IOTA-Tokens, der Preis steigt mit jedem Ueberschreiben.
Saison-basiert mit Leaderboards, Power-Ups und wachsendem Canvas.

---

## Status-Uebersicht

| Phase | Name | Status |
|-------|------|--------|
| 0 | Projekt-Scaffolding | erledigt |
| 1 | Canvas-Core | erledigt |
| 2 | Mock-Payment & Wallet | erledigt |
| 3 | Echtzeit (WebSocket) | erledigt |
| 4 | Persistenz & History | erledigt |
| 5 | Leaderboard & Stats | erledigt |
| 6 | Admin-Panel | erledigt |
| 7 | Polish & Production | erledigt |
| 8 | UX-Redesign & Light Theme | erledigt |
| 9 | IOTA-Integration | erledigt |
| 9.1 | Polish & Admin-Separation | erledigt |
| 9.2 | Admin Canvas-Moderation | erledigt |
| 9.3 | Wallet- & Pixel-DB-Persistenz | erledigt |
| 10 | Saison-System | erledigt |
| 10.1 | Testing-Setup | erledigt |
| 11 | Power-Up-Shop (Shield) | erledigt |
| 12 | Canvas-Wachstum | erledigt |
| 12.1 | Rechtliche Seiten | erledigt |
| 13 | AI-Moderation | offen |
| 14 | PWA & Mobile | offen |

---

## Erledigte Phasen

### Phase 0: Projekt-Scaffolding
- npm workspaces Monorepo (root + client + server)
- Docker Compose (app + postgres + redis)
- Multi-stage Dockerfile
- Express-Server mit Health-Endpoint
- Vite + React Boilerplate
- `.env.example`, `.gitignore`, tsconfig

### Phase 1: Canvas-Core
- Shared Types (Pixel, CanvasConfig, COLOR_PALETTE mit 32 Farben)
- In-Memory CanvasService (Uint8Array Buffer, 250x250)
- Canvas-API: `GET /api/canvas` (binary), `GET /api/canvas/pixel/:x/:y`, `POST /api/canvas/pixel`
- HTML5 Canvas mit Zoom/Pan (Scroll + Drag), `image-rendering: pixelated`
- ColorPalette (32 Farben, 4x8 Grid)
- PixelInfo-Panel

### Phase 2: Mock-Payment & Wallet
- Swappbares PaymentService Interface (`payment.interface.ts`)
- MockPaymentService (In-Memory, Starting Balance 100 IOTA)
- PaymentService Factory (`PAYMENT_MODE` env var)
- PricingService: `price = 0.2 * 1.2^n` (n = overwriteCount+1 wenn belegt, sonst 0)
- WalletAuth Middleware (HMAC Bearer Token)
- Wallet-API: connect, balance, faucet (+50 Tokens)
- WalletPanel im Frontend

### Phase 3: Echtzeit (WebSocket)
- Socket.io Server
- Binaere Pixel-Broadcasts (5 Bytes: 2B x + 2B y + 1B color)
- Online-User-Count
- `useSocket` Hook mit Reconnection

### Phase 4: Persistenz & History
- PostgreSQL Migrations-System
- Tabellen: wallets, pixels, pixel_history, seasons, canvas_config
- Redis-Caching-Layer (canvas:colors, pixel hashes, dirty set)
- Background Flush-Service (5-Sek-Intervall: Redis → PostgreSQL)
- Startup-Loader (PostgreSQL → Redis)
- Graceful Fallback: laeuft komplett in-memory ohne PostgreSQL/Redis

### Phase 5: Leaderboard & Stats
- Redis Sorted Sets (pixels, spent)
- Leaderboard API (`GET /api/leaderboard?type=pixels|spent`)
- Stats API (`GET /api/stats`)
- Leaderboard-Component (Top 20, Toggle, Auto-Refresh)

### Phase 6: Admin-Panel
- Admin-Auth (Password + ADMIN_WALLETS env var)
- Admin-API: Stats, Wallet-Liste, Ban/Unban
- AdminPanel: Dashboard, Wallet-Management, Suche

### Phase 7: Polish & Production
- Rate-Limiting (5 Pixel pro 10 Sek pro Wallet)
- CORS-Konfiguration
- Error-Handling

### Phase 8: UX-Redesign & Light Theme
- Neuer UX-Flow: Klick selektiert → Info-Panel → Farbe waehlen → "Place Pixel" Button
- Komplett-Redesign von Dark auf Light Theme
- Panel-Positionen gefixt (kein Ueberlappen mehr)
- Konsistente z-index Hierarchie
- Selektions-Rahmen auf Canvas (Overlay-Canvas)

### Phase 9: IOTA-Integration
- `IotaPaymentService` mit On-Chain-Verifizierung
- `@iota/iota-sdk` + `@iota/dapp-kit` fuer Browser-Wallet
- Dual-Mode WalletPanel (Mock + IOTA)
- Transaction Builder Hook (`useIotaPayment`)
- Replay-Prevention via `usedTxDigests` Set
- Testnet-Faucet-Integration
- `dotenv.config()` fix fuer ES Module Hoisting (dynamische Imports in bootstrap())

### Phase 9.1: Polish & Admin-Separation
- Base-Price auf 0.2 IOTA, priceFactor auf 1.2 (20% pro Overwrite, greift ab 1. Ueberschreibung)
- Center-Canvas Button (⊕ neben Zoom-Indikator)
- Pause/Maintenance-Modus (Server-Flag + WebSocket-Broadcast + Client-Banner)
- JSON-Backup-Service (alle 30 Min, letzte 48 behalten)
- Admin-Panel auf separaten Port 3002 verschoben (nur localhost)
- Standalone HTML-Dashboard statt React-Component
- AdminPanel.tsx aus Client entfernt

### Phase 9.2: Admin Canvas-Moderation
- Canvas-Viewer im Admin-Dashboard (Zoom/Pan, Koordinaten-Anzeige)
- Inspect-Tool: Klick auf Pixel → Info-Panel (Owner, Adresse, Ban-Status, History, Preis)
- Reset-Pixel-Funktion (Pixel auf weiss zuruecksetzen)
- Area-Reset-Tool (Rechteck ziehen, max 50x50 = 2500px)
- Ban/Unban direkt aus Pixel-Info-Panel
- Canvas-Endpoints auf Admin-Port dupliziert (CORS-Vermeidung)

### Phase 9.3: Wallet- & Pixel-DB-Persistenz
- **Problem gefixt:** Wallets wurden nie in DB geschrieben → bei Restart alles weg
- **Problem gefixt:** Flush-Service scheiterte an FK-Constraint (wallet_id UUID FK auf wallets)
- Migration 003: FK-Constraints gedroppt, wallet_id von UUID auf TEXT geaendert
- `wallet-db.ts`: Shared Helper fuer Wallet-DB-Persistenz
- `upsertWalletToDb()` bei `connectWallet()` (fire-and-forget)
- `updateWalletStatsInDb()` nach `processPayment()` (fire-and-forget)
- `loadWalletsFromDb()` beim Startup (vor Canvas-Load)
- Beide Services (Mock + IOTA) nutzen dieselbe DB-Persistenz

### Phase 10: Saison-System
- `SeasonService` mit `loadFromDb`, `startSeason`, `endSeason`, `getAllSeasons`, `getSeasonById`
- Admin-Controls: Saison starten (Name + Canvas-Groesse), beenden (mit optionalem Canvas-Reset)
- Canvas-Snapshot als PNG bei Saison-Ende (automatisch gespeichert)
- Saison-spezifische Leaderboards (`wallet_season_stats` Tabelle, `/api/leaderboard/season/:id`)
- Saison-Archiv im Admin-Dashboard (alle vergangenen Saisons mit Snapshots)
- WebSocket-Events: `season:change` (Client aktualisiert Header), `canvas:reset` (Client laedt Canvas neu)
- Client: Scope-Toggle im Leaderboard (All Time / aktive Season)
- DB: `seasons` Tabelle, `wallet_season_stats` Tabelle, `pixel_history.season_id`

### Phase 10.1: Testing-Setup
- **Framework:** Vitest (TS-nativ, esbuild-basiert)
- **144 Tests** in 12 Dateien, alle gruen
- Singleton-Integritaet (globalThis-Fix Regression-Guard)
- Canvas Service, Payment Service, Pricing Service Unit-Tests
- Flush-Pipeline Tests (Redis→PostgreSQL Logik mit Mocks)
- Season Service Tests (vollstaendiger Lifecycle)
- API Route Tests (canvas, wallet, leaderboard) mit supertest
- Middleware Tests (wallet-auth, rate-limit)
- WebSocket Broadcast Tests (binary format, no-op safety)
- Refactorings: `CanvasService` Klasse exportiert, `flushOnce()` extrahiert
- Dokumentation: `TEST.md`

### Phase 12: Canvas-Wachstum
- `CanvasService` erweitert: `getOccupancy()`, `resize()`, `checkAutoExpand()`
- Auto-Expand bei ≥80% Belegung: 250→500→750→1000 (nur naechste Stufe, nie ueberspringen)
- `loadFromDb()` liest Canvas-Dimensionen aus `canvas_config` Tabelle
- Admin-Endpoint `POST /api/admin/canvas/resize` (manuelle Groessenaenderung)
- Admin-UI: Resize-Buttons, Occupancy-Balken (gruen/gelb/rot)
- WebSocket-Event `canvas:resize` broadcastet neue Dimensionen
- Client: Dynamische Canvas-Groesse aus Config, `canvas:resize` Handler laedt Canvas neu
- Kein Shrink erlaubt, nur gueltige Stufen (250, 500, 750, 1000)
- Season-Ende setzt Canvas immer auf 250x250 zurueck (ein Button statt zwei)
- Zoom-Fix: dynamisches initiales Zoom-Level, kein Re-Center bei Zoom-Aenderung
- **144 Tests** (+18 neue: Occupancy, Resize, AutoExpand, ResetDimensions, broadcastCanvasResize)

### Phase 12.1: Rechtliche Seiten
- Impressum (§5 TMG), Datenschutzerklaerung (DSGVO Art. 13/14), AGB als Modal-Overlays
- Cookie-Consent-Banner (localStorage-basiert, kein echtes Cookie)
- Footer-Komponente mit Links zu allen drei Seiten
- Betreiberdaten ueber `VITE_LEGAL_*` Env-Vars (`client/.env`), nicht im Source-Code
- `client/.env.example` mit Beispielwerten fuer Git
- ESC oder Klick auf Backdrop schliesst Modals
- z-index: 300 (Cookie-Banner), 400 (Legal-Modal)

### Phase 11: Power-Up-Shop (Shield)
- Power-Up-Infrastruktur: DB-Tabellen (`power_up_catalog`, `wallet_power_ups`, `active_effects`), erweiterbar fuer zukuenftige Power-Ups
- `PowerUpService` Singleton mit In-Memory Shield-Map (`Map<"x,y", ShieldEntry>`) fuer O(1) Lookups
- Shield Power-Up: Pixel 1h vor Ueberschreiben geschuetzt, Kosten 2 IOTA
- Kauf-Flow: `POST /api/powerups/purchase` → Balance-Abzug via `paymentService.processPayment()`
- Aktivierungs-Flow: `POST /api/powerups/activate` → Validiert Eigentum, erstellt Effekt, broadcastet via WebSocket
- Shield-Check bei Pixel-Placement: `isPixelShielded()` vor Preisberechnung, 403 PIXEL_SHIELDED bei geschuetztem Pixel
- Client: Shop-Modal (`PowerUpShop.tsx`), Shield-Activation-Mode (klick auf eigenes Pixel), Shield-Overlay auf Canvas (Cyan-Rahmen)
- PixelInfo: Shield-Anzeige + deaktivierter Place-Button bei geschuetztem Pixel
- WebSocket-Event `powerup:shield` fuer Echtzeit-Updates (Aktivierung/Ablauf)
- Admin: Shield-Stats + manuelles Entfernen aktiver Shields
- Cleanup: Lazy (bei Zugriff) + periodisch (alle 60 Sekunden)
- **221 Tests** (198 Server + 23 Client)

---

## Offene Phasen

### Phase 13: AI-Moderation

**Ziel:** Automatische Erkennung und Moderation unangemessener Inhalte.

1. Canvas-Screenshot-Analyse (periodisch, alle 5 Min)
2. NSFW-Erkennung (ML-Modell oder API)
3. Melde-Button fuer User (Report-System)
4. Backoffice-Moderations-Queue
5. Auto-Reset bei erkannten Verstoessen
6. Moderations-Log im Admin-Panel

### Phase 14: PWA & Mobile

**Ziel:** App-aehnliche Erfahrung auf Mobilgeraeten.

1. Service Worker (Offline-Cache)
2. Web App Manifest
3. Touch-Events fuer Canvas (Pinch-to-Zoom, Tap-to-Select)
4. Responsive Layout (Mobile-optimierte Panel-Positionen)
5. Push-Notifications (neue Saison, Pixel ueberschrieben)
6. Add-to-Homescreen Prompt

---

## Datenbank-Schema

```sql
-- Wallets
wallets (id TEXT PK, address TEXT UNIQUE, display_name TEXT, balance NUMERIC(20,6),
         total_spent NUMERIC(20,6), pixel_count INT, is_banned BOOL, created_at, updated_at)

-- Aktueller Canvas-Zustand
pixels (x SMALLINT, y SMALLINT, color SMALLINT, wallet_id TEXT,
        price_paid NUMERIC(20,6), overwrite_count INT, updated_at TIMESTAMPTZ,
        PRIMARY KEY (x, y))

-- Komplette History
pixel_history (id BIGSERIAL PK, x SMALLINT, y SMALLINT, color SMALLINT, wallet_id TEXT,
               price_paid NUMERIC(20,6), season_id INT, placed_at TIMESTAMPTZ)

-- Saisons
seasons (id SERIAL PK, name TEXT, start_date, end_date, snapshot_url TEXT,
         canvas_width SMALLINT, canvas_height SMALLINT, is_active BOOL)

-- Config (Singleton)
canvas_config (id INT PK CHECK(id=1), base_price NUMERIC, price_factor NUMERIC,
               current_width SMALLINT, current_height SMALLINT, active_season_id INT FK)

-- Power-Up Katalog
power_up_catalog (id TEXT PK, name TEXT, description TEXT, price NUMERIC(20,6),
                  duration_seconds INT, is_active BOOL DEFAULT true)

-- Wallet Power-Up Inventar
wallet_power_ups (id SERIAL PK, wallet_id TEXT, power_up_id TEXT FK,
                  purchased_at TIMESTAMPTZ, used_at TIMESTAMPTZ)

-- Aktive Effekte (laufende Shields)
active_effects (id SERIAL PK, power_up_id TEXT FK, wallet_id TEXT,
                target_x SMALLINT, target_y SMALLINT, activated_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ)
```

**Hinweis:** wallet_id ist TEXT (kein UUID FK), damit "admin" als Wert moeglich ist und der Flush-Service keine FK-Fehler wirft.

## Redis-Strategie

| Key | Typ | Zweck |
|-----|-----|-------|
| `canvas:colors` | Binary String | Canvas-Farben als Uint8Array |
| `canvas:pixel:{x},{y}` | Hash | Pixel-Metadata |
| `canvas:dirty` | Set | Geaenderte Pixel seit letztem Flush |
| `leaderboard:pixels` | Sorted Set | Ranking nach Pixel-Anzahl |
| `leaderboard:spent` | Sorted Set | Ranking nach Ausgaben |
| `ratelimit:{walletId}` | String + TTL | Rate-Limiting Counter |

## Architektur-Prinzipien

1. **Canvas als Uint8Array** — 1 Byte pro Pixel, Index in 32-Farb-Palette
2. **Binary WebSocket** — 5 Bytes pro Update statt ~100 Bytes JSON
3. **Swappbares Payment** — Interface mit Mock/IOTA via env var
4. **Redis Hot-State** — PostgreSQL als durables Backup (5-Sek-Flush)
5. **Graceful Fallback** — Laeuft ohne Redis/PostgreSQL komplett in-memory
6. **CSS Pixelated** — `image-rendering: pixelated` + `transform: scale()` fuer Zoom
7. **Wallet-DB-Persistenz** — Wallets bei Create/Update in DB geschrieben, beim Startup geladen
8. **Admin-Isolation** — Separater Express auf Port 3002, nur localhost
