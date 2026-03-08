
-- Add booking columns to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS booking_code text UNIQUE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS booking_code_active boolean NOT NULL DEFAULT true;

-- Create availability_slots table
CREATE TABLE public.availability_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  slot_type text NOT NULL DEFAULT 'in-person',
  is_bookable boolean NOT NULL DEFAULT true,
  max_bookings integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

-- Trainer can do everything with own slots
CREATE POLICY "Trainer manages own slots" ON public.availability_slots
  FOR ALL USING (auth.uid() = trainer_id)
  WITH CHECK (auth.uid() = trainer_id);

-- Anyone authenticated can read bookable slots
CREATE POLICY "Authenticated users can read slots" ON public.availability_slots
  FOR SELECT TO authenticated USING (true);

-- Create booking_requests table
CREATE TABLE public.booking_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id uuid NOT NULL REFERENCES public.availability_slots(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  client_message text,
  trainer_note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Clients can insert their own booking requests (matched by client_id)
CREATE POLICY "Anyone authenticated can insert booking requests" ON public.booking_requests
  FOR INSERT TO authenticated WITH CHECK (true);

-- Clients can read their own requests
CREATE POLICY "Clients can read own booking requests" ON public.booking_requests
  FOR SELECT TO authenticated USING (true);

-- Trainer (slot owner) can update booking requests
CREATE POLICY "Trainer can update booking requests" ON public.booking_requests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime for booking_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_requests;
