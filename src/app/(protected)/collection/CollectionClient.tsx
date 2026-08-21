"use client"
import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
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
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (isScanning) {
      const html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;
      
      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Success! Stop scanner and set search
          html5QrCode.stop().then(() => {
            setIsScanning(false);
            setSearch(decodedText);
          }).catch(console.error);
        },
        () => {
          // ignore parse errors frame-by-frame
        }
      ).catch(err => {
        console.error("Scanner error:", err);
        alert("Failed to start scanner. Please check camera permissions and ensure you are on HTTPS.");
        setIsScanning(false);
      });
      
      return () => {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(console.error);
        }
      };
    }
  }, [isScanning]);

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
    <div className="p-4 sm:p-8 space-y-0 container mx-auto max-w-4xl flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-border pb-4 mb-12">
        <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter uppercase leading-none">Distribution</h1>
      </div>
      
      <div className="flex flex-col md:flex-row border-t-2 border-l-2 border-border mb-12 group hover:bg-foreground hover:text-background transition-colors duration-0 cursor-default">
        <input 
          autoFocus
          className="flex-1 text-2xl md:text-4xl p-6 md:p-8 font-black tracking-tighter bg-transparent border-r-2 border-b-2 border-border group-hover:border-background focus:outline-none uppercase placeholder:text-muted-foreground"
          placeholder="Scan or type ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button 
          className="w-full md:w-64 p-6 md:p-8 text-2xl font-black tracking-widest uppercase border-r-2 border-b-2 border-border group-hover:border-background hover:bg-primary hover:text-primary-foreground group-hover:hover:bg-primary group-hover:hover:text-primary-foreground transition-colors duration-0"
          onClick={() => setIsScanning(true)}
          disabled={isScanning}
        >
          SCAN QR
        </button>
      </div>

      {isScanning && (
        <div className="w-full border-2 border-border bg-background flex flex-col mb-12 p-4">
          <div id="qr-reader" className="w-full min-h-[300px] bg-background"></div>
          <button className="w-full p-4 mt-4 font-black uppercase tracking-widest border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors duration-0" onClick={() => setIsScanning(false)}>
            CANCEL SCAN
          </button>
        </div>
      )}

      {search.length >= 3 && !matchedOrder && (
        <div className="p-12 border-2 border-destructive bg-destructive/10 text-destructive text-center font-black uppercase tracking-widest text-2xl mb-12">
          No matching order found
        </div>
      )}

      {matchedOrder && (
        <div className="border-t-2 border-l-2 border-border flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <div className="p-8 md:col-span-2 border-r-2 border-b-2 border-border bg-background flex flex-col justify-center">
              <h2 className="text-4xl sm:text-6xl font-black uppercase leading-none tracking-tighter mb-4">{matchedOrder["Name"]}</h2>
              <p className="font-bold text-xl uppercase tracking-widest text-muted-foreground">{matchedOrder["Register Number"]} <span className="mx-2">•</span> {matchedOrder["Order ID"]}</p>
            </div>
            <div className="p-8 border-r-2 border-b-2 border-border bg-background flex flex-col items-center justify-center">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Size</span>
              <span className="text-6xl font-black">{matchedOrder["T-Shirt Size"]}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-r-2 border-border">
            <div className={`p-8 flex flex-col items-center justify-center border-b-2 border-r-2 md:border-r-0 border-border ${matchedOrder["Payment Status"] === "PAID" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
              <span className="text-sm font-bold uppercase tracking-[0.2em] mb-2">Payment</span>
              <span className="text-4xl font-black tracking-tighter uppercase">{matchedOrder["Payment Status"]}</span>
            </div>
            
            <div className={`p-8 flex flex-col items-center justify-center border-b-2 border-border border-l-0 md:border-l-2 ${matchedOrder["Collection Status"] === "COLLECTED" ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}>
              <span className="text-sm font-bold uppercase tracking-[0.2em] mb-2">Collection</span>
              <span className="text-4xl font-black tracking-tighter uppercase">{matchedOrder["Collection Status"] === "COLLECTED" ? "COLLECTED" : "READY"}</span>
            </div>
          </div>

          {matchedOrder["Collection Status"] === "NOT_COLLECTED" && (
            <button 
              className={`w-full p-8 text-3xl font-black tracking-widest uppercase border-r-2 border-b-2 border-border transition-colors duration-0 ${matchedOrder["Payment Status"] === "PAID" ? "bg-foreground text-background hover:bg-background hover:text-foreground" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
              disabled={updating || matchedOrder["Payment Status"] !== "PAID"}
              onClick={handleGive}
            >
              {matchedOrder["Payment Status"] === "PAID" ? "GIVE T-SHIRT" : "PAYMENT PENDING"}
            </button>
          )}
          
          {matchedOrder["Collection Status"] === "COLLECTED" && (
            <div className="w-full p-8 border-r-2 border-b-2 border-border bg-background text-center flex flex-col">
              <span className="text-xl font-bold uppercase tracking-widest mb-2">Collected by {matchedOrder["Collector"]}</span>
              <span className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]">{new Date(matchedOrder["Collected At"]).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
