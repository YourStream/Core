import jwt from 'jsonwebtoken';
import { AuthUser } from '../models';

export const generate = (payload: any) => {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

export const verify = (token: string): AuthUser => {
    return jwt.verify(token, process.env.JWT_SECRET) as AuthUser;
}

export const decode = (token: string) => {
    return jwt.decode(token);
}