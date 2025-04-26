import serviceManager from "./ServiceManager.js";

export class Scope{
    id: string;
    request: Express.Request | undefined;
    response: Express.Response | undefined;
    private services: any[];
    constructor(id: string){
        this.id = id;
        this.services = serviceManager.getScopedServices();
    }

    getService<T>(serviceType: { new(...args: any[]): T }): T{
        let service = this.services.find(s => s instanceof serviceType);
        if(service){
            return service;
        }
        return serviceManager.get(serviceType);
    }
}

class ScopeManager{
    private static _instance: ScopeManager;
    private scopes: Map<string, Scope> = new Map();

    private constructor() {}

    public static get instance(): ScopeManager {
        if (!ScopeManager._instance) {
            ScopeManager._instance = new ScopeManager();
        }

        return ScopeManager._instance;
    }

    create(){
        let id = Math.random().toString(36).substring(7);
        let scope = new Scope(id);
        this.scopes.set(id, scope);
        return scope;
    }

    get (id: string){
        return this.scopes.get(id);
    }

    destroy(id: string){
        this.scopes.delete(id);
    }
}

export default ScopeManager.instance;