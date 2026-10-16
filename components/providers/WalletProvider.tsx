"use client";

import { jwtDecode } from "jwt-decode";
import { createContext, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useNetwork } from "@/components/providers/NetworkProvider";
import { captureError, setLoggerUser } from "@/lib/logger";
import { handleSessionExpired, PUBLIC_KEY_STORAGE_KEY, SESSION_EXPIRED_EVENT, SESSION_KEY } from "@/lib/session";
import { getChallenge, verifyChallenge } from "@/lib/stellar";
import { connectFreighter, isConnected as freighterIsConnected, isFreighterInstalled, signTransaction as freighterSignTransaction } from "@/lib/stellar/freighter";

export interface WalletContextType {
  publicKey: string | null;
  token: string | null;
  jwt: string | null;
  isConnected: boolean;
  isInstalled: boolean;
  status: "loading" | "connected" | "disconnected" | "not-installed" | "error";
  connect: () => Promise<boolean>;
  disconnect: () => void;
  signTransaction: (xdr: string, network?: string) => Promise<string>;
  isLoading: boolean;
  walletReady: boolean;
  error: Error | null;
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);
interface JwtPayload { exp: number; }

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [walletReady, setWalletReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { network } = useNetwork();
  const tokenRef = useRef<string | null>(null);
  const stellarNetwork = network === "mainnet" ? "PUBLIC" : "TESTNET";

  const authenticate = useCallback(async (key: string) => {
    try {
      const challenge = await getChallenge(key);
      const signed = await freighterSignTransaction(challenge, stellarNetwork);
      const jwt = await verifyChallenge(signed);
      setToken(jwt);
      localStorage.setItem(SESSION_KEY, jwt);
      return jwt;
    } catch (caught) {
      captureError(caught, { scope: "auth", action: "authenticate" });
      toast.error("Authentication failed");
      throw caught;
    }
  }, [stellarNetwork]);

  const clearWallet = useCallback(() => {
    setToken(null);
    setPublicKey(null);
    tokenRef.current = null;
    setLoggerUser(null);
    handleSessionExpired();
  }, []);

  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const installed = await isFreighterInstalled();
      if (!mounted) return;
      setIsInstalled(installed);
      const storedKey = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
      if (storedKey && installed && (await freighterIsConnected()).isConnected) {
        setPublicKey(storedKey);
        setLoggerUser(storedKey);
        try { await authenticate(storedKey); } catch (caught) { captureError(caught, { scope: "wallet", action: "restoreSession" }); }
      }
      if (mounted) { setIsLoading(false); setWalletReady(true); }
    })();
    return () => { mounted = false; };
  }, [authenticate]);

  useEffect(() => {
    const onUnauthorized = () => { if (tokenRef.current) clearWallet(); };
    window.addEventListener(SESSION_EXPIRED_EVENT, onUnauthorized);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onUnauthorized);
  }, [clearWallet]);

  useEffect(() => {
    if (!token || !publicKey) return;
    try {
      const timeLeft = jwtDecode<JwtPayload>(token).exp * 1000 - Date.now();
      const timeout = window.setTimeout(() => { void authenticate(publicKey); }, Math.max(0, timeLeft - 300000));
      return () => window.clearTimeout(timeout);
    } catch (caught) {
      captureError(caught, { scope: "auth", action: "decodeSessionToken" });
      clearWallet();
    }
  }, [token, publicKey, authenticate, clearWallet]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!await isFreighterInstalled()) throw new Error("Freighter is not installed");
      const key = await connectFreighter();
      setPublicKey(key);
      setLoggerUser(key);
      localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, key);
      await authenticate(key);
      toast.success("Wallet connected");
      return true;
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error("Failed to connect wallet");
      setError(nextError);
      toast.error(nextError.message);
      return false;
    } finally { setIsLoading(false); }
  }, [authenticate]);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setToken(null);
    setLoggerUser(null);
    localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    toast.success("Wallet disconnected");
  }, []);

  const signTransaction = useCallback((xdr: string, networkOverride?: string) => freighterSignTransaction(xdr, networkOverride || stellarNetwork), [stellarNetwork]);
  const status = isLoading ? "loading" : publicKey ? "connected" : !isInstalled ? "not-installed" : error ? "error" : "disconnected";

  return <WalletContext.Provider value={{ publicKey, token, jwt: token, isConnected: Boolean(publicKey), isInstalled, status, connect, disconnect, signTransaction, isLoading, walletReady, error }}>{children}</WalletContext.Provider>;
}

export default WalletProvider;
