export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];
export type ClassType = "Theory" | "Practical" | "Other";
export type AttendanceStatus = "present" | "absent";

export type Semester = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
};

export type SubjectRecord = {
  id: string;
  name: string;
  type: ClassType;
  attended: number;
  delivered: number;
};

export type TimetableEntry = {
  id: string;
  subjectId: string;
  day: Weekday;
  startTime: string;
  endTime: string;
  room: string;
};

export type AttendanceEvent = {
  id: string;
  date: string;
  timetableEntryId: string;
  subjectId: string;
  status: AttendanceStatus;
  timestamp: string;
  source: string;
  subjectName?: string;
  classType?: ClassType;
  startTime?: string;
  endTime?: string;
  room?: string;
};

export type SavedTrip = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export type AppState = {
  schemaVersion: 1;
  semester: Semester | null;
  subjects: SubjectRecord[];
  timetable: TimetableEntry[];
  events: AttendanceEvent[];
  holidays: {
    date: string;
    name: string;
  }[];
  savedTrips: SavedTrip[];
  threshold: number;
  warningMargin: number;
};

export type AttendanceMetrics = {
  attended: number;
  delivered: number;
  percentage: number | null;
  status: "safe" | "warning" | "critical" | "not-started";
  safeBunks: number | null;
  recoveryRequired: number | null;
};

export type ClassOccurrence = {
  date: string;
  day: Weekday;
  entry: TimetableEntry;
  subject: SubjectRecord;
};

export type ImportPreview = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  subjects: SubjectRecord[];
  entries: TimetableEntry[];
  duplicateEntryIndexes: number[];
  dayCounts: Record<Weekday, number>;
  subjectCount: number;
  classCount: number;
};

export type TripSubjectProjection = {
  subject: SubjectRecord;
  beforeTripClasses: number;
  tripMisses: number;
  before: { attended: number; delivered: number; percentage: number | null };
  after: { attended: number; delivered: number; percentage: number | null };
  attendAll: { attended: number; delivered: number; percentage: number | null };
  recoveryRequired: number | null;
  status: "safe" | "warning" | "critical" | "not-started";
};

export type TripProjection = {
  startDate: string;
  endDate: string;
  timeline: ClassOccurrence[];
  beforeTrip: ClassOccurrence[];
  duringTrip: ClassOccurrence[];
  holidays: { date: string; name: string }[];
  subjects: TripSubjectProjection[];
  overallBefore: {
    attended: number;
    delivered: number;
    percentage: number | null;
  };
  overallAfter: {
    attended: number;
    delivered: number;
    percentage: number | null;
  };
  overallAttendAll: {
    attended: number;
    delivered: number;
    percentage: number | null;
  };
  warningSubjects: string[];
};

export const STORAGE_KEY = "attendly.app.v1";

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `attendly-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyState(): AppState {
  return {
    schemaVersion: 1,
    semester: null,
    subjects: [],
    timetable: [],
    events: [],
    holidays: [],
    savedTrips: [],
    threshold: 75,
    warningMargin: 5,
  };
}

export function isWeekday(value: unknown): value is Weekday {
  return (
    typeof value === "string" &&
    WEEKDAYS.some((day) => day.toLowerCase() === value.toLowerCase())
  );
}

export function normalizeWeekday(value: string): Weekday | null {
  return (
    WEEKDAYS.find((day) => day.toLowerCase() === value.trim().toLowerCase()) ??
    null
  );
}

export function weekdayForDate(dateString: string): Weekday {
  const date = parseLocalDate(dateString);
  const sundayFirst = date.getDay();
  return WEEKDAYS[(sundayFirst + 6) % 7];
}

export function parseTimeToMinutes(value: string): number | null {
  const input = value.trim();
  const match = input.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "PM" ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

export function formatTime(value: string): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return value;
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hours < 12 ? "AM" : "PM";
  const displayHours = hours % 12 || 12;
  return `${String(displayHours).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function sortEntries<T extends Pick<TimetableEntry, "startTime">>(
  entries: T[],
): T[] {
  return [...entries].sort(
    (a, b) =>
      (parseTimeToMinutes(a.startTime) ?? 0) -
      (parseTimeToMinutes(b.startTime) ?? 0),
  );
}

export function splitSubjectName(rawName: string): {
  name: string;
  type: ClassType;
} {
  const cleaned = rawName.trim();
  const suffix = cleaned.match(/(?:\s+|-)(PP|PR)$/i);
  if (!suffix) return { name: cleaned, type: "Other" };
  const name = cleaned
    .slice(0, suffix.index)
    .trim()
    .replace(/[-\s]+$/, "");
  return {
    name: name || cleaned,
    type: suffix[1].toUpperCase() === "PP" ? "Theory" : "Practical",
  };
}

export function formatPercentage(
  value: number | null,
  fractionDigits = 2,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(fractionDigits)}%`;
}

export function attendancePercentage(
  attended: number,
  delivered: number,
): number | null {
  if (delivered === 0) return null;
  return (attended / delivered) * 100;
}

export function countSafeBunks(
  attended: number,
  delivered: number,
  threshold: number,
): number | null {
  if (
    delivered === 0 ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    threshold > 100
  )
    return null;
  const extra = Math.floor((attended * 100) / threshold - delivered + 1e-9);
  return Math.max(0, extra);
}

export function countRecoveryClasses(
  attended: number,
  delivered: number,
  threshold: number,
): number | null {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100)
    return null;
  if (delivered === 0 || (attended === delivered && attended === 0)) return 0;
  const percentage = attendancePercentage(attended, delivered);
  if (percentage !== null && percentage >= threshold) return 0;
  if (threshold === 100) return null;
  return Math.max(
    0,
    Math.ceil(
      (threshold * delivered - 100 * attended) / (100 - threshold) - 1e-10,
    ),
  );
}

export function attendanceStatus(
  attended: number,
  delivered: number,
  threshold: number,
  warningMargin = 5,
): AttendanceMetrics["status"] {
  const percentage = attendancePercentage(attended, delivered);
  if (percentage === null) return "not-started";
  if (percentage < threshold) return "critical";
  if (percentage < Math.min(100, threshold + Math.max(0, warningMargin)))
    return "warning";
  return "safe";
}

export function getAttendanceMetrics(
  attended: number,
  delivered: number,
  threshold: number,
  warningMargin = 5,
): AttendanceMetrics {
  return {
    attended,
    delivered,
    percentage: attendancePercentage(attended, delivered),
    status: attendanceStatus(attended, delivered, threshold, warningMargin),
    safeBunks: countSafeBunks(attended, delivered, threshold),
    recoveryRequired: countRecoveryClasses(attended, delivered, threshold),
  };
}

export function aggregateAttendance(
  records: Pick<SubjectRecord, "attended" | "delivered">[],
) {
  const attended = records.reduce((sum, record) => sum + record.attended, 0);
  const delivered = records.reduce((sum, record) => sum + record.delivered, 0);
  return {
    attended,
    delivered,
    percentage: attendancePercentage(attended, delivered),
  };
}

export function getRecordMetrics(
  record: SubjectRecord,
  state: Pick<AppState, "threshold" | "warningMargin">,
) {
  return getAttendanceMetrics(
    record.attended,
    record.delivered,
    state.threshold,
    state.warningMargin,
  );
}

function emptyDayCounts(): Record<Weekday, number> {
  return {
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
    Sunday: 0,
  };
}

function duplicateKey(
  entry: Pick<
    TimetableEntry,
    "subjectId" | "day" | "startTime" | "endTime" | "room"
  >,
) {
  return [
    entry.subjectId.toLocaleLowerCase(),
    entry.day.toLocaleLowerCase(),
    (parseTimeToMinutes(entry.startTime) ?? entry.startTime).toString(),
    (parseTimeToMinutes(entry.endTime) ?? entry.endTime).toString(),
    entry.room.trim().toLocaleLowerCase(),
  ].join("|");
}

export function findDuplicateEntryIndexes(entries: TimetableEntry[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  entries.forEach((entry, index) => {
    const key = duplicateKey(entry);
    if (seen.has(key)) duplicates.push(index);
    else seen.add(key);
  });
  return duplicates;
}

export function findExistingDuplicates(
  existing: TimetableEntry[],
  incoming: TimetableEntry[],
): number[] {
  const known = new Set(existing.map(duplicateKey));
  return incoming.flatMap((entry, index) => {
    const key = duplicateKey(entry);
    if (known.has(key)) return [index];
    known.add(key);
    return [];
  });
}

export function isDuplicateEntry(
  existing: TimetableEntry[],
  candidate: TimetableEntry,
  editingId?: string,
): boolean {
  return findExistingDuplicates(
    existing.filter((entry) => entry.id !== editingId),
    [candidate],
  ).includes(0);
}

export function parseTimetableImport(jsonText: string): ImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const subjects: SubjectRecord[] = [];
  const entries: TimetableEntry[] = [];
  const dayCounts = emptyDayCounts();
  let data: unknown;

  try {
    data = JSON.parse(jsonText);
  } catch {
    return {
      valid: false,
      errors: ["This file is not valid JSON. Check the file and try again."],
      warnings,
      subjects,
      entries,
      duplicateEntryIndexes: [],
      dayCounts,
      subjectCount: 0,
      classCount: 0,
    };
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("subjects" in data) ||
    !Array.isArray(data.subjects)
  ) {
    return {
      valid: false,
      errors: ['The JSON must contain a "subjects" array.'],
      warnings,
      subjects,
      entries,
      duplicateEntryIndexes: [],
      dayCounts,
      subjectCount: 0,
      classCount: 0,
    };
  }

  const subjectByName = new Map<string, SubjectRecord>();
  data.subjects.forEach((rawSubject, subjectIndex) => {
    const subjectLabel = `Subject ${subjectIndex + 1}`;
    if (!rawSubject || typeof rawSubject !== "object") {
      errors.push(`${subjectLabel} must be an object.`);
      return;
    }
    const item = rawSubject as { name?: unknown; schedules?: unknown };
    if (typeof item.name !== "string" || !item.name.trim()) {
      errors.push(`${subjectLabel} needs a non-empty name.`);
      return;
    }
    const subjectName = item.name.trim();
    const split = splitSubjectName(subjectName);
    const canonicalName = split.name.toLocaleLowerCase();
    const canonicalKey = `${canonicalName}|${split.type.toLocaleLowerCase()}`;
    let subject = subjectByName.get(canonicalKey);
    if (!subject) {
      subject = {
        id: createId(),
        name: split.name,
        type: split.type,
        attended: 0,
        delivered: 0,
      };
      subjectByName.set(canonicalKey, subject);
      subjects.push(subject);
    }

    if (!Array.isArray(item.schedules)) {
      errors.push(`"${subjectName}" needs a schedules array.`);
      return;
    }
    item.schedules.forEach((rawSchedule, scheduleIndex) => {
      const scheduleLabel = `"${subjectName}", schedule ${scheduleIndex + 1}`;
      if (!rawSchedule || typeof rawSchedule !== "object") {
        errors.push(`${scheduleLabel} must be an object.`);
        return;
      }
      const schedule = rawSchedule as { day?: unknown; classTimes?: unknown };
      const day =
        typeof schedule.day === "string"
          ? normalizeWeekday(schedule.day)
          : null;
      if (!day) {
        errors.push(
          `${scheduleLabel} has an invalid day. Use Monday through Sunday.`,
        );
        return;
      }
      if (!Array.isArray(schedule.classTimes)) {
        errors.push(`${scheduleLabel} needs a classTimes array.`);
        return;
      }
      schedule.classTimes.forEach((rawClassTime, classIndex) => {
        const classLabel = `${scheduleLabel}, class ${classIndex + 1}`;
        if (!rawClassTime || typeof rawClassTime !== "object") {
          errors.push(`${classLabel} must be an object.`);
          return;
        }
        const classTime = rawClassTime as {
          startTime?: unknown;
          endTime?: unknown;
          roomNumber?: unknown;
          room?: unknown;
        };
        if (
          typeof classTime.startTime !== "string" ||
          parseTimeToMinutes(classTime.startTime) === null
        ) {
          errors.push(`${classLabel} has an invalid start time.`);
          return;
        }
        if (
          typeof classTime.endTime !== "string" ||
          parseTimeToMinutes(classTime.endTime) === null
        ) {
          errors.push(`${classLabel} has an invalid end time.`);
          return;
        }
        if (
          parseTimeToMinutes(classTime.endTime)! <=
          parseTimeToMinutes(classTime.startTime)!
        ) {
          errors.push(`${classLabel} must end after it starts.`);
          return;
        }
        const roomValue = classTime.roomNumber ?? classTime.room ?? "";
        if (roomValue && typeof roomValue !== "string") {
          errors.push(
            `${classLabel} has an invalid room; use text or leave it blank.`,
          );
          return;
        }
        entries.push({
          id: createId(),
          subjectId: subject.id,
          day,
          startTime: formatTime(classTime.startTime),
          endTime: formatTime(classTime.endTime),
          room: typeof roomValue === "string" ? roomValue.trim() : "",
        });
        dayCounts[day] += 1;
      });
    });
  });

  const duplicateEntryIndexes = findDuplicateEntryIndexes(entries);
  if (duplicateEntryIndexes.length > 0) {
    warnings.push(
      `${duplicateEntryIndexes.length} duplicate class ${duplicateEntryIndexes.length === 1 ? "entry was" : "entries were"} found in this file.`,
    );
  }
  if (entries.some((entry) => !entry.room)) {
    warnings.push(
      "Some classes do not have a room. You can add one after importing.",
    );
  }
  if (entries.length === 0 && errors.length === 0) {
    warnings.push("This timetable contains no class periods.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    subjects,
    entries,
    duplicateEntryIndexes,
    dayCounts,
    subjectCount: subjects.length,
    classCount: entries.length,
  };
}

export function createSemester(
  name = "Current semester",
  startDate?: string,
  endDate?: string,
): Semester {
  return {
    id: createId(),
    name: name.trim() || "Current semester",
    startDate,
    endDate,
  };
}

export function sortWeeklyTimetable(
  entries: TimetableEntry[],
): Record<Weekday, TimetableEntry[]> {
  const grouped: Record<Weekday, TimetableEntry[]> = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  };
  for (const entry of entries) grouped[entry.day].push(entry);
  for (const day of WEEKDAYS) grouped[day] = sortEntries(grouped[day]);
  return grouped;
}

export function getClassesForDate(
  entries: TimetableEntry[],
  subjects: SubjectRecord[],
  date: string,
): ClassOccurrence[] {
  const day = weekdayForDate(date);
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  return sortEntries(
    entries.filter(
      (entry) => entry.day === day && subjectMap.has(entry.subjectId),
    ),
  ).flatMap((entry) => {
    const subject = subjectMap.get(entry.subjectId);
    return subject ? [{ date, day, entry, subject }] : [];
  });
}

export function parseLocalDate(dateString: string): Date {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(Number.NaN);
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return new Date(Number.NaN);
  }
  return date;
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayDateString(): string {
  return toLocalDateString(new Date());
}

export function enumerateOccurrences(
  entries: TimetableEntry[],
  subjects: SubjectRecord[],
  startDate: string,
  endDate: string,
): ClassOccurrence[] {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start > end
  )
    return [];
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const dayEntryMap = new Map<Weekday, TimetableEntry[]>();
  for (const day of WEEKDAYS) dayEntryMap.set(day, []);
  for (const entry of entries) dayEntryMap.get(entry.day)?.push(entry);
  for (const day of WEEKDAYS)
    dayEntryMap.set(day, sortEntries(dayEntryMap.get(day) ?? []));

  const result: ClassOccurrence[] = [];
  const cursor = new Date(start);
  let safety = 0;
  while (cursor <= end && safety < 3661) {
    const date = toLocalDateString(cursor);
    const day = weekdayForDate(date);
    for (const entry of dayEntryMap.get(day) ?? []) {
      const subject = subjectMap.get(entry.subjectId);
      if (subject) result.push({ date, day, entry, subject });
    }
    cursor.setDate(cursor.getDate() + 1);
    safety += 1;
  }
  return result;
}

function copyState(state: AppState): AppState {
  return {
    ...state,
    semester: state.semester ? { ...state.semester } : null,
    subjects: state.subjects.map((subject) => ({ ...subject })),
    timetable: state.timetable.map((entry) => ({ ...entry })),
    events: state.events.map((event) => ({ ...event })),
  };
}

export function validateAttendanceCounts(
  attended: number,
  delivered: number,
): string | null {
  if (!Number.isInteger(attended) || !Number.isInteger(delivered))
    return "Attendance counts must be whole numbers.";
  if (attended < 0 || delivered < 0)
    return "Attendance counts cannot be negative.";
  if (attended > delivered)
    return "Attended classes cannot be greater than delivered classes.";
  return null;
}

export function setSubjectAttendance(
  state: AppState,
  subjectId: string,
  attended: number,
  delivered: number,
): AppState {
  const error = validateAttendanceCounts(attended, delivered);
  if (error) throw new Error(error);
  const subject = state.subjects.find((item) => item.id === subjectId);
  if (!subject) throw new Error("That subject no longer exists.");
  const subjectEvents = state.events.filter(
    (event) => event.subjectId === subjectId,
  );
  const loggedDelivered = subjectEvents.length;
  const loggedAttended = subjectEvents.filter(
    (event) => event.status === "present",
  ).length;
  if (delivered < loggedDelivered || attended < loggedAttended) {
    throw new Error(
      `Keep at least ${loggedAttended} attended and ${loggedDelivered} delivered so the totals still include your ${loggedDelivered} history records.`,
    );
  }
  const next = copyState(state);
  next.subjects = next.subjects.map((subject) =>
    subject.id === subjectId ? { ...subject, attended, delivered } : subject,
  );
  return next;
}

export function logClassAttendance(
  state: AppState,
  timetableEntryId: string,
  date: string,
  status: AttendanceStatus,
  source = "logger",
): AppState {
  if (!Number.isFinite(parseLocalDate(date).getTime())) {
    throw new Error("Choose a valid class date.");
  }

  // Do not allow attendance to be logged on a holiday.
  if (state.holidays.some((holiday) => holiday.date === date)) {
    throw new Error(
      "This date is marked as a holiday. Attendance cannot be logged.",
    );
  }

  const entry = state.timetable.find((item) => item.id === timetableEntryId);

  if (!entry) {
    throw new Error("This class is no longer on the timetable.");
  }

  const existing = state.events.find(
    (event) =>
      event.timetableEntryId === timetableEntryId && event.date === date,
  );

  if (existing?.status === status) {
    return state;
  }

  const subject = state.subjects.find(
    (item) => item.id === (existing?.subjectId ?? entry.subjectId),
  );

  if (!subject) {
    throw new Error("The class subject could not be found.");
  }

  const next = copyState(state);

  const nextSubject = next.subjects.find((item) => item.id === subject.id)!;

  // No existing attendance record:
  // create a new attendance event.
  if (!existing) {
    nextSubject.delivered += 1;

    if (status === "present") {
      nextSubject.attended += 1;
    }

    next.events.push({
      id: createId(),
      date,
      timetableEntryId,
      subjectId: subject.id,
      status,
      timestamp: new Date().toISOString(),
      source,
      subjectName: subject.name,
      classType: subject.type,
      startTime: entry.startTime,
      endTime: entry.endTime,
      room: entry.room,
    });

    return next;
  }

  // Existing record:
  // change Present ↔ Absent without increasing Delivered.
  if (existing.status === "present" && status === "absent") {
    nextSubject.attended -= 1;
  }

  if (existing.status === "absent" && status === "present") {
    nextSubject.attended += 1;
  }

  next.events = next.events.map((event) =>
    event.id === existing.id
      ? {
          ...event,
          status,
          timestamp: new Date().toISOString(),
        }
      : event,
  );

  return next;
}

export function reverseAttendanceEvent(
  state: AppState,
  eventId: string,
): AppState {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return state;
  const next = copyState(state);
  const subject = next.subjects.find((item) => item.id === event.subjectId);
  if (subject) {
    subject.delivered = Math.max(0, subject.delivered - 1);
    if (event.status === "present")
      subject.attended = Math.max(0, subject.attended - 1);
  }
  next.events = next.events.filter((item) => item.id !== eventId);
  return next;
}

export function correctAttendanceEvent(
  state: AppState,
  eventId: string,
  status: AttendanceStatus,
): AppState {
  const existing = state.events.find((event) => event.id === eventId);
  if (!existing || existing.status === status) return state;
  const next = copyState(state);
  const subject = next.subjects.find((item) => item.id === existing.subjectId);
  if (subject) {
    if (existing.status === "present" && status === "absent")
      subject.attended = Math.max(0, subject.attended - 1);
    if (existing.status === "absent" && status === "present")
      subject.attended += 1;
  }
  next.events = next.events.map((event) =>
    event.id === eventId
      ? { ...event, status, timestamp: new Date().toISOString() }
      : event,
  );
  return next;
}

export function validateThreshold(value: number): string | null {
  if (!Number.isFinite(value) || value < 1 || value > 100)
    return "Choose a threshold from 1% to 100%.";
  return null;
}

export function replaceTimetable(
  state: AppState,
  imported: ImportPreview,
  semesterName?: string,
): AppState {
  if (!imported.valid)
    throw new Error("Fix the timetable errors before importing.");
  const next = createEmptyState();
  next.threshold = state.threshold;
  next.warningMargin = state.warningMargin;
  next.semester = createSemester(semesterName);
  next.subjects = imported.subjects.map((subject) => ({ ...subject }));
  next.timetable = imported.entries
    .filter((_, index) => !imported.duplicateEntryIndexes.includes(index))
    .map((entry) => ({ ...entry }));
  return next;
}

export function mergeTimetable(
  state: AppState,
  imported: ImportPreview,
): AppState {
  if (!imported.valid)
    throw new Error("Fix the timetable errors before importing.");
  const next = copyState(state);
  const subjectMap = new Map<string, SubjectRecord>();
  const existingSubjectKey = (subject: Pick<SubjectRecord, "name" | "type">) =>
    `${subject.name.trim().toLocaleLowerCase()}|${subject.type.toLocaleLowerCase()}`;
  for (const subject of next.subjects)
    subjectMap.set(existingSubjectKey(subject), subject);
  const importedIdMap = new Map<string, string>();
  for (const incoming of imported.subjects) {
    const key = existingSubjectKey(incoming);
    let subject = subjectMap.get(key);
    if (!subject) {
      subject = { ...incoming, attended: 0, delivered: 0 };
      next.subjects.push(subject);
      subjectMap.set(key, subject);
    }
    importedIdMap.set(incoming.id, subject.id);
  }
  const existingKeys = new Set(next.timetable.map(duplicateKey));
  imported.entries.forEach((incoming, index) => {
    if (imported.duplicateEntryIndexes.includes(index)) return;
    const subjectId = importedIdMap.get(incoming.subjectId);
    if (!subjectId) return;
    const entry = { ...incoming, subjectId };
    const key = duplicateKey(entry);
    if (existingKeys.has(key)) return;
    next.timetable.push(entry);
    existingKeys.add(key);
  });
  if (!next.semester) next.semester = createSemester();
  return next;
}

export function buildTripProjection(
  state: AppState,
  startDate: string,
  endDate: string,
  today = todayDateString(),
): TripProjection | null {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const currentDay = parseLocalDate(today);
  if (
    ![start, end, currentDay].every((date) =>
      Number.isFinite(date.getTime()),
    ) ||
    start > end
  )
    return null;

  const allFuture = enumerateOccurrences(
    state.timetable,
    state.subjects,
    today,
    endDate,
  );

  const holidayDates = new Set(state.holidays.map((holiday) => holiday.date));

  const unloggedFuture = allFuture.filter(
    (occurrence) =>
      !holidayDates.has(occurrence.date) &&
      !state.events.some(
        (event) =>
          event.date === occurrence.date &&
          event.timetableEntryId === occurrence.entry.id,
      ),
  );

  const beforeTrip = unloggedFuture.filter(
    (occurrence) => occurrence.date < startDate,
  );

  const duringTrip = unloggedFuture.filter(
    (occurrence) => occurrence.date >= startDate && occurrence.date <= endDate,
  );
  const timeline = [...beforeTrip, ...duringTrip];
  const projections: TripSubjectProjection[] = state.subjects.map((subject) => {
    const beforeTripClasses = beforeTrip.filter(
      (occurrence) => occurrence.subject.id === subject.id,
    ).length;
    const tripMisses = duringTrip.filter(
      (occurrence) => occurrence.subject.id === subject.id,
    ).length;
    const beforeAttended = subject.attended + beforeTripClasses;
    const beforeDelivered = subject.delivered + beforeTripClasses;
    const afterAttended = beforeAttended;
    const afterDelivered = beforeDelivered + tripMisses;
    const allAttended = subject.attended + beforeTripClasses + tripMisses;
    const allDelivered = subject.delivered + beforeTripClasses + tripMisses;
    return {
      subject,
      beforeTripClasses,
      tripMisses,
      before: {
        attended: beforeAttended,
        delivered: beforeDelivered,
        percentage: attendancePercentage(beforeAttended, beforeDelivered),
      },
      after: {
        attended: afterAttended,
        delivered: afterDelivered,
        percentage: attendancePercentage(afterAttended, afterDelivered),
      },
      attendAll: {
        attended: allAttended,
        delivered: allDelivered,
        percentage: attendancePercentage(allAttended, allDelivered),
      },
      recoveryRequired: countRecoveryClasses(
        afterAttended,
        afterDelivered,
        state.threshold,
      ),
      status: attendanceStatus(
        afterAttended,
        afterDelivered,
        state.threshold,
        state.warningMargin,
      ),
    };
  });
  const projected = (field: "before" | "after" | "attendAll") =>
    aggregateAttendance(projections.map((projection) => projection[field]));
  const overallAfter = projected("after");

  return {
    startDate,
    endDate,
    timeline,
    beforeTrip,
    duringTrip,
    holidays: state.holidays
      .filter((holiday) => holiday.date >= today && holiday.date <= endDate)
      .filter(
        (holiday, index, all) =>
          all.findIndex((h) => h.date === holiday.date) === index,
      )
      .sort((a, b) => a.date.localeCompare(b.date)),
    subjects: projections,
    overallBefore: projected("before"),
    overallAfter,
    overallAttendAll: projected("attendAll"),
    warningSubjects: projections
      .filter(
        (projection) =>
          projection.tripMisses > 0 && projection.status === "critical",
      )
      .map((projection) => projection.subject.name),
  };
}


export function isValidAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<AppState>;

  if (
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.subjects) ||
    !Array.isArray(candidate.timetable) ||
    !Array.isArray(candidate.events)
  ) {
    return false;
  }

  if (
    !Number.isFinite(candidate.threshold) ||
    candidate.threshold! < 1 ||
    candidate.threshold! > 100
  ) {
    return false;
  }

  if (
    !Number.isFinite(candidate.warningMargin) ||
    candidate.warningMargin! < 0 ||
    candidate.warningMargin! > 30
  ) {
    return false;
  }

  const subjectIds = new Set<string>();

  for (const subject of candidate.subjects) {
    if (
      !subject ||
      typeof subject.id !== "string" ||
      !subject.id ||
      subjectIds.has(subject.id)
    ) {
      return false;
    }

    if (typeof subject.name !== "string" || !subject.name.trim()) {
      return false;
    }

    if (!["Theory", "Practical", "Other"].includes(subject.type)) {
      return false;
    }

    if (validateAttendanceCounts(subject.attended, subject.delivered)) {
      return false;
    }

    subjectIds.add(subject.id);
  }

  const entryIds = new Set<string>();

  for (const entry of candidate.timetable) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !entry.id ||
      entryIds.has(entry.id)
    ) {
      return false;
    }

    if (!subjectIds.has(entry.subjectId) || !isWeekday(entry.day)) {
      return false;
    }

    if (
      parseTimeToMinutes(entry.startTime) === null ||
      parseTimeToMinutes(entry.endTime) === null
    ) {
      return false;
    }

    if (
      parseTimeToMinutes(entry.startTime)! >=
      parseTimeToMinutes(entry.endTime)!
    ) {
      return false;
    }

    if (typeof entry.room !== "string") {
      return false;
    }

    entryIds.add(entry.id);
  }

  const eventIds = new Set<string>();
  const loggedClasses = new Set<string>();

  for (const event of candidate.events) {
    if (!event || typeof event.id !== "string" || !event.id) {
      return false;
    }

    if (eventIds.has(event.id)) {
      return false;
    }

    eventIds.add(event.id);

    const classKey = `${event.timetableEntryId}|${event.date}`;

    if (loggedClasses.has(classKey)) {
      return false;
    }

    loggedClasses.add(classKey);

    // Preserve historical events if their subject or timetable entry
    // was removed, provided the event retains its subject name.
    if (
      !subjectIds.has(event.subjectId) &&
      typeof event.subjectName !== "string"
    ) {
      return false;
    }

    if (
      !entryIds.has(event.timetableEntryId) &&
      typeof event.subjectName !== "string"
    ) {
      return false;
    }

    if (!["present", "absent"].includes(event.status)) {
      return false;
    }

    if (!Number.isFinite(parseLocalDate(event.date).getTime())) {
      return false;
    }
  }

  if (!Array.isArray(candidate.holidays)) {
    return false;
  }

  for (const holiday of candidate.holidays) {
    if (
      !holiday ||
      typeof holiday.date !== "string" ||
      !Number.isFinite(parseLocalDate(holiday.date).getTime()) ||
      typeof holiday.name !== "string" ||
      !holiday.name.trim()
    ) {
      return false;
    }
  }

  if (candidate.semester !== null && candidate.semester !== undefined) {
    if (
      typeof candidate.semester.id !== "string" ||
      typeof candidate.semester.name !== "string"
    ) {
      return false;
    }
  }

  return true;
}

function withDefaultsForOlderState(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const state = value as Partial<AppState>;
  if (
    !Array.isArray(state.subjects) ||
    !Array.isArray(state.timetable) ||
    !Array.isArray(state.events)
  )
    return value;
  const subjects = new Map(
    state.subjects.map((subject) => [subject.id, subject]),
  );
  const entries = new Map(state.timetable.map((entry) => [entry.id, entry]));
  const events = state.events.map((event) => {
    const subject = subjects.get(event.subjectId);
    const entry = entries.get(event.timetableEntryId);
    return {
      ...event,
      subjectName: event.subjectName ?? subject?.name,
      classType: event.classType ?? subject?.type,
      startTime: event.startTime ?? entry?.startTime,
      endTime: event.endTime ?? entry?.endTime,
      room: event.room ?? entry?.room,
    };
  });
  return {
    ...state,
    savedTrips: state.savedTrips ?? [],
    warningMargin: state.warningMargin ?? 5,
    holidays: Array.isArray(state.holidays)
      ? state.holidays
          .map((holiday) =>
            typeof holiday === "string"
              ? { date: holiday, name: "Holiday" }
              : holiday,
          )
          .filter(
            (holiday) =>
              holiday &&
              typeof holiday.date === "string" &&
              typeof holiday.name === "string",
          )
      : [],
    events,
  };
}

export function loadAppState(): { state: AppState; issue: string | null } {
  if (typeof localStorage === "undefined")
    return { state: createEmptyState(), issue: null };
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { state: createEmptyState(), issue: null };
  try {
    const parsed = withDefaultsForOlderState(JSON.parse(stored));
    if (!isValidAppState(parsed)) {
      return {
        state: createEmptyState(),
        issue:
          "Saved Attendly data could not be read. Import a backup to restore it.",
      };
    }
    return { state: parsed, issue: null };
  } catch {
    return {
      state: createEmptyState(),
      issue: "Saved Attendly data is damaged. Import a backup to restore it.",
    };
  }
}

export function saveAppState(state: AppState): void {
  if (typeof localStorage === "undefined")
    throw new Error("Browser storage is unavailable.");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function parseBackup(jsonText: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("This backup is not valid JSON.");
  }
  const candidate =
    parsed && typeof parsed === "object" && "attendly" in parsed
      ? (parsed as { attendly: unknown }).attendly
      : parsed;
  const normalized = withDefaultsForOlderState(candidate);
  if (!isValidAppState(normalized))
    throw new Error("This file is not a valid Attendly backup.");
  return normalized;
}
export function isHoliday(
  date: string,
  holidays: AppState["holidays"],
): boolean {
  return holidays.some((holiday) => holiday.date === date);
}

export function getHoliday(date: string, holidays: AppState["holidays"]) {
  return holidays.find((holiday) => holiday.date === date) ?? null;
}
