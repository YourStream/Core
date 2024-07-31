import { BaseResponse } from "./response";

export class CreateConfirmResponse extends BaseResponse {
    constructor(token: string) {
        super(true, 'Success', { token: token });
    }
}