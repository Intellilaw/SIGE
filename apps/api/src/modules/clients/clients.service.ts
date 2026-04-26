import type { ClientsRepository } from "../../repositories/types";

export class ClientsService {
  public constructor(private readonly repository: ClientsRepository) {}

  public list() {
    return this.repository.list();
  }

  public create(name: string) {
    return this.repository.create(name);
  }

  public update(clientId: string, name: string) {
    return this.repository.update(clientId, name);
  }

  public delete(clientId: string) {
    return this.repository.delete(clientId);
  }
}
