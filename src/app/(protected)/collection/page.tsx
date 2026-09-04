import { getSession } from "@/lib/auth";
import CollectionClient from "./CollectionClient";
import { redirect } from "next/navigation";

export const metadata = { title: "Distribution · INVENTE 11.0" };

export default async function CollectionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  
  return <CollectionClient userName={session.user.name} />;
}
