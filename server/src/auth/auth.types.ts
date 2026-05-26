import { Request } from 'express';

export type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  sid: string;
};

export type AuthContext = {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
};

export type RequestWithAuthContext = Request & {
  authContext?: AuthContext;
};
