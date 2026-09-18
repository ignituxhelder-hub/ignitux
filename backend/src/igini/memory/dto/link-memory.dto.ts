import { IsUUID } from 'class-validator';

export class LinkMemoryDto {
  @IsUUID()
  projectId: string;
}
