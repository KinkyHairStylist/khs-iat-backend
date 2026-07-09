import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import formidable, { Files } from 'formidable';

@Injectable()
export class FormidableMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const form = formidable({
      multiples: true,
    });

    form.parse(req, (err, fields, files: Files) => {
      if (err) {
        return next(err);
      }

      // flatten array fields
      const flatFields = {};

      for (const key in fields) {
        const value = fields[key];

        // If value is array from Formidable and contains strings -> keep as array
        if (Array.isArray(value)) {
          flatFields[key] = value.length > 1 ? value : value[0];
        } else if (typeof value === 'string' && value.includes(',')) {
          // if comma-separated, convert to array
          flatFields[key] = value.split(',').map((v) => v.trim());
        } else {
          flatFields[key] = value;
        }
      }

      // attach fields
      req.body = flatFields;

      // normalize files just like your Node.js code
      req.files = req.files || {};

      for (const key in files) {
        const f = files[key];

        if (!f) continue;

        if (Array.isArray(f) && f.length > 1) {
          req.files[key] = f; // multiple files
        } else {
          req.files[key] = Array.isArray(f) ? f[0] : f; // single file
        }
      }

      next();
    });
  }
}
