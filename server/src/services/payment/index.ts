import { PaymentService } from "./payment.interface";
import { MockPaymentService } from "./mock-payment.service";

export function createPaymentService(): PaymentService {
  const mode = process.env.PAYMENT_MODE || "mock";
  switch (mode) {
    case "iota":
      throw new Error("IOTA payment not yet implemented. Set PAYMENT_MODE=mock");
    case "mock":
    default:
      return new MockPaymentService();
  }
}

export const paymentService = createPaymentService();
export type { PaymentService, PaymentResult, WalletInfo } from "./payment.interface";
