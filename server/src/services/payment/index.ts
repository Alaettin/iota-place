import { PaymentService } from "./payment.interface";
import { MockPaymentService } from "./mock-payment.service";
import { IotaPaymentService } from "./iota-payment.service";

// Use globalThis to avoid CJS/ESM dual-module issue
const G = globalThis as any;

export function createPaymentService(): PaymentService {
  const mode = process.env.PAYMENT_MODE || "mock";
  switch (mode) {
    case "iota":
      return new IotaPaymentService();
    case "mock":
    default:
      return new MockPaymentService();
  }
}

export const paymentService: PaymentService =
  G.__iotaPaymentService || (G.__iotaPaymentService = createPaymentService());
export type { PaymentService, PaymentResult, WalletInfo, WalletRecord } from "./payment.interface";
