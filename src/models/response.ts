export class BaseResponse<T = any> {
    public status: boolean;
    public message: string;
    public data: T;

    constructor(status: boolean, message: string, data: T) {
        this.status = status;
        this.message = message;
        this.data = data;
    }

    static success<T = any>(data: T, message: string = 'Success') {
        return new BaseResponse<T>(true, message, data);
    }

    static error<T = any>(message: string = 'Error', data: T = null) {
        return new BaseResponse<T>(false, message, data);
    }
}