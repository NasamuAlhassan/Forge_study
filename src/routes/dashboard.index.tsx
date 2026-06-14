import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/dashboard/Topbar";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { TodaysAgenda } from "@/components/dashboard/TodaysAgenda";
import { AIRecommendations } from "@/components/dashboard/AIRecommendations";
import { WeekCalendar } from "@/components/dashboard/WeekCalendar";
import { DailyCards } from "@/components/dashboard/DailyCards";
import { useSchedule } from "@/hooks/use-schedule";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardOverview,
});

function DashboardOverview() {
  const { user } = useAuth();
  const { events, subjects, hasData } = useSchedule();
  const name = (user?.user_metadata?.full_name as string) || user?.email?.split("@")[0] || "there";

  const calProps = { events: hasData ? events : [], subjects: hasData ? subjects : [] };

  return (
    <>
      <Topbar title={`Welcome back, ${name}`} subtitle="Here's your week at a glance." />
      <main className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <StatsGrid />
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          {/* min-w-0 prevents the grid cell from expanding beyond its allotted width on mobile */}
          <div className="min-w-0 overflow-hidden">
            <WeekCalendar {...calProps} />
          </div>
          <div className="space-y-6">
            <TodaysAgenda {...calProps} />
            <AIRecommendations />
          </div>
        </div>
        <DailyCards />
      </main>
    </>
  );
}
