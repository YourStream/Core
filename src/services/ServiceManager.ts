type Options<T> = {
    initEvent?: (instance: T) => void,
    constructorArgs?: Array<any>
}

enum ServiceType {
    singleton = 0x1,
    factory = 0x2,
    scoped = 0x3
}
export type ServiceRecord = {
    iface: any;
    implementation: any;
    instance: any;
    type: ServiceType;
}

class ServiceManager {
    private static _instance: ServiceManager;
    private services: Array<ServiceRecord> = [];

    private constructor() {}

    public static get instance(): ServiceManager {
        if (!ServiceManager._instance) {
            ServiceManager._instance = new ServiceManager();
        }

        return ServiceManager._instance;
    }

    public singleton<I, T extends I>(iface: new () => I, type: new () => T, options: Options<T> | undefined = undefined): void {
        this.validateService(iface);

        let instance = new type();
        if (options && options.initEvent) {
            options.initEvent(instance);
        }

        this.services.push({
            instance: instance,
            implementation: type,
            iface: iface,
            type: ServiceType.singleton
        });
    }

    public factory<I, T extends I>(iface: new () => I, type: new (...args: any) => T): void {
        this.validateService(iface);
        this.services.push({
            instance: null,
            implementation: type,
            iface: iface,
            type: ServiceType.factory
        });
    }

    public scoped<I, T extends I>(iface: new () => I, type: new (...args: any) => T, options: Options<T> | undefined = undefined): void {
        this.validateService(iface);
        this.services.push({
            instance: null,
            implementation: type,
            iface: iface,
            type: ServiceType.scoped
        });
    }

    public get<I>(iface: new () => I, ...args: any): I {
        let service = this.services.find((s) => s.iface === iface);
        if (service) {
            switch (service.type) {
                case ServiceType.singleton:
                    return service.instance;
                case ServiceType.factory:
                    return new service.implementation(args);
            }
        }
        throw new Error(`Service not found for interface ${iface.name}`);
    }

    public getScopedServices(): any{
        let scopedServices: any[] = [];
        this.services.forEach((service) => {
            if(service.type === ServiceType.scoped){
                scopedServices.push(new service.implementation());
            }
        });
        return scopedServices;
    }

    public hasService<I>(iface: new () => I): boolean {
        return this.services.find((s) => s.iface === iface) !== undefined;
    }

    private validateService<I>(iface: new () => I): void {
        if (this.hasService(iface)) {
            throw new Error(`Service already registered for interface ${iface.name}`);
        }
    }
}

export default ServiceManager.instance;