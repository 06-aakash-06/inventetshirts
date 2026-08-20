"use client"
import { useState } from "react";
import { useOrders } from "@/context/OrdersContext";
import { updatePayment, updateCollection, updateNotes } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function OrderDetailClient({ orderId, userName }: { orderId: string, userName: string }) {
  const { orders, loading, setOrders } = useOrders();
  const [updating, setUpdating] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);

  const order = orders.find(o => o["Order ID"] === orderId);

  if (loading && !order) return <div className="p-8 font-mono">Loading...</div>;
  if (!order) return <div className="p-8 text-destructive font-mono">Order not found.</div>;

  const handleMarkPaid = async () => {
    try {
      setUpdating(true);
      const res = await updatePayment(orderId, userName, "PAID");
      if (res.success) {
        setOrders(prev => prev.map(o => o["Order ID"] === orderId ? res.data : o));
      }
    } catch (err) {
      alert("Failed to update payment");
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkCollected = async () => {
    try {
      setUpdating(true);
      const res = await updateCollection(orderId, userName, "COLLECTED");
      if (res.success) {
        setOrders(prev => prev.map(o => o["Order ID"] === orderId ? res.data : o));
      }
    } catch (err) {
      alert("Failed to update collection");
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      setUpdating(true);
      const res = await updateNotes(orderId, noteText);
      if (res.success) {
        setOrders(prev => prev.map(o => o["Order ID"] === orderId ? res.data : o));
        setEditingNotes(false);
      }
    } catch (err) {
      alert("Failed to update notes");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 container mx-auto max-w-4xl">
      <div className="flex items-center gap-4 border-b border-border/50 pb-4">
        <Link href="/orders">
          <Button variant="outline" size="icon" className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tighter text-primary">Order {order["Order ID"]}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="uppercase tracking-widest text-sm text-muted-foreground border-b border-border/50 pb-2">Student Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Name</p>
                <p className="font-medium mt-1">{order["Name"]}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Register Number</p>
                <p className="font-mono mt-1">{order["Register Number"]}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Digital ID</p>
                <p className="font-mono mt-1">{order["Digital ID"]}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Year</p>
                <p className="font-mono mt-1">{order["Year"]}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Phone</p>
                <p className="font-mono mt-1">{order["Phone Number"]}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Email</p>
                <p className="font-mono text-sm mt-1">{order["College Email"]}</p>
              </div>
              <div className="col-span-2 bg-muted p-4 brutal-shadow flex justify-between items-center">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">T-Shirt Size</p>
                <p className="font-black text-3xl text-primary">{order["T-Shirt Size"]}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Submitted At</p>
                <p className="font-mono text-sm mt-1">{new Date(order["Timestamp"]).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="uppercase tracking-widest text-sm text-muted-foreground">Payment Status</CardTitle>
              {order["Payment Status"] === "PAID" ? 
                <Badge variant="success">PAID</Badge> : 
                <Badge variant="warning">PENDING</Badge>
              }
            </CardHeader>
            <CardContent className="space-y-6 pt-4 border-t border-border/50">
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Method</p>
                <p className="font-mono font-bold text-lg">{order["Payment Method"]}</p>
              </div>
              
              {order["Payment Method"] === "UPI" && order["Payment Screenshot"] && (
                <Button variant="outline" className="w-full font-bold tracking-widest" asChild>
                  <a href={order["Payment Screenshot"]} target="_blank" rel="noopener noreferrer">
                    VIEW SCREENSHOT
                  </a>
                </Button>
              )}

              {order["Payment Status"] === "PAID" ? (
                <div className="p-4 bg-muted border border-border brutal-shadow text-sm">
                  <p className="text-muted-foreground">Verified by <span className="font-bold text-foreground">{order["Payment Verified By"]}</span></p>
                  <p className="font-mono text-xs text-muted-foreground mt-1">{new Date(order["Payment Verified At"]).toLocaleString()}</p>
                </div>
              ) : (
                <Button 
                  className="w-full font-bold tracking-widest h-12" 
                  disabled={updating}
                  onClick={handleMarkPaid}
                >
                  {order["Payment Method"] === "UPI" ? "MARK AS PAID" : "MARK CASH RECEIVED"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="uppercase tracking-widest text-sm text-muted-foreground">Collection Status</CardTitle>
              {order["Collection Status"] === "COLLECTED" ? 
                <Badge variant="success">COLLECTED</Badge> : 
                <Badge variant="destructive">UNCOLLECTED</Badge>
              }
            </CardHeader>
            <CardContent className="space-y-4 pt-4 border-t border-border/50">
              {order["Collection Status"] === "COLLECTED" ? (
                <div className="p-4 bg-muted border border-border brutal-shadow text-sm">
                  <p className="text-muted-foreground">Collected by <span className="font-bold text-foreground">{order["Collector"]}</span></p>
                  <p className="font-mono text-xs text-muted-foreground mt-1">{new Date(order["Collected At"]).toLocaleString()}</p>
                </div>
              ) : (
                <Button 
                  className="w-full font-bold tracking-widest h-12" 
                  disabled={updating || order["Payment Status"] !== "PAID"}
                  onClick={handleMarkCollected}
                  title={order["Payment Status"] !== "PAID" ? "Payment must be verified first" : ""}
                >
                  MARK AS COLLECTED
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
          <CardTitle className="uppercase tracking-widest text-sm text-muted-foreground">Notes</CardTitle>
          {!editingNotes && (
            <Button variant="outline" size="sm" className="font-bold" onClick={() => { setNoteText(order["Notes"] || ""); setEditingNotes(true); }}>EDIT</Button>
          )}
        </CardHeader>
        <CardContent className="pt-6">
          {editingNotes ? (
            <div className="space-y-4">
              <textarea 
                className="flex min-h-[120px] w-full border border-border bg-background px-4 py-3 text-sm brutal-shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add internal notes here..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" className="font-bold" onClick={() => setEditingNotes(false)} disabled={updating}>CANCEL</Button>
                <Button className="font-bold" onClick={handleSaveNotes} disabled={updating}>SAVE NOTES</Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap min-h-[40px] font-mono text-sm leading-relaxed">{order["Notes"] || <span className="text-muted-foreground italic">No notes</span>}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
