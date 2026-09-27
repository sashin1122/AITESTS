import { randomBytes } from "node:crypto";
import type { Invoice, LightningBackend } from "./types.js";

/**
 * Fake wallet for local development and tests. Invoices are marked paid with
 * markPaid(), which the dev-only route /api/dev/pay/:id calls.
 */
export class MockLightning implements LightningBackend {
  private readonly paid = new Set<string>();
  private readonly hashes = new Map<string, string>();

  async createInvoice(amountSats: number, _memo: string, expirySecs: number): Promise<Invoice> {
    const paymentHash = randomBytes(32).toString("hex");
    const bolt11 = `lnbcrt${amountSats}n1mock${paymentHash.slice(0, 40)}`;
    this.hashes.set(bolt11, paymentHash);
    return { paymentHash, bolt11, expiresAt: Date.now() + expirySecs * 1000 };
  }

  async isPaid(paymentHash: string): Promise<boolean> {
    return this.paid.has(paymentHash);
  }

  hashForInvoice(bolt11: string): string | undefined {
    return this.hashes.get(bolt11);
  }

  markPaid(paymentHash: string): void {
    this.paid.add(paymentHash);
  }
}
