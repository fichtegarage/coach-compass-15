import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import AssessmentGuide from "@/components/AssessmentGuide";

const ASSESSMENT_EXERCISES = [
  { name: "Overhead Squat", cue: "Arme gestreckt, Füße hüftbreit", metric: "Tiefe, Kniestellung, Vorneigung" },
  { name: "Einbeiniger Stand", cue: "30 Sekunden je Seite", metric: "Sekunden, Ausgleichsbewegungen" },
  { name: "Schulter Innenrotation", cue: "Arm 90° gebeugt, Daumen nach unten", metric: "Grad Bewegungsumfang" },
  { name: "Schulter Außenrotation", cue: "Arm 90° gebeugt, Daumen nach oben", metric: "Grad Bewegungsumfang" },
  { name: "Hip Hinge", cue: "Stab an Wirbelsäule, Knie leicht gebeugt", metric: "Qualität der Beugung" },
  { name: "Push-up", cue: "Körper gerade, Ellbogen 45°", metric: "Anzahl saubere Wdh." },
  { name: "Rumpfstabilität Plank", cue: "Neutrale Wirbelsäule, Bauch angespannt", metric: "Sekunden" },
];

interface Props {
  clientId: string;
  workoutId?: string;
  isAssessment?: boolean;
  onClose: () => void;
}

export default function SessionCoachView({ clientId, workoutId, isAssessment, onClose }: Props) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [coachNotes, setCoachNotes] = useState("");
  const [sleep, setSleep] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [complaints, setComplaints] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<any[]>([]);

  useEffect(() => {
    if (!workoutId || isAssessment) return;
    supabase
      .from("workouts")
      .select("exercises")
      .eq("id", workoutId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.exercises) setExercises(data.exercises as any[]);
      });
  }, [workoutId, isAssessment]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.from("session_logs").insert({
        client_id: clientId,
        workout_id: workoutId ?? null,
        assessment_scores: isAssessment ? scores : null,
        coach_notes: coachNotes,
        sleep,
        energy,
        complaints,
      });
      if (error) throw error;

      if (isAssessment) {
        await supabase
          .from("clients")
          .update({ assessment_completed_at: new Date().toISOString() })
          .eq("id", clientId);
      }

      setSaved(true);
      setTimeout(() => onClose(), 1000);
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isAssessment ? "Assessment durchführen" : "Session dokumentieren"}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        {isAssessment && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bewegungsscreening</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AssessmentGuide exercises={ASSESSMENT_EXERCISES} />
              <div className="space-y-2 mt-3">
                {ASSESSMENT_EXERCISES.map((ex) => (
                  <div key={ex.name} className="flex items-center gap-3">
                    <span className="w-48 text-sm font-medium">{ex.name}</span>
                    <input
                      className="flex-1 border rounded px-2 py-1 text-sm"
                      placeholder={ex.metric}
                      value={scores[ex.name] ?? ""}
                      onChange={(e) => setScores((s) => ({ ...s, [ex.name]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!isAssessment && exercises.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Übungen</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {exercises.map((ex: any, i: number) => (
                  <li key={i} className="text-sm text-slate-600">
                    {ex.name} — {ex.sets}×{ex.reps} {ex.weight ? `@ ${ex.weight}` : ""}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Check-in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-6">
              <div>
                <label className="text-sm text-slate-500">Schlaf (1–10)</label>
                <input type="number" min={1} max={10} value={sleep}
                  onChange={(e) => setSleep(Number(e.target.value))}
                  className="block border rounded px-2 py-1 w-16 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm text-slate-500">Energie (1–10)</label>
                <input type="number" min={1} max={10} value={energy}
                  onChange={(e) => setEnergy(Number(e.target.value))}
                  className="block border rounded px-2 py-1 w-16 text-sm mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-500">Beschwerden</label>
              <Textarea value={complaints} onChange={(e) => setComplaints(e.target.value)}
                placeholder="Schmerzen, Einschränkungen…" className="mt-1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Coach-Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={coachNotes} onChange={(e) => setCoachNotes(e.target.value)}
              placeholder="Beobachtungen, nächste Schritte…" />
          </CardContent>
        </Card>

        {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
        {saved
          ? <p className="text-green-600 font-medium text-center">✓ Gespeichert</p>
          : <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? "Speichern…" : "Session abschließen"}
            </Button>
        }
      </div>
    </div>
  );
}
