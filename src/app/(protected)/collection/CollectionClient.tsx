"use client"
import { useState } from "react";
import { useOrders } from "@/context/OrdersContext";
import { updateCollection } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function CollectionClient({ userName }: { userName: string }) {
  const { orders, setOrders } = useOrders();
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState(false);

  const searchTrimmed = search.trim().toLowerCase();
  const matchedOrder = searchTrimmed.length >= 3 
    ? orders.find(o => 
        String(o["Order ID"] || "").toLowerCase() === searchTrimmed ||
        String(o["Register Number"] || "").toLowerCase() === searchTrimmed ||
        String(o["Digital ID"] || "").toLowerCase() === searchTrimmed ||
        String(o["Phone Number"] || "").toLowerCase() === searchTrimmed
      ) || orders.find(o => String(o["Name"] || "").toLowerCase().includes(searchTrimmed)) // Fallback to partial name match
    : null;

  const handleGive = async () => {
    if (!matchedOrder) return;
    if (!confirm(`Are you sure you want to mark ${matchedOrder["Order ID"]} as COLLECTED?`)) return;
    
    try {
      setUpdating(true);
      const res = await updateCollection(matchedOrder["Order ID"], userName, "COLLECTED");
      if (res.success) {
        setOrders(prev => prev.map(o => o["Order ID"] === matchedOrder["Order ID"] ? res.data : o));
        setSearch("");
        alert("Success! T-Shirt marked as collected.");
      }
    } catch (err) {
      alert("Failed to update collection.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="p-4 space-y-6 container mx-auto max-w-lg flex flex-col items-center">
      <h1 className="text-3xl font-black tracking-widest text-center w-full mt-4 text-primary">DISTRIBUTION</h1>
      
      <div className="w-full">
        <Input 
          autoFocus
          className="text-lg py-8 font-mono text-center brutal-shadow focus-visible:translate-x-[4px] focus-visible:translate-y-[4px] border-2"
          placeholder="Scan ID / Reg No / Name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {search.length >= 3 && !matchedOrder && (
        <div className="text-muted-foreground font-mono mt-8 border border-destructive/50 bg-destructive/10 p-4 text-destructive w-full text-center brutal-shadow">
          No matching order found.
        </div>
      )}

      {matchedOrder && (
        <Card className="w-full mt-4 brutal-shadow border-2">
          <CardContent className="p-6 space-y-6 flex flex-col items-center text-center">
            <div className="space-y-1 w-full border-b border-border/50 pb-4">
              <h2 className="text-2xl font-black">{matchedOrder["Name"]}</h2>
              <p className="font-mono text-muted-foreground text-lg">{matchedOrder["Register Number"]} • {matchedOrder["Order ID"]}</p>
            </div>
            
            <div className="flex flex-col items-center gap-2 bg-muted w-full p-6 brutal-shadow border border-border">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Size</span>
              <span className="text-6xl font-black text-primary">{matchedOrder["T-Shirt Size"]}</span>
            </div>

            <div className="flex gap-4 w-full justify-center">
              {matchedOrder["Payment Status"] === "PAID" ? (
                <Badge variant="success" className="px-4 py-1 text-sm font-bold tracking-widest">PAID</Badge>
              ) : (
                <Badge variant="warning" className="px-4 py-1 text-sm font-bold tracking-widest">PENDING PAY</Badge>
              )}
              
              {matchedOrder["Collection Status"] === "COLLECTED" ? (
                <Badge variant="success" className="px-4 py-1 text-sm font-bold tracking-widest">COLLECTED</Badge>
              ) : (
                <Badge variant="outline" className="px-4 py-1 text-sm font-bold tracking-widest bg-background">READY</Badge>
              )}
            </div>

            {matchedOrder["Collection Status"] === "NOT_COLLECTED" && (
              <Button 
                size="lg" 
                className="w-full h-16 text-xl font-black tracking-widest mt-4 brutal-shadow-hover transition-transform"
                disabled={updating || matchedOrder["Payment Status"] !== "PAID"}
                onClick={handleGive}
                variant={matchedOrder["Payment Status"] === "PAID" ? "default" : "secondary"}
              >
                {matchedOrder["Payment Status"] === "PAID" ? "GIVE T-SHIRT" : "PAYMENT PENDING"}
              </Button>
            )}
            
            {matchedOrder["Collection Status"] === "COLLECTED" && (
              <div className="w-full p-4 border border-success bg-success text-success-foreground font-bold brutal-shadow mt-4">
                Collected by {matchedOrder["Collector"]}<br/>
                <span className="text-xs font-mono font-normal opacity-80">{new Date(matchedOrder["Collected At"]).toLocaleString()}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
