import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AccountType, JwtPayload } from "@fairwaylog/shared";
import { ACCESS_TOKEN_TTL_SECONDS } from "@fairwaylog/shared";
import { config } from "../config.js";
import type { User } from "@prisma/client";

export type AuthedRequest = Request & { user?: JwtPayload };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

export function toUserDto(user: User) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    accountType: user.accountType,
    createdAt: user.createdAt.toISOString(),
  };
}

export function signAccessToken(user: User): string {
  const payload: JwtPayload = {
    sub: user.id,
    accountType: user.accountType,
    email: user.email,
  };
  return jwt.sign(payload, config.jwtAccessSecret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    sendError(res, 401, "UNAUTHORIZED", "Missing bearer token");
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), config.jwtAccessSecret) as JwtPayload;
    next();
  } catch {
    sendError(res, 401, "UNAUTHORIZED", "Invalid or expired token");
  }
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), config.jwtAccessSecret) as JwtPayload;
    } catch {
      /* ignore */
    }
  }
  next();
}

export function requireAccountType(...types: AccountType[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !types.includes(req.user.accountType)) {
      sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
      return;
    }
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  sendError(res, 500, "INTERNAL", message);
}
