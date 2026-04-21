/**
 * components/assessment/CaliperInput.tsx
 * 
 * Caliper-Messungen Komponente mit 3/7-Falten Toggle
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { CaliperMethod, CaliperMeasurements } from '@/types/assessment';
import { CALIPER_SITES } from '@/types/assessment';

interface CaliperInputProps {
  method: CaliperMethod;
  onMethodChange: (method: CaliperMethod) => void;
  values: CaliperMeasurements;
  onChange: (field: string, value: number | undefined) => void;
}

export default function CaliperInput({
  method,
  onMethodChange,
  values,
  onChange,
}: CaliperInputProps) {
  
  const sites = CALIPER_SITES[method];

  return (
    <div className="space-y-6">
      
      {/* Methode wählen */}
      <div className="space-y-3">
        <Label>Methode</Label>
        <RadioGroup value={method} onValueChange={(v) => onMethodChange(v as CaliperMethod)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="3fold" id="3fold" />
            <Label htmlFor="3fold" className="font-normal cursor-pointer">
              3-Falten (Standard) - Schnell, praktikabel
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="7fold" id="7fold" />
            <Label htmlFor="7fold" className="font-normal cursor-pointer">
              7-Falten (Erweitert) - Präziser, dauert länger
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Info-Box */}
      <Alert>
        <Info className="w-4 h-4" />
        <AlertDescription className="text-xs">
          <strong>Tipps:</strong> Immer 3x messen und Durchschnitt nehmen. Morgens nüchtern für beste Konsistenz. 
          Hautfalte leicht anheben, nicht zu fest drücken.
        </AlertDescription>
      </Alert>

      {/* Messungen */}
      <div className="space-y-4">
        {sites.map(site => {
          const fieldName = `caliper_${site.id}_mm` as keyof CaliperMeasurements;
          const value = values[fieldName];

          return (
            <div key={site.id} className="space-y-2">
              <Label htmlFor={site.id}>
                {site.label} (mm)
                {method === '7fold' && !['triceps', 'suprailiac', 'thigh'].includes(site.id) && (
                  <span className="ml-2 text-xs text-muted-foreground">(7-Falten)</span>
                )}
              </Label>
              <Input
                id={site.id}
                type="number"
                step="0.1"
                min="2"
                max="50"
                value={value || ''}
                onChange={e => onChange(fieldName, e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder={site.description}
              />
              <p className="text-xs text-muted-foreground">{site.description}</p>
            </div>
          );
        })}
      </div>

      {/* Validierungs-Hinweis */}
      {method === '3fold' && (
        <>
          {values.triceps_mm && values.suprailiac_mm && values.thigh_mm ? (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-sm text-green-800">
                ✓ Alle 3 Falten erfasst - Körperfett kann berechnet werden
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="default">
              <AlertDescription className="text-xs">
                Erfasse alle 3 Hautfalten für automatische Körperfett-Berechnung
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {method === '7fold' && (
        <>
          {values.triceps_mm && 
           values.suprailiac_mm && 
           values.thigh_mm && 
           values.chest_mm && 
           values.midaxillary_mm && 
           values.subscapular_mm && 
           values.abdominal_mm ? (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-sm text-green-800">
                ✓ Alle 7 Falten erfasst - Präzise Körperfett-Berechnung aktiv
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="default">
              <AlertDescription className="text-xs">
                Erfasse alle 7 Hautfalten für präzise Körperfett-Berechnung
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
