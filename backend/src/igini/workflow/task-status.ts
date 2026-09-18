export const TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_ASSIGNEES = ['human', 'igini'] as const;
export type TaskAssignee = (typeof TASK_ASSIGNEES)[number];
