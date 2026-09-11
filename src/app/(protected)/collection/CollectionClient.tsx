"use client"
import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { getOrder, Order, updateCollection } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Check, X, AlertTriangle } from "lucide-react";

// A scanned ticket is "INV-0042.<sig>". Manual typing is usually just "INV-0042"
// or a register number. Split the signature off for matching but keep the whole
// string to send to the backend for verification.
function parseScan(raw: string): { orderIdGuess: string; token: string | null } {
  const t = raw.trim();
  if (/^INV-\w+\.[A-Za-z0-9_-]+$/.test(t)) {
    return { orderIdGuess: t.substring(0, t.lastIndexOf(".")), token: t };
  }
  return { orderIdGuess: t, token: null };
}

export default function CollectionClient({ userName }: { userName: string }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [matchedOrder, setMatchedOrder] = useState<Order | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [confirmGive, setConfirmGive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lookupRequestRef = useRef(0);

  useEffect(() => {
    document.title = "Distribution · INVENTE 11.0";
  }, []);

  useEffect(() => {
    if (!isScanning) return;
    const html5QrCode = new Html5Qrcode("qr-reader");
    scannerRef.current = html5QrCode;

    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        html5QrCode.stop().then(() => {
          setIsScanning(false);
          const { orderIdGuess, token } = parseScan(decodedText);
          setScanToken(token);
          setSearch(orderIdGuess);
        }).catch(console.error);
      },
      () => {}
    ).catch(err => {
      console.error("Scanner error:", err);
      toast({
        title: "Camera unavailable",
        description: "Check camera permissions and make sure the page is on HTTPS.",
        variant: "error",
        duration: 0,
      });
      setIsScanning(false);
    });

    return () => {
      if (html5QrCode.isScanning) html5QrCode.stop().catch(console.error);
    };
  }, [isScanning, toast]);

  const lookupOrder = useCallback(async (reference: string, requestId: number) => {
    setLookupLoading(true);
    setLookupError(null);
    try {
      const order = await getOrder(reference);
      if (lookupRequestRef.current !== requestId) return;
      setMatchedOrder(order);
    } catch (err: unknown) {
      if (lookupRequestRef.current !== requestId) return;
      setMatchedOrder(null);
      setLookupError(err instanceof Error ? err.message : "Could not find that order");
    } finally {
      if (lookupRequestRef.current === requestId) setLookupLoading(false);
    }
  }, []);

  useEffect(() => {
    const reference = scanToken || search.trim();
    const requestId = ++lookupRequestRef.current;
    if (reference.length < 3) {
      return;
    }

    const timer = window.setTimeout(() => {
      void lookupOrder(reference, requestId);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, scanToken, lookupOrder]);

  const paid = matchedOrder?.["Payment Status"] === "PAID";
  const qrSent = !!matchedOrder?.["QR Sent"];
  const collected = matchedOrder?.["Collection Status"] === "COLLECTED";
  const canGive = !!matchedOrder && paid && qrSent && !collected;

  const blockReason = !matchedOrder ? null
    : collected ? null
    : !paid ? "Payment not verified"
    : !qrSent ? "Ticket not emailed yet"
    : null;

  const reset = () => {
    setSearch("");
    setScanToken(null);
    setMatchedOrder(null);
    setLookupError(null);
    setLookupLoading(false);
  };

  const setCollection = async (status: "COLLECTED" | "NOT_COLLECTED", ref: { orderId: string; token?: string }) => {
    const res = await updateCollection(
      status === "COLLECTED" && ref.token ? { token: ref.token } : { orderId: ref.orderId },
      userName,
      status,
    );
    if (res?.success && res.data) {
      setMatchedOrder(prev => prev ? { ...prev, ...res.data } : res.data);
    } else if (res?.success) {
      void lookupOrder(ref.orderId, lookupRequestRef.current);
    }
    return res;
  };

  const handleGive = async () => {
    if (!matchedOrder) return;
    const orderId = matchedOrder["Order ID"];
    try {
      setUpdating(true);
      const res = await setCollection("COLLECTED", { orderId, token: scanToken || undefined });
      if (res?.success) {
        setConfirmGive(false);
        toast({
          title: `T-shirt given — ${matchedOrder["Name"]}`,
          description: `${orderId} · size ${matchedOrder["T-Shirt Size"]}`,
          variant: "success",
          action: {
            label: "Undo",
            onClick: async () => {
              const undo = await setCollection("NOT_COLLECTED", { orderId });
              if (undo?.success) toast({ title: `${orderId} collection undone`, variant: "warning" });
            },
          },
        });
        reset();
      } else {
        toast({ title: "Could not mark collected", description: res?.error, variant: "error", duration: 0 });
        setConfirmGive(false);
      }
    } catch (err: unknown) {
      toast({
        title: "Could not mark collected",
        description: err instanceof Error ? err.message : "The collection update failed",
        variant: "error",
        duration: 0,
      });
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
          aria-label="Scan or type an order ID or register number"
          className="flex-1 text-xl md:text-2xl p-4 md:p-6 font-black tracking-tighter bg-transparent border-r-2 border-b-2 border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary uppercase placeholder:text-muted-foreground"
          placeholder="Scan or type ID..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setScanToken(null);
            setMatchedOrder(null);
            setLookupError(null);
            setLookupLoading(false);
          }}
        />
        <button
          aria-label="Open camera to scan a QR ticket"
          className="w-full md:w-64 p-4 md:p-6 text-xl font-black tracking-widest uppercase border-r-2 border-b-2 border-border hover:bg-primary hover:text-primary-foreground transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setIsScanning(true)}
          disabled={isScanning}
        >
          SCAN QR
        </button>
      </div>

      {isScanning && (
        <div className="w-full border-2 border-border bg-background flex flex-col mb-12 p-4">
          <div id="qr-reader" className="w-full min-h-[300px] bg-background"></div>
          <button
            className="w-full p-4 mt-4 font-black uppercase tracking-widest border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setIsScanning(false)}
          >
            CANCEL SCAN
          </button>
        </div>
      )}

      {search.length >= 3 && lookupLoading && (
        <div className="p-4 sm:p-8 border-2 border-border bg-muted text-muted-foreground text-center font-black uppercase tracking-widest text-lg sm:text-xl mb-8 sm:mb-12">
          Looking up order...
        </div>
      )}

      {search.length >= 3 && !lookupLoading && !matchedOrder && (
        <div className="p-4 sm:p-8 border-2 border-destructive bg-destructive/10 text-destructive text-center font-black uppercase tracking-widest text-lg sm:text-xl mb-8 sm:mb-12">
          {lookupError || "No matching order for that exact ID / register number"}
        </div>
      )}

      {matchedOrder && (
        <div className="border-t-2 border-l-2 border-border flex flex-col">
          <div className="grid grid-cols-3 gap-0">
            <div className="p-4 sm:p-6 col-span-2 border-r-2 border-b-2 border-border bg-background flex flex-col justify-center">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase leading-none tracking-tighter mb-2 break-words">{matchedOrder["Name"]}</h2>
              <p className="font-black text-base sm:text-lg uppercase tracking-widest">{matchedOrder["Register Number"]}</p>
              <p className="font-bold text-xs sm:text-sm uppercase tracking-widest text-muted-foreground mt-1">{matchedOrder["Order ID"]}</p>
            </div>
            <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border bg-background flex flex-col items-center justify-center">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Size</span>
              <span className="text-4xl sm:text-5xl font-black">{matchedOrder["T-Shirt Size"]}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-0 border-r-2 border-border">
            <div className={`p-4 sm:p-6 flex flex-col items-center justify-center border-b-2 border-r-2 border-border ${paid ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-2">Payment</span>
              <span className="flex items-center gap-2 text-xl sm:text-2xl md:text-3xl font-black tracking-tighter uppercase">
                {paid ? <Check className="w-6 h-6" /> : <X className="w-6 h-6" />}
                {paid ? "PAID" : "UNPAID"}
              </span>
            </div>

            <div className={`p-4 sm:p-6 flex flex-col items-center justify-center border-b-2 border-border ${collected ? "bg-primary text-primary-foreground" : canGive ? "bg-background text-foreground" : "bg-muted text-muted-foreground"}`}>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-2">Collection</span>
              <span className="flex items-center gap-2 text-xl sm:text-2xl md:text-3xl font-black tracking-tighter uppercase text-center">
                {collected ? <Check className="w-6 h-6" /> : canGive ? null : <AlertTriangle className="w-6 h-6" />}
                {collected ? "DONE" : canGive ? "READY" : "HOLD"}
              </span>
            </div>
          </div>

          {!collected && (
            <div className="w-full border-r-2 border-b-2 border-border">
              {blockReason && (
                <div className="p-4 sm:p-5 bg-warning/20 text-center font-black uppercase tracking-widest text-sm sm:text-base border-b-2 border-border">
                  {blockReason} — do not give the shirt
                </div>
              )}
              <button
                className={`w-full p-4 sm:p-6 text-xl sm:text-2xl font-black tracking-widest uppercase transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${canGive ? "bg-foreground text-background hover:bg-background hover:text-foreground" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
                disabled={updating || !canGive}
                onClick={() => setConfirmGive(true)}
              >
                GIVE T-SHIRT
              </button>
            </div>
          )}

          {collected && (
            <div className="w-full p-6 border-r-2 border-b-2 border-border bg-background text-center flex flex-col">
              <span className="text-lg font-bold uppercase tracking-widest mb-1">Collected · handled by {matchedOrder["Collector"]}</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{new Date(matchedOrder["Collected At"]).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {confirmGive && matchedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-background border-2 border-border shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] flex flex-col w-full max-w-md">
            <div className="p-6 border-b-2 border-border">
              <h2 className="text-2xl font-black uppercase tracking-tighter">Confirm collection</h2>
              <p className="mt-2 text-sm font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
                Give a size {matchedOrder["T-Shirt Size"]} shirt to {matchedOrder["Name"]} ({matchedOrder["Order ID"]})?
              </p>
            </div>
            <div className="flex">
              <button
                className="flex-1 p-4 font-black uppercase tracking-widest border-r-2 border-border hover:bg-muted transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setConfirmGive(false)}
                disabled={updating}
              >
                CANCEL
              </button>
              <button
                autoFocus
                className="flex-1 p-4 font-black uppercase tracking-widest bg-foreground text-background hover:bg-background hover:text-foreground transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={handleGive}
                disabled={updating}
              >
                {updating ? "PROCESSING..." : "CONFIRM"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
