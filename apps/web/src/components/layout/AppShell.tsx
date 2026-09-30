import { useLiveNotifications } from "@/hooks/life";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { DemoBanner } from "./DemoBanner";
import { MobileNav } from "./MobileNav";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  useLiveNotifications();

  return (
    <div className="min-h-dvh">
      <TopNav />
      <main
        id="main"
        className="mx-auto w-full max-w-[1200px] px-5 pb-32 pt-28 md:px-5 md:pb-16 md:pt-32"
      >
        <div className="fade-in-up">
          <DemoBanner />
          {children}
        </div>
      </main>
      {isMobile && <MobileNav />}
    </div>
  );
}
