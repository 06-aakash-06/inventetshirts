"use server"
import { createSession, deleteSession, getTeamUsers } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  
  const users = getTeamUsers();
  const user = users.find((u: any) => u.email === email && u.password === password);
  
  if (user) {
    await createSession({ name: user.name, email: user.email, role: user.role });
    redirect("/dashboard");
  } else {
    // In a real app we'd return an error state and show it, but for MVP we redirect back to login
    redirect("/login?error=InvalidCredentials");
  }
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
