"use client";

import { useId, useMemo, useState } from "react";
import type { Project } from "./common";

export function ProjectSearchInput({ projects, value, onChange, disabled = false, ariaLabel }: { projects: Project[]; value: string; onChange: (projectId: string) => void; disabled?: boolean; ariaLabel: string }) {
  const listId = useId();
  const options = useMemo(() => [{ id: "", label: "Tanpa proyek" }, ...projects.map((project) => ({ id: project.id, label: `${project.code} - ${project.brand}` }))], [projects]);
  const selectedLabel = options.find((option) => option.id === value)?.label ?? "Tanpa proyek";
  const [draft, setDraft] = useState({ value, text: selectedLabel });
  const text = draft.value === value ? draft.text : selectedLabel;

  function matchOption(input: string) {
    return options.find((option) => option.label.toLocaleLowerCase("id-ID") === input.trim().toLocaleLowerCase("id-ID"));
  }

  return <>
    <input className="project-search-input" type="text" list={listId} value={text} disabled={disabled} aria-label={ariaLabel} autoComplete="off" placeholder="Ketik kode atau nama proyek" onChange={(event) => { const next = event.target.value; setDraft({ value, text: next }); const match = matchOption(next); if (match) { setDraft({ value: match.id, text: match.label }); onChange(match.id); } }} onBlur={() => { const match = matchOption(text); if (match) { setDraft({ value: match.id, text: match.label }); onChange(match.id); } else setDraft({ value, text: selectedLabel }); }} />
    <datalist id={listId}>{options.map((option) => <option key={option.id || "none"} value={option.label} />)}</datalist>
  </>;
}
