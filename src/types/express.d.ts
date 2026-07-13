import 'express-session';
import { User } from '../all_user_entities/user.entity';

declare module 'express-session' {
  interface Session {
    userId: string;
    isAuthenticated: boolean;
    user: Partial<User>;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: any;
      session: import('express-session').Session;
    }
  }
}
