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
      }
    } catch (err: any) {
      // Only disrupt the UI with an error if it's the initial load. Ignore background polling transient errors.
      if (isMounted.current && !hasData.current) setError(err.message || "Failed to fetch orders");
    } finally {
      if (isMounted.current) {
        setLoading(false);
        timeoutRef.current = setTimeout(fetchOrders, 3000);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchOrders();
    return () => {
      isMounted.current = false;
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
