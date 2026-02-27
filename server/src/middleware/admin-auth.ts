import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./wallet-auth";
import { paymentService } from "../services/payment";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  // Option 1: Check X-Admin-Password header (simple for MVP)
  const adminPw = req.headers["x-admin-password"] as string;
  if (adminPw === ADMIN_PASSWORD) {
    next();
    return;
  }

  // Option 2: Check if wallet is in ADMIN_WALLETS list
  const walletId = req.walletId;
  if (walletId) {
    const adminAddresses = (process.env.ADMIN_WALLETS || "").split(",").filter(Boolean);
    if (adminAddresses.length > 0) {
      const wallet = await paymentService.getWallet(walletId);
      if (wallet && adminAddresses.includes(wallet.address)) {
        next();
        return;
      }
    }
  }

  res.status(403).json({ error: "ADMIN_REQUIRED" });
}
