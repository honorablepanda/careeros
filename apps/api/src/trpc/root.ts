import { summaryRouter } from '../router/summary';
import { router } from './trpc';
import { trackerRouter } from './routers/tracker.router';
import { applicationsRouter } from './routers/applications.router';
import { networkingRouter } from './routers/networking.router';
import { resumeRouter } from './routers/resume.router';
import { roadmapRouter } from './routers/roadmap.router';
import { metricsRouter } from './routers/metrics.router';
import { achievementsRouter } from './routers/achievements.router';
import { plannerRouter } from './routers/planner.router';
import { skillsRouter } from './routers/skills.router';
import { notificationsRouter } from './routers/notifications.router';
import { calendarRouter } from './routers/calendar.router';
import { goalsRouter } from './routers/goals.router';
import { profileRouter } from './routers/profile.router';
import { settingsRouter } from './routers/settings.router';
export const appRouter = router({
  settings: settingsRouter,
  profile: profileRouter,
  goals: goalsRouter,
  calendar: calendarRouter,
  notifications: notificationsRouter,
  skills: skillsRouter,
  planner: plannerRouter,
  achievements: achievementsRouter,
  metrics: metricsRouter,
  roadmap: roadmapRouter,
  resume: resumeRouter,
  networking: networkingRouter,
  applications: applicationsRouter,
  tracker: trackerRouter,
});
export type AppRouter = typeof appRouter;
export { createContext } from './context';
export { trackerRouter } from './routers/tracker.router';

