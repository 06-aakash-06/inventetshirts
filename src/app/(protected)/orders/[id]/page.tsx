import { getSession } from "@/lib/auth";
import OrderDetailClient from "./OrderDetailClient";
import { OrdersProvider } from "@/context/OrdersContext";
import { redirect } from "next/navigation";

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  
  const p = await props.params;

  return (
    <OrdersProvider>
      <OrderDetailClient orderId={p.id} userName={session.user.name} isAdmin={session.user.role === "admin"} />
    </OrdersProvider>
  );
}
