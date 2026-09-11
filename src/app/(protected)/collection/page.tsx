import { getSession } from "@/lib/auth";
import CollectionClient from "./CollectionClient";
import { OrdersProvider } from "@/context/OrdersContext";
import { redirect } from "next/navigation";

export const metadata = { title: "Distribution · INVENTE 11.0" };

export default async function CollectionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  
  return (
    <OrdersProvider>
      <CollectionClient userName={session.user.name} />
    </OrdersProvider>
  );
}
