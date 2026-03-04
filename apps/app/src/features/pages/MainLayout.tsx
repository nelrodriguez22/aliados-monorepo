import { Outlet } from "react-router-dom";
import { Header } from "@/features/components/Header";
import { Footer } from "@/features/components/Footer";

export function MainLayout() {
  return (
    <section className="min-h-screen flex flex-col bg-white dark:bg-dark-bg text-slate-900 dark:text-dark-text">
      <Header />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      <Footer />
    </section>
  );
}
