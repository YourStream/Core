import jwt, { JwtPayload } from "jsonwebtoken";
import { logger } from "./utils";
import { NextFunction, Request, Response } from "express";

class ServiceAuthVerifier {
    private name: string;
    private secret: string;
    private authServiceAddress: string;
    private _connected: boolean = false;
    private _token: string | null = null;
    private _refreshKey: string | null = null;
    private _publicKey: string | null = null;
    private _refreshInterval: NodeJS.Timeout | null = null;

    public get connected(): boolean {
        return this._connected;
    }

    public get token(): string | null {
        return this._token;
    }

    public get publicKey(): string | null {
        return this._publicKey;
    }

    public async connect(name: string, secret: string, authServiceAddress: string): Promise<boolean> {
        this.name = name;
        this.secret = secret;
        this.authServiceAddress = authServiceAddress;

        try {
            if (!name || !secret || !authServiceAddress) {
                logger.error("[ServiceAuthVerifier] Missing required parameters for connection");
                return false;
            }

            const loginSuccess = await this.login();
            if (!loginSuccess) {
                logger.error("[ServiceAuthVerifier] Login failed during connection");
                return false;
            }

            const publicKeyLoaded = await this.loadPublicKey();
            if (!publicKeyLoaded) {
                logger.error("[ServiceAuthVerifier] Failed to load public key during connection");
                return false;
            }

            this._connected = true;
            logger.info("[ServiceAuthVerifier] Successfully connected to auth service");
            this.runRefreshInterval();
            return true;
        } catch (error) {
            logger.error("[ServiceAuthVerifier] Error during connection:", error);
            return false;
        }
    }

    public async validateToken(token: string): Promise<boolean> {
        if (!this._publicKey) {
            logger.error("[ServiceAuthVerifier] Public key not loaded");
            return false;
        }
        try {
            const decoded = jwt.verify(token, this._publicKey, {
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

    private async login(): Promise<boolean> {
        const response = await fetch(`${this.authServiceAddress}/api/internal/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: this.name,
                secret: this.secret,
            }),
        });
        if (response.status !== 200) {
            logger.error("[ServiceAuthVerifier] Login failed");
            logger.debug(`[ServiceAuthVerifier] Response: ${response.status} ${response.statusText}`);
            logger.debug(`[ServiceAuthVerifier] Body: ${await response.text()}`);
            return false;
        }
        const data = await response.json();
        this._token = data.token;
        this._refreshKey = data.refreshKey;

        if (!this._token || !this._refreshKey) {
            logger.error("[ServiceAuthVerifier] Invalid token or refreshKey");
            logger.debug(`[ServiceAuthVerifier] Body: ${await response.text()}`);
            return false;
        }
    }

    private runRefreshInterval() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
        }
        // parse the token to get the expiration time
        const decoded = jwt.decode(this._token) as JwtPayload;
        if (!decoded || !decoded.exp) {
            logger.error("[ServiceAuthVerifier] Invalid token");
            return;
        }
        const exp = decoded.exp * 1000; // convert to milliseconds
        const now = Date.now();
        const refreshTime = exp - now - 2 * 60 * 1000;
        if (refreshTime <= 0) {
            logger.error("[ServiceAuthVerifier] Token already expired");
            return;
        }
        this._refreshInterval = setTimeout(async () => {
            const success = await this.refresh();
            if (!success) {
                logger.error("[ServiceAuthVerifier] Refresh failed");
                return;
            }
            this.runRefreshInterval();
        }, refreshTime);
    }

    private async refresh(): Promise<boolean> {
        try {
            const response = await fetch(`${this.authServiceAddress}/api/internal/auth/refresh-token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    refreshKey: this._refreshKey,
                }),
            });

            if (response.status !== 200) {
                logger.error("[ServiceAuthVerifier] Refresh failed");
                logger.debug(`[ServiceAuthVerifier] Response: ${response.status} ${response.statusText}`);
                return false;
            }

            const data = await response.json();
            this._token = data.token;
            this._refreshKey = data.refreshKey;

            if (!this._token || !this._refreshKey) {
                logger.error("[ServiceAuthVerifier] Invalid token or refreshKey during refresh");
                return false;
            }

            logger.info("[ServiceAuthVerifier] Token successfully refreshed");
            return true;
        } catch (error) {
            logger.error("[ServiceAuthVerifier] Error during token refresh:", error);
            return false;
        }
    }

    private async loadPublicKey(): Promise<boolean> {
        const response = await fetch(`${this.authServiceAddress}/api/internal/key`, {
            method: "GET",
        });
        if (response.status !== 200) {
            logger.error("[ServiceAuthVerifier] Get public key failed");
            logger.debug(`[ServiceAuthVerifier] Response: ${response.status} ${response.statusText}`);
            logger.debug(`[ServiceAuthVerifier] Body: ${await response.text()}`);
            return false;
        }
        const data = await response.text();
        if (!data) {
            logger.error("[ServiceAuthVerifier] Invalid public key");
            logger.debug(`[ServiceAuthVerifier] Body: ${await response.text()}`);
            return false;
        }
        this._publicKey = data;
        return true;
    }
}

const serviceAuthVerifier = new ServiceAuthVerifier();

function serviceAuthGuard(req: Request, res: Response, next: NextFunction) {
    let token = req.headers["authorization"];

    if (typeof token === "string") {
        const parts = token.split(" ");
        if (parts.length === 2) {
            token = parts[1];
        } else {
            logger.debug("[ServiceAuthVerifier] Invalid token format");
            res.status(401).send("Invalid token format");
            return;
        }
    } else {
        logger.debug("[ServiceAuthVerifier] Invalid token format");
        res.status(401).send("Invalid token format");
        return;
    }
    if (!token) {
        logger.debug("[ServiceAuthVerifier] No token provided");
        res.status(401).send("No token provided");
        return;
    }
    if (!serviceAuthVerifier.connected) {
        logger.error("[ServiceAuthVerifier] Not connected to auth service");
        res.status(500).send("Not connected to auth service");
        return;
    }
    serviceAuthVerifier.validateToken(token)
        .then((valid) => {
            if (!valid) {
                logger.debug("[ServiceAuthVerifier] Invalid token");
                res.status(401).send("Invalid token");
            } else {
                logger.debug("[ServiceAuthVerifier] Valid token");
                next();
            }
        })
        .catch((err) => {
            logger.error("[ServiceAuthVerifier] Error validating token");
            logger.debug(`[ServiceAuthVerifier] Error: ${err}`);
            res.status(500).send("Error validating token");
        });
}

async function buildServiceRequest(
    serviceHost: string,
    path: string,
    options: {
        method: "GET" | "POST" | "PUT" | "DELETE",
        headers?: Record<string, string>
        body?: object
    } = { method: "GET" },
): Promise<globalThis.Response> {
    const url = `${serviceHost}${path}`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceAuthVerifier.token}`,
        ...options.headers,
    };

    const requestOptions: RequestInit = {
        method: options.method,
        headers,
    };

    if (options.body) {
        requestOptions.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, requestOptions);
        return response;
    } catch (error) {
        logger.error(`[buildServiceRequest] Error while making request to ${url}:`, error);
        throw new Error("Failed to make service request");
    }
}

export { serviceAuthVerifier, serviceAuthGuard, buildServiceRequest };