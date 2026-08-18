import HomeClient from "./HomeClient";
import { getCurrentSession } from "@/lib/current-session";

export default async function Home() {
  const session = await getCurrentSession();
  return <HomeClient canManageUsers={session?.role === "admin"} />;
}
