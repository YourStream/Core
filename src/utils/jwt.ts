import jwt from 'jsonwebtoken';
import { AuthUser } from '../models';

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
}

export const generate = (payload: any) => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN ?? '1d' });
}

export const verify = (token: string): AuthUser => {
    return jwt.verify(token, process.env.JWT_SECRET) as AuthUser;
}

export const decode = (token: string) => {
    return jwt.decode(token);
}