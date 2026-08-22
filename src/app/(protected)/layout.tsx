import { Navbar } from "@/components/layout/Navbar";
import { Barcode } from "@/components/layout/Barcode";
import { OrdersProvider } from "@/context/OrdersContext";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <OrdersProvider>
        <main className="flex-1 flex flex-col">{children}</main>
        <Barcode />
      </OrdersProvider>
    </>
  );
}
