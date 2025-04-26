import { Channel } from "amqplib";
import { serviceManager, RabbitMQService } from "./index.js";
import logger from "../utils/logger.js";
import { IBaseService } from "./IBaseService.js";

export class SystemStatistic implements IBaseService {
    get name(): string {
        return 'SystemStatistic';
    }
    private timer: NodeJS.Timeout | undefined = undefined;
    private channel: Channel | undefined = undefined;
    public async start() {
        this.timer = setInterval(this.worker.bind(this), 1000);
        this.channel = await serviceManager.get(RabbitMQService).createChannel();
        this.channel?.assertQueue('life-cycle', { maxLength: 1000, autoDelete: true });
    }

    public async stop() {
        if (this.timer) {
            clearInterval(this.timer);
        }
        if (this.channel) {
            this.channel.close();
        }
    }

    private worker() {
        let memoryUsage = process.memoryUsage();
        let cpuUsage = process.cpuUsage();
        let stat = {
            service: process.env.SERVICE_NAME,
            memory: memoryUsage,
            cpu: cpuUsage
        };
        const published = this.channel?.publish('life-cycle', 'system-statistic', Buffer.from(JSON.stringify(stat)), { persistent: true });
        if (!published) {
            logger.error('Failed to publish system statistic');
        }
    }
}