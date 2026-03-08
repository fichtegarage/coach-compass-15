import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Camera, X, ZoomIn, Columns2, Check, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

interface ProgressPhoto {
  id: string;
  photo_url: string;
  taken_at: string;
  note: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
}

const ProgressPhotos: React.FC<Props> = ({ clientId }) => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().slice(0, 10));
  const [uploadNote, setUploadNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<ProgressPhoto | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareViewOpen, setCompareViewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPhotos();
  }, [clientId]);

  const loadPhotos = async () => {
    const { data } = await supabase
      .from('progress_photos')
      .select('*')
      .eq('client_id', clientId)
      .order('taken_at', { ascending: true });
    setPhotos((data as any[]) || []);
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadDialogOpen(true);
  };

  const upload = async () => {
    if (!user || !selectedFile) return;
    setUploading(true);

    const ext = selectedFile.name.split('.').pop();
    const path = `${user.id}/${clientId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('progress-photos')
      .upload(path, selectedFile);

    if (uploadErr) {
      toast.error('Upload fehlgeschlagen');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('progress-photos')
      .getPublicUrl(path);

    await supabase.from('progress_photos').insert({
      client_id: clientId,
      user_id: user.id,
      photo_url: urlData.publicUrl,
      taken_at: uploadDate,
      note: uploadNote || null,
    } as any);

    toast.success('Foto hochgeladen');
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadNote('');
    setUploading(false);
    loadPhotos();
  };

  const deletePhoto = async (photo: ProgressPhoto) => {
    if (!window.confirm('Foto wirklich löschen?')) return;
    // Extract storage path from URL
    const urlParts = photo.photo_url.split('/progress-photos/');
    if (urlParts[1]) {
      await supabase.storage.from('progress-photos').remove([urlParts[1]]);
    }
    await supabase.from('progress_photos').delete().eq('id', photo.id);
    toast.success('Foto gelöscht');
    setLightboxPhoto(null);
    loadPhotos();
  };

  const toggleCompareSelect = (id: string) => {
    setCompareSelection(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const comparePhotos = photos.filter(p => compareSelection.includes(p.id));

  // Find the most recent photo
  const latestPhotoId = photos.length > 0 ? photos[photos.length - 1].id : null;

  if (loading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Fortschrittsfotos</h3>
        <div className="flex items-center gap-2">
          {photos.length >= 2 && (
            <Button
              size="sm"
              variant={compareMode ? 'default' : 'outline'}
              className="gap-2"
              onClick={() => {
                setCompareMode(!compareMode);
                setCompareSelection([]);
              }}
            >
              <Columns2 className="w-4 h-4" />
              {compareMode ? 'Abbrechen' : 'Vergleichen'}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="w-4 h-4" /> Foto hinzufügen
          </Button>
        </div>
      </div>

      {/* Compare mode action bar */}
      {compareMode && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-sm text-foreground">
            {compareSelection.length} von {photos.length} ausgewählt
          </span>
          {compareSelection.length >= 2 && (
            <Button
              size="sm"
              className="ml-auto gap-2"
              onClick={() => setCompareViewOpen(true)}
            >
              <Columns2 className="w-4 h-4" /> Vergleichen ({compareSelection.length})
            </Button>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Noch keine Fortschrittsfotos</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="w-4 h-4" /> Erstes Foto hochladen
          </Button>
        </div>
      ) : (
        <div className="relative group">
          {/* Scroll arrows */}
          {photos.length > 3 && (
            <>
              <button
                onClick={() => scroll('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Horizontal timeline */}
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory scrollbar-thin"
            style={{ scrollbarWidth: 'thin' }}
          >
            {photos.map(p => {
              const isLatest = p.id === latestPhotoId;
              const isSelected = compareSelection.includes(p.id);
              return (
                <div
                  key={p.id}
                  className="snap-start shrink-0 flex flex-col items-center"
                  style={{ width: '140px' }}
                >
                  {/* Timeline dot + line */}
                  <div className="flex items-center w-full mb-2">
                    <div className="flex-1 h-px bg-border" />
                    <div
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        isLatest
                          ? 'bg-primary ring-2 ring-primary/30'
                          : 'bg-muted-foreground/40'
                      }`}
                    />
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Photo card */}
                  <button
                    className={`relative w-[130px] h-[130px] rounded-xl overflow-hidden border-2 transition-all ${
                      isLatest
                        ? 'border-primary shadow-[0_0_12px_hsl(84_81%_44%/0.2)]'
                        : isSelected
                          ? 'border-primary'
                          : 'border-border hover:border-muted-foreground'
                    }`}
                    onClick={() => {
                      if (compareMode) {
                        toggleCompareSelect(p.id);
                      } else {
                        setLightboxPhoto(p);
                      }
                    }}
                  >
                    <img
                      src={p.photo_url}
                      alt={`Foto vom ${p.taken_at}`}
                      className="w-full h-full object-cover"
                    />
                    {isLatest && (
                      <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0">
                        Aktuell
                      </Badge>
                    )}
                    {compareMode && isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="w-6 h-6 text-primary" />
                      </div>
                    )}
                  </button>

                  {/* Date label */}
                  <p className={`text-xs mt-1.5 ${isLatest ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                    {format(new Date(p.taken_at), 'd. MMM yy', { locale: de })}
                  </p>
                  {p.note && (
                    <p className="text-[10px] text-muted-foreground truncate w-full text-center">{p.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={open => { if (!open) { setUploadDialogOpen(false); setSelectedFile(null); setPreviewUrl(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Fortschrittsfoto hochladen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewUrl && (
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-muted">
                <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notiz (optional)</Label>
              <Input value={uploadNote} onChange={e => setUploadNote(e.target.value)} placeholder="z.B. Front, Seite, Rücken..." />
            </div>
            <Button onClick={upload} disabled={uploading} className="w-full">
              {uploading ? 'Wird hochgeladen...' : 'Foto speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={open => { if (!open) setLightboxPhoto(null); }}>
        <DialogContent className="max-w-2xl">
          {lightboxPhoto && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">
                  {format(new Date(lightboxPhoto.taken_at), 'd. MMMM yyyy', { locale: de })}
                  {lightboxPhoto.note && <span className="text-muted-foreground font-normal"> · {lightboxPhoto.note}</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="w-full rounded-xl overflow-hidden bg-muted">
                <img
                  src={lightboxPhoto.photo_url}
                  alt="Fortschrittsfoto"
                  className="w-full h-auto max-h-[70vh] object-contain"
                />
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={() => deletePhoto(lightboxPhoto)}
              >
                <Trash2 className="w-4 h-4" /> Foto löschen
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare View */}
      <Dialog open={compareViewOpen} onOpenChange={open => { if (!open) setCompareViewOpen(false); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="font-display">Vergleich ({comparePhotos.length} Fotos)</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {comparePhotos.map(p => (
              <div key={p.id} className="shrink-0 flex flex-col items-center" style={{ minWidth: '200px', flex: 1 }}>
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-muted border border-border">
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium mt-2">
                  {format(new Date(p.taken_at), 'd. MMM yyyy', { locale: de })}
                </p>
                {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProgressPhotos;
