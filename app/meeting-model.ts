import { z } from "zod";
import { DESK_IDS } from "./team";
const short = z.string().trim().min(1).max(150),
  text = z.string().trim().max(10000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "日期无效");
export const meetingSchema = z
  .object({
    title: short,
    date,
    region: z.enum(["全部分部", "广州总部", "湖南分部"]),
    attendees: z.string().max(2000),
    minutes: text,
    presidentTasks: text,
    actions: z
      .array(
        z.object({
          id: short,
          title: short,
          request: z.string().trim().min(1).max(4000),
          desk: z.enum(DESK_IDS),
          assigneeId: short,
          dueDate: date,
          taskId: z.string().max(100).optional(),
        }),
      )
      .max(50),
  })
  .refine(
    (m) => new Set(m.actions.map((a) => a.id)).size === m.actions.length,
    "行动项编号重复",
  );
export type MeetingInput = z.infer<typeof meetingSchema>;
export type Meeting = MeetingInput & {
  id: string;
  version: number;
  updatedAt: string;
  createdBy: string;
  history: { at: string; actor: string; note: string }[];
};
