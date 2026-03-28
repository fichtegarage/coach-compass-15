import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, ArrowLeft, Flame } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col bg-slate-900">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo / Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 mb-5 shadow-lg shadow-orange-500/20">
            <Flame className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Stronger Every Day
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Personal Training · Jakob Neumann
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm">
          {forgotMode ? (
            forgotSent ? (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center space-y-4 shadow-xl">
                <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-7 h-7 text-green-500" />
                </div>
                <p className="text-white font-semibold">E-Mail gesendet!</p>
                <p className="text-slate-400 text-sm">
                  Prüfe dein Postfach für den Link zum Zurücksetzen des Passworts.
                </p>
                <Button
                  variant="outline"
                  className="mt-2 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                  onClick={() => { setForgotMode(false); setForgotSent(false); setError(''); }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Zurück zum Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-xl">
                <div>
                  <h2 className="text-lg font-semibold text-white">Passwort zurücksetzen</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Gib deine E-Mail-Adresse ein und wir senden dir einen Link.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300">E-Mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="deine@email.de"
                    required
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500 focus:ring-orange-500/20"
                  />
                </div>
                {error && (
                  <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
                <Button 
                  type="submit" 
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-5" 
                  disabled={forgotLoading}
                >
                  {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Link senden'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-slate-400 hover:text-white hover:bg-slate-700"
                  onClick={() => { setForgotMode(false); setError(''); }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Zurück zum Login
                </Button>
              </form>
            )
          ) : (
            <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-xl">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500 focus:ring-orange-500/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500 focus:ring-orange-500/20"
                />
              </div>
              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <Button 
                type="submit" 
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-5" 
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Anmelden'}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-slate-500 hover:text-slate-300 transition-colors py-2"
                onClick={() => { setForgotMode(true); setError(''); }}
              >
                Passwort vergessen?
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-slate-600 text-xs">
          © {new Date().getFullYear()} Jakob Neumann · Personal Training
        </p>
      </footer>
    </div>
  );
};

export default LoginPage;
