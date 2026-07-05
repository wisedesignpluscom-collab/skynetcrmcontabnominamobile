import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/session";

export default async function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSession();

  return (
    <>
      <Sidebar userName={user?.name ?? ""} userRole={user?.role ?? ""} />
      <main className="ml-60 min-h-screen p-8">{children}</main>
    </>
  );
}
