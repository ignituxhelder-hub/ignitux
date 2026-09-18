import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TASK_ASSIGNEES, type TaskAssignee } from '../task-status.js';

export class CreateTaskDto {
  @IsString()
  @MinLength(1, { message: 'title ne peut pas être vide.' })
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(TASK_ASSIGNEES, { message: `assignee doit être l'un de : ${TASK_ASSIGNEES.join(', ')}.` })
  assignee?: TaskAssignee;
}
