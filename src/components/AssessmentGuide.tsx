import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2 } from "lucide-react";

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
    measureHint: "Score 1–5 (1=stark eingeschränkt, 5=perfekt)",
  },
  {
    id: "shoulder",
    name: "Schulter-Mobilitätstest",
    type: "shoulder_cm",
    cues: [
      "Eine Hand von oben, eine von unten",
      "Hinter dem Rücken zusammenführen",
      "Keine Rotation des Oberkörpers",
    ],
    measureHint:
      "cm: + = Überlappung (gut), – = Lücke (eingeschränkt), je Seite",
  },
  {
    id: "pushup",
    name: "Push-up Test",
    type: "reps",
    cues: [
      "Hände schulterbreit",
      "Körper Brett von Kopf bis Ferse",
      "Brust berührt fast den Boden",
      "Ellbogen ~45° vom Körper",
    ],
    measureHint: "Anzahl sauberer Wiederholungen",
  },
  {
    id: "plank",
    name: "Plank",
    type: "seconds",
    cues: [
      "Unterarme und Zehen",
      "Hüfte nicht hängen lassen",
      "Bauch angespannt",
      "Schultern über Ellbogen",
    ],
    measureHint: "Sekunden bis Form bricht",
  },
  {
    id: "balance",
    name: "Einbeiniger Stand",
    type: "balance_seconds",
    cues: [
      "Augen offen, flacher Untergrund",
      "Hüfte gerade (kein Absinken)",
      "Standbein leicht gebeugt",
    ],
    measureHint: "Sekunden links + rechts",
  },
  {
    id: "forward_fold",
    name: "Vorwärtsbeugen stehend",
    type: "cm",
    cues: [
      "Füße zusammen, Knie gestreckt",
      "Langsam nach vorne beugen",
      "Finger Richtung Boden",
    ],
    measureHint: "cm: + = unter Bodenniveau (gut), – = über Boden",
  },
];

// ─── Vorbereitungs-Banner ────────────────────────────────────────────────────
function PreparationBanner({ clientId }: { clientId: string }) {
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

  if (!conversation) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-amber-700 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Kein Erstgespräch gefunden – bitte vor dem Assessment nachholen.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasContraindications =
    conversation.contraindications &&
    conversation.contraindications.trim().length > 0 &&
    conversation.contraindications.toLowerCase() !== "keine";

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm text-blue-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Erstgespräch – Zusammenfassung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {conversation.goals && (
          <div className="text-sm">
            <span className="font-medium text-blue-900">Ziele: </span>
            <span className="text-blue-800">{conversation.goals}</span>
          </div>
        )}
        {conversation.experience && (
          <div className="text-sm">
            <span className="font-medium text-blue-900">Erfahrung: </span>
            <span className="text-blue-800">{conversation.experience}</span>
          </div>
        )}
        {conversation.barriers && (
          <div className="text-sm">
            <span className="font-medium text-blue-900">Barrieren: </span>
            <span className="text-blue-800">{conversation.barriers}</span>
          </div>
        )}
        {hasContraindications ? (
          <div className="text-sm flex items-start gap-1">
            <span className="font-medium text-red-700">⚠ Kontraindikationen: </span>
            <span className="text-red-700">{conversation.contraindications}</span>
          </div>
        ) : (
          <div className="text-sm text-blue-700">
            ✓ Keine Kontraindikationen
          </div>
        )}
        {conversation.motivation_type && (
          <div className="text-sm">
            <span className="font-medium text-blue-900">Motivationstyp: </span>
            <span className="text-blue-800">{conversation.motivation_type}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
// ────────────────────────────────────────────────────────────────────────────

export default function AssessmentGuide({
  clientId,
  workoutId,
  onComplete,
}: AssessmentGuideProps) {
  const [activeTab, setActiveTab] = useState("assessment");
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [deepQuestions, setDeepQuestions] = useState({
    motivation: "",
    barriers: "",
    lifestyle: "",
    regeneration: "",
    preferences: "",
  });
  const [strengths, setStrengths] = useState("");
  const [focusAreas, setFocusAreas] = useState("");
  const [contraindications, setContraindications] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Workout-Log State
  const [planExercises, setPlanExercises] = useState<any[]>([]);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [setLogs, setSetLogs] = useState<
    Record<string, { reps: string; weight: string }[]>
  >({});
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [workoutCompleted, setWorkoutCompleted] = useState(false);

  useEffect(() => {
    if (workoutId) {
      loadPlanExercises();
      loadExistingLog();
      loadExistingAssessment();
    }
  }, [workoutId]);

  async function loadPlanExercises() {
    const { data } = await supabase
      .from("plan_exercises")
      .select("*")
      .eq("plan_workout_id", workoutId)
      .order("order_in_workout");
    setPlanExercises(data || []);
    if (data) {
      const initialSets: Record<string, { reps: string; weight: string }[]> =
        {};
      data.forEach((ex) => {
        initialSets[ex.id] = Array(ex.sets || 3)
          .fill(null)
          .map(() => ({ reps: "", weight: "" }));
      });
      setSetLogs(initialSets);
    }
  }

  async function loadExistingLog() {
    const { data: log } = await supabase
      .from("workout_logs")
      .select("*")
      .eq("plan_workout_id", workoutId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (log) {
      setWorkoutLogId(log.id);
      setWorkoutStarted(true);
      if (log.completed_at) setWorkoutCompleted(true);
      const { data: sets } = await supabase
        .from("set_logs")
        .select("*")
        .eq("workout_log_id", log.id);
      if (sets && sets.length > 0) {
        const grouped: Record<string, { reps: string; weight: string }[]> = {};
        sets.forEach((s) => {
          const key = s.exercise_id || s.exercise_name;
          if (!grouped[key]) grouped[key] = [];
          grouped[key][s.set_number - 1] = {
            reps: String(s.reps_done || ""),
            weight: String(s.weight_kg || ""),
          };
        });
        setSetLogs((prev) => ({ ...prev, ...grouped }));
      }
    }
  }

  async function loadExistingAssessment() {
    const { data } = await supabase
      .from("assessment_results")
      .select("*")
      .eq("workout_id", workoutId)
      .maybeSingle();
    if (data) {
      if (data.measurements)
        setMeasurements(data.measurements as Record<string, string>);
      if (data.deep_questions)
        setDeepQuestions(
          data.deep_questions as {
            motivation: string;
            barriers: string;
            lifestyle: string;
            regeneration: string;
            preferences: string;
          }
        );
      if (data.identified_strengths)
        setStrengths(data.identified_strengths.join(", "));
      if (data.focus_areas) setFocusAreas(data.focus_areas.join(", "));
      if (data.contraindications)
        setContraindications(data.contraindications.join(", "));
      if (data.notes) setNotes(data.notes);
    }
  }

  async function startWorkout() {
    const { data: log } = await supabase
      .from("workout_logs")
      .insert({
        client_id: clientId,
        plan_workout_id: workoutId,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (log) {
      setWorkoutLogId(log.id);
      setWorkoutStarted(true);
    }
  }

  async function logSet(
    exerciseId: string,
    exerciseName: string,
    setIndex: number
  ) {
    if (!workoutLogId) return;
    const setData = setLogs[exerciseId]?.[setIndex];
    if (!setData) return;
    await supabase.from("set_logs").upsert(
      {
        workout_log_id: workoutLogId,
        exercise_id: exerciseId,
        exercise_name: exerciseName,
        set_number: setIndex + 1,
        reps_done: Number(setData.reps) || 0,
        weight_kg: Number(setData.weight) || 0,
      },
      { onConflict: "workout_log_id,exercise_id,set_number" }
    );
  }

  async function completeWorkout() {
    if (!workoutLogId) return;
    await supabase
      .from("workout_logs")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", workoutLogId);
    await supabase
      .from("plan_workouts")
      .update({ status: "completed" })
      .eq("id", workoutId);
    setWorkoutCompleted(true);
  }

  async function saveAssessment() {
    setSaving(true);
    const measurementsData: Record<string, string | number> = {};
    ASSESSMENT_EXERCISES.forEach((ex) => {
      if (ex.type === "score") {
        measurementsData[`${ex.id}_score`] = measurements[`${ex.id}_score`] || "";
        measurementsData[`${ex.id}_notes`] = measurements[`${ex.id}_notes`] || "";
      } else if (ex.type === "shoulder_cm") {
        measurementsData["shoulder_left_cm"] = measurements["shoulder_left_cm"] || "";
        measurementsData["shoulder_right_cm"] = measurements["shoulder_right_cm"] || "";
        measurementsData["shoulder_notes"] = measurements["shoulder_notes"] || "";
      } else if (ex.type === "reps") {
        measurementsData["pushup_reps"] = measurements["pushup_reps"] || "";
        measurementsData["pushup_notes"] = measurements["pushup_notes"] || "";
      } else if (ex.type === "seconds") {
        measurementsData["plank_seconds"] = measurements["plank_seconds"] || "";
        measurementsData["plank_notes"] = measurements["plank_notes"] || "";
      } else if (ex.type === "balance_seconds") {
        measurementsData["balance_left_seconds"] = measurements["balance_left_seconds"] || "";
        measurementsData["balance_right_seconds"] = measurements["balance_right_seconds"] || "";
        measurementsData["balance_notes"] = measurements["balance_notes"] || "";
      } else if (ex.type === "cm") {
        measurementsData["forward_fold_cm"] = measurements["forward_fold_cm"] || "";
        measurementsData["forward_fold_notes"] = measurements["forward_fold_notes"] || "";
      }
    });

    const payload = {
      workout_id: workoutId,
      client_id: clientId,
      measurements: measurementsData,
      deep_questions: deepQuestions,
      identified_strengths: strengths
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      focus_areas: focusAreas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      contraindications: contraindications
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      notes,
    };

    const { data: existing } = await supabase
      .from("assessment_results")
      .select("id")
      .eq("workout_id", workoutId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("assessment_results")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await supabase.from("assessment_results").insert(payload);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function updateMeasurement(key: string, value: string) {
    setMeasurements((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-4 mt-4">

      {/* ── Phase 1: Vorbereitungs-Banner ── */}
      <PreparationBanner clientId={clientId} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="workout">📋 Workout</TabsTrigger>
          <TabsTrigger value="assessment">📊 Assessment</TabsTrigger>
        </TabsList>

        {/* ===== TAB 1: ASSESSMENT ===== */}
        <TabsContent value="assessment" className="space-y-6">

          {/* Bewegungsanalyse */}
          <div>
            <h3 className="font-semibold mb-3">Bewegungsanalyse</h3>
            <div className="space-y-4">
              {ASSESSMENT_EXERCISES.map((ex) => (
                <Card key={ex.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{ex.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{ex.measureHint}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ex.type === "score" && (
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        placeholder="Score 1–5"
                        value={measurements[`${ex.id}_score`] || ""}
                        onChange={(e) =>
                          updateMeasurement(`${ex.id}_score`, e.target.value)
                        }
                      />
                    )}
                    {ex.type === "shoulder_cm" && (
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Links (cm)"
                          value={measurements["shoulder_left_cm"] || ""}
                          onChange={(e) =>
                            updateMeasurement("shoulder_left_cm", e.target.value)
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Rechts (cm)"
                          value={measurements["shoulder_right_cm"] || ""}
                          onChange={(e) =>
                            updateMeasurement("shoulder_right_cm", e.target.value)
                          }
                        />
                      </div>
                    )}
                    {ex.type === "reps" && (
                      <Input
                        type="number"
                        placeholder="Wiederholungen"
                        value={measurements["pushup_reps"] || ""}
                        onChange={(e) =>
                          updateMeasurement("pushup_reps", e.target.value)
                        }
                      />
                    )}
                    {ex.type === "seconds" && (
                      <Input
                        type="number"
                        placeholder="Sekunden"
                        value={measurements["plank_seconds"] || ""}
                        onChange={(e) =>
                          updateMeasurement("plank_seconds", e.target.value)
                        }
                      />
                    )}
                    {ex.type === "balance_seconds" && (
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Links (sek)"
                          value={measurements["balance_left_seconds"] || ""}
                          onChange={(e) =>
                            updateMeasurement(
                              "balance_left_seconds",
                              e.target.value
                            )
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Rechts (sek)"
                          value={measurements["balance_right_seconds"] || ""}
                          onChange={(e) =>
                            updateMeasurement(
                              "balance_right_seconds",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    )}
                    {ex.type === "cm" && (
                      <Input
                        type="number"
                        placeholder="cm"
                        value={measurements["forward_fold_cm"] || ""}
                        onChange={(e) =>
                          updateMeasurement("forward_fold_cm", e.target.value)
                        }
                      />
                    )}
                    <Textarea
                      placeholder="Notizen..."
                      value={
                        ex.type === "shoulder_cm"
                          ? measurements["shoulder_notes"] || ""
                          : ex.type === "reps"
                          ? measurements["pushup_notes"] || ""
                          : ex.type === "seconds"
                          ? measurements["plank_notes"] || ""
                          : ex.type === "balance_seconds"
                          ? measurements["balance_notes"] || ""
                          : ex.type === "cm"
                          ? measurements["forward_fold_notes"] || ""
                          : measurements[`${ex.id}_notes`] || ""
                      }
                      onChange={(e) => {
                        const key =
                          ex.type === "shoulder_cm"
                            ? "shoulder_notes"
                            : ex.type === "reps"
                            ? "pushup_notes"
                            : ex.type === "seconds"
                            ? "plank_notes"
                            : ex.type === "balance_seconds"
                            ? "balance_notes"
                            : ex.type === "cm"
                            ? "forward_fold_notes"
                            : `${ex.id}_notes`;
                        updateMeasurement(key, e.target.value);
                      }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Separator />

          {/* Tiefenfragen */}
          <div>
            <h3 className="font-semibold mb-3">Tiefenfragen</h3>
            <div className="space-y-3">
              <div>
                <Label>Motivation</Label>
                <Textarea
                  value={deepQuestions.motivation}
                  onChange={(e) =>
                    setDeepQuestions((p) => ({ ...p, motivation: e.target.value }))
                  }
                  placeholder="Warum jetzt? Was ist der eigentliche Antrieb?"
                />
              </div>
              <div>
                <Label>Barrieren</Label>
                <Textarea
                  value={deepQuestions.barriers}
                  onChange={(e) =>
                    setDeepQuestions((p) => ({ ...p, barriers: e.target.value }))
                  }
                  placeholder="Was hat bisher nicht funktioniert?"
                />
              </div>
              <div>
                <Label>Lifestyle</Label>
                <Textarea
                  value={deepQuestions.lifestyle}
                  onChange={(e) =>
                    setDeepQuestions((p) => ({ ...p, lifestyle: e.target.value }))
                  }
                  placeholder="Alltag, Beruf, Stress..."
                />
              </div>
              <div>
                <Label>Regeneration</Label>
                <Textarea
                  value={deepQuestions.regeneration}
                  onChange={(e) =>
                    setDeepQuestions((p) => ({ ...p, regeneration: e.target.value }))
                  }
                  placeholder="Schlaf, Erholung, Rhythmus..."
                />
              </div>
              <div>
                <Label>Präferenzen</Label>
                <Textarea
                  value={deepQuestions.preferences}
                  onChange={(e) =>
                    setDeepQuestions((p) => ({ ...p, preferences: e.target.value }))
                  }
                  placeholder="Was macht Spaß, was nicht?"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Auswertung */}
          <div>
            <h3 className="font-semibold mb-3">Auswertung</h3>
            <div className="space-y-3">
              <div>
                <Label>Stärken (kommagetrennt)</Label>
                <Input
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  placeholder="z.B. Mobilität Hüfte, Oberkörperstabilität"
                />
              </div>
              <div>
                <Label>Fokus-Bereiche (kommagetrennt)</Label>
                <Input
                  value={focusAreas}
                  onChange={(e) => setFocusAreas(e.target.value)}
                  placeholder="z.B. Schulterrotation, Rumpfkraft"
                />
              </div>
              <div>
                <Label>Kontraindikationen (kommagetrennt)</Label>
                <Input
                  value={contraindications}
                  onChange={(e) => setContraindications(e.target.value)}
                  placeholder="z.B. Knieschmerzen rechts"
                />
              </div>
              <div>
                <Label>Notizen</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Weitere Beobachtungen..."
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={saveAssessment} disabled={saving}>
              {saving ? "Speichere..." : saved ? "✓ Gespeichert" : "Assessment speichern"}
            </Button>
          </div>
        </TabsContent>

        {/* ===== TAB 2: WORKOUT ===== */}
        <TabsContent value="workout" className="space-y-4">
          {!workoutStarted ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">Workout noch nicht gestartet</p>
              <Button onClick={startWorkout}>▶ Workout starten</Button>
            </div>
          ) : (
            <>
              {/* Assessment-Übungen als Präfix */}
              <div className="space-y-4">
                <h3 className="font-semibold text-amber-700">📋 Assessment-Übungen</h3>
                {ASSESSMENT_EXERCISES.map((ex) => (
                  <Card key={ex.id} className="border-amber-200 bg-amber-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-amber-800">
                        {ex.name}
                      </CardTitle>
                      <p className="text-xs text-amber-600">{ex.measureHint}</p>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-xs text-amber-700 space-y-0.5">
                        {ex.cues.map((cue, i) => (
                          <li key={i}>• {cue}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Separator />

              {/* Plan-Übungen */}
              {planExercises.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold">💪 Plan-Übungen</h3>
                  {planExercises.map((ex) => (
                    <Card key={ex.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{ex.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {ex.sets} Sätze × {ex.reps_target} Wdh.
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {(setLogs[ex.id] || []).map((set, setIndex) => (
                            <div
                              key={setIndex}
                              className="flex items-center gap-2"
                            >
                              <span className="text-sm text-muted-foreground w-16">
                                Satz {setIndex + 1}
                              </span>
                              <Input
                                type="number"
                                placeholder="Wdh"
                                value={set.reps}
                                onChange={(e) => {
                                  const updated = [...(setLogs[ex.id] || [])];
                                  updated[setIndex] = {
                                    ...updated[setIndex],
                                    reps: e.target.value,
                                  };
                                  setSetLogs((prev) => ({
                                    ...prev,
                                    [ex.id]: updated,
                                  }));
                                }}
                                className="w-20"
                              />
                              <Input
                                type="number"
                                placeholder="kg"
                                value={set.weight}
                                onChange={(e) => {
                                  const updated = [...(setLogs[ex.id] || [])];
                                  updated[setIndex] = {
                                    ...updated[setIndex],
                                    weight: e.target.value,
                                  };
                                  setSetLogs((prev) => ({
                                    ...prev,
                                    [ex.id]: updated,
                                  }));
                                }}
                                className="w-20"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  logSet(ex.id, ex.name, setIndex)
                                }
                              >
                                ✓
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {!workoutCompleted ? (
                <Button onClick={completeWorkout} className="w-full">
                  ✓ Workout abschließen
                </Button>
              ) : (
                <div className="text-center text-green-600 font-medium">
                  ✓ Workout abgeschlossen
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
