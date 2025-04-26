import { BaseResponse } from "./response.js";

export class CreateConfirmResponse extends BaseResponse {
    constructor(token: string) {
        super(true, 'Success', { token: token });
    }
}