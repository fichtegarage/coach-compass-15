import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
    if (!workoutId) return;
    supabase
      .from("workouts")
      .select("exercises")
      .eq("id", workoutId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.exercises) setExercises(data.exercises);
      });
  }, [workoutId]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        client_id: clientId,
        workout_id: workoutId ?? null,
        assessment_scores: scores,
        coach_notes: coachNotes,
        sleep_score: sleep,
        energy_score: energy,
        complaints,
        completed_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("workout_logs").insert(payload);
      if (error) {
        setSaveError(`Fehler beim Speichern: ${error.message}`);
        return;
      }

      // Assessment abgeschlossen → Timestamp auf Client setzen
      if (isAssessment) {
        await supabase
          .from("clients")
          .update({ assessment_completed_at: new Date().toISOString() })
          .eq("id", clientId);
      }

      setSaved(true);
      setTimeout(() => onClose(), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{isAssessment ? "🧪 Assessment-Session" : "🏋️ Training-Session"}</h2>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>

        {isAssessment && (
          <AssessmentGuide clientId={clientId} />
        )}

        {isAssessment && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-base text-amber-800">Assessment-Übungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ASSESSMENT_EXERCISES.map((ex) => (
                <div key={ex.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{ex.name}</span>
                    <span className="text-xs text-amber-600">{ex.metric}</span>
                  </div>
                  <p className="text-xs text-slate-500">{ex.cue}</p>
                  <input
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="Ergebnis / Beobachtung"
                    value={scores[ex.name] ?? ""}
                    onChange={(e) => setScores((s) => ({ ...s, [ex.name]: e.target.value }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!isAssessment && exercises.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Übungen</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {exercises.map((ex: any, i: number) => (
                  <li key={i} className="text-sm">{ex.name} — {ex.sets}×{ex.reps} {ex.weight ? `@ ${ex.weight}` : ""}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Check-in</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">Schlaf (1–10)</label>
              <input type="range" min={1} max={10} value={sleep} onChange={(e) => setSleep(Number(e.target.value))} className="w-full" />
              <span className="text-sm">{sleep}</span>
            </div>
            <div>
              <label className="text-sm font-medium">Energie (1–10)</label>
              <input type="range" min={1} max={10} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full" />
              <span className="text-sm">{energy}</span>
            </div>
            <div>
              <label className="text-sm font-medium">Beschwerden / Besonderheiten</label>
              <Textarea value={complaints} onChange={(e) => setComplaints(e.target.value)} placeholder="z.B. Knieschmerzen links" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Coach-Notizen</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={coachNotes} onChange={(e) => setCoachNotes(e.target.value)} placeholder="Beobachtungen, Anpassungen, nächste Schritte..." />
          </CardContent>
        </Card>

        {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
        {saved && <p className="text-green-600 text-sm font-medium">✅ Session gespeichert!</p>}

        <Button onClick={handleSave} disabled={saving || saved} className="w-full">
          {saving ? "Speichert..." : saved ? "Gespeichert" : "Session abschließen"}
        </Button>
      </div>
    </div>
  );
}
