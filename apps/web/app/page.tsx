"use client"
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setProgress(100);
    });

    const timeout = setTimeout(() => {
      router.push("/login");
    }, 3000);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-primary/10 via-background to-background">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -left-32 -top-32 h-72 w-72 rounded-full bg-primary/40 blur-3xl" />
        <div className="absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-primary/40 blur-3xl dark:bg-primary/30" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <main className="w-full max-w-md rounded-2xl border border-border/60 bg-card/90 px-8 py-10 text-center shadow-xl backdrop-blur-xl sm:px-10 sm:py-12">
          <div className="flex flex-col items-center gap-5">
            <Image
              src="/logo/logo.png"
              alt="Logo EliteTime"
              width={48}
              height={48}
              className="h-12 w-12 rounded-md object-contain"
              priority
            />
            <p className="text-sm text-muted-foreground">
              Connexion sécurisée à votre espace EliteTime…
            </p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-3000"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
