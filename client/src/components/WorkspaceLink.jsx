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
    <button className="inline-flex min-h-10 items-center rounded-lg border border-[#d0d5dd] bg-[#ffffff] px-3 text-xs font-bold text-[#475467] hover:bg-[#f9fafb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:px-4 sm:text-sm" type="button" disabled={busy} onClick={() => void createLink()}>{busy ? "Creating link…" : "Open on another device"}</button>
    {(link || notice) && <div className="absolute right-0 z-20 mt-2 w-[min(92vw,28rem)] rounded-xl border border-[#e4e7ec] bg-[#ffffff] p-4 shadow-xl" role="status"><p className="mb-2 text-sm leading-5 text-[#475467]">{notice}</p>{link && <><label htmlFor="workspace-link" className="sr-only">One-time workspace link</label><input id="workspace-link" readOnly value={link} className="min-h-10 w-full rounded-lg border border-[#d0d5dd] px-2 text-xs text-[#475467] focus-visible:outline-2 focus-visible:outline-[#2563eb]" /><button className="mt-2 min-h-9 rounded-lg bg-[#2563eb] px-3 text-xs font-bold text-[#ffffff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]" type="button" onClick={() => void copyLink()}>Copy</button><button className="ml-2 min-h-9 rounded-lg border border-[#d0d5dd] px-3 text-xs font-bold text-[#475467] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]" type="button" onClick={() => { setLink(null); setNotice(""); }}>Close</button></>}</div>}
  </div>;
}
