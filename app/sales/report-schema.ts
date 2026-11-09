import { z } from 'zod';
import { REPORT_SECTIONS, reportErrors, type ReportData } from './report-model';
const values = Object.fromEntries(
  REPORT_SECTIONS.flatMap((s) =>
    s.fields.map((f) => [
      f[0],
      z.number().int().min(0).max(100000).nullable().default(null),
    ]),
  ),
);
const notes = Object.fromEntries(
  REPORT_SECTIONS.map((s) => [s.id, z.string().trim().max(2000).default('')]),
);
export const reportSchema = z
  .object({
    values: z.object(values).strict(),
    notes: z.object(notes).strict().default({}),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const message of reportErrors(value as ReportData))
      ctx.addIssue({ code: 'custom', message });
  });
