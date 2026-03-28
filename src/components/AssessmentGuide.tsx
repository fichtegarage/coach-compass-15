/**
 * AssessmentGuide.tsx
 *
 * Coach-seitige Komponente für das Erstgespräch-Assessment (Session 1).
 * Wird in der ClientDetail-Seite eingebunden wenn ein Assessment-Workout ausgewählt wird.
 *
 * Enthält:
 * - Bewegungsqualität-Bewertung (Squat, Hinge, Push, Pull, Core)
 * - Tiefenfragen aus Erstgespräch-Kontext
 * - Identifizierte Stärken & Fokuspunkte
 * - Kontraindikationen
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2, Save, CheckCircle, ChevronDown, ChevronUp,
  Target, AlertTriangle, Lightbulb, Dumbbell, X
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssessmentGuideProps {
  workoutId: string;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onComplete: () => void;
}

interface MovementScore {
  score: number; // 1-5
  cues: string[];
  notes: string;
}

interface MovementAssessment {
  squat: MovementScore;
  hinge: MovementScore;
  push: MovementScore;
  pull: MovementScore;
  core: MovementScore;
  mobility: MovementScore;
}

interface DeepQuestions {
  motivation_detail: string;
  barriers: string;
  lifestyle_factors: string;
  recovery_capacity: string;
  training_preferences: string;
}

interface AssessmentData {
  movement_quality: MovementAssessment;
  deep_questions: DeepQuestions;
  coach_notes: string;
  identified_strengths: string[];
  focus_areas: string[];
  contraindications: string[];
}

// ── Movement Patterns Config ───────────────────────────────────────────────────

const MOVEMENT_PATTERNS = [
  {
    id: 'squat',
    name: 'Squat (Kniebeuge)',
    icon: '🦵',
    testExercises: ['Bodyweight Squat', 'Goblet Squat', 'Overhead Squat'],
    commonCues: [
      'Knie nach außen drücken',
      'Brust hoch',
      'Gewicht auf Fersen',
      'Tiefe verbessern',
      'Core-Stabilität',
      'Butt Wink korrigieren',
    ],
  },
  {
    id: 'hinge',
    name: 'Hinge (Hüftbeugung)',
    icon: '🏋️',
    testExercises: ['Romanian Deadlift', 'Good Morning', 'Kettlebell Swing'],
    commonCues: [
      'Hüfte nach hinten schieben',
      'Rücken gerade halten',
      'Hamstrings aktivieren',
      'Neutraler Nacken',
      'Stange nah am Körper',
    ],
  },
  {
    id: 'push',
    name: 'Push (Drücken)',
    icon: '💪',
    testExercises: ['Push-Up', 'Overhead Press', 'Bench Press'],
    commonCues: [
      'Schulterblätter zusammen',
      'Ellbogen-Winkel korrigieren',
      'Core anspannen',
      'Volle Range of Motion',
      'Handgelenk-Position',
    ],
  },
  {
    id: 'pull',
    name: 'Pull (Ziehen)',
    icon: '🔙',
    testExercises: ['Row', 'Pull-Up', 'Face Pull'],
    commonCues: [
      'Schulterblätter initiieren',
      'Ellbogen zum Körper',
      'Bizeps-Dominanz vermeiden',
      'Volle Streckung',
      'Lat-Aktivierung',
    ],
  },
  {
    id: 'core',
    name: 'Core (Rumpfstabilität)',
    icon: '🎯',
    testExercises: ['Plank', 'Dead Bug', 'Bird Dog', 'Pallof Press'],
    commonCues: [
      'Anti-Extension verbessern',
      'Anti-Rotation stärken',
      'Beckenboden aktivieren',
      'Atmung koordinieren',
      'Hüftstabilität',
    ],
  },
  {
    id: 'mobility',
    name: 'Mobilität',
    icon: '🧘',
    testExercises: ['Shoulder Mobility', 'Hip Mobility', 'Ankle Mobility', 'T-Spine Rotation'],
    commonCues: [
      'Hüftbeuger dehnen',
      'Schulter-Mobilität',
      'Sprunggelenk-Mobilität',
      'Thorakale Rotation',
      'Hüft-Innenrotation',
    ],
  },
];

const SCORE_LABELS = [
  { value: 1, label: 'Eingeschränkt', color: 'bg-red-500' },
  { value: 2, label: 'Verbesserungswürdig', color: 'bg-orange-500' },
  { value: 3, label: 'Durchschnitt', color: 'bg-yellow-500' },
  { value: 4, label: 'Gut', color: 'bg-lime-500' },
  { value: 5, label: 'Ausgezeichnet', color: 'bg-green-500' },
];

// ── Deep Questions Config ──────────────────────────────────────────────────────

const DEEP_QUESTIONS = [
  {
    id: 'motivation_detail',
    label: 'Motivation & Ziel-Detail',
    placeholder: 'Was genau will der Kunde erreichen? Warum jetzt? Welches Ereignis steht bevor?',
    prompts: [
      'Stell dir vor, du hast dein Ziel erreicht. Was ist der erste Unterschied, den du morgens bemerkst?',
      'Wer würde die Veränderung als erstes bemerken?',
      'Gibt es ein konkretes Ereignis, auf das du hinarbeitest?',
    ],
  },
  {
    id: 'barriers',
    label: 'Barrieren & Herausforderungen',
    placeholder: 'Was hat in der Vergangenheit nicht funktioniert? Was könnte diesmal schwierig werden?',
    prompts: [
      'Was hat dich bisher davon abgehalten, dein Ziel zu erreichen?',
      'Woran sind frühere Versuche gescheitert?',
      'Was ist deine größte Sorge bezüglich des Trainings?',
    ],
  },
  {
    id: 'lifestyle_factors',
    label: 'Lebensstil-Faktoren',
    placeholder: 'Schlaf, Stress, Beruf, Familie, Zeitfenster...',
    prompts: [
      'Wie sieht ein typischer Tag bei dir aus?',
      'Wie viel Schlaf bekommst du durchschnittlich?',
      'Wie würdest du dein Stresslevel einschätzen?',
    ],
  },
  {
    id: 'recovery_capacity',
    label: 'Regenerationsfähigkeit',
    placeholder: 'Wie schnell erholt sich der Kunde? Schlafqualität, Stresslevel...',
    prompts: [
      'Wie fühlst du dich normalerweise am Tag nach dem Training?',
      'Hast du Probleme mit dem Ein- oder Durchschlafen?',
      'Wie gehst du mit Stress um?',
    ],
  },
  {
    id: 'training_preferences',
    label: 'Trainings-Präferenzen',
    placeholder: 'Lieblingsübungen, Abneigungen, verfügbare Zeit, Equipment-Zugang...',
    prompts: [
      'Gibt es Übungen, die du besonders gerne machst?',
      'Gibt es etwas, das du auf keinen Fall machen möchtest?',
      'Wie viel Zeit kannst du realistisch pro Woche investieren?',
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

const AssessmentGuide: React.FC<AssessmentGuideProps> = ({
  workoutId,
  clientId,
  clientName,
  onClose,
  onComplete,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('movement');
  const [existingAssessment, setExistingAssessment] = useState<string | null>(null);

  // Assessment State
  const [movementScores, setMovementScores] = useState<MovementAssessment>({
    squat: { score: 3, cues: [], notes: '' },
    hinge: { score: 3, cues: [], notes: '' },
    push: { score: 3, cues: [], notes: '' },
    pull: { score: 3, cues: [], notes: '' },
    core: { score: 3, cues: [], notes: '' },
    mobility: { score: 3, cues: [], notes: '' },
  });

  const [deepQuestions, setDeepQuestions] = useState<DeepQuestions>({
    motivation_detail: '',
    barriers: '',
    lifestyle_factors: '',
    recovery_capacity: '',
    training_preferences: '',
  });

  const [coachNotes, setCoachNotes] = useState('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [newStrength, setNewStrength] = useState('');
  const [newFocus, setNewFocus] = useState('');
  const [newContra, setNewContra] = useState('');

  // ── Load existing assessment ───────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('assessment_results')
        .select('*')
        .eq('workout_id', workoutId)
        .maybeSingle();

      if (data) {
        setExistingAssessment(data.id);
        if (data.movement_quality) {
          setMovementScores(data.movement_quality as MovementAssessment);
        }
        if (data.deep_questions) {
          setDeepQuestions(data.deep_questions as DeepQuestions);
        }
        setCoachNotes(data.coach_notes || '');
        setStrengths(data.identified_strengths || []);
        setFocusAreas(data.focus_areas || []);
        setContraindications(data.contraindications || []);
      }
      setLoading(false);
    };
    load();
  }, [workoutId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const updateMovementScore = (pattern: string, field: keyof MovementScore, value: any) => {
    setMovementScores(prev => ({
      ...prev,
      [pattern]: {
        ...prev[pattern as keyof MovementAssessment],
        [field]: value,
      },
    }));
  };

  const toggleCue = (pattern: string, cue: string) => {
    setMovementScores(prev => {
      const current = prev[pattern as keyof MovementAssessment];
      const newCues = current.cues.includes(cue)
        ? current.cues.filter(c => c !== cue)
        : [...current.cues, cue];
      return {
        ...prev,
        [pattern]: { ...current, cues: newCues },
      };
    });
  };

  const addItem = (type: 'strength' | 'focus' | 'contra') => {
    if (type === 'strength' && newStrength.trim()) {
      setStrengths(prev => [...prev, newStrength.trim()]);
      setNewStrength('');
    } else if (type === 'focus' && newFocus.trim()) {
      setFocusAreas(prev => [...prev, newFocus.trim()]);
      setNewFocus('');
    } else if (type === 'contra' && newContra.trim()) {
      setContraindications(prev => [...prev, newContra.trim()]);
      setNewContra('');
    }
  };

  const removeItem = (type: 'strength' | 'focus' | 'contra', index: number) => {
    if (type === 'strength') setStrengths(prev => prev.filter((_, i) => i !== index));
    else if (type === 'focus') setFocusAreas(prev => prev.filter((_, i) => i !== index));
    else if (type === 'contra') setContraindications(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (complete: boolean = false) => {
    setSaving(true);

    const assessmentData = {
      workout_id: workoutId,
      client_id: clientId,
      movement_quality: movementScores,
      deep_questions: deepQuestions,
      coach_notes: coachNotes,
      identified_strengths: strengths,
      focus_areas: focusAreas,
      contraindications: contraindications,
      completed_at: complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existingAssessment) {
      ({ error } = await supabase
        .from('assessment_results')
        .update(assessmentData)
        .eq('id', existingAssessment));
    } else {
      const { data, error: insertError } = await supabase
        .from('assessment_results')
        .insert(assessmentData)
        .select()
        .single();
      error = insertError;
      if (data) setExistingAssessment(data.id);
    }

    // Mark workout as assessment if not already
    await supabase
      .from('plan_workouts')
      .update({ is_assessment: true, status: complete ? 'completed' : 'in_progress' })
      .eq('id', workoutId);

    setSaving(false);

    if (error) {
      toast.error('Fehler beim Speichern');
    } else if (complete) {
      toast.success('Assessment abgeschlossen!');
      onComplete();
    } else {
      toast.success('Zwischenstand gespeichert');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Assessment</p>
          <p className="text-lg font-bold">{clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="ml-1.5">Speichern</span>
          </Button>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Bewegungsqualität ── */}
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpandedSection(s => s === 'movement' ? null : 'movement')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Dumbbell className="w-5 h-5 text-primary" />
                Bewegungsqualität
              </CardTitle>
              {expandedSection === 'movement' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </CardHeader>
          {expandedSection === 'movement' && (
            <CardContent className="space-y-6">
              {MOVEMENT_PATTERNS.map(pattern => {
                const score = movementScores[pattern.id as keyof MovementAssessment];
                return (
                  <div key={pattern.id} className="space-y-3 pb-4 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{pattern.icon}</span>
                      <p className="font-semibold">{pattern.name}</p>
                    </div>

                    {/* Score Buttons */}
                    <div className="flex gap-1">
                      {SCORE_LABELS.map(({ value, label, color }) => (
                        <button
                          key={value}
                          onClick={() => updateMovementScore(pattern.id, 'score', value)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                            score.score === value
                              ? `${color} text-white`
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {SCORE_LABELS.find(s => s.value === score.score)?.label}
                    </p>

                    {/* Cues */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Coaching Cues (anklicken zum Auswählen)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {pattern.commonCues.map(cue => (
                          <button
                            key={cue}
                            onClick={() => toggleCue(pattern.id, cue)}
                            className={`px-2 py-1 rounded-full text-xs transition-colors ${
                              score.cues.includes(cue)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {cue}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <Textarea
                      placeholder="Notizen zu diesem Bewegungsmuster..."
                      value={score.notes}
                      onChange={e => updateMovementScore(pattern.id, 'notes', e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>

        {/* ── Tiefenfragen ── */}
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpandedSection(s => s === 'questions' ? null : 'questions')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="w-5 h-5 text-primary" />
                Tiefenfragen
              </CardTitle>
              {expandedSection === 'questions' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </CardHeader>
          {expandedSection === 'questions' && (
            <CardContent className="space-y-4">
              {DEEP_QUESTIONS.map(q => (
                <div key={q.id} className="space-y-2">
                  <label className="text-sm font-medium">{q.label}</label>
                  <div className="text-xs text-muted-foreground mb-1 space-y-0.5">
                    {q.prompts.map((p, i) => (
                      <p key={i}>💬 „{p}"</p>
                    ))}
                  </div>
                  <Textarea
                    placeholder={q.placeholder}
                    value={deepQuestions[q.id as keyof DeepQuestions]}
                    onChange={e => setDeepQuestions(prev => ({ ...prev, [q.id]: e.target.value }))}
                    rows={3}
                  />
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        {/* ── Stärken & Fokuspunkte ── */}
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpandedSection(s => s === 'strengths' ? null : 'strengths')}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-5 h-5 text-primary" />
                Stärken & Fokuspunkte
              </CardTitle>
              {expandedSection === 'strengths' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </CardHeader>
          {expandedSection === 'strengths' && (
            <CardContent className="space-y-4">
              {/* Stärken */}
              <div>
                <p className="text-sm font-medium text-green-600 mb-2">✅ Identifizierte Stärken</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {strengths.map((s, i) => (
                    <span key={i} className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs flex items-center gap-1">
                      {s}
                      <button onClick={() => removeItem('strength', i)} className="hover:text-green-600">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Neue Stärke hinzufügen..."
                    value={newStrength}
                    onChange={e => setNewStrength(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addItem('strength')}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={() => addItem('strength')}>+</Button>
                </div>
              </div>

              {/* Fokuspunkte */}
              <div>
                <p className="text-sm font-medium text-orange-600 mb-2">🎯 Fokuspunkte für den Plan</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {focusAreas.map((f, i) => (
                    <span key={i} className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs flex items-center gap-1">
                      {f}
                      <button onClick={() => removeItem('focus', i)} className="hover:text-orange-600">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Neuer Fokuspunkt..."
                    value={newFocus}
                    onChange={e => setNewFocus(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addItem('focus')}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={() => addItem('focus')}>+</Button>
                </div>
              </div>

              {/* Kontraindikationen */}
              <div>
                <p className="text-sm font-medium text-red-600 mb-2">⚠️ Kontraindikationen / Einschränkungen</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {contraindications.map((c, i) => (
                    <span key={i} className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs flex items-center gap-1">
                      {c}
                      <button onClick={() => removeItem('contra', i)} className="hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="z.B. Knie-Probleme, Bandscheibenvorfall..."
                    value={newContra}
                    onChange={e => setNewContra(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addItem('contra')}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={() => addItem('contra')}>+</Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ── Coach-Notizen ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📝 Zusätzliche Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Allgemeine Beobachtungen, Eindrücke, nächste Schritte..."
              value={coachNotes}
              onChange={e => setCoachNotes(e.target.value)}
              rows={4}
            />
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="bg-card border-t border-border px-4 py-3 flex gap-2 flex-shrink-0">
        <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Zwischenspeichern
        </Button>
        <Button onClick={() => handleSave(true)} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
          Assessment abschließen
        </Button>
      </div>
    </div>
  );
};

export default AssessmentGuide;
