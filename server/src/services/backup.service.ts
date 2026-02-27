import fs from "fs";
import path from "path";
import { canvasService } from "./canvas.service";
import { paymentService } from "../services/payment";

// Use globalThis to avoid CJS/ESM dual-module issue
const G = globalThis as any;

const BACKUP_DIR = path.resolve(__dirname, "../../../data/backups");
const INTERVAL_MS = (parseInt(process.env.BACKUP_INTERVAL_MIN || "30", 10)) * 60 * 1000;
const RETAIN_COUNT = parseInt(process.env.BACKUP_RETAIN_COUNT || "48", 10);

export async function createBackup(): Promise<void> {
  try {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `backup_${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    // Gather data
    const canvas = canvasService.getFullCanvas();
    const canvasBase64 = Buffer.from(canvas).toString("base64");
    const config = canvasService.getConfig();
    const wallets = paymentService.getAllWallets().map((w) => ({
      id: w.id,
      address: w.address,
      displayName: w.displayName,
      pixelCount: w.pixelCount,
      totalSpent: Math.round(w.totalSpent * 10000) / 10000,
    }));

    // Count non-white pixels
    let pixelCount = 0;
    for (let i = 0; i < canvas.length; i++) {
      if (canvas[i] !== 0) pixelCount++;
    }

    const backup = {
      timestamp: now.toISOString(),
      config: {
        width: config.width,
        height: config.height,
        basePrice: config.basePrice,
        paymentMode: config.paymentMode,
      },
      canvas: canvasBase64,
      pixelCount,
      walletCount: wallets.length,
      wallets,
    };

    fs.writeFileSync(filepath, JSON.stringify(backup));
    console.log(`[Backup] Created: ${filename} (${pixelCount} pixels, ${wallets.length} wallets)`);

    // Cleanup old backups
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".json"))
      .sort()
      .reverse();

    for (let i = RETAIN_COUNT; i < files.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
    }
  } catch (err) {
    console.error("[Backup] Failed:", (err as Error).message);
  }
}

export function startBackupService(): void {
  // Create initial backup
  createBackup();

  G.__iotaBackupTimer = setInterval(createBackup, INTERVAL_MS);
  console.log(`[Backup] Service started (every ${INTERVAL_MS / 60000} min, retain ${RETAIN_COUNT})`);
}

export function stopBackupService(): void {
  if (G.__iotaBackupTimer) {
    clearInterval(G.__iotaBackupTimer);
    G.__iotaBackupTimer = null;
  }
}
