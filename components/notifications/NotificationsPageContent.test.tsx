import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppNotification } from "@/types";

import NotificationsPageContent from "./NotificationsPageContent";

const {
  mockNotifications,
  mockMarkAsRead,
  mockMarkAllAsRead,
  mockState,
} = vi.hoisted(() => ({
  mockNotifications: [] as AppNotification[],
  mockMarkAsRead: vi.fn(),
  mockMarkAllAsRead: vi.fn(),
  mockState: { isLoading: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock("@/components/providers/NotificationProvider", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockNotifications.filter((n) => !n.read).length,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    isLoading: mockState.isLoading,
  }),
}));

function makeNotification(
  id: string,
  overrides: Partial<AppNotification> = {}
): AppNotification {
  return {
    id,
    escrowId: `escrow-${id}`,
    escrowItem: `Item ${id}`,
    type: "PENDING",
    message: `Message ${id}`,
    timestamp: new Date().toISOString(),
    read: false,
    ...overrides,
  };
}

describe("NotificationsPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifications.length = 0;
    mockState.isLoading = false;
    window.localStorage.clear();
  });

  it("renders skeleton while checking JWT", () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    render(<NotificationsPageContent />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("redirects to home when no JWT is present", async () => {
    const { useRouter } = await import("next/navigation");
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    });
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("shows empty state when there are no notifications", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    });
    expect(screen.getByText("Go to Dashboard")).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });

  it("renders notification rows when notifications exist", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    mockNotifications.push(
      makeNotification("n1", { escrowItem: "Widget A", message: "Shipped" }),
      makeNotification("n2", { escrowItem: "Widget B", message: "Funded" })
    );
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Widget A")).toBeInTheDocument();
    });
    expect(screen.getByText("Widget B")).toBeInTheDocument();
    expect(screen.getByText("Shipped")).toBeInTheDocument();
    expect(screen.getByText("Funded")).toBeInTheDocument();
  });

  it("filters notifications by search query", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    mockNotifications.push(
      makeNotification("n1", { escrowItem: "Alpha Widget" }),
      makeNotification("n2", { escrowItem: "Beta Gadget" })
    );
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Alpha Widget")).toBeInTheDocument();
    });

    const input = screen.getByTestId("notifications-search");
    fireEvent.change(input, { target: { value: "zzz_no_match" } });

    await waitFor(() => {
      expect(screen.getByText("No notifications match your search.")).toBeInTheDocument();
    });
  });

  it("shows no-match message when search yields no results", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    mockNotifications.push(makeNotification("n1", { escrowItem: "Widget" }));
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Widget")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("notifications-search"), {
      target: { value: "nonexistent" },
    });

    expect(
      screen.getByText("No notifications match your search.")
    ).toBeInTheDocument();
  });

  it("clears search when Clear search button is clicked", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    mockNotifications.push(makeNotification("n1", { escrowItem: "Widget" }));
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Widget")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("notifications-search"), {
      target: { value: "nonexistent" },
    });
    fireEvent.click(screen.getByText("Clear search"));

    expect(screen.getByText("Widget")).toBeInTheDocument();
  });

  it("links inbox rows to order tracking and marks read once on click", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    mockNotifications.push(
      makeNotification("notif-1", { escrowItem: "Test Item" })
    );
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Test Item")).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /Test Item/ });
    expect(link).toHaveAttribute("href", "/track/escrow-notif-1");
    fireEvent.click(link);
    expect(mockMarkAsRead).toHaveBeenCalledTimes(1);
    expect(mockMarkAsRead).toHaveBeenCalledWith("notif-1");
  });

  it("shows mark-all-as-read button when there are unread notifications", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    mockNotifications.push(makeNotification("n1"));
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /mark all as read/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /mark all as read/i }));
    expect(mockMarkAllAsRead).toHaveBeenCalled();
  });

  it("shows loading skeleton while notifications are loading", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    mockState.isLoading = true;
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("paginates notifications when there are more than 20 items", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    for (let i = 1; i <= 25; i++) {
      mockNotifications.push(
        makeNotification(`n${i}`, { escrowItem: `Item ${i}` })
      );
    }
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    // First page should show items 1-20
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 20")).toBeInTheDocument();
    expect(screen.queryByText("Item 21")).not.toBeInTheDocument();

    // Navigate to page 2
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Item 21")).toBeInTheDocument();
    });

    // Second page should show items 21-25
    expect(screen.getByText("Item 21")).toBeInTheDocument();
    expect(screen.getByText("Item 25")).toBeInTheDocument();
    expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
  });

  it("paginates filtered search results correctly", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    for (let i = 1; i <= 25; i++) {
      mockNotifications.push(
        makeNotification(`n${i}`, {
          escrowItem: i % 2 === 0 ? `Even ${i}` : `Odd ${i}`,
        })
      );
    }
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Odd 1")).toBeInTheDocument();
    });

    // Search for "Even" items (13 items: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26? no, only 25 items)
    fireEvent.change(screen.getByTestId("notifications-search"), {
      target: { value: "Even" },
    });

    await waitFor(() => {
      expect(screen.getByText("Even 2")).toBeInTheDocument();
    });

    // Should show first 20 filtered results (but only 13 exist)
    expect(screen.getByText("Even 2")).toBeInTheDocument();
    expect(screen.getByText("Even 20")).toBeInTheDocument();
    expect(screen.queryByText("Odd 1")).not.toBeInTheDocument();
  });

  it("adjusts page when search results shrink to fewer pages", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    for (let i = 1; i <= 25; i++) {
      mockNotifications.push(
        makeNotification(`n${i}`, { escrowItem: `Item ${i}` })
      );
    }
    render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    // Navigate to page 2
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Item 21")).toBeInTheDocument();
    });

    // Search for a term that matches only 5 items
    fireEvent.change(screen.getByTestId("notifications-search"), {
      target: { value: "Item 1" },
    });

    await waitFor(() => {
      // effectivePage uses Math.min(currentPage, totalPages), so it should show page 1 content
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    // Should show filtered results, not page 2 of the full list
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.queryByText("Item 21")).not.toBeInTheDocument();
  });

  it("adjusts page when provider data shrinks", async () => {
    window.localStorage.setItem("wallet.jwt", "valid-token");
    for (let i = 1; i <= 25; i++) {
      mockNotifications.push(
        makeNotification(`n${i}`, { escrowItem: `Item ${i}` })
      );
    }
    const { rerender } = render(<NotificationsPageContent />);
    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    // Navigate to page 2
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Item 21")).toBeInTheDocument();
    });

    // Simulate provider data shrinking to 10 items
    act(() => {
      mockNotifications.length = 0;
      for (let i = 1; i <= 10; i++) {
        mockNotifications.push(
          makeNotification(`n${i}`, { escrowItem: `Item ${i}` })
        );
      }
      rerender(<NotificationsPageContent />);
    });

    await waitFor(() => {
      // effectivePage uses Math.min(currentPage, totalPages), so it should show page 1 content
      expect(screen.getByText("Item 1")).toBeInTheDocument();
    });

    expect(screen.queryByText("Item 21")).not.toBeInTheDocument();
  });
});
