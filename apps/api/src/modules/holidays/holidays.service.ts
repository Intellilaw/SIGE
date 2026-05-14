import type { HolidayAuthorityShortName } from "@sige/contracts";

import type { HolidayWriteRecord, HolidaysRepository } from "../../repositories/types";

export class HolidaysService {
  public constructor(private readonly repository: HolidaysRepository) {}

  public list(year: number, month: number, authorityShortName?: HolidayAuthorityShortName) {
    return this.repository.list(year, month, authorityShortName);
  }

  public create(payload: HolidayWriteRecord) {
    return this.repository.create(payload);
  }

  public update(holidayId: string, payload: HolidayWriteRecord) {
    return this.repository.update(holidayId, payload);
  }

  public delete(holidayId: string) {
    return this.repository.delete(holidayId);
  }
}
