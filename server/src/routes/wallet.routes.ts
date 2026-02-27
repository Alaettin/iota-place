import { Router } from "express";
import crypto from "crypto";
import { paymentService } from "../services/payment";
import { walletAuth, AuthenticatedRequest } from "../middleware/wallet-auth";

export function mountRoutes(router: Router): void {
  // Connect wallet (mock: creates random address)
  router.post("/api/wallet/connect", async (req, res) => {
    try {
      const { address, displayName } = req.body;
      const mockAddress = address || `mock_${crypto.randomUUID().slice(0, 16)}`;
      const wallet = await paymentService.connectWallet(mockAddress, displayName);
      res.json({ ok: true, wallet });
    } catch {
      res.status(500).json({ error: "WALLET_CONNECT_FAILED" });
    }
  });

  // Get wallet info
  router.get("/api/wallet/me", walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const wallet = await paymentService.getWallet(walletId);
      if (!wallet) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
      res.json({ ok: true, wallet });
    } catch {
      res.status(500).json({ error: "WALLET_FETCH_FAILED" });
    }
  });

  // Get balance
  router.get("/api/wallet/balance", walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const balance = await paymentService.getBalance(walletId);
      res.json({ ok: true, balance });
    } catch {
      res.status(500).json({ error: "BALANCE_FETCH_FAILED" });
    }
  });

  // Add funds (mock faucet)
  router.post("/api/wallet/faucet", walletAuth as any, async (req, res) => {
    try {
      const walletId = (req as AuthenticatedRequest).walletId!;
      const wallet = await paymentService.addFunds(walletId, 50);
      res.json({ ok: true, wallet });
    } catch {
      res.status(500).json({ error: "FAUCET_FAILED" });
    }
  });
}
