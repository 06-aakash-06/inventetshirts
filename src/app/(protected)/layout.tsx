import { Navbar } from "@/components/layout/Navbar";
import { Barcode } from "@/components/layout/Barcode";
import { AppProviders } from "@/components/ui/toast";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <AppProviders>
        <main className="flex-1 flex flex-col">{children}</main>
        <Barcode />
      </AppProviders>
    </>
  );
}
