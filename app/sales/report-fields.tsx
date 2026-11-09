'use client';
import { REPORT_SECTIONS, reportErrors, type ReportData } from './report-model';

export function ReportFields({
  value,
  change,
  disabled,
}: {
  value: ReportData;
  change: (value: ReportData) => void;
  disabled: boolean;
}) {
  const errors = reportErrors(value);
  return (
    <div className="sales-report-fields">
      <p className="info-note">
        按实际业务填报。没有发生填
        0，尚未核实可留空；空白会显示为“未填”。月报按自然月去重统计，不直接相加每周客户数量。
      </p>
      {REPORT_SECTIONS.map((section) => (
        <details className="sales-report-section" key={section.id} open>
          <summary>
            <span>{section.group}</span>
            {section.title}
          </summary>
          <fieldset disabled={disabled}>
            <legend className="sr-only">{section.title}</legend>
            <p className="helper-text" id={'report-hint-' + section.id}>
              {section.hint}
            </p>
            <div className="sales-report-inputs">
              {section.fields.map(([key, label, unit]) => (
                <label className="field" key={key}>
                  {label}（{unit}）
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    inputMode="numeric"
                    aria-describedby={'report-hint-' + section.id}
                    value={value.values[key] ?? ''}
                    placeholder="未填"
                    onChange={(e) =>
                      change({
                        ...value,
                        values: {
                          ...value.values,
                          [key]:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="field">
              {section.note}
              <textarea
                rows={2}
                maxLength={2000}
                value={value.notes[section.id] || ''}
                onChange={(e) =>
                  change({
                    ...value,
                    notes: { ...value.notes, [section.id]: e.target.value },
                  })
                }
              />
            </label>
          </fieldset>
        </details>
      ))}
      {errors.length > 0 && (
        <div className="error-box" role="status">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportReadOnly({ report }: { report?: ReportData }) {
  if (!report)
    return (
      <p className="helper-text">
        历史文字周报未填结构化数量，原总结和审核记录已保留。
      </p>
    );
  return (
    <div className="sales-report-readonly">
      <p className="helper-text">
        以下为本期填报数量，管理结合清单核实；不直接替代绩效评分。电联为客户总数的其中项。
      </p>
      {REPORT_SECTIONS.map((section) => (
        <section key={section.id} className="sales-report-section">
          <h4>
            <span>{section.group}</span>
            {section.title}
          </h4>
          <dl className="sales-report-values">
            {section.fields.map(([key, label, unit]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {report.values[key] === null ||
                  report.values[key] === undefined
                    ? '未填'
                    : report.values[key] + ' ' + unit}
                </dd>
              </div>
            ))}
          </dl>
          {report.notes[section.id] && (
            <p className="sales-text">{report.notes[section.id]}</p>
          )}
        </section>
      ))}
    </div>
  );
}
