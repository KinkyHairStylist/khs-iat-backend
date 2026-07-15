import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as ejs from 'ejs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templatesDir = path.join(__dirname, 'templates');
  private cache = new Map<string, ejs.TemplateFunction>();

  onModuleInit() {
    this.logger.log(`Template directory: ${this.templatesDir}`);
  }

  render(templateName: string, data: Record<string, any>): string {
    const compiled = this.getCompiled(templateName);
    const html = compiled(data);
    return html;
  }

  private getCompiled(templateName: string): ejs.TemplateFunction {
    let compiled = this.cache.get(templateName);
    if (!compiled) {
      const ext = templateName.endsWith('.ejs') ? '' : '.ejs';
      const filePath = path.join(this.templatesDir, templateName + ext);
      const content = fs.readFileSync(filePath, 'utf8');
      compiled = ejs.compile(content, {
        filename: filePath,
        rmWhitespace: true,
      });
      this.cache.set(templateName, compiled);
      this.logger.log(`Compiled template: ${templateName}`);
    }
    return compiled;
  }
}
