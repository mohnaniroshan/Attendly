import { type ReactNode, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Link,
} from "wouter";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FileJson,
  LayoutDashboard,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  RotateCcw,
  ArrowRight,
  Copy,
  CalendarRange,
  History,
  ListChecks,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  type AppState,
  type SubjectRecord,
  type TimetableEntry,
  type AttendanceEvent,
  type ImportPreview,
  type Weekday,
  createEmptyState,
  loadAppState,
  saveAppState,
  parseTimetableImport,
  replaceTimetable,
  mergeTimetable,
  createSemester,
  createId,
  getAttendanceMetrics,
  aggregateAttendance,
  getClassesForDate,
  sortWeeklyTimetable,
  enumerateOccurrences,
  buildTripProjection,
  setSubjectAttendance,
  logClassAttendance,
  reverseAttendanceEvent,
  correctAttendanceEvent,
  validateThreshold,
  findExistingDuplicates,
  isDuplicateEntry,
  todayDateString,
  formatPercentage,
  formatTime,
  WEEKDAYS,
  parseBackup,
  parseTimeToMinutes,
  attendanceStatus,
  parseLocalDate,
  toLocalDateString,
} from "@/lib/attendly";
import { groupSubjectsForDisplay } from "@/lib/subject-groups";
import { TIMETABLE_IMAGE_PROMPT } from "@/lib/timetable-image-prompt";

const days = WEEKDAYS;
const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/logger", label: "Daily log", icon: ListChecks },
  { href: "/history", label: "History", icon: History },
  { href: "/planner", label: "Trip planner", icon: CalendarRange },
  { href: "/holidays", label: "Holidays", icon: CalendarDays },
];
const queryClient = new QueryClient();
const makeId = createId;
const todayIso = todayDateString;
const dateLabel = (
  iso: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
  },
) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, options) : "";
const statusFor = (p: number | null, threshold: number, warningMargin = 5) => {
  if (p === null) return "neutral";
  const status = attendanceStatus(p, 100, threshold, warningMargin);
  return status === "safe"
    ? "good"
    : status === "warning"
      ? "warn"
      : status === "critical"
        ? "low"
        : "neutral";
};
const fmtPercent = (p: number | null) => formatPercentage(p, 2);
function Holidays(p: Shared) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingDates, setEditingDates] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const makeDates = (from: string, to: string) => {
    const dates: string[] = [];
    const cursor = parseLocalDate(from);
    const last = parseLocalDate(to);
    while (cursor <= last) {
      dates.push(toLocalDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  };

  const holidays = [...p.state.holidays].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const groups: {
    key: string;
    name: string;
    start: string;
    end: string;
    dates: string[];
  }[] = [];
  for (const holiday of holidays) {
    const previous = groups[groups.length - 1];
    const nextDay = previous ? parseLocalDate(previous.end) : null;
    if (nextDay) nextDay.setDate(nextDay.getDate() + 1);
    const nextDate = nextDay ? toLocalDateString(nextDay) : "";
    if (
      previous &&
      previous.name === holiday.name &&
      nextDate === holiday.date
    ) {
      previous.end = holiday.date;
      previous.dates.push(holiday.date);
    } else {
      groups.push({
        key: `${holiday.name}|${holiday.date}`,
        name: holiday.name,
        start: holiday.date,
        end: holiday.date,
        dates: [holiday.date],
      });
    }
  }

  const addHoliday = () => {
    const holidayName = name.trim();
    if (!holidayName || !start || !end) {
      p.notify("Enter a holiday name and date range.");
      return;
    }
    if (end < start) {
      p.notify("End date must be on or after the start date.");
      return;
    }
    const dates = makeDates(start, end);
    const existing = new Set(p.state.holidays.map((h) => h.date));
    const additions = dates
      .filter((date) => !existing.has(date))
      .map((date) => ({ date, name: holidayName }));
    if (!additions.length) {
      p.notify("Those dates already have holidays.");
      return;
    }
    p.update((current) => ({
      ...current,
      holidays: [...current.holidays, ...additions],
    }));
    setName("");
    setStart("");
    setEnd("");
    p.notify(
      `${additions.length} holiday date${additions.length === 1 ? "" : "s"} added`,
    );
  };

  const beginEdit = (group: (typeof groups)[number]) => {
    setEditingKey(group.key);
    setEditingDates(group.dates);
    setEditName(group.name);
    setEditStart(group.start);
    setEditEnd(group.end);
  };
  const saveEdit = () => {
    const cleanedName = editName.trim();
    if (!cleanedName || !editStart || !editEnd) {
      p.notify("Enter a holiday name and date range.");
      return;
    }
    if (editEnd < editStart) {
      p.notify("End date must be on or after the start date.");
      return;
    }
    const nextDates = makeDates(editStart, editEnd);
    const originalDates = new Set(editingDates);
    const occupied = new Set(
      p.state.holidays
        .filter((h) => !originalDates.has(h.date))
        .map((h) => h.date),
    );
    if (nextDates.some((date) => occupied.has(date))) {
      p.notify(
        "Some dates already belong to another holiday. Change the range or edit the overlapping holiday first.",
      );
      return;
    }
    const replacement = nextDates.map((date) => ({ date, name: cleanedName }));
    p.update((current) => ({
      ...current,
      holidays: [
        ...current.holidays.filter((h) => !originalDates.has(h.date)),
        ...replacement,
      ].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setEditingKey(null);
    setEditingDates([]);
    p.notify("Vacation updated");
  };
  const removeGroup = (group: (typeof groups)[number]) => {
    p.update((current) => ({
      ...current,
      holidays: current.holidays.filter((h) => !group.dates.includes(h.date)),
    }));
    if (editingKey === group.key) {
      setEditingKey(null);
      setEditingDates([]);
    }
    p.notify(
      `${group.dates.length} holiday date${group.dates.length === 1 ? "" : "s"} removed`,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Semester calendar"
        title="Holidays"
        subtitle="Manage college holidays and vacations as date ranges. Attendly uses them for attendance and trip planning."
      />
      <div className="grid lg:grid-cols-[minmax(260px,.72fr)_minmax(0,1.28fr)] gap-4 items-start">
        <section className="content-card !p-4 sm:!p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays size={17} color="#5b9366" />
            <h2 className="section-title">Add vacation</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Add a single day or an entire break in one go.
          </p>
          <div className="space-y-3">
            <label className="block">
              <span className="field-label">Vacation name</span>
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Diwali Break"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="field-label">Start date</span>
                <input
                  type="date"
                  className="field"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (!end || end < e.target.value) setEnd(e.target.value);
                  }}
                />
              </label>
              <label className="block min-w-0">
                <span className="field-label">End date</span>
                <input
                  type="date"
                  className="field"
                  value={end}
                  min={start || undefined}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={addHoliday}
            >
              <Plus size={15} /> Add vacation
            </button>
          </div>
        </section>

        <section className="content-card !p-4 sm:!p-5 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="section-title">Your vacations</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Edit or remove a whole date range at once.
              </p>
            </div>
            <span className="text-xs rounded-full bg-[#edf2e9] px-3 py-1.5 text-[#607668] shrink-0">
              {groups.length} {groups.length === 1 ? "break" : "breaks"} ·{" "}
              {holidays.length} days
            </span>
          </div>
          {groups.length ? (
            <div className="max-h-[560px] overflow-y-auto pr-1">
              <div className="divide-y divide-[#e7e9e1]">
                {groups.map((group) => (
                  <div key={group.key} className="py-2.5">
                    {editingKey === group.key ? (
                      <div className="rounded-lg bg-[#f5f6f1] p-3 space-y-2">
                        <label className="block">
                          <span className="field-label">Vacation name</span>
                          <input
                            autoFocus
                            className="field"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block min-w-0">
                            <span className="field-label">Start date</span>
                            <input
                              type="date"
                              className="field"
                              value={editStart}
                              onChange={(e) => {
                                setEditStart(e.target.value);
                                if (!editEnd || editEnd < e.target.value)
                                  setEditEnd(e.target.value);
                              }}
                            />
                          </label>
                          <label className="block min-w-0">
                            <span className="field-label">End date</span>
                            <input
                              type="date"
                              className="field"
                              min={editStart || undefined}
                              value={editEnd}
                              onChange={(e) => setEditEnd(e.target.value)}
                            />
                          </label>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Saving replaces this entire vacation range, including
                          adding or removing days.
                        </p>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              setEditingKey(null);
                              setEditingDates([]);
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={saveEdit}
                          >
                            <Check size={14} /> Save range
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <span className="text-base shrink-0">🎉</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[#385346] truncate">
                            {group.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {group.start === group.end
                              ? dateLabel(group.start, {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : `${dateLabel(group.start, { month: "short", day: "numeric", year: "numeric" })} – ${dateLabel(group.end, { month: "short", day: "numeric", year: "numeric" })}`}{" "}
                            · {group.dates.length}{" "}
                            {group.dates.length === 1 ? "day" : "days"}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-quiet shrink-0"
                          onClick={() => beginEdit(group)}
                          aria-label={`Edit ${group.name}`}
                          title="Edit entire vacation"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn-quiet shrink-0"
                          onClick={() => removeGroup(group)}
                          aria-label={`Remove entire ${group.name} vacation`}
                          title="Delete entire vacation"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-[#f5f6f1] px-4 py-8 text-center">
              <CalendarDays size={22} className="mx-auto mb-2 text-[#7c9583]" />
              <div className="font-semibold text-sm text-[#3a5547]">
                No vacations added
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Your holidays will appear here.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function App() {
  const [loaded] = useState(() => loadAppState());
  const [state, setState] = useState<AppState>(loaded.state);
  const [toast, setToast] = useState("");
  const [entryPendingRemoval, setEntryPendingRemoval] =
    useState<TimetableEntry | null>(null);
  useEffect(() => {
    saveAppState(state);
  }, [state]);
  useEffect(() => {
    document.title = "Attendly — Your semester, organized.";
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const update = (fn: (current: AppState) => AppState) =>
    setState((current) => fn(current));
  const record = (
    entry: TimetableEntry,
    date: string,
    status: "present" | "absent",
  ) => {
    update((current) =>
      logClassAttendance(current, entry.id, date, status, "manual"),
    );
    setToast(status === "present" ? "Marked present" : "Marked absent");
  };
  const correct = (event: AttendanceEvent, status: "present" | "absent") => {
    update((current) => correctAttendanceEvent(current, event.id, status));
    setToast(
      status === "present"
        ? "History corrected to present"
        : "History corrected to absent",
    );
  };
  const reverse = (event: AttendanceEvent) => {
    update((current) => reverseAttendanceEvent(current, event.id));
    setToast("Attendance record reversed");
  };
  const saveSubject = (subject: SubjectRecord): boolean => {
    const logged = state.events.filter(
      (event) => event.subjectId === subject.id,
    );
    const loggedAttended = logged.filter(
      (event) => event.status === "present",
    ).length;
    if (
      subject.attended < loggedAttended ||
      subject.delivered < logged.length
    ) {
      setToast(
        `Keep at least ${loggedAttended} attended and ${logged.length} delivered so these history records remain included.`,
      );
      return false;
    }
    update((c) => {
      const existing = c.subjects.some((s) => s.id === subject.id);
      let next = existing
        ? setSubjectAttendance(
            c,
            subject.id,
            subject.attended,
            subject.delivered,
          )
        : { ...c, subjects: [...c.subjects, subject] };
      next = {
        ...next,
        subjects: next.subjects.map((s) => (s.id === subject.id ? subject : s)),
        semester: next.semester ?? createSemester(),
      };
      return next;
    });
    setToast("Subject saved");
    return true;
  };
  const saveEntry = (entry: TimetableEntry) => {
    update((c) => ({
      ...c,
      semester: c.semester ?? createSemester(),
      timetable: c.timetable.some((e) => e.id === entry.id)
        ? c.timetable.map((e) => (e.id === entry.id ? entry : e))
        : [...c.timetable, entry],
    }));
    setToast("Timetable updated");
  };
  const removeEntry = (entry: TimetableEntry) => setEntryPendingRemoval(entry);
  const confirmRemoveEntry = () => {
    if (!entryPendingRemoval) return;
    update((c) => ({
      ...c,
      timetable: c.timetable.filter((e) => e.id !== entryPendingRemoval.id),
    }));
    setEntryPendingRemoval(null);
    setToast("Class removed; history kept");
  };
  const props = {
    state,
    update,
    record,
    correct,
    reverse,
    saveSubject,
    saveEntry,
    removeEntry,
    notify: setToast,
  };
  const [location] = useLocation();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="attendly-shell">
          <style>{`
            .attendly-shell .btn-primary {
              background: #4e7658 !important;
              border-color: #4e7658 !important;
              color: #fffdf7 !important;
            }
            .attendly-shell .btn-primary:hover {
              background: #3e6348 !important;
              border-color: #3e6348 !important;
            }
            .attendly-shell .btn-primary:focus-visible {
              outline: 3px solid #b9d0b6 !important;
              outline-offset: 2px;
            }
            .attendly-shell input[type="range"] {
              accent-color: #4e7658 !important;
            }
          `}</style>
          <aside className="attendly-sidebar">
            <Link href="/" className="brand-mark" data-testid="link-brand">
              <span className="brand-icon">
                <CalendarDays size={19} />
              </span>
              <span>
                Attendly
                <span className="brand-tag">Your semester, organized.</span>
              </span>
            </Link>
            <div className="nav-label">Your workspace</div>
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`side-link ${location === item.href ? "active" : ""}`}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
            <div className="side-bottom">
              <Link
                href="/settings"
                className={`side-link ${location === "/settings" ? "active" : ""}`}
                data-testid="link-nav-settings"
              >
                <Settings2 size={17} />
                Settings
              </Link>
              <div
                style={{
                  padding: "16px 12px 5px",
                  color: "#b2c8b9",
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                A quiet place to keep your semester in view.
              </div>
            </div>
          </aside>
          <div className="main-area">
            <header className="topbar">
              <div
                className="flex items-center gap-2 text-sm"
                style={{ color: "#708178" }}
              >
                <span className="hidden sm:inline">Semester</span>
                <strong
                  style={{ color: "#334d40" }}
                  data-testid="text-semester-name"
                >
                  {state.semester?.name || "Your semester"}
                </strong>
              </div>
              <Link
                href="/settings"
                className="btn-quiet"
                aria-label="Settings"
                data-testid="link-settings-top"
              >
                <Settings2 size={18} />
                <span className="hidden sm:inline">Preferences</span>
              </Link>
            </header>
            <main className="main-content">
              <RoutedErrorBoundary>
                {loaded.issue && (
                  <div
                    role="alert"
                    className="mb-5 rounded-xl bg-[#fff0cd] px-4 py-3 text-sm text-[#805716] flex items-center justify-between gap-3"
                    data-testid="status-storage-issue"
                  >
                    <span>
                      {loaded.issue} You can restore a valid backup in Settings.
                    </span>
                    <button
                      className="btn-quiet"
                      onClick={() => setState(createEmptyState())}
                      data-testid="button-reset-invalid-state"
                    >
                      Start fresh
                      <X size={14} />
                    </button>
                  </div>
                )}
                <Switch>
                  <Route path="/" component={() => <Dashboard {...props} />} />
                  <Route
                    path="/subjects"
                    component={() => <Subjects {...props} />}
                  />
                  <Route
                    path="/timetable"
                    component={() => <Timetable {...props} />}
                  />
                  <Route
                    path="/logger"
                    component={() => <Logger {...props} />}
                  />
                  <Route
                    path="/history"
                    component={() => <HistoryPage {...props} />}
                  />
                  <Route
                    path="/holidays"
                    component={() => <Holidays {...props} />}
                  />
                  <Route
                    path="/planner"
                    component={() => <Planner {...props} />}
                  />
                  <Route
                    path="/settings"
                    component={() => <Settings {...props} />}
                  />
                  <Route component={NotFound} />
                </Switch>
              </RoutedErrorBoundary>
            </main>
          </div>
          <nav className="mobile-nav">
            {[
              ...nav,
              { href: "/settings", label: "Settings", icon: Settings2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={location === item.href ? "active" : ""}
                  data-testid={`mobile-nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          {entryPendingRemoval && (
            <Modal
              title="Remove this class?"
              onClose={() => setEntryPendingRemoval(null)}
            >
              <div className="flex items-start gap-3 mb-5">
                <div className="empty-symbol !m-0 shrink-0">
                  <Trash2 size={18} />
                </div>
                <div>
                  <p className="text-sm text-[#385346] font-medium">
                    Remove this class from your weekly timetable?
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Existing attendance history will be kept.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => setEntryPendingRemoval(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={confirmRemoveEntry}
                >
                  <Trash2 size={14} />
                  Remove class
                </button>
              </div>
            </Modal>
          )}
          {toast && (
            <div
              role="status"
              data-testid="status-toast"
              style={{
                position: "fixed",
                right: 22,
                bottom: 24,
                zIndex: 80,
                background: "#203b32",
                color: "#f5f4ec",
                padding: "12px 17px",
                borderRadius: 12,
                boxShadow: "0 8px 30px #203b3233",
                display: "flex",
                gap: 9,
                alignItems: "center",
                fontSize: 13,
                animation: "rise .18s ease-out",
              }}
            >
              <CheckCircle2 size={17} color="#9ed1a7" />
              {toast}
            </div>
          )}
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

type Shared = {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  record: (e: TimetableEntry, d: string, s: "present" | "absent") => void;
  correct: (e: AttendanceEvent, s: "present" | "absent") => void;
  reverse: (e: AttendanceEvent) => void;
  saveSubject: (s: SubjectRecord) => boolean;
  saveEntry: (e: TimetableEntry) => void;
  removeEntry: (e: TimetableEntry) => void;
  notify: (s: string) => void;
};
function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <div className="page-eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof CalendarDays;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol">
        <Icon size={21} />
      </div>
      <div className="font-semibold text-sm" style={{ color: "#3a5547" }}>
        {title}
      </div>
      <p className="text-sm max-w-sm mx-auto mt-2 mb-4">{text}</p>
      {action}
    </div>
  );
}
function Pill({
  value,
  threshold,
  warningMargin = 5,
}: {
  value: number | null;
  threshold: number;
  warningMargin?: number;
}) {
  const status = statusFor(value, threshold, warningMargin);
  const label =
    status === "good"
      ? "Safe"
      : status === "warn"
        ? "Warning"
        : status === "low"
          ? "Critical"
          : "Not started";
  return (
    <span
      className={`status-pill ${status === "good" ? "status-good" : status === "warn" ? "status-warn" : status === "low" ? "status-low" : ""}`}
      data-testid={`status-attendance-${status}`}
    >
      {status === "good" && <Check size={12} />}
      {label}
    </span>
  );
}
function progressStyle(
  value: number | null,
  threshold: number,
  warningMargin = 5,
) {
  const status = statusFor(value, threshold, warningMargin);
  return {
    width: `${Math.max(0, Math.min(value ?? 0, 100))}%`,
    background:
      status === "good"
        ? "#4e9a67"
        : status === "warn"
          ? "#d29a32"
          : status === "low"
            ? "#cc6258"
            : "#b9c9bc",
  };
}
function summary(subjects: SubjectRecord[]) {
  const totals = aggregateAttendance(subjects);
  return {
    delivered: totals.delivered,
    attended: totals.attended,
    percent: totals.percentage,
  };
}

function Dashboard(p: Shared) {
  const { state } = p;
  const today = todayIso(),
    todaysEntries = getClassesForDate(
      state.timetable,
      state.subjects,
      today,
    ).map((o) => o.entry);
  const logged = new Set(
    state.events.filter((e) => e.date === today).map((e) => e.timetableEntryId),
  );
  const totals = summary(state.subjects);
  const progress = totals.percent;
  const noSetup = state.subjects.length === 0 && state.timetable.length === 0;
  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        eyebrow={dateLabel(today)}
        title="A clearer semester starts here."
        subtitle="Your classes, attendance, and room to plan — all in one place."
        action={
          <Link
            href="/logger"
            className="btn-primary"
            data-testid="button-log-today"
          >
            <ListChecks size={16} />
            Log today
          </Link>
        }
      />
      {noSetup ? (
        <div
          className="content-card mb-6"
          style={{
            background: "linear-gradient(112deg,#e7f1e5,#f7f3e6)",
            borderColor: "#d6e4d5",
          }}
        >
          <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="page-eyebrow">A fresh page</div>
              <h2 className="section-title text-2xl">
                Your semester begins with your schedule.
              </h2>
              <p className="text-sm mt-2 max-w-xl" style={{ color: "#63776a" }}>
                Add your real classes or bring in a timetable file. Attendly
                starts with a clean slate; nothing is pre-filled and simulations
                never change your records.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/timetable"
                className="btn-primary"
                data-testid="button-add-first-class"
              >
                <Plus size={16} />
                Add a class
              </Link>
              <ImportModal {...p} />
            </div>
          </div>
        </div>
      ) : null}
      <div className="stat-grid mb-6">
        <div className="stat-card">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Attendance overall
          </div>
          <div className="flex items-end justify-between mt-3">
            <div className="stat-number" data-testid="text-overall-attendance">
              {fmtPercent(progress)}
            </div>
            <Pill
              value={progress}
              threshold={state.threshold}
              warningMargin={state.warningMargin}
            />
          </div>
          <div className="h-2 rounded-full bg-[#e9eee7] mt-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={progressStyle(
                progress,
                state.threshold,
                state.warningMargin,
              )}
            />
          </div>
          <div
            className="text-xs mt-2 text-muted-foreground"
            data-testid="text-overall-counts"
          >
            {totals.attended} / {totals.delivered} classes
          </div>
        </div>
        <div className="stat-card">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Classes today
          </div>
          <div className="stat-number mt-3" data-testid="text-today-count">
            {todaysEntries.length}
          </div>
          <div className="text-xs mt-2 text-muted-foreground">
            {logged.size} of {todaysEntries.length} recorded
          </div>
        </div>
        <div className="stat-card">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Subjects this semester
          </div>
          <div className="stat-number mt-3" data-testid="text-class-count">
            {state.subjects.length}
          </div>
          <div className="text-xs mt-2 text-muted-foreground">
            {state.timetable.length} weekly timetable entries
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1.4fr_.8fr] gap-5">
        <section className="content-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="section-title">On today's schedule</div>
              <p className="text-xs text-muted-foreground mt-1">
                {dateLabel(today, { month: "long", day: "numeric" })}
              </p>
            </div>
            <Link
              href="/timetable"
              className="btn-quiet"
              data-testid="link-edit-timetable"
            >
              Full timetable
              <ChevronRight size={15} />
            </Link>
          </div>
          {todaysEntries.length ? (
            <div>
              {todaysEntries.map((entry) => {
                const subject = state.subjects.find(
                  (s) => s.id === entry.subjectId,
                );
                const event = state.events.find(
                  (e) => e.date === today && e.timetableEntryId === entry.id,
                );
                return (
                  <div
                    className="row-divider py-4 flex flex-wrap items-center gap-3"
                    key={entry.id}
                    data-testid={`row-today-class-${entry.id}`}
                  >
                    <div className="w-1 self-stretch rounded-full bg-[#83b68b]" />
                    <div className="flex-1 min-w-[150px]">
                      <div className="font-semibold text-sm text-[#304b3d]">
                        {subject?.name || "Removed subject"}{" "}
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {subject?.type}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {entry.startTime}–{entry.endTime}
                        {entry.room ? ` · ${entry.room}` : ""}
                      </div>
                    </div>
                    {event ? (
                      <Pill
                        value={event.status === "present" ? 100 : 0}
                        threshold={state.threshold}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Not recorded
                      </span>
                    )}
                    <Link
                      href="/logger"
                      className="btn-quiet"
                      data-testid={`link-log-class-${entry.id}`}
                    >
                      <Pencil size={15} />
                      {event ? "Correct" : "Record"}
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              icon={Clock3}
              title="Nothing scheduled today"
              text="Add your weekly classes to see the rhythm of your day here."
              action={
                <Link
                  href="/timetable"
                  className="btn-secondary"
                  data-testid="button-empty-timetable"
                >
                  Open timetable
                </Link>
              }
            />
          )}
        </section>
        <section className="content-card">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} color="#579266" />
            <div className="section-title">Your attendance picture</div>
          </div>
          {state.subjects.length ? (
            <div className="space-y-4">
              {state.subjects.slice(0, 5).map((s) => {
                const pct = getAttendanceMetrics(
                  s.attended,
                  s.delivered,
                  state.threshold,
                  state.warningMargin,
                ).percentage;
                return (
                  <div key={s.id} data-testid={`row-overview-subject-${s.id}`}>
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="font-medium text-[#385346] truncate pr-2">
                        {s.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtPercent(pct)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#e9eee7] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={progressStyle(
                          pct,
                          state.threshold,
                          state.warningMargin,
                        )}
                      />
                    </div>
                  </div>
                );
              })}
              <Link
                href="/subjects"
                className="btn-quiet mt-4"
                data-testid="link-subject-detail"
              >
                See all subjects
                <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <Empty
              icon={BookOpen}
              title="Your subjects will appear here"
              text="Create a class and add its attended and delivered counts whenever you're ready."
              action={
                <Link
                  href="/subjects"
                  className="btn-secondary"
                  data-testid="button-create-subject"
                >
                  Add a subject
                </Link>
              }
            />
          )}
        </section>
      </div>
      <div
        className="mt-5 flex items-start gap-3 rounded-xl p-4 text-xs leading-relaxed"
        style={{ background: "#f0eee4", color: "#667468" }}
      >
        <CircleHelp size={16} className="shrink-0 mt-0.5" />
        <span>
          Attendly keeps actual attendance separate from trip planning. Your
          records change only when you log or correct a class.
        </span>
        <Link
          href="/planner"
          className="font-semibold underline underline-offset-2 shrink-0"
          data-testid="link-planner-note"
        >
          Plan a trip
        </Link>
      </div>
    </div>
  );
}

function SubjectForm({
  subject,
  onClose,
  onSave,
}: {
  subject?: SubjectRecord;
  onClose: () => void;
  onSave: (s: SubjectRecord) => boolean | void;
}) {
  const [name, setName] = useState(subject?.name ?? ""),
    [type, setType] = useState<SubjectRecord["type"]>(
      subject?.type ?? "Theory",
    );
  const [attended, setAttended] = useState(String(subject?.attended ?? 0)),
    [delivered, setDelivered] = useState(String(subject?.delivered ?? 0));
  const [error, setError] = useState("");
  return (
    <Modal title={subject ? "Edit subject" : "New subject"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const a = Number(attended),
            d = Number(delivered);
          if (
            !name.trim() ||
            !Number.isInteger(a) ||
            !Number.isInteger(d) ||
            a < 0 ||
            d < 0 ||
            a > d
          ) {
            setError(
              "Enter a name and valid counts. Attended cannot exceed delivered.",
            );
            return;
          }
          if (
            onSave({
              id: subject?.id ?? makeId(),
              name: name.trim(),
              type,
              attended: a,
              delivered: d,
            }) !== false
          )
            onClose();
        }}
      >
        <div className="space-y-4">
          <label>
            <span className="field-label">Subject name</span>
            <input
              autoFocus
              className="field"
              data-testid="input-subject-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Modern history"
            />
          </label>
          <label>
            <span className="field-label">Class type</span>
            <select
              className="field"
              data-testid="select-subject-type"
              value={type}
              onChange={(e) => setType(e.target.value as SubjectRecord["type"])}
            >
              <option>Theory</option>
              <option>Practical</option>
              <option>Other</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">Attended so far</span>
              <input
                type="number"
                min="0"
                className="field"
                data-testid="input-subject-attended"
                value={attended}
                onChange={(e) => setAttended(e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Classes delivered</span>
              <input
                type="number"
                min="0"
                className="field"
                data-testid="input-subject-delivered"
                value={delivered}
                onChange={(e) => setDelivered(e.target.value)}
              />
            </label>
          </div>
          {error && (
            <p className="text-xs text-red-700" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-quiet"
              data-testid="button-cancel-subject"
            >
              Cancel
            </button>
            <button className="btn-primary" data-testid="button-save-subject">
              Save subject
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Subjects(p: Shared) {
  const { state } = p;
  const [editing, setEditing] = useState<SubjectRecord | null | undefined>(
    undefined,
  );
  const [subjectPendingRemoval, setSubjectPendingRemoval] =
    useState<SubjectRecord | null>(null);
  const groups = groupSubjectsForDisplay(state.subjects);

  return (
    <>
      <PageHeader
        eyebrow="Your classes"
        title="Subjects"
        subtitle="Keep a clear, class-by-class view of the numbers that matter."
        action={
          <button
            onClick={() => setEditing(null)}
            className="btn-primary"
            data-testid="button-add-subject"
          >
            <Plus size={16} />
            Add subject
          </button>
        }
      />

      {groups.length === 0 ? (
        <div className="content-card">
          <Empty
            icon={BookOpen}
            title="No subjects yet"
            text="Add a subject to track attendance manually, or start by adding classes to your weekly timetable."
            action={
              <button
                className="btn-primary"
                onClick={() => setEditing(null)}
                data-testid="button-empty-add-subject"
              >
                <Plus size={15} />
                Create your first subject
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const hasTheory = group.subjects.some((s) => s.type === "Theory");
            const hasPractical = group.subjects.some(
              (s) => s.type === "Practical",
            );
            const showOverall = hasTheory && hasPractical;

            const totalAttended = group.subjects.reduce(
              (sum, s) => sum + s.attended,
              0,
            );
            const totalDelivered = group.subjects.reduce(
              (sum, s) => sum + s.delivered,
              0,
            );
            const overallPct =
              totalDelivered > 0
                ? (totalAttended / totalDelivered) * 100
                : null;

            const overallMetrics = getAttendanceMetrics(
              totalAttended,
              totalDelivered,
              state.threshold,
              state.warningMargin,
            );

            return (
              <article
                key={group.key}
                className="content-card"
                data-testid={`card-subject-group-${group.key}`}
              >
                <h2 className="section-title mb-1">{group.name}</h2>

                {showOverall && (
                  <div className="mt-2 mb-1 rounded-lg bg-[#f3f7f0]/60 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-[#63766a]">
                          Overall Attendance Theory + Practical
                        </div>
                        <div className="text-sm text-[#3d5548] mt-1">
                          {totalAttended} / {totalDelivered} classes ·{" "}
                          {totalDelivered - totalAttended} missed
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="font-serif text-xl font-semibold text-[#315541]"
                          data-testid={`text-overall-percent-${group.key}`}
                        >
                          {fmtPercent(overallPct)}
                        </span>
                        <Pill
                          value={overallPct}
                          threshold={state.threshold}
                          warningMargin={state.warningMargin}
                        />
                      </div>
                    </div>

                    <div className="h-1 rounded-full bg-[#e1e9dd] overflow-hidden mt-1.5">
                      <div
                        className="h-full rounded-full transition-all"
                        style={progressStyle(
                          overallPct,
                          state.threshold,
                          state.warningMargin,
                        )}
                      />
                    </div>
                    {overallMetrics.safeBunks !== null &&
                    overallPct !== null &&
                    overallPct >= state.threshold
                      ? `Can miss ${overallMetrics.safeBunks} more ${
                          overallMetrics.safeBunks === 1 ? "class" : "classes"
                        } overall`
                      : overallMetrics.recoveryRequired === null
                        ? "Reaching this target is not possible by attending future classes alone."
                        : overallMetrics.recoveryRequired > 0
                          ? `Attend ${overallMetrics.recoveryRequired} future ${
                              overallMetrics.recoveryRequired === 1
                                ? "class"
                                : "classes"
                            } to reach ${state.threshold}% overall`
                          : "Attendance has not been recorded yet."}
                  </div>
                )}
                <div>
                  {group.subjects.map((s) => {
                    const metrics = getAttendanceMetrics(
                      s.attended,
                      s.delivered,
                      state.threshold,
                      state.warningMargin,
                    );
                    const pct = metrics.percentage;

                    return (
                      <div
                        key={s.id}
                        className="row-divider first:border-0 py-4"
                        data-testid={`card-subject-${s.id}`}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 sm:gap-5 items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wider text-[#496854] rounded-full bg-[#e8efe5] px-2.5 py-1 font-semibold">
                                {s.type}
                              </span>
                              <span className="text-sm font-medium text-[#3d5548]">
                                {s.attended} / {s.delivered} ·{" "}
                                {s.delivered - s.attended} missed
                              </span>
                            </div>

                            <div
                              className="text-[11px] mt-1 text-[#637661]"
                              data-testid={`text-attendance-guidance-${s.id}`}
                            >
                              {metrics.safeBunks !== null &&
                              pct !== null &&
                              pct >= state.threshold
                                ? `Can miss ${metrics.safeBunks} ${
                                    metrics.safeBunks === 1
                                      ? "class"
                                      : "classes"
                                  }`
                                : metrics.recoveryRequired === null
                                  ? "Reaching this target is not possible by attending future classes alone."
                                  : metrics.recoveryRequired > 0
                                    ? `Attend ${metrics.recoveryRequired} future ${
                                        metrics.recoveryRequired === 1
                                          ? "class"
                                          : "classes"
                                      } to reach ${state.threshold}%`
                                    : "Attendance has not been recorded yet."}
                            </div>

                            <div className="h-1.5 rounded-full bg-[#e9eee7] overflow-hidden mt-3">
                              <div
                                className="h-full rounded-full transition-all"
                                style={progressStyle(
                                  pct,
                                  state.threshold,
                                  state.warningMargin,
                                )}
                              />
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end gap-2">
                            <div
                              className="font-serif text-xl text-[#315541]"
                              data-testid={`text-subject-percent-${s.id}`}
                            >
                              {fmtPercent(pct)}
                            </div>
                            <Pill
                              value={pct}
                              threshold={state.threshold}
                              warningMargin={state.warningMargin}
                            />
                          </div>

                          <div className="flex justify-end gap-1">
                            <button
                              className="btn-quiet"
                              onClick={() => setEditing(s)}
                              aria-label={`Edit ${group.name} ${s.type}`}
                              data-testid={`button-edit-subject-${s.id}`}
                            >
                              <Pencil size={16} />
                              <span className="sm:hidden">Edit</span>
                            </button>

                            <button
                              className="btn-quiet text-xs"
                              onClick={() => {
                                const historyCount = p.state.events.filter(
                                  (e) => e.subjectId === s.id,
                                ).length;

                                setSubjectPendingRemoval(s);
                              }}
                              data-testid={`button-delete-subject-${s.id}`}
                            >
                              <Trash2 size={14} />
                              <span className="sm:hidden">Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {subjectPendingRemoval && (
        <Modal
          title="Remove this subject?"
          onClose={() => setSubjectPendingRemoval(null)}
        >
          <p className="text-sm text-[#385346] mb-2">
            Remove {subjectPendingRemoval.name} {subjectPendingRemoval.type} and
            its weekly classes?
          </p>
          <p className="text-xs text-muted-foreground mb-5">
            {p.state.events.filter(
              (e) => e.subjectId === subjectPendingRemoval.id,
            ).length
              ? `Its attendance history (${p.state.events.filter((e) => e.subjectId === subjectPendingRemoval.id).length} records) will remain.`
              : "This subject has no attendance history."}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setSubjectPendingRemoval(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                const id = subjectPendingRemoval.id;
                p.update((c) => ({
                  ...c,
                  subjects: c.subjects.filter((x) => x.id !== id),
                  timetable: c.timetable.filter((x) => x.subjectId !== id),
                }));
                setSubjectPendingRemoval(null);
                p.notify("Subject removed; history kept");
              }}
            >
              <Trash2 size={14} />
              Remove subject
            </button>
          </div>
        </Modal>
      )}
      {editing !== undefined && (
        <SubjectForm
          subject={editing || undefined}
          onClose={() => setEditing(undefined)}
          onSave={p.saveSubject}
        />
      )}
    </>
  );
}

function TimetableForm({
  initial,
  subjects,
  entries,
  onSave,
  onClose,
  onCreateSubject,
}: {
  initial?: TimetableEntry;
  subjects: SubjectRecord[];
  entries: TimetableEntry[];
  onSave: (e: TimetableEntry) => void;
  onClose: () => void;
  onCreateSubject: () => void;
}) {
  const [subjectId, setSubjectId] = useState(
      initial?.subjectId ?? subjects[0]?.id ?? "",
    ),
    [day, setDay] = useState<Weekday>(initial?.day ?? "Monday"),
    [startTime, setStartTime] = useState(initial?.startTime ?? "09:00"),
    [endTime, setEndTime] = useState(initial?.endTime ?? "10:00"),
    [room, setRoom] = useState(initial?.room ?? ""),
    [error, setError] = useState("");
  const sortedSubjects = groupSubjectsForDisplay(subjects).flatMap(
    (group) => group.subjects,
  );
  return (
    <Modal
      title={initial ? "Edit timetable entry" : "Add a class"}
      onClose={onClose}
    >
      {subjects.length === 0 ? (
        <Empty
          icon={BookOpen}
          title="Add a subject first"
          text="Every timetable entry belongs to a subject, so your attendance stays organized."
          action={
            <button
              className="btn-primary"
              onClick={onCreateSubject}
              data-testid="button-create-subject-from-entry"
            >
              <Plus size={15} />
              Create subject
            </button>
          }
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const candidate = {
              id: initial?.id ?? makeId(),
              subjectId,
              day,
              startTime,
              endTime,
              room: room.trim(),
            };
            if (
              !subjectId ||
              parseTimeToMinutes(startTime) === null ||
              parseTimeToMinutes(endTime) === null ||
              parseTimeToMinutes(endTime)! <= parseTimeToMinutes(startTime)!
            ) {
              setError(
                "Choose a subject and an end time after the start time.",
              );
              return;
            }
            if (isDuplicateEntry(entries, candidate, initial?.id)) {
              setError("This exact class is already on your timetable.");
              return;
            }
            const candidateStart = parseTimeToMinutes(candidate.startTime)!;
            const candidateEnd = parseTimeToMinutes(candidate.endTime)!;
            const overlap = entries.find(
              (entry) =>
                entry.id !== initial?.id &&
                entry.day === candidate.day &&
                candidateStart < parseTimeToMinutes(entry.endTime)! &&
                candidateEnd > parseTimeToMinutes(entry.startTime)!,
            );
            if (overlap) {
              const conflictingSubject = subjects.find(
                (subject) => subject.id === overlap.subjectId,
              );
              setError(
                `This class overlaps with ${conflictingSubject?.name ?? "another class"} on ${overlap.day}, ${formatTime(overlap.startTime)}–${formatTime(overlap.endTime)}.`,
              );
              return;
            }
            onSave(candidate);
            onClose();
          }}
        >
          <div className="space-y-4">
            <label>
              <span className="field-label">Subject</span>
              <select
                className="field"
                data-testid="select-entry-subject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                {sortedSubjects.map((s) => (
                  <option
                    value={s.id}
                    key={s.id}
                    data-testid={`option-entry-subject-${s.id}`}
                  >
                    {s.name} · {s.type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Day</span>
              <select
                className="field"
                data-testid="select-entry-day"
                value={day}
                onChange={(e) => setDay(e.target.value as Weekday)}
              >
                {days.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="field-label">Starts</span>
                <input
                  type="time"
                  className="field"
                  data-testid="input-entry-start"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">Ends</span>
                <input
                  type="time"
                  className="field"
                  data-testid="input-entry-end"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            </div>
            <label>
              <span className="field-label">
                Room{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </span>
              <input
                className="field"
                data-testid="input-entry-room"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="Building or room"
              />
            </label>
            {error && (
              <p className="text-xs text-red-700" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-quiet"
                onClick={onClose}
                data-testid="button-cancel-entry"
              >
                Cancel
              </button>
              <button className="btn-primary" data-testid="button-save-entry">
                Save class
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
function Timetable(p: Shared) {
  const [editing, setEditing] = useState<TimetableEntry | null | undefined>(
      undefined,
    ),
    [subjectOpen, setSubjectOpen] = useState(false);
  const { state } = p;
  const weekly = sortWeeklyTimetable(state.timetable);
  const entryModal = editing !== undefined && (
    <TimetableForm
      initial={editing || undefined}
      subjects={state.subjects}
      entries={state.timetable}
      onClose={() => setEditing(undefined)}
      onSave={p.saveEntry}
      onCreateSubject={() => setSubjectOpen(true)}
    />
  );
  return (
    <>
      <PageHeader
        eyebrow="The weekly rhythm"
        title="Timetable"
        subtitle="See your full week, one class at a time."
        action={
          <div className="flex gap-2">
            <ImportModal {...p} />
            <button
              className="btn-primary"
              onClick={() => setEditing(null)}
              data-testid="button-add-entry"
            >
              <Plus size={16} />
              Add class
            </button>
          </div>
        }
      />
      {state.timetable.length === 0 ? (
        <div className="content-card mb-5">
          <Empty
            icon={CalendarDays}
            title="Your week is yours to fill"
            text="Start with a single class, build the week at your pace, or import a JSON timetable."
            action={
              <button
                className="btn-primary"
                onClick={() => setEditing(null)}
                data-testid="button-empty-add-entry"
              >
                <Plus size={15} />
                Add your first class
              </button>
            }
          />
        </div>
      ) : null}
      <div className="grid lg:grid-cols-2 gap-4">
        {days.map((day) => {
          const entries = weekly[day];
          return (
            <section
              className="content-card min-h-[118px]"
              key={day}
              data-testid={`day-column-${day.toLowerCase()}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif text-lg text-[#315141]">{day}</h2>
                <span className="text-[11px] rounded-full bg-[#eef1e9] text-[#758479] px-2 py-1">
                  {entries.length} {entries.length === 1 ? "class" : "classes"}
                </span>
              </div>
              {entries.length ? (
                <div className="space-y-2">
                  {entries.map((e) => {
                    const subject = state.subjects.find(
                      (s) => s.id === e.subjectId,
                    );
                    return (
                      <div
                        key={e.id}
                        className="rounded-xl bg-[#f2f4ed] px-3 py-3 flex gap-3 items-center"
                        data-testid={`row-timetable-${e.id}`}
                      >
                        <div className="w-1 self-stretch rounded-full bg-[#75a982]" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-[#334e40] truncate">
                            {subject?.name ?? "Unknown subject"}{" "}
                            <span className="text-[10px] uppercase text-muted-foreground">
                              {subject?.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#75847a] mt-1">
                            {formatTime(e.startTime)}–{formatTime(e.endTime)}
                            {e.room ? ` · ${e.room}` : ""}
                          </div>
                        </div>
                        <button
                          className="btn-quiet !p-2"
                          onClick={() => setEditing(e)}
                          data-testid={`button-edit-entry-${e.id}`}
                          aria-label={`Edit ${subject?.name ?? "class"}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-quiet !p-2"
                          onClick={() => p.removeEntry(e)}
                          data-testid={`button-delete-entry-${e.id}`}
                          aria-label="Delete class"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No classes scheduled.
                </p>
              )}
            </section>
          );
        })}
      </div>
      {entryModal}
      {subjectOpen && (
        <SubjectForm
          onClose={() => setSubjectOpen(false)}
          onSave={(subject) => {
            const saved = p.saveSubject(subject);
            if (saved) setSubjectOpen(false);
            return saved;
          }}
        />
      )}
    </>
  );
}

function Logger(p: Shared) {
  const today = todayIso();

  const holiday = p.state.holidays.find((h) => h.date === today);
  const isHoliday = Boolean(holiday);

  const entries = getClassesForDate(
    p.state.timetable,
    p.state.subjects,
    today,
  ).map((o) => o.entry);

  const todayEvents = p.state.events.filter((event) => event.date === today);

  const markHoliday = () => {
    if (todayEvents.length > 0) {
      p.notify(
        "Undo today's attendance records before marking today as a holiday.",
      );
      return;
    }

    p.update((current) => ({
      ...current,
      holidays: current.holidays.some((h) => h.date === today)
        ? current.holidays
        : [...current.holidays, { date: today, name: "Holiday" }],
    }));

    p.notify("Today marked as a holiday");
  };

  const removeHoliday = () => {
    p.update((current) => ({
      ...current,
      holidays: current.holidays.filter((h) => h.date !== today),
    }));

    p.notify("Holiday removed");
  };

  return (
    <>
      <PageHeader
        eyebrow="Daily attendance"
        title="Today's log"
        subtitle={`${dateLabel(today)} · mark each class once, and change it whenever you need.`}
        action={
          <Link
            className="btn-secondary"
            href="/history"
            data-testid="link-open-history"
          >
            <History size={16} />
            View history
          </Link>
        }
      />

      {isHoliday ? (
        <div className="content-card mb-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl w-11 h-11 grid place-items-center bg-[#edf2e9] text-[#577c60]">
                <CalendarDays size={20} />
              </div>

              <div>
                <div className="font-semibold text-[#314d3e]">
                  🎉 {holiday?.name ?? "Today is a holiday"}
                </div>

                <p className="text-sm text-muted-foreground mt-1">
                  No attendance will be recorded for today's scheduled classes.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={removeHoliday}
              data-testid="button-remove-holiday"
            >
              Remove holiday
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            className="btn-secondary"
            onClick={markHoliday}
            data-testid="button-mark-holiday"
          >
            <CalendarDays size={16} />
            Mark today as holiday
          </button>
        </div>
      )}

      <div className="content-card">
        {isHoliday ? (
          <Empty
            icon={CalendarDays}
            title="No attendance to log today"
            text="Today is marked as a holiday. Your scheduled classes will not affect attendance."
          />
        ) : entries.length ? (
          <div>
            {entries.map((e) => {
              const subject = p.state.subjects.find(
                (s) => s.id === e.subjectId,
              );

              const event = p.state.events.find(
                (x) => x.date === today && x.timetableEntryId === e.id,
              );

              return (
                <div
                  key={e.id}
                  className="row-divider first:border-0 py-5 flex flex-wrap items-center gap-4"
                  data-testid={`row-logger-${e.id}`}
                >
                  <div className="rounded-xl w-11 h-11 grid place-items-center bg-[#edf2e9] text-[#577c60]">
                    <Clock3 size={18} />
                  </div>

                  <div className="flex-1 min-w-[150px]">
                    <div
                      className="font-semibold text-[#314d3e]"
                      data-testid={`text-logger-subject-${e.id}`}
                    >
                      {subject?.name ?? "Unknown subject"}{" "}
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {subject?.type}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground mt-1">
                      {formatTime(e.startTime)}–{formatTime(e.endTime)}
                      {e.room ? ` · ${e.room}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => p.record(e, today, "present")}
                      className={
                        event?.status === "present"
                          ? "btn-secondary"
                          : "btn-quiet"
                      }
                      data-testid={`button-present-${e.id}`}
                    >
                      <Check size={15} />
                      Present
                    </button>

                    <button
                      type="button"
                      onClick={() => p.record(e, today, "absent")}
                      className={
                        event?.status === "absent" ? "btn-danger" : "btn-quiet"
                      }
                      data-testid={`button-absent-${e.id}`}
                    >
                      <X size={15} />
                      Absent
                    </button>

                    {event && (
                      <button
                        type="button"
                        onClick={() => p.reverse(event)}
                        className="btn-quiet"
                        data-testid={`button-undo-${e.id}`}
                        title="Undo this attendance record"
                      >
                        <RotateCcw size={15} />
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            icon={ListChecks}
            title="No classes on today's timetable"
            text="If you have a class today, add it to your weekly schedule first. Then it will be ready to log here."
            action={
              <Link
                href="/timetable"
                className="btn-primary"
                data-testid="button-logger-timetable"
              >
                <CalendarDays size={15} />
                Edit timetable
              </Link>
            }
          />
        )}
      </div>

      <div className="mt-4 rounded-xl p-4 text-xs text-[#66766b] bg-[#f0eee4] flex gap-2">
        <ShieldCheck size={15} className="shrink-0" />

        {isHoliday
          ? "Today is a holiday. No classes will be counted toward attendance."
          : "Every class can have one record per day. Choosing the other status corrects the existing record instead of counting a second class."}
      </div>
    </>
  );
}
function HistoryPage(p: Shared) {
  const [filter, setFilter] = useState("");
  const [eventPendingReversal, setEventPendingReversal] =
    useState<AttendanceEvent | null>(null);
  const events = [...p.state.events]
    .filter((e) => !filter || e.date === filter)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp),
    );
  const groups = events.reduce<Record<string, AttendanceEvent[]>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});
  return (
    <>
      <PageHeader
        eyebrow="Your real records"
        title="Attendance history"
        subtitle="Review what happened, correct a status, or reverse a record completely."
        action={
          <label className="text-xs text-muted-foreground">
            Choose a date{" "}
            <input
              type="date"
              className="field mt-1"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              data-testid="input-history-date"
            />
          </label>
        }
      />
      {!events.length ? (
        <div className="content-card">
          <Empty
            icon={History}
            title={
              filter
                ? "No records for that date"
                : "Your history starts with a class log"
            }
            text={
              filter
                ? "Try another date or clear your date filter."
                : "Once you log a class, its date and status will be preserved here."
            }
            action={
              filter ? (
                <button
                  className="btn-secondary"
                  onClick={() => setFilter("")}
                  data-testid="button-clear-history-filter"
                >
                  Clear date
                </button>
              ) : (
                <Link
                  className="btn-primary"
                  href="/logger"
                  data-testid="button-history-log"
                >
                  <ListChecks size={15} />
                  Log a class
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([date, rows]) => (
            <section
              className="content-card"
              key={date}
              data-testid={`history-day-${date}`}
            >
              <div className="font-serif text-lg text-[#314d3e] mb-2">
                {dateLabel(date)}
              </div>
              {rows.map((event) => {
                const subject = p.state.subjects.find(
                    (s) => s.id === event.subjectId,
                  ),
                  entry = p.state.timetable.find(
                    (e) => e.id === event.timetableEntryId,
                  );
                const name =
                  event.subjectName ?? subject?.name ?? "Removed subject";
                const type = event.classType ?? subject?.type;
                const startTime = event.startTime ?? entry?.startTime;
                const endTime = event.endTime ?? entry?.endTime;
                const room = event.room ?? entry?.room;
                return (
                  <div
                    key={event.id}
                    className="row-divider first:border-0 py-3 flex flex-wrap items-center gap-3"
                    data-testid={`row-history-${event.id}`}
                  >
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-medium text-sm text-[#385346]">
                        {name}{" "}
                        {type && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {type}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {startTime && endTime
                          ? `${formatTime(startTime)}–${formatTime(endTime)}`
                          : "Time unavailable"}
                        {room ? ` · ${room}` : ""}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {event.source} · recorded{" "}
                        {new Date(event.timestamp).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <button
                      className={`status-pill ${event.status === "present" ? "status-good" : "status-low"}`}
                      onClick={() =>
                        p.correct(
                          event,
                          event.status === "present" ? "absent" : "present",
                        )
                      }
                      title="Click to correct status"
                      data-testid={`button-correct-history-${event.id}`}
                    >
                      {event.status === "present" ? (
                        <>
                          <Check size={12} />
                          Present
                        </>
                      ) : (
                        <>
                          <X size={12} />
                          Absent
                        </>
                      )}{" "}
                      · correct
                    </button>
                    <button
                      className="btn-quiet text-xs"
                      onClick={() => setEventPendingReversal(event)}
                      data-testid={`button-reverse-history-${event.id}`}
                    >
                      <RotateCcw size={14} />
                      Reverse
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
      {eventPendingReversal && (
        <Modal
          title="Reverse this attendance record?"
          onClose={() => setEventPendingReversal(null)}
        >
          <p className="text-sm text-[#385346] mb-2">
            This will remove the record from attendance totals.
          </p>
          <p className="text-xs text-muted-foreground mb-5">
            The class count will be adjusted. You can log the class again later
            if needed.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setEventPendingReversal(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                p.reverse(eventPendingReversal);
                setEventPendingReversal(null);
              }}
            >
              <RotateCcw size={14} />
              Reverse record
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Planner(p: Shared) {
  const [tripName, setTripName] = useState("");
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);

  const saveTrip = () => {
    const name = tripName.trim();

    if (!name || !start || !end || end < start) {
      p.notify("Enter a trip name and valid dates.");
      return;
    }

    const duplicate = p.state.savedTrips.some(
      (trip) =>
        trip.name.trim().toLowerCase() === name.toLowerCase() &&
        trip.startDate === start &&
        trip.endDate === end,
    );

    if (duplicate) {
      p.notify("This trip is already saved.");
      return;
    }

    const trip = {
      id: crypto.randomUUID(),
      name,
      startDate: start,
      endDate: end,
    };

    p.update((current) => ({
      ...current,
      savedTrips: [...current.savedTrips, trip],
    }));

    setTripName("");
    p.notify("Trip saved successfully!");
  };

  const [start, setStart] = useState(
    () => sessionStorage.getItem("attendly-trip-start") ?? "",
  );
  const [end, setEnd] = useState(
    () => sessionStorage.getItem("attendly-trip-end") ?? "",
  );

  useEffect(() => {
    if (start) {
      sessionStorage.setItem("attendly-trip-start", start);
    } else {
      sessionStorage.removeItem("attendly-trip-start");
    }
  }, [start]);

  useEffect(() => {
    if (end) {
      sessionStorage.setItem("attendly-trip-end", end);
    } else {
      sessionStorage.removeItem("attendly-trip-end");
    }
  }, [end]);

  const projection = useMemo(
    () =>
      start && end && end >= start
        ? buildTripProjection(p.state, start, end)
        : null,
    [p.state, start, end],
  );
  const occurrences = useMemo(
    () =>
      start && end && end >= start
        ? enumerateOccurrences(p.state.timetable, p.state.subjects, start, end)
        : [],
    [start, end, p.state.timetable, p.state.subjects],
  );
  const stats = useMemo(
    () =>
      (projection?.subjects ?? []).map((row) => ({
        subject: row.subject,
        current: row.subject.delivered
          ? (row.subject.attended / row.subject.delivered) * 100
          : null,
        before: row.before.percentage,
        allClasses: row.attendAll.percentage,
        after: row.after.percentage,
        beforeTripClasses: row.beforeTripClasses,
        skipped: row.tripMisses,
        recovery: row.recoveryRequired,
        beforeAttended: row.before.attended,
        beforeDelivered: row.before.delivered,
        afterAttended: row.after.attended,
        afterDelivered: row.after.delivered,
        allAttended: row.attendAll.attended,
        allDelivered: row.attendAll.delivered,
      })),
    [projection],
  );
  const statsGroups = useMemo(() => {
    const groups = new Map<string, typeof stats>();
    for (const row of stats) {
      const key = row.subject.name.trim().toLocaleLowerCase();
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [stats]);
  const possible = start && end && end >= start;
  const totalSkips = projection?.duringTrip.length ?? occurrences.length;
  const currentTotals = aggregateAttendance(p.state.subjects);
  const allTotals = (which: "current" | "before" | "after" | "all") => {
    if (!projection) return null;
    const value =
      which === "current"
        ? currentTotals
        : which === "before"
          ? projection.overallBefore
          : which === "after"
            ? projection.overallAfter
            : projection.overallAttendAll;
    return value.percentage;
  };
  return (
    <>
      {tripToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-[#e1e7dc] bg-[#fffefa] p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-trip-title"
          >
            <h2
              id="delete-trip-title"
              className="text-lg font-semibold text-[#385346]"
            >
              Delete saved trip?
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this trip? This cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setTripToDelete(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  p.update((current) => ({
                    ...current,
                    savedTrips: current.savedTrips.filter(
                      (trip) => trip.id !== tripToDelete,
                    ),
                  }));
                  setTripToDelete(null);
                  p.notify("Trip deleted.");
                }}
              >
                Delete trip
              </button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        eyebrow="A what-if, not a record"
        title="Trip planner"
        subtitle="Explore how time away might affect attendance. Nothing on this page changes your actual records."
      />
      <div className="space-y-5">
        <section className="content-card">
          <div className="flex items-center gap-2 mb-1">
            <CalendarRange size={18} color="#5b9366" />
            <h2 className="section-title">Plan your dates</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            We'll count only scheduled class meetings within this date range.
          </p>

          <label>
            <span className="field-label">Trip name</span>
            <input
              type="text"
              className="field"
              placeholder="e.g. Diwali break"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              maxLength={60}
            />
          </label>

          <div className="space-y-4">
            <label>
              <span className="field-label">Leaving on</span>
              <input
                type="date"
                min={todayIso()}
                className="field"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                data-testid="input-trip-start"
              />
            </label>
            <label>
              <span className="field-label">Back on</span>
              <input
                type="date"
                className="field"
                value={end}
                min={start || todayIso()}
                onChange={(e) => setEnd(e.target.value)}
                data-testid="input-trip-end"
              />
            </label>
          </div>

          <button
            type="button"
            className="btn-primary w-full mt-4"
            onClick={saveTrip}
          >
            Save trip
          </button>

          {start && end && end < start && (
            <p className="mt-4 text-xs text-red-700" role="alert">
              Your return date must be on or after your departure.
            </p>
          )}
          <div className="mt-5 rounded-xl p-4 bg-[#edf3e9] text-xs leading-relaxed text-[#617767] flex gap-2">
            <ShieldCheck size={15} className="shrink-0" />
            Simulation only. Your subjects, log, and attendance totals are never
            edited by the planner.
          </div>
        </section>

        <section className="content-card">
          <h2 className="section-title mb-1">Saved trips</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Reopen a trip or remove an old plan.
          </p>

          {p.state.savedTrips.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved trips yet. Save a trip to see it here.
            </p>
          ) : (
            <div className="space-y-3">
              {p.state.savedTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="rounded-xl border border-[#e1e7dc] p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="font-medium text-[#385346]">{trip.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {trip.startDate} – {trip.endDate}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        sessionStorage.setItem(
                          "attendly-trip-start",
                          trip.startDate,
                        );
                        sessionStorage.setItem(
                          "attendly-trip-end",
                          trip.endDate,
                        );
                        setTripName(trip.name);
                        setStart(trip.startDate);
                        setEnd(trip.endDate);
                        p.notify(`Loaded "${trip.name}".`);
                      }}
                    >
                      Open
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"

                      onClick={() => setTripToDelete(trip.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="content-card">
          <div className="flex justify-between gap-3 items-start">
            <div>
              <h2 className="section-title">Projected attendance</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {possible
                  ? `${dateLabel(start, { month: "short", day: "numeric" })} – ${dateLabel(end, { month: "short", day: "numeric", year: "numeric" })}`
                  : "Choose a date range to see your projection."}
              </p>
            </div>
            <span
              className="text-xs rounded-full bg-[#edf2e9] px-3 py-1.5 text-[#607668]"
              data-testid="text-trip-occurrences"
            >
              {possible
                ? `${totalSkips} class ${totalSkips === 1 ? "meeting" : "meetings"}`
                : "No dates selected"}
            </span>
          </div>
          {possible && p.state.subjects.length ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5 mb-4">
                <ProjectionTile
                  label="Current"
                  value={allTotals("current")}
                  threshold={p.state.threshold}
                />
                <ProjectionTile
                  label="Before trip"
                  value={allTotals("before")}
                  threshold={p.state.threshold}
                />
                <ProjectionTile
                  label="After trip"
                  value={allTotals("after")}
                  threshold={p.state.threshold}
                />
                <ProjectionTile
                  label="If you attend all classes"
                  value={allTotals("all")}
                  threshold={p.state.threshold}
                />
              </div>
              {projection?.warningSubjects.length ? (
                <div
                  role="status"
                  className="rounded-xl bg-[#fff0cd] px-3 py-2 text-xs text-[#805716] mb-3"
                  data-testid="status-trip-warning"
                >
                  This trip would put below target:{" "}
                  {projection.warningSubjects.join(", ")}.
                </div>
              ) : null}

              {statsGroups.map((group) => {
                const total = (a: "current" | "before" | "after" | "all") => {
                  const attended = group.reduce(
                    (sum, row) =>
                      sum +
                      (a === "current"
                        ? row.subject.attended
                        : a === "before"
                          ? row.beforeAttended
                          : a === "after"
                            ? row.afterAttended
                            : row.allAttended),
                    0,
                  );
                  const delivered = group.reduce(
                    (sum, row) =>
                      sum +
                      (a === "current"
                        ? row.subject.delivered
                        : a === "before"
                          ? row.beforeDelivered
                          : a === "after"
                            ? row.afterDelivered
                            : row.allDelivered),
                    0,
                  );
                  return {
                    attended,
                    delivered,
                    percentage: delivered ? (attended / delivered) * 100 : null,
                  };
                };
                const current = total("current");
                const before = total("before");
                const after = total("after");
                const all = total("all");
                const hasBoth =
                  group.some((row) => row.subject.type === "Theory") &&
                  group.some((row) => row.subject.type === "Practical");
                return (
                  <div
                    key={group[0].subject.name.toLocaleLowerCase()}
                    className="rounded-2xl border border-[#e1e7dc] bg-[#fffefa] p-4 sm:p-5 mb-4 shadow-sm"
                    data-testid={`row-trip-subject-group-${group[0].subject.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-semibold text-lg text-[#385346]">
                          {group[0].subject.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Overall attendance: {current.attended}/
                          {current.delivered} classes
                        </p>
                        <p className="text-sm font-medium text-[#345340] mt-1">
                          {fmtPercent(current.percentage)} now →{" "}
                          {fmtPercent(after.percentage)} after your trip
                        </p>
                      </div>
                      <Pill
                        value={after.percentage}
                        threshold={p.state.threshold}
                        warningMargin={p.state.warningMargin}
                      />
                    </div>
                    <div className="space-y-3">
                      {group.map((row) => (
                        <div
                          key={row.subject.id}
                          className="rounded-xl border border-[#e5e9df] p-3"
                          data-testid={`row-trip-subject-${row.subject.id}`}
                        >
                          <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                            <div>
                              <div className="font-semibold text-sm text-[#385346]">
                                {row.subject.type === "Other"
                                  ? "Attendance"
                                  : row.subject.type}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {row.subject.attended} attended out of{" "}
                                {row.subject.delivered} classes
                              </p>
                            </div>
                            <Pill
                              value={row.after}
                              threshold={p.state.threshold}
                              warningMargin={p.state.warningMargin}
                            />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="rounded-lg bg-[#f2f4ed] p-3">
                              <div className="text-muted-foreground mb-1">
                                Current
                              </div>
                              <strong>{fmtPercent(row.current)}</strong>
                            </div>
                            <div className="rounded-lg bg-[#f2f4ed] p-3">
                              <div className="text-muted-foreground mb-1">
                                After trip
                              </div>
                              <strong>{fmtPercent(row.after)}</strong>
                            </div>
                            <div className="rounded-lg bg-[#f2f4ed] p-3">
                              <div className="text-muted-foreground mb-1">
                                Classes missed
                              </div>
                              <strong>{row.skipped}</strong>
                            </div>
                            <div className="rounded-lg bg-[#f2f4ed] p-3">
                              <div className="text-muted-foreground mb-1">
                                Recovery needed
                              </div>
                              <strong>
                                {row.recovery === null
                                  ? "Not attainable"
                                  : row.recovery === 0
                                    ? "None"
                                    : `${row.recovery} classes`}
                              </strong>
                            </div>
                          </div>
                          <details className="mt-3 group">
                            <summary className="cursor-pointer text-xs font-medium text-[#607668] hover:text-[#345340]">
                              More details
                            </summary>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-xs">
                              <div>
                                <span className="text-muted-foreground block mb-1">
                                  Before trip
                                </span>
                                <strong>{fmtPercent(row.before)}</strong>
                                <p className="text-muted-foreground mt-1">
                                  {row.beforeTripClasses} future classes
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground block mb-1">
                                  If you attend all classes
                                </span>
                                <strong>{fmtPercent(row.allClasses)}</strong>
                              </div>
                              <div>
                                <span className="text-muted-foreground block mb-1">
                                  Current attendance
                                </span>
                                <strong>
                                  {row.subject.attended} /{" "}
                                  {row.subject.delivered}
                                </strong>
                              </div>
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div
                className="mt-4 rounded-xl bg-[#f2f4ed] p-3"
                data-testid="list-trip-occurrences"
              >
                <div className="text-xs font-semibold text-[#3c5747] mb-2">
                  Classes and holidays in the selected dates
                </div>

                {(() => {
                  if (!projection) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        Choose a valid trip date range to see classes and
                        holidays.
                      </p>
                    );
                  }

                  const tripItems = [
                    ...projection.duringTrip.map((occurrence) => ({
                      date: occurrence.date,
                      kind: "class" as const,
                      occurrence,
                    })),

                    ...projection.holidays
                      .filter(
                        (holiday) =>
                          holiday.date >= start && holiday.date <= end,
                      )
                      .map((holiday) => ({
                        date: holiday.date,
                        kind: "holiday" as const,
                        holiday,
                      })),
                  ].sort((a, b) => a.date.localeCompare(b.date));

                  return tripItems.length > 0 ? (
                    <div className="max-h-48 overflow-auto space-y-2">
                      {tripItems.map((item, index) => (
                        <div
                          key={`${item.kind}-${item.date}-${index}`}
                          className="flex justify-between gap-3 text-xs"
                        >
                          {/* Keep the existing contents of this item's div here. */}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No classes or holidays fall within these dates.
                    </p>
                  );
                })()}
              </div>
              <div className="text-[11px] mt-4 text-muted-foreground flex gap-2">
                <AlertCircle size={14} className="shrink-0" />
                Recovery estimates assume you attend every future class for that
                subject.
              </div>
            </>
          ) : possible ? (
            <Empty
              icon={BookOpen}
              title="Add subjects to see a projection"
              text="The planner needs real class records and a timetable to estimate consequences."
              action={
                <Link
                  href="/subjects"
                  className="btn-secondary"
                  data-testid="button-trip-add-subject"
                >
                  Add subjects
                </Link>
              }
            />
          ) : (
            <div className="empty-state">
              <div className="empty-symbol">
                <Sparkles size={20} />
              </div>
              <div className="font-semibold text-sm text-[#3a5547]">
                Small plans, clearer choices
              </div>
              <p className="text-sm max-w-sm mx-auto mt-2">
                Choose your dates to see the specific class meetings, projected
                totals, and how many classes it may take to recover.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
function ProjectionTile({
  label,
  value,
  threshold,
}: {
  label: string;
  value: number | null;
  threshold: number;
}) {
  const style = statusFor(value, threshold);
  return (
    <div
      className={`rounded-xl p-3 ${style === "good" ? "bg-[#e8f2e7]" : style === "warn" ? "bg-[#fff2d8]" : style === "low" ? "bg-[#f9e9e4]" : "bg-[#f0f1eb]"}`}
    >
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div
        className="font-serif text-xl text-[#365543]"
        data-testid={`text-projection-${label.toLowerCase().replaceAll(" ", "-")}`}
      >
        {fmtPercent(value)}
      </div>
    </div>
  );
}

async function copyTextToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back for browsers that deny clipboard access.
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error("Clipboard access is unavailable.");
}

function ImportModal(p: Shared) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<ImportPreview | null>(null),
    [mode, setMode] = useState<"merge" | "replace">("merge"),
    [sourceMode, setSourceMode] = useState<"paste" | "upload">("paste"),
    [pastedJson, setPastedJson] = useState(""),
    [error, setError] = useState("");
  const duplicateCount = draft
    ? new Set([
        ...findExistingDuplicates(p.state.timetable, draft.entries),
        ...draft.duplicateEntryIndexes,
      ]).size
    : 0;
  const validateText = (text: string) => {
    setError("");
    setDraft(null);
    try {
      setDraft(parseTimetableImport(text));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not validate this JSON. Check the text and try again.",
      );
    }
  };
  const parseFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setDraft(null);
    try {
      validateText(await file.text());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read this file. Check that it is valid JSON.",
      );
    }
  };
  const closeModal = () => {
    setOpen(false);
    setDraft(null);
    setError("");
    setPastedJson("");
    setSourceMode("paste");
    setMode("merge");
  };
  const copyPrompt = async () => {
    try {
      await copyTextToClipboard(TIMETABLE_IMAGE_PROMPT);
      p.notify("AI prompt copied!");
    } catch {
      p.notify(
        "Could not copy the prompt. Check your browser clipboard permissions.",
      );
    }
  };
  const commit = () => {
    if (!draft) return;
    p.update((c) =>
      mode === "replace"
        ? replaceTimetable(c, draft, c.semester?.name)
        : mergeTimetable(c, draft),
    );
    closeModal();
    p.notify(mode === "replace" ? "Timetable replaced" : "Timetable imported");
  };
  return (
    <>
      <button
        className="btn-secondary"
        onClick={() => setOpen(true)}
        data-testid="button-import-timetable"
      >
        <Upload size={15} />
        Import timetable
      </button>
      {open && (
        <Modal
          title="Import your timetable"
          className="import-modal"
          onClose={closeModal}
        >
          {!draft ? (
            <>
              <div className="rounded-xl bg-[#edf2eb] p-4 text-sm leading-relaxed text-[#607468] mb-4">
                <div className="font-semibold text-[#385346] mb-1">
                  Bring in your weekly classes
                </div>
                <p>
                  Paste JSON from an AI or upload an existing JSON timetable.
                  Attendly checks it first and only changes your timetable after
                  you confirm the preview.
                </p>
              </div>
              <div
                className="flex gap-2 mb-4"
                aria-label="Choose how to provide timetable JSON"
              >
                <button
                  type="button"
                  aria-pressed={sourceMode === "paste"}
                  onClick={() => {
                    setSourceMode("paste");
                    setError("");
                  }}
                  className={
                    sourceMode === "paste" ? "btn-primary" : "btn-secondary"
                  }
                  data-testid="button-import-paste-tab"
                >
                  <span>Option 1</span>Paste JSON
                </button>
                <button
                  type="button"
                  aria-pressed={sourceMode === "upload"}
                  onClick={() => {
                    setSourceMode("upload");
                    setError("");
                  }}
                  className={
                    sourceMode === "upload" ? "btn-primary" : "btn-secondary"
                  }
                  data-testid="button-import-upload-tab"
                >
                  <span>Option 2</span>Upload JSON File
                </button>
              </div>
              {sourceMode === "paste" ? (
                <section
                  aria-label="Paste timetable JSON"
                  className="rounded-xl border border-[#e1e6dc] bg-white/60 p-4"
                >
                  <div className="font-semibold text-sm text-[#385346]">
                    Paste JSON
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Copy JSON generated by an AI and paste it here. Large
                    timetables are fine.
                  </p>
                  <label htmlFor="timetable-json-text" className="field-label">
                    Timetable JSON
                  </label>
                  <textarea
                    id="timetable-json-text"
                    className="field min-h-[240px] resize-y font-mono text-xs leading-relaxed"
                    rows={12}
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    placeholder="Paste your timetable JSON here..."
                    data-testid="input-import-json-text"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                    <span className="text-[11px] text-muted-foreground">
                      Nothing imports until you confirm the preview.
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => validateText(pastedJson)}
                      data-testid="button-validate-json"
                    >
                      <Check size={15} />
                      Validate JSON
                    </button>
                  </div>
                </section>
              ) : (
                <section
                  aria-label="Upload timetable JSON"
                  className="rounded-xl border border-[#e1e6dc] bg-white/60 p-4"
                >
                  <div className="font-semibold text-sm text-[#385346]">
                    Upload JSON
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Choose an existing .json timetable file. It uses the same
                    validation and preview as pasted JSON.
                  </p>
                  <label className="field-label">
                    Timetable file
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="field mt-2"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = "";
                        void parseFile(file);
                      }}
                      data-testid="input-import-file"
                    />
                  </label>
                </section>
              )}
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#edf3f7] p-4 mt-4">
                <div className="min-w-[190px] flex-1">
                  <div className="font-semibold text-sm text-[#3d5d6d]">
                    Need JSON from a timetable image?
                  </div>
                  <p className="text-xs text-[#637b89] mt-1">
                    Copy this prompt into an AI that can read your timetable
                    image, then paste the result above.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => void copyPrompt()}
                  data-testid="button-copy-image-prompt"
                >
                  <Copy size={15} />
                  Copy AI Prompt
                </button>
              </section>
              {error && (
                <div role="alert" className="text-xs text-red-700 mt-3">
                  {error}
                </div>
              )}
              <div className="flex justify-end mt-5">
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={closeModal}
                  data-testid="button-cancel-import"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-[#edf2eb] p-4 mb-4">
                <div
                  className="font-semibold text-sm text-[#385346]"
                  data-testid="text-import-preview"
                >
                  {draft.classCount} classes{" "}
                  {draft.valid ? "ready to import" : "found in preview"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {draft.subjectCount} subjects · {duplicateCount} matching
                  entries
                </div>
              </div>
              <div className="max-h-52 overflow-auto border rounded-xl px-3 mb-4">
                {draft.entries.map((e) => {
                  const subject = draft.subjects.find(
                    (s) => s.id === e.subjectId,
                  );
                  return (
                    <div
                      key={e.id}
                      className="row-divider first:border-0 py-2 text-xs flex justify-between gap-3"
                    >
                      <span className="min-w-0">
                        {subject?.name ?? "Unknown subject"}{" "}
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {subject?.type}
                        </span>{" "}
                        · {e.day}
                      </span>
                      <span className="shrink-0">
                        {formatTime(e.startTime)}–{formatTime(e.endTime)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {(draft.errors.length > 0 || draft.warnings.length > 0) && (
                <div className="text-xs text-amber-800 mb-3 max-h-24 overflow-auto">
                  <ul className="list-disc pl-4">
                    {[...draft.errors, ...draft.warnings]
                      .slice(0, 8)
                      .map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                  </ul>
                </div>
              )}
              <div className="field-label mb-2">If entries already exist</div>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setMode("merge")}
                  className={mode === "merge" ? "btn-primary" : "btn-secondary"}
                  data-testid="button-import-merge"
                >
                  Merge new entries
                </button>
                <button
                  type="button"
                  onClick={() => setMode("replace")}
                  className={
                    mode === "replace" ? "btn-primary" : "btn-secondary"
                  }
                  data-testid="button-import-replace"
                >
                  Replace timetable
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                {mode === "merge"
                  ? "Matching classes are kept once; your existing timetable stays in place."
                  : "Replace starts a fresh imported semester and clears current subject counts and attendance history. Download a backup first if you need to keep them."}
              </p>
              <div className="flex flex-wrap justify-between gap-2">
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => {
                    setDraft(null);
                    setError("");
                  }}
                  data-testid="button-import-back"
                >
                  {sourceMode === "paste"
                    ? "Edit pasted JSON"
                    : "Choose another file"}
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={closeModal}
                    data-testid="button-cancel-import-preview"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={commit}
                    disabled={!draft.valid || !draft.entries.length}
                    data-testid="button-confirm-import"
                  >
                    <Check size={15} />
                    Import timetable
                  </button>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="dialog-modal"
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="section-title">{title}</h2>
          <button
            onClick={onClose}
            className="btn-quiet !p-2"
            aria-label="Close dialog"
            data-testid="button-close-modal"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Settings(p: Shared) {
  const [semesterName, setSemesterName] = useState(
      p.state.semester?.name ?? "",
    ),
    [startDate, setStartDate] = useState(p.state.semester?.startDate ?? ""),
    [endDate, setEndDate] = useState(p.state.semester?.endDate ?? ""),
    [threshold, setThreshold] = useState(String(p.state.threshold)),
    [warningMargin, setWarningMargin] = useState(String(p.state.warningMargin)),
    [fileError, setFileError] = useState("");
  const [pendingBackup, setPendingBackup] = useState<AppState | null>(null);
  useEffect(() => {
    setSemesterName(p.state.semester?.name ?? "");
    setStartDate(p.state.semester?.startDate ?? "");
    setEndDate(p.state.semester?.endDate ?? "");
    setThreshold(String(p.state.threshold));
    setWarningMargin(String(p.state.warningMargin));
  }, [p.state.semester, p.state.threshold, p.state.warningMargin]);
  const saveSettings = () => {
    const n = Number(threshold),
      thresholdIssue = validateThreshold(n);
    if (thresholdIssue) {
      p.notify(thresholdIssue);
      return;
    }
    const margin = Number(warningMargin);
    if (!Number.isInteger(margin) || margin < 0 || margin > 30) {
      p.notify("Choose a warning range from 0 to 30 percentage points.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      p.notify("The semester end date must be after its start date.");
      return;
    }
    p.update((c) => ({
      ...c,
      threshold: n,
      warningMargin: margin,
      semester: {
        ...(c.semester ?? createSemester()),
        name: semesterName.trim() || "My semester",
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
    }));
    p.notify("Preferences saved");
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(p.state, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `attendly-backup-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    p.notify("Backup downloaded");
  };
  const importBackup = async (file?: File) => {
    setFileError("");
    if (!file) return;
    try {
      const next = parseBackup(await file.text());
      setPendingBackup(next);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Could not read backup.");
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Make it yours"
        title="Settings"
        subtitle="Choose what counts as on track and keep a portable copy of your semester."
      />
      <div className="grid lg:grid-cols-2 gap-5">
        <section className="content-card">
          <div className="flex gap-3 items-center mb-5">
            <div className="empty-symbol !m-0">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h2 className="section-title">Semester preferences</h2>
              <p className="text-xs text-muted-foreground mt-1">
                These preferences stay on this device.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <label>
              <span className="field-label">Semester name</span>
              <input
                className="field"
                value={semesterName}
                onChange={(e) => setSemesterName(e.target.value)}
                data-testid="input-semester-name"
                placeholder="My semester"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="field-label">
                  Starts{" "}
                  <span className="font-normal text-muted-foreground">
                    optional
                  </span>
                </span>
                <input
                  type="date"
                  className="field"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-semester-start"
                />
              </label>
              <label>
                <span className="field-label">
                  Ends{" "}
                  <span className="font-normal text-muted-foreground">
                    optional
                  </span>
                </span>
                <input
                  type="date"
                  className="field"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-semester-end"
                />
              </label>
            </div>
            <label>
              <span className="field-label">Attendance target</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={threshold}
                  className="flex-1 accent-[#4e7658]"
                  onChange={(e) => setThreshold(e.target.value)}
                  data-testid="input-threshold-slider"
                />
                <div className="relative w-20">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="field pr-8"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    data-testid="input-threshold"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <span className="block text-[11px] text-muted-foreground mt-2">
                On-track status is based on this threshold.
              </span>
            </label>
            <label>
              <span className="field-label">Warning range above target</span>
              <div className="relative w-28">
                <input
                  type="number"
                  min="0"
                  max="30"
                  className="field pr-8"
                  value={warningMargin}
                  onChange={(e) => setWarningMargin(e.target.value)}
                  data-testid="input-warning-margin"
                />
                <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
                  pts
                </span>
              </div>
              <span className="block text-[11px] text-muted-foreground mt-2">
                A subject within this many points above target is marked
                Warning.
              </span>
            </label>
            <button
              className="btn-primary"
              onClick={saveSettings}
              data-testid="button-save-settings"
            >
              <Check size={15} />
              Save preferences
            </button>
          </div>
        </section>
        <section className="content-card">
          <div className="flex gap-3 items-center mb-5">
            <div className="empty-symbol !m-0">
              <Download size={18} />
            </div>
            <div>
              <h2 className="section-title">Your data, in your hands</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Download a backup or restore one on this device.
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-[#f0f2eb] p-4 text-xs text-[#68786d] leading-relaxed mb-4">
            Your data is saved in this browser's local storage. Backups include
            your timetable, subject counts, attendance history, semester
            preferences, and threshold.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={exportData}
              data-testid="button-export-backup"
            >
              <Download size={15} />
              Download backup
            </button>
            <label className="btn-secondary cursor-pointer">
              <Upload size={15} />
              Restore backup
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                onChange={(e) => void importBackup(e.target.files?.[0])}
                data-testid="input-restore-backup"
              />
            </label>
          </div>
          {fileError && (
            <p className="text-xs text-red-700 mt-3" role="alert">
              {fileError}
            </p>
          )}
        </section>
        <section className="content-card lg:col-span-2">
          <div className="flex items-start gap-3">
            <ShieldCheck size={19} color="#5b9366" />
            <div>
              <h2 className="font-semibold text-sm text-[#385346]">
                Private by design
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                This version stores information on this device only. The trip
                planner is isolated from attendance records; exporting a backup
                is the only way to move data to another browser.
              </p>
            </div>
          </div>
        </section>
      </div>
      {pendingBackup && (
        <Modal
          title="Restore this backup?"
          onClose={() => setPendingBackup(null)}
        >
          <p className="text-sm text-[#385346] mb-5">
            This will replace your current semester data. Make sure you have a
            backup of anything you want to keep.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setPendingBackup(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                p.update(() => pendingBackup);
                setPendingBackup(null);
                p.notify("Backup restored");
              }}
            >
              Restore backup
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default App;
