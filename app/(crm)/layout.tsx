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
      <main className="min-h-screen px-4 pb-8 pt-20 lg:ml-60 lg:px-8 lg:pt-8">{children}</main>
    </>
  );
}
