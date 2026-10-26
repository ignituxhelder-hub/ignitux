import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ChatService } from './chat.service.js';
import { SendChatMessageDto } from './dto/send-chat-message.dto.js';

@ApiTags('igini-chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // Chaque message déclenche un appel IA : assez pour une conversation, pas pour une boucle.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  send(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendChatMessageDto) {
    return this.chatService.sendMessage(user.id, dto.content, dto.confirmation ?? null);
  }

  @Get('messages')
  history(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    const valide = parsed !== undefined && Number.isInteger(parsed) && parsed > 0;
    return this.chatService.history(user.id, valide ? parsed : undefined);
  }
}
