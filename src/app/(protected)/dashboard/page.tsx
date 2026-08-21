import { getSession } from "@/lib/auth";
import DashboardClient from "./DashboardClient";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <DashboardClient isAdmin={session.user.role === "admin"} />;
}
