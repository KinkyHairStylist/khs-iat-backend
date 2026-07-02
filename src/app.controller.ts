import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from 'src/business/middlewares/public.decorator';

@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('get-started')
  getStarted(): { message: string } {
    return { message: 'Welcome to the Kinky Hair Stylist API! Get started here.' };
  }
}
