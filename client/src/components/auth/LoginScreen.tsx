import Router from "next/router";
import { useEffect, useState } from "react";
import { useAuthMutations } from "@/hooks/useAuthMutations";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useIsClientMounted } from "@/hooks/useIsClientMounted";
import type { LoginFormValues, RegisterFormValues } from "@/lib/auth.types";
import { LoginForm } from "./LoginForm";

export function LoginScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const mounted = useIsClientMounted();
  const { initialized, isAuthenticated } = useAuthSession();
  const { login, register, isSubmitting, error } = useAuthMutations();

  useEffect(() => {
    if (mounted && initialized && isAuthenticated) {
      void Router.replace("/drive");
    }
  }, [mounted, initialized, isAuthenticated]);

  const handleLogin = (values: LoginFormValues) => {
    login(values);
  };

  const handleRegister = (values: RegisterFormValues) => {
    register(values);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <LoginForm
        error={error}
        isSubmitting={isSubmitting}
        mode={mode}
        onLogin={handleLogin}
        onModeChange={setMode}
        onRegister={handleRegister}
      />
    </main>
  );
}
