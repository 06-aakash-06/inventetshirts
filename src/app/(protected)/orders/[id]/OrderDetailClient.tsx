"use client"
import { useCallback, useEffect, useState } from "react";
import { getOrder, Order, updatePayment, updateCollection, updateNotes, sendSingleTicket } from "@/lib/api";
import { useToast, useConfirm } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function OrderDetailClient({ orderId, userName, isAdmin }: { orderId: string, userName: string, isAdmin?: boolean }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOrder(orderId);
      setOrder(data);
      setLoadError(null);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    document.title = `${orderId} · Orders · INVENTE 11.0`;
    const initialLoad = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [orderId, reload]);

  if (loading && !order) return <div className="p-8 font-mono">Loading...</div>;
  if (!order) return <div className="p-8 text-destructive font-mono">{loadError || "Order not found."}</div>;

  const applyResult = (res: any) => {
    if (res?.data) setOrder(prev => prev ? { ...prev, ...res.data } : prev);
    else void reload();
  };

  const run = async (fn: () => Promise<any>, okTitle: string, failTitle: string) => {
    try {
      setUpdating(true);
      const res = await fn();
      if (res?.success) {
        applyResult(res);
        toast({ title: okTitle, variant: "success" });
      } else {
        toast({ title: failTitle, description: res?.error, variant: "error", duration: 0 });
      }
    } catch (err: any) {
      toast({ title: failTitle, description: err.message, variant: "error", duration: 0 });
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkPaid = () =>
    run(() => updatePayment(orderId, userName, "PAID"), `${orderId} marked paid`, "Failed to update payment");

  const handleUnverify = async () => {
    const ok = await confirm({
      title: "Undo verification",
      message: order["QR Sent"]
        ? `${orderId} goes back to PENDING. Their ticket email was already sent — they keep it.`
        : `${orderId} goes back to PENDING.`,
      confirmLabel: "Unverify",
      destructive: true,
    });
    if (!ok) return;
    run(() => updatePayment(orderId, userName, "PENDING"), `${orderId} set back to pending`, "Failed to update payment");
  };

  const handleMarkCollected = () =>
    run(() => updateCollection({ orderId }, userName, "COLLECTED"), `${orderId} marked collected`, "Failed to update collection");

  const handleUndoCollect = async () => {
    const ok = await confirm({
      title: "Undo collection",
      message: `${orderId} goes back to UNCOLLECTED.`,
      confirmLabel: "Undo",
      destructive: true,
    });
    if (!ok) return;
    run(() => updateCollection({ orderId }, userName, "NOT_COLLECTED"), `${orderId} set back to uncollected`, "Failed to update collection");
  };

  const handleResend = async () => {
    const already = !!order["QR Sent"];
    const ok = await confirm({
      title: already ? "Resend ticket" : "Send ticket",
      message: `${already ? "Resend" : "Send"} the QR ticket email to ${order["College Email"] || "this student"}?`,
      confirmLabel: already ? "Resend" : "Send",
    });
    if (!ok) return;
    run(() => sendSingleTicket(orderId), `Ticket sent for ${orderId}`, `Could not send ticket for ${orderId}`);
  };

  const handleSaveNotes = async () => {
    await run(() => updateNotes(orderId, noteText), "Notes saved", "Failed to save notes");
    setEditingNotes(false);
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 container mx-auto max-w-4xl">
      <div className="flex items-center gap-4 border-b border-border/50 pb-4">
        <Link href="/orders" aria-label="Back to orders">
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
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Digital ID</p>
                <p className="font-mono mt-1">{order["Digital ID"]}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Register No</p>
                <p className="font-mono mt-1">{order["Register Number"]}</p>
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
                <p className="font-mono mt-1 text-xs break-all">{order["College Email"]}</p>
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
                <div className="space-y-3">
                  <div className="p-4 bg-muted border border-border brutal-shadow text-sm">
                    <p className="text-muted-foreground">Verified by <span className="font-bold text-foreground">{order["Payment Verified By"]}</span></p>
                    <p className="font-mono text-xs text-muted-foreground mt-1">{new Date(order["Payment Verified At"]).toLocaleString()}</p>
                  </div>
                  <Button variant="outline" className="w-full font-bold tracking-widest" disabled={updating} onClick={handleUnverify}>
                    UNVERIFY PAYMENT
                  </Button>
                </div>
              ) : order["Payment Method"] !== "UPI" && !isAdmin ? (
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center py-2">
                  Cash payments can only be verified by heads
                </p>
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
              <CardTitle className="uppercase tracking-widest text-sm text-muted-foreground">QR Ticket</CardTitle>
              {order["QR Sent"] ? <Badge variant="success">SENT</Badge> : <Badge variant="warning">NOT SENT</Badge>}
            </CardHeader>
            <CardContent className="pt-4 border-t border-border/50">
              {order["Payment Status"] === "PAID" ? (
                <Button className="w-full font-bold tracking-widest h-12" disabled={updating} onClick={handleResend}>
                  {order["QR Sent"] ? "RESEND TICKET EMAIL" : "SEND TICKET EMAIL"}
                </Button>
              ) : (
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center py-2">
                  Verify payment first
                </p>
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
                <div className="space-y-3">
                  <div className="p-4 bg-muted border border-border brutal-shadow text-sm">
                    <p className="text-muted-foreground">Collected by <span className="font-bold text-foreground">{order["Collector"]}</span></p>
                    <p className="font-mono text-xs text-muted-foreground mt-1">{new Date(order["Collected At"]).toLocaleString()}</p>
                  </div>
                  <Button variant="outline" className="w-full font-bold tracking-widest" disabled={updating} onClick={handleUndoCollect}>
                    UNDO COLLECTION
                  </Button>
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
