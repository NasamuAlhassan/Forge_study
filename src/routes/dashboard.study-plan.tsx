import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/dashboard/Topbar";
import { StudyPlanGenerator } from "@/components/dashboard/StudyPlanGenerator";

export const Route = createFileRoute("/dashboard/study-plan")({
  component: StudyPlanPage,
});

function StudyPlanPage() {
  return (
    <>
      <Topbar title="AI study plan" subtitle="Personalized, balanced, and adaptive to your week." />
      <main className="p-4 sm:p-6">
        <StudyPlanGenerator />
      </main>
    </>
  );
}
