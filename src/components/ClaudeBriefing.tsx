/**
 * ClaudeBriefing.tsx
 *
 * Generiert ein KI-Coaching-Briefing direkt in der App.
 * Sendet Workout-Logs, PRs, Erstgespräch-Daten, Health Records und Metrics an Claude
 * und zeigt die strukturierte Antwort inline an.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SetLog {
  exercise_name: string;
  weight_kg: number;
  reps_done: number;
  is_pr: boolean;
  logged_at: string;
}

interface WorkoutLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  plan_workouts: { day_label: string } | null;
  set_logs: SetLog[];
}

interface PersonalRecord {
  exercise_name: string;
  weight_kg: number;
  reps: number;
  achieved_at: string;
}

interface ConversationData {
  motivation?: string | null;
  fitness_goal_text?: string | null;
  stress_level?: string | null;
  sleep_quality?: string | null;
  current_training?: string | null;
  personality_type?: string | null;
  goal_importance?: string | null;
  success_criteria?: string | null;
}

interface HealthRecord {
  cardiovascular?: string | null;
  musculoskeletal?: string | null;
  current_pain?: string | null;
  surgeries?: string | null;
  medications?: string | null;
}

interface ClientMetric {
  recorded_at: string;
  weight_kg?: number | null;
  body_fat_percent?: number | null;
  caliper_triceps_mm?: number | null;
  caliper_suprailiac_mm?: number | null;
  caliper_thigh_mm?: number | null;
}

interface ClaudeBriefingProps {
  clientId: string;
  clientName: string;
  workoutLogs: WorkoutLog[];
  personalRecords: PersonalRecord[];
  conversation: ConversationData | null;
  recentCheckins?: { 
    week_start: string; 
    energy_level: number; 
    sleep_quality: number; 
    mood: number; 
    notes: string | null 
  }[];
  pinnedNote?: string | null;
}

// ── Prompt aufbauen ───────────────────────────────────────────────────────────

function buildPrompt(
  clientName: string,
  logs: WorkoutLog[],
  prs: PersonalRecord[],
  conv: ConversationData | null,
  checkins: ClaudeBriefingProps['recentCheckins'],
  healthRecord: HealthRecord | null,
  metrics: ClientMetric[],
  pinnedNote?: string | null
): string {
  const completedLogs = logs.filter(l => l.completed_at).slice(0, 8);
  const totalSets = completedLogs.reduce((s, l) => s + (l.set_logs?.length || 0), 0);
  const totalVolume = completedLogs.reduce((sum, l) =>
    sum + (l.set_logs || []).reduce((s, x) => s + (Number(x.weight_kg) || 0) * (Number(x.reps_done) || 0), 0), 0
  );

  const workoutSummary = completedLogs.map(log => {
    const name = log.plan_workouts?.day_label || 'Freies Training';
    const sets = (log.set_logs || []);
    const vol = sets.reduce((s, x) => s + (Number(x.weight_kg) || 0) * (Number(x.reps_done) || 0), 0);
    const prCount = sets.filter(s => s.is_pr).length;
    return `- ${new Date(log.started_at).toLocaleDateString('de-DE')}: ${name}, ${sets.length} Sätze, ${Math.round(vol)}kg Volumen${prCount > 0 ? `, ${prCount} PR(s)` : ''}`;
  }).join('\n');

  const prSummary = prs.slice(0, 10).map(pr =>
    `- ${pr.exercise_name}: ${Number(pr.weight_kg)}kg × ${pr.reps} Wdh. (${new Date(pr.achieved_at).toLocaleDateString('de-DE')})`
  ).join('\n');

  // ── Stagnation Detection ──
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentPRs = prs.filter(pr => new Date(pr.achieved_at) > thirtyDaysAgo);
  const stagnationWarning = recentPRs.length === 0 && prs.length > 0;

  // ── Metrics Trend ──
  let metricsTrend = '';
  if (metrics.length >= 2) {
    const latest = metrics[0];
    const previous = metrics[1];
    const changes = [];
    
    if (latest.weight_kg && previous.weight_kg) {
      const diff = latest.weight_kg - previous.weight_kg;
      changes.push(`Gewicht: ${latest.weight_kg}kg (${diff > 0 ? '+' : ''}${diff.toFixed(1)}kg)`);
    }
    if (latest.body_fat_percent && previous.body_fat_percent) {
      const diff = latest.body_fat_percent - previous.body_fat_percent;
      changes.push(`Körperfett: ${latest.body_fat_percent}% (${diff > 0 ? '+' : ''}${diff.toFixed(1)}%)`);
    }
    
    if (changes.length > 0) {
      metricsTrend = `\n### Körpermaße-Trend (letzte 2 Messungen)\n${changes.join('\n')}`;
    }
  } else if (metrics.length === 1) {
    const latest = metrics[0];
    const data = [];
    if (latest.weight_kg) data.push(`Gewicht: ${latest.weight_kg}kg`);
    if (latest.body_fat_percent) data.push(`Körperfett: ${latest.body_fat_percent}%`);
    if (data.length > 0) {
      metricsTrend = `\n### Aktuelle Körpermaße\n${data.join(', ')}`;
    }
  }

  // ── Health Summary ──
  let healthSummary = '';
  if (healthRecord) {
    const conditions = [];
    if (healthRecord.current_pain) conditions.push(`Schmerzen: ${healthRecord.current_pain}`);
    if (healthRecord.cardiovascular) conditions.push(`Kardio: ${healthRecord.cardiovascular}`);
    if (healthRecord.musculoskeletal) conditions.push(`Muskuloskeletal: ${healthRecord.musculoskeletal}`);
    if (healthRecord.medications) conditions.push(`Medikamente: ${healthRecord.medications}`);
    
    if (conditions.length > 0) {
      healthSummary = `\n### Gesundheit\n${conditions.join('\n')}`;
    }
  }

  const personalityLabel: Record<string, string> = {
    success_oriented: 'Erfolgsorientiert (optimistisch, zielorientiert)',
    avoidance_oriented: 'Meidungsorientiert (braucht Sicherheit, vorsichtig)',
    unclear: 'Noch unklar',
  };

  return `Du bist ein erfahrener Personal Trainer. Erstelle ein kurzes Coaching-Briefing für die nächste Einheit.

## Klient: ${clientName}

${pinnedNote ? `### 🔖 WICHTIG (Gepinnt)\n${pinnedNote}\n` : ''}
${healthSummary}
${conv ? `### Erstgespräch-Hintergrund
- Ziel: ${conv.fitness_goal_text || '—'}
- Motivation: ${conv.motivation || '—'}
- Persönlichkeitstyp: ${personalityLabel[conv.personality_type || ''] || '—'}
- Stresslevel: ${conv.stress_level || '—'}
- Schlaf: ${conv.sleep_quality || '—'}
- Erfolgskriterium: ${conv.success_criteria || '—'}` : ''}
${metricsTrend}

### Letzte Workouts (${completedLogs.length} von ${logs.length} gesamt)
${workoutSummary || '— Noch keine Workouts'}

### Statistik
- Gesamtvolumen: ${Math.round(totalVolume)}kg über ${completedLogs.length} Einheiten
- Gesamtsätze: ${totalSets}

### Personal Records
${prSummary || '— Noch keine PRs'}
${stagnationWarning ? '\n⚠️ **STAGNATION:** Keine Personal Records in den letzten 30 Tagen!' : ''}

${checkins && checkins.length > 0 ? `### Wöchentliche Check-ins (letzte ${checkins.length} Wochen)
${checkins.map(c => `- KW ab ${c.week_start}: Energie ${c.energy_level}/5, Schlaf ${c.sleep_quality}/5, Stimmung ${c.mood}/5${c.notes ? ` · Notiz: „${c.notes}"` : ''}`).join('\n')}` : ''}

---

Antworte auf Deutsch. Strukturiere deine Antwort in genau diese Abschnitte:

**Zusammenfassung (2-3 Sätze)**
Kurzer Überblick über den Trainingsstand.

**Stärken**
Was läuft gut? (2-3 Punkte)

**Handlungsfelder**
Wo gibt es Stagnation oder Verbesserungspotenzial? (2-3 Punkte)

**Empfehlung für die nächste Einheit**
Konkrete Hinweise für den Coach. (3-5 Sätze)

**Motivationsansatz**
Wie soll der Coach ${clientName} heute ansprechen, basierend auf dem Persönlichkeitstyp?`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

const ClaudeBriefing: React.FC<ClaudeBriefingProps> = ({
  clientId,
  clientName,
  workoutLogs,
  personalRecords,
  conversation,
  recentCheckins,
  pinnedNote,
}) => {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  
  // ── Additional Data States ──
  const [healthRecord, setHealthRecord] = useState<HealthRecord | null>(null);
  const [metrics, setMetrics] = useState<ClientMetric[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ── Load Additional Data ──
  useEffect(() => {
    async function loadAdditionalData() {
      try {
        // Load health records
        const { data: health } = await supabase
          .from('client_health_records')
          .select('cardiovascular, musculoskeletal, current_pain, surgeries, medications')
          .eq('client_id', clientId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (health) {
          setHealthRecord(health);
        }

        // Load recent metrics (last 3 measurements)
        const { data: metricsData } = await supabase
          .from('client_metrics')
          .select('recorded_at, weight_kg, body_fat_percent, caliper_triceps_mm, caliper_suprailiac_mm, caliper_thigh_mm')
          .eq('client_id', clientId)
          .order('recorded_at', { ascending: false })
          .limit(3);

        if (metricsData) {
          setMetrics(metricsData);
        }

        setDataLoaded(true);
      } catch (error) {
        console.error('Error loading additional data:', error);
        setDataLoaded(true); // Continue even if data load fails
      }
    }

    if (clientId) {
      loadAdditionalData();
    }
  }, [clientId]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setBriefing(null);

    const prompt = buildPrompt(
      clientName, 
      workoutLogs, 
      personalRecords, 
      conversation, 
      recentCheckins,
      healthRecord,
      metrics,
      pinnedNote
    );

    try {
            // Supabase-Session holen, um JWT als Bearer-Token mitzuschicken.
      // Der /api/claude-proxy-Endpoint verlangt seit dem Security-Fix Auth.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error('Nicht eingeloggt — bitte erneut anmelden.');
      }

      const response = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });


      const data = await response.json();
      const text = data.content
        ?.filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('') || '';

      if (!text) throw new Error('Keine Antwort erhalten');
      setBriefing(text);
    } catch (e: any) {
      setError('Briefing konnte nicht generiert werden. Bitte erneut versuchen.');
      console.error('ClaudeBriefing error:', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Markdown-ähnliches Rendering ─────────────────────────────────────────
  const renderBriefing = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        return (
          <p key={i} className="font-semibold text-sm text-foreground mt-3 mb-1 first:mt-0">
            {line.replace(/\*\*/g, '')}
          </p>
        );
      }
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return (
          <p key={i} className="text-sm text-muted-foreground pl-3 before:content-['·'] before:mr-2 before:text-primary">
            {line.slice(2)}
          </p>
        );
      }
      if (line.trim() === '') return <div key={i} className="h-1" />;
      return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
    });
  };

  const canGenerate = workoutLogs.filter(l => l.completed_at).length > 0 && dataLoaded;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">KI-Coaching-Briefing</span>
          {briefing && (
            <span className="text-xs text-muted-foreground">· für {clientName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {briefing && (
            <button
              onClick={generate}
              disabled={loading}
              className="text-muted-foreground hover:text-primary transition-colors"
              title="Neu generieren"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {briefing && (
            <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!briefing && !loading && (
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground mb-3">
            Analysiert Workout-Verlauf, PRs, Erstgespräch-Daten, Gesundheit & Körpermaße. 
            Gibt einen strukturierten Coaching-Hinweis für die nächste Einheit.
          </p>
          <Button
            size="sm"
            onClick={generate}
            disabled={!canGenerate}
            className="gap-2 w-full"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {dataLoaded ? 'Briefing generieren' : 'Lade Daten...'}
          </Button>
          {!canGenerate && dataLoaded && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Mindestens 1 abgeschlossenes Workout nötig.
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="px-4 pb-4 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
          <p className="text-sm text-muted-foreground">Claude analysiert die Daten…</p>
        </div>
      )}

      {error && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={generate}>Erneut versuchen</Button>
        </div>
      )}

      {briefing && open && (
        <div className="px-4 pb-4 border-t border-primary/10 pt-3 space-y-0.5">
          {renderBriefing(briefing)}
        </div>
      )}
    </div>
  );
};

export default ClaudeBriefing;
