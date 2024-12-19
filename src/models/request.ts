import { Request } from 'express';
import { AuthUser } from './auth-user';

export interface YourStreamRequest extends Request{
    user?: AuthUser;
    requsetId?: string;
}