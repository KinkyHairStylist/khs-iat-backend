/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as xss from 'xss';

@Injectable()
export class InputSanitizationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Sanitize request body
    if (req.body) {
      req.body = this.sanitize(req.body);
    }

    // Sanitize request query
    if (req.query) {
      const sanitizedQuery = this.sanitize(req.query);
      for (const key of Object.keys(sanitizedQuery)) {
        req.query[key] = sanitizedQuery[key];
      }
    }

    // Sanitize request params
    if (req.params) {
      const sanitizedParams = this.sanitize(req.params);
      for (const key of Object.keys(sanitizedParams)) {
        req.params[key] = sanitizedParams[key];
      }
    }

    next();
  }

  private sanitize(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item: any) => this.sanitize(item));
    }

    if (typeof data === 'object') {
      const sanitizedObject: { [key: string]: any } = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          sanitizedObject[key] = this.sanitize(data[key]);
        }
      }
      return sanitizedObject;
    }

    if (typeof data === 'string') {
      // Base64 data URIs are binary-encoded — XSS filtering them is both pointless
      // and catastrophically slow (~128k chars through the HTML state machine).
      if (data.startsWith('data:') && data.includes(';base64,')) {
        return data;
      }
      return xss.filterXSS(data);
    }

    return data;
  }
}