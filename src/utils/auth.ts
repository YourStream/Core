import { Response, NextFunction } from 'express';
import { verify } from './jwt.js';
import { YourStreamRequest } from '../models/request.js';

function guard(req: YourStreamRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).send('Unauthorized');
        return;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        res.status(401).send('Unauthorized');
        return;
    }
    try {
        const payload = verify(token);
        req.user = payload;
        next();
    } catch (error) {
        res.status(401).send('Unauthorized');
    }
}

export default guard;