# DJ Services: Docker-based application service manager

One dashboard to start, stop, restart and monitor your local applications as Docker containers.

```
DJ Application Services  (http://localhost:5175)
  ├─ DJ Workflows Backend   http://localhost:8001
  ├─ DJ Workflows Frontend  http://localhost:5173
  └─ DJ Chatbot Frontend    http://localhost:5174
```

* Backend: Python, FastAPI, Docker SDK, asyncpg. Frontend: React + Vite.
* Registered projects/services live in PostgreSQL (schema `dj_services`). `backend/app/config/App_cofig.json` seeds the
  database on first start and is rewritten as a recoverable export after every change. Existing records are never
  overwritten by the file.
* Docker Engine is the source of truth for container state. Application health is a separate HTTP check.

## Folder layout

```
<projects root>/            (HOST_PROJECTS_ROOT)
├── App_services/           this project
├── dj_chatbot/
└── LcLg_Project/           backend/  and  frontend/langProj_1/
```

## Prerequisites

* Windows 10, Docker Desktop (WSL 2 backend), enabled "Start Docker Desktop when you sign in".
* PostgreSQL reachable from the backend (your existing server).
* Python 3.11+ and Node 20+ only for the native mode below.

### PostgreSQL must accept connections from containers

The workflow backend runs in a container and reaches your Windows PostgreSQL through `host.docker.internal`.
Edit (paths vary by installation) and restart the PostgreSQL service:

```
# postgresql.conf
listen_addresses = '*'

# pg_hba.conf  (adjust to your Docker subnet; these cover Docker Desktop defaults)
host  all  all  172.16.0.0/12   scram-sha-256
host  all  all  192.168.0.0/16  scram-sha-256
```

Allow TCP 5432 for those subnets in Windows Firewall. If PostgreSQL itself runs in Docker, attach it to
`dj_services_net` and set `DB_HOST` to its container name (also in the workflow backend's `env` in the service config).

## Run mode A: dashboard in Docker (recommended)

```powershell
cd "App_services"
copy .env.example .env          # then edit HOST_PROJECTS_ROOT, ADMIN_TOKEN, DB_PASSWORD
docker compose up -d --build
docker compose logs -f backend
```

Open http://localhost:5175 and enter the admin token. Both DJ Services containers use `restart: unless-stopped`, so they
come back whenever Docker Desktop starts.

## Run mode B: native (no Docker socket mount)

The backend runs on Windows and reaches Docker through its named pipe. No container has host-level access.

```powershell
cd "App_services\backend"
copy .env.example .env          # set DB_PASSWORD (and ADMIN_TOKEN)
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python run.py                    # http://localhost:8010

cd "..\frontend\app_service"
copy .env.example .env
npm install
npm run dev                      # http://localhost:5175
```

## First use

1. Open the dashboard. The three configured services appear as cards, all INACTIVE. Registration never starts anything.
2. Click **Run** on *DJ Workflows Backend*. The first start pulls `python:3.11` and installs `requirements.txt` into a
   Docker volume, which can take several minutes. The card shows STARTING until http://localhost:8001 responds.
3. Run the workflow frontend (5173) and chatbot (5174). `npm install` runs inside the container.
4. **Stop**, **Restart**, **Details** (config, container info, logs, events) work per service.
5. **Start All** starts services in dependency order and waits for each dependency's health before starting dependents.
   **Stop All** stops dependents first. Both only affect services registered in DJ Services.

## Registering another application

Dashboard: **Register Service** (use *New project* for a new application, or pick an existing project).
Required: name, ID, project path, host port, container port. Everything else has defaults:

| Type | Runtime default | What runs |
|---|---|---|
| Backend / Worker | Python | `pip install` into a volume, then `python run.py` (or `uvicorn app.main:app` if there is no `run.py`) |
| Frontend | Node | `npm install` into a volume, then `npm run dev -- --host 0.0.0.0 --port $PORT` |
| Database / Other | Docker image | The image's own command |
| (any) | Dockerfile | Builds the project's Dockerfile |

Custom `start_command` / `install_command` can only be set in `App_cofig.json` (or with `ALLOW_CUSTOM_COMMANDS=true`).
Reload the file with `POST /api/config/reload` (adds missing services only).

### Production build for a frontend

In `App_cofig.json` set a start command, then restart the service:

```json
"start_command": "npm run build && npx vite preview --host 0.0.0.0 --port $PORT --strictPort"
```

### Changing a port or other config

Edit the service (Details → Edit). The card shows *Configuration changed. Restart to apply it*; Restart recreates the
container with the new mapping (dependencies stay in their volume).

## Ports

| Service | Host | Container |
|---|---:|---:|
| DJ Services API | 8010 | 8010 |
| DJ Services dashboard | 5175 | 8080 |
| DJ Workflows Backend | 8001 | 8001 |
| DJ Workflows Frontend | 5173 | 5173 |
| DJ Chatbot Frontend | 5174 | 5174 |

Managed services publish on `127.0.0.1` by default. Browser-facing frontends keep calling `http://localhost:8001`
(the published port), so no code change is needed in the applications.

## Docker access and security

The backend can create and delete containers, so treat it as privileged.

* Everything is bound to `127.0.0.1`. `ADMIN_TOKEN` is required in Docker mode and sent as `X-Admin-Token`.
* Cross-site browser requests that change state are rejected (Origin check).
* Only registered service ids are manageable; project paths must stay inside the allowed projects root; secrets in
  `env` must be `${NAME}` references; no arbitrary commands or shell strings are accepted from the browser.
* **Socket mode** (`COMPOSE_PROFILES=socket`) mounts `/var/run/docker.sock`. That is effectively root on your machine
  for anything running in that container. **Proxy mode** (`COMPOSE_PROFILES=proxy`, then `docker compose up -d --build`)
  puts a filtering proxy in front of the socket. **Native mode B** avoids the mount entirely.
* Do not publish the API or dashboard on other interfaces. If you ever must, add TLS and a real authentication layer first.

## Stop, restart, update

```powershell
docker compose stop            # stop the dashboard + API (managed apps keep running)
docker compose up -d           # start again
docker compose up -d --build   # rebuild after changing DJ Services code
docker compose down            # remove DJ Services containers (registrations are in PostgreSQL)
```

Managed apps are controlled from the dashboard (or `POST /api/services/{id}/stop`). The Docker network
`dj_services_net` is shared, so `docker compose down` may report it in use while managed containers still run.

## API

Interactive docs: http://localhost:8010/docs. Main routes: `/api/services`, `/api/services/{id}/start|stop|restart`,
`/api/services/{id}/logs|details|status|health`, `/api/services/start-all|stop-all|refresh`, `/api/projects`,
`/api/docker/*`, `/api/config`, `/api/config/reload`, `/api/config/export`.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Dashboard says *Docker disconnected* | Start Docker Desktop and wait for "Engine running". |
| `docker compose up` fails with "Set ADMIN_TOKEN" | Fill `ADMIN_TOKEN` in `.env` (required in Docker mode). |
| Port 8001/5173/5174 *already occupied* | Stop the old process (the manual `python run.py` / `npm run dev`) or change the host port. |
| Card stuck on STARTING for minutes | First start installs dependencies. Open Details → Logs. |
| Workflow backend logs `connection refused` to PostgreSQL | Fix `listen_addresses` / `pg_hba.conf` / firewall (see above), check `DB_PASSWORD`. |
| Project folder appears empty in the container | `HOST_PROJECTS_ROOT` is wrong, or the drive is not shared with Docker Desktop. |
| *Container exited immediately* | Details → Logs for the traceback (missing `run.py`, bad `.env`, dependency build failure). |
| Vite/uvicorn does not reload after editing files | Windows bind mounts do not deliver file events; polling is enabled for Vite, restart Python services. |
| Config changes not applied | The card shows *Restart to apply*. Restart recreates the container. |
| A container with that name already exists | A container named like the service exists but is not managed by DJ Services. Remove or rename it. |
| Dashboard shows *Admin token required* | Enter the `ADMIN_TOKEN` value (kept for this browser tab only). |

## Verification checklist (manual)

Nothing in this repository has been executed end to end by its author. Run these on your machine:

1. `docker compose up -d --build`, dashboard opens, three cards, INACTIVE.
2. Run workflow backend, open http://localhost:8001. Run workflow frontend (5173) and chatbot (5174).
3. Stop 8001 only: the other two stay running. Restart 5174.
4. Refresh the browser and restart DJ Services: services and settings remain.
5. Restart Docker Desktop: services that were running (auto-start ON) come back; services you stopped stay stopped.
6. Register a service with a taken ID or port: rejected with a clear message.
7. Start something on port 8001 first, then Run the backend: clear port-conflict message.
8. Quit Docker Desktop: dashboard shows Docker disconnected.
9. Stop All, then Start All: dependency order (backend before frontends).