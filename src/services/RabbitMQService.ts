import { connect, Connection } from 'amqplib';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { serviceManager } from '.';
import { SystemService } from './SystemService';
import { BaseResponse } from '../models';

const SERVICE_NAME = process.env.SERVICE_NAME;

export class RabbitMQService {
    private _connection: Connection | undefined = undefined;
    private _reconnectTimeout: NodeJS.Timeout | undefined = undefined;

    constructor() {
        if (!process.env.RABBITMQ_HOST || !process.env.RABBITMQ_PORT || !process.env.RABBITMQ_USER || !process.env.RABBITMQ_PASSWORD) {
            throw new Error('RabbitMQ connection parameters are missing');
        }
        this.connectToRabbitMQ(process.env.RABBITMQ_HOST, process.env.RABBITMQ_PORT, process.env.RABBITMQ_USER, process.env.RABBITMQ_PASSWORD);
    }

    public async connectToRabbitMQ(host: string, port: string, username: string, password: string) {
        if (!host || !port || !username || !password) {
            throw new Error('RabbitMQ connection parameters are missing');
        }

        if (this._reconnectTimeout === undefined) {
            logger.info('Setting up RabbitMQ reconnect interval');
            this._reconnectTimeout = setInterval(() => {
                if (this._connection == undefined || !this._connection?.connection) {
                    logger.info('Reconnecting to RabbitMQ');
                    this.connectToRabbitMQ(host, port, username, password);
                }
            }, 5000);
        }

        if (this._connection != undefined) {
            logger.debug('RabbitMQ connection already established');
            return;
        }
        try {
            this._connection = await connect({
                hostname: host,
                port: parseInt(port),
                username: username,
                password: password
            });
            logger.info('Connected to RabbitMQ');
        } catch (error) {
            logger.error(`Failed to connect to RabbitMQ: ${error}`);
        }
    }

    public async createChannel() {
        try {
            await this.waitForConnection();
            return await this._connection.createChannel();
        } catch (error) {
            logger.error(`Failed to create channel: ${error}`);
        }
    }

    public startListening() {
        logger.info('Starting to listen for messages from RabbitMQ');
        if (!SERVICE_NAME) {
            throw new Error('SERVICE_NAME is missing from environment variables');
        }

        const controllerFiles = fs.readdirSync(path.join(path.dirname(require.main.filename), 'controllers'));
        if (controllerFiles.length == 0) {
            logger.error('No controllers found!\n Make sure you have at least one controller in the controllers folder.');
            serviceManager.get(SystemService).shutdown();
            return;
        }

        controllerFiles.forEach((controllerFile) => {
            const controller = require(path.join(path.dirname(require.main.filename), 'controllers', controllerFile));
            const functions = Object.keys(controller);
            logger.info(`Loaded controller: ${controllerFile}`);
            functions.forEach(async (func) => {
                const channelName = `${SERVICE_NAME}.${func}`;
                const channel = await this.createChannel();

                if (!channel) {
                    logger.error('Failed to create response exchange');
                    return;
                }
                channel.assertQueue(channelName, { durable: false });
                channel.prefetch(1);
                channel.consume(channelName, async (msg) => {
                    if (!msg) {
                        return;
                    }
                    const content = msg.content.length == 0 ? "" : JSON.parse(msg.content.toString());
                    let response: BaseResponse = null;
                    channel.ack(msg);
                    try{
                        response = await controller[func](content);
                    } catch (error) {
                        logger.error(`Error while processing message (${channelName}): ${error}`);
                        response = BaseResponse.error('Error while processing message');
                    } finally{
                        channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
                            correlationId: msg.properties.correlationId
                        });
                    }
                });
                logger.info(`Listening on channel: ${channelName}`);
            });
        });
        logger.info('RabbitMQ listening started');
    }

    private async waitForConnection() {
        while (this._connection == undefined) {
            logger.info('Waiting for RabbitMQ connection to be established');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

abstract class BaseRabbitMQCommunicator {
    public abstract get name(): string;
    private _connection?: Connection;
    protected get connection(): Connection {
        return this._connection;
    }

    constructor() {
        connect({
            hostname: process.env.RABBITMQ_HOST,
            port: parseInt(process.env.RABBITMQ_PORT),
            username: process.env.RABBITMQ_USER,
            password: process.env.RABBITMQ_PASSWORD
        }).then((connection) => {
            this._connection = connection;
            logger.debug(`Connected to RabbitMQ for ${this.name}`);
        });
    }

    public async send<T>(queueName: string, message: Object): Promise<T> {
        const responsePromise = new Promise<T>(async (resolve, reject) => {
            try {
                const correlationId = generateUuid();
                const channel = await this.connection.createChannel();
                const queue = await channel.assertQueue(``, { exclusive: true });

                channel.consume(queue.queue, (msg) => {
                    if (msg.properties.correlationId === correlationId) {
                        setTimeout(async () => {
                            channel.ack(msg);
                            await channel.close();
                            resolve(JSON.parse(msg.content.toString()));
                        }, 10);
                    }
                }, {
                    noAck: false
                });
                channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
                    correlationId: correlationId,
                    replyTo: queue.queue
                });
            } catch (error) {
                reject(error);
            }
        });
        return responsePromise;
    }


}

export class RabbitMQConfirmationService extends BaseRabbitMQCommunicator {
    public get name(): string {
        return 'ConfirmationService';
    }

    public async create(req: { userId: string, type: 'email-code' | 'password' | '2fa', metadata: any }) {
        return await this.send(`${this.name}.create`, req);
    }

    public async resolve(req: { token: string }) {
        return await this.send(`${this.name}.resolve`, req);
    }

    public async deleteOld() {
        return await this.send(`${this.name}.deleteOld`, {});
    }
}

export class RabbitMQUserDataService extends BaseRabbitMQCommunicator {
    public get name(): string {
        return 'UserDataService';
    }

    public async createUserAccount(req: { nickname: string, email: string, bio?: string, dayOfBirthday: Date }) {
        return await this.send(`${this.name}.createUserAccount`, req);
    }

    public async getUserAccountById(req: { id: string }) {
        return await this.send(`${this.name}.getUserAccountById`, req);
    }

    public async getUserAccountByNickname(req: { nickname: string }) {
        return await this.send(`${this.name}.getUserAccountByNickname`, req);
    }

    public async getUserStreamTokenById(req: { id: string }) {
        return await this.send(`${this.name}.getUserStreamTokenById`, req);
    }

    public async updateNickname(req: { id: string, nickname: string }) {
        return await this.send(`${this.name}.updateNickname`, req);
    }

    public async updateEmail(req: { id: string, email: string }) {
        return await this.send(`${this.name}.updateEmail`, req);
    }

    public async updateBaseInfo(req: { id: string, bio: string, dayOfBirthday: Date }) {
        return await this.send(`${this.name}.updateBaseInfo`, req);
    }

    public async recreateStreamToken(req: { id: string }) {
        return await this.send(`${this.name}.recreateStreamToken`, req);
    }

    public async deleteUserAccount(req: { id: string }) {
        return await this.send(`${this.name}.deleteUserAccount`, req);
    }
}

function generateUuid() {
    return Math.random().toString() +
        Math.random().toString() +
        Math.random().toString() + Math.floor(Date.now() / 1000).toString();
}