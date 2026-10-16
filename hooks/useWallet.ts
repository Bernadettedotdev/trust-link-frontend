"use client";

import { useContext } from "react";

import { WalletContext } from "@/components/providers/WalletProvider";

export { SESSION_KEY } from "@/lib/session";

export default function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}

export const useWalletContext = useWallet;
