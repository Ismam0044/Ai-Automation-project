import { useState } from "react";
import { Upload } from "lucide-react";

export const assessmentSample = [
  {
    api_name: "PatientDataAPI",
    response_time_ms: 1200,
    status_code: 200,
    records_returned: 50,
  },
  {
    api_name: "AppointmentAPI",
    response_time_ms: 5500,
    status_code: 500,
    records_returned: 0,
  },
];

export const assessmentSampleText = JSON.stringify(assessmentSample, null, 2);

async function responseError(response) {
  try {
    const body = await response.json();
    return body?.error?.message || `Could not submit checks (${response.status}).`;
  } catch {
    return `Could not submit checks (${response.status}).`;
  }
}

export default function MonitorPanel({ value, onChange, onLoadSample, onComplete }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function submitChecks(event) {
    event.preventDefault();
    setError("");
    setResult(null);

    let checks;
    try {
      checks = JSON.parse(value);
    } catch {
      setError("Enter valid JSON before submitting.");
      return;
    }
    if (!Array.isArray(checks)) {
      setError("The request must be a JSON array of API checks.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/monitor", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(checks),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json();
      setResult(body);
      await onComplete();
    } catch (requestError) {
      setError(requestError.message || "Could not submit checks. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="submit-checks" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-7 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#2563eb]">Try a monitoring batch</p>
          <h2 className="text-2xl font-bold tracking-tight text-[#172b4d]">Submit checks</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">Send a JSON array of API response checks. Healthy checks are skipped; detected anomalies appear in Active alerts.</p>
        </div>
        <button
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-[#d0d5dd] bg-[#ffffff] px-4 text-sm font-semibold text-[#475467] transition hover:border-[#98a2b3] hover:bg-[#f9fafb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          type="button"
          onClick={onLoadSample}
        >
          <Upload className="h-4 w-4" aria-hidden="true" /> Load assessment sample
        </button>
      </div>

      <form className="mt-6" onSubmit={submitChecks}>
        <label htmlFor="checks-json" className="mb-2 block text-sm font-semibold text-[#344054]">Checks as JSON array</label>
        <textarea
          id="checks-json"
          name="checks-json"
          className="min-h-64 w-full resize-y rounded-xl border border-[#d0d5dd] bg-[#f9fafb] px-4 py-3 font-mono text-xs leading-6 text-[#344054] outline-none transition placeholder:text-[#98a2b3] focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/15 sm:text-sm"
          spellCheck="false"
          autoCapitalize="off"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby="checks-help"
        />
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p id="checks-help" className="mb-0 text-xs leading-5 text-[#667085]">Use api_name, response_time_ms, status_code, and records_returned for each check.</p>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#2563eb] px-5 text-sm font-bold text-[#ffffff] transition hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb] disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={submitting}
          >
            {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden="true" />}
            {submitting ? "Submitting checks…" : "Submit checks"}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {result && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800" role="status" aria-live="polite">
          <p className="font-bold">Batch processed</p>
          <p className="mt-1 mb-0 leading-6">
            {result.total_items} checks · {result.healthy_count} healthy · {result.anomalies_created} alerts created · {result.anomalies_updated} updated · {result.failed_items} failed
          </p>
        </div>
      )}
    </section>
  );
}
