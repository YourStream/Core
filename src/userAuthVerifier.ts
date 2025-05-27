import { NextFunction, Response } from "express";
import { YourStreamRequest } from "./models/request";
import { logger } from "./utils";
import jwt, { JwtPayload } from "jsonwebtoken";
import { AuthUser } from "./models";

class UserAuthVerifier {
    private static instance: UserAuthVerifier;
    private publicKey: string | null = null;
    private refreshInterval: NodeJS.Timeout | null = null;
    private isRefreshing: boolean = false;
    private refreshIntervalTime: number = 60 * 60 * 1000; // 1 hour
    private authServiceAddress: string | null = null;

    private constructor() { }

    public static getInstance(): UserAuthVerifier {
        if (!UserAuthVerifier.instance) {
            UserAuthVerifier.instance = new UserAuthVerifier();
        }
        return UserAuthVerifier.instance;
    }

    public async connect(authServiceAddress: string): Promise<boolean> {
        this.authServiceAddress = authServiceAddress;
        try {
            this.publicKey = await this.fetchPublicKey();
            if (!this.publicKey) {
                logger.error("Failed to fetch public key from auth service");
                return false;
            }
            this.startRefreshInterval();
            return true;
        } catch (error) {
            logger.error("Error connecting to auth service:", error);
            return false;
        }
    }

    public async auth(req: YourStreamRequest, res: Response, next: NextFunction) {
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

        if (!this.publicKey) {
            logger.error("Public key is not available for verification");
            res.status(500).send('Internal Server Error');
            return;
        }

        try {
            const isValid = await this.validateToken(token);
            if (!isValid) {
                res.status(401).send('Unauthorized');
                return;
            }
            req.user = jwt.decode(token) as AuthUser;
            next();
        } catch (error) {
            logger.error("Error validating token:", error);
            res.status(401).send('Unauthorized');
        }
    }

    private async startRefreshInterval() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        this.refreshInterval = setInterval(async () => {
            if (this.isRefreshing) return;
            this.isRefreshing = true;
            try {
                const publicKey = await this.fetchPublicKey();
                if (publicKey) {
                    this.publicKey = publicKey;
                } else {
                    logger.error("Failed to refresh public key");
                }
            } catch (error) {
                logger.error("Error during public key refresh:", error);
            } finally {
                this.isRefreshing = false;
            }
        }, this.refreshIntervalTime);
    }

    private async fetchPublicKey(): Promise<string | null> {
        if (!this.authServiceAddress) {
            throw new Error("Auth service address is not set");
        }
        try {
            const response = await fetch(`${this.authServiceAddress}/api/key`);
            if (!response.ok) {
                throw new Error(`Failed to fetch public key: ${response.statusText}`);
            }
            const data = await response.text();
            return data;
        } catch (error) {
            logger.error("Error fetching public key:", error);
            return null;
        }
    }

    private async validateToken(token: string): Promise<boolean> {
        if (!this.publicKey) {
            logger.error("[ServiceAuthVerifier] Public key not loaded");
            return false;
        }
        try {
            const decoded = jwt.verify(token, this.publicKey, {
                algorithms: ["RS256"],
            }) as JwtPayload;
            if (!decoded) {
                logger.error("[ServiceAuthVerifier] Invalid token");
                return false;
            }
            if (decoded.exp && decoded.exp * 1000 < Date.now()) {
                logger.error("[ServiceAuthVerifier] Token expired");
                return false;
            }
            if (decoded.iat && decoded.iat * 1000 > Date.now()) {
                logger.error("[ServiceAuthVerifier] Token not yet valid");
                return false;
            }
        } catch (err) {
            logger.error("[ServiceAuthVerifier] Invalid token");
            logger.debug(`[ServiceAuthVerifier] Error: ${err}`);
            return false;
        }
        return true;
    }
}

export const userAuthVerifier = UserAuthVerifier.getInstance();
const auth = userAuthVerifier.auth.bind(userAuthVerifier);
export {
    auth,
    UserAuthVerifier
}