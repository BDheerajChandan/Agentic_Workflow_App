// src/App.jsx

import React from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import FlowListPage from "./components/FlowListPage";
import FlowCanvas   from "./components/canvas/FlowCanvas";
import { createFlow } from "./services/api";
import { flowPath, groupPath } from "./utils/routes";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/group/:groupId" element={<HomeRoute />} />
      <Route path="/flow/:routeSlug" element={<FlowCanvasRoute />} />
      <Route path="/group/:groupId/flow/:routeSlug" element={<FlowCanvasRoute />} />
    </Routes>
  );
}

function HomeRoute() {
  const navigate = useNavigate();
  const { groupId } = useParams();

  const createNew = async () => {
    const created = await createFlow("Untitled Flow", groupId ?? null);
    navigate(flowPath(created.route_slug, groupId));
  };

  return (
    <FlowListPage
      key={groupId || "home"}
      groupId={groupId}
      onOpen={(slug, gid) => navigate(flowPath(slug, gid))}
      onNew={createNew}
      onOpenGroup={(id) => navigate(groupPath(id))}
      onHome={() => navigate("/")}
    />
  );
}

function FlowCanvasRoute() {
  const { groupId, routeSlug } = useParams();
  const navigate = useNavigate();
  return (
    <FlowCanvas
      key={`${groupId || ""}/${routeSlug}`}
      routeSlug={routeSlug}
      groupId={groupId}
      onBack={() => navigate(groupId ? groupPath(groupId) : "/")}
    />
  );
}