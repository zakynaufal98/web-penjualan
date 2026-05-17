const ACTIVITY_KEY = 'kukis-activity-log';
const MAX_ACTIVITIES = 80;

const canUseStorage = () => typeof window !== 'undefined' && window.localStorage;

export const getActivities = () => {
  if (!canUseStorage()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(ACTIVITY_KEY) || '[]');
  } catch {
    return [];
  }
};

export const addActivity = ({ type = 'info', title, description }) => {
  if (!canUseStorage() || !title) return;
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      title,
      description,
      createdAt: new Date().toISOString(),
    },
    ...getActivities(),
  ].slice(0, MAX_ACTIVITIES);
  window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
};
