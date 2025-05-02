import jwt, { SignOptions } from 'jsonwebtoken';
import { AuthUser } from '../models/index.js';

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
}

export const generate = (payload: any) => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN as SignOptions['expiresIn'] ?? '1d' });
}

export const verify = (token: string): AuthUser => {
    return jwt.verify(token, process.env.JWT_SECRET) as AuthUser;
}

export const decode = (token: string) => {
    return jwt.decode(token);
}