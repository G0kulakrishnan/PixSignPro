import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

export function err(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}
