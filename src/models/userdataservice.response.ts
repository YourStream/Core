import { BaseResponse } from "./response";

export type UserDataType = {
    _id: string,
    nickname: string,
    email: string,
    bio: string,
    dayOfBirthday: Date,
    emailConfirmed: boolean,
    blocked: boolean,
    createdAt: Date,
    updatedAt: Date
};

export type UserPublicDataType = {
    _id: string,
    nickname: string,
    bio: string,
    blocked: boolean,
    createdAt: Date,
    updatedAt: Date
};

export class UserResponse extends BaseResponse<UserDataType>{
    constructor(data: UserDataType) {
        super(true, null, data);
    }
}

export class UserPublicResponse extends BaseResponse<UserPublicDataType>{
    constructor(data: UserPublicDataType) {
        super(true, null, data);
    }
}