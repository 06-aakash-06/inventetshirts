"use client"
import { useState } from "react";
import { useOrders } from "@/context/OrdersContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sendQrTicketsBatch } from "@/lib/api";

export default function DashboardClient({ isAdmin }: { isAdmin?: boolean }) {
  const { orders, loading, error, lastSynced, manualSync } = useOrders();
  const [sendingQRs, setSendingQRs] = useState(false);
  const [qrProgress, setQrProgress] = useState<{sent: number, remaining: number} | null>(null);

  if (loading && orders.length === 0) return <div className="p-8 font-mono">Loading dashboard...</div>;
  if (error) return <div className="p-8 text-destructive font-mono">Error: {error}</div>;

  const totalOrders = orders.length;
  const paidOrders = orders.filter((o) => o["Payment Status"] === "PAID");
  const collectedOrders = orders.filter((o) => o["Collection Status"] === "COLLECTED");

  const expectedRevenue = totalOrders * 300;
  const receivedRevenue = paidOrders.length * 300;

  const upiOrders = orders.filter((o) => o["Payment Method"] === "UPI");
  const cashOrders = orders.filter((o) => o["Payment Method"] === "CASH");

  // Calculate Size Breakdown
  const sizes: Record<string, number> = {};
  orders.forEach(o => {
    const size = o["T-Shirt Size"] || "Unknown";
    sizes[size] = (sizes[size] || 0) + 1;
  });

  const eligibleForQr = orders.filter(o => o["Payment Status"] === "PAID" && !o["QR Sent"]);

  const handleSendTickets = async () => {
    if (!confirm(`Are you sure you want to send emails to ${eligibleForQr.length} students?`)) return;
    
    setSendingQRs(true);
    setQrProgress({ sent: 0, remaining: eligibleForQr.length });
    
    try {
      let isDone = false;
      let totalSent = 0;
      
      while (!isDone) {
        const res = await sendQrTicketsBatch();
        totalSent += res.sent;
        setQrProgress({ sent: totalSent, remaining: res.remaining });
        isDone = res.done;
      }
      
      alert(`Successfully sent ${totalSent} QR tickets.`);
      manualSync();
    } catch (err: any) {
      alert("Error sending tickets: " + err.message);
    } finally {
      setSendingQRs(false);
      setQrProgress(null);
    }
  };

  // Calculate Activity Feed
  const activities: Array<{ id: string, type: 'payment'|'collection', orderId: string, timestamp: Date, user: string, description: string }> = [];
  orders.forEach(o => {
    if (o["Payment Verified At"] && o["Payment Verified By"]) {
      activities.push({
        id: `${o["Order ID"]}-payment`,
        type: 'payment',
        orderId: o["Order ID"],
        timestamp: new Date(o["Payment Verified At"]),
        user: o["Payment Verified By"],
        description: `verified payment for ${o["Order ID"]}`
      });
    }
    if (o["Collected At"] && o["Collector"]) {
      activities.push({
        id: `${o["Order ID"]}-collection`,
        type: 'collection',
        orderId: o["Order ID"],
        timestamp: new Date(o["Collected At"]),
        user: o["Collector"],
        description: `gave T-shirt for ${o["Order ID"]}`
      });
    }
  });

  activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const recentActivities = activities.slice(0, 10);

  return (
    <div className="p-4 sm:p-8 space-y-0 container mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-border pb-4 mb-12">
        <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter uppercase leading-none">Dashboard</h1>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mt-4 sm:mt-0">
          SYNC / {lastSynced.toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border-t-2 border-l-2 border-border mb-12">
        <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[180px] bg-background text-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Total Orders</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{totalOrders}</div>
        </div>
        <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[180px] bg-warning text-warning-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em]">Pending</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{totalOrders - paidOrders.length}</div>
        </div>
        <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[180px] bg-success text-success-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em]">Paid</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{paidOrders.length}</div>
        </div>
        <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[180px] bg-primary text-primary-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em]">Collected</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{collectedOrders.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t-2 border-l-2 border-border mb-12">
        <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between bg-background text-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-8 text-muted-foreground">Revenue</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-end border-b-2 border-border pb-2">
              <span className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Expected</span>
              <span className="text-3xl sm:text-4xl font-black tracking-tighter">₹{expectedRevenue}</span>
            </div>
            <div className="flex justify-between items-end border-b-2 border-border pb-2">
              <span className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Received</span>
              <span className="text-3xl sm:text-4xl font-black tracking-tighter text-success">₹{receivedRevenue}</span>
            </div>
            <div className="flex justify-between items-center pt-2 font-bold uppercase tracking-[0.2em] text-xs text-muted-foreground">
              <span>UPI / {upiOrders.length}</span>
              <span>CASH / {cashOrders.length}</span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between bg-background text-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 text-muted-foreground">Size Breakdown</h2>
          <div className="grid grid-cols-3 gap-0 border-t-2 border-l-2 border-border">
            {Object.entries(sizes).map(([size, count]) => (
              <div key={size} className="flex flex-col items-center justify-center p-3 sm:p-4 border-r-2 border-b-2 border-border">
                <span className="text-3xl sm:text-4xl font-black tracking-tighter mb-1">{count}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{size}</span>
              </div>
            ))}
            {Object.keys(sizes).length === 0 && (
              <div className="col-span-3 p-8 text-center font-bold tracking-widest uppercase text-sm border-r-2 border-b-2 border-border">
                No Data
              </div>
            )}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="border-2 border-border bg-secondary text-secondary-foreground flex flex-col lg:flex-row mb-12">
          <div className="p-4 sm:p-6 border-b-2 lg:border-b-0 lg:border-r-2 border-border flex-1">
            <h2 className="text-4xl sm:text-5xl font-black tracking-tighter leading-none mb-2 uppercase">Tickets</h2>
            <p className="text-xs font-bold uppercase tracking-[0.2em]">Batch Send QR Codes</p>
          </div>
          <div className="p-4 sm:p-6 flex flex-col justify-center min-w-[300px] lg:min-w-[400px]">
            <div className="flex justify-between items-end mb-4">
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Eligible</span>
              <span className="text-4xl font-black tracking-tighter leading-none">{eligibleForQr.length}</span>
            </div>
            {sendingQRs ? (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold tracking-[0.2em] uppercase">
                  <span>Sending</span>
                  <span>{qrProgress?.sent} / {qrProgress?.remaining}</span>
                </div>
                <div className="w-full h-3 border-2 border-secondary-foreground p-0.5">
                  <div 
                    className="bg-secondary-foreground h-full transition-all" 
                    style={{ width: `${Math.min(100, Math.max(0, ((qrProgress?.sent || 0) / ((qrProgress?.sent || 0) + (qrProgress?.remaining || 1))) * 100))}%` }} 
                  />
                </div>
              </div>
            ) : (
              <button 
                className="w-full font-black tracking-[0.2em] uppercase h-12 border-2 border-secondary-foreground disabled:opacity-50 hover:bg-secondary-foreground hover:text-secondary transition-colors duration-0" 
                disabled={eligibleForQr.length === 0}
                onClick={handleSendTickets}
              >
                Send QR Tickets
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t-2 border-l-2 border-border">
        <div className="p-3 sm:p-4 border-r-2 border-b-2 border-border bg-background">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Activity Feed</h2>
        </div>
        <div className="grid grid-cols-1">
          {recentActivities.length === 0 ? (
            <div className="p-6 border-r-2 border-b-2 border-border text-xs font-bold uppercase tracking-widest text-center">
              No activity
            </div>
          ) : (
            recentActivities.map((act, index) => (
              <div key={act.id} className="flex flex-col sm:flex-row border-r-2 border-b-2 border-border hover:bg-muted transition-colors duration-0">
                <div className="p-3 sm:p-4 border-b-2 sm:border-b-0 sm:border-r-2 border-border w-full sm:w-48 flex-shrink-0 flex items-center">
                  <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${act.type === 'payment' ? 'text-success' : 'text-primary'}`}>
                    {act.type}
                  </span>
                </div>
                <div className="p-3 sm:p-4 flex-1 flex flex-col justify-center">
                  <p className="text-sm font-bold tracking-wide uppercase">
                    <span className="font-black">{act.user}</span> {act.description}
                  </p>
                </div>
                <div className="p-3 sm:p-4 sm:border-l-2 border-border w-full sm:w-48 flex-shrink-0 flex items-center justify-start sm:justify-end">
                  <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted-foreground">
                    {act.timestamp.toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
