import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCallback);

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT";

export interface DnsRecord {
  name: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
}

export class DnsAutomation {
  constructor(private readonly command?: string) {}

  get enabled(): boolean {
    return Boolean(this.command);
  }

  async upsertRecord(record: DnsRecord): Promise<void> {
    await this.run("UPSERT", record);
  }

  async deleteRecord(record: DnsRecord): Promise<void> {
    await this.run("DELETE", record);
  }

  private async run(action: "UPSERT" | "DELETE", record: DnsRecord): Promise<void> {
    if (!this.command) {
      throw new Error("DNS automation is not configured");
    }

    await exec(this.command, {
      windowsHide: true,
      env: {
        ...process.env,
        BORE_DNS_ACTION: action,
        BORE_DNS_NAME: record.name,
        BORE_DNS_TYPE: record.type,
        BORE_DNS_VALUE: record.value,
        BORE_DNS_TTL: String(record.ttl),
      },
    });
  }
}
