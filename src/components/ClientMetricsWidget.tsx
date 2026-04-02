/**
 * ClientMetricsWidget.tsx
 * 
 * Widget für Kunden um eigene Körpermaße einzutragen.
 * Wird auf der Kundenseite (BookingPage) angezeigt.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Scale, Ruler, Plus, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Metric {
  id: string;
  recorded_at: string;
  recorded_by: string;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_percent: number | null;
  waist_cm: number | null;
  notes: string | null;
}

interface ClientMetricsWidgetProps {
  clientId: string;
}

const ClientMetricsWidget: React.FC<ClientMetricsWidgetProps> = ({ clientId }) => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadMetrics();
  }, [clientId]);

  const loadMetrics = async () => {
    const { data } = await supabase
      .from('client_metrics')
      .select('*')
      .eq('client_id', clientId)
      .order('recorded_at', { ascending: false })
      .limit(10);
    
    setMetrics(data || []);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!weight && !waist && !bodyFat) {
      toast.error('Bitte mindestens einen Wert eingeben');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('client_metrics').insert({
      client_id: clientId,
      recorded_by: 'client',
      weight_kg: weight ? parseFloat(weight) : null,
      waist_cm: waist ? parseFloat(waist) : null,
      body_fat_percent: bodyFat ? parseFloat(bodyFat) : null,
      notes: notes || null,
    });

    if (error) {
      console.error(error);
      toast.error('Fehler beim Speichern');
    } else {
      toast.success('Werte gespeichert!');
      setWeight('');
      setWaist('');
      setBodyFat('');
      setNotes('');
      setDialogOpen(false);
      loadMetrics();
    }
    setSaving(false);
  };

  const latest = metrics[0];
  const previous = metrics[1];

  // Trend berechnen
  const weightTrend = latest?.weight_kg && previous?.weight_kg
    ? latest.weight_kg - previous.weight_kg
    : null;

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Scale className="w-4 h-4 text-orange-400" />
            Meine Werte
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-orange-400 hover:text-orange-300 hover:bg-slate-700">
                <Plus className="w-4 h-4 mr-1" />
                Eintragen
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-800 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle className="text-white">Neue Werte eintragen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-300 text-xs">Gewicht (kg)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={weight}
                      onChange={e => setWeight(e.target.value)}
                      placeholder="z.B. 75.5"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-xs">Taillenumfang (cm)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={waist}
                      onChange={e => setWaist(e.target.value)}
                      placeholder="z.B. 85"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Körperfett % (optional)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={bodyFat}
                    onChange={e => setBodyFat(e.target.value)}
                    placeholder="z.B. 18.5"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs">Notiz (optional)</Label>
                  <Input
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="z.B. Morgens nüchtern gemessen"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <Button 
                  onClick={handleSubmit} 
                  disabled={saving}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Speichern'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {!latest ? (
          <p className="text-sm text-slate-400">
            Noch keine Werte eingetragen. Tracke dein Gewicht für bessere Fortschrittskontrolle!
          </p>
        ) : (
          <div className="space-y-3">
            {/* Aktuelles Gewicht */}
            {latest.weight_kg && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300 text-sm">Gewicht</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-lg">{latest.weight_kg} kg</span>
                  {weightTrend !== null && (
                    <span className={`text-xs flex items-center ${
                      weightTrend < 0 ? 'text-green-400' : weightTrend > 0 ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {weightTrend < 0 ? <TrendingDown className="w-3 h-3" /> : 
                       weightTrend > 0 ? <TrendingUp className="w-3 h-3" /> : 
                       <Minus className="w-3 h-3" />}
                      {Math.abs(weightTrend).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {/* Taillenumfang */}
            {latest.waist_cm && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300 text-sm">Taille</span>
                </div>
                <span className="text-white font-bold">{latest.waist_cm} cm</span>
              </div>
            )}

            {/* Körperfett */}
            {latest.body_fat_percent && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300 text-sm">Körperfett</span>
                <span className="text-white font-bold">{latest.body_fat_percent}%</span>
              </div>
            )}

            {/* Letztes Update */}
            <p className="text-xs text-slate-500 pt-1 border-t border-slate-700">
              Zuletzt: {format(new Date(latest.recorded_at), 'd. MMM yyyy', { locale: de })}
              {latest.recorded_by === 'coach' && ' (Coach)'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ClientMetricsWidget;
