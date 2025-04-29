import jwt, { JwtPayload } from "jsonwebtoken";
import { logger } from "./utils";

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
        this._connected = await this.login() && await this.loadPublicKey();
        if (!this._connected) {
            logger.error("[ServiceAuthVerifier] Failed to connect to auth service");
            return false;
        }
        logger.info("[ServiceAuthVerifier] Connected to auth service");
        this.runRefreshInterval();
        return true;
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
export { serviceAuthVerifier };