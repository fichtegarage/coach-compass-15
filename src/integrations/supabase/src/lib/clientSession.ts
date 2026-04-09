import { supabase } from '@/integrations/supabase/client';

export function getClientToken(): string | null {
  return localStorage.getItem('booking_client_token') 
      || sessionStorage.getItem('booking_client_token');
}

export async function setClientSessionToken(): Promise<void> {
  const token = getClientToken();
  if (!token) return;
  
  await supabase.rpc('set_config', {
    key: 'app.client_token',
    value: token
  });
}

export function clearClientSession(): void {
  localStorage.removeItem('booking_client_token');
  localStorage.removeItem('booking_client_id');
  localStorage.removeItem('booking_client_name');
  localStorage.removeItem('booking_client_email');
  sessionStorage.removeItem('booking_client_token');
  sessionStorage.removeItem('booking_client_id');
  sessionStorage.removeItem('booking_client_name');
  sessionStorage.removeItem('booking_client_email');
}
