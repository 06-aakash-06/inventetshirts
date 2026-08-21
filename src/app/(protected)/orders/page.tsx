"use client"
import { useState, useMemo } from "react";
import { useOrders } from "@/context/OrdersContext";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default function OrdersPage() {
  const { orders, loading } = useOrders();
  const [search, setSearch] = useState("");
  const [filterPayment, setFilterPayment] = useState("ALL");
  const [filterCollection, setFilterCollection] = useState("ALL");

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const s = search.trim().toLowerCase();
      const matchesSearch = !s || (
        String(o["Order ID"] || "").toLowerCase().includes(s) ||
        String(o["Name"] || "").toLowerCase().includes(s) ||
        String(o["Register Number"] || "").toLowerCase().includes(s) ||
        String(o["Digital ID"] || "").toLowerCase().includes(s) ||
        String(o["Phone Number"] || "").toLowerCase().includes(s) ||
        String(o["College Email"] || "").toLowerCase().includes(s)
      );

      const matchesPayment = filterPayment === "ALL" || o["Payment Status"] === filterPayment;
      const matchesCollection = filterCollection === "ALL" || o["Collection Status"] === filterCollection;

      return matchesSearch && matchesPayment && matchesCollection;
    }).sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());
  }, [orders, search, filterPayment, filterCollection]);

  return (
    <div className="p-4 sm:p-8 space-y-0 container mx-auto flex-1 flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-border pb-4 mb-12">
        <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter uppercase leading-none">Orders</h1>
      </div>

      <div className="border-t-2 border-l-2 border-border mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          <div className="p-6 border-r-2 border-b-2 border-border bg-background flex flex-col justify-end min-h-[120px] group hover:bg-foreground hover:text-background transition-colors duration-0 cursor-default">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 group-hover:text-background">Search</label>
            <input 
              type="text"
              placeholder="ID, Name, Reg No..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border-b-2 border-border group-hover:border-background font-mono text-xl focus:outline-none focus:border-primary uppercase placeholder:text-muted-foreground"
            />
          </div>
          <div className="p-6 border-r-2 border-b-2 border-border bg-background flex flex-col justify-end min-h-[120px] group hover:bg-foreground hover:text-background transition-colors duration-0">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 group-hover:text-background">Payment</label>
            <select 
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="w-full bg-transparent border-b-2 border-border group-hover:border-background font-bold text-xl focus:outline-none uppercase cursor-pointer"
            >
              <option value="ALL">ALL</option>
              <option value="PAID">PAID</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>
          <div className="p-6 border-r-2 border-b-2 border-border bg-background flex flex-col justify-end min-h-[120px] group hover:bg-foreground hover:text-background transition-colors duration-0">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 group-hover:text-background">Collection</label>
            <select 
              value={filterCollection}
              onChange={(e) => setFilterCollection(e.target.value)}
              className="w-full bg-transparent border-b-2 border-border group-hover:border-background font-bold text-xl focus:outline-none uppercase cursor-pointer"
            >
              <option value="ALL">ALL</option>
              <option value="COLLECTED">COLLECTED</option>
              <option value="NOT_COLLECTED">UNCOLLECTED</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto border-t-2 border-l-2 border-border">
        {loading && orders.length === 0 ? (
          <div className="p-8 text-center text-2xl font-black uppercase tracking-widest border-r-2 border-b-2 border-border">Loading...</div>
        ) : (
          <div className="grid grid-cols-1">
            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-xl font-bold uppercase tracking-widest text-muted-foreground border-r-2 border-b-2 border-border">
                No orders found
              </div>
            ) : (
              filteredOrders.map(o => (
                <div key={o["Order ID"]} className="flex flex-col xl:flex-row border-r-2 border-b-2 border-border hover:bg-muted transition-colors duration-0">
                  <div className="p-4 border-b-2 xl:border-b-0 xl:border-r-2 border-border w-full xl:w-48 flex-shrink-0 flex items-center">
                    <span className="text-xl font-black tracking-tighter">{o["Order ID"]}</span>
                  </div>
                  
                  <div className="p-4 flex-1 flex flex-col justify-center xl:border-r-2 border-border border-b-2 xl:border-b-0">
                    <p className="text-xl font-black uppercase leading-none mb-1">{o["Name"]}</p>
                    <div className="flex flex-wrap gap-4 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
                      <span>{o["Register Number"]}</span>
                      {o["Digital ID"] && <span>{o["Digital ID"]}</span>}
                      <span>{o["Payment Method"]}</span>
                    </div>
                  </div>

                  <div className="p-4 border-b-2 xl:border-b-0 xl:border-r-2 border-border w-full xl:w-32 flex-shrink-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Size</span>
                    <span className="text-2xl font-black">{o["T-Shirt Size"]}</span>
                  </div>

                  <div className="flex flex-row xl:flex-col w-full xl:w-40 flex-shrink-0 border-b-2 xl:border-b-0 xl:border-r-2 border-border">
                    <div className={`flex-1 p-2 flex items-center justify-center border-r-2 xl:border-r-0 xl:border-b-2 border-border ${o["Payment Status"] === 'PAID' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}>
                      <span className="text-[10px] font-black uppercase tracking-widest">{o["Payment Status"]}</span>
                    </div>
                    <div className={`flex-1 p-2 flex items-center justify-center border-r-2 xl:border-r-0 xl:border-b-2 border-border ${o["Collection Status"] === 'COLLECTED' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>
                      <span className="text-[10px] font-black uppercase tracking-widest">{o["Collection Status"] === 'COLLECTED' ? 'COLLECTED' : 'UNCOLLECTED'}</span>
                    </div>
                    <div className="flex-1 p-2 flex items-center justify-center bg-secondary text-secondary-foreground">
                      <span className="text-[10px] font-black uppercase tracking-widest">{o["QR Sent"] ? 'QR SENT' : 'NO QR'}</span>
                    </div>
                  </div>

                  <div className="p-4 w-full xl:w-32 flex-shrink-0 flex items-center justify-center">
                    <Link href={`/orders/${o["Order ID"]}`} className="w-full">
                      <button className="w-full py-2 border-2 border-foreground font-black uppercase tracking-widest text-xs hover:bg-foreground hover:text-background transition-colors duration-0">
                        VIEW
                      </button>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
