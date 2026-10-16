import { describe, expect, it, vi } from 'vitest';

import {
  formatDateTime,
  formatTransactionHistoryData,
  generatePDFFromElement,
  generateReceiptPDF,
  generateSummaryPDF,
  sanitizePdfFilename,
  truncateForDisplay,
} from '@/lib/pdf';
import type { Escrow } from '@/types';

// ── jsPDF / html2canvas mocks ────────────────────────────────────────────────
// Both libraries are dynamically imported inside lib/pdf.ts, so mocking the
// module factory intercepts `import('jspdf')` / `import('html2canvas')`.

const { mockState } = vi.hoisted(() => ({
  mockState: {
    calls: [] as Array<{ method: string; args: unknown[] }>,
    savedFilenames: [] as string[],
  },
}));

function record(method: string, args: unknown[]): void {
  mockState.calls.push({ method, args });
}

vi.mock('jspdf', () => {
  class MockJsPDF {
    internal = {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    };

    setFontSize(...args: unknown[]) {
      record('setFontSize', args);
    }
    setFont(...args: unknown[]) {
      record('setFont', args);
    }
    setFillColor(...args: unknown[]) {
      record('setFillColor', args);
    }
    setDrawColor(...args: unknown[]) {
      record('setDrawColor', args);
    }
    setTextColor(...args: unknown[]) {
      record('setTextColor', args);
    }
    setLineWidth(...args: unknown[]) {
      record('setLineWidth', args);
    }
    text(...args: unknown[]) {
      record('text', args);
    }
    rect(...args: unknown[]) {
      record('rect', args);
    }
    line(...args: unknown[]) {
      record('line', args);
    }
    addImage(...args: unknown[]) {
      record('addImage', args);
    }
    addPage(...args: unknown[]) {
      record('addPage', args);
    }
    splitTextToSize(value: string) {
      return [value];
    }
    save(filename: string) {
      mockState.savedFilenames.push(filename);
      record('save', [filename]);
    }
  }

  return { default: MockJsPDF };
});

vi.mock('html2canvas', () => {
  return {
    default: vi.fn(async () => ({
      width: 1000,
      height: 3000,
      toDataURL: () => 'data:image/png;base64,FULL',
    })),
  };
});

function resetMocks() {
  mockState.calls.length = 0;
  mockState.savedFilenames.length = 0;
}

function callsOf(method: string) {
  return mockState.calls.filter((c) => c.method === method);
}

describe('PDF Export Utility', () => {
  const longBuyerId = 'buyer-4567890abcdef';
  const mockEscrows: Escrow[] = [
    {
      id: 'escrow-1',
      vendorId: 'vendor-123',
      buyerId: longBuyerId,
      item: 'Electronics Item',
      amount: 100,
      status: 'COMPLETED',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-20T14:00:00Z',
      history: [],
    },
    {
      id: 'escrow-2',
      vendorId: 'vendor-123',
      buyerId: 'buyer-789',
      item: 'Clothing',
      amount: 50,
      status: 'SHIPPED',
      createdAt: '2024-01-16T11:00:00Z',
      updatedAt: '2024-01-18T15:30:00Z',
      history: [],
    },
    {
      id: 'escrow-3',
      vendorId: 'vendor-123',
      buyerId: undefined,
      item: 'Books',
      amount: 30,
      status: 'PENDING',
      createdAt: '2024-01-17T09:00:00Z',
      updatedAt: '2024-01-17T09:00:00Z',
      history: [],
    },
  ];

  describe('formatDateTime', () => {
    it('pins the locale and time zone so output is deterministic', () => {
      // 2024-01-15T10:30:00Z rendered in UTC, not the host locale.
      expect(formatDateTime('2024-01-15T10:30:00Z')).toBe('1/15/2024, 10:30:00 AM');
    });

    it('never returns "Invalid Date"', () => {
      expect(formatDateTime('not-a-date')).toBe('N/A');
      expect(formatDateTime(undefined)).toBe('N/A');
      expect(formatDateTime(null)).toBe('N/A');
      expect(formatDateTime('')).toBe('N/A');
    });

    it('accepts Date and epoch values', () => {
      expect(formatDateTime(new Date('2024-06-01T00:00:00Z'))).toBe('6/1/2024, 12:00:00 AM');
    });
  });

  describe('truncateForDisplay', () => {
    it('truncates long values', () => {
      expect(truncateForDisplay(longBuyerId)).toBe('buyer-...abcdef');
    });

    it('leaves short values untouched (no abc...abc duplication)', () => {
      expect(truncateForDisplay('abc')).toBe('abc');
      expect(truncateForDisplay('abcdef')).toBe('abcdef');
      expect(truncateForDisplay('buyer-789')).toBe('buyer-789');
    });
  });

  describe('sanitizePdfFilename', () => {
    it('appends a .pdf extension when missing', () => {
      expect(sanitizePdfFilename('report')).toBe('report.pdf');
    });

    it('keeps an existing extension', () => {
      expect(sanitizePdfFilename('report.PDF')).toBe('report.PDF');
    });

    it('strips path traversal and directory components', () => {
      expect(sanitizePdfFilename('../../etc/passwd')).toBe('passwd.pdf');
      expect(sanitizePdfFilename('evil;rm -rf /')).toBe('evil_rm_-rf_.pdf');
    });

    it('falls back when the name is empty', () => {
      expect(sanitizePdfFilename('', 'fallback.pdf')).toBe('fallback.pdf');
      expect(sanitizePdfFilename('...')).toBe('export.pdf');
    });
  });

  describe('formatTransactionHistoryData', () => {
    it('should calculate correct totals', () => {
      const result = formatTransactionHistoryData(mockEscrows);
      expect(result.totalTransactions).toBe(3);
      expect(result.totalAmount).toBe(180);
    });

    it('should generate correct status breakdown', () => {
      const result = formatTransactionHistoryData(mockEscrows);
      expect(result.statusBreakdown).toEqual({
        COMPLETED: 1,
        SHIPPED: 1,
        PENDING: 1,
      });
    });

    it('should format transaction data correctly', () => {
      const result = formatTransactionHistoryData(mockEscrows);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0]).toMatchObject({
        id: 'escrow-1',
        item: 'Electronics Item',
        amount: 100,
        status: 'COMPLETED',
      });
    });

    it('formats createdAt with the pinned locale/timezone', () => {
      const result = formatTransactionHistoryData(mockEscrows);
      expect(result.transactions[0].createdAt).toBe('1/15/2024, 10:30:00 AM');
    });

    it('should handle missing buyerId', () => {
      const result = formatTransactionHistoryData(mockEscrows);
      expect(result.transactions[2].buyerId).toBe('N/A');
    });

    it('should truncate buyer IDs without duplicating short ones', () => {
      const result = formatTransactionHistoryData(mockEscrows);
      expect(result.transactions[0].buyerId).toBe('buyer-...abcdef');
      expect(result.transactions[1].buyerId).toBe('buyer-789');
    });

    it('ignores non-finite amounts instead of producing NaN totals', () => {
      const result = formatTransactionHistoryData([
        { ...mockEscrows[0], amount: Number.NaN },
        { ...mockEscrows[1], amount: Number.POSITIVE_INFINITY },
        { ...mockEscrows[2], amount: 30 },
      ]);
      expect(result.totalAmount).toBe(30);
      expect(result.transactions[0].amount).toBe(0);
      expect(result.transactions[1].amount).toBe(0);
    });

    it('should handle empty escrow list', () => {
      const result = formatTransactionHistoryData([]);
      expect(result.totalTransactions).toBe(0);
      expect(result.totalAmount).toBe(0);
      expect(result.statusBreakdown).toEqual({});
      expect(result.transactions).toHaveLength(0);
    });
  });

  describe('generateSummaryPDF', () => {
    it('creates a PDF and saves with a sanitized filename', async () => {
      resetMocks();
      await generateSummaryPDF(mockEscrows, 'vendor-123', 'custom-name.pdf');
      expect(mockState.savedFilenames).toEqual(['custom-name.pdf']);
    });

    it('does not let the last column overflow the content width', async () => {
      resetMocks();
      await generateSummaryPDF(mockEscrows, 'vendor-123', 'test.pdf');

      // Column widths must sum to `pageWidth - 2 * margin` (210 - 30 = 180),
      // so the sixth header lands at x=165 and ends at the right margin.
      const headerCalls = callsOf('text').filter((c) =>
        ['Item', 'Buyer ID', 'Amount', 'Status', 'Date', 'Transaction ID'].includes(
          String(c.args[0])
        )
      );
      const xPositions = headerCalls.map((c) => Number(c.args[1]));
      expect(xPositions).toEqual([15, 45, 85, 110, 130, 165]);
      expect(xPositions[xPositions.length - 1] + 30).toBe(210 - 15);
    });

    it('paints the alternating row background before the row text', async () => {
      resetMocks();
      await generateSummaryPDF(mockEscrows, 'vendor-123', 'test.pdf');

      const firstRect = mockState.calls.findIndex(
        (c) => c.method === 'rect' && c.args[4] === 'F'
      );
      const firstRowText = mockState.calls.findIndex(
        (c) => c.method === 'text' && c.args[0] === 'Electronics Item'
      );
      expect(firstRect).toBeGreaterThanOrEqual(0);
      expect(firstRowText).toBeGreaterThanOrEqual(0);
      expect(firstRect).toBeLessThan(firstRowText);
    });

    it('paginates long reports and keeps the footer off the last row', async () => {
      resetMocks();
      const many: Escrow[] = Array.from({ length: 120 }, (_, i) => ({
        ...mockEscrows[0],
        id: `escrow-${i}`,
        item: `Item ${i}`,
      }));

      await generateSummaryPDF(many, 'vendor-123', 'long.pdf');

      expect(callsOf('addPage').length).toBeGreaterThan(0);
      const footerIndex = mockState.calls.findIndex(
        (c) =>
          c.method === 'text' &&
          c.args[0] === 'This is an automatically generated report from TrustLink.'
      );
      expect(footerIndex).toBeGreaterThanOrEqual(0);
      // The footer must be drawn after a page break when the page is full.
      const lastAddPage = mockState.calls.reduce(
        (acc, c, idx) => (c.method === 'addPage' ? idx : acc),
        -1
      );
      expect(lastAddPage).toBeGreaterThanOrEqual(0);
      expect(footerIndex).toBeGreaterThan(lastAddPage);
    });

    it('runs with an empty escrow list', async () => {
      resetMocks();
      await generateSummaryPDF([], 'vendor-123');
      expect(mockState.savedFilenames).toEqual(['transaction-history.pdf']);
    });
  });

  describe('generatePDFFromElement', () => {
    it('tiles a tall canvas across multiple pages using top-aligned slices', async () => {
      resetMocks();

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: vi.fn() }),
            toDataURL: () => 'data:image/png;base64,SLICE',
          } as unknown as HTMLElement;
        }
        return origCreateElement(tag);
      });

      const element = origCreateElement('div') as HTMLElement;
      await generatePDFFromElement(element, { filename: 'report' });

      // Canvas is 1000×3000 px → 630mm tall at 210mm wide → 3 pages.
      const images = callsOf('addImage');
      expect(images).toHaveLength(3);
      // Each slice is added at the TOP of its own page, never a negative y.
      for (const call of images) {
        expect(call.args[3]).toBe(0);
        expect(call.args[4]).toBe(210);
      }
      expect(callsOf('addPage')).toHaveLength(2);
      expect(mockState.savedFilenames).toEqual(['report.pdf']);

      vi.restoreAllMocks();
    });
  });

  describe('generateReceiptPDF', () => {
    const validReceipt = {
      escrowId: 'escrow-1',
      itemName: 'Electronics Item',
      amount: 100,
      protocolFee: 5,
      txHash: 'abc123',
      timestamp: '2024-01-15T10:30:00Z',
    };

    it('renders a valid receipt', async () => {
      resetMocks();
      await generateReceiptPDF(validReceipt);
      expect(mockState.savedFilenames).toEqual(['trustlink-receipt-escrow-1.pdf']);
    });

    it('rejects negative amounts', async () => {
      resetMocks();
      await expect(
        generateReceiptPDF({ ...validReceipt, amount: -5 })
      ).rejects.toThrow(/Invalid receipt amount/);
    });

    it('rejects NaN totals', async () => {
      resetMocks();
      await expect(
        generateReceiptPDF({ ...validReceipt, total: Number.NaN })
      ).rejects.toThrow(/Invalid receipt total/);
    });

    it('rejects negative totals', async () => {
      resetMocks();
      await expect(
        generateReceiptPDF({ ...validReceipt, total: -1 })
      ).rejects.toThrow(/Invalid receipt total/);
    });

    it('sanitises a traversal escrowId out of the default filename', async () => {
      resetMocks();
      await generateReceiptPDF({ ...validReceipt, escrowId: '../../etc/passwd' });
      expect(mockState.savedFilenames).toEqual(['passwd.pdf']);
    });

    it('forces a .pdf extension', async () => {
      resetMocks();
      await generateReceiptPDF(validReceipt, 'receipt');
      expect(mockState.savedFilenames).toEqual(['receipt.pdf']);
    });
  });
});
