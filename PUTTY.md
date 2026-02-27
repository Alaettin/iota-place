# Admin-Zugriff via PuTTY SSH-Tunnel

## Verbindung aufbauen

1. **PuTTY oeffnen**
2. **Session:** Host = `87.106.211.168`, Port = `22`
3. **Links:** Connection → SSH → Auth → Credentials → **Private key file:** deine `.ppk` Datei auswaehlen
4. **Links:** Connection → SSH → Tunnels
5. **Source port:** `3002`
6. **Destination:** `localhost:3002`
7. **Add** klicken (erscheint als `L3002 localhost:3002` in der Liste)
8. **Open** klicken, mit `root` einloggen

## Admin-Dashboard oeffnen

Im Browser: `http://localhost:3002`

Passwort = `ADMIN_PASSWORD` aus `/opt/iota-place/.env`

## Verbindung trennen

`exit` eingeben oder PuTTY-Fenster schliessen.
