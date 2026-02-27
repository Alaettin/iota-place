# Security Audit — IOTA Place

Letzte Analyse: 2026-02-27

---

## Findings

### KRITISCH

#### K1: Wallet-Impersonation via Header-Spoofing
**Datei:** `server/src/middleware/wallet-auth.ts:10`
**Problem:** Wallet-Authentifizierung basiert nur auf dem `X-Wallet-Id` HTTP-Header. Jeder Client kann beliebige Wallet-IDs setzen.
**Risiko:** Angreifer kann als anderer User Pixel platzieren, Balance ausgeben, Power-Ups kaufen.
**Milderung:** UUIDs sind 128-bit (nicht erratbar), aber bei Abfangen (z.B. HTTP statt HTTPS) trivial ausnutzbar.
**Fix:** Session-Token (signierter JWT oder HMAC-basiert) bei `connectWallet` ausgeben. Alle geschuetzten Endpoints validieren Token statt rohe UUID.
**Aufwand:** Hoch

#### K2: Replay-Angriff nach Server-Restart (IOTA-Modus)
**Datei:** `server/src/services/payment/iota-payment.service.ts:13`
**Problem:** `usedTxDigests` ist ein In-Memory `Set<string>`. Bei Server-Restart wird es geleert — alte Transaktionen koennen erneut eingereicht werden.
**Risiko:** Ein-und-dieselbe Blockchain-Transaktion wird mehrfach akzeptiert — kostenlose Pixel.
**Fix:** `usedTxDigests` in PostgreSQL persistieren (`processed_transactions` Tabelle). Beim Startup laden.
**Aufwand:** Mittel

#### K3: Race Condition bei Replay-Check (IOTA-Modus)
**Datei:** `server/src/services/payment/iota-payment.service.ts:108-175`
**Problem:** Replay-Check (Zeile 108) und `usedTxDigests.add()` (Zeile 175) sind nicht atomar. Zwei gleichzeitige Requests mit demselben `txDigest` passieren beide den Check.
**Risiko:** Doppelte Pixel-Platzierung mit einer einzigen Zahlung.
**Fix:** Sofortiges `usedTxDigests.add(txDigest)` VOR der Blockchain-Verifizierung (mit `delete` bei Fehler als Rollback).
**Aufwand:** Niedrig

#### K4: Wallet-Ban funktioniert nicht im IOTA-Modus
**Datei:** `server/src/middleware/wallet-auth.ts:23`
**Problem:** `paymentService instanceof MockPaymentService` — Ban-Check nur fuer Mock, nicht fuer `IotaPaymentService`.
**Risiko:** Gebannte Wallets koennen in Production weiter Pixel platzieren.
**Fix:** `isWalletBanned()` ist bereits im PaymentService-Interface. Direkt `paymentService.isWalletBanned(walletId)` aufrufen statt `instanceof`-Check.
**Aufwand:** Niedrig

---

### HOCH

#### H1: Keine Rate-Limits auf Wallet-Erstellung und Faucet
**Datei:** `server/src/routes/wallet.routes.ts:10-22, 48-56`
**Problem:** `/api/wallet/connect` und `/api/wallet/faucet` haben kein Rate-Limiting.
**Risiko:** Bot erstellt tausende Wallets (je 100 Mock-IOTA) und spammt Canvas. Faucet kann unbegrenzt aufgerufen werden.
**Fix:** IP-basiertes Rate-Limiting auf `/api/wallet/connect` (z.B. 5 pro Minute). Faucet: max 1 Aufruf pro Wallet pro Stunde (Timestamp in WalletRecord tracken).
**Aufwand:** Niedrig

#### H2: Rate-Limiting umgehbar
**Datei:** `server/src/middleware/rate-limit.ts:20`
**Problem:** `const key = walletId || ip` — ohne `X-Wallet-Id`-Header faellt der Key auf IP zurueck. Verschiedene Wallets = verschiedene Keys = separate Limits.
**Risiko:** Angreifer erstellt N Wallets — N x 5 Pixel pro 10 Sekunden.
**Fix:** Rate-Limit NACH `walletAuth` anwenden UND zusaetzlich per IP limitieren (doppelter Check).
**Aufwand:** Niedrig

#### H3: Default-Admin-Passwort "admin123"
**Datei:** `server/src/middleware/admin-auth.ts:5`
**Problem:** `ADMIN_PASSWORD || "admin123"` — ohne Env-Var hat das Admin-Panel ein triviales Passwort.
**Risiko:** Voller Admin-Zugang (Ban, Canvas-Reset, Saison-Ende).
**Fix:** Kein Default-Passwort. Server verweigert Start wenn `ADMIN_PASSWORD` nicht gesetzt ist (oder Admin-Endpoints deaktivieren).
**Aufwand:** Niedrig

#### H4: Leaderboard exponiert Wallet-Adressen
**Datei:** `server/src/routes/leaderboard.routes.ts:24`
**Problem:** `/api/leaderboard` gibt `address` (volle Blockchain-Adresse) zurueck.
**Risiko:** Wallet-Adressen aller Top-Nutzer oeffentlich einsehbar — Deanonymisierung, Chain-Analyse.
**Fix:** `address` aus Leaderboard-Response entfernen (nur `displayName` + Score).
**Aufwand:** Niedrig

#### H5: IOTA deductBalance ist nur Server-Side
**Datei:** `server/src/services/payment/iota-payment.service.ts:201-229`
**Problem:** `deductBalance()` prueft On-Chain-Balance, zieht aber nichts ab. Nur `totalSpent` wird incrementiert. Der echte On-Chain-Saldo bleibt gleich.
**Risiko:** Power-Up-Kaeufe kosten in IOTA-Modus kein echtes Geld (On-Chain-Balance unveraendert).
**Fix:** Entweder: (a) Power-Up-Kauf erfordert echte IOTA-Transaktion (wie Pixel), oder (b) Server-Side-Balance neben On-Chain-Balance fuehren, oder (c) Feature bewusst nur fuer Mock-Modus.
**Aufwand:** Mittel (Design-Entscheidung)

#### H6: Kein Integer-Check bei Pixel-Koordinaten
**Datei:** `server/src/routes/canvas.routes.ts:87-92`
**Problem:** `typeof x === "number"` akzeptiert auch `NaN`, `Infinity`, Floats.
**Fix:** `Number.isInteger(x)` und `Number.isInteger(y)` pruefen. Bounds-Check: `x >= 0 && x < width && y >= 0 && y < height`.
**Aufwand:** Niedrig

---

### MITTEL

#### M1: SQL-Interpolation in Leaderboard (Theoretisch)
**Datei:** `server/src/routes/leaderboard.routes.ts:45-53`
**Problem:** `ORDER BY ${orderCol}` ist String-Interpolation. Aktuell sicher durch Whitelist (Zeile 43: nur "spent"/"pixels"), aber fragil.
**Fix:** Zwei separate SQL-Queries oder explizites Mapping mit Fallback.
**Aufwand:** Niedrig

#### M2: WebSocket ohne Authentifizierung
**Datei:** `server/src/ws/socket.ts`
**Problem:** Jeder kann sich verbinden und Events empfangen. Kein Auth auf Socket-Ebene.
**Risiko:** Gering (nur Broadcasts, keine Client-to-Server Events). Aber User-Count kann durch Verbindungsspam manipuliert werden.
**Fix:** Optional Socket.io Middleware fuer Auth hinzufuegen.
**Aufwand:** Mittel

#### M3: In-Memory Maps wachsen unbegrenzt
**Dateien:** `rate-limit.ts:7`, `iota-payment.service.ts:13`, `powerup.service.ts`
**Problem:** `counters Map`, `usedTxDigests Set`, `shieldedPixels Map` wachsen potenziell unbegrenzt.
**Risiko:** Memory-Leak bei langem Betrieb.
**Fix:** `usedTxDigests` braucht Eviction (z.B. LRU oder periodisches Cleanup). Rate-Limit hat bereits Cleanup (30s). Shields haben bereits Cleanup (60s).
**Aufwand:** Niedrig

#### M4: Error-Messages leaken interne Details
**Datei:** `server/src/services/payment/iota-payment.service.ts:156, 196`
**Problem:** `INSUFFICIENT_PAYMENT: expected X nanos, got Y` und `TX_VERIFY_FAILED: ${err.message}` geben interne Details preis.
**Fix:** Generische Fehlermeldungen an Client, Details nur ins Server-Log.
**Aufwand:** Niedrig

#### M5: WalletId in localStorage ohne Schutz
**Datei:** `client/src/components/WalletPanel.tsx`
**Problem:** `localStorage.setItem("iota-place-wallet", ...)` — bei XSS auf gleicher Domain lesbar.
**Risiko:** Nur relevant wenn XSS existiert (aktuell nicht der Fall dank React Auto-Escaping).
**Fix:** SessionStorage statt LocalStorage verwenden, oder Token statt WalletId speichern (siehe K1).
**Aufwand:** Niedrig

#### M6: Mock-Modus als Default
**Datei:** `server/src/services/payment/index.ts`
**Problem:** Ohne `PAYMENT_MODE` Env-Var laeuft der Server in Mock-Modus — kostenlose Fake-Balance.
**Fix:** In Production explizit pruefen und warnen/fehlschlagen wenn nicht gesetzt.
**Aufwand:** Niedrig

---

## Gesamtuebersicht

| # | Finding | Schwere | Aufwand | Status | Aenderung |
|---|---------|---------|---------|--------|-----------|
| K1 | Wallet-Impersonation (Header-Spoofing) | KRITISCH | Hoch | **gefixt** | HMAC-basierte Session-Tokens, `Authorization: Bearer` Header |
| K2 | TX-Replay nach Restart | KRITISCH | Mittel | **gefixt** | `processed_transactions` DB-Tabelle, Digests beim Startup geladen |
| K3 | Race Condition Replay-Check | KRITISCH | Niedrig | **gefixt** | `usedTxDigests.add()` vor Verifizierung, `delete()` bei Fehler |
| K4 | Ban nur in Mock-Modus | KRITISCH | Niedrig | **gefixt** | `instanceof`-Check entfernt, `paymentService.isWalletBanned()` direkt |
| H1 | Kein Rate-Limit Wallet/Faucet | HOCH | Niedrig | **gefixt** | IP-Limit 5/Min auf connect, 1/Stunde auf Faucet |
| H2 | Rate-Limit umgehbar | HOCH | Niedrig | **gefixt** | Dual-Key: IP (max 30) + Wallet (max 5) parallel |
| H3 | Default Admin-Passwort | HOCH | Niedrig | **gefixt** | Default auf leeren String, PW-Auth nur wenn gesetzt |
| H4 | Leaderboard zeigt Adressen | HOCH | Niedrig | **gefixt** | `address` aus Response entfernt |
| H5 | deductBalance ohne On-Chain | HOCH | Mittel | **gefixt** | `FEATURE_UNAVAILABLE` Error im IOTA-Modus, Shop deaktiviert |
| H6 | Kein Integer-Check Koordinaten | HOCH | Niedrig | **gefixt** | `Number.isInteger()` + Bounds-Check |
| M1 | SQL-Interpolation (theoretisch) | MITTEL | Niedrig | **gefixt** | Separate Queries statt `${orderCol}` |
| M2 | WebSocket ohne Auth | MITTEL | Mittel | **gefixt** | IP-basiertes Connection-Limit (max 5 pro IP) |
| M3 | Memory-Leak (unbegrenzte Maps) | MITTEL | Niedrig | **gefixt** | `usedTxDigests` Eviction alle 60 Min (Eintraege >24h) |
| M4 | Error-Leak interne Details | MITTEL | Niedrig | **gefixt** | Generische Fehler, keine Nanos/Stack-Traces |
| M5 | WalletId in localStorage | MITTEL | Niedrig | **gefixt** | `sessionStorage` + HMAC-Token statt roher WalletId |
| M6 | Mock als Default | MITTEL | Niedrig | **gefixt** | Console-Warnung wenn Mock-Modus aktiv |

**Stand:** 16 von 16 gefixt — alle Findings geschlossen

---

## Security-Audit 2 (2026-02-27)

### Neue Findings und Fixes

| # | Finding | Schwere | Status | Aenderung |
|---|---------|---------|--------|-----------|
| S1 | X-Wallet-Id Fallback umgeht HMAC-Token-Auth | KRITISCH | **gefixt** | Fallback-Block in `wallet-auth.ts` entfernt, nur Bearer-Token |
| S2 | Keine Security-Headers (kein helmet, CSP, HSTS) | HOCH | **gefixt** | `helmet` installiert, `app.use(helmet())` in `index.ts` |
| S3 | `trust proxy` nicht gesetzt — Rate-Limiter erhaelt Proxy-IP | MITTEL | **gefixt** | `app.set("trust proxy", 1)` in `index.ts` |
| S4 | Snapshot-Pfad nicht gegen Base-Dir validiert | MITTEL | **gefixt** | Path-Traversal-Check: `filePath.startsWith(snapshotDir)` |
| S5 | displayName nicht laengen-/inhalt-validiert | LOW | **gefixt** | Max 50 Zeichen, HTML-Tags gestrippt |
| S6 | Rate-Limit und Faucet lesen X-Wallet-Id Header | MITTEL | **gefixt** | Auf Bearer-Token (verifyToken) umgestellt |

**Stand:** 6 von 6 gefixt

---

## Betroffene Dateien

| Datei | Fixes |
|-------|-------|
| `server/src/services/auth-token.ts` | K1 (NEU: HMAC Token-Service) |
| `server/src/middleware/wallet-auth.ts` | K1, K4 (Bearer-Token + Ban-Check) |
| `server/src/middleware/rate-limit.ts` | H2 |
| `server/src/middleware/admin-auth.ts` | H3 |
| `server/src/routes/wallet.routes.ts` | K1, H1 (Token in Response + Rate-Limits) |
| `server/src/routes/canvas.routes.ts` | H6 |
| `server/src/routes/leaderboard.routes.ts` | H4, M1 |
| `server/src/services/payment/iota-payment.service.ts` | K2, K3, M3, M4, H5 |
| `server/src/services/payment/wallet-db.ts` | K2 (DB-Helfer fuer processed_transactions) |
| `server/src/db/migrations.ts` | K2 (Migration 006) |
| `server/src/ws/socket.ts` | M2 (Connection-Rate-Limit) |
| `client/src/services/api.ts` | K1 (Auto-Token-Header) |
| `client/src/components/WalletPanel.tsx` | K1, M5 (sessionStorage + Token) |
| `client/src/App.tsx` | K1 (X-Wallet-Id entfernt) |
| `client/src/components/PowerUpShop.tsx` | K1 (X-Wallet-Id entfernt) |
| `server/src/index.ts` | S2 (helmet), S3 (trust proxy) |
| `server/src/admin-server.ts` | S4 (Snapshot Path-Traversal-Check) |
