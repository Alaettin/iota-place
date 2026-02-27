import dotenv from "dotenv";
import path from "path";

// Load .env BEFORE any other modules (dynamic imports below)
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function bootstrap() {
  const [
    { default: express },
    http,
    { default: cors },
    { default: helmet },
    { mountRoutes: mountCanvasRoutes },
    { mountRoutes: mountWalletRoutes },
    { mountRoutes: mountLeaderboardRoutes },
    { mountPowerUpRoutes },
    { initSocketServer },
    { initPool },
    { initRedis },
    { runMigrations },
    { canvasService },
    { startFlushService },
    { startAdminServer },
    { startBackupService },
    { paymentService },
    { seasonService },
    { powerUpService },
  ] = await Promise.all([
    import("express"),
    import("http"),
    import("cors"),
    import("helmet"),
    import("./routes/canvas.routes"),
    import("./routes/wallet.routes"),
    import("./routes/leaderboard.routes"),
    import("./routes/powerup.routes"),
    import("./ws/socket"),
    import("./db/pool"),
    import("./db/redis"),
    import("./db/migrations"),
    import("./services/canvas.service"),
    import("./services/flush.service"),
    import("./admin-server"),
    import("./services/backup.service"),
    import("./services/payment"),
    import("./services/season.service"),
    import("./services/powerup.service"),
  ]);

  const app = express();
  const server = http.createServer(app);
  const PORT = parseInt(process.env.PORT || "3001", 10);

  // Trust first proxy (nginx/reverse proxy) for correct client IP
  app.set("trust proxy", 1);

  // Security headers (allow IOTA RPC + wallet connections)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: [
            "'self'",
            "https://api.mainnet.iota.cafe",
            "https://api.testnet.iota.cafe",
            "wss:",
            "ws:",
          ],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    })
  );

  app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // WebSocket
  initSocketServer(server);

  // Mount routes (admin routes are on separate port)
  mountCanvasRoutes(app);
  mountWalletRoutes(app);
  mountLeaderboardRoutes(app);
  mountPowerUpRoutes(app);

  // Serve client in production
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "public")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  }

  // Initialize databases (optional - falls back to in-memory if unavailable)
  const pool = await initPool();
  await initRedis();

  if (pool) {
    await runMigrations(pool);
    await paymentService.loadFromDb();
    await canvasService.loadFromDb();
    await seasonService.loadFromDb();
    await powerUpService.loadFromDb();
    startFlushService();
  }

  // Cleanup expired power-up effects every 60 seconds
  setInterval(() => powerUpService.cleanupExpired(), 60000);

  // Start admin server on separate port (localhost only)
  startAdminServer();

  // Start backup service
  startBackupService();

  server.listen(PORT, () => {
    console.log(`IOTA Place server running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
