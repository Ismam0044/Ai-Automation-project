import { useEffect, useState } from "react";

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  let body = null;
  try { body = await response.json(); } catch { /* keep response errors generic */ }
  if (!response.ok) {
    const error = new Error(body?.error?.message || `The request could not be completed (${response.status}).`);
    error.code = body?.error?.code;
    error.status = response.status;
    throw error;
  }
  return body;
}

let workspaceRequest;

function loadWorkspace() {
  if (!workspaceRequest) {
    workspaceRequest = (async () => {
      const current = await fetch("/workspaces/current", { credentials: "same-origin" });
      if (current.ok) return current.json();
      if (current.status !== 401) throw new Error("We could not open a private workspace. Please retry.");
      return requestJson("/workspaces", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ name: "My API monitors" }),
      });
    })().catch((error) => {
      workspaceRequest = null;
      throw error;
    });
  }
  return workspaceRequest;
}

export function useWorkspace() {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadWorkspace().then((result) => {
      if (active) setWorkspace(result.workspace);
    }).catch((requestError) => {
      if (active) setError(requestError.message || "We could not create a private workspace.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { workspace, loading, error, setError };
}

export { requestJson };
