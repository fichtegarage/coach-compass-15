import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';

const impressumText = `Angaben gemäß § 5 TMG

Jakob Neumann
Milchberg 8
86150 Augsburg
Deutschland

Kontakt
Telefon: 015154823993
E-Mail: jakob.neumann@posteo.de
Website: buchung.jakob-neumann.net`;

const datenschutzText = `Diese Datenschutzerklärung gilt für die Webanwendung unter buchung.jakob-neumann.net.

1. Erhobene Daten
Wir verarbeiten: E-Mail-Adresse, Name, Buchungscode, Trainingseinheiten, Körperwerte, Fortschrittsfotos sowie technische Zugriffsdaten.

2. Zweck
Verwaltung von Trainingsterminen, Dokumentation von Fortschritten und technischer Betrieb der Anwendung.

3. Rechtsgrundlage
Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Für Gesundheitsdaten: Art. 9 Abs. 2 lit. a DSGVO.

4. Drittanbieter
Supabase Inc. (Datenbank, EU-Server Frankfurt) – supabase.com/privacy
Vercel Inc. (Hosting) – vercel.com/legal/privacy-policy

5. Speicherdauer
Daten werden nach Beendigung des Trainingsverhältnisses auf Anfrage gelöscht.

6. Ihre Rechte
Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit.
Kontakt: jakob.neumann@posteo.de

7. Datensicherheit
Alle Übertragungen erfolgen verschlüsselt via HTTPS.`;

const Modal: React.FC<{ title: string; content: string; onClose: () => void }> = ({ title, content, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/50" />
    <div
      className="relative bg-background border border-border rounded-t-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-xl"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="
