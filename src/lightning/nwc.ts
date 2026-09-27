import { NWCClient } from "@getalby/sdk/nwc";
import type { Invoice, LightningBackend } from "./types.js";

/**
 * Receives payments through Nostr Wallet Connect (NIP-47), which many wallets
 * support (Alby Hub, Coinos, Primal and others). The connection only needs the
 * make_invoice and lookup_invoice permissions; never give it pay permissions.
 */
export class NwcLightning implements LightningBackend {
  private readonly client: NWCClient;

  constructor(nostrWalletConnectUrl: string) {
    this.client = new NWCClient({ nostrWalletConnectUrl });
  }

  async createInvoice(amountSats: number, memo: string, expirySecs: number): Promise<Invoice> {
    const tx = await this.client.makeInvoice({
      amount: amountSats * 1000, // NIP-47 amounts are in millisats
      description: memo,
      expiry: expirySecs,
    });
    return {
      paymentHash: tx.payment_hash,
      bolt11: tx.invoice,
      expiresAt: tx.expires_at ? tx.expires_at * 1000 : Date.now() + expirySecs * 1000,
    };
  }

  async isPaid(paymentHash: string): Promise<boolean> {
    const tx = await this.client.lookupInvoice({ payment_hash: paymentHash });
    return tx.state === "settled";
  }
}
