/**
 * ExerciseImportDialog.tsx
 *
 * Bulk-Import von Übungen aus CSV-Dateien.
 * Header (Zeile 1) muss mind. enthalten:
 *   name_de, name, muscle_groups, movement_pattern
 * Optional: description_de, exercise_type, difficulty
 *
 * muscle_groups als Pipe-Liste, z.B. "chest|triceps|shoulders"
 */

import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, AlertCircle, CheckCircle2, FileWarning } from 'lucide-react';

// Erlaubte Werte (sync mit ExerciseLibrary.tsx Labels)
const ALLOWED_MUSCLES = ['chest','back','shoulders','biceps','triceps','forearms','quads','hamstrings','glutes','calves','core','abs','obliques','lower_back','traps','lats'];
const ALLOWED_PATTERNS = ['push_horizontal','push_vertical','pull_horizontal','pull_vertical','squat','hinge','lunge','carry','rotation','core','isolation'];
const ALLOWED_TYPES = ['compound','isolation','accessory','cardio','mobility'];
const REQUIRED_HEADERS = ['name_de','name','muscle_groups','movement_pattern'];

interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  status: 'new' | 'duplicate' | 'error';
  errors: string[];
  existingId?: string;
  overwrite: boolean;
}

const generateSlug = (text: string): string =>
  text.toLowerCase().trim()
    .replace(/[äöüß]/g, m => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' } as Record<string,string>)[m])
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// Native CSV-Parser mit Quote-Handling (RFC-4180-konform für unsere Zwecke)
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(f => f.length > 0)) rows.push(row);
        row = [];
      } else { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(f => f.length > 0)) rows.push(row);
  }
  return rows;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const ExerciseImportDialog: React.FC<Props> = ({ open, onClose, onImported }) => {
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = () => {
    setRows([]);
    setParseError(null);
    setParsing(false);
    setImporting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setParsing(true);
    setParseError(null);
    setRows([]);
    try {
      const text = await f.text();
      const csv = parseCsv(text);
      if (csv.length < 2) {
        setParseError('Datei enthält keine Daten-Zeilen.');
        setParsing(false);
        return;
      }
      const headers = csv[0].map(h => h.trim().toLowerCase());
      const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        setParseError(`Fehlende Pflicht-Spalten in der Header-Zeile: ${missing.join(', ')}`);
        setParsing(false);
        return;
      }

      // Duplikat-Check vorbereiten
      const { data: existing } = await supabase.from('exercises').select('id, name_de');
      const existingMap = new Map<string, string>();
      (existing || []).forEach((ex: { id: string; name_de: string }) => {
        existingMap.set(ex.name_de.trim().toLowerCase(), ex.id);
      });

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < csv.length; i++) {
        const cells = csv[i];
        const raw: Record<string, string> = {};
        headers.forEach((h, idx) => { raw[h] = (cells[idx] || '').trim(); });
        const errors: string[] = [];

        REQUIRED_HEADERS.forEach(h => {
          if (!raw[h]) errors.push(`Pflichtfeld "${h}" leer`);
        });

        const muscles = (raw['muscle_groups'] || '').split('|').map(m => m.trim()).filter(Boolean);
        const invalidMuscles = muscles.filter(m => !ALLOWED_MUSCLES.includes(m));
        if (raw['muscle_groups'] && muscles.length === 0) errors.push('muscle_groups konnte nicht geparst werden');
        if (invalidMuscles.length > 0) errors.push(`Unbekannte muscle_groups: ${invalidMuscles.join(', ')}`);

        if (raw['movement_pattern'] && !ALLOWED_PATTERNS.includes(raw['movement_pattern'])) {
          errors.push(`Unbekanntes movement_pattern: ${raw['movement_pattern']}`);
        }

        if (raw['exercise_type'] && !ALLOWED_TYPES.includes(raw['exercise_type'])) {
          errors.push(`Unbekannter exercise_type: ${raw['exercise_type']}`);
        }

        if (raw['difficulty']) {
          const d = parseInt(raw['difficulty'], 10);
          if (isNaN(d) || d < 1 || d > 5) errors.push(`difficulty muss 1-5 sein (war "${raw['difficulty']}")`);
        }

        const nameDeKey = (raw['name_de'] || '').toLowerCase();
        const existingId = existingMap.get(nameDeKey);

        let status: ParsedRow['status'];
        if (errors.length > 0) status = 'error';
        else if (existingId) status = 'duplicate';
        else status = 'new';

        parsed.push({ rowNumber: i + 1, raw, status, errors, existingId, overwrite: false });
      }
      setRows(parsed);
    } catch (err) {
      console.error(err);
      setParseError('Fehler beim Lesen/Parsen der Datei.');
    }
    setParsing(false);
  };

  const toggleOverwrite = (rowNumber: number) => {
    setRows(prev => prev.map(r => r.rowNumber === rowNumber ? { ...r, overwrite: !r.overwrite } : r));
  };

  const handleImport = async () => {
    setImporting(true);
    let success = 0;
    let fail = 0;
    for (const row of rows) {
      if (row.status === 'error') continue;
      if (row.status === 'duplicate' && !row.overwrite) continue;
      const r = row.raw;
      const muscles = (r['muscle_groups'] || '').split('|').map(m => m.trim()).filter(Boolean);
      const payload = {
        name: r['name'],
        name_de: r['name_de'],
        exercise_slug: generateSlug(r['name']),
        muscle_groups: muscles,
        movement_pattern: r['movement_pattern'],
        exercise_type: r['exercise_type'] || 'compound',
        difficulty: r['difficulty'] ? parseInt(r['difficulty'], 10) : 3,
        description_de: r['description_de'] || null,
        context: ['gym'],
        is_custom: true,
      };
      try {
        if (row.status === 'duplicate' && row.existingId) {
          const { error } = await supabase.from('exercises').update(payload).eq('id', row.existingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('exercises').insert(payload);
          if (error) throw error;
        }
        success++;
      } catch (err) {
        console.error(`Fehler in Zeile ${row.rowNumber}:`, err);
        fail++;
      }
    }
    setImporting(false);
    toast.success(`${success} importiert${fail > 0 ? `, ${fail} fehlgeschlagen` : ''}`);
    onImported();
    handleClose();
  };

  const newCount = rows.filter(r => r.status === 'new').length;
  const duplicateCount = rows.filter(r => r.status === 'duplicate').length;
  const errorCount = rows.filter(r => r.status === 'error').length;
  const willImport = newCount + rows.filter(r => r.status === 'duplicate' && r.overwrite).length;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Übungen importieren (CSV)
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 bg-muted/30 text-sm space-y-2">
              <p className="font-semibold">CSV-Format</p>
              <p className="text-muted-foreground">
                Erste Zeile = Header. Pflichtspalten:{' '}
                <code className="bg-muted px-1 rounded">name_de</code>,{' '}
                <code className="bg-muted px-1 rounded">name</code>,{' '}
                <code className="bg-muted px-1 rounded">muscle_groups</code>,{' '}
                <code className="bg-muted px-1 rounded">movement_pattern</code>.
                Optional:{' '}
                <code className="bg-muted px-1 rounded">description_de</code>,{' '}
                <code className="bg-muted px-1 rounded">exercise_type</code>,{' '}
                <code className="bg-muted px-1 rounded">difficulty</code>.
              </p>
              <p className="text-muted-foreground">
                <code className="bg-muted px-1 rounded">muscle_groups</code> als Pipe-Liste, z.B.{' '}
                <code className="bg-muted px-1 rounded">chest|triceps</code>
              </p>
            </div>
            <div>
              <Label>CSV-Datei auswählen</Label>
              <Input type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={parsing} />
            </div>
            {parsing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Datei wird geparst…
              </div>
            )}
            {parseError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="px-2 py-1 rounded bg-green-500/10 text-green-700 border border-green-500/30">🟢 Neu: {newCount}</span>
              <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-700 border border-amber-500/30">🟡 Duplikate: {duplicateCount}</span>
              <span className="px-2 py-1 rounded bg-red-500/10 text-red-700 border border-red-500/30">🔴 Fehler: {errorCount}</span>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Zeile</th>
                    <th className="px-3 py-2 text-left font-semibold">name_de</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-left font-semibold">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.rowNumber} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-3 py-2 font-medium">{r.raw['name_de'] || '–'}</td>
                      <td className="px-3 py-2">
                        {r.status === 'new' && (
                          <span className="text-green-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Neu
                          </span>
                        )}
                        {r.status === 'duplicate' && (
                          <span className="text-amber-700 flex items-center gap-1">
                            <FileWarning className="w-3.5 h-3.5" /> Existiert bereits
                          </span>
                        )}
                        {r.status === 'error' && (
                          <div className="text-red-700">
                            <span className="flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> Fehler
                            </span>
                            <span className="text-xs block">{r.errors.join('; ')}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === 'new' && <span className="text-xs text-muted-foreground">wird importiert</span>}
                        {r.status === 'duplicate' && (
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={r.overwrite}
                              onChange={() => toggleOverwrite(r.rowNumber)}
                            />
                            Überschreiben
                          </label>
                        )}
                        {r.status === 'error' && <span className="text-xs text-muted-foreground">übersprungen</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1" disabled={importing}>
                Abbrechen
              </Button>
              <Button onClick={handleImport} disabled={importing || willImport === 0} className="flex-1 gap-2">
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                {willImport} Übungen importieren
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExerciseImportDialog;
