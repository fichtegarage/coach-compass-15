import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
    id: "shoulder_r",
    name: "Schulter-Mobilitätstest (rechts)",
    type: "shoulder_cm",
    cues: [
      "Rechte Hand von oben, linke von unten",
      "Hinter dem Rücken zusammenführen",
      "Keine Rotation des Oberkörpers",
    ],
    measureHint: "cm: + = Überlappung (gut), – = Lücke (eingeschränkt)",
  },
  {
    id: "shoulder_l",
    name: "Schulter-Mobilitätstest (links)",
    type: "shoulder_cm",
    cues: [
      "Linke Hand von oben, rechte von unten",
      "Hinter dem Rücken zusammenführen",
      "Keine Rotation des Oberkörpers",
    ],
    measureHint: "cm: + = Überlappung (gut), – = Lücke (eingeschränkt)",
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
    measureHint: "Sekunden halten",
  },
  {
    id: "balance",
    name: "Einbeinstand",
    type: "seconds",
    cues: [
      "Augen offen, dann geschlossen",
      "Standbein minimal gebeugt",
      "Arme seitlich ausgestreckt",
    ],
    measureHint: "Sekunden je Seite (Augen offen / geschlossen)",
  },
];

type ArrivalMode = "walking_cycling" | "car_transit" | "unknown";

const WARMUP_EXERCISES = [
  { id: "armcircles", label: "Armkreisen vorwärts + rückwärts (10×)" },
  { id: "hipcircles", label: "Hüftkreisen (10× je Seite)" },
  { id: "legswings", label: "Leg Swings (10× je Seite)" },
  { id: "retractions", label: "Schulterblatt-Retraktionen (10×)" },
  { id: "airsquats", label: "Air Squats (10×)" },
];

function WarmUpBlock() {
  const [arrival, setArrival] = useState<ArrivalMode>("unknown");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [cardioChecked, setCardioChecked] = useState(false);

  const needsCardio = arrival !== "walking_cycling";
  const allDone =
    WARMUP_EXERCISES.every((e) => checked[e.id]) &&
    (!needsCardio || cardioChecked);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-orange-800">
          🔥 Warm-up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Anreise */}
        <div>
          <p className="text-sm font-medium text-orange-700 mb-2">
            Wie ist der Kunde angekommen?
          </p>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: "walking_cycling", label: "🚶 Zu Fuß / Fahrrad" },
              { value: "car_transit", label: "🚗 Auto / ÖPNV" },
              { value: "unknown", label: "❓ Unbekannt" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setArrival(opt.value as ArrivalMode)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  arrival === opt.value
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-orange-700 border-orange-300 hover:bg-orange-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cardio (nur wenn nötig) */}
        {needsCardio && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="cardio"
              checked={cardioChecked}
              onCheckedChange={(v) => setCardioChecked(!!v)}
            />
            <label
              htmlFor="cardio"
              className={`text-sm cursor-pointer ${
                cardioChecked ? "line-through text-muted-foreground" : ""
              }`}
            >
              5 Min lockeres Gehen / Fahrrad
            </label>
          </div>
        )}

        {arrival === "walking_cycling" && (
          <p className="text-xs text-orange-600 italic">
            ✓ Anreise zählt als Cardio-Warm-up – kein zusätzliches Aufwärmen nötig.
          </p>
        )}

        {/* Mobility-Checkliste */}
        <div className="space-y-2">
          {WARMUP_EXERCISES.map((ex) => (
            <div key={ex.id} className="flex items-center gap-2">
              <Checkbox
                id={ex.id}
                checked={!!checked[ex.id]}
                onCheckedChange={() => toggle(ex.id)}
              />
              <label
                htmlFor={ex.id}
                className={`text-sm cursor-pointer ${
                  checked[ex.id] ? "line-through text-muted-foreground" : ""
                }`}
              >
                {ex.label}
              </label>
            </div>
          ))}
        </div>

        {allDone && (
          <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Warm-up abgeschlossen – bereit für das Assessment!
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
      <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 mb-4">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Kein Erstgespräch gefunden – Ziele und Kontraindikationen unbekannt.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 font-semibold text-blue-800 mb-1">
        <CheckCircle2 className="h-4 w-4" />
        Erstgespräch – Kurzübersicht
      </div>
      {conversation.goals && (
        <div>
          <span className="font-medium text-blue-700">Ziele: </span>
          <span className="text-blue-900">{conversation.goals}</span>
        </div>
      )}
      {conversation.experience && (
        <div>
          <span className="font-medium text-blue-700">Erfahrung: </span>
          <span className="text-blue-900">{conversation.experience}</span>
        </div>
      )}
      {conversation.barriers && (
        <div>
          <span className="font-medium text-blue-700">Barrieren: </span>
          <span className="text-blue-900">{conversation.barriers}</span>
        </div>
      )}
      {conversation.motivation_type && (
        <div>
          <span className="font-medium text-blue-700">Motivation: </span>
          <span className="text-blue-900">{conversation.motivation_type}</span>
        </div>
      )}
      {conversation.contraindications && (
        <div className="flex items-start gap-1 rounded bg-red-100 px-2 py-1 text-red-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Kontraindikationen: </span>
            {conversation.contraindications}
          </span>
        </div>
      )}
    </div>
  );
}

export default function AssessmentGuide({
  clientId,
  workoutId,
  onComplete,
}: AssessmentGuideProps) {
  const [activeTab, setActiveTab] = useState("guide");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [planExercises, setPlanExercises] = useState<any[]>([]);
  const [setLogs, setSetLogs] = useState<
    Record<string, { reps: string; weight: string; logged: boolean }[]>
  >({});
  const [workoutCompleted, setWorkoutCompleted] = useState(false);

  useEffect(() => {
    if (!workoutId) return;
    async function loadPlanExercises() {
      const { data: workout } = await supabase
        .from("workouts")
        .select("training_plan_id")
        .eq("id", workoutId)
        .single();
      if (!workout?.training_plan_id) return;

      const { data: planExs } = await supabase
        .from("plan_exercises")
        .select("*, exercises(name)")
        .eq("plan_id", workout.training_plan_id)
        .order("order_index");

      if (planExs) {
        const formatted = planExs.map((pe) => ({
          id: pe.id,
          name: pe.exercises?.name || "Unbekannte Übung",
          sets: pe.sets || 3,
          reps: pe.reps || "10",
          weight: pe.weight_kg || 0,
        }));
        setPlanExercises(formatted);
        const initialLogs: Record<
          string,
          { reps: string; weight: string; logged: boolean }[]
        > = {};
        formatted.forEach((ex) => {
          initialLogs[ex.id] = Array(ex.sets)
            .fill(null)
            .map(() => ({
              reps: ex.reps.toString(),
              weight: ex.weight.toString(),
              logged: false,
            }));
        });
        setSetLogs(initialLogs);
      }
    }
    loadPlanExercises();
  }, [workoutId]);

  async function submitScores() {
    if (!workoutId) return;
    const scoresWithNotes = { ...scores, notes };
    const { error } = await supabase
      .from("workouts")
      .update({ assessment_scores: scoresWithNotes })
      .eq("id", workoutId);
    if (!error) {
      setSubmitted(true);
      if (onComplete) onComplete();
    }
  }

  async function logSet(exerciseId: string, exerciseName: string, setIndex: number) {
    if (!workoutId) return;
    const setData = setLogs[exerciseId]?.[setIndex];
    if (!setData) return;

    const { data: existing } = await supabase
      .from("set_logs")
      .select("id")
      .eq("workout_id", workoutId)
      .eq("exercise_name", exerciseName)
      .eq("set_number", setIndex + 1)
      .maybeSingle();

    const payload = {
      workout_id: workoutId,
      exercise_name: exerciseName,
      set_number: setIndex + 1,
      reps_done: Number(setData.reps) || 0,
      weight_kg: Number(setData.weight) || 0,
    };

    if (existing) {
      await supabase.from("set_logs").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("set_logs").insert(payload);
    }

    setSetLogs((prev) => {
      const updated = [...(prev[exerciseId] || [])];
      updated[setIndex] = { ...updated[setIndex], logged: true };
      return { ...prev, [exerciseId]: updated };
    });
  }

  async function completeWorkout() {
    if (!workoutId) return;
    await supabase
      .from("workouts")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", workoutId);
    setWorkoutCompleted(true);
    if (onComplete) onComplete();
  }

  return (
    <div className="space-y-4">
      <PreparationBanner clientId={clientId} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="guide">📋 Assessment</TabsTrigger>
          <TabsTrigger value="workout">💪 Workout</TabsTrigger>
        </TabsList>

        <TabsContent value="guide" className="space-y-4">
          <WarmUpBlock />

          <div className="text-sm text-muted-foreground">
            Bewerte jede Übung und trage die Messwerte ein.
          </div>

          {ASSESSMENT_EXERCISES.map((ex) => (
            <Card key={ex.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{ex.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  {ex.cues.map((cue, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground mt-0.5">•</span>
                      <span>{cue}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {ex.measureHint}
                  </Label>
                  <Input
                    className="mt-1"
                    placeholder="Messwert eintragen..."
                    value={scores[ex.id] || ""}
                    onChange={(e) =>
                      setScores((prev) => ({ ...prev, [ex.id]: e.target.value }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          <div>
            <Label>Notizen</Label>
            <Textarea
              placeholder="Allgemeine Beobachtungen, Auffälligkeiten..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {!submitted ? (
            <Button onClick={submitScores} className="w-full">
              ✓ Assessment speichern
            </Button>
          ) : (
            <div className="text-center text-green-600 font-medium">
              ✓ Assessment gespeichert
            </div>
          )}
        </TabsContent>

        <TabsContent value="workout" className="space-y-4">
          {!workoutId ? (
            <div className="text-sm text-muted-foreground">
              Kein Workout verknüpft.
            </div>
          ) : (
            <>
              {planExercises.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Keine Plan-Übungen gefunden.
                </div>
              ) : (
                <div className="space-y-4">
                  {planExercises.map((ex) => (
                    <Card key={ex.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{ex.name}</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {ex.sets} Sätze × {ex.reps} Wdh.
                          {ex.weight > 0 && ` @ ${ex.weight} kg`}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {(setLogs[ex.id] || []).map((set, setIndex) => (
                            <div
                              key={setIndex}
                              className={`flex items-center gap-2 ${
                                set.logged ? "opacity-50" : ""
                              }`}
                            >
                              <span className="text-sm w-12 text-muted-foreground">
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
                                onClick={() => logSet(ex.id, ex.name, setIndex)}
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
