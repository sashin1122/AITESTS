export interface Invoice {
  paymentHash: string;
  /** BOLT11 payment request the customer's wallet pays. */
  bolt11: string;
  expiresAt: number;
}

export interface LightningBackend {
  createInvoice(amountSats: number, memo: string, expirySecs: number): Promise<Invoice>;
  isPaid(paymentHash: string): Promise<boolean>;
}
