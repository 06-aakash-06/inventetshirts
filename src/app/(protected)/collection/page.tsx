import { getSession } from "@/lib/auth";
import CollectionClient from "./CollectionClient";
import { redirect } from "next/navigation";

export default async function CollectionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  
  return <CollectionClient userName={session.user.name} />;
}
