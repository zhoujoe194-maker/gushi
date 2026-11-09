"use client";
import { useEffect, useState } from "react";
import { type Member, DESK_IDS, roleInfo, isScopedManager } from "./team";
import { hasDesk } from "./access";
import {
  type Meeting,
  type MeetingInput,
  meetingSchema,
} from "./meeting-model";
import { type DeskTask } from "./task-model";
import { today } from "./model";
import { FinanceModal } from "./role-panels";
import { useUnsavedChanges } from "../hooks/use-unsaved-changes";
import { UnsavedNotice } from "./sales/unsaved-notice";
export default function MeetingCenter({
  member,
  members,
  demo,
  active,
  demoTasks,
  request,
  onTasksChanged,
  onTaskCenter,
  onDemoDispatch,
}: {
  member: Member;
  members: Member[];
  demo: boolean;
  active: boolean;
  demoTasks: DeskTask[];
  request: (url: string, init?: RequestInit) => Promise<Response>;
  onTasksChanged: () => void;
  onTaskCenter: () => void;
  onDemoDispatch: (data: Record<string, unknown>) => Promise<DeskTask>;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]),
    [tasks, setTasks] = useState<DeskTask[]>([]),
    [editing, setEditing] = useState<Meeting | null | undefined>(undefined),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!demo);
  async function load() {
    if (demo) return;
    try {
      const r = await request("/api/meetings", { cache: "no-store" }),
        data = (await r.json()) as {
          error?: string;
          meetings: Meeting[];
          tasks: DeskTask[];
        };
      if (!r.ok) throw Error(data.error);
      setMeetings(data.meetings);
      setTasks(data.tasks);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (demo || !active) return;
    let current = true;
    request("/api/meetings", { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json()) as {
          error?: string;
          meetings: Meeting[];
          tasks: DeskTask[];
        };
        if (!r.ok) throw Error(data.error);
        if (current) {
          setMeetings(data.meetings);
          setTasks(data.tasks);
          setError("");
        }
      })
      .catch((e) => {
        if (current) setError(e instanceof Error ? e.message : "读取失败");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [demo, active, request]);
  async function save(data: MeetingInput) {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const m: Meeting = {
          ...data,
          id: editing?.id || crypto.randomUUID(),
          version: (editing?.version || 0) + 1,
          updatedAt: new Date().toISOString(),
          createdBy: member.name,
          history: editing?.history || [],
        };
        setMeetings((ms) => [m, ...ms.filter((v) => v.id !== m.id)]);
      } else {
        const r = await request("/api/meetings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save",
              id: editing?.id,
              version: editing?.version,
              data,
            }),
          }),
          body = (await r.json()) as { error?: string };
        if (!r.ok) throw Error(body.error);
        await load();
      }
      setEditing(undefined);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function dispatch(m: Meeting, a: Meeting["actions"][number]) {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const task = await onDemoDispatch({
          title: a.title,
          request: `会议：${m.title}（${m.date}）\n${a.request}`,
          desk: a.desk,
          region: m.region,
          assigneeId: a.assigneeId,
          projectId: "",
          dueDate: a.dueDate,
        });
        setMeetings((ms) =>
          ms.map((v) =>
            v.id === m.id
              ? {
                  ...v,
                  version: v.version + 1,
                  actions: v.actions.map((x) =>
                    x.id === a.id ? { ...x, taskId: task.id } : x,
                  ),
                }
              : v,
          ),
        );
        setTasks((ts) => [...ts, task]);
      } else {
        const r = await request("/api/meetings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "dispatch",
              id: m.id,
              version: m.version,
              actionId: a.id,
            }),
          }),
          body = (await r.json()) as { error?: string };
        if (!r.ok) throw Error(body.error);
        await load();
      }
      onTasksChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "派发失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>周会纪要与任务安排</h2>
            <p>
              记录每周一会议、周总要求和行动项；保存后按项派发，承办人到本台任务反馈，管理验收。
            </p>
          </div>
          <button className="button primary" onClick={() => setEditing(null)}>
            新增会议纪要
          </button>
        </div>
        {error && (
          <div role="alert" className="error-box">
            {error}
            <button className="text-button" onClick={() => load()}>
              重新加载
            </button>
          </div>
        )}
        {loading ? (
          <p role="status">正在读取会议…</p>
        ) : (
          !meetings.length && (
            <p className="small-empty">
              暂无会议纪要。可先记录本周会议，再明确负责人和完成期限。
            </p>
          )
        )}
        {meetings.map((m) => (
          <article className="business-card" key={m.id}>
            <div className="section-heading">
              <div>
                <h3>{m.title}</h3>
                <p>
                  {m.date} · {m.region} · 记录人 {m.createdBy}
                </p>
              </div>
              <button className="button" onClick={() => setEditing(m)}>
                编辑纪要
              </button>
            </div>
            <p>参会人员：{m.attendees || "待补充"}</p>
            <h4>会议纪要与决议</h4>
            <p className="business-prewrap">{m.minutes || "待补充"}</p>
            <h4>周总任务与本周重点</h4>
            <p className="business-prewrap">{m.presidentTasks || "暂无补充"}</p>
            <h4>行动项与落实进展</h4>
            {m.actions.map((a) => {
              const task = (demo ? demoTasks : tasks).find(
                (t) => t.id === a.taskId,
              );
              return (
                <div className="payment-plan-row" key={a.id}>
                  <div>
                    <strong>{a.title}</strong>
                    <p>
                      {members.find((v) => v.id === a.assigneeId)?.name ||
                        "原负责人"}{" "}
                      · {a.dueDate} ·{" "}
                      {task?.status || (a.taskId ? "已派发" : "待派发")}
                    </p>
                    <p className="business-prewrap">{a.request}</p>
                    {task?.result && (
                      <p className="business-prewrap">
                        处理结果：{task.result}
                      </p>
                    )}
                  </div>
                  {a.taskId ? (
                    <button className="button" onClick={onTaskCenter}>
                      去任务中心
                    </button>
                  ) : (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => dispatch(m, a)}
                    >
                      派发任务
                    </button>
                  )}
                </div>
              );
            })}
            <details>
              <summary>修改与派发记录</summary>
              {m.history.map((h, i) => (
                <p key={i}>
                  {h.at.slice(0, 16)} · {h.actor} · {h.note}
                </p>
              ))}
            </details>
          </article>
        ))}
      </section>
      {editing !== undefined && (
        <MeetingEditor
          key={editing?.id || "new"}
          value={editing}
          member={member}
          members={members}
          busy={busy}
          error={error}
          close={() => setEditing(undefined)}
          save={save}
        />
      )}
    </>
  );
}
function MeetingEditor({
  value,
  member,
  members,
  busy,
  error,
  close,
  save,
}: {
  value: Meeting | null;
  member: Member;
  members: Member[];
  busy: boolean;
  error: string;
  close: () => void;
  save: (data: MeetingInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<MeetingInput>(
      value || {
        title: "周一经营例会",
        date: today(),
        region: isScopedManager(member)
          ? (member.region as "湖南分部")
          : "全部分部",
        attendees: "",
        minutes: "",
        presidentTasks: "",
        actions: [],
      },
    ),
    [localError, setLocalError] = useState("");
  const guard = useUnsavedChanges(JSON.stringify(draft), close, busy);
  return (
    <FinanceModal
      title={value ? "编辑会议纪要" : "新增会议纪要"}
      wide
      close={guard.requestClose}
    >
      <form
        className="project-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const parsed = meetingSchema.safeParse(draft);
          if (!parsed.success) {
            setLocalError(parsed.error.issues[0].message);
            return;
          }
          setLocalError("");
          await save(parsed.data);
        }}
      >
        <div className="business-grid">
          <label className="field">
            会议名称
            <input
              required
              maxLength={150}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="field">
            会议日期
            <input
              required
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </label>
          <label className="field">
            所属分部
            <select
              disabled={
                isScopedManager(member) || draft.actions.some((a) => a.taskId)
              }
              value={draft.region}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  region: e.target.value as MeetingInput["region"],
                })
              }
            >
              {["全部分部", "广州总部", "湖南分部"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            参会人员
            <input
              maxLength={2000}
              value={draft.attendees}
              onChange={(e) =>
                setDraft({ ...draft, attendees: e.target.value })
              }
            />
          </label>
        </div>
        {[
          ["会议纪要与决议", "minutes"],
          ["周总任务与本周重点", "presidentTasks"],
        ].map(([label, key]) => (
          <label className="field" key={key}>
            {label}
            <textarea
              rows={5}
              maxLength={10000}
              value={draft[key as "minutes"]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        <div className="section-heading">
          <h4>会议行动项</h4>
          <button
            className="button"
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                actions: [
                  ...draft.actions,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    request: "",
                    desk: "sales",
                    assigneeId: "",
                    dueDate: today(),
                  },
                ],
              })
            }
          >
            增加行动项
          </button>
        </div>
        {draft.actions.map((a, i) => {
          const change = (key: string, v: string) =>
            setDraft({
              ...draft,
              actions: draft.actions.map((a, j) =>
                i === j ? { ...a, [key]: v } : a,
              ),
            });
          return (
            <fieldset
              className="business-card"
              key={a.id}
              disabled={!!a.taskId}
            >
              <legend>
                行动项 {i + 1}
                {a.taskId ? " · 已派发，请在任务中心调整" : ""}
              </legend>
              <div className="business-grid">
                <label className="field">
                  任务标题
                  <input
                    required
                    maxLength={150}
                    value={a.title}
                    onChange={(e) => change("title", e.target.value)}
                  />
                </label>
                <label className="field">
                  承办台
                  <select
                    value={a.desk}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        actions: draft.actions.map((v, j) =>
                          i === j
                            ? {
                                ...v,
                                desk: e.target.value as typeof a.desk,
                                assigneeId: "",
                              }
                            : v,
                        ),
                      })
                    }
                  >
                    {DESK_IDS.map((d) => (
                      <option value={d} key={d}>
                        {roleInfo(d).name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  负责人
                  <select
                    required
                    value={a.assigneeId}
                    onChange={(e) => change("assigneeId", e.target.value)}
                  >
                    <option value="">请选择负责人</option>
                    {members
                      .filter(
                        (m) =>
                          (m.status === "active" &&
                            hasDesk(m, a.desk) &&
                            (draft.region === "全部分部" ||
                              m.region === "全部分部" ||
                              m.region === draft.region)) ||
                          (m.id === a.assigneeId && !!a.taskId),
                      )
                      .map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  完成期限
                  <input
                    required
                    type="date"
                    value={a.dueDate}
                    onChange={(e) => change("dueDate", e.target.value)}
                  />
                </label>
              </div>
              <label className="field">
                任务要求与验收标准
                <textarea
                  required
                  maxLength={4000}
                  value={a.request}
                  onChange={(e) => change("request", e.target.value)}
                />
              </label>
              {!a.taskId && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      actions: draft.actions.filter((_, j) => i !== j),
                    })
                  }
                >
                  移除行动项
                </button>
              )}
            </fieldset>
          );
        })}
        <p className="helper-text">
          保存纪要后再点击“派发任务”，避免尚未确认的会议内容提前下达。
        </p>
        <UnsavedNotice guard={guard} />
        {(error || localError) && (
          <p className="error-box" role="alert">
            {localError || error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={guard.requestClose}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "保存中…" : "保存会议纪要"}
          </button>
        </div>
      </form>
    </FinanceModal>
  );
}
