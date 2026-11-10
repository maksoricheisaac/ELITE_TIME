"use client"
import { useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/auth-context';
import { useNotification } from '@/contexts/notification-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import logo from '@public/logo/logo.png'
import Image from 'next/image';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { LoginSchema, type LoginData } from '@/schemas/auth/login';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const { login } = useAuth();
  const { showSuccess, showError } = useNotification();

  const form = useForm<LoginData>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { username: '', password: '' },
    mode: 'onSubmit',
  });

  const handlePasswordKey = (event: KeyboardEvent<HTMLInputElement>) => {
    setIsCapsLockOn(!!(event.getModifierState && event.getModifierState('CapsLock')));
  };

  const onSubmit = async (values: LoginData) => {
    try {
      const response = await login(values.username, values.password);
      if (response) {
        showSuccess('Connexion réussie !');
        setTimeout(() => { window.location.href = '/dashboard'; }, 50);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur de connexion');
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8">
      <main className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src={logo} alt="ELITE TIME" width={88} height={88} priority className="h-[88px] w-[88px] object-contain" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Accédez à votre espace ELITE TIME avec vos identifiants professionnels.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Nom d&apos;utilisateur</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input
                          type="text"
                          placeholder="prenom.nom"
                          autoComplete="username"
                          className="h-11 pl-9 text-base md:h-10 md:text-sm"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => {
                  const { name, value, onChange, onBlur, ref } = field;
                  return (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Mot de passe</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                          <Input
                            ref={ref}
                            name={name}
                            value={value}
                            onChange={onChange}
                            onBlur={() => { onBlur(); setIsCapsLockOn(false); }}
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="h-11 pl-9 pr-11 text-base md:h-10 md:text-sm"
                            onKeyDown={handlePasswordKey}
                            onKeyUp={handlePasswordKey}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((p) => !p)}
                            className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                            aria-pressed={showPassword}
                          >
                            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </FormControl>
                      {isCapsLockOn && (
                        <p role="status" className="flex items-center gap-1 text-xs font-medium text-warning">
                          Verrou majuscules activé
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <Button type="submit" className="h-11 w-full font-medium md:h-10" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="flex items-center gap-2" role="status">
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                    Connexion…
                  </span>
                ) : (
                  'Se connecter'
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Identifiants fournis par votre administrateur
              </p>
            </form>
          </Form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">© ELITE NETWORK — Usage interne</p>
      </main>
    </div>
  );
}
