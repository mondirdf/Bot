# تصحيحات حرجة

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type TimeOfDay = 'dawn' | 'morning' | 'evening' | 'night';
type SlotType = 'unavailable' | 'not_preferred';
type DayStatus = 'on_track' | 'behind' | 'fatigued' | 'overperforming';
type RecommendationType = 
  | 'suggest_max_consecutive_pomodoros'
  | 'suggest_task_estimate_adjustment'
  | 'suggest_load_reduction';

type TimeSlot = {
  startMinutes: number;
  endMinutes: number;
};

type UnavailableSlot = {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  type: SlotType;
};

type UserPreferences = {
  sleepTimeMinutes: number;
  wakeTimeMinutes: number;
  preferredActivityTime: TimeOfDay;
  maxConsecutivePomodoros: number;
  unavailableSlots: UnavailableSlot[];
};

type Task = {
  id: string;
  name: string;
  estimatedHours: number;
  urgency: number;
  deadlineDayIndex: number | null;
};

type ScheduledSession = {
  id: string;
  taskId: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  sequenceNumber: number;
};

type CompletedSession = {
  taskId: string;
  durationMinutes: number;
  focusRating: number;
  dayOfWeek: number;
  timeOfDay: TimeOfDay;
  sequenceNumber?: number;
};

type DailyMetrics = {
  status: DayStatus;
  plannedMinutes: number;
  actualMinutes: number;
  adherenceScore: number;
  focusScore: number;
  adjustmentFactor: number;
};

type WeeklyMetrics = {
  plannedHours: number;
  actualHours: number;
  estimationAccuracy: number;
  averageFocus: number;
  bestFocusTime: TimeOfDay | null;
  worstFocusTime: TimeOfDay | null;
  fatigueIndicator: number;
  taskPerformance: TaskPerformance[];
};

type TaskPerformance = {
  taskId: string;
  estimatedHours: number;
  actualHours: number;
  averageFocus: number;
  efficiency: number;
};

type TimeBlock = {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  isPreferred: boolean;
};

type WeightedTimeBlock = TimeBlock & {
  weight: number;
};

type ScheduleProposal = {
  sessions: ScheduledSession[];
  totalPlannedHours: number;
  utilizationRate: number;
};

type Recommendation = {
  type: RecommendationType;
  value: number;
  confidence: number;
  reason: string;
};

type AnalysisOutput = {
  recommendations: Recommendation[];
};

type FocusProfile = {
  timeOfDayScores: Record<TimeOfDay, number>;
  sampleCount: number;
};

type RollingPlanningInput = {
  remainingTasks: Task[];
  completedSessions: CompletedSession[];
  previousScheduledSessions?: ScheduledSession[];
  preferences: UserPreferences;
  currentDay: number;
  pomodoroMinutes: number;
  weeklyMetrics: WeeklyMetrics;
};

// ═══════════════════════════════════════════════════════════════════════════
// TIME UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function getTimeOfDay(minutes: number): TimeOfDay {
  if (minutes >= 240 && minutes < 720) return 'dawn';
  if (minutes >= 720 && minutes < 1020) return 'morning';
  if (minutes >= 1020 && minutes < 1260) return 'evening';
  return 'night';
}

function calculateAvailableBlocks(
  dayOfWeek: number,
  preferences: UserPreferences,
  minSessionMinutes: number
): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  const daySlots = preferences.unavailableSlots.filter(s => s.dayOfWeek === dayOfWeek);
  
  const sortedSlots = [...daySlots].sort((a, b) => a.startMinutes - b.startMinutes);
  
  let currentStart = preferences.wakeTimeMinutes;
  const dayEnd = preferences.sleepTimeMinutes;
  
  for (const slot of sortedSlots) {
    if (slot.startMinutes > currentStart) {
      const duration = slot.startMinutes - currentStart;
      if (duration >= minSessionMinutes) {
        blocks.push({
          dayOfWeek,
          startMinutes: currentStart,
          endMinutes: slot.startMinutes,
          isPreferred: slot.type !== 'not_preferred'
        });
      }
    }
    currentStart = Math.max(currentStart, slot.endMinutes);
  }
  
  if (dayEnd > currentStart && (dayEnd - currentStart) >= minSessionMinutes) {
    blocks.push({
      dayOfWeek,
      startMinutes: currentStart,
      endMinutes: dayEnd,
      isPreferred: true
    });
  }
  
  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════
// FOCUS PROFILE & WEIGHTING
// ═══════════════════════════════════════════════════════════════════════════

function buildFocusProfile(completedSessions: CompletedSession[]): FocusProfile {
  const scores: Record<TimeOfDay, { sum: number; count: number }> = {
    dawn: { sum: 0, count: 0 },
    morning: { sum: 0, count: 0 },
    evening: { sum: 0, count: 0 },
    night: { sum: 0, count: 0 }
  };
  
  for (const session of completedSessions) {
    scores[session.timeOfDay].sum += session.focusRating;
    scores[session.timeOfDay].count++;
  }
  
  const normalized: Record<TimeOfDay, number> = {
    dawn: 0,
    morning: 0,
    evening: 0,
    night: 0
  };
  
  for (const [time, data] of Object.entries(scores)) {
    normalized[time as TimeOfDay] = data.count > 0 ? data.sum / data.count : 3.0;
  }
  
  return {
    timeOfDayScores: normalized,
    sampleCount: completedSessions.length
  };
}

function calculateBlockWeight(
  block: TimeBlock,
  focusProfile: FocusProfile,
  bestFocusTime: TimeOfDay | null
): number {
  let weight = 1.0;
  
  if (block.isPreferred) {
    weight *= 1.4;
  } else {
    weight *= 0.6;
  }
  
  const blockTime = getTimeOfDay(block.startMinutes);
  
  if (focusProfile.sampleCount >= 5) {
    const focusScore = focusProfile.timeOfDayScores[blockTime];
    const normalizedFocus = focusScore / 5.0;
    weight *= (0.7 + normalizedFocus * 0.6);
  }
  
  if (bestFocusTime && blockTime === bestFocusTime) {
    weight *= 1.3;
  }
  
  return weight;
}

function weightAndSortBlocks(
  blocks: TimeBlock[],
  focusProfile: FocusProfile,
  bestFocusTime: TimeOfDay | null
): WeightedTimeBlock[] {
  const weighted = blocks.map(block => ({
    ...block,
    weight: calculateBlockWeight(block, focusProfile, bestFocusTime)
  }));
  
  return weighted.sort((a, b) => b.weight - a.weight);
}

// ═══════════════════════════════════════════════════════════════════════════
// FATIGUE & ADJUSTMENT
// ═══════════════════════════════════════════════════════════════════════════

function applyAdjustmentFactorToCapacity(
  totalAvailableMinutes: number,
  dailyMetrics: DailyMetrics[],
  fatigueIndicator: number
): number {
  const avgAdjustment = dailyMetrics.reduce((sum, m) => sum + m.adjustmentFactor, 0) / 
                        Math.max(dailyMetrics.length, 1);
  
  let capacityMultiplier = avgAdjustment;
  
  if (fatigueIndicator > 0.3) {
    capacityMultiplier *= (1 - fatigueIndicator * 0.3);
  }
  
  capacityMultiplier = Math.max(0.5, Math.min(1.0, capacityMultiplier));
  
  const fatigueMargin = 0.75;
  return totalAvailableMinutes * fatigueMargin * capacityMultiplier;
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION BREAK LOGIC
// ═══════════════════════════════════════════════════════════════════════════

function shouldInsertBreak(
  consecutiveCount: number,
  maxConsecutive: number,
  blockRemainingMinutes: number,
  pomodoroMinutes: number
): { insert: boolean; breakMinutes: number } {
  if (consecutiveCount < maxConsecutive) {
    return { insert: false, breakMinutes: 0 };
  }
  
  const breakMinutes = Math.round(pomodoroMinutes * 0.4);
  
  if (blockRemainingMinutes >= breakMinutes) {
    return { insert: true, breakMinutes };
  }
  
  return { insert: false, breakMinutes: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK PRIORITIZATION
// ═══════════════════════════════════════════════════════════════════════════

function calculateTaskPriority(task: Task, currentDay: number): number {
  let score = task.urgency * 100;
  
  if (task.deadlineDayIndex !== null) {
    const daysUntilDeadline = task.deadlineDayIndex - currentDay;
    if (daysUntilDeadline > 0) {
      score += (1 / daysUntilDeadline) * 500;
    } else {
      score += 10000;
    }
  }
  
  score += task.estimatedHours * 10;
  
  return score;
}

function sortTasksByPriority(tasks: Task[], currentDay: number): Task[] {
  return [...tasks].sort((a, b) => 
    calculateTaskPriority(b, currentDay) - calculateTaskPriority(a, currentDay)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateProposedWeeklySchedule(
  tasks: Task[],
  preferences: UserPreferences,
  currentDay: number,
  pomodoroMinutes: number
): ScheduleProposal {
  const completedSessions: CompletedSession[] = [];
  return generateProposedWeeklyScheduleWithHistory(
    tasks,
    preferences,
    currentDay,
    pomodoroMinutes,
    completedSessions,
    []
  );
}

function generateProposedWeeklyScheduleWithHistory(
  tasks: Task[],
  preferences: UserPreferences,
  currentDay: number,
  pomodoroMinutes: number,
  completedSessions: CompletedSession[],
  dailyMetrics: DailyMetrics[]
): ScheduleProposal {
  const sessions: ScheduledSession[] = [];
  const sortedTasks = sortTasksByPriority(tasks, currentDay);
  
  const focusProfile = buildFocusProfile(completedSessions);
  
  const weeklyMetrics = completedSessions.length > 0
    ? calculateWeeklyMetrics(tasks, [], completedSessions)
    : null;
  
  const bestFocusTime = weeklyMetrics?.bestFocusTime || null;
  
  const weekBlocks: WeightedTimeBlock[][] = [];
  for (let day = 0; day < 7; day++) {
    const rawBlocks = calculateAvailableBlocks(day, preferences, pomodoroMinutes);
    const weighted = weightAndSortBlocks(rawBlocks, focusProfile, bestFocusTime);
    weekBlocks.push(weighted);
  }
  
  const totalAvailableMinutes = weekBlocks.flat().reduce(
    (sum, block) => sum + (block.endMinutes - block.startMinutes), 0
  );
  
  const fatigueIndicator = weeklyMetrics?.fatigueIndicator || 0;
  const maxUsableMinutes = applyAdjustmentFactorToCapacity(
    totalAvailableMinutes,
    dailyMetrics,
    fatigueIndicator
  );
  
  let usedMinutes = 0;
  let sessionId = 0;
  
  const taskConsecutiveCounts = new Map<string, number>();
  
  for (const task of sortedTasks) {
    const taskMinutes = task.estimatedHours * 60;
    const sessionsNeeded = Math.ceil(taskMinutes / pomodoroMinutes);
    
    let sessionsScheduled = 0;
    
    for (let day = 0; day < 7 && sessionsScheduled < sessionsNeeded; day++) {
      const blocks = weekBlocks[day];
      
      for (const block of blocks) {
        if (sessionsScheduled >= sessionsNeeded) break;
        if (usedMinutes >= maxUsableMinutes) break;
        
        let blockCursor = block.startMinutes;
        let consecutiveCount = taskConsecutiveCounts.get(task.id) || 0;
        
        while (blockCursor + pomodoroMinutes <= block.endMinutes && 
               sessionsScheduled < sessionsNeeded &&
               usedMinutes < maxUsableMinutes) {
          
          const blockRemaining = block.endMinutes - blockCursor;
          const breakCheck = shouldInsertBreak(
            consecutiveCount,
            preferences.maxConsecutivePomodoros,
            blockRemaining,
            pomodoroMinutes
          );
          
          if (breakCheck.insert) {
            blockCursor += breakCheck.breakMinutes;
            consecutiveCount = 0;
            taskConsecutiveCounts.set(task.id, 0);
            
            if (blockCursor + pomodoroMinutes > block.endMinutes) {
              break;
            }
          }
          
          sessions.push({
            id: `session_${sessionId++}`,
            taskId: task.id,
            dayOfWeek: day,
            startMinutes: blockCursor,
            endMinutes: blockCursor + pomodoroMinutes,
            sequenceNumber: consecutiveCount
          });
          
          blockCursor += pomodoroMinutes;
          sessionsScheduled++;
          consecutiveCount++;
          taskConsecutiveCounts.set(task.id, consecutiveCount);
          usedMinutes += pomodoroMinutes;
        }
        
        taskConsecutiveCounts.set(task.id, 0);
      }
    }
  }
  
  return {
    sessions,
    totalPlannedHours: usedMinutes / 60,
    utilizationRate: usedMinutes / maxUsableMinutes
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLLING PLANNING
// ═══════════════════════════════════════════════════════════════════════════

function generateRollingPlan(input: RollingPlanningInput): ScheduleProposal {
  const completedTaskIds = new Set(input.completedSessions.map(s => s.taskId));
  
  const taskProgress = new Map<string, number>();
  for (const session of input.completedSessions) {
    const current = taskProgress.get(session.taskId) || 0;
    taskProgress.set(session.taskId, current + session.durationMinutes / 60);
  }
  
  const adjustedTasks = input.remainingTasks.map(task => {
    const hoursCompleted = taskProgress.get(task.id) || 0;
    const remainingHours = Math.max(0, task.estimatedHours - hoursCompleted);
    
    return {
      ...task,
      estimatedHours: remainingHours
    };
  }).filter(task => task.estimatedHours > 0);
  
  const previousSessions = input.previousScheduledSessions || [];
  
  const dailyMetrics: DailyMetrics[] = [];
  for (let day = 0; day < 7; day++) {
    const metrics = calculateDailyMetricsForRolling(
      day,
      previousSessions,
      input.completedSessions
    );
    dailyMetrics.push(metrics);
  }
  
  return generateProposedWeeklyScheduleWithHistory(
    adjustedTasks,
    input.preferences,
    input.currentDay,
    input.pomodoroMinutes,
    input.completedSessions,
    dailyMetrics
  );
}

function calculateDailyMetricsForRolling(
  dayOfWeek: number,
  previousScheduledSessions: ScheduledSession[],
  completedSessions: CompletedSession[]
): DailyMetrics {
  const daySessions = previousScheduledSessions.filter(s => s.dayOfWeek === dayOfWeek);
  const actualMinutes = completedSessions
    .filter(s => s.dayOfWeek === dayOfWeek)
    .reduce((sum, s) => sum + s.durationMinutes, 0);
  
  let plannedMinutes = daySessions.reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0);
  
  if (plannedMinutes === 0 && actualMinutes > 0) {
    plannedMinutes = actualMinutes;
  }
  
  const adherenceScore = plannedMinutes > 0 ? Math.min(actualMinutes / plannedMinutes, 1.5) : 1.0;
  
  const focusSum = completedSessions
    .filter(s => s.dayOfWeek === dayOfWeek)
    .reduce((sum, s) => sum + s.focusRating, 0);
  const focusCount = completedSessions.filter(s => s.dayOfWeek === dayOfWeek).length;
  const focusScore = focusCount > 0 ? focusSum / (focusCount * 5) : 0.8;
  
  let status: DayStatus = 'on_track';
  if (adherenceScore < 0.5 || focusScore < 0.4) {
    status = 'fatigued';
  } else if (adherenceScore < 0.75) {
    status = 'behind';
  } else if (adherenceScore > 1.1) {
    status = 'overperforming';
  }
  
  let adjustmentFactor = 1.0;
  if (status === 'fatigued') {
    adjustmentFactor = 0.7;
  } else if (status === 'behind' && focusScore > 0.6) {
    adjustmentFactor = 0.9;
  }
  
  return {
    status,
    plannedMinutes,
    actualMinutes,
    adherenceScore,
    focusScore,
    adjustmentFactor
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY METRICS
// ═══════════════════════════════════════════════════════════════════════════

function calculateDailyMetrics(
  dayOfWeek: number,
  scheduledSessions: ScheduledSession[],
  completedSessions: CompletedSession[]
): DailyMetrics {
  const daySessions = scheduledSessions.filter(s => s.dayOfWeek === dayOfWeek);
  const plannedMinutes = daySessions.reduce((sum, s) => sum + (s.endMinutes - s.startMinutes), 0);
  
  const actualMinutes = completedSessions
    .filter(s => s.dayOfWeek === dayOfWeek)
    .reduce((sum, s) => sum + s.durationMinutes, 0);
  
  const adherenceScore = plannedMinutes > 0 ? actualMinutes / plannedMinutes : 0;
  
  const focusSum = completedSessions
    .filter(s => s.dayOfWeek === dayOfWeek)
    .reduce((sum, s) => sum + s.focusRating, 0);
  const focusCount = completedSessions.filter(s => s.dayOfWeek === dayOfWeek).length;
  const focusScore = focusCount > 0 ? focusSum / (focusCount * 5) : 0;
  
  let status: DayStatus = 'on_track';
  if (adherenceScore < 0.5 || focusScore < 0.4) {
    status = 'fatigued';
  } else if (adherenceScore < 0.75) {
    status = 'behind';
  } else if (adherenceScore > 1.1) {
    status = 'overperforming';
  }
  
  let adjustmentFactor = 1.0;
  if (status === 'fatigued') {
    adjustmentFactor = 0.7;
  } else if (status === 'behind' && focusScore > 0.6) {
    adjustmentFactor = 0.9;
  }
  
  return {
    status,
    plannedMinutes,
    actualMinutes,
    adherenceScore,
    focusScore,
    adjustmentFactor
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY METRICS
// ═══════════════════════════════════════════════════════════════════════════

function calculateWeeklyMetrics(
  tasks: Task[],
  scheduledSessions: ScheduledSession[],
  completedSessions: CompletedSession[]
): WeeklyMetrics {
  const plannedHours = scheduledSessions.reduce(
    (sum, s) => sum + (s.endMinutes - s.startMinutes) / 60, 0
  );
  
  const actualHours = completedSessions.reduce(
    (sum, s) => sum + s.durationMinutes / 60, 0
  );
  
  const estimationAccuracy = plannedHours > 0
    ? Math.min(actualHours / plannedHours, 2)
    : 0;
  
  const totalFocus = completedSessions.reduce((sum, s) => sum + s.focusRating, 0);
  const averageFocus = completedSessions.length > 0 ? totalFocus / completedSessions.length : 0;
  
  const focusByTime: Record<TimeOfDay, { sum: number; count: number }> = {
    dawn: { sum: 0, count: 0 },
    morning: { sum: 0, count: 0 },
    evening: { sum: 0, count: 0 },
    night: { sum: 0, count: 0 }
  };
  
  for (const session of completedSessions) {
    focusByTime[session.timeOfDay].sum += session.focusRating;
    focusByTime[session.timeOfDay].count++;
  }
  
  let bestFocusTime: TimeOfDay | null = null;
  let worstFocusTime: TimeOfDay | null = null;
  let maxAvg = 0;
  let minAvg = 6;
  
  for (const [time, data] of Object.entries(focusByTime)) {
    if (data.count > 0) {
      const avg = data.sum / data.count;
      if (avg > maxAvg) {
        maxAvg = avg;
        bestFocusTime = time as TimeOfDay;
      }
      if (avg < minAvg) {
        minAvg = avg;
        worstFocusTime = time as TimeOfDay;
      }
    }
  }
  
  const dailyAdherence: number[] = [];
  for (let day = 0; day < 7; day++) {
    const dayMetrics = calculateDailyMetrics(day, scheduledSessions, completedSessions);
    dailyAdherence.push(dayMetrics.adherenceScore);
  }
  
  const avgAdherence = dailyAdherence.reduce((a, b) => a + b, 0) / dailyAdherence.length;
  const fatigueIndicator = avgAdherence < 0.6 ? 1 - avgAdherence : 0;
  
  const taskPerformance: TaskPerformance[] = tasks.map(task => {
    const taskSessions = completedSessions.filter(s => s.taskId === task.id);
    const actualHours = taskSessions.reduce((sum, s) => sum + s.durationMinutes / 60, 0);
    const avgFocus = taskSessions.length > 0
      ? taskSessions.reduce((sum, s) => sum + s.focusRating, 0) / taskSessions.length
      : 0;
    
    const efficiency = task.estimatedHours > 0 && actualHours > 0
      ? (avgFocus / 5) * (task.estimatedHours / actualHours)
      : 0;
    
    return {
      taskId: task.id,
      estimatedHours: task.estimatedHours,
      actualHours,
      averageFocus: avgFocus,
      efficiency
    };
  });
  
  return {
    plannedHours,
    actualHours,
    estimationAccuracy,
    averageFocus,
    bestFocusTime,
    worstFocusTime,
    fatigueIndicator,
    taskPerformance
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS
//═══════════════════════════════════════════════════════════════════════════  
  
function analyzeConsecutiveSessionsPattern(  
  completedSessions: CompletedSession[],  
  currentMax: number  
): Recommendation {  
  const sessionsBySequence: Record<number, number[]> = {};  
    
  for (const session of completedSessions) {  
    if (session.sequenceNumber === undefined) continue;  
  
    const seq = session.sequenceNumber;  
    if (!sessionsBySequence[seq]) sessionsBySequence[seq] = [];  
    sessionsBySequence[seq].push(session.focusRating);  
  }  
    
  const avgBySequence: Record<number, number> = {};  
  for (const [seq, ratings] of Object.entries(sessionsBySequence)) {  
    avgBySequence[seq] = ratings.reduce((a, b) => a + b, 0) / ratings.length;  
  }  
    
  let dropoffPoint = currentMax;  
  for (let i = 1; i < currentMax; i++) {  
    if (avgBySequence[i] && avgBySequence[i - 1]) {  
      if (avgBySequence[i] < avgBySequence[i - 1] * 0.75) {  
        dropoffPoint = i;  
        break;  
      }  
    }  
  }  
    
  const suggestedValue = Math.max(1, Math.min(dropoffPoint, currentMax));  
  const confidence = completedSessions.length >= 10 ? 0.8 : 0.5;  
    
  return {  
    type: 'suggest_max_consecutive_pomodoros',  
    value: suggestedValue,  
    confidence,  
    reason: 'focus_pattern_analysis'  
  };  
}  
  
function analyzeTaskEstimationAccuracy(  
  taskPerformance: TaskPerformance[]  
): Recommendation[] {  
  const recommendations: Recommendation[] = [];  
    
  for (const perf of taskPerformance) {  
    if (perf.actualHours > 0) {  
      const ratio = perf.actualHours / perf.estimatedHours;  
      const focusFactor = perf.averageFocus / 5;  
        
      let adjustmentMultiplier = 1.0;  
      let confidence = 0.5;  
        
      if (focusFactor < 0.6) {  
        adjustmentMultiplier = ratio * 1.2;  
        confidence = 0.7;  
      } else if (ratio > 1.2) {  
        adjustmentMultiplier = ratio;  
        confidence = 0.8;  
      } else if (ratio < 0.8) {  
        adjustmentMultiplier = ratio;  
        confidence = 0.6;  
      }  
        
      if (adjustmentMultiplier !== 1.0) {  
        recommendations.push({  
          type: 'suggest_task_estimate_adjustment',  
          value: adjustmentMultiplier,  
          confidence,  
          reason: perf.taskId  
        });  
      }  
    }  
  }  
    
  return recommendations;  
}  
  
function analyzeLoadReduction(  
  weeklyMetrics: WeeklyMetrics,  
  dailyMetrics: DailyMetrics[]  
): Recommendation | null {  
  const criticalFatigue = weeklyMetrics.fatigueIndicator > 0.5;  
  const lowFocus = weeklyMetrics.averageFocus < 2.5;  
  const consistentlyBehind = dailyMetrics.filter(m => m.status === 'behind' || m.status === 'fatigued').length >= 4;  
    
  if (criticalFatigue || (lowFocus && consistentlyBehind)) {  
    const reductionFactor = 0.7 + (weeklyMetrics.averageFocus / 5) * 0.15;  
      
    return {  
      type: 'suggest_load_reduction',  
      value: reductionFactor,  
      confidence: criticalFatigue ? 0.9 : 0.7,  
      reason: 'sustained_fatigue_pattern'  
    };  
  }  
    
  return null;  
}  
  
function generateWeeklyAnalysis(  
  completedSessions: CompletedSession[],  
  taskPerformance: TaskPerformance[],  
  currentMaxConsecutive: number,  
  weeklyMetrics: WeeklyMetrics,  
  dailyMetrics: DailyMetrics[]  
): AnalysisOutput {  
  const recommendations: Recommendation[] = [];  
    
  const consecutiveRec = analyzeConsecutiveSessionsPattern(completedSessions, currentMaxConsecutive);  
  recommendations.push(consecutiveRec);  
    
  const taskRecs = analyzeTaskEstimationAccuracy(taskPerformance);  
  recommendations.push(...taskRecs);  
    
  const loadRec = analyzeLoadReduction(weeklyMetrics, dailyMetrics);  
if (loadRec) {  
recommendations.push(loadRec);  
}  
return { recommendations };  
}  
  
