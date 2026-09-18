import { IsIn } from 'class-validator';
import { TASK_STATUSES, type TaskStatus } from '../task-status.js';

export class UpdateTaskStatusDto {
  @IsIn(TASK_STATUSES, { message: `status doit être l'un de : ${TASK_STATUSES.join(', ')}.` })
  status: TaskStatus;
}
