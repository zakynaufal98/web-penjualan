export const todayInputValue = () => dateToInputValue(new Date());

export const dateToInputValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const currentTimeInputValue = () => timeInputValue(new Date());

export const timeInputValue = (date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const dateTimeInputToLocalISOString = (dateValue, timeValue) => {
  if (!dateValue) return new Date().toISOString();
  const safeTime = timeValue || '12:00';
  return new Date(`${dateValue}T${safeTime}:00`).toISOString();
};

export const dateInputToLocalISOString = (value) => {
  return dateTimeInputToLocalISOString(value, '12:00');
};

export const localDayRangeISO = (date) => {
  const d = typeof date === 'string' ? new Date(`${date}T12:00:00`) : new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
};

export const localWeekRangeISO = (weekStart) => {
  const start = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0);
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6, 23, 59, 59, 999);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
};
