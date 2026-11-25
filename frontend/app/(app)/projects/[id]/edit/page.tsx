"use client";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/hooks/useToast";
import { ErrorBox, PageHeader, Spinner } from "@/components/common/ui";
import ProjectForm from "@/components/projects/ProjectForm";

export default function EditProject() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const { data, error, loading, reload } = useAsync(() => api.project(id), [id]);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error || "Project not found"} onRetry={reload} />;
  return (
    <>
      <PageHeader title={`Edit “${data.name}”`} subtitle="Saving replaces the requirements. Existing layouts are kept but may no longer match — re-run the optimization afterwards." />
      <ProjectForm initial={data} submitLabel="Save changes" onCancel={() => router.push("/projects")}
        onSubmit={async (d) => { await api.updateProject(id, d); notify("success", "Project updated."); router.push(`/projects/${id}`); }} />
    </>
  );
}
