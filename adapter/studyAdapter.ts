import {
  Task,
  CompletedSession,
  UserPreferences,
  ScheduleProposal,
  generateProposedWeeklySchedule
} from "../core/study/engine";

export function runStudyPlanning(
  tasks: Task[],
  completedSessions: CompletedSession[],
  preferences: UserPreferences,
  currentDay: number,
  pomodoroMinutes: number
): ScheduleProposal {
  return generateProposedWeeklySchedule(
    tasks,
    preferences,
    currentDay,
    pomodoroMinutes
  );
}
import { supabase } from "./supabaseClient";

async function loadCompletedStudySessions(
  userId: string
): Promise<CompletedSession[]> {
  const { data, error } = await supabase
    .from("events")
    .select("payload")
    .eq("user_id", userId)
    .eq("type", "study_completed_session");

  if (error || !data) return [];

  return data.map(row => row.payload as CompletedSession);
}
export async function runStudyPlanningFromDB(
  userId: string,
  tasks: Task[],
  preferences: UserPreferences,
  currentDay: number,
  pomodoroMinutes: number
): Promise<ScheduleProposal> {
  const completedSessions = await loadCompletedStudySessions(userId);

  return generateProposedWeeklySchedule(
    tasks,
    preferences,
    currentDay,
    pomodoroMinutes
  );
}
