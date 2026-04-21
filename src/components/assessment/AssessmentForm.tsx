/**
 * components/assessment/AssessmentForm.tsx
 * 
 * Hauptformular für Assessment-Erfassung
 * 3 Abschnitte: Basis, Umfänge, Caliper (optional)
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, ChevronUp, Camera } from 'lucide-react';
import { createAssessment, uploadAssessmentPhoto } from '@/lib/assessment/api';
import { calculateBodyFat, calculateAge } from '@/lib/assessment/calculations';
import type { AssessmentFormData } from '@/types/assessment';
import CaliperInput from './CaliperInput';

interface AssessmentFormProps {
  clientId: string;
  clientGender: 'male' | 'female' | 'other';
  clientDateOfBirth: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function AssessmentForm({
  clientId,
  clientGender,
  clientDateOfBirth,
  onSuccess,
  onCancel,
}: AssessmentFormProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [showCaliper, setShowCaliper] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  
  const [formData, setFormData] = useState<AssessmentFormData>({
    weight_kg: undefined,
    height_cm: undefined,
    body_fat_percent: undefined,
    chest_cm: undefined,
    waist_cm: undefined,
    hip_cm: undefined,
    arm_cm: undefined,
    thigh_cm: undefined,
    caliper_method: '3fold',
    caliper_triceps_mm: undefined,
    caliper_suprailiac_mm: undefined,
    caliper_thigh_mm: undefined,
    caliper_chest_mm: undefined,
    caliper_midaxillary_mm: undefined,
    caliper_subscapular_mm: undefined,
    caliper_abdominal_mm: undefined,
    notes: undefined,
  });

  // Auto-Berechnung Körperfett aus Caliper
  const [calculatedBF, setCalculatedBF] = useState<number | null>(null);

  useEffect(() => {
    if (
      formData.caliper_triceps_mm &&
      formData.caliper_suprailiac_mm &&
      formData.caliper_thigh_mm &&
      clientDateOfBirth
    ) {
      const age = calculateAge(clientDateOfBirth);
      const bf = calculateBodyFat(clientGender, age, {
        triceps_mm: formData.caliper_triceps_mm,
        suprailiac_mm: formData.caliper_suprailiac_mm,
        thigh_mm: formData.caliper_thigh_mm,
        chest_mm: formData.caliper_chest_mm,
        midaxillary_mm: formData.caliper_midaxillary_mm,
        subscapular_mm: formData.caliper_subscapular_mm,
        abdominal_mm: formData.caliper_abdominal_mm,
      });
      setCalculatedBF(bf);
    } else {
      setCalculatedBF(null);
    }
  }, [
    formData.caliper_triceps_mm,
    formData.caliper_suprailiac_mm,
    formData.caliper_thigh_mm,
    formData.caliper_chest_mm,
    formData.caliper_midaxillary_mm,
    formData.caliper_subscapular_mm,
    formData.caliper_abdominal_mm,
    clientGender,
    clientDateOfBirth,
  ]);

  const updateField = (field: keyof AssessmentFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (files.length + selectedPhotos.length > 4) {
        toast({
          title: 'Zu viele Fotos',
          description: 'Maximal 4 Fotos pro Assessment',
          variant: 'destructive',
        });
        return;
      }
      setSelectedPhotos(prev => [...prev, ...files]);
    }
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // 1. Assessment speichern
      const assessment = await createAssessment({
        client_id: clientId,
        weight_kg: formData.weight_kg,
        height_cm: formData.height_cm,
        body_fat_percent: calculatedBF || formData.body_fat_percent,
        chest_cm: formData.chest_cm,
        waist_cm: formData.waist_cm,
        hip_cm: formData.hip_cm,
        arm_cm: formData.arm_cm,
        thigh_cm: formData.thigh_cm,
        caliper_triceps_mm: formData.caliper_triceps_mm,
        caliper_suprailiac_mm: formData.caliper_suprailiac_mm,
        caliper_thigh_mm: formData.caliper_thigh_mm,
        caliper_chest_mm: formData.caliper_chest_mm,
        caliper_midaxillary_mm: formData.caliper_midaxillary_mm,
        caliper_subscapular_mm: formData.caliper_subscapular_mm,
        caliper_abdominal_mm: formData.caliper_abdominal_mm,
        notes: formData.notes,
      });

      // 2. Fotos hochladen (falls vorhanden)
      if (selectedPhotos.length > 0) {
        await Promise.all(
          selectedPhotos.map(photo =>
            uploadAssessmentPhoto(clientId, photo, assessment.recorded_at, 'coach')
          )
        );
      }

      toast({
        title: 'Assessment gespeichert',
        description: `${selectedPhotos.length > 0 ? `Mit ${selectedPhotos.length} Foto(s)` : ''}`,
      });

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      toast({
        title: 'Fehler',
        description: 'Assessment konnte nicht gespeichert werden',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ABSCHNITT 1: BASIS-METRIKEN */}
      {/* ══════════════════════════════════════════════════════════════ */}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basis-Metriken</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Gewicht (kg)</Label>
              <Input
                type="number"
                step="0.1"
                min="30"
                max="300"
                value={formData.weight_kg || ''}
                onChange={e => updateField('weight_kg', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="z.B. 75.5"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Größe (cm)</Label>
              <Input
                type="number"
                step="0.1"
                min="100"
                max="250"
                value={formData.height_cm || ''}
                onChange={e => updateField('height_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="z.B. 178"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Körperfett %</Label>
              <Input
                type="number"
                step="0.1"
                min="3"
                max="60"
                value={calculatedBF !== null ? calculatedBF : formData.body_fat_percent || ''}
                onChange={e => updateField('body_fat_percent', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="z.B. 15.3"
                disabled={calculatedBF !== null}
              />
              {calculatedBF !== null && (
                <p className="text-xs text-muted-foreground">
                  Automatisch berechnet aus Caliper-Messungen
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ABSCHNITT 2: UMFÄNGE */}
      {/* ══════════════════════════════════════════════════════════════ */}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Umfänge (cm)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Brust</Label>
              <Input
                type="number"
                step="0.1"
                min="10"
                max="200"
                value={formData.chest_cm || ''}
                onChange={e => updateField('chest_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="Auf Höhe Brustwarzen"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Taille</Label>
              <Input
                type="number"
                step="0.1"
                min="10"
                max="200"
                value={formData.waist_cm || ''}
                onChange={e => updateField('waist_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="Schmalste Stelle"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Hüfte</Label>
              <Input
                type="number"
                step="0.1"
                min="10"
                max="200"
                value={formData.hip_cm || ''}
                onChange={e => updateField('hip_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="Breiteste Stelle"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Oberarm</Label>
              <Input
                type="number"
                step="0.1"
                min="10"
                max="200"
                value={formData.arm_cm || ''}
                onChange={e => updateField('arm_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="Dickste Stelle, entspannt"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Oberschenkel</Label>
              <Input
                type="number"
                step="0.1"
                min="10"
                max="200"
                value={formData.thigh_cm || ''}
                onChange={e => updateField('thigh_cm', e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="Dickste Stelle, stehend"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ABSCHNITT 3: CALIPER (Optional, Collapsible) */}
      {/* ══════════════════════════════════════════════════════════════ */}
      
      <Card>
        <CardHeader>
          <button
            type="button"
            onClick={() => setShowCaliper(!showCaliper)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-base">Caliper-Messung (optional)</CardTitle>
            {showCaliper ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </CardHeader>
        
        {showCaliper && (
          <CardContent>
            <CaliperInput
              method={formData.caliper_method || '3fold'}
              onMethodChange={method => updateField('caliper_method', method)}
              values={{
                triceps_mm: formData.caliper_triceps_mm,
                suprailiac_mm: formData.caliper_suprailiac_mm,
                thigh_mm: formData.caliper_thigh_mm,
                chest_mm: formData.caliper_chest_mm,
                midaxillary_mm: formData.caliper_midaxillary_mm,
                subscapular_mm: formData.caliper_subscapular_mm,
                abdominal_mm: formData.caliper_abdominal_mm,
              }}
              onChange={(field, value) => updateField(field as keyof AssessmentFormData, value)}
            />
            
            {calculatedBF !== null && (
              <Alert className="mt-4">
                <AlertDescription>
                  <strong>Berechneter Körperfettanteil: {calculatedBF}%</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    Basierend auf {formData.caliper_method === '3fold' ? '3-Falten' : '7-Falten'} Jackson-Pollock Formel
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        )}
      </Card>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ABSCHNITT 4: FOTOS */}
      {/* ══════════════════════════════════════════════════════════════ */}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress-Fotos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="photo-upload">Fotos hinzufügen (max. 4)</Label>
            <Input
              id="photo-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              disabled={selectedPhotos.length >= 4}
            />
            <p className="text-xs text-muted-foreground">
              Empfohlen: Front, Seite, Rücken (gleiche Pose & Beleuchtung)
            </p>
          </div>
          
          {selectedPhotos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {selectedPhotos.map((photo, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={URL.createObjectURL(photo)}
                    alt={`Preview ${idx + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* NOTIZEN */}
      {/* ══════════════════════════════════════════════════════════════ */}
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notizen</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.notes || ''}
            onChange={e => updateField('notes', e.target.value)}
            placeholder="Beobachtungen, Besonderheiten, nächste Schritte..."
            rows={4}
          />
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ACTIONS */}
      {/* ══════════════════════════════════════════════════════════════ */}
      
      <div className="flex gap-3 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Abbrechen
          </Button>
        )}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Speichert...' : 'Assessment speichern'}
        </Button>
      </div>
    </form>
  );
}
