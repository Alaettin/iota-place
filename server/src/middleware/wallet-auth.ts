import { Request, Response, NextFunction } from "express";
import { paymentService } from "../services/payment";
import { verifyToken } from "../services/auth-token";

export interface AuthenticatedRequest extends Request {
  walletId?: string;
}

export async function walletAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  let walletId: string | null = null;

  // Authorization Bearer token (HMAC-signed) — only accepted auth method
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    walletId = verifyToken(authHeader.slice(7));
  }

  if (!walletId) {
    res.status(401).json({ error: "WALLET_NOT_CONNECTED" });
    return;
  }

  const wallet = await paymentService.getWallet(walletId);
  if (!wallet) {
    res.status(401).json({ error: "WALLET_NOT_FOUND" });
    return;
  }

  // Check ban status (works for both Mock and IOTA payment services)
  if (paymentService.isWalletBanned(walletId)) {
    res.status(403).json({ error: "WALLET_BANNED" });
    return;
  }

  req.walletId = walletId;
  next();
}
