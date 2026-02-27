import { Request, Response, NextFunction } from "express";
import { paymentService } from "../services/payment";
import { MockPaymentService } from "../services/payment/mock-payment.service";

export interface AuthenticatedRequest extends Request {
  walletId?: string;
}

export async function walletAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const walletId = req.headers["x-wallet-id"] as string;
  if (!walletId) {
    res.status(401).json({ error: "WALLET_NOT_CONNECTED" });
    return;
  }

  const wallet = await paymentService.getWallet(walletId);
  if (!wallet) {
    res.status(401).json({ error: "WALLET_NOT_FOUND" });
    return;
  }

  // Check ban status
  if (paymentService instanceof MockPaymentService && paymentService.isWalletBanned(walletId)) {
    res.status(403).json({ error: "WALLET_BANNED" });
    return;
  }

  req.walletId = walletId;
  next();
}
