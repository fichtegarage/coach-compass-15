import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera, Plus, Columns2, Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

interface ProgressPhoto {
  id: string;
  photo_url: string;
  taken_at: string;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
}

const ClientProgressPhotos: React.FC<Props> = ({ clientId }) => {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
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

  useEffect(() => { loadPhotos(); }, [clientId]);

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
    if (!selectedFile) return;
    setUploading(true);
    const ext = selectedFile.name.split('.').pop();
    const path = `client/${clientId}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('progress-photos')
      .upload(path, selectedFile);
    if (uploadErr) {
      toast.error('Upload fehlgeschlagen');
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(path);
    await supabase.from('progress_photos').insert({
      client_id: clientId,
      photo_url: urlData.publicUrl,
      taken_at: uploadDate,
      note: uploadNote || null,
      uploaded_by: 'client',
    } as any);
    toast.success('Foto hochgeladen');
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadNote('');
    setUploading(false);
    loadPhotos();
  };

  const toggleCompareSelect = (id: string) => {
    setCompareSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const comparePhotos = photos.filter(p => compareSelection.includes(p.id));
  const latestPhotoId = photos.length > 0 ? photos[photos.length - 1].id : null;

  if (loading) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Header – immer sichtbar */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Camera className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Fortschrittsfotos</p>
            <p className="text-xs text-slate-400">
              {photos.length === 0 ? 'Noch keine Fotos' : `${photos.length} Foto${photos.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-500" />
          : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {/* Inhalt – nur wenn expanded */}
      {expanded && (
        <div className="p-4 space-y-3">
          {/* Aktionsleiste */}
          <div className="flex items-center gap-2 flex-wrap">
            {photos.length >= 2 && (
              <Button
                size="sm"
                className={`gap-2 border ${compareMode ? 'bg-orange-600 border-orange-600 text-white' : 'bg-transparent border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'}`}
                onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
              >
                <Columns2 className="w-4 h-4" />
                {compareMode ? 'Abbrechen' : 'Vergleichen'}
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            <Button
              size="sm"
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white border-0 ml-auto"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4" /> Foto hinzufügen
            </Button>
          </div>

          {compareMode && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <span className="text-sm text-slate-300">{compareSelection.length} von {photos.length} ausgewählt</span>
              {compareSelection.length >= 2 && (
                <Button size="sm" className="ml-auto gap-2 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setCompareViewOpen(true)}>
                  <Columns2 className="w-4 h-4" /> Vergleichen ({compareSelection.length})
                </Button>
              )}
            </div>
          )}

          {photos.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-600 rounded-xl">
              <Camera className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Noch keine Fortschrittsfotos</p>
              <Button size="sm" variant="ghost" className="mt-2 gap-2 text-slate-400 hover:text-white" onClick={() => fileInputRef.current?.click()}>
                <Plus className="w-4 h-4" /> Erstes Foto hochladen
              </Button>
            </div>
          ) : (
            <div className="relative group">
              {photos.length > 3 && (
                <>
                  <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </>
              )}
              <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
                {photos.map(p => {
                  const isLatest = p.id === latestPhotoId;
                  const isSelected = compareSelection.includes(p.id);
                  return (
                    <div key={p.id} className="snap-start shrink-0 flex flex-col items-center" style={{ width: '140px' }}>
                      <div className="flex items-center w-full mb-2">
                        <div className="flex-1 h-px bg-slate-700" />
                        <div className={`w-3 h-3 rounded-full shrink-0 ${isLatest ? 'bg-orange-500 ring-2 ring-orange-500/30' : 'bg-slate-600'}`} />
                        <div className="flex-1 h-px bg-slate-700" />
                      </div>
                      <button
                        className={`relative w-[130px] h-[130px] rounded-xl overflow-hidden border-2 transition-all ${
                          isLatest ? 'border-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.2)]'
                            : isSelected ? 'border-orange-500'
                            : 'border-slate-700 hover:border-slate-500'
                        }`}
                        onClick={() => { if (compareMode) toggleCompareSelect(p.id); else setLightboxPhoto(p); }}
                      >
                        <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                        {isLatest && <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-orange-600 border-0">Aktuell</Badge>}
                        {p.uploaded_by === 'coach' && (
                          <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/60 text-slate-300 px-1 py-0.5 rounded">Coach</span>
                        )}
                        {compareMode && isSelected && (
                          <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                            <Check className="w-6 h-6 text-orange-400" />
                          </div>
                        )}
                      </button>
                      <p className={`text-xs mt-1.5 ${isLatest ? 'text-orange-400 font-semibold' : 'text-slate-500'}`}>
                        {format(new Date(p.taken_at), 'd. MMM yy', { locale: de })}
                      </p>
                      {p.note && <p className="text-[10px] text-slate-600 truncate w-full text-center">{p.note}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={open => { if (!open) { setUploadDialogOpen(false); setSelectedFile(null); setPreviewUrl(null); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Fortschrittsfoto hochladen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewUrl && (
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-700">
                <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-slate-300">Datum</Label>
              <Input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Notiz (optional)</Label>
              <Input value={uploadNote} onChange={e => setUploadNote(e.target.value)} placeholder="z.B. Front, Seite, Rücken..." className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" />
            </div>
            <Button onClick={upload} disabled={uploading} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {uploading ? 'Wird hochgeladen...' : 'Foto speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={open => { if (!open) setLightboxPhoto(null); }}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700">
          {lightboxPhoto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">
                  {format(new Date(lightboxPhoto.taken_at), 'd. MMMM yyyy', { locale: de })}
                  {lightboxPhoto.note && <span className="text-slate-400 font-normal"> · {lightboxPhoto.note}</span>}
                  {lightboxPhoto.uploaded_by === 'coach' && <span className="text-xs ml-2 text-slate-500">(Coach)</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="w-full rounded-xl overflow-hidden bg-slate-700">
                <img src={lightboxPhoto.photo_url} alt="" className="w-full h-auto max-h-[70vh] object-contain" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare View */}
      <Dialog open={compareViewOpen} onOpenChange={open => { if (!open) setCompareViewOpen(false); }}>
        <DialogContent className="max-w-5xl bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Vergleich ({comparePhotos.length} Fotos)</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {comparePhotos.map(p => (
              <div key={p.id} className="shrink-0 flex flex-col items-center" style={{ minWidth: '200px', flex: 1 }}>
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-700 border border-slate-600">
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium mt-2 text-white">{format(new Date(p.taken_at), 'd. MMM yyyy', { locale: de })}</p>
                {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientProgressPhotos;import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera, Plus, Columns2, Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

interface ProgressPhoto {
  id: string;
  photo_url: string;
  taken_at: string;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
}

const ClientProgressPhotos: React.FC<Props> = ({ clientId }) => {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
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

  useEffect(() => { loadPhotos(); }, [clientId]);

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
    if (!selectedFile) return;
    setUploading(true);
    const ext = selectedFile.name.split('.').pop();
    const path = `client/${clientId}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('progress-photos')
      .upload(path, selectedFile);
    if (uploadErr) {
      toast.error('Upload fehlgeschlagen');
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(path);
    await supabase.from('progress_photos').insert({
      client_id: clientId,
      photo_url: urlData.publicUrl,
      taken_at: uploadDate,
      note: uploadNote || null,
      uploaded_by: 'client',
    } as any);
    toast.success('Foto hochgeladen');
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadNote('');
    setUploading(false);
    loadPhotos();
  };

  const toggleCompareSelect = (id: string) => {
    setCompareSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const comparePhotos = photos.filter(p => compareSelection.includes(p.id));
  const latestPhotoId = photos.length > 0 ? photos[photos.length - 1].id : null;

  if (loading) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Header – immer sichtbar */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Camera className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Fortschrittsfotos</p>
            <p className="text-xs text-slate-400">
              {photos.length === 0 ? 'Noch keine Fotos' : `${photos.length} Foto${photos.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-500" />
          : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {/* Inhalt – nur wenn expanded */}
      {expanded && (
        <div className="p-4 space-y-3">
          {/* Aktionsleiste */}
          <div className="flex items-center gap-2 flex-wrap">
            {photos.length >= 2 && (
              <Button
                size="sm"
                className={`gap-2 border ${compareMode ? 'bg-orange-600 border-orange-600 text-white' : 'bg-transparent border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'}`}
                onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
              >
                <Columns2 className="w-4 h-4" />
                {compareMode ? 'Abbrechen' : 'Vergleichen'}
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            <Button
              size="sm"
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white border-0 ml-auto"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4" /> Foto hinzufügen
            </Button>
          </div>

          {compareMode && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <span className="text-sm text-slate-300">{compareSelection.length} von {photos.length} ausgewählt</span>
              {compareSelection.length >= 2 && (
                <Button size="sm" className="ml-auto gap-2 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setCompareViewOpen(true)}>
                  <Columns2 className="w-4 h-4" /> Vergleichen ({compareSelection.length})
                </Button>
              )}
            </div>
          )}

          {photos.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-600 rounded-xl">
              <Camera className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Noch keine Fortschrittsfotos</p>
              <Button size="sm" variant="ghost" className="mt-2 gap-2 text-slate-400 hover:text-white" onClick={() => fileInputRef.current?.click()}>
                <Plus className="w-4 h-4" /> Erstes Foto hochladen
              </Button>
            </div>
          ) : (
            <div className="relative group">
              {photos.length > 3 && (
                <>
                  <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </>
              )}
              <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
                {photos.map(p => {
                  const isLatest = p.id === latestPhotoId;
                  const isSelected = compareSelection.includes(p.id);
                  return (
                    <div key={p.id} className="snap-start shrink-0 flex flex-col items-center" style={{ width: '140px' }}>
                      <div className="flex items-center w-full mb-2">
                        <div className="flex-1 h-px bg-slate-700" />
                        <div className={`w-3 h-3 rounded-full shrink-0 ${isLatest ? 'bg-orange-500 ring-2 ring-orange-500/30' : 'bg-slate-600'}`} />
                        <div className="flex-1 h-px bg-slate-700" />
                      </div>
                      <button
                        className={`relative w-[130px] h-[130px] rounded-xl overflow-hidden border-2 transition-all ${
                          isLatest ? 'border-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.2)]'
                            : isSelected ? 'border-orange-500'
                            : 'border-slate-700 hover:border-slate-500'
                        }`}
                        onClick={() => { if (compareMode) toggleCompareSelect(p.id); else setLightboxPhoto(p); }}
                      >
                        <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                        {isLatest && <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-orange-600 border-0">Aktuell</Badge>}
                        {p.uploaded_by === 'coach' && (
                          <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/60 text-slate-300 px-1 py-0.5 rounded">Coach</span>
                        )}
                        {compareMode && isSelected && (
                          <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                            <Check className="w-6 h-6 text-orange-400" />
                          </div>
                        )}
                      </button>
                      <p className={`text-xs mt-1.5 ${isLatest ? 'text-orange-400 font-semibold' : 'text-slate-500'}`}>
                        {format(new Date(p.taken_at), 'd. MMM yy', { locale: de })}
                      </p>
                      {p.note && <p className="text-[10px] text-slate-600 truncate w-full text-center">{p.note}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={open => { if (!open) { setUploadDialogOpen(false); setSelectedFile(null); setPreviewUrl(null); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Fortschrittsfoto hochladen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewUrl && (
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-700">
                <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-slate-300">Datum</Label>
              <Input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Notiz (optional)</Label>
              <Input value={uploadNote} onChange={e => setUploadNote(e.target.value)} placeholder="z.B. Front, Seite, Rücken..." className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" />
            </div>
            <Button onClick={upload} disabled={uploading} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {uploading ? 'Wird hochgeladen...' : 'Foto speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={open => { if (!open) setLightboxPhoto(null); }}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700">
          {lightboxPhoto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">
                  {format(new Date(lightboxPhoto.taken_at), 'd. MMMM yyyy', { locale: de })}
                  {lightboxPhoto.note && <span className="text-slate-400 font-normal"> · {lightboxPhoto.note}</span>}
                  {lightboxPhoto.uploaded_by === 'coach' && <span className="text-xs ml-2 text-slate-500">(Coach)</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="w-full rounded-xl overflow-hidden bg-slate-700">
                <img src={lightboxPhoto.photo_url} alt="" className="w-full h-auto max-h-[70vh] object-contain" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare View */}
      <Dialog open={compareViewOpen} onOpenChange={open => { if (!open) setCompareViewOpen(false); }}>
        <DialogContent className="max-w-5xl bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Vergleich ({comparePhotos.length} Fotos)</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {comparePhotos.map(p => (
              <div key={p.id} className="shrink-0 flex flex-col items-center" style={{ minWidth: '200px', flex: 1 }}>
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-700 border border-slate-600">
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium mt-2 text-white">{format(new Date(p.taken_at), 'd. MMM yyyy', { locale: de })}</p>
                {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientProgressPhotos;  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareViewOpen, setCompareViewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadPhotos(); }, [clientId]);

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
    if (!selectedFile) return;
    setUploading(true);
    const ext = selectedFile.name.split('.').pop();
    const path = `client/${clientId}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('progress-photos')
      .upload(path, selectedFile);
    if (uploadErr) {
      toast.error('Upload fehlgeschlagen');
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(path);
    await supabase.from('progress_photos').insert({
      client_id: clientId,
      photo_url: urlData.publicUrl,
      taken_at: uploadDate,
      note: uploadNote || null,
      uploaded_by: 'client',
    } as any);
    toast.success('Foto hochgeladen');
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadNote('');
    setUploading(false);
    loadPhotos();
  };

  const toggleCompareSelect = (id: string) => {
    setCompareSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const comparePhotos = photos.filter(p => compareSelection.includes(p.id));
  const latestPhotoId = photos.length > 0 ? photos[photos.length - 1].id : null;

  if (loading) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Header – immer sichtbar */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Camera className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Fortschrittsfotos</p>
            <p className="text-xs text-slate-400">
              {photos.length === 0 ? 'Noch keine Fotos' : `${photos.length} Foto${photos.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-500" />
          : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {/* Inhalt – nur wenn expanded */}
      {expanded && (
        <div className="p-4 space-y-3">
          {/* Aktionsleiste */}
          <div className="flex items-center gap-2 flex-wrap">
            {photos.length >= 2 && (
              <Button
                size="sm"
                className={`gap-2 border ${compareMode ? 'bg-orange-600 border-orange-600 text-white' : 'bg-transparent border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'}`}
                onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
              >
                <Columns2 className="w-4 h-4" />
                {compareMode ? 'Abbrechen' : 'Vergleichen'}
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            <Button
              size="sm"
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white border-0 ml-auto"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4" /> Foto hinzufügen
            </Button>
          </div>

          {compareMode && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <span className="text-sm text-slate-300">{compareSelection.length} von {photos.length} ausgewählt</span>
              {compareSelection.length >= 2 && (
                <Button size="sm" className="ml-auto gap-2 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setCompareViewOpen(true)}>
                  <Columns2 className="w-4 h-4" /> Vergleichen ({compareSelection.length})
                </Button>
              )}
            </div>
          )}

          {photos.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-600 rounded-xl">
              <Camera className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Noch keine Fortschrittsfotos</p>
              <Button size="sm" variant="ghost" className="mt-2 gap-2 text-slate-400 hover:text-white" onClick={() => fileInputRef.current?.click()}>
                <Plus className="w-4 h-4" /> Erstes Foto hochladen
              </Button>
            </div>
          ) : (
            <div className="relative group">
              {photos.length > 3 && (
                <>
                  <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </>
              )}
              <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
                {photos.map(p => {
                  const isLatest = p.id === latestPhotoId;
                  const isSelected = compareSelection.includes(p.id);
                  return (
                    <div key={p.id} className="snap-start shrink-0 flex flex-col items-center" style={{ width: '140px' }}>
                      <div className="flex items-center w-full mb-2">
                        <div className="flex-1 h-px bg-slate-700" />
                        <div className={`w-3 h-3 rounded-full shrink-0 ${isLatest ? 'bg-orange-500 ring-2 ring-orange-500/30' : 'bg-slate-600'}`} />
                        <div className="flex-1 h-px bg-slate-700" />
                      </div>
                      <button
                        className={`relative w-[130px] h-[130px] rounded-xl overflow-hidden border-2 transition-all ${
                          isLatest ? 'border-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.2)]'
                            : isSelected ? 'border-orange-500'
                            : 'border-slate-700 hover:border-slate-500'
                        }`}
                        onClick={() => { if (compareMode) toggleCompareSelect(p.id); else setLightboxPhoto(p); }}
                      >
                        <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                        {isLatest && <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-orange-600 border-0">Aktuell</Badge>}
                        {p.uploaded_by === 'coach' && (
                          <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/60 text-slate-300 px-1 py-0.5 rounded">Coach</span>
                        )}
                        {compareMode && isSelected && (
                          <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                            <Check className="w-6 h-6 text-orange-400" />
                          </div>
                        )}
                      </button>
                      <p className={`text-xs mt-1.5 ${isLatest ? 'text-orange-400 font-semibold' : 'text-slate-500'}`}>
                        {format(new Date(p.taken_at), 'd. MMM yy', { locale: de })}
                      </p>
                      {p.note && <p className="text-[10px] text-slate-600 truncate w-full text-center">{p.note}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={open => { if (!open) { setUploadDialogOpen(false); setSelectedFile(null); setPreviewUrl(null); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Fortschrittsfoto hochladen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewUrl && (
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-700">
                <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-slate-300">Datum</Label>
              <Input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Notiz (optional)</Label>
              <Input value={uploadNote} onChange={e => setUploadNote(e.target.value)} placeholder="z.B. Front, Seite, Rücken..." className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" />
            </div>
            <Button onClick={upload} disabled={uploading} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {uploading ? 'Wird hochgeladen...' : 'Foto speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={open => { if (!open) setLightboxPhoto(null); }}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700">
          {lightboxPhoto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">
                  {format(new Date(lightboxPhoto.taken_at), 'd. MMMM yyyy', { locale: de })}
                  {lightboxPhoto.note && <span className="text-slate-400 font-normal"> · {lightboxPhoto.note}</span>}
                  {lightboxPhoto.uploaded_by === 'coach' && <span className="text-xs ml-2 text-slate-500">(Coach)</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="w-full rounded-xl overflow-hidden bg-slate-700">
                <img src={lightboxPhoto.photo_url} alt="" className="w-full h-auto max-h-[70vh] object-contain" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare View */}
      <Dialog open={compareViewOpen} onOpenChange={open => { if (!open) setCompareViewOpen(false); }}>
        <DialogContent className="max-w-5xl bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Vergleich ({comparePhotos.length} Fotos)</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {comparePhotos.map(p => (
              <div key={p.id} className="shrink-0 flex flex-col items-center" style={{ minWidth: '200px', flex: 1 }}>
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-700 border border-slate-600">
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium mt-2 text-white">{format(new Date(p.taken_at), 'd. MMM yyyy', { locale: de })}</p>
                {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientProgressPhotos;  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareViewOpen, setCompareViewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadPhotos(); }, [clientId]);

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
    if (!selectedFile) return;
    setUploading(true);
    const ext = selectedFile.name.split('.').pop();
    const path = `client/${clientId}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('progress-photos')
      .upload(path, selectedFile);
    if (uploadErr) {
      toast.error('Upload fehlgeschlagen');
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(path);
    await supabase.from('progress_photos').insert({
      client_id: clientId,
      photo_url: urlData.publicUrl,
      taken_at: uploadDate,
      note: uploadNote || null,
      uploaded_by: 'client',
    } as any);
    toast.success('Foto hochgeladen');
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadNote('');
    setUploading(false);
    loadPhotos();
  };

  const toggleCompareSelect = (id: string) => {
    setCompareSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const comparePhotos = photos.filter(p => compareSelection.includes(p.id));
  const latestPhotoId = photos.length > 0 ? photos[photos.length - 1].id : null;

  if (loading) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Header – immer sichtbar */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Camera className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Fortschrittsfotos</p>
            <p className="text-xs text-slate-400">
              {photos.length === 0 ? 'Noch keine Fotos' : `${photos.length} Foto${photos.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-500" />
          : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {/* Inhalt – nur wenn expanded */}
      {expanded && (
        <div className="p-4 space-y-3">
          {/* Aktionsleiste */}
          <div className="flex items-center gap-2 flex-wrap">
            {photos.length >= 2 && (
              <Button
                size="sm"
                className={`gap-2 border ${compareMode ? 'bg-orange-600 border-orange-600 text-white' : 'bg-transparent border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'}`}
                onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
              >
                <Columns2 className="w-4 h-4" />
                {compareMode ? 'Abbrechen' : 'Vergleichen'}
              </Button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            <Button
              size="sm"
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white border-0 ml-auto"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4" /> Foto hinzufügen
            </Button>
          </div>

          {compareMode && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <span className="text-sm text-slate-300">{compareSelection.length} von {photos.length} ausgewählt</span>
              {compareSelection.length >= 2 && (
                <Button size="sm" className="ml-auto gap-2 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setCompareViewOpen(true)}>
                  <Columns2 className="w-4 h-4" /> Vergleichen ({compareSelection.length})
                </Button>
              )}
            </div>
          )}

          {photos.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-600 rounded-xl">
              <Camera className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Noch keine Fortschrittsfotos</p>
              <Button size="sm" variant="ghost" className="mt-2 gap-2 text-slate-400 hover:text-white" onClick={() => fileInputRef.current?.click()}>
                <Plus className="w-4 h-4" /> Erstes Foto hochladen
              </Button>
            </div>
          ) : (
            <div className="relative group">
              {photos.length > 3 && (
                <>
                  <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </>
              )}
              <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
                {photos.map(p => {
                  const isLatest = p.id === latestPhotoId;
                  const isSelected = compareSelection.includes(p.id);
                  return (
                    <div key={p.id} className="snap-start shrink-0 flex flex-col items-center" style={{ width: '140px' }}>
                      <div className="flex items-center w-full mb-2">
                        <div className="flex-1 h-px bg-slate-700" />
                        <div className={`w-3 h-3 rounded-full shrink-0 ${isLatest ? 'bg-orange-500 ring-2 ring-orange-500/30' : 'bg-slate-600'}`} />
                        <div className="flex-1 h-px bg-slate-700" />
                      </div>
                      <button
                        className={`relative w-[130px] h-[130px] rounded-xl overflow-hidden border-2 transition-all ${
                          isLatest ? 'border-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.2)]'
                            : isSelected ? 'border-orange-500'
                            : 'border-slate-700 hover:border-slate-500'
                        }`}
                        onClick={() => { if (compareMode) toggleCompareSelect(p.id); else setLightboxPhoto(p); }}
                      >
                        <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                        {isLatest && <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-orange-600 border-0">Aktuell</Badge>}
                        {p.uploaded_by === 'coach' && (
                          <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/60 text-slate-300 px-1 py-0.5 rounded">Coach</span>
                        )}
                        {compareMode && isSelected && (
                          <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                            <Check className="w-6 h-6 text-orange-400" />
                          </div>
                        )}
                      </button>
                      <p className={`text-xs mt-1.5 ${isLatest ? 'text-orange-400 font-semibold' : 'text-slate-500'}`}>
                        {format(new Date(p.taken_at), 'd. MMM yy', { locale: de })}
                      </p>
                      {p.note && <p className="text-[10px] text-slate-600 truncate w-full text-center">{p.note}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={open => { if (!open) { setUploadDialogOpen(false); setSelectedFile(null); setPreviewUrl(null); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Fortschrittsfoto hochladen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewUrl && (
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-700">
                <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-slate-300">Datum</Label>
              <Input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Notiz (optional)</Label>
              <Input value={uploadNote} onChange={e => setUploadNote(e.target.value)} placeholder="z.B. Front, Seite, Rücken..." className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" />
            </div>
            <Button onClick={upload} disabled={uploading} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {uploading ? 'Wird hochgeladen...' : 'Foto speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={open => { if (!open) setLightboxPhoto(null); }}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700">
          {lightboxPhoto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">
                  {format(new Date(lightboxPhoto.taken_at), 'd. MMMM yyyy', { locale: de })}
                  {lightboxPhoto.note && <span className="text-slate-400 font-normal"> · {lightboxPhoto.note}</span>}
                  {lightboxPhoto.uploaded_by === 'coach' && <span className="text-xs ml-2 text-slate-500">(Coach)</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="w-full rounded-xl overflow-hidden bg-slate-700">
                <img src={lightboxPhoto.photo_url} alt="" className="w-full h-auto max-h-[70vh] object-contain" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare View */}
      <Dialog open={compareViewOpen} onOpenChange={open => { if (!open) setCompareViewOpen(false); }}>
        <DialogContent className="max-w-5xl bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Vergleich ({comparePhotos.length} Fotos)</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {comparePhotos.map(p => (
              <div key={p.id} className="shrink-0 flex flex-col items-center" style={{ minWidth: '200px', flex: 1 }}>
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-700 border border-slate-600">
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium mt-2 text-white">{format(new Date(p.taken_at), 'd. MMM yyyy', { locale: de })}</p>
                {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientProgressPhotos;  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareViewOpen, setCompareViewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadPhotos(); }, [clientId]);

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
    if (!selectedFile) return;
    setUploading(true);
    const ext = selectedFile.name.split('.').pop();
    const path = `client/${clientId}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('progress-photos')
      .upload(path, selectedFile);
    if (uploadErr) {
      toast.error('Upload fehlgeschlagen');
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(path);
    await supabase.from('progress_photos').insert({
      client_id: clientId,
      photo_url: urlData.publicUrl,
      taken_at: uploadDate,
      note: uploadNote || null,
      uploaded_by: 'client',
    } as any);
    toast.success('Foto hochgeladen');
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadNote('');
    setUploading(false);
    loadPhotos();
  };

  const toggleCompareSelect = (id: string) => {
    setCompareSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  const comparePhotos = photos.filter(p => compareSelection.includes(p.id));
  const latestPhotoId = photos.length > 0 ? photos[photos.length - 1].id : null;

  if (loading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Fortschrittsfotos</h3>
        <div className="flex items-center gap-2">
          {photos.length >= 2 && (
            <Button
              size="sm"
              className={`gap-2 border ${compareMode ? 'bg-orange-600 border-orange-600 text-white' : 'bg-transparent border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700'}`}
              onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
            >
              <Columns2 className="w-4 h-4" />
              {compareMode ? 'Abbrechen' : 'Vergleichen'}
            </Button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          <Button size="sm" className="gap-2 bg-orange-600 hover:bg-orange-700 text-white border-0" onClick={() => fileInputRef.current?.click()}>
            <Camera className="w-4 h-4" /> Foto hinzufügen
          </Button>
        </div>
      </div>

      {compareMode && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <span className="text-sm text-slate-300">{compareSelection.length} von {photos.length} ausgewählt</span>
          {compareSelection.length >= 2 && (
            <Button size="sm" className="ml-auto gap-2 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setCompareViewOpen(true)}>
              <Columns2 className="w-4 h-4" /> Vergleichen ({compareSelection.length})
            </Button>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-600 rounded-xl">
          <Camera className="w-10 h-10 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Noch keine Fortschrittsfotos</p>
          <Button size="sm" variant="ghost" className="mt-2 gap-2 text-slate-400 hover:text-white" onClick={() => fileInputRef.current?.click()}>
            <Plus className="w-4 h-4" /> Erstes Foto hochladen
          </Button>
        </div>
      ) : (
        <div className="relative group">
          {photos.length > 3 && (
            <>
              <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
            </>
          )}
          <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
            {photos.map(p => {
              const isLatest = p.id === latestPhotoId;
              const isSelected = compareSelection.includes(p.id);
              return (
                <div key={p.id} className="snap-start shrink-0 flex flex-col items-center" style={{ width: '140px' }}>
                  <div className="flex items-center w-full mb-2">
                    <div className="flex-1 h-px bg-slate-700" />
                    <div className={`w-3 h-3 rounded-full shrink-0 ${isLatest ? 'bg-orange-500 ring-2 ring-orange-500/30' : 'bg-slate-600'}`} />
                    <div className="flex-1 h-px bg-slate-700" />
                  </div>
                  <button
                    className={`relative w-[130px] h-[130px] rounded-xl overflow-hidden border-2 transition-all ${
                      isLatest ? 'border-orange-500 shadow-[0_0_12px_rgba(234,88,12,0.2)]'
                        : isSelected ? 'border-orange-500'
                        : 'border-slate-700 hover:border-slate-500'
                    }`}
                    onClick={() => { if (compareMode) toggleCompareSelect(p.id); else setLightboxPhoto(p); }}
                  >
                    <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                    {isLatest && <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-orange-600 border-0">Aktuell</Badge>}
                    {p.uploaded_by === 'coach' && (
                      <span className="absolute bottom-1.5 right-1.5 text-[9px] bg-black/60 text-slate-300 px-1 py-0.5 rounded">Coach</span>
                    )}
                    {compareMode && isSelected && (
                      <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                        <Check className="w-6 h-6 text-orange-400" />
                      </div>
                    )}
                  </button>
                  <p className={`text-xs mt-1.5 ${isLatest ? 'text-orange-400 font-semibold' : 'text-slate-500'}`}>
                    {format(new Date(p.taken_at), 'd. MMM yy', { locale: de })}
                  </p>
                  {p.note && <p className="text-[10px] text-slate-600 truncate w-full text-center">{p.note}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={open => { if (!open) { setUploadDialogOpen(false); setSelectedFile(null); setPreviewUrl(null); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Fortschrittsfoto hochladen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewUrl && (
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-700">
                <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-slate-300">Datum</Label>
              <Input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} className="bg-slate-700 border-slate-600 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Notiz (optional)</Label>
              <Input value={uploadNote} onChange={e => setUploadNote(e.target.value)} placeholder="z.B. Front, Seite, Rücken..." className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" />
            </div>
            <Button onClick={upload} disabled={uploading} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {uploading ? 'Wird hochgeladen...' : 'Foto speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={open => { if (!open) setLightboxPhoto(null); }}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700">
          {lightboxPhoto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">
                  {format(new Date(lightboxPhoto.taken_at), 'd. MMMM yyyy', { locale: de })}
                  {lightboxPhoto.note && <span className="text-slate-400 font-normal"> · {lightboxPhoto.note}</span>}
                  {lightboxPhoto.uploaded_by === 'coach' && <span className="text-xs ml-2 text-slate-500">(Coach)</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="w-full rounded-xl overflow-hidden bg-slate-700">
                <img src={lightboxPhoto.photo_url} alt="" className="w-full h-auto max-h-[70vh] object-contain" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare View */}
      <Dialog open={compareViewOpen} onOpenChange={open => { if (!open) setCompareViewOpen(false); }}>
        <DialogContent className="max-w-5xl bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Vergleich ({comparePhotos.length} Fotos)</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {comparePhotos.map(p => (
              <div key={p.id} className="shrink-0 flex flex-col items-center" style={{ minWidth: '200px', flex: 1 }}>
                <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-slate-700 border border-slate-600">
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium mt-2 text-white">{format(new Date(p.taken_at), 'd. MMM yyyy', { locale: de })}</p>
                {p.note && <p className="text-xs text-slate-400">{p.note}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientProgressPhotos;
