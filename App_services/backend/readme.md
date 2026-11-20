# Docker layer

How DJ Services uses Docker. Nothing here needs to be run by hand; these are reference notes.

## What DJ Services creates

| Object | Name | Notes |
|---|---|---|
| Containers | the service's `container_name` (e.g. `dj_workflow_backend`) | Stable names; labelled `dj.managed=true`, `dj.service_id`, `dj.project_id`, `dj.sig` |
| Network | `dj_services_net` | User-defined bridge; containers resolve each other by container name |
| Python deps volume | `dj_<service_id>_pydeps` | Installed packages (`pip --user`), survives container recreation |
| Node deps volume | `dj_<service_id>_node_modules` | Linux `node_modules`, kept off your Windows folder |
| Caches | `dj_pip_cache`, `dj_npm_cache` | Speed up reinstalls |
| Image (Dockerfile runtime) | `dj_<service_id>:latest` | Built from the project's Dockerfile |

Python/Node projects are bind-mounted at `/app`. Your source folders are never copied or modified, except that
Python/Node tooling may write inside the mounted project (caches, `__pycache__` is disabled, uploads, `Chroma_db`, `download/`).

## Restart policies

| auto_start | auto_restart | Docker policy |
|---|---|---|
| ON | ON | `unless-stopped` |
| OFF | ON | `on-failure:5` |
| any | OFF | `no` |

`unless-stopped` and `on-failure` both respect a manual Stop: a service you stopped from the dashboard stays stopped,
including after Docker Desktop restarts. `auto_start` additionally lets DJ Services restart a service at startup,
but only if it was running when it last went down.

## Useful commands (PowerShell)

```powershell
docker ps -a --filter "label=dj.managed=true"                 # every managed container
docker logs -f dj_workflow_backend                              # live logs
docker volume ls --filter "name=dj_"                            # dependency volumes
docker network inspect dj_services_net                          # who is attached
docker rm -f dj_workflow_backend                                # remove one container (config stays registered)
docker volume rm dj_workflow_backend_pydeps                     # force a clean dependency reinstall
```

## Docker socket warning

Anything that can reach the Docker API can start a privileged container that mounts your whole disk. Mounting
`/var/run/docker.sock` into the DJ Services backend therefore gives that container host-level control. Mitigations in
this project: ports bound to 127.0.0.1, required `ADMIN_TOKEN`, Origin checking, only registered service ids are
manageable, only `dj.managed` containers are touched, no arbitrary commands from the browser, read-only root
filesystem, dropped capabilities. For stronger isolation use `COMPOSE_PROFILES=proxy` (see the main README).