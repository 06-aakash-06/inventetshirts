"use client"
import { useOrders } from "@/context/OrdersContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { orders, loading, error, lastSynced } = useOrders();

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
    <div className="p-4 sm:p-8 space-y-8 container mx-auto">
      <div className="flex justify-between items-end">
        <h1 className="text-3xl font-bold tracking-tighter">Dashboard</h1>
        <span className="text-xs font-mono text-muted-foreground border-b border-border/50">
          Last synced: {lastSynced.toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black">{totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Pending Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-warning">{totalOrders - paidOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Paid Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-success">{paidOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-primary">{collectedOrders.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="uppercase tracking-widest text-sm text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center border-b border-border/50 pb-2">
              <span className="font-bold">Expected</span>
              <span className="font-mono text-lg font-bold">₹{expectedRevenue}</span>
            </div>
            <div className="flex justify-between items-center border-b border-border/50 pb-2">
              <span className="font-bold">Received</span>
              <span className="font-mono text-lg font-bold text-success">₹{receivedRevenue}</span>
            </div>
            <div className="flex justify-between items-center text-sm pt-2 font-mono text-muted-foreground">
              <span>UPI: {upiOrders.length}</span>
              <span>Cash: {cashOrders.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="uppercase tracking-widest text-sm text-muted-foreground">Size Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(sizes).map(([size, count]) => (
                <div key={size} className="flex flex-col items-center justify-center bg-muted p-2 brutal-shadow">
                  <span className="text-xs font-bold text-muted-foreground">{size}</span>
                  <span className="text-xl font-bold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-sm text-muted-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivities.length === 0 ? (
              <div className="text-sm text-muted-foreground font-mono">No recent activity.</div>
            ) : (
              recentActivities.map((act) => (
                <div key={act.id} className="flex items-start justify-between border-b border-border/50 pb-4 last:border-0 last:pb-0">
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="font-bold">{act.user}</span> {act.description}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {act.timestamp.toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={act.type === 'payment' ? 'success' : 'default'}>
                    {act.type.toUpperCase()}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
