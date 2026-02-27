# Authentifizierung einrichten

Diese Anleitung erklaert Schritt fuer Schritt, wie du **ADMIN_PASSWORD** und **SESSION_SECRET** in deiner `.env`-Datei setzt.

---

## 1. SESSION_SECRET setzen

Der `SESSION_SECRET` wird verwendet, um Wallet-Session-Tokens (HMAC) zu signieren. Ohne einen festen Wert wird bei jedem Server-Neustart ein neuer Secret generiert — das bedeutet, alle eingeloggten Nutzer werden automatisch ausgeloggt.

### Schritt 1: Secret generieren

Oeffne ein Terminal (Git Bash, PowerShell oder CMD) und fuehre **einen** der folgenden Befehle aus:

**Git Bash / Linux / Mac:**
```bash
openssl rand -hex 32
```

**Node.js (ueberall):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Du erhaeltst eine Zeichenkette wie:
```
a3f7e2b1c4d9f0e8b2c1d4e5f6a7b8c9a3f7e2b1c4d9f0e8b2c1d4e5f6a7b8c9
```

### Schritt 2: In .env eintragen

Oeffne die Datei `.env` im Projektroot und fuege die Zeile hinzu (oder ersetze den Platzhalter):

```env
SESSION_SECRET=dein_generierter_wert_hier
```

**Beispiel:**
```env
SESSION_SECRET=a3f7e2b1c4d9f0e8b2c1d4e5f6a7b8c9a3f7e2b1c4d9f0e8b2c1d4e5f6a7b8c9
```

> **Wichtig:** Diesen Wert niemals oeffentlich teilen oder in Git committen. Die `.env`-Datei ist bereits in `.gitignore`.

---

## 2. ADMIN_PASSWORD setzen

Das Admin-Passwort schuetzt das Admin-Dashboard und alle Admin-API-Endpunkte. Es wird per `X-Admin-Password`-Header uebertragen.

### Schritt 1: Starkes Passwort generieren

**Option A — Zufaellig (empfohlen):**
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```
Ergebnis z.B.: `e8a3f7b1c4d9e0f2a3b7c1d4e5f6a8b9`

**Option B — Selbst gewaehlt:**
Waehle ein Passwort mit mindestens 12 Zeichen, z.B.:
```
MeinSicheresP@ssw0rt!2026
```

### Schritt 2: In .env eintragen

```env
ADMIN_PASSWORD=dein_starkes_passwort_hier
```

**Beispiel:**
```env
ADMIN_PASSWORD=e8a3f7b1c4d9e0f2a3b7c1d4e5f6a8b9
```

> **Warnung:** Wenn das Passwort kuerzer als 12 Zeichen ist, zeigt der Server beim Start eine Warnung in der Konsole an.

---

## 3. Pruefen

Nach dem Setzen beider Werte starte den Server neu:

```bash
npm run dev
```

Wenn alles korrekt ist, siehst du **keine** Warnungen in der Konsole.

Falls etwas fehlt, erscheint:
- `[Auth] WARNING: SESSION_SECRET not set` — SESSION_SECRET fehlt
- `[Admin] WARNING: ADMIN_PASSWORD is shorter than 12 characters` — Passwort zu kurz

---

## Zusammenfassung

| Variable | Zweck | Min. Laenge | Generieren |
|----------|-------|-------------|------------|
| `SESSION_SECRET` | Signiert Wallet-Tokens (HMAC) | 32 Hex-Zeichen | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Schuetzt Admin-Dashboard | 12 Zeichen | `openssl rand -hex 16` |

Beide Werte stehen in `.env` und werden **nicht** in Git committed.
