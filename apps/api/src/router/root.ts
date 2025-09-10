// apps/api/src/router/root.ts
import { router } from '../trpc';

import { authRouter } from './auth';
import { onboardingRouter } from './onboarding';
import { dashboardRouter } from './dashboard';
import { trackerRouter } from './tracker';
import { resumeRouter } from './resume';
import { settingsRouter } from './settings';
import { profileRouter } from './profile';
import { goalsRouter } from './goals';
import { plannerRouter } from './planner';
import { calendarRouter } from './calendar';
import { roadmapRouter } from './roadmap';
import { interviewsRouter } from './interviews';
import { activityRouter } from './activity';
import { notificationsRouter } from './notifications';
import { summaryRouter } from './summary';
import { skillsRouter } from './skills';
import { insightsRouter } from './insights';
import { metricsRouter } from './metrics';
import { achievementsRouter } from './achievements';
import { networkingRouter } from './networking';

export const appRouter = router({
        applications: applicationsRouter,
demo: DemoRouter,
system: systemRouter,
auth: authRouter,
  onboarding: onboardingRouter,
  dashboard: dashboardRouter,
  tracker: trackerRouter,
  resume: resumeRouter,
  settings: settingsRouter,
  profile: profileRouter,
  goals: goalsRouter,
  planner: plannerRouter,
  calendar: calendarRouter,
  roadmap: roadmapRouter,
  interviews: interviewsRouter,
  activity: activityRouter,
  notifications: notificationsRouter,
  summary: summaryRouter,
  skills: skillsRouter,
  insights: insightsRouter,
  metrics: metricsRouter,
  achievements: achievementsRouter,
  networking: networkingRouter,
});

export type AppRouter = typeof appRouter;
