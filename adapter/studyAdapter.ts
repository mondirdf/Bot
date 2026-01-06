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
