import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { TemplateService } from './template.service';

@Module({
  providers: [EmailService, TemplateService],
  exports: [EmailService, TemplateService],
})
export class EmailModule {}