import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Heart,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SquareCheckBig,
  Video,
  MapPin,
  Info,
  AlertCircle,
  Eye,
} from "lucide-react";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import { api } from "./api";
import "./styles.css";

const date = (value, options = {}) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...options,
  });
const time = (value) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
const short = (value) =>
  value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "Awaiting confirmation";
const initials = (name) =>
  name
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["appointments", "Appointments", CalendarDays],
  ["records", "Medical records", FileText],
  ["tasks", "Care tasks", SquareCheckBig],
  ["people", "Care network", Users],
  ["network", "Blockchain explorer", Network],
];
function Brand() {
  return (
    <a className="brand" href="#overview" aria-label="CareLedger home">
      <span className="brand-symbol">
        <Activity size={23} />
      </span>
      careledger<span className="brand-dot">.</span>
    </a>
  );
}
function Badge({ children, tone = "green" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Seal({ event }) {
  return event.status === "confirmed" ? (
    <span className="seal">
      <ShieldCheck size={13} /> On-chain
    </span>
  ) : (
    <span className="seal pending">
      <Clock3 size={13} /> Pending anchor
    </span>
  );
}
function Avatar({ name, size = "normal", index = 0 }) {
  return (
    <span className={`avatar ${size} color-${index % 4}`}>
      {initials(name || "Care Team")}
    </span>
  );
}
function Empty({ icon: Icon = FileText, title, description, action }) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Button({ children, busy, variant = "", ...props }) {
  return (
    <button
      className={`button ${variant}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy ? <LoaderCircle className="spin" size={16} /> : null}
      {children}
    </button>
  );
}
function App() {
  const [auth, setAuth] = useState(null),
    [boot, setBoot] = useState(true),
    [bootError, setBootError] = useState(""),
    [data, setData] = useState(null),
    [network, setNetwork] = useState(null),
    [route, setRoute] = useState(location.hash.slice(1) || "overview"),
    [toast, setToast] = useState(null),
    [drawer, setDrawer] = useState(null),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toastTimer = useRef();
  const currentUser = useRef(null);
  currentUser.current = auth?.user.id || null;
  const notify = useCallback((message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const refresh = useCallback(async () => {
    const owner = currentUser.current;
    const [workspace, chain] = await Promise.allSettled([
      api("/workspace"),
      api("/network"),
    ]);
    if (currentUser.current !== owner) return;
    if (workspace.status === "rejected") throw workspace.reason;
    setData(workspace.value);
    if (chain.status === "fulfilled") {
      setNetwork(chain.value);
      setError("");
    } else {
      setError(
        "The blockchain connection is unavailable. You can continue working; new commitments remain pending until the connection recovers.",
      );
    }
  }, []);
  useEffect(() => {
    api("/auth/me")
      .then(setAuth)
      .catch((e) => {
        if (e.status !== 401) setBootError(e.message);
      })
      .finally(() => setBoot(false));
    return () => clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    const handler = () => {
      setRoute(location.hash.slice(1) || "overview");
      setMenu(false);
      setSearch("");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (!auth) return;
    let active = true;
    const update = () =>
      refresh().catch((e) => {
        if (active) {
          if (e.status === 401) {
            setAuth(null);
            setData(null);
          } else setError(e.message);
        }
      });
    update();
    const interval = setInterval(update, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [auth, refresh]);
  async function mutate(path, body) {
    setBusy(true);
    try {
      await api(path, { method: "POST", body });
      await refresh();
      setDrawer(null);
      notify("Saved. Blockchain verification is tracked with your record.");
    } catch (e) {
      notify(e.message, "error");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setAuth(null);
      setData(null);
      setNetwork(null);
      setDrawer(null);
    } catch (e) {
      notify(e.message, "error");
    }
  }
  if (boot)
    return (
      <div className="boot">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Opening your secure workspace</p>
      </div>
    );
  if (!auth)
    return (
      <>
        <Login onLogin={setAuth} initialError={bootError} />
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </>
    );
  const user = auth.user;
  const doctor = user.role === "doctor";
  const events = data?.events || [];
  const records = events.filter((e) => e.kind === "record.created");
  const completed = new Set(
    events
      .filter((e) => e.kind === "task.completed")
      .map((e) => e.payload.taskId),
  );
  const tasks = events
    .filter((e) => e.kind === "task.created")
    .map((e) => ({ ...e, done: completed.has(e.id) }));
  const appointments = events
    .filter(
      (e) =>
        e.kind === "appointment.created" &&
        (!doctor || e.payload.doctor === user.id),
    )
    .map((e) => ({
      ...e,
      state: events.some(
        (s) =>
          s.kind === "appointment.cancelled" &&
          s.payload.appointmentId === e.id,
      )
        ? "Cancelled"
        : events.some(
              (s) =>
                s.kind === "appointment.confirmed" &&
                s.payload.appointmentId === e.id,
            )
          ? "Confirmed"
          : "Requested",
    }))
    .sort((a, b) => new Date(a.payload.at) - new Date(b.payload.at));
  const people = data?.patients || [];
  const person = (id) => people.find((p) => p.id === id)?.name || "Patient";
  const openForm = (kind) => setDrawer({ kind });
  const query = search.toLowerCase();
  const filter = (list) =>
    list.filter((e) =>
      `${e.payload.title} ${person(e.patient)} ${e.payload.content || ""}`
        .toLowerCase()
        .includes(query),
    );
  const title =
    nav.find((n) => n[0] === route)?.[1] ||
    (route === "settings" ? "Settings" : "Overview");
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Brand />
        <div className="workspace-label">
          <span className="clinic-icon">
            <Stethoscope size={17} />
          </span>
          <div>
            Clinical workspace
            <small>{doctor ? "Doctor portal" : "Patient portal"}</small>
          </div>
          <Badge tone="neutral">{doctor ? "MD" : "PT"}</Badge>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(([key, label, Icon]) => (
            <a
              key={key}
              href={`#${key}`}
              className={route === key ? "active" : ""}
              aria-current={route === key ? "page" : undefined}
            >
              <Icon size={19} />
              {key === "people"
                ? doctor
                  ? "My patients"
                  : "My care team"
                : label}
              {key === "tasks" &&
              tasks.filter((t) => !t.done && t.payload.assignee === user.role)
                .length > 0 ? (
                <span className="nav-count">
                  {
                    tasks.filter(
                      (t) => !t.done && t.payload.assignee === user.role,
                    ).length
                  }
                </span>
              ) : null}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={20} />
            <strong>Your care. Cryptographically secured.</strong>
            <p>
              Encrypted records.
              <br />
              Verifiable history.
            </p>
            <a href="#network">
              Explore the network <ArrowUpRight size={14} />
            </a>
          </div>
          <a
            className={
              route === "settings" ? "settings-link active" : "settings-link"
            }
            href="#settings"
          >
            <Settings2 size={18} />
            Settings & privacy
          </a>
          <div className="sidebar-profile">
            <Avatar name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <small>{doctor ? "Verified clinician" : "Patient account"}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <i className={error ? "offline" : ""} />
              {network
                ? network.mode === "local"
                  ? "Local EVM connected"
                  : "Sepolia / EVM connected"
                : "Connecting"}
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button notification"
              aria-label="View recent activity"
              onClick={() => setDrawer({ kind: "activity" })}
            >
              <Bell size={19} />
              {events.some((e) => e.status === "pending") && <i />}
            </button>
            <Avatar name={user.name} size="small" />
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <h1>
                {route === "overview" ? (
                  <>
                    Good{" "}
                    {new Date().getHours() < 12
                      ? "morning"
                      : new Date().getHours() < 17
                        ? "afternoon"
                        : "evening"}
                    ,{" "}
                    <em>
                      {doctor
                        ? user.name.split(" ").slice(-1)[0]
                        : user.name.split(" ")[0]}
                      .
                    </em>
                  </>
                ) : (
                  title
                )}
              </h1>
              <p>
                {route === "overview"
                  ? doctor
                    ? "A little clarity for your day. Better care for every patient."
                    : "Your health, your records, your peace of mind."
                  : {
                      appointments:
                        "Make room for better care. Keep every visit in view.",
                      records:
                        "A complete care history, with a verifiable trail.",
                      tasks: "Small steps today. Better health tomorrow.",
                      people: doctor
                        ? "The people who have entrusted you with their care."
                        : "You decide who can access your medical history.",
                      network:
                        "Follow the commitments behind your care, block by block.",
                      settings: "Manage your identity, data, and privacy.",
                    }[route] || ""}
              </p>
            </div>
            <div className="heading-actions">
              {route === "overview" ? (
                <span className="date-chip">
                  <CalendarDays size={16} />
                  {date(new Date(), { weekday: "short", year: "numeric" })}
                </span>
              ) : null}
              {["overview", "appointments"].includes(route) ? (
                <Button onClick={() => openForm("appointment")}>
                  <Plus size={17} />
                  {doctor ? "New appointment" : "Book appointment"}
                </Button>
              ) : route === "records" && doctor ? (
                <Button onClick={() => openForm("record")}>
                  <Plus size={17} />
                  Add medical record
                </Button>
              ) : route === "tasks" ? (
                <Button onClick={() => openForm("task")}>
                  <Plus size={17} />
                  Create task
                </Button>
              ) : route === "records" ? (
                <a className="button secondary" href="/api/export" download>
                  <ArrowDownToLine size={16} />
                  Export records
                </a>
              ) : null}
            </div>
          </div>
          {data?.evaluation && (
            <div className="evaluation-banner">
              <Info size={14} />
              Evaluation workspace: All people and clinical content shown here
              are synthetic.
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              {error}
              <button
                onClick={() => refresh().catch((e) => setError(e.message))}
              >
                Retry
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading-panel">
              <LoaderCircle className="spin" />
              Loading your care workspace…
            </div>
          ) : (
            <>
              {route === "overview" && (
                <>
                  <div className="overview-stats">
                    <Stat
                      label={
                        doctor ? "Appointments today" : "Upcoming appointments"
                      }
                      value={
                        appointments.filter(
                          (a) =>
                            a.state !== "Cancelled" &&
                            (doctor
                              ? a.payload.at.startsWith(today())
                              : new Date(a.payload.at) >= new Date()),
                        ).length
                      }
                      icon={CalendarDays}
                      caption={
                        doctor
                          ? "Your schedule, at a glance"
                          : "Care that fits your schedule"
                      }
                      tone="green"
                    />
                    <Stat
                      label={
                        doctor ? "Patients in your care" : "Medical records"
                      }
                      value={doctor ? people.length : records.length}
                      icon={doctor ? Users : FileText}
                      caption={
                        doctor
                          ? "Connected through patient consent"
                          : "Your complete care history"
                      }
                      tone="purple"
                    />
                    <Stat
                      label="Tasks to complete"
                      value={
                        tasks.filter(
                          (t) => !t.done && t.payload.assignee === user.role,
                        ).length
                      }
                      icon={SquareCheckBig}
                      caption="Every follow-up matters"
                      tone="amber"
                    />
                    <Stat
                      label="Records anchored"
                      value={
                        records.filter((e) => e.status === "confirmed").length
                      }
                      icon={ShieldCheck}
                      caption={`${records.filter((e) => e.status === "pending").length} waiting for confirmation`}
                      tone="blue"
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel agenda">
                      <PanelHeader
                        title={
                          doctor
                            ? "Your appointment agenda"
                            : "Your upcoming care"
                        }
                        subtitle={date(new Date(), {
                          weekday: "long",
                          year: "numeric",
                        })}
                        action={
                          <a href="#appointments">
                            View schedule <ArrowRight size={15} />
                          </a>
                        }
                      />
                      <div className="agenda-tabs">
                        <span className="selected">Upcoming visits</span>
                        <span>
                          {
                            appointments.filter(
                              (a) =>
                                a.state !== "Cancelled" &&
                                new Date(a.payload.at) >= new Date(),
                            ).length
                          }{" "}
                          appointments
                        </span>
                      </div>
                      {appointments
                        .filter(
                          (a) =>
                            a.state !== "Cancelled" &&
                            new Date(a.payload.at) >= new Date(),
                        )
                        .slice(0, 4)
                        .map((a, i) => (
                          <div className="agenda-row" key={a.id}>
                            <div className="agenda-time">
                              {time(a.payload.at)}
                              <small>{date(a.payload.at)}</small>
                            </div>
                            <span className="agenda-dot" />
                            <Avatar
                              name={
                                doctor
                                  ? a.payload.patientName
                                  : a.payload.doctorName
                              }
                              index={i}
                            />
                            <div className="agenda-person">
                              <strong>
                                {doctor
                                  ? a.payload.patientName
                                  : a.payload.doctorName}
                              </strong>
                              <span>{a.payload.title}</span>
                            </div>
                            <span className="visit-type">
                              {a.payload.type === "In person" ? (
                                <MapPin size={13} />
                              ) : (
                                <Video size={13} />
                              )}
                              {a.payload.type}
                            </span>
                            <Badge
                              tone={a.state === "Confirmed" ? "green" : "amber"}
                            >
                              {a.state}
                            </Badge>
                            <button
                              className="icon-button"
                              aria-label={`Open appointment for ${a.payload.title}`}
                              onClick={() =>
                                setDrawer({
                                  kind: "appointment-detail",
                                  event: a,
                                })
                              }
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </div>
                        ))}
                      {!appointments.some(
                        (a) =>
                          a.state !== "Cancelled" &&
                          new Date(a.payload.at) >= new Date(),
                      ) && (
                        <Empty
                          icon={CalendarDays}
                          title="A little room in your day"
                          description="Book a visit to start planning your next step in care."
                          action={
                            <Button
                              variant="secondary"
                              onClick={() => openForm("appointment")}
                            >
                              Book a visit
                            </Button>
                          }
                        />
                      )}
                      <div className="panel-footer">
                        <span>
                          <Clock3 size={14} />
                          Appointments reserve a 30-minute window
                        </span>
                        <a href="#appointments">
                          See all <ArrowRight size={14} />
                        </a>
                      </div>
                    </section>
                    <section className="care-highlight">
                      <div className="highlight-logo">
                        <Heart size={23} />
                        <span>CARE, CONNECTED</span>
                      </div>
                      <h2>
                        Good care starts
                        <br />
                        with the full picture.
                      </h2>
                      <p>
                        {doctor
                          ? "Bring every note, next step, and patient into one thoughtful workspace."
                          : "Keep your care story together, and share it with the people you trust."}
                      </p>
                      <a href={doctor ? "#records" : "#people"}>
                        {doctor
                          ? "Open medical records"
                          : "Manage your care team"}
                        <ArrowUpRight size={17} />
                      </a>
                      <div className="highlight-art" aria-hidden="true">
                        <div className="orbit one" />
                        <div className="orbit two" />
                        <div className="orbit three" />
                        <div className="art-center">
                          <Activity size={36} />
                        </div>
                        <span className="orbit-point p1" />
                        <span className="orbit-point p2" />
                        <span className="orbit-point p3" />
                      </div>
                    </section>
                    <section className="panel">
                      <PanelHeader
                        title="Recent medical records"
                        subtitle="The latest chapter in the care journey"
                        action={
                          <a href="#records">
                            View all records <ArrowRight size={15} />
                          </a>
                        }
                      />
                      <RecordTable
                        records={records.slice(0, 4)}
                        doctor={doctor}
                        person={person}
                        onOpen={(event) =>
                          setDrawer({ kind: "record-detail", event })
                        }
                      />
                    </section>
                    <section className="panel task-panel">
                      <PanelHeader
                        title="On your care list"
                        subtitle="Keep the important things moving"
                        action={
                          <button
                            className="text-button"
                            onClick={() => openForm("task")}
                          >
                            <Plus size={16} />
                            Add task
                          </button>
                        }
                      />
                      {tasks
                        .filter(
                          (t) => !t.done && t.payload.assignee === user.role,
                        )
                        .slice(0, 3)
                        .map((t) => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            person={person}
                            user={user}
                            busy={busy}
                            complete={() =>
                              mutate(`/tasks/${t.id}/complete`, {}).catch(
                                () => {},
                              )
                            }
                          />
                        ))}
                      {!tasks.some(
                        (t) => !t.done && t.payload.assignee === user.role,
                      ) && (
                        <Empty
                          icon={CheckCheck}
                          title="You're all caught up"
                          description="Your completed care tasks remain in the audit history."
                        />
                      )}
                      <a className="task-all" href="#tasks">
                        View all care tasks <ArrowRight size={15} />
                      </a>
                    </section>
                  </div>
                  <div className="trust-strip">
                    <span>
                      <ShieldCheck size={17} />
                      <strong>
                        A verifiable foundation for every care decision.
                      </strong>{" "}
                      Medical data stays encrypted off-chain.
                    </span>
                    <a href="#network">
                      View blockchain explorer <ArrowRight size={15} />
                    </a>
                  </div>
                </>
              )}
              {route === "records" && (
                <section className="panel">
                  <div className="list-toolbar">
                    <div className="toolbar-tabs">
                      <span>
                        All records <b>{records.length}</b>
                      </span>
                    </div>
                    <SearchField
                      value={search}
                      onChange={setSearch}
                      label="Search records"
                    />
                  </div>
                  <RecordTable
                    records={filter(records)}
                    doctor={doctor}
                    person={person}
                    onOpen={(event) =>
                      setDrawer({ kind: "record-detail", event })
                    }
                  />
                </section>
              )}
              {route === "appointments" && (
                <section className="panel">
                  <div className="list-toolbar">
                    <h2>
                      Your appointments{" "}
                      <span className="count">{appointments.length}</span>
                    </h2>
                    <SearchField
                      value={search}
                      onChange={setSearch}
                      label="Search appointments"
                    />
                  </div>
                  <div className="appointments-list">
                    {filter(appointments).map((a) => (
                      <button
                        className="appointment-card"
                        key={a.id}
                        onClick={() =>
                          setDrawer({ kind: "appointment-detail", event: a })
                        }
                      >
                        <div className="day-block">
                          <b>{new Date(a.payload.at).getDate()}</b>
                          <span>
                            {new Date(a.payload.at).toLocaleDateString(
                              undefined,
                              { month: "short" },
                            )}
                          </span>
                        </div>
                        <div className="appointment-summary">
                          <h3>{a.payload.title}</h3>
                          <p>
                            {doctor
                              ? a.payload.patientName
                              : a.payload.doctorName}{" "}
                            · {a.payload.type}
                          </p>
                        </div>
                        <div className="appointment-meta">
                          <span>
                            <Clock3 size={14} />
                            {time(a.payload.at)}
                          </span>
                          <Badge
                            tone={
                              a.state === "Confirmed"
                                ? "green"
                                : a.state === "Cancelled"
                                  ? "neutral"
                                  : "amber"
                            }
                          >
                            {a.state}
                          </Badge>
                        </div>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                    {!filter(appointments).length && (
                      <Empty
                        icon={CalendarDays}
                        title="No appointments found"
                        description="Your booked visits will appear here. Try another search or book a visit."
                      />
                    )}
                  </div>
                </section>
              )}
              {route === "tasks" && (
                <section className="panel">
                  <div className="list-toolbar">
                    <h2>
                      Care checklist{" "}
                      <span className="count">
                        {tasks.filter((t) => !t.done).length} open
                      </span>
                    </h2>
                    <SearchField
                      value={search}
                      onChange={setSearch}
                      label="Search care tasks"
                    />
                  </div>
                  {filter(tasks).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      person={person}
                      user={user}
                      busy={busy}
                      complete={() =>
                        mutate(`/tasks/${t.id}/complete`, {}).catch(() => {})
                      }
                    />
                  ))}
                  {!filter(tasks).length && (
                    <Empty
                      icon={SquareCheckBig}
                      title="A clear path ahead"
                      description="Create a care task with a due date and an assigned role."
                    />
                  )}
                </section>
              )}
              {route === "people" && (
                <section className="panel">
                  <PanelHeader
                    title={
                      doctor
                        ? "Patients who have granted access"
                        : "Your trusted care team"
                    }
                    subtitle={
                      doctor
                        ? "Access is controlled by each patient and can be withdrawn at any time."
                        : "Grant access to share your records. Revoke it whenever you choose."
                    }
                  />
                  {doctor ? (
                    <div className="people-grid">
                      {people.map((p, i) => (
                        <div className="person-card" key={p.id}>
                          <Avatar name={p.name} size="large" index={i} />
                          <h3>{p.name}</h3>
                          <p>{p.email}</p>
                          <Badge>
                            <ShieldCheck size={12} />
                            Consent active
                          </Badge>
                          <div className="person-summary">
                            <span>
                              {records.filter((e) => e.patient === p.id).length}{" "}
                              records
                            </span>
                            <span>
                              {
                                appointments.filter((e) => e.patient === p.id)
                                  .length
                              }{" "}
                              visits
                            </span>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setRoute("records");
                              location.hash = "records";
                              setSearch(p.name);
                            }}
                          >
                            View care history <ArrowRight size={15} />
                          </Button>
                        </div>
                      ))}
                      {!people.length && (
                        <Empty
                          icon={Users}
                          title="Care begins with consent"
                          description="Patients will appear here after granting you access from their care team page."
                        />
                      )}
                    </div>
                  ) : (
                    <div className="doctor-list">
                      {data.doctors.map((d, i) => (
                        <div className="doctor-row" key={d.id}>
                          <Avatar name={d.name} index={i} />
                          <div>
                            <h3>{d.name}</h3>
                            <p>{d.specialty || "Clinical care"}</p>
                          </div>
                          <Badge tone={d.granted ? "green" : "neutral"}>
                            {d.granted ? "Access granted" : "No access"}
                          </Badge>
                          <Button
                            variant={d.granted ? "secondary" : "primary"}
                            busy={busy}
                            onClick={() =>
                              mutate("/access", {
                                doctor: d.id,
                                active: !d.granted,
                              }).catch(() => {})
                            }
                          >
                            {d.granted ? "Revoke access" : "Grant access"}
                          </Button>
                        </div>
                      ))}
                      {!data.doctors.length && (
                        <Empty
                          icon={Stethoscope}
                          title="Your care team is taking shape"
                          description="Verified doctors appear here after your clinic provisions their accounts."
                        />
                      )}
                    </div>
                  )}
                </section>
              )}
              {route === "network" && (
                <NetworkPage network={network} notify={notify} />
              )}
              {route === "settings" && (
                <div className="settings-grid">
                  <section className="panel">
                    <PanelHeader
                      title="Your account"
                      subtitle="Your clinical workspace identity"
                    />
                    <div className="settings-content">
                      <Avatar name={user.name} size="large" />
                      <h2>{user.name}</h2>
                      <p>{user.email}</p>
                      <Badge>{doctor ? "Verified doctor" : "Patient"}</Badge>
                      <dl>
                        <dt>Account ID</dt>
                        <dd className="mono">{user.id}</dd>
                        <dt>Session lifetime</dt>
                        <dd>8 hours · secure HTTP-only cookie</dd>
                        <dt>Medical content encryption</dt>
                        <dd>AES-256-GCM with authenticated metadata</dd>
                      </dl>
                      <Button variant="secondary" onClick={logout}>
                        <LogOut size={16} />
                        Sign out securely
                      </Button>
                    </div>
                  </section>
                  <section className="panel">
                    <PanelHeader
                      title="Your data, in your hands"
                      subtitle="Understand what is stored and where"
                    />
                    <div className="settings-content privacy-copy">
                      <ShieldCheck size={32} />
                      <h3>
                        Private by design. Verifiable by anyone with access.
                      </h3>
                      <p>
                        Clinical content is encrypted in the application
                        database. Only opaque event identifiers and
                        cryptographic commitments are written to the blockchain.
                      </p>
                      <p>
                        Doctors can read your care history only while your
                        consent is active. Revoking access stops future
                        application access; it cannot retract information
                        already read or exported.
                      </p>
                      <p>
                        Records are append-only. A correction creates a new
                        medical record so the earlier care history remains
                        intact.
                      </p>
                      <a
                        className="button secondary"
                        href="/api/export"
                        download
                      >
                        <ArrowDownToLine size={16} />
                        Download my accessible data
                      </a>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              CareLedger <span>·</span> Connected care. Verified.
            </span>
            <span>
              <LockKeyhole size={12} />
              Your medical content stays off-chain
            </span>
          </footer>
        </main>
      </div>
      {drawer && (
        <Drawer
          drawer={drawer}
          onClose={() => setDrawer(null)}
          data={data}
          user={user}
          person={person}
          mutate={mutate}
          busy={busy}
          notify={notify}
          events={events}
        />
      )}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
function Toast({ toast, onClose }) {
  return (
    <div
      className={`toast ${toast.type}`}
      role={toast.type === "error" ? "alert" : "status"}
    >
      {toast.type === "error" ? (
        <AlertCircle size={19} />
      ) : (
        <CheckCircle2 size={19} />
      )}
      <span>{toast.message}</span>
      <button aria-label="Dismiss notification" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
function SearchField({ value, onChange, label }) {
  return (
    <label className="search-field">
      <Search size={16} />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Stat({ label, value, icon: Icon, caption, tone }) {
  return (
    <section className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <p>{caption}</p>
    </section>
  );
}
function PanelHeader({ title, subtitle, action }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function RecordTable({ records, doctor, person, onOpen }) {
  return records.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>RECORD</th>
            {doctor && <th>PATIENT</th>}
            <th>ADDED ON</th>
            <th>VERIFICATION</th>
            <th>
              <span className="sr-only">Open record</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={r.id}>
              <td>
                <button className="record-title" onClick={() => onOpen(r)}>
                  <span className={`file-icon color-${i % 4}`}>
                    <FileText size={19} />
                  </span>
                  <span>
                    <strong>{r.payload.title}</strong>
                    <small>{r.payload.category}</small>
                  </span>
                </button>
              </td>
              {doctor && <td>{person(r.patient)}</td>}
              <td className="muted">{date(r.created)}</td>
              <td>
                <Seal event={r} />
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Read ${r.payload.title}`}
                  onClick={() => onOpen(r)}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="The next chapter starts here"
      description="Medical records added by your care team will appear in this secure history."
    />
  );
}
function TaskRow({ task, person, user, busy, complete }) {
  return (
    <div className={`task-row ${task.done ? "done" : ""}`}>
      <button
        className="task-check"
        aria-label={
          task.done
            ? `${task.payload.title} completed`
            : `Complete ${task.payload.title}`
        }
        disabled={task.done || busy || task.payload.assignee !== user.role}
        onClick={complete}
      >
        {task.done && <Check size={14} />}
      </button>
      <div className="task-copy">
        <strong>{task.payload.title}</strong>
        {task.payload.description && <p>{task.payload.description}</p>}
        <span>
          {person(task.patient)} <span>·</span> {task.payload.assignee}{" "}
          <span>·</span> Due {date(task.payload.due + "T12:00:00")}
        </span>
      </div>
      <Badge
        tone={
          task.done
            ? "green"
            : task.payload.priority === "High"
              ? "amber"
              : "neutral"
        }
      >
        {task.done ? "Complete" : task.payload.priority}
      </Badge>
    </div>
  );
}

function Login({ onLogin, initialError }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const result = await api(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: { email, password, ...(register ? { name: f.get("name") } : {}) },
      });
      onLogin(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <header>
        <Brand />
        <span>
          <ShieldCheck size={16} />
          Secure clinical workspace
        </span>
      </header>
      <div className="login-layout">
        <section className="login-story">
          <div className="login-cross">
            <Activity size={45} />
          </div>
          <h1>
            A healthier way
            <br />
            to stay <em>connected.</em>
          </h1>
          <p>
            One thoughtful workspace for your care.
            <br />
            One verifiable story for every record.
          </p>
          <div className="login-visual">
            <div className="login-record">
              <span className="file-icon">
                <FileText size={22} />
              </span>
              <div>
                <strong>Your care history</strong>
                <span>Private. Connected. Yours.</span>
              </div>
              <ShieldCheck size={21} />
            </div>
            <div className="login-connector" />
            <div className="login-block">
              <Link2 size={18} />
              <span>Encrypted record</span>
              <span className="login-line" />
              <ShieldCheck size={18} />
              <span>Verified commitment</span>
            </div>
          </div>
          <div className="login-proof">
            <span>
              <LockKeyhole size={16} />
              Encrypted medical content
            </span>
            <span>
              <Network size={16} />
              Blockchain audit trail
            </span>
          </div>
        </section>
        <section className="login-form-panel">
          <div className="login-form-intro">
            <span className="portal-mark">
              <Stethoscope size={25} />
            </span>
            <h2>{register ? "Your care starts here." : "Welcome back."}</h2>
            <p>
              {register
                ? "Create a patient account to connect with your care team."
                : "Sign in to your personal care workspace."}
            </p>
          </div>
          <form onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@hospital.org"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                maxLength={128}
                placeholder="At least 12 characters"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button busy={busy} type="submit">
              {register ? "Create patient account" : "Sign in to workspace"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to CareLedger?"}{" "}
            <button
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Sign in" : "Create patient account"}
            </button>
          </p>
          <div className="clinician-note">
            <Info size={16} />
            <p>
              Doctor accounts are verified and provisioned by your clinic
              administrator.
            </p>
          </div>
          {import.meta.env.DEV && (
            <div className="evaluation">
              <strong>Local evaluation · synthetic data</strong>
              <p>
                Run <code>npm run seed</code> first. These accounts are for
                local evaluation only.
              </p>
              <div>
                <button
                  onClick={() => {
                    setRegister(false);
                    setEmail("doctor@careledger.test");
                    setPassword("CareLedger!Demo2026");
                  }}
                >
                  Doctor account <ArrowUpRight size={13} />
                </button>
                <button
                  onClick={() => {
                    setRegister(false);
                    setEmail("patient@careledger.test");
                    setPassword("CareLedger!Demo2026");
                  }}
                >
                  Patient account <ArrowUpRight size={13} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      <footer>
        CareLedger · Connected care. Verified.
        <span>Medical content is never stored on-chain.</span>
      </footer>
    </div>
  );
}

function Drawer({
  drawer,
  onClose,
  data,
  user,
  person,
  mutate,
  busy,
  notify,
  events,
}) {
  const dialog = useRef(null),
    [verification, setVerification] = useState(null),
    [verifying, setVerifying] = useState(false),
    [formError, setFormError] = useState("");
  const doctor = user.role === "doctor";
  const kind = drawer.kind;
  const event = drawer.event;
  const form = ["appointment", "record", "task"].includes(kind);
  const titles = {
    appointment: "Plan your next visit",
    record: "Add a medical record",
    task: "Create a care task",
    "record-detail": "Medical record",
    "appointment-detail": "Appointment details",
    activity: "Workspace activity",
  };
  useEffect(() => {
    const current = dialog.current;
    current.showModal();
    const handler = (e) => {
      e.preventDefault();
      onClose();
    };
    current.addEventListener("cancel", handler);
    return () => current.removeEventListener("cancel", handler);
  }, [onClose]);
  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    f.patient = doctor ? f.patient : user.id;
    try {
      if (kind === "appointment") {
        f.doctor = doctor ? user.id : f.doctor;
        f.at = new Date(f.at).toISOString();
      }
      await mutate(
        `/${kind === "record" ? "records" : kind === "task" ? "tasks" : "appointments"}`,
        f,
      );
    } catch (e) {
      setFormError(e.message);
    }
  }
  async function verify() {
    setVerifying(true);
    try {
      const result = await api(`/records/${event.id}/verify`);
      setVerification(result);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setVerifying(false);
    }
  }
  const noAccess = doctor
    ? !data?.patients.length
    : !data?.doctors.some((d) => d.granted);
  return (
    <dialog
      ref={dialog}
      className="drawer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-content">
        <header>
          <div>
            <span className="drawer-symbol">
              {kind.includes("record") ? (
                <FileText size={22} />
              ) : kind.includes("appointment") ? (
                <CalendarDays size={22} />
              ) : kind === "task" ? (
                <SquareCheckBig size={22} />
              ) : (
                <Activity size={22} />
              )}
            </span>
            <h2>{titles[kind]}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close panel"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        {form ? (
          <>
            <p className="drawer-description">
              {kind === "record"
                ? "Add a permanent entry to the care history. To correct an earlier entry, reference it in a new record."
                : kind === "task"
                  ? "A clear next step, with a due date and an accountable role."
                  : "Choose a time and care team member. The doctor will confirm the visit."}
            </p>
            {noAccess && (kind !== "task" || doctor) ? (
              <div className="form-notice">
                <Info size={19} />
                {doctor
                  ? "No patients have granted access yet. Ask the patient to grant access from My care team."
                  : "Grant a doctor access in My care team before booking an appointment."}
              </div>
            ) : (
              <form onSubmit={submit}>
                {doctor && (
                  <label>
                    Patient
                    <select name="patient" required>
                      <option value="">Select a patient</option>
                      {data.patients.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === "appointment" && !doctor && (
                  <label>
                    Doctor
                    <select name="doctor" required>
                      <option value="">Select your doctor</option>
                      {data.doctors
                        .filter((d) => d.granted)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} · {d.specialty}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label>
                  {kind === "record"
                    ? "Record title"
                    : kind === "task"
                      ? "What needs to happen?"
                      : "Reason for visit"}
                  <input
                    name="title"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder={
                      kind === "record"
                        ? "e.g. Annual wellness consultation"
                        : kind === "task"
                          ? "e.g. Schedule follow-up blood work"
                          : "e.g. Follow-up consultation"
                    }
                  />
                </label>
                {kind === "record" ? (
                  <>
                    <label>
                      Record type
                      <select name="category">
                        <option>Consultation</option>
                        <option>Lab report</option>
                        <option>Prescription</option>
                        <option>Discharge summary</option>
                      </select>
                    </label>
                    <label>
                      Clinical notes
                      <textarea
                        name="content"
                        required
                        minLength={2}
                        maxLength={10000}
                        rows={10}
                        placeholder="Document the findings, assessment, and care plan."
                      />
                    </label>
                    <p className="field-hint">
                      <LockKeyhole size={14} />
                      Clinical content is encrypted. Only a commitment goes
                      on-chain.
                    </p>
                  </>
                ) : kind === "task" ? (
                  <>
                    <label>
                      Details
                      <textarea name="description" maxLength={3000} rows={3} />
                    </label>
                    <div className="form-columns">
                      <label>
                        Due date
                        <input
                          name="due"
                          type="date"
                          defaultValue={today()}
                          required
                        />
                      </label>
                      <label>
                        Priority
                        <select name="priority">
                          <option>Routine</option>
                          <option>High</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Assign to
                      <select name="assignee">
                        <option value="patient">Patient</option>
                        {doctor && <option value="doctor">Doctor</option>}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Visit date and time
                      <input
                        name="at"
                        type="datetime-local"
                        required
                        min={new Date(
                          Date.now() - new Date().getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)}
                      />
                    </label>
                    <label>
                      Visit type
                      <select name="type">
                        <option>In person</option>
                        <option>Video consultation</option>
                      </select>
                    </label>
                    <p className="field-hint">
                      <Clock3 size={14} />
                      Each appointment reserves a 30-minute window. Video is a
                      booking type; meeting links are arranged by your clinic.
                    </p>
                  </>
                )}
                {formError && (
                  <p className="form-error" role="alert">
                    {formError}
                  </p>
                )}
                <div className="drawer-actions">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button busy={busy} type="submit">
                    {kind === "record"
                      ? "Save medical record"
                      : kind === "task"
                        ? "Create task"
                        : "Request appointment"}
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </form>
            )}
          </>
        ) : kind === "record-detail" ? (
          <>
            <div className="record-detail-heading">
              <Badge tone="neutral">{event.payload.category}</Badge>
              <h3>{event.payload.title}</h3>
              <p>
                {person(event.patient)} ·{" "}
                {date(event.created, { year: "numeric" })}
              </p>
              <Seal event={event} />
            </div>
            <div className="clinical-note">
              <h4>Clinical notes</h4>
              <p>{event.payload.content}</p>
              <span>Authored by {event.payload.author}</span>
            </div>
            <section className="verification">
              <h3>
                <ShieldCheck size={20} />
                Verify this record
              </h3>
              <p>
                Compare the authenticated record commitment with its value on
                the connected blockchain.
              </p>
              <Button variant="secondary" busy={verifying} onClick={verify}>
                Verify on-chain <ArrowUpRight size={15} />
              </Button>
              {verification && (
                <div className="verify-result" role="status">
                  <Badge tone={verification.valid ? "green" : "amber"}>
                    {verification.valid
                      ? "Integrity verified"
                      : verification.status === "pending"
                        ? "Awaiting blockchain confirmation"
                        : "Integrity check failed"}
                  </Badge>
                  <dl>
                    <dt>Commitment</dt>
                    <dd>{verification.digest}</dd>
                    <dt>On-chain value</dt>
                    <dd>{verification.onchainDigest}</dd>
                    <dt>Transaction</dt>
                    <dd>{verification.tx || "Pending"}</dd>
                    <dt>Block</dt>
                    <dd>{verification.block ?? "Pending"}</dd>
                  </dl>
                </div>
              )}
            </section>
          </>
        ) : kind === "appointment-detail" ? (
          <>
            <div className="record-detail-heading">
              <Badge tone={event.state === "Confirmed" ? "green" : "neutral"}>
                {event.state}
              </Badge>
              <h3>{event.payload.title}</h3>
              <p>
                {date(event.payload.at, { weekday: "long", year: "numeric" })} ·{" "}
                {time(event.payload.at)}
              </p>
            </div>
            <dl className="appointment-details">
              <dt>Patient</dt>
              <dd>{event.payload.patientName}</dd>
              <dt>Clinician</dt>
              <dd>{event.payload.doctorName}</dd>
              <dt>Visit type</dt>
              <dd>{event.payload.type}</dd>
              <dt>Duration</dt>
              <dd>30 minutes</dd>
              <dt>Audit status</dt>
              <dd>
                <Seal event={event} />
              </dd>
            </dl>
            {event.state !== "Cancelled" && (
              <div className="drawer-actions">
                <Button
                  variant="secondary"
                  busy={busy}
                  onClick={() =>
                    mutate(`/appointments/${event.id}/cancel`, {}).catch(
                      () => {},
                    )
                  }
                >
                  Cancel appointment
                </Button>
                {doctor && event.state !== "Confirmed" && (
                  <Button
                    busy={busy}
                    onClick={() =>
                      mutate(`/appointments/${event.id}/confirm`, {}).catch(
                        () => {},
                      )
                    }
                  >
                    <Check size={16} />
                    Confirm visit
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="activity-list">
            {events.slice(0, 30).map((e) => (
              <div className="activity-item" key={e.id}>
                <span className="activity-icon">
                  <Link2 size={17} />
                </span>
                <div>
                  <strong>
                    {e.payload.title ||
                      (e.kind === "access.changed"
                        ? e.payload.active
                          ? "Doctor access granted"
                          : "Doctor access revoked"
                        : "Care history updated")}
                  </strong>
                  <p>
                    {e.kind.replaceAll(".", " · ")} · {date(e.created)}{" "}
                    {time(e.created)}
                  </p>
                  <Seal event={e} />
                </div>
              </div>
            ))}
            {!events.length && (
              <Empty
                icon={Activity}
                title="Your history starts here"
                description="Care activity and blockchain confirmations will appear here."
              />
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}

function NetworkPage({ network, notify }) {
  const [selected, setSelected] = useState(null),
    [zoom, setZoom] = useState(1),
    [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState(network);
  useEffect(() => {
    if (!paused) setSnapshot(network);
  }, [network, paused]);
  const n = snapshot;
  if (!n) return <div className="loading-panel">Connecting to the chain…</div>;
  const block = n.blocks.find((b) => b.number === selected) || n.blocks[0];
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied to clipboard.");
    } catch {
      notify("Clipboard is unavailable in this browser.", "error");
    }
  }
  return (
    <>
      <div className="network-stats">
        <div>
          <span>Current block</span>
          <strong>#{n.height.toLocaleString()}</strong>
        </div>
        <div>
          <span>Anchored events</span>
          <strong>{n.total.toLocaleString()}</strong>
        </div>
        <div>
          <span>Pending commitments</span>
          <strong>{n.pending}</strong>
        </div>
        <div>
          <span>Chain ID</span>
          <strong>{n.chainId}</strong>
        </div>
        <div>
          <span>Observed peers</span>
          <strong>{n.peerCount === null ? "Unavailable" : n.peerCount}</strong>
        </div>
      </div>
      <section className={`panel network-panel ${paused ? "paused" : ""}`}>
        <div className="panel-header">
          <div>
            <h2>Every block tells a care story.</h2>
            <p>{n.name} · only cryptographic commitments are shown</p>
          </div>
          <button
            className={`live-button ${paused ? "is-paused" : ""}`}
            onClick={() => setPaused(!paused)}
          >
            <i />
            {paused ? "Resume live view" : "Live · pause view"}
          </button>
        </div>
        <div className="network-canvas">
          <div className="network-controls">
            <button
              aria-label="Zoom in"
              onClick={() => setZoom((v) => Math.min(1.7, v + 0.15))}
            >
              <ZoomIn size={18} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => setZoom((v) => Math.max(0.6, v - 0.15))}
            >
              <ZoomOut size={18} />
            </button>
            <button aria-label="Reset zoom" onClick={() => setZoom(1)}>
              <RotateCcw size={17} />
            </button>
          </div>
          <div className="diagram-scroll">
            <svg
              viewBox="0 0 1000 430"
              className="network-diagram"
              role="img"
              aria-label={`Live blockchain diagram with operator, smart contract, RPC node, and latest blocks. Block height ${n.height}.`}
              style={{ width: `${100 * zoom}%` }}
            >
              <defs>
                <marker
                  id="arrow"
                  markerWidth="7"
                  markerHeight="7"
                  refX="5"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0 0 L7 3.5 L0 7" fill="#a8c4ba" />
                </marker>
              </defs>
              <path
                className="network-wire"
                d="M180 210 C240 210 240 130 340 130 M180 210 C240 210 240 310 340 310 M475 130 C570 130 550 210 620 210 M475 310 C570 310 550 210 620 210 M755 210 L845 210"
              />
              <path
                className="flow-path"
                d="M180 210 C240 210 240 130 340 130 M475 130 C570 130 550 210 620 210 M755 210 L845 210"
              />
              {[
                [105, 170, "Application", "Encrypted care data", "app"],
                [340, 90, "Operator", "Authorized signer", "operator"],
                [340, 270, "RPC connection", `Chain ${n.chainId}`, "rpc"],
                [620, 170, "CareLedger", "Append-only contract", "contract"],
              ].map(([x, y, title, sub, id]) => (
                <g key={id} transform={`translate(${x},${y})`}>
                  <rect
                    width="135"
                    height="80"
                    rx="12"
                    className={
                      id === "contract" ? "diagram-contract" : "diagram-node"
                    }
                  />
                  <circle
                    cx="20"
                    cy="23"
                    r="5"
                    fill={id === "contract" ? "#d4edb9" : "#178260"}
                  />
                  <text x="16" y="47" className="diagram-title">
                    {title}
                  </text>
                  <text x="16" y="64" className="diagram-sub">
                    {sub}
                  </text>
                </g>
              ))}
              <g transform="translate(845,174)">
                <rect
                  width="95"
                  height="72"
                  rx="12"
                  fill="#f0f6f2"
                  stroke="#b3cfc0"
                />
                <text x="14" y="30" className="diagram-title">
                  #{n.height}
                </text>
                <text x="14" y="51" className="diagram-sub">
                  Latest block
                </text>
              </g>
              <text x="250" y="195" className="diagram-annotation">
                commitment
              </text>
              <text x="535" y="280" className="diagram-annotation">
                transaction
              </text>
              <text x="775" y="193" className="diagram-annotation">
                mined
              </text>
            </svg>
          </div>
          <div className="block-rail">
            {n.blocks
              .slice(0, 5)
              .reverse()
              .map((b) => (
                <button
                  key={b.hash}
                  className={`rail-block ${block?.number === b.number ? "selected" : ""}`}
                  onClick={() => setSelected(b.number)}
                >
                  <strong>Block #{b.number}</strong>
                  <code>{short(b.hash)}</code>
                  <span>{b.transactions.length} transactions</span>
                </button>
              ))}
          </div>
          <p className="flow-caption">
            Connection animation illustrates the commitment route. Observed
            blocks refresh every 10 seconds.
          </p>
          <div className="diagram-legend">
            <span>
              <i />
              Observed chain connection
            </span>
            <span>
              <i />
              Authorized commitment flow
            </span>
          </div>
        </div>
        <div className="network-bottom">
          <span>
            <ShieldCheck size={16} />
            No clinical data travels on-chain.
          </span>
          <span>
            {n.mode === "local"
              ? "Single-node development chain · no distributed consensus"
              : `Confirmation policy: ${n.confirmations} blocks · peer telemetry depends on RPC support`}
          </span>
        </div>
      </section>
      <div className="chain-grid">
        <section className="panel">
          <PanelHeader
            title="Latest blocks"
            subtitle="Select a block to inspect its real chain data"
            action={<Badge tone="neutral">{n.blocks.length} latest</Badge>}
          />
          <div className="block-list">
            {n.blocks.map((b) => (
              <button
                className={`block-row ${block?.number === b.number ? "selected" : ""}`}
                key={b.hash}
                onClick={() => setSelected(b.number)}
              >
                <span className="block-icon">
                  <Network size={19} />
                </span>
                <strong>#{b.number}</strong>
                <code>{short(b.hash)}</code>
                <span>{b.transactions.length} transactions</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            title={block ? `Block #${block.number}` : "Block details"}
            subtitle="Directly from the connected EVM"
          />
          {block && (
            <div className="block-details">
              <dl>
                <dt>Block hash</dt>
                <dd>
                  <code>{block.hash}</code>
                  <button
                    className="icon-button"
                    aria-label="Copy block hash"
                    onClick={() => copy(block.hash)}
                  >
                    <Copy size={14} />
                  </button>
                </dd>
                <dt>Parent hash</dt>
                <dd>
                  <code>{block.parentHash}</code>
                </dd>
                <dt>Timestamp</dt>
                <dd>
                  {date(block.timestamp * 1000, { year: "numeric" })} ·{" "}
                  {time(block.timestamp * 1000)}
                </dd>
                <dt>Gas used</dt>
                <dd>{Number(block.gasUsed).toLocaleString()}</dd>
                <dt>Transactions</dt>
                <dd>
                  {block.transactions.length
                    ? block.transactions.map((t) => <code key={t}>{t}</code>)
                    : "No transactions in this block"}
                </dd>
                <dt>Contract</dt>
                <dd>
                  <code>{n.contract}</code>
                </dd>
              </dl>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
