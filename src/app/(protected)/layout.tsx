import { Navbar } from "@/components/layout/Navbar";
import { Barcode } from "@/components/layout/Barcode";
import { OrdersProvider } from "@/context/OrdersContext";
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
        <OrdersProvider>
          <main className="flex-1 flex flex-col">{children}</main>
          <Barcode />
        </OrdersProvider>
      </AppProviders>
    </>
  );
}
