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
  const [confirmGive, setConfirmGive] = useState(false);
  const [successGive, setSuccessGive] = useState(false);
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
    
    try {
      setUpdating(true);
      const res = await updateCollection(matchedOrder["Order ID"], userName, "COLLECTED");
      if (res.success) {
        setOrders(prev => prev.map(o => o["Order ID"] === matchedOrder["Order ID"] ? res.data : o));
        setConfirmGive(false);
        setSuccessGive(true);
      }
    } catch (err) {
      alert("Failed to update collection.");
      setConfirmGive(false);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-0 container mx-auto max-w-4xl flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-border pb-4 mb-8 sm:mb-12">
        <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase leading-none">Distribution</h1>
      </div>
      
      <div className="flex flex-col md:flex-row border-t-2 border-l-2 border-border mb-8 sm:mb-12 bg-background">
        <input 
          autoFocus
          className="flex-1 text-xl md:text-2xl p-4 md:p-6 font-black tracking-tighter bg-transparent border-r-2 border-b-2 border-border focus:outline-none uppercase placeholder:text-muted-foreground"
          placeholder="Scan or type ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button 
          className="w-full md:w-64 p-4 md:p-6 text-xl font-black tracking-widest uppercase border-r-2 border-b-2 border-border hover:bg-primary hover:text-primary-foreground transition-colors duration-300"
          onClick={() => setIsScanning(true)}
          disabled={isScanning}
        >
          SCAN QR
        </button>
      </div>

      {isScanning && (
        <div className="w-full border-2 border-border bg-background flex flex-col mb-12 p-4">
          <div id="qr-reader" className="w-full min-h-[300px] bg-background"></div>
          <button className="w-full p-4 mt-4 font-black uppercase tracking-widest border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors duration-300" onClick={() => setIsScanning(false)}>
            CANCEL SCAN
          </button>
        </div>
      )}

      {search.length >= 3 && !matchedOrder && (
        <div className="p-4 sm:p-8 border-2 border-destructive bg-destructive/10 text-destructive text-center font-black uppercase tracking-widest text-lg sm:text-xl mb-8 sm:mb-12">
          No matching order found
        </div>
      )}

      {matchedOrder && (
        <div className="border-t-2 border-l-2 border-border flex flex-col">
          <div className="grid grid-cols-3 gap-0">
            <div className="p-4 sm:p-6 col-span-2 border-r-2 border-b-2 border-border bg-background flex flex-col justify-center">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase leading-none tracking-tighter mb-2 break-all">{matchedOrder["Name"]}</h2>
              <p className="font-bold text-[10px] sm:text-lg uppercase tracking-widest text-muted-foreground">{matchedOrder["Register Number"]} <span className="hidden sm:inline mx-2">•</span><br className="sm:hidden" /> {matchedOrder["Order ID"]}</p>
            </div>
            <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border bg-background flex flex-col items-center justify-center">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Size</span>
              <span className="text-4xl sm:text-5xl font-black">{matchedOrder["T-Shirt Size"]}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-0 border-r-2 border-border">
            <div className={`p-4 sm:p-6 flex flex-col items-center justify-center border-b-2 border-r-2 border-border ${matchedOrder["Payment Status"] === "PAID" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-1">Payment</span>
              <span className="text-xl sm:text-3xl md:text-4xl font-black tracking-tighter uppercase">{matchedOrder["Payment Status"]}</span>
            </div>
            
            <div className={`p-4 sm:p-6 flex flex-col items-center justify-center border-b-2 border-border ${matchedOrder["Collection Status"] === "COLLECTED" ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-1">Collection</span>
              <span className="text-xl sm:text-3xl md:text-4xl font-black tracking-tighter uppercase">{matchedOrder["Collection Status"] === "COLLECTED" ? "COLLECTED" : "READY"}</span>
            </div>
          </div>

          {matchedOrder["Collection Status"] === "NOT_COLLECTED" && (
            <button 
              className={`w-full p-4 sm:p-6 text-xl sm:text-2xl font-black tracking-widest uppercase border-r-2 border-b-2 border-border transition-colors duration-300 ${matchedOrder["Payment Status"] === "PAID" ? "bg-foreground text-background hover:bg-background hover:text-foreground" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
              disabled={updating || matchedOrder["Payment Status"] !== "PAID"}
              onClick={() => setConfirmGive(true)}
            >
              {matchedOrder["Payment Status"] === "PAID" ? "GIVE T-SHIRT" : "PAYMENT PENDING"}
            </button>
          )}
          
          {matchedOrder["Collection Status"] === "COLLECTED" && (
            <div className="w-full p-6 border-r-2 border-b-2 border-border bg-background text-center flex flex-col">
              <span className="text-lg font-bold uppercase tracking-widest mb-1">Collected by {matchedOrder["Collector"]}</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{new Date(matchedOrder["Collected At"]).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Custom Brutalist Modals */}
      {confirmGive && matchedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-background border-2 border-border shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] flex flex-col w-full max-w-md">
            <div className="p-6 border-b-2 border-border">
              <h2 className="text-2xl font-black uppercase tracking-tighter">Confirm Collection</h2>
              <p className="mt-2 text-sm font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">Are you sure you want to mark {matchedOrder["Order ID"]} as COLLECTED?</p>
            </div>
            <div className="flex">
              <button 
                className="flex-1 p-4 font-black uppercase tracking-widest border-r-2 border-border hover:bg-muted transition-colors disabled:opacity-50"
                onClick={() => setConfirmGive(false)}
                disabled={updating}
              >
                CANCEL
              </button>
              <button 
                className="flex-1 p-4 font-black uppercase tracking-widest bg-foreground text-background hover:bg-background hover:text-foreground transition-colors disabled:opacity-50"
                onClick={handleGive}
                disabled={updating}
              >
                {updating ? "PROCESSING..." : "CONFIRM"}
              </button>
            </div>
          </div>
        </div>
      )}

      {successGive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-background border-2 border-border shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] flex flex-col w-full max-w-md">
            <div className="p-6 border-b-2 border-border flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-success text-success-foreground rounded-full flex items-center justify-center mb-4 border-2 border-border">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tighter">Success</h2>
              <p className="mt-2 text-sm font-bold text-muted-foreground uppercase tracking-widest">T-Shirt marked as collected.</p>
            </div>
            <button 
              className="w-full p-4 font-black uppercase tracking-widest bg-foreground text-background hover:bg-background hover:text-foreground transition-colors"
              onClick={() => {
                setSuccessGive(false);
                setSearch("");
              }}
            >
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
