"use client"
import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardSummary, getDashboardSummary, sendQrTicketsBatch, getEmailQuota } from "@/lib/api";
import { useToast, useConfirm } from "@/components/ui/toast";

const pct = (value: number, target: number) => Math.min(100, target > 0 ? (value / target) * 100 : 0);
const pctLabel = (p: number, hasProgress: boolean) =>
  !hasProgress ? "0" : p < 1 ? p.toFixed(1) : String(Math.round(p));
const DASHBOARD_STORAGE_KEY = "invente-dashboard-summary-v1";

function GoalBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const p = pct(value, target);
  return (
    <div className="flex-1 p-4 sm:p-6 border-r-2 border-b-2 border-border bg-background">
      <div className="flex justify-between items-baseline mb-3">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
        <span className="text-sm font-black tracking-tighter">
          {value}<span className="text-muted-foreground"> / {target}</span>
        </span>
      </div>
      <div className="h-3 border-2 border-border bg-background overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: value > 0 ? `max(3px, ${p}%)` : "0%" }} />
      </div>
      <div className="mt-2 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {pctLabel(p, value > 0)}%
      </div>
    </div>
  );
}

export default function DashboardClient({ isAdmin }: { isAdmin?: boolean }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [sendingQRs, setSendingQRs] = useState(false);
  const [qrProgress, setQrProgress] = useState<{sent: number, remaining: number} | null>(null);
  const [emailQuota, setEmailQuota] = useState<number | null>(null);
  const requestInFlight = useRef(false);
  const hasSummary = useRef(false);
  const isMounted = useRef(true);

  const refreshSummary = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;

    try {
      const data = await getDashboardSummary();
      if (isMounted.current) {
        setSummary(data);
        hasSummary.current = true;
        setLastSynced(new Date());
        setError(null);
        try {
          window.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
        } catch {
          // Browser storage is only a stale-data convenience, never a requirement.
        }
      }
    } catch (err: unknown) {
      if (isMounted.current && !hasSummary.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch dashboard summary");
      }
    } finally {
      requestInFlight.current = false;
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    const initialLoad = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(DASHBOARD_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.data?.totalOrders !== undefined && isMounted.current) {
            setSummary(parsed.data);
            hasSummary.current = true;
            setLoading(false);
            setLastSynced(new Date(Number(parsed.savedAt) || Date.now()));
          }
        }
      } catch {
        // Ignore malformed/blocked browser storage and use the live request.
      }
      void refreshSummary();
    }, 0);
    const interval = window.setInterval(refreshSummary, 5000);

    return () => {
      isMounted.current = false;
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [refreshSummary]);

  const refreshQuota = useCallback(() => {
    if (!isAdmin) return;
    getEmailQuota().then(setEmailQuota);
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && summary && emailQuota === null) refreshQuota();
  }, [isAdmin, summary, emailQuota, refreshQuota]);

  if (loading && !summary) return <div className="p-8 font-mono">Loading dashboard...</div>;
  if (error && !summary) {
    return (
      <div className="p-8 text-destructive font-mono space-y-4">
        <p>Error: {error}</p>
        <button className="border-2 border-border px-4 py-2 text-foreground" onClick={() => { setError(null); setLoading(true); refreshSummary(); }}>
          Retry
        </button>
      </div>
    );
  }
  if (!summary) return <div className="p-8 font-mono">Waiting for dashboard data...</div>;

  const totalOrders = summary.totalOrders;
  const paidOrders = summary.paidOrders;
  const collectedOrders = summary.collectedOrders;

  // Aspirational goal — a motivator, not a hard cap.
  const tshirtTarget = 250;

  const expectedRevenue = totalOrders * 300;
  const receivedRevenue = paidOrders * 300;
  const upiOrders = summary.upiOrders;
  const cashOrders = summary.cashOrders;
  const sizes = summary.sizes;
  const eligibleForQr = summary.paidNoQrOrders;

  const handleSendTickets = async () => {
    const ok = await confirm({
      title: "Send QR tickets",
      message: `Email a ticket to ${eligibleForQr} verified student${eligibleForQr === 1 ? "" : "s"}?`,
      confirmLabel: "Send",
    });
    if (!ok) return;

    setSendingQRs(true);
    setQrProgress({ sent: 0, remaining: eligibleForQr });
    
    try {
      let isDone = false;
      let totalSent = 0;
      let totalFailed = 0;
      let quotaHit = false;
      const failedList: Array<{ orderId: string; email: string; reason: string }> = [];

      while (!isDone) {
        const res = await sendQrTicketsBatch();
        totalSent += res.sent || 0;
        totalFailed += res.failed || 0;
        if (res.failures?.length) failedList.push(...res.failures);
        setQrProgress({ sent: totalSent, remaining: res.remaining ?? 0 });

        if (res.quotaExhausted) { quotaHit = true; break; }
        // No progress this round (every remaining address errored) — stop rather than loop forever.
        if ((res.sent || 0) === 0 && !res.done) break;
        isDone = res.done;
      }

      const parts: string[] = [];
      if (totalFailed > 0) {
        parts.push(`${totalFailed} failed and were left unsent — retried on the next run.`);
        parts.push(...failedList.slice(0, 5).map((f) => `• ${f.email}: ${f.reason}`));
      }
      if (quotaHit) {
        parts.push("Gmail's daily send limit was reached. Unsent tickets are untouched — run again tomorrow, no duplicates.");
      }
      toast({
        title: `Sent ${totalSent} QR ticket${totalSent === 1 ? "" : "s"}`,
        description: parts.join("\n") || undefined,
        variant: quotaHit || totalFailed > 0 ? "warning" : "success",
        duration: quotaHit || totalFailed > 0 ? 0 : 4500,
      });
      refreshSummary();
      refreshQuota();
    } catch (err: unknown) {
      toast({
        title: "Ticket send failed",
        description: err instanceof Error ? err.message : "The ticket send failed",
        variant: "error",
        duration: 0,
      });
    } finally {
      setSendingQRs(false);
      setQrProgress(null);
    }
  };

  const recentActivities = summary.activities.map((activity) => ({
    ...activity,
    timestamp: new Date(activity.timestamp),
  }));

  return (
    <div className="p-4 sm:p-8 space-y-0 container mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b-2 border-border pb-4 mb-8 sm:mb-12">
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none">Dashboard</h1>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mt-2 sm:mt-0">
          SYNC / {lastSynced.toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-0 border-t-2 border-l-2 border-border mb-8 sm:mb-12">
        <div className="p-3 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[140px] sm:min-h-[180px] bg-background text-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Total Orders</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{totalOrders}</div>
        </div>
        <div className="p-3 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[140px] sm:min-h-[180px] bg-warning text-warning-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em]">Pending</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{totalOrders - paidOrders}</div>
        </div>
        <div className="p-3 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[140px] sm:min-h-[180px] bg-success text-success-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em]">Paid</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{paidOrders}</div>
        </div>
        <div className="p-3 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[140px] sm:min-h-[180px] bg-secondary text-secondary-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em]">Paid · No QR</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{eligibleForQr}</div>
        </div>
        <div className="p-3 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between min-h-[140px] sm:min-h-[180px] bg-primary text-primary-foreground">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em]">Collected</h2>
          <div className="text-5xl sm:text-6xl leading-none font-black tracking-tighter">{collectedOrders}</div>
        </div>
      </div>

      <div className="mb-8 sm:mb-12">
        <div className="border-t-2 border-l-2 border-border">
          <div className="p-3 sm:p-4 border-r-2 border-b-2 border-border bg-background flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Progress to Goal</h2>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Aim / {tshirtTarget}</span>
          </div>
          <div className="flex flex-col sm:flex-row">
            <GoalBar label="Orders" value={totalOrders} target={tshirtTarget} color="bg-foreground" />
            <GoalBar label="Paid" value={paidOrders} target={tshirtTarget} color="bg-success" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t-2 border-l-2 border-border mb-8 sm:mb-12">
        <div className="p-4 sm:p-6 border-r-2 border-b-2 border-border flex flex-col justify-between bg-background text-foreground">
          <div className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Revenue</h2>
          </div>
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
              <span>UPI / {upiOrders}</span>
              <span>CASH / {cashOrders}</span>
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
        <div className="border-2 border-border bg-secondary text-secondary-foreground flex flex-col lg:flex-row mb-8 sm:mb-12">
          <div className="p-4 sm:p-6 border-b-2 lg:border-b-0 lg:border-r-2 border-border flex-1">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter leading-none mb-2 uppercase">Tickets</h2>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em]">Batch Send QR Codes</p>
          </div>
          <div className="p-4 sm:p-6 flex flex-col justify-center min-w-full lg:min-w-[400px]">
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Eligible</span>
              <span className="text-4xl font-black tracking-tighter leading-none">{eligibleForQr}</span>
            </div>
            <div className="flex justify-between items-center mb-4 text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
              <span>Gmail Sends Left Today</span>
              <span>{emailQuota === null ? "…" : emailQuota < 0 ? "?" : emailQuota}</span>
            </div>
            {emailQuota !== null && emailQuota >= 0 && emailQuota < eligibleForQr && (
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warning mb-3 leading-relaxed">
                Only {emailQuota} of {eligibleForQr} can send today. Run again tomorrow for the rest — no duplicates.
              </p>
            )}
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
                className="w-full font-black tracking-[0.2em] uppercase h-12 border-2 border-secondary-foreground disabled:opacity-50 hover:bg-secondary-foreground hover:text-secondary transition-colors duration-300" 
                disabled={eligibleForQr === 0}
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
            recentActivities.map((act) => (
              <div key={act.id} className="flex flex-col sm:flex-row border-r-2 border-b-2 border-border hover:bg-muted transition-colors duration-300">
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
