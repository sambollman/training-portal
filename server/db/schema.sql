-- Users (populated on first login)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR UNIQUE NOT NULL,
  full_name VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR,
  email VARCHAR,
  badge_number VARCHAR,
  post_license_number VARCHAR,
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
  is_out_of_state BOOLEAN DEFAULT false,
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
  reason TEXT,
  training_cost DECIMAL(10,2),
  travel_cost DECIMAL(10,2),
  hotel_cost DECIMAL(10,2),
  per_diem DECIMAL(10,2),
  chain_status VARCHAR DEFAULT 'pending',
  denial_note TEXT,
  attended BOOLEAN,
  reminder_sent BOOLEAN DEFAULT false,
  acted_on_at TIMESTAMPTZ,
  acted_on_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(training_id, officer_id)
);

-- External training requests (self-reported, not from portal listings)
CREATE TABLE IF NOT EXISTS external_training_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID NOT NULL REFERENCES users(id),
  training_name VARCHAR NOT NULL,
  organization VARCHAR,
  location VARCHAR,
  is_out_of_state BOOLEAN DEFAULT false,
  start_date DATE,
  end_date DATE,
  duration_hours DECIMAL,
  description TEXT,
  training_cost DECIMAL(10,2),
  travel_cost DECIMAL(10,2),
  hotel_cost DECIMAL(10,2),
  per_diem DECIMAL(10,2),
  website VARCHAR,
  reason TEXT,
  status VARCHAR DEFAULT 'pending',
  chain_status VARCHAR DEFAULT 'pending',
  attended BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approval chain steps
CREATE TABLE IF NOT EXISTS approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_request_id UUID REFERENCES enrollment_requests(id) ON DELETE CASCADE,
  external_request_id UUID REFERENCES external_training_requests(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  approver_id UUID NOT NULL REFERENCES users(id),
  approver_name VARCHAR,
  approver_rank VARCHAR,
  decision VARCHAR,
  comment TEXT,
  next_approver_id UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training file attachments
CREATE TABLE IF NOT EXISTS training_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  filename VARCHAR NOT NULL,
  original_name VARCHAR NOT NULL,
  mimetype VARCHAR,
  size INTEGER,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training records (transcript)
CREATE TABLE IF NOT EXISTS training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID NOT NULL REFERENCES users(id),
  training_title VARCHAR NOT NULL,
  training_date DATE,
  completion_date DATE,
  hours DECIMAL,
  status VARCHAR DEFAULT 'completed',
  certified BOOLEAN DEFAULT false,
  certification_name VARCHAR,
  certification_expiration DATE,
  score VARCHAR,
  remarks TEXT,
  source VARCHAR DEFAULT 'portal',
  enrollment_request_id UUID REFERENCES enrollment_requests(id),
  external_request_id UUID REFERENCES external_training_requests(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training certificates (attached to records)
CREATE TABLE IF NOT EXISTS training_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_record_id UUID NOT NULL REFERENCES training_records(id) ON DELETE CASCADE,
  filename VARCHAR NOT NULL,
  original_name VARCHAR NOT NULL,
  mimetype VARCHAR,
  size INTEGER,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
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
