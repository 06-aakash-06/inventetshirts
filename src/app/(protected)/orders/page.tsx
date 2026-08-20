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
      const s = search.toLowerCase();
      const matchesSearch = !s || (
        o["Order ID"]?.toLowerCase().includes(s) ||
        o["Name"]?.toLowerCase().includes(s) ||
        o["Register Number"]?.toLowerCase().includes(s) ||
        o["Digital ID"]?.toLowerCase().includes(s) ||
        o["Phone Number"]?.toLowerCase().includes(s) ||
        o["College Email"]?.toLowerCase().includes(s)
      );

      const matchesPayment = filterPayment === "ALL" || o["Payment Status"] === filterPayment;
      const matchesCollection = filterCollection === "ALL" || o["Collection Status"] === filterCollection;

      return matchesSearch && matchesPayment && matchesCollection;
    }).sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());
  }, [orders, search, filterPayment, filterCollection]);

  return (
    <div className="p-4 sm:p-8 space-y-6 container mx-auto flex-1 flex flex-col">
      <div className="flex justify-between items-end">
        <h1 className="text-3xl font-bold tracking-tighter">Orders</h1>
      </div>

      <Card className="flex-none brutal-shadow">
        <CardContent className="p-4 space-y-4 sm:space-y-0 sm:flex sm:gap-4 sm:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Search</label>
            <Input 
              placeholder="Search ID, Name, Reg No..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md font-mono"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Payment</label>
            <select 
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="flex h-9 w-full border border-border bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring brutal-shadow"
            >
              <option value="ALL">All</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Collection</label>
            <select 
              value={filterCollection}
              onChange={(e) => setFilterCollection(e.target.value)}
              className="flex h-9 w-full border border-border bg-background px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring brutal-shadow"
            >
              <option value="ALL">All</option>
              <option value="COLLECTED">Collected</option>
              <option value="NOT_COLLECTED">Not Collected</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 overflow-auto">
        {loading && orders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground font-mono">Loading orders...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Order ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Reg No</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No orders found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map(o => (
                  <TableRow key={o["Order ID"]}>
                    <TableCell className="font-mono font-bold">{o["Order ID"]}</TableCell>
                    <TableCell className="font-medium">{o["Name"]}</TableCell>
                    <TableCell className="font-mono">{o["Register Number"]}</TableCell>
                    <TableCell className="font-bold">{o["T-Shirt Size"]}</TableCell>
                    <TableCell className="font-mono">{o["Payment Method"]}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {o["Payment Status"] === "PAID" ? 
                          <Badge variant="success">PAID</Badge> : 
                          <Badge variant="warning">PENDING</Badge>
                        }
                        {o["Collection Status"] === "COLLECTED" ? 
                          <Badge variant="success">COLLECTED</Badge> : 
                          <Badge variant="destructive">UNCOLLECTED</Badge>
                        }
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/orders/${o["Order ID"]}`}>
                        <Button size="sm" variant="outline" className="font-bold">VIEW</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
