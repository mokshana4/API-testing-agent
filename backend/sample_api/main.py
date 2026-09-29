"""
Quantum PM API - a small demo API to point the testing agent at.

It is intentionally *almost* correct. Three bugs are planted so the agent has
something real to find:

  BUG 1  DELETE /projects/{id}      returns 200 instead of the documented 404
  BUG 2  GET /projects/{id}/stats   returns completion_percent as a string ("40%")
  BUG 3  GET /tasks/search          compiles user input as a regex -> 500 on "("

Run standalone:  uvicorn sample_api.main:app --port 8001
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated

from fastapi import FastAPI, HTTPException, Path, Query, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(
    title="Quantum PM API",
    version="1.0.0",
    description="Project & task management API used to demo the API Testing Agent.",
)


# --------------------------------------------------------------------- models
class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    review = "review"
    done = "done"


class ProjectIn(BaseModel):
    name: str = Field(min_length=3, max_length=60, examples=["Apollo Launch"])
    description: str | None = Field(default=None, max_length=500)
    budget: float = Field(ge=0, le=1_000_000, examples=[25000])
    team_size: int = Field(ge=1, le=50, examples=[8])


class Project(ProjectIn):
    id: int
    created_at: datetime


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=120, examples=["Design resource planner"])
    status: TaskStatus = TaskStatus.todo
    priority: int = Field(default=3, ge=1, le=5)
    estimate_hours: float | None = Field(default=None, gt=0, le=200)


class Task(TaskIn):
    id: int
    project_id: int


class ProjectStats(BaseModel):
    project_id: int
    total_tasks: int
    completion_percent: float = Field(ge=0, le=100)
    by_status: dict[str, int]


class ErrorResponse(BaseModel):
    detail: str


NOT_FOUND = {404: {"model": ErrorResponse, "description": "Project not found"}}
ProjectId = Annotated[int, Path(ge=1, examples=[1], description="Project identifier")]

# ------------------------------------------------------------ in-memory store
_projects: dict[int, dict] = {}
_tasks: dict[int, dict] = {}
_seq = {"project": 0, "task": 0}


def _next(kind: str) -> int:
    _seq[kind] += 1
    return _seq[kind]


def reset_db() -> None:
    """Reset to a known seed state (project #1 with three tasks)."""
    _projects.clear()
    _tasks.clear()
    _seq.update(project=0, task=0)
    pid = _next("project")
    _projects[pid] = {
        "id": pid, "name": "Quantum Core Platform", "description": "Seed project",
        "budget": 120000.0, "team_size": 12, "created_at": datetime.now(timezone.utc),
    }
    for title, status in [("Kanban board", "done"), ("Gantt charts", "in_progress"), ("SOC2 audit", "todo")]:
        tid = _next("task")
        _tasks[tid] = {"id": tid, "project_id": pid, "title": title, "status": status,
                       "priority": 3, "estimate_hours": 16.0}


reset_db()


def _get_project(project_id: int) -> dict:
    project = _projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    return project


# ------------------------------------------------------------------ endpoints
@app.get("/health", tags=["system"], summary="Health check")
def health():
    return {"status": "ok"}


@app.get("/projects", response_model=list[Project], tags=["projects"], summary="List projects")
def list_projects(
    limit: int = Query(20, ge=1, le=100, description="Page size"),
    offset: int = Query(0, ge=0, description="Items to skip"),
):
    items = sorted(_projects.values(), key=lambda p: p["id"])
    return items[offset: offset + limit]


@app.post("/projects", response_model=Project, status_code=201, tags=["projects"], summary="Create project")
def create_project(payload: ProjectIn):
    pid = _next("project")
    _projects[pid] = {"id": pid, "created_at": datetime.now(timezone.utc), **payload.model_dump()}
    return _projects[pid]


@app.get("/projects/{project_id}", response_model=Project, responses=NOT_FOUND, tags=["projects"],
         summary="Get project")
def get_project(project_id: ProjectId):
    return _get_project(project_id)


@app.put("/projects/{project_id}", response_model=Project, responses=NOT_FOUND, tags=["projects"],
         summary="Replace project")
def update_project(project_id: ProjectId, payload: ProjectIn):
    project = _get_project(project_id)
    project.update(payload.model_dump())
    return project


@app.delete("/projects/{project_id}", status_code=204, responses=NOT_FOUND, tags=["projects"],
            summary="Delete project")
def delete_project(project_id: ProjectId):
    if project_id not in _projects:
        # BUG 1: the contract says 404, but we quietly report success.
        return JSONResponse(status_code=200, content={"deleted": False})
    del _projects[project_id]
    for tid in [t for t, task in _tasks.items() if task["project_id"] == project_id]:
        del _tasks[tid]
    return Response(status_code=204)


@app.post("/projects/{project_id}/tasks", response_model=Task, status_code=201, responses=NOT_FOUND,
          tags=["tasks"], summary="Create task in project")
def create_task(project_id: ProjectId, payload: TaskIn):
    _get_project(project_id)
    tid = _next("task")
    _tasks[tid] = {"id": tid, "project_id": project_id, **payload.model_dump()}
    return _tasks[tid]


@app.get("/projects/{project_id}/tasks", response_model=list[Task], responses=NOT_FOUND,
         tags=["tasks"], summary="List tasks of a project")
def list_tasks(project_id: ProjectId, status: TaskStatus | None = Query(None, description="Filter by status")):
    _get_project(project_id)
    tasks = [t for t in _tasks.values() if t["project_id"] == project_id]
    if status:
        tasks = [t for t in tasks if t["status"] == status.value]
    return tasks


@app.get("/projects/{project_id}/stats", responses={200: {"model": ProjectStats}, **NOT_FOUND},
         tags=["projects"], summary="Project completion stats")
def project_stats(project_id: ProjectId):
    _get_project(project_id)
    tasks = [t for t in _tasks.values() if t["project_id"] == project_id]
    by_status: dict[str, int] = {}
    for t in tasks:
        by_status[t["status"]] = by_status.get(t["status"], 0) + 1
    pct = (by_status.get("done", 0) / len(tasks) * 100) if tasks else 0.0
    # BUG 2: the schema says number, but a formatted string leaks out.
    return JSONResponse({"project_id": project_id, "total_tasks": len(tasks),
                         "completion_percent": f"{pct:.0f}%", "by_status": by_status})


@app.get("/tasks/search", response_model=list[Task], tags=["tasks"], summary="Search tasks by title")
def search_tasks(
    q: str = Query(min_length=1, max_length=50, description="Text to search for", examples=["kanban"]),
    limit: int = Query(10, ge=1, le=50),
):
    pattern = re.compile(q, re.IGNORECASE)  # BUG 3: raw user input compiled as a regex
    return [t for t in _tasks.values() if pattern.search(t["title"])][:limit]
