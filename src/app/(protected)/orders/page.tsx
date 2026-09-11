"use client"
import { useState, useMemo, useEffect } from "react";
import { OrdersProvider, useOrders } from "@/context/OrdersContext";
import { sendSingleTicket } from "@/lib/api";
import { useToast, useConfirm } from "@/components/ui/toast";
import Link from "next/link";

type PaymentFilter = "ALL" | "PAID" | "PENDING";
type CollectionFilter = "ALL" | "COLLECTED" | "NOT_COLLECTED";
type QrFilter = "ALL" | "SENT" | "NOT_SENT";
type MethodFilter = "ALL" | "UPI" | "CASH";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex-1 p-4 sm:p-5 border-r-2 border-b-2 border-border bg-background flex flex-col justify-between min-h-[110px]">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3">{label}</span>
      <div className="flex border-2 border-border">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-1 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:z-10 ${
              i > 0 ? "border-l-2 border-border" : ""
            } ${value === opt.value ? "bg-foreground text-background" : "bg-background hover:bg-muted"}`}
            aria-pressed={value === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrdersPageContent() {
  const { orders, loading, manualSync } = useOrders();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filterPayment, setFilterPayment] = useState<PaymentFilter>("ALL");
  const [filterCollection, setFilterCollection] = useState<CollectionFilter>("ALL");
  const [filterQr, setFilterQr] = useState<QrFilter>("ALL");
  const [filterMethod, setFilterMethod] = useState<MethodFilter>("ALL");
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Orders · INVENTE 11.0";
  }, []);

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
      const qrSent = !!o["QR Sent"];
      const matchesQr = filterQr === "ALL" || (filterQr === "SENT" ? qrSent : !qrSent);
      const matchesMethod = filterMethod === "ALL" || o["Payment Method"] === filterMethod;

      return matchesSearch && matchesPayment && matchesCollection && matchesQr && matchesMethod;
    }).sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());
  }, [orders, search, filterPayment, filterCollection, filterQr, filterMethod]);

  const applyPaidNoQr = () => {
    setFilterPayment("PAID");
    setFilterCollection("ALL");
    setFilterQr("NOT_SENT");
  };

  const handleSend = async (orderId: string, alreadySent: boolean) => {
    const ok = await confirm({
      title: alreadySent ? "Resend ticket" : "Send ticket",
      message: `${alreadySent ? "Resend" : "Send"} the QR ticket email for ${orderId}?`,
      confirmLabel: alreadySent ? "Resend" : "Send",
    });
    if (!ok) return;
    setSendingId(orderId);
    try {
      const res = await sendSingleTicket(orderId);
      if (res?.success) {
        toast({ title: `Ticket sent for ${orderId}`, variant: "success" });
        manualSync();
      } else {
        toast({ title: `Could not send ${orderId}`, description: res?.error, variant: "error", duration: 0 });
      }
    } catch (err: any) {
      toast({ title: `Could not send ${orderId}`, description: err.message, variant: "error", duration: 0 });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-0 container mx-auto flex-1 flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-border pb-4 mb-8 sm:mb-12">
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none">Orders</h1>
        <button
          onClick={applyPaidNoQr}
          className="mt-3 sm:mt-0 px-4 py-2 border-2 border-border text-[10px] font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Show: Paid · No QR
        </button>
      </div>

      <div className="border-t-2 border-l-2 border-border mb-8 sm:mb-12">
        <div
          className="p-4 sm:p-6 border-r-2 border-b-2 border-border bg-background flex flex-col justify-end min-h-[110px] group hover:bg-foreground hover:text-background transition-colors duration-300 cursor-text"
          onClick={() => document.getElementById('search-input')?.focus()}
        >
          <label htmlFor="search-input" className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3 group-hover:text-background cursor-pointer">Search</label>
          <input
            id="search-input"
            type="text"
            placeholder="ID, Name, Reg No, Phone, Email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-b-2 border-border group-hover:border-background font-mono text-lg sm:text-xl focus:outline-none focus:border-primary uppercase placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex flex-col sm:flex-row">
          <Segmented
            label="Payment"
            value={filterPayment}
            onChange={setFilterPayment}
            options={[
              { value: "ALL", label: "All" },
              { value: "PAID", label: "Paid" },
              { value: "PENDING", label: "Pending" },
            ]}
          />
          <Segmented
            label="Collection"
            value={filterCollection}
            onChange={setFilterCollection}
            options={[
              { value: "ALL", label: "All" },
              { value: "COLLECTED", label: "Done" },
              { value: "NOT_COLLECTED", label: "Not yet" },
            ]}
          />
          <Segmented
            label="QR Ticket"
            value={filterQr}
            onChange={setFilterQr}
            options={[
              { value: "ALL", label: "All" },
              { value: "SENT", label: "Sent" },
              { value: "NOT_SENT", label: "Not sent" },
            ]}
          />
          <Segmented
            label="Method"
            value={filterMethod}
            onChange={setFilterMethod}
            options={[
              { value: "ALL", label: "All" },
              { value: "UPI", label: "UPI" },
              { value: "CASH", label: "Cash" },
            ]}
          />
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {filteredOrders.length} shown
        </span>
      </div>

      <div className="flex-1 overflow-auto border-t-2 border-l-2 border-border">
        {loading && orders.length === 0 ? (
          <div className="p-8 text-center text-2xl font-black uppercase tracking-widest border-r-2 border-b-2 border-border">Loading...</div>
        ) : (
          <div className="flex flex-col">
            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-xl font-bold uppercase tracking-widest text-muted-foreground border-r-2 border-b-2 border-border">
                No orders found
              </div>
            ) : (
              filteredOrders.map(o => {
                const qrSent = !!o["QR Sent"];
                const canSend = o["Payment Status"] === "PAID";
                return (
                  <div key={o["Order ID"]} className="flex flex-col xl:flex-row border-r-2 border-b-2 border-border hover:bg-muted transition-colors duration-300">
                    <div className="flex flex-row xl:w-48 border-b-2 xl:border-b-0 xl:border-r-2 border-border">
                      <div className="p-4 flex-1 xl:w-full flex items-center border-r-2 xl:border-r-0 border-border">
                        <span className="text-xl font-black tracking-tighter">{o["Order ID"]}</span>
                      </div>
                      <div className="p-4 w-24 xl:hidden flex-shrink-0 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Size</span>
                        <span className="text-2xl font-black">{o["T-Shirt Size"]}</span>
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-center border-b-2 xl:border-b-0 xl:border-r-2 border-border">
                      <p className="text-xl font-black uppercase leading-none mb-1">{o["Name"]}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mt-1">
                        {o["Register Number"] && <span>{o["Register Number"]}</span>}
                        {o["Digital ID"] && <span>{o["Digital ID"]}</span>}
                        <span>{o["Payment Method"]}</span>
                      </div>
                    </div>

                    <div className="hidden xl:flex p-4 w-32 flex-shrink-0 flex-col items-center justify-center border-r-2 border-border">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">Size</span>
                      <span className="text-2xl font-black">{o["T-Shirt Size"]}</span>
                    </div>

                    <div className="flex flex-row xl:flex-col w-full xl:w-40 flex-shrink-0 border-b-2 xl:border-b-0 xl:border-r-2 border-border">
                      <div className={`flex-1 p-3 flex items-center justify-center border-r-2 xl:border-r-0 xl:border-b-2 border-border ${o["Payment Status"] === 'PAID' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}>
                        <span className="text-[10px] font-black uppercase tracking-widest">{o["Payment Status"]}</span>
                      </div>
                      <div className={`flex-1 p-3 flex items-center justify-center border-r-2 xl:border-r-0 xl:border-b-2 border-border ${o["Collection Status"] === 'COLLECTED' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>
                        <span className="text-[10px] font-black uppercase tracking-widest">{o["Collection Status"] === 'COLLECTED' ? 'COLLECTED' : 'UNCOLLECTED'}</span>
                      </div>
                      <div className="flex-1 p-3 flex items-center justify-center bg-secondary text-secondary-foreground">
                        <span className="text-[10px] font-black uppercase tracking-widest text-center">{qrSent ? 'QR SENT' : 'NO QR'}</span>
                      </div>
                    </div>

                    <div className="p-4 w-full xl:w-40 flex-shrink-0 flex flex-col gap-2 justify-center">
                      <Link href={`/orders/${o["Order ID"]}`} className="w-full">
                        <button className="w-full py-3 border-2 border-foreground font-black uppercase tracking-widest text-xs hover:bg-foreground hover:text-background transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          VIEW
                        </button>
                      </Link>
                      {canSend && (
                        <button
                          onClick={() => handleSend(o["Order ID"], qrSent)}
                          disabled={sendingId === o["Order ID"]}
                          className="w-full py-3 border-2 border-border font-black uppercase tracking-widest text-xs hover:bg-secondary hover:text-secondary-foreground transition-colors duration-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {sendingId === o["Order ID"] ? "..." : qrSent ? "RESEND" : "SEND"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <OrdersProvider>
      <OrdersPageContent />
    </OrdersProvider>
  );
}
