-- Users (populated on first login)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR UNIQUE NOT NULL,
  full_name VARCHAR,
  email VARCHAR,
  badge_number VARCHAR,
  unit VARCHAR,
  rank VARCHAR,
  role VARCHAR NOT NULL DEFAULT 'officer',
  supervisor_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trainings
CREATE TABLE IF NOT EXISTS trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR NOT NULL,
  category VARCHAR,
  description TEXT,
  instructor VARCHAR,
  location VARCHAR,
  session_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  duration_hours DECIMAL,
  seat_capacity INTEGER,
  no_seat_limit BOOLEAN DEFAULT false,
  cost DECIMAL(10,2),
  training_type VARCHAR DEFAULT 'internal',
  is_required BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enrollment requests
CREATE TABLE IF NOT EXISTS enrollment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES trainings(id),
  officer_id UUID NOT NULL REFERENCES users(id),
  supervisor_id UUID REFERENCES users(id),
  request_type VARCHAR NOT NULL DEFAULT 'self_requested',
  status VARCHAR NOT NULL DEFAULT 'pending',
  denial_note TEXT,
  attended BOOLEAN,
  reminder_sent BOOLEAN DEFAULT false,
  acted_on_at TIMESTAMPTZ,
  acted_on_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(training_id, officer_id)
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trainings_updated_at
  BEFORE UPDATE ON trainings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER enrollment_requests_updated_at
  BEFORE UPDATE ON enrollment_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
