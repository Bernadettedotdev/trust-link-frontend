import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { NetworkProvider, useNetwork } from "@/components/providers/NetworkProvider";
import { buildContractInvocation } from "@/lib/stellar/contract";
import { signTransaction } from "@/lib/stellar/freighter";
import { EscrowStatusConst } from "@/types";

import type { PaymentFormProps } from "../PaymentForm";

const pipeline = vi.hoisted(() => ({
  createServer: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
  fromXDR: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Networks: {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
  },
  rpc: {
    Server: class {
      constructor(url: string) { pipeline.createServer(url); }
      sendTransaction = pipeline.sendTransaction;
      getTransaction = pipeline.getTransaction;
    },
    Api: { GetTransactionStatus: { NOT_FOUND: "NOT_FOUND", FAILED: "FAILED" } },
  },
  TransactionBuilder: { fromXDR: pipeline.fromXDR },
}));
vi.mock("@/hooks/useWallet", () => ({
  default: () => ({ status: "connected", publicKey: "GBUYER" }),
}));
vi.mock("@/lib/stellar/contract", () => ({
  buildContractInvocation: vi.fn(),
  parseContractError: vi.fn(),
}));
vi.mock("@/lib/stellar/freighter", () => ({ signTransaction: vi.fn() }));
vi.mock("@/lib/api", () => ({ patchBuyerContact: vi.fn() }));
vi.mock("@/lib/pdf", () => ({ generateReceiptPDF: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: () => "" }) }));

let PaymentForm: React.ComponentType<PaymentFormProps>;
const props: PaymentFormProps = {
  escrowId: "123",
  itemName: "Order",
  amount: 10,
  protocolFee: 0.5,
  total: 10.5,
  sellerAddress: "GSELLER",
  escrowContractId: "CESCROW",
  status: EscrowStatusConst.PENDING,
};
const networks = [
  {
    name: "testnet",
    contractNetwork: "TESTNET",
    passphrase: "Test SDF Network ; September 2015",
    rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
    explorer: "testnet",
    other: "mainnet",
  },
  {
    name: "mainnet",
    contractNetwork: "PUBLIC",
    passphrase: "Public Global Stellar Network ; September 2015",
    rpcUrl: "https://soroban.stellar.org",
    explorer: "public",
    other: "testnet",
  },
] as const;
const hash = "confirmed-transaction-hash";

function NetworkControls() {
  const { setNetwork } = useNetwork();
  return (
    <>
      <button onClick={() => setNetwork("mainnet")}>Switch to mainnet</button>
      <button onClick={() => setNetwork("testnet")}>Switch to testnet</button>
      <PaymentForm {...props} />
    </>
  );
}

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
  // Funding must use the selected provider config even if the deployment differs.
  vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE", "incorrect deployment passphrase");
  PaymentForm = (await import("../PaymentForm")).default;
});

afterAll(() => { vi.unstubAllEnvs(); });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(buildContractInvocation).mockReturnValue("unsigned-xdr");
  vi.mocked(signTransaction).mockReset().mockResolvedValue("signed-xdr");
  pipeline.fromXDR.mockReturnValue({ signed: true });
  pipeline.sendTransaction.mockResolvedValue({ status: "PENDING", hash });
  pipeline.getTransaction.mockResolvedValue({ status: "SUCCESS" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); });

describe.each(networks)("$name funding", (selected) => {
  function renderPayment() {
    localStorage.setItem("network.preferred", selected.name);
    return render(<NetworkProvider><NetworkControls /></NetworkProvider>);
  }

  function expectPipeline() {
    expect(buildContractInvocation).toHaveBeenCalledExactlyOnceWith({
      contractId: props.escrowContractId,
      method: "fund_escrow",
      args: [props.escrowId],
      sourceAccount: "GBUYER",
      network: selected.contractNetwork,
    });
    expect(signTransaction).toHaveBeenCalledExactlyOnceWith("unsigned-xdr", selected.passphrase);
    expect(pipeline.createServer).toHaveBeenCalledExactlyOnceWith(selected.rpcUrl);
    expect(pipeline.fromXDR).toHaveBeenCalledExactlyOnceWith("signed-xdr", selected.passphrase);
    expect(pipeline.sendTransaction).toHaveBeenCalledExactlyOnceWith({ signed: true });
    expect(pipeline.getTransaction).toHaveBeenCalledExactlyOnceWith(hash);
  }

  async function expectExplorer() {
    expect(await screen.findByRole("link", { name: "View on Stellar Expert" })).toHaveAttribute(
      "href", `https://stellar.expert/explorer/${selected.explorer}/tx/${hash}`
    );
  }

  it("uses the selected network for building, signing, submission and explorer links", async () => {
    renderPayment();
    fireEvent.click(screen.getByRole("button", { name: "Pay with Freighter" }));

    await expectExplorer();
    expectPipeline();
  });

  it("retains the attempt network when the UI changes during signing and after confirmation", async () => {
    let resolveSignature: ((xdr: string) => void) | undefined;
    vi.mocked(signTransaction).mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveSignature = resolve;
    }));
    renderPayment();
    fireEvent.click(screen.getByRole("button", { name: "Pay with Freighter" }));
    await waitFor(() => expect(signTransaction).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: `Switch to ${selected.other}` }));
    await act(async () => { resolveSignature?.("signed-xdr"); });

    await expectExplorer();
    expectPipeline();
    fireEvent.click(screen.getByRole("button", { name: `Switch to ${selected.name}` }));
    fireEvent.click(screen.getByRole("button", { name: `Switch to ${selected.other}` }));
    await expectExplorer();
  });
});

it("uses the newly selected network for a retry after a rejected attempt", async () => {
  localStorage.setItem("network.preferred", "testnet");
  vi.mocked(signTransaction).mockRejectedValueOnce(new Error("User rejected transaction"));
  render(<NetworkProvider><NetworkControls /></NetworkProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Pay with Freighter" }));
  await screen.findByText("Transaction was rejected in wallet");
  expect(pipeline.sendTransaction).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Switch to mainnet" }));
  fireEvent.click(screen.getByRole("button", { name: "Pay with Freighter" }));

  expect(await screen.findByRole("link", { name: "View on Stellar Expert" })).toHaveAttribute(
    "href", `https://stellar.expert/explorer/public/tx/${hash}`
  );
  expect(signTransaction).toHaveBeenLastCalledWith("unsigned-xdr", networks[1].passphrase);
  expect(pipeline.createServer).toHaveBeenCalledExactlyOnceWith(networks[1].rpcUrl);
  expect(pipeline.fromXDR).toHaveBeenCalledExactlyOnceWith("signed-xdr", networks[1].passphrase);
  expect(buildContractInvocation).toHaveBeenLastCalledWith(expect.objectContaining({ network: "PUBLIC" }));
});
