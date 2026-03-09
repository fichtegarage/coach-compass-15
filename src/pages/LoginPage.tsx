import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dumbbell, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';

const LoginPage: React.FC = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) {
      setError('Ungültige Anmeldedaten');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Bitte gib deine E-Mail-Adresse ein');
      return;
    }
    setForgotLoading(true);
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setError('Fehler beim Senden der E-Mail');
    } else {
      setForgotSent(true);
    }
    setForgotLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Dumbbell className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">CoachHub</h1>
          <p className="text-muted-foreground text-sm mt-1">Personal Training Verwaltung</p>
        </div>

        {forgotMode ? (
          forgotSent ? (
            <div className="glass-card p-6 text-center space-y-3">
              <CheckCircle className="w-12 h-12 text-primary mx-auto" />
              <p className="text-foreground font-medium">E-Mail gesendet!</p>
              <p className="text-muted-foreground text-sm">
                Prüfe dein Postfach für den Link zum Zurücksetzen des Passworts.
              </p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => { setForgotMode(false); setForgotSent(false); setError(''); }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Zurück zum Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="glass-card p-6 space-y-4">
              <p className="text-muted-foreground text-sm">
                Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum Zurücksetzen deines Passworts.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                  required
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={forgotLoading}>
                {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Link senden'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setForgotMode(false); setError(''); }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Zurück zum Login
              </Button>
            </form>
          )
        ) : (
          <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Anmelden'}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setForgotMode(true); setError(''); }}
            >
              Passwort vergessen?
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
