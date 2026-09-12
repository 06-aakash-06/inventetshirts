"use client"
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { getOrders, Order } from "@/lib/api";
import { ORDER_CACHE_UPDATED_EVENT, readOrdersSnapshot, saveOrdersSnapshot } from "@/lib/order-cache";

interface OrdersContextType {
  orders: Order[];
  loading: boolean;
  error: string | null;
  lastSynced: Date;
  manualSync: () => void;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);
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
        saveOrdersSnapshot(data);
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
      const snapshot = readOrdersSnapshot();
      if (snapshot && isMounted.current) {
          setOrders(snapshot.data);
          hasData.current = true;
          setLoading(false);
          setLastSynced(new Date(snapshot.savedAt || Date.now()));
      }
      void fetchOrders();
    }, 0);
    const handleCacheUpdate = () => {
      const snapshot = readOrdersSnapshot();
      if (!snapshot || !isMounted.current) return;
      setOrders(snapshot.data);
      hasData.current = true;
      setLoading(false);
      setLastSynced(new Date(snapshot.savedAt || Date.now()));
    };
    window.addEventListener(ORDER_CACHE_UPDATED_EVENT, handleCacheUpdate);
    window.addEventListener("storage", handleCacheUpdate);
    return () => {
      isMounted.current = false;
      window.clearTimeout(initialLoad);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener(ORDER_CACHE_UPDATED_EVENT, handleCacheUpdate);
      window.removeEventListener("storage", handleCacheUpdate);
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
