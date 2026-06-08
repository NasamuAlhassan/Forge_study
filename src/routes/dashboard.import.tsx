import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/dashboard/Topbar";
import { TimetableUploader } from "@/components/dashboard/TimetableUploader";

export const Route = createFileRoute("/dashboard/import")({
  component: ImportPage,
});

function ImportPage() {
  return (
    <>
      <Topbar
        title="Import timetable"
        subtitle="Upload a screenshot or PDF — Forge does the rest."
      />
      <main className="p-4 sm:p-6">
        <TimetableUploader />
      </main>
    </>
  );
}
