"use client"
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { getOrders, Order } from "@/lib/api";

interface OrdersContextType {
  orders: Order[];
  loading: boolean;
  error: string | null;
  lastSynced: Date;
  manualSync: () => void;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);
// v2 discards snapshots created before server-side revision validation was
// added, preventing an old browser count from appearing beside a fresh
// dashboard count after deployment.
const ORDERS_STORAGE_KEY = "invente-orders-v2";
const ORDERS_POLL_MS = 15000;

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const hasData = useRef(false);

  const fetchOrders = async () => {
    try {
      const data = await getOrders();
      if (isMounted.current) {
        setOrders(data);
        hasData.current = true;
        setLastSynced(new Date());
        setError(null);
        try {
          window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
        } catch {
          // Browser storage is only a stale-data convenience, never a requirement.
        }
      }
    } catch (err: any) {
      // Only disrupt the UI with an error if it's the initial load. Ignore background polling transient errors.
      if (isMounted.current && !hasData.current) setError(err.message || "Failed to fetch orders");
    } finally {
      if (isMounted.current) {
        setLoading(false);
        timeoutRef.current = setTimeout(fetchOrders, ORDERS_POLL_MS);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    const initialLoad = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(ORDERS_STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : null;
        if (Array.isArray(parsed?.data) && parsed.data.length > 0 && isMounted.current) {
          setOrders(parsed.data);
          hasData.current = true;
          setLoading(false);
          setLastSynced(new Date(Number(parsed.savedAt) || Date.now()));
        }
      } catch {
        // Ignore malformed/blocked browser storage and use the live request.
      }
      void fetchOrders();
    }, 0);
    return () => {
      isMounted.current = false;
      window.clearTimeout(initialLoad);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const manualSync = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoading(true);
    fetchOrders();
  };

  return (
    <OrdersContext.Provider value={{ orders, loading, error, lastSynced, manualSync, setOrders }}>
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) throw new Error("useOrders must be used within OrdersProvider");
  return context;
}
