import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();

  return (
    <div className="flex min-h-dvh">
      {!isMobile && <Sidebar />}
      <main
        id="main"
        className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-24 pt-6 md:px-10 md:pb-10 md:pt-10"
      >
        {children}
      </main>
      {isMobile && <MobileNav />}
    </div>
  );
}
