import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreerPublicationDto {
  @IsIn(['instagram', 'tiktok'])
  platform!: 'instagram' | 'tiktok';

  @IsString()
  @MinLength(1)
  @MaxLength(2200)
  caption!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  mediaUrl!: string;

  @IsIn(['image', 'video'])
  mediaType!: 'image' | 'video';

  @IsOptional()
  @IsIn(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'])
  privacyLevel?: string;

  @IsOptional() @IsBoolean()
  allowComments?: boolean;

  @IsOptional() @IsBoolean()
  allowDuet?: boolean;

  @IsOptional() @IsBoolean()
  allowStitch?: boolean;

  @IsOptional() @IsBoolean()
  brandOrganic?: boolean;

  @IsOptional() @IsBoolean()
  brandContent?: boolean;

  @IsOptional() @IsBoolean()
  musicConsent?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(3600)
  mediaDurationSeconds?: number;
}

export class ConfirmerPublicationDto {
  @IsOptional()
  @IsBoolean()
  musicConsent?: boolean;
}

export class SuggestionPublicationDto {
  @IsIn(['instagram', 'tiktok'])
  platform!: 'instagram' | 'tiktok';

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  brief!: string;
}
