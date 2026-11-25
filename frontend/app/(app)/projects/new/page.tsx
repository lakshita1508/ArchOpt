"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import { useToast } from "@/hooks/useToast";
import { setActiveProject } from "@/hooks/useActiveProject";
import { PageHeader } from "@/components/common/ui";
import ProjectForm, { EMPTY_PROJECT } from "@/components/projects/ProjectForm";
import BriefAssistant from "@/components/projects/BriefAssistant";
import type { ProjectData } from "@/types";

export default function NewProject() {
  const router = useRouter();
  const { notify } = useToast();
  const [initial, setInitial] = useState<ProjectData>(EMPTY_PROJECT);
  const [formKey, setFormKey] = useState(0);
  const [fromAi, setFromAi] = useState(false);
  return (
    <>
      <PageHeader title="Create project" subtitle="Define the plot, room requirements, spatial relationships and constraints." />
      <div className="mb-6"><BriefAssistant onExtracted={(d) => { setInitial(d); setFromAi(true); setFormKey((k) => k + 1); }} /></div>
      <ProjectForm key={formKey} initial={initial} submitLabel="Save project" onCancel={() => router.push("/projects")}
        banner={fromAi ? <div className="bg-secondary border border-line rounded p-3 text-sm">Requirements were extracted from your brief by AI. <b>Review and edit them below</b>, then press “Save project” to confirm.</div> : null}
        onSubmit={async (d) => { const p = await api.createProject(d); setActiveProject(p.id); notify("success", `Project “${p.name}” created.`); router.push(`/projects/${p.id}`); }} />
    </>
  );
}
