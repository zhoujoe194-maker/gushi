"use client";
import { useState } from "react";
import { type Project } from "./model";
import { type Member, canViewFact, canCheckDepartment, deskOf } from "./team";
import { type Workflow, type Guide, workflowOf } from "./workflow";
export function StageEvidence({
  project,
  member,
  check,
  stage,
  onSave,
  busy,
}: {
  project: Project;
  member: Member;
  check?: Guide["checks"][number];
  stage: string;
  onSave: (w: Workflow, note: string, version?: number) => Promise<boolean>;
  busy: boolean;
}) {
  const w = workflowOf(project),
    key = check
      ? "check:" + check.id
      : "stage:" + stage + ":" + deskOf(member.role),
    allowed = check ? canCheckDepartment(member, check.department) : true;
  const [editing, setEditing] = useState(false),
    [note, setNote] = useState(""),
    [done, setDone] = useState(false),
    [version, setVersion] = useState(project.version),
    [error, setError] = useState("");
  if (!canViewFact(member, key))
    return (
      <div className="evidence-row">
        <strong>{check?.label}</strong>
        <p>
          核对状态：{check && w.checklist[check.id] ? "已核对" : "待核对"}
          ；具体依据由财务维护。
        </p>
      </div>
    );
  const begin = () => {
    setNote(w.facts[key] || "");
    setDone(!!(check && w.checklist[check.id]));
    setVersion(project.version);
    setEditing(true);
    setError("");
  };
  return (
    <section className="evidence-row">
      <div className="section-heading">
        <div>
          <h4>{check ? check.label : "本阶段详细补充"}</h4>
          <p>
            {check
              ? w.checklist[check.id]
                ? "已核对"
                : "待核对"
              : "按岗位记录过程、结论、待解决问题与下一步安排"}
          </p>
        </div>
        {allowed && !editing && (
          <button type="button" className="button small-button" onClick={begin}>
            填写{check ? "依据" : "补充"}
          </button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (check && done && !note.trim()) {
              setError("请先填写具体依据，再标记已核对");
              return;
            }
            try {
              if (
                await onSave(
                  {
                    ...w,
                    facts: { ...w.facts, [key]: note },
                    checklist: check
                      ? { ...w.checklist, [check.id]: done }
                      : w.checklist,
                  },
                  "更新阶段检查依据 / 补充说明",
                  version,
                )
              )
                setEditing(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "保存失败");
            }
          }}
        >
          <label className="field">
            {check ? "检查依据与详细说明" : "阶段补充说明"}
            <textarea
              rows={4}
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="记录已确认的条款、参数、沟通结果、资料来源和待解决事项"
            />
          </label>
          {check && (
            <label className="evidence-check">
              <input
                type="checkbox"
                checked={done}
                onChange={(e) => setDone(e.target.checked)}
              />
              已有依据，标记为已核对
            </label>
          )}
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "保存中…" : "保存说明"}
            </button>
          </div>
        </form>
      ) : (
        <p className="business-prewrap">{w.facts[key] || "尚未填写具体说明"}</p>
      )}
      {!check &&
        ["management", "sales", "finance", "operations", "aftersales"]
          .filter(
            (d) =>
              d !== deskOf(member.role) &&
              canViewFact(member, "stage:" + stage + ":" + d),
          )
          .map(
            (d) =>
              w.facts["stage:" + stage + ":" + d] && (
                <p key={d} className="business-prewrap">
                  {
                    {
                      management: "管理",
                      sales: "销售",
                      finance: "财务",
                      operations: "运营",
                      aftersales: "售后",
                    }[d]
                  }
                  ：{w.facts["stage:" + stage + ":" + d]}
                </p>
              ),
          )}
    </section>
  );
}
