import { connect, Connection } from 'amqplib';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { serviceManager } from '.';
import { SystemService } from './SystemService';

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
        if(controllerFiles.length == 0) {
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
                channel.consume(channelName, (msg) => {
                    if (!msg) {
                        return;
                    }
                    const content = msg.content.length == 0 ? "" : JSON.parse(msg.content.toString());
                    logger.info(`Received message: ${content}`);
                    controller[func](content).then((response: any) => {
                        response = response ?? {};
                        channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
                            correlationId: msg.properties.correlationId
                        });
                        channel.ack(msg);
                    });
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