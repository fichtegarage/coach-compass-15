/**
 * ClaudeBriefing.tsx
 *
 * Generiert ein KI-Coaching-Briefing direkt in der App.
 * Sendet Workout-Logs, PRs und Erstgespräch-Daten an Claude
 * und zeigt die strukturierte Antwort inline an.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

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

interface ClaudeBriefingProps {
  clientName: string;
  workoutLogs: WorkoutLog[];
  personalRecords: PersonalRecord[];
  conversation: ConversationData | null;
}

// ── Prompt aufbauen ───────────────────────────────────────────────────────────

function buildPrompt(
  clientName: string,
  logs: WorkoutLog[],
  prs: PersonalRecord[],
  conv: ConversationData | null
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
    `- ${pr.exercise_name}: ${Number(pr.weight_kg)}kg × ${pr.reps} Wdh.`
  ).join('\n');

  const personalityLabel: Record<string, string> = {
    success_oriented: 'Erfolgsorientiert (optimistisch, zielorientiert)',
    avoidance_oriented: 'Meidungsorientiert (braucht Sicherheit, vorsichtig)',
    unclear: 'Noch unklar',
  };

  return `Du bist ein erfahrener Personal Trainer. Erstelle ein kurzes Coaching-Briefing für die nächste Einheit.

## Klient: ${clientName}

${conv ? `### Erstgespräch-Hintergrund
- Ziel: ${conv.fitness_goal_text || '—'}
- Motivation: ${conv.motivation || '—'}
- Persönlichkeitstyp: ${personalityLabel[conv.personality_type || ''] || '—'}
- Stresslevel: ${conv.stress_level || '—'}
- Schlaf: ${conv.sleep_quality || '—'}
- Erfolgskriterium: ${conv.success_criteria || '—'}` : ''}

### Letzte Workouts (${completedLogs.length} von ${logs.length} gesamt)
${workoutSummary || '— Noch keine Workouts'}

### Statistik
- Gesamtvolumen: ${Math.round(totalVolume)}kg über ${completedLogs.length} Einheiten
- Gesamtsätze: ${totalSets}

### Personal Records
${prSummary || '— Noch keine PRs'}

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
  clientName,
  workoutLogs,
  personalRecords,
  conversation,
}) => {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setBriefing(null);

    const prompt = buildPrompt(clientName, workoutLogs, personalRecords, conversation);

    try {
      const response = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 1000,
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
            Analysiert Workout-Verlauf, PRs und Erstgespräch-Daten. Gibt einen strukturierten
            Coaching-Hinweis für die nächste Einheit.
          </p>
          <Button
            size="sm"
            onClick={generate}
            disabled={workoutLogs.filter(l => l.completed_at).length === 0}
            className="gap-2 w-full"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Briefing generieren
          </Button>
          {workoutLogs.filter(l => l.completed_at).length === 0 && (
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
