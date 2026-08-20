import { getSession } from "@/lib/auth";
import OrderDetailClient from "./OrderDetailClient";
import { redirect } from "next/navigation";

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  
  const p = await props.params;

  return <OrderDetailClient orderId={p.id} userName={session.user.name} />;
}
