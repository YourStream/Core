export class BaseResponse {
    public status: boolean;
    public message: string;
    public data: any;

    constructor(status: boolean, message: string, data: any) {
        this.status = status;
        this.message = message;
        this.data = data;
    }

    static success(data: any, message: string = 'Success') {
        return new BaseResponse(true, message, data);
    }

    static error(message: string = 'Error', data: any = null) {
        return new BaseResponse(false, message, data);
    }
}