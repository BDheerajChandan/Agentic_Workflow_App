# app/schemas/service_schema.py

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ServiceType = Literal["backend", "frontend", "worker", "database", "other"]
RuntimeType = Literal["python", "node", "image", "dockerfile"]
Protocol = Literal["http", "https"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProjectCreate(_Strict):
    project_id: str | None = None
    project_name: str = Field(min_length=1, max_length=100)
    project_path: str | None = None
    description: str = ""
    enabled: bool = True


class ProjectUpdate(_Strict):
    project_name: str | None = Field(default=None, min_length=1, max_length=100)
    project_path: str | None = None
    description: str | None = None
    enabled: bool | None = None


class ServiceCreate(_Strict):
    service_id: str
    project_id: str | None = None          # existing project, OR
    project_name: str | None = None        # create a new project with this name
    project_root: str | None = None        # optional path for the new project
    service_name: str
    service_type: ServiceType = "backend"
    project_path: str
    runtime_type: RuntimeType | None = None
    dockerfile_path: str | None = None
    compose_file_path: str | None = None
    container_name: str | None = None
    docker_image: str | None = None
    host: str = "localhost"
    bind_address: str | None = None
    host_port: int
    container_port: int
    protocol: Protocol = "http"
    health_check_path: str | None = None
    enabled: bool = True
    auto_start: bool = False
    auto_restart: bool = True
    depends_on: list[str] = []
    env: dict[str, str] = {}
    start_command: str | None = None
    install_command: str | None = None
    start_period_seconds: int | None = None


class ServiceUpdate(_Strict):
    project_id: str | None = None
    service_name: str | None = None
    service_type: ServiceType | None = None
    project_path: str | None = None
    runtime_type: RuntimeType | None = None
    dockerfile_path: str | None = None
    compose_file_path: str | None = None
    container_name: str | None = None
    docker_image: str | None = None
    host: str | None = None
    bind_address: str | None = None
    host_port: int | None = None
    container_port: int | None = None
    protocol: Protocol | None = None
    health_check_path: str | None = None
    enabled: bool | None = None
    auto_start: bool | None = None
    auto_restart: bool | None = None
    depends_on: list[str] | None = None
    env: dict[str, str] | None = None
    start_command: str | None = None
    install_command: str | None = None
    start_period_seconds: int | None = None


def ok(data=None, message: str = "OK", **meta) -> dict:
    return {"success": True, "message": message, "data": data, **meta}