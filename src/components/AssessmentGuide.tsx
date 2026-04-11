import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Circle, Lock, AlertCircle } from "lucide-react";

interface AssessmentGuideProps {
  clientId: string;
  workoutId?: string;
  onComplete?: () => void;
}

interface ClientConversation {
  goals?: string;
  experience?: string;
  contraindications?: string;
  barriers?: string;
  motivation_type?: string;
}

const ASSESSMENT_EXERCISES = [
  {
    id: "squat",
    name: "Kniebeuge (Bodyweight)",
    type: "score",
    cues: [
      "Füße hüftbreit, Zehen leicht auswärts",
      "Knie verfolgen Zehenrichtung",
      "Brust aufrecht, Blick geradeaus",
      "Tief wie möglich ohne Fersenheben",
    ],
    measureHint: "Score 1–5 (1=stark eingeschränkt, 5=perfekt)",
  },
  {
    id: "hinge",
    name: "Hip Hinge",
    type: "score",
    cues: [
      "Stab an Rücken (Kopf-BWS-Steißbein)",
      "Knie minimal gebeugt",
      "Hüfte nach hinten schieben",
      "Rücken bleibt neutral",
    ],
    measureHint: "Score 1–5",
  },
  {
    id: "pushup",
    name: "Push-up",
    type: "reps",
    cues: [
      "Hände schulterbreit",
      "Körper gerade wie ein Brett",
      "Brust berührt fast den Boden",
      "Ellbogen 45° vom Körper",
    ],
    measureHint: "Maximale saubere Wiederholungen",
  },
  {
    id: "row",
    name: "TRX / Inverted Row",
    type: "reps",
    cues: [
      "Körper gerade, Fersen am Boden",
      "Schulterblätter zusammenziehen",
      "Brust zur Verankerung ziehen",
      "Kontrollierte Negative",
    ],
    measureHint: "Maximale saubere Wiederholungen",
  },
  {
    id: "plank",
    name: "Plank",
    type: "seconds",
    cues: [
      "Unterarme parallel, Ellbogen unter Schultern",
      "Becken neutral (kein Hohlkreuz)",
      "Gesäß und Core aktiv",
      "Blick zum Boden",
    ],
    measureHint: "Haltezeit in Sekunden",
  },
  {
    id: "shoulder_mobility",
    name: "Schultermobilität",
    type: "score",
    cues: [
      "Arm hinter Kopf, anderer hinter Rücken",
      "Fingerspitzen annähern",
      "Beide Seiten testen",
      "Keine Schmerzprovokation!",
    ],
    measureHint: "Score 1–5 (beide Seiten)",
  },
  {
    id: "single_leg",
    name: "Single-Leg Balance",
    type: "seconds",
    cues: [
      "Augen offen, dann geschlossen",
      "Standbein minimal gebeugt",
      "Arme seitlich",
      "Beide Seiten messen",
    ],
    measureHint: "Haltezeit in Sekunden (beste Seite)",
  },
];

function getScoreColor(val: string, type: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  if (type === "score") {
    if (n >= 4) return "text-green-600";
    if (n >= 3) return "text-yellow-600";
    return "text-red-600";
  }
  if (type === "reps") {
    if (n >= 10) return "text-green-600";
    if (n >= 5) return "text-yellow-600";
    return "text-red-600";
  }
  if (type === "seconds") {
    if (n >= 60) return "text-green-600";
    if (n >= 30) return "text-yellow-600";
    return "text-red-600";
  }
  return "";
}

function getScoreEmoji(val: string, type: string): string {
  const color = getScoreColor(val, type);
  if (color === "text-green-600") return "🟢";
  if (color === "text-yellow-600") return "🟡";
  if (color === "text-red-600") return "🔴";
  return "⚪";
}

// ─── Erstgespräch-Banner ───────────────────────────────────────
function ConversationBanner({ clientId }: { clientId: string }) {
  const [conversation, setConversation] = useState<ClientConversation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("client_conversations")
        .select("goals, experience, contraindications, barriers, motivation_type")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setConversation(data);
      setLoading(false);
    }
    load();
  }, [clientId]);

  if (loading) return null;
  if (!conversation) return null;

  const items = [
    { label: "Ziele", value: conversation.goals, icon: "🎯" },
    { label: "Erfahrung", value: conversation.experience, icon: "📈" },
    { label: "Kontraindikationen", value: conversation.contraindications, icon: "⚠️" },
    { label: "Barrieren", value: conversation.barriers, icon: "🚧" },
  ].filter((i) => i.value);

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">📋 Erstgespräch-Zusammenfassung</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="text-sm">
            <span className="font-medium text-slate-700">{item.icon} {item.label}: </span>
            <span className="text-slate-600">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Assessment-Zusammenfassung ────────────────────────────────
function AssessmentSummary({
  scores,
  coachNotes,
  onCoachNotesChange,
  onFinish,
  saving,
  saveError,
}: {
  scores: Record<string, string>;
  coachNotes: string;
  onCoachNotesChange: (v: string) => void;
  onFinish: () => void;
  saving: boolean;
  saveError: string | null;
  workoutId?: string;
}) {
  const rows = ASSESSMENT_EXERCISES.map((ex) => ({
    name: ex.name,
    value: scores[ex.id] ?? "",
    type: ex.type,
  }));

  const scored = rows.filter((r) => r.value !== "");
  const strengths = scored.filter((r) => getScoreColor(r.value, r.type) === "text-green-600");
  const focus = scored.filter((r) => getScoreColor(r.value, r.type) === "text-red-600");

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-slate-800">📊 Assessment-Ergebnisse</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1 pr-4 font-medium text-slate-600">Übung</th>
              <th className="text-left py-1 font-medium text-slate-600">Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-slate-100">
                <td className="py-1 pr-4 text-slate-700">{r.name}</td>
                <td className={`py-1 font-semibold ${getScoreColor(r.value, r.type)}`}>
                  {getScoreEmoji(r.value, r.type)} {r.value || "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {strengths.length > 0 && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
          <p className="text-xs font-semibold text-green-700 uppercase mb-1">💪 Stärken</p>
          <ul className="text-sm text-green-800 space-y-0.5">
            {strengths.map((s) => <li key={s.name}>✓ {s.name}</li>)}
          </ul>
        </div>
      )}

      {focus.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-xs font-semibold text-red-700 uppercase mb-1">🎯 Fokuspunkte</p>
          <ul className="text-sm text-red-800 space-y-0.5">
            {focus.map((f) => <li key={f.name}>→ {f.name}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="coach-notes">Coach-Notizen</Label>
        <Textarea
          id="coach-notes"
          value={coachNotes}
          onChange={(e) => onCoachNotesChange(e.target.value)}
          placeholder="Gesamteindruck, Besonderheiten, nächste Schritte..."
          rows={4}
        />
      </div>

      {saveError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      <Button onClick={onFinish} disabled={saving} className="w-full">
        {saving ? "Wird gespeichert..." : "✅ Assessment abschließen"}
      </Button>
    </div>
  );
}

// ─── Haupt-Komponente ──────────────────────────────────────────
export default function AssessmentGuide({ clientId, workoutId, onComplete }: AssessmentGuideProps) {
  // Phase 1 – Tagesform
  const [sleep, setSleep] = useState("");
  const [energy, setEnergy] = useState("");
  const [complaints, setComplaints] = useState("");
  const [tagesformDone, setTagesformDone] = useState(false);

  // Phase 2 – Warm-up
  const [arrival, setArrival] = useState<"walk" | "bike" | "car" | "">("");
  const [warmupChecks, setWarmupChecks] = useState<Record<string, boolean>>({});

  // Phase 4 – Scores
  const [scores, setScores] = useState<Record<string, string>>({});

  // Phase 5 – Abschluss
  const [coachNotes, setCoachNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const WARMUP_ITEMS = [
    { id: "cardio", label: arrival === "car" ? "5 Min Ergometer / Rudern" : "✓ Anreise zählt als Cardio" },
    { id: "foam", label: "Foam Rolling: Waden, IT-Band, Brustwirbelsäule" },
    { id: "hip90", label: "Hip 90/90 – 5x pro Seite" },
    { id: "worldsgreatest", label: "World's Greatest Stretch – 5x pro Seite" },
    { id: "shouldercircles", label: "Schulterkreisen + Armkreisen – 10x" },
    { id: "birddog", label: "Bird-Dog – 5x pro Seite" },
    { id: "glute", label: "Glute Bridge – 10x" },
  ];

  const allWarmupDone = WARMUP_ITEMS.every((i) => warmupChecks[i.id]);

  function toggleWarmup(id: string) {
    setWarmupChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const handleComplete = async () => {
setSaving(true);
await saveAssessment();
if (workoutLogId) {
await supabase.from('workout_logs')
.update({ completed_at: new Date().toISOString() })
.eq('id', workoutLogId);
}
await supabase.from('plan_workouts')
.update({ is_assessment: true, status: 'completed' })
.eq('id', workoutId);
// assessment_completed_at auf dem Client setzen
await supabase.from('clients')
.update({ assessment_completed_at: new Date().toISOString() })
.eq('id', clientId);
// next_plan_workout_id auf das naechste Workout vorruecken
try {
const { data: currentWorkout } = await supabase
.from('plan_workouts')
.select('plan_id, session_order')
.eq('id', workoutId).single();
if (currentWorkout) {
const { data: allWorkouts } = await supabase
.from('plan_workouts')
.select('id, session_order')
.eq('plan_id', currentWorkout.plan_id)
.order('session_order', { ascending: true, nullsFirst: false });
if (allWorkouts && allWorkouts.length > 1) {
const currentIdx = allWorkouts.findIndex(w => w.id === workoutId);
const next = currentIdx >= 0 && currentIdx + 1 < allWorkouts.length
? allWorkouts[currentIdx + 1] : null;
if (next) {
await supabase.from('training_plans')
.update({ next_plan_workout_id: next.id })
.eq('id', currentWorkout.plan_id);
}
}
}
} catch { /* Zeiger optional */ }
setSaving(false);
toast.success('Assessment abgeschlossen!');
onComplete();
};

  if (saved) {
    return (
      <div className="text-center py-12 space-y-2">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
        <p className="text-lg font-semibold text-slate-800">Assessment abgeschlossen!</p>
        <p className="text-sm text-slate-500">Ergebnisse wurden gespeichert.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Phase 3 – Erstgespräch-Banner */}
      <ConversationBanner clientId={clientId} />

      <Tabs defaultValue="tagesform">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tagesform">1 Tagesform</TabsTrigger>
          <TabsTrigger value="warmup" disabled={!tagesformDone}>
            {!tagesformDone && <Lock className="h-3 w-3 mr-1" />}2 Warm-up
          </TabsTrigger>
          <TabsTrigger value="assessment" disabled={!allWarmupDone || !tagesformDone}>
            {(!allWarmupDone || !tagesformDone) && <Lock className="h-3 w-3 mr-1" />}3 Assessment
          </TabsTrigger>
          <TabsTrigger value="summary">4 Ergebnisse</TabsTrigger>
        </TabsList>

        {/* Phase 1 – Tagesform */}
        <TabsContent value="tagesform" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Tagesform-Check</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>😴 Schlafqualität (1–5)</Label>
                <Input
                  type="number" min={1} max={5}
                  value={sleep}
                  onChange={(e) => setSleep(e.target.value)}
                  placeholder="z.B. 4"
                />
              </div>
              <div className="space-y-1">
                <Label>⚡ Energielevel (1–5)</Label>
                <Input
                  type="number" min={1} max={5}
                  value={energy}
                  onChange={(e) => setEnergy(e.target.value)}
                  placeholder="z.B. 3"
                />
              </div>
              <div className="space-y-1">
                <Label>🩹 Beschwerden / Schmerzen</Label>
                <Textarea
                  value={complaints}
                  onChange={(e) => setComplaints(e.target.value)}
                  placeholder="Keine / Knie links leicht empfindlich..."
                  rows={2}
                />
              </div>
              <Button
                className="w-full"
                disabled={!sleep || !energy}
                onClick={() => setTagesformDone(true)}
              >
                {tagesformDone ? "✅ Gespeichert" : "Tagesform bestätigen →"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phase 2 – Warm-up */}
        <TabsContent value="warmup" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Warm-up Checkliste</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>🚗 Anreise</Label>
                <div className="flex gap-2">
                  {(["walk", "bike", "car"] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={arrival === mode ? "default" : "outline"}
                      size="sm"
                      onClick={() => setArrival(mode)}
                    >
                      {mode === "walk" ? "🚶 Zu Fuß" : mode === "bike" ? "🚲 Rad" : "🚗 Auto"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {WARMUP_ITEMS.map((item) => {
                  const checked = !!warmupChecks[item.id];
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleWarmup(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                        checked
                          ? "bg-green-600 border-green-600 text-white"
                          : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      {checked
                        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-white" />
                        : <Circle className="h-5 w-5 shrink-0 text-slate-400" />}
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {allWarmupDone && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  ✅ Warm-up abgeschlossen – weiter zum Assessment!
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phase 3 – Assessment-Übungen */}
        <TabsContent value="assessment" className="space-y-4 pt-4">
          {ASSESSMENT_EXERCISES.map((ex) => (
            <Card key={ex.id}>
              <CardHeader>
                <CardTitle className="text-base">{ex.name}</CardTitle>
                <p className="text-xs text-slate-500">{ex.measureHint}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1">
                  {ex.cues.map((cue) => (
                    <li key={cue} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-blue-400 mt-0.5">→</span>{cue}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    placeholder={ex.type === "score" ? "1–5" : ex.type === "reps" ? "Wdh." : "Sek."}
                    value={scores[ex.id] ?? ""}
                    onChange={(e) =>
                      setScores((prev) => ({ ...prev, [ex.id]: e.target.value }))
                    }
                    className="w-28"
                  />
                  <span className={`text-lg font-bold ${getScoreColor(scores[ex.id] ?? "", ex.type)}`}>
                    {getScoreEmoji(scores[ex.id] ?? "", ex.type)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Phase 4 – Zusammenfassung */}
        <TabsContent value="summary" className="pt-4">
          <Card>
            <CardContent className="pt-4">
              <AssessmentSummary
                scores={scores}
                coachNotes={coachNotes}
                onCoachNotesChange={setCoachNotes}
                onFinish={handleFinish}
                saving={saving}
                saveError={saveError}
                workoutId={workoutId}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
