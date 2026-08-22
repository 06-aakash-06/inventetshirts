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

  const cyclePayment = () => {
    if (filterPayment === "ALL") setFilterPayment("PAID");
    else if (filterPayment === "PAID") setFilterPayment("PENDING");
    else setFilterPayment("ALL");
  };

  const cycleCollection = () => {
    if (filterCollection === "ALL") setFilterCollection("COLLECTED");
    else if (filterCollection === "COLLECTED") setFilterCollection("NOT_COLLECTED");
    else setFilterCollection("ALL");
  };

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-border pb-4 mb-8 sm:mb-12">
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none">Orders</h1>
      </div>

      <div className="border-t-2 border-l-2 border-border mb-8 sm:mb-12">
        <div className="flex flex-col lg:flex-row w-full">
          <div 
            className="flex-1 p-4 sm:p-6 border-r-2 border-b-2 border-border bg-background flex flex-col justify-end min-h-[120px] group hover:bg-foreground hover:text-background transition-colors duration-300 cursor-text"
            onClick={() => document.getElementById('search-input')?.focus()}
          >
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 group-hover:text-background cursor-pointer">Search</label>
            <input 
              id="search-input"
              type="text"
              placeholder="ID, Name, Reg No..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border-b-2 border-border group-hover:border-background font-mono text-lg sm:text-xl focus:outline-none focus:border-primary uppercase placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-row w-full lg:w-1/2 flex-shrink-0">
            <button 
              onClick={cyclePayment}
              className="flex-1 p-4 sm:p-6 border-r-2 border-b-2 border-border bg-background flex flex-col justify-end min-h-[120px] group hover:bg-foreground hover:text-background transition-colors duration-300 text-left focus:outline-none"
            >
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 group-hover:text-background">Payment</span>
              <span className="font-bold text-xl sm:text-2xl uppercase tracking-tighter">{filterPayment}</span>
            </button>
            <button 
              onClick={cycleCollection}
              className="flex-1 p-4 sm:p-6 border-r-2 border-b-2 border-border bg-background flex flex-col justify-end min-h-[120px] group hover:bg-foreground hover:text-background transition-colors duration-300 text-left focus:outline-none"
            >
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 group-hover:text-background">Collection</span>
              <span className="font-bold text-xl sm:text-2xl uppercase tracking-tighter">{filterCollection === "NOT_COLLECTED" ? "UNCOLLECTED" : filterCollection}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto border-t-2 border-l-2 border-border">
        {loading && orders.length === 0 ? (
          <div className="p-8 text-center text-2xl font-black uppercase tracking-widest border-r-2 border-b-2 border-border">Loading...</div>
        ) : (
          <div className="w-full">
            <div className="flex flex-col">
              {filteredOrders.length === 0 ? (
                <div className="p-8 text-center text-xl font-bold uppercase tracking-widest text-muted-foreground border-r-2 border-b-2 border-border">
                  No orders found
                </div>
              ) : (
                filteredOrders.map(o => (
                  <div key={o["Order ID"]} className="flex flex-col xl:flex-row border-r-2 border-b-2 border-border hover:bg-muted transition-colors duration-300">
                    
                    {/* Top Row on Mobile, Left Col on Desktop */}
                    <div className="flex flex-row xl:w-48 border-b-2 xl:border-b-0 xl:border-r-2 border-border">
                      <div className="p-4 flex-1 xl:w-full flex items-center border-r-2 xl:border-r-0 border-border">
                        <span className="text-xl font-black tracking-tighter">{o["Order ID"]}</span>
                      </div>
                      <div className="p-4 w-24 xl:hidden flex-shrink-0 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Size</span>
                        <span className="text-2xl font-black">{o["T-Shirt Size"]}</span>
                      </div>
                    </div>
                    
                    {/* Main Details */}
                    <div className="p-4 flex-1 flex flex-col justify-center border-b-2 xl:border-b-0 xl:border-r-2 border-border">
                      <p className="text-xl font-black uppercase leading-none mb-1">{o["Name"]}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mt-1">
                        {o["Digital ID"] && <span>{o["Digital ID"]}</span>}
                        <span>{o["Payment Method"]}</span>
                      </div>
                    </div>

                    {/* Desktop Size (Hidden on Mobile) */}
                    <div className="hidden xl:flex p-4 w-32 flex-shrink-0 flex-col items-center justify-center border-r-2 border-border">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Size</span>
                      <span className="text-2xl font-black">{o["T-Shirt Size"]}</span>
                    </div>

                    {/* Status Row (Mobile: 3 cols, Desktop: 3 stacked rows) */}
                    <div className="flex flex-row xl:flex-col w-full xl:w-40 flex-shrink-0 border-b-2 xl:border-b-0 xl:border-r-2 border-border">
                      <div className={`flex-1 p-3 flex items-center justify-center border-r-2 xl:border-r-0 xl:border-b-2 border-border ${o["Payment Status"] === 'PAID' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}>
                        <span className="text-[10px] font-black uppercase tracking-widest">{o["Payment Status"]}</span>
                      </div>
                      <div className={`flex-1 p-3 flex items-center justify-center border-r-2 xl:border-r-0 xl:border-b-2 border-border ${o["Collection Status"] === 'COLLECTED' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>
                        <span className="text-[10px] font-black uppercase tracking-widest">{o["Collection Status"] === 'COLLECTED' ? 'COLLECTED' : 'UNCOLLECTED'}</span>
                      </div>
                      <div className="flex-1 p-3 flex items-center justify-center bg-secondary text-secondary-foreground">
                        <span className="text-[10px] font-black uppercase tracking-widest text-center">{o["QR Sent"] ? 'QR SENT' : 'NO QR'}</span>
                      </div>
                    </div>

                    {/* View Button */}
                    <div className="p-4 w-full xl:w-32 flex-shrink-0 flex items-center justify-center">
                      <Link href={`/orders/${o["Order ID"]}`} className="w-full">
                        <button className="w-full py-3 border-2 border-foreground font-black uppercase tracking-widest text-xs hover:bg-foreground hover:text-background transition-colors duration-300">
                          VIEW
                        </button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
