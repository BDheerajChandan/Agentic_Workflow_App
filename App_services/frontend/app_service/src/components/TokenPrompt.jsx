import { useState } from "react";
import { setToken } from "../services/serviceApi";

export default function TokenPrompt({ onSaved }) {
  const [value, setValue] = useState("");

  const submit = (e) => {
    e.preventDefault();
    setToken(value.trim());
    onSaved();
  };

  return (
    <div className="overlay" style={{ zIndex: 1800 }}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head"><div className="modal-title">Admin token required</div></div>
        <div className="modal-text">
          This DJ Services backend requires an admin token (ADMIN_TOKEN in backend/.env). It is kept only for this
          browser tab.
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">Admin token</label>
          <input className="input" type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" type="submit" disabled={!value.trim()}>Continue</button>
        </div>
      </form>
    </div>
  );
}