export interface PaymentResult {
  success: boolean;
  transactionId: string;
  amountPaid: number;
  newBalance: number;
  error?: string;
}

export interface WalletInfo {
  walletId: string;
  address: string;
  displayName: string;
  balance: number;
}

export interface PaymentService {
  connectWallet(address: string, displayName?: string): Promise<WalletInfo>;
  getBalance(walletId: string): Promise<number>;
  getWallet(walletId: string): Promise<WalletInfo | null>;
  processPayment(walletId: string, amount: number, metadata: {
    x: number;
    y: number;
    color: number;
  }): Promise<PaymentResult>;
  addFunds(walletId: string, amount: number): Promise<WalletInfo>;
}
