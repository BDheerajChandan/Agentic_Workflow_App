// src/components/TopBar.jsx

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function TopBar() {
  const [now, setNow] = useState(new Date());
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isHome = location.pathname === "/";

  return (
    <div className="topbar">
      <div className="topbar-left">
        {!isHome && (
          <button className="btn btn-ghost btn-sm topbar-back" onClick={() => navigate("/")}>
            ← Back
          </button>
        )}
        <span className="topbar-brand">🤖 DJ Chatbot</span>
      </div>
      <div className="topbar-center">
        {now.toLocaleDateString()} {"  ||  "} {now.toLocaleTimeString()}
      </div>
      <span className="topbar-right">Developed by Dheeraj</span>
    </div>
  );
}