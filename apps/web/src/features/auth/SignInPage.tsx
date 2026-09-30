import { SignIn } from "@clerk/react";
import { Wordmark } from "@/components/layout/TopNav";
import { DemoLogin } from "./DemoLogin";

export function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <Wordmark />
      <div className="text-center">
        <h1 className="page-title">Sign in to Livora</h1>
        <p className="mt-2 text-[15px] text-text-secondary">Your household, timeline and kitchen, private to you.</p>
      </div>
      <SignIn routing="hash" withSignUp />
      <DemoLogin />
    </main>
  );
}
