import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('get-started')
  getStarted(): { message: string } {
    return { message: 'Welcome to the Kinky Hair Stylist API! Get started here.' };
  }
}
