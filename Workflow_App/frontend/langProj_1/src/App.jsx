// src/App.jsx

import React from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import FlowListPage from "./components/FlowListPage";
import FlowCanvas   from "./components/canvas/FlowCanvas";
import { createFlow } from "./services/api";

export default function App() {
  const navigate = useNavigate();

  const openFlow = (routeSlug) => {
    navigate(`/flow/${routeSlug}`);
  };

  const createNew = async () => {
    const { route_slug } = await createFlow("Untitled Flow");
    navigate(`/flow/${route_slug}`);
  };

  const goBack = () => {
    navigate("/");
  };

  return (
    <Routes>
      <Route path="/" element={<FlowListPage onOpen={openFlow} onNew={createNew} />} />
      <Route path="/flow/:routeSlug" element={<FlowCanvasRoute onBack={goBack} />} />
    </Routes>
  );
}

function FlowCanvasRoute({ onBack }) {
  const { routeSlug } = useParams();
  return <FlowCanvas key={routeSlug} routeSlug={routeSlug} onBack={onBack} />;
}