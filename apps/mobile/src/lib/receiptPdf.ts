/**
 * Pay-receipt → PDF.
 *
 * Turns a single cash-earnings entry into a one-page PDF receipt the
 * worker can issue to their employer over WhatsApp/email. Mirrors the
 * defensive expo-print pattern from resumePdf.ts so a build without
 * expo-print falls back gracefully to a plain-text share.
 *
 * The template is deliberately formal — a receipt is a financial
 * document, so we go for "looks like something a CA would file" rather
 * than the rest of the app's softer voice.
 */

import * as Sharing from 'expo-sharing';
import type { PublicUser } from '@/api/types';
import type { PublicWalletTransaction } from '@/api/wallet.api';

export interface ReceiptPdfInput {
  user: PublicUser;
  transaction: PublicWalletTransaction;
  /** Optional employer/payer name the worker can fill in at receipt time. */
  payerName?: string | null;
}

export interface ReceiptPdfResult {
  ok: true;
  uri: string;
}

export interface ReceiptPdfFailure {
  ok: false;
  reason: 'unsupported' | 'failed';
  message: string;
}

export async function sharePayReceiptPdf(
  input: ReceiptPdfInput,
): Promise<ReceiptPdfResult | ReceiptPdfFailure> {
  let Print: typeof import('expo-print') | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Print = require('expo-print') as typeof import('expo-print');
  } catch {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'PDF export needs the expo-print package.',
    };
  }
  if (!Print?.printToFileAsync) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'PDF export not supported on this device.',
    };
  }

  try {
    const html = renderReceiptHtml(input);
    const { uri } = await Print.printToFileAsync({
      html,
      width: 595, // A4 portrait at 72dpi
      height: 842,
      base64: false,
    });
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: true, uri };
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: 'Share receipt',
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
    return { ok: true, uri };
  } catch (err) {
    return {
      ok: false,
      reason: 'failed',
      message: (err as Error)?.message ?? 'Receipt generation failed.',
    };
  }
}

function fmtINR(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function escape(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
        ? '&lt;'
        : c === '>'
          ? '&gt;'
          : c === '"'
            ? '&quot;'
            : '&#39;',
  );
}

function renderReceiptHtml({ user, transaction, payerName }: ReceiptPdfInput): string {
  const amount = Math.abs(transaction.amount);
  const receiptNumber = `DDR-${transaction.id.slice(-8).toUpperCase()}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    color: #1F2937;
    font-size: 11pt;
    line-height: 1.5;
    margin: 0;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #2563EB;
    padding-bottom: 12px;
  }
  .brand {
    font-size: 28pt;
    font-weight: 700;
    color: #2563EB;
    letter-spacing: -0.5px;
  }
  .meta {
    text-align: right;
    color: #6B7280;
    font-size: 9pt;
  }
  .meta strong { color: #111827; }
  h1 {
    font-size: 18pt;
    margin: 28px 0 4px;
    color: #111827;
  }
  .subhead {
    color: #6B7280;
    margin-bottom: 24px;
    font-size: 10pt;
  }
  .grid {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  .grid td {
    padding: 8px 0;
    vertical-align: top;
    border-bottom: 0.5px solid #E5E7EB;
  }
  .grid td.label {
    color: #6B7280;
    font-size: 10pt;
    width: 35%;
  }
  .grid td.value {
    font-weight: 600;
    color: #111827;
  }
  .amount-box {
    margin: 24px 0;
    padding: 18px 20px;
    background: #EFF6FF;
    border-left: 4px solid #2563EB;
    border-radius: 4px;
  }
  .amount-label {
    color: #1E40AF;
    font-size: 10pt;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    font-weight: 700;
  }
  .amount-value {
    color: #1E3A8A;
    font-size: 26pt;
    font-weight: 700;
    margin-top: 4px;
  }
  .signature {
    margin-top: 56px;
    display: flex;
    justify-content: space-between;
  }
  .sigBlock {
    width: 45%;
    border-top: 0.75px solid #9CA3AF;
    padding-top: 6px;
    font-size: 9pt;
    color: #6B7280;
  }
  .footer {
    margin-top: 64px;
    font-size: 8pt;
    color: #9CA3AF;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">Doondo</div>
    <div class="meta">
      <div>Receipt no. <strong>${escape(receiptNumber)}</strong></div>
      <div>Issued <strong>${escape(fmtDate(new Date().toISOString()))}</strong></div>
    </div>
  </div>

  <h1>Payment receipt</h1>
  <div class="subhead">For services rendered — issued by the worker named below.</div>

  <table class="grid">
    <tr>
      <td class="label">Received from</td>
      <td class="value">${escape(payerName ?? 'Cash payment')}</td>
    </tr>
    <tr>
      <td class="label">Received by</td>
      <td class="value">${escape(user.name)}</td>
    </tr>
    <tr>
      <td class="label">For</td>
      <td class="value">${escape(transaction.description)}</td>
    </tr>
    <tr>
      <td class="label">Work date</td>
      <td class="value">${escape(fmtDate(transaction.createdAt))}</td>
    </tr>
    <tr>
      <td class="label">Mode</td>
      <td class="value">Cash</td>
    </tr>
  </table>

  <div class="amount-box">
    <div class="amount-label">Amount received</div>
    <div class="amount-value">${escape(fmtINR(amount))}</div>
  </div>

  <div class="signature">
    <div class="sigBlock">${escape(user.name)} — Worker signature</div>
    <div class="sigBlock">${escape(payerName ?? 'Payer')} — Payer signature</div>
  </div>

  <div class="footer">
    Generated by Doondo · doondo.app · This receipt is a self-issued
    record of a cash transaction. Doondo is not a party to the payment.
  </div>
</body>
</html>`;
}
