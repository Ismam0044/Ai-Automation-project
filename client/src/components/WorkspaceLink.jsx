import { useState } from "react";
import { requestJson } from "../useWorkspace.js";

export default function WorkspaceLink({ workspace }) {
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function createLink() {
    setBusy(true);
    setNotice("");
    setLink(null);
    try {
      const result = await requestJson(`/workspaces/${workspace.id}/access-links`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: "{}",
      });
      setLink(result.access_link);
      setNotice(`Expires ${new Date(result.expires_at).toLocaleString()}. Anyone with this link can open this workspace. Use it once.`);
    } catch {
      setNotice("We could not create a workspace link. Please wait and try again.");
    } finally { setBusy(false); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Workspace link copied. Anyone with it can open this workspace; it works once and expires soon.");
    } catch { setNotice("Copy was unavailable. Select and copy the link text below."); }
  }

  return <div className="relative">
    <button className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 sm:px-4 sm:text-sm" type="button" disabled={busy} onClick={() => void createLink()}>{busy ? "Creating link…" : "Open on another device"}</button>
    {(link || notice) && <div className="absolute right-0 z-20 mt-2 w-[min(92vw,28rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl" role="status"><p className="mb-2 text-sm leading-5 text-slate-700">{notice}</p>{link && <><label htmlFor="workspace-link" className="sr-only">One-time workspace link</label><input id="workspace-link" readOnly value={link} className="min-h-10 w-full rounded-lg border border-slate-300 px-2 text-xs text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-700" /><button className="mt-2 min-h-9 rounded-lg bg-[#163f67] px-3 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700" type="button" onClick={() => void copyLink()}>Copy</button><button className="ml-2 min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700" type="button" onClick={() => { setLink(null); setNotice(""); }}>Close</button></>}</div>}
  </div>;
}
