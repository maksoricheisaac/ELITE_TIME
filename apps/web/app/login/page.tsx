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
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-[#0b2a45] to-slate-900 flex items-center justify-center px-4 py-6 sm:py-8">
      {/* Orbes d'ambiance */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-1/4 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute right-[-80px] bottom-1/4 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo & titre */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-xl mb-3 sm:h-16 sm:w-16 sm:mb-4">
            <Image src={logo} alt="Elite Time" width={48} height={48} className="h-10 w-10 sm:h-12 sm:w-12" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight sm:text-2xl">Elite Time</h1>
          <p className="text-xs text-white/50 mt-1 sm:text-sm">Gestion des temps & présences</p>
        </div>

        {/* Card de connexion */}
        <div className="bg-white/8 backdrop-blur-xl border border-white/15 rounded-2xl p-6 shadow-2xl sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/80 text-sm font-medium">Nom d&apos;utilisateur</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                        <Input
                          type="text"
                          placeholder="Votre identifiant"
                          autoComplete="username"
                          className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:border-primary/70 focus-visible:ring-primary/30"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
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
                      <FormLabel className="text-white/80 text-sm font-medium">Mot de passe</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                          <Input
                            ref={ref}
                            name={name}
                            value={value}
                            onChange={onChange}
                            onBlur={() => { onBlur(); setIsCapsLockOn(false); }}
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="pl-9 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:border-primary/70 focus-visible:ring-primary/30"
                            onKeyDown={handlePasswordKey}
                            onKeyUp={handlePasswordKey}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((p) => !p)}
                            className="absolute inset-y-0 right-3 flex items-center text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                            aria-label={showPassword ? 'Masquer' : 'Afficher'}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      {isCapsLockOn && (
                        <p className="text-xs text-amber-400 flex items-center gap-1">
                          ⚠ Verrou majuscules activé
                        </p>
                      )}
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  );
                }}
              />

              <p className="text-xs text-white/35 text-center">
                Identifiants fournis par votre administrateur
              </p>

              <Button
                type="submit"
                className="w-full h-10 bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/30 transition-all"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connexion…
                  </span>
                ) : (
                  "Se connecter"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
