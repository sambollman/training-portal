# FPD Training Portal

An internal web application for managing officer training at the Fargo Police Department. Built to replace a SharePoint-based system with a purpose-built portal that handles training scheduling, approval workflows, transcript tracking, and POST board compliance reporting.

## Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js / Express
- **Database:** PostgreSQL 16
- **Infrastructure:** Docker Compose on Raspberry Pi 5
- **Tunnel:** Cloudflare Tunnel (training.forert.com)
- **Auth:** Okta SSO (production) / dev login (development)
- **Auto-deploy:** GitHub webhook → Pi rebuild on push to main

## Architecture

GitHub → Webhook → Raspberry Pi → Docker Compose
├── app (Node/React)
└── db (PostgreSQL)
↓
Cloudflare Tunnel
↓
training.forert.com


## Features

- **Training Management** — Create, edit, close, and archive training sessions with seat limits, costs, compliance tags, section numbers, and lesson plan attachments
- **Approval Workflow** — Multi-step approval chain (Officer → Sergeant → Lieutenant → Captain → Asst Chief for out-of-state) with cost breakdown visibility for approvers
- **External Training Requests** — Officers can request approval for trainings not listed in the portal
- **Training Calendar** — Monthly view showing internal (green), external (red), specialized unit (blue), and civilian (yellow) trainings
- **Transcripts** — Per-officer training history with certificate uploads and PDF export
- **Compliance View** — Tag multiple training sessions under a topic and see who has/hasn't signed up or attended across all sessions
- **Roster Export** — CSV export formatted for POST board submission
- **Bulk Import** — Import historical training records and users from Excel
- **User Management** — Role-based access (officer, supervisor, coordinator, instructor) with bulk user import from ND.gov username spreadsheet

## Roles

| Role | Permissions |
|------|------------|
| Officer | View trainings, request to attend, view own transcript |
| Supervisor | All officer permissions + approve/deny requests, enroll officers, view anyone's transcript, compliance view |
| Instructor | Mark attendance on any training |
| Coordinator | Full access including create/manage trainings, user management, import records |

## Environment Variables

Create a `.env` file in the root:

```env
OKTA_HEADER=X-Auth-Proxy-Username
ADMIN_PASSWORD=changeme
SESSION_SECRET=your-secret-here
POSTGRES_USER=trainingapp
POSTGRES_PASSWORD=changeme
POSTGRES_DB=training_portal
DATABASE_URL=postgresql://trainingapp:changeme@db:5432/training_portal
SMTP_HOST=
SMTP_PORT=587
SMTP_FROM=
```

## Local Development

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- Git

### Setup

```bash
git clone https://github.com/sambollman/training-portal.git
cd training-portal
cp .env.example .env
# Edit .env with your values
docker compose up -d --build
```

App runs at `http://localhost:3000`

In development mode (no `OKTA_HEADER` set), use the dev login at `/login` with the `ADMIN_PASSWORD`.

## Deployment

The app runs on a Raspberry Pi 5 behind a Cloudflare tunnel. Deployment is fully automated:

1. Push to `main` branch on GitHub
2. GitHub webhook triggers the Pi at `deploy.forert.com/webhook`
3. Pi runs `git pull && docker compose down && docker compose up -d --build`
4. New version is live at `training.forert.com`

## Database

PostgreSQL runs in Docker. Schema is in `server/db/schema.sql`. To reset the database:

```bash
docker compose down -v
docker compose up -d --build
```

## Project Structure

training-portal/
├── client/ # React frontend (Vite)
│ └── src/
│ ├── pages/ # Page components
│ ├── components/ # Shared components (Layout)
│ └── context/ # Auth context
├── server/ # Node/Express backend
│ ├── routes/ # API routes
│ ├── middleware/ # Auth middleware
│ └── db/ # Database connection & schema
├── webhook/ # GitHub webhook auto-deploy server
└── docker-compose.yml


## Roadmap

- Email notifications (cert expiry reminders, approval notifications)
- Approval chain modifications (add approvers mid-chain, return for more info)
- Firearms qualification tracking per enrollment
- Badge/rank/unit bulk import
- Training cost reporting
